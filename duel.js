/* Penalty duels: the rules. Plain script, no imports, so the page loads it
   before the walk, and the relay and the tests import it; all three read the
   same answer. Hangs off globalThis.
   See docs/superpowers/specs/2026-11-05-penalty-duel-design.md.

   A duel is one row in /duels: `a` posts it with a stake, `b` joins, and once
   `a` shows up (`go`) they take turns, kick by kick, `a` shooting the even
   kicks. In each kick both sides pick at once, sealed: first a seal,
   SHA-256 of "L:<salt>", then, once both seals are in, the pick itself. Every
   write carries the server's clock, and a side that hasn't sealed or opened in
   time has missed: a missed shot is saved, a missed dive is a goal. Nobody has
   to write a miss down; anyone reading the row works it out the same way. */
(() => {
  const KICKS = 5, MAX = 10, MOVE_MS = 1e4, GRACE_MS = 15e3, SHOW_MS = 18e4, DAILY = 5, BETS = [2, 5, 10, 20, 50], BET_MAX = 50, OUT = 3;
  /* Duels started from NEW on end once the trailing side can't catch up, and
     sudden death has no cap, so there's no draw. Older ones keep the old
     rules (all ten kicks, a draw after ten rounds), since coins replay them. */
  const NEW = 1794201420000, LAST = 999;

  /* SHA-256, synchronous, for short strings: crypto.subtle is async and the
     walk isn't. ASCII only, which is all a pick is. */
  const K = [], hex8 = n => (n >>> 0).toString(16).padStart(8, '0');
  for (let n = 2, c = 0; c < 64; n++) {
    if ([...Array(n).keys()].slice(2).some(p => n % p === 0)) continue;
    K[c++] = (Math.cbrt(n) % 1) * 2 ** 32 | 0;
  }
  function sha256(s) {
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const b = [...s].map(c => c.charCodeAt(0) & 255), len = b.length * 8;
    b.push(128); while (b.length % 64 !== 56) b.push(0);
    for (let i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (len >>> (i * 8)) & 255);
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < b.length; o += 64) {
      const w = [];
      for (let i = 0; i < 64; i++) {
        w[i] = i < 16 ? (b[o + i * 4] << 24 | b[o + i * 4 + 1] << 16 | b[o + i * 4 + 2] << 8 | b[o + i * 4 + 3])
          : (w[i - 16] + (r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 7] + (r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10))) | 0;
      }
      let [a, bb, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      [a, bb, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
    }
    return H.map(hex8).join('');
  }

  const num = v => +v || 0;
  const t = x => x && num(x.t);
  const shooter = n => n % 2 ? 'b' : 'a';

  /* One kick, opened at `o`. Each side ends with a pick, or a miss, at a time;
     null while it's still waiting on somebody and their time isn't up. */
  function kick(k, o, now) {
    k = k || {};
    const sealBy = o + GRACE_MS, out = {};
    const sealed = x => k[x + 's'] && typeof k[x + 's'].v === 'string' && t(k[x + 's']) <= sealBy;
    if (!sealed('a') || !sealed('b')) {
      // somebody didn't seal: the other side's pick never needs opening
      if (now <= sealBy) return null;
      for (const x of 'ab') out[x] = sealed(x) ? { at: sealBy } : { miss: true, at: sealBy };
      return out;
    }
    const openBy = Math.max(t(k.as), t(k.bs)) + GRACE_MS;
    for (const x of 'ab') {
      const p = k[x + 'p'], v = p && typeof p.v === 'string' ? p.v : '';
      if (p && t(p) <= openBy) out[x] = /^[LMR]:/.test(v) && sha256(v) === k[x + 's'].v ? { pick: v[0], at: t(p) } : { miss: true, at: t(p) };
      else if (now > openBy) out[x] = { miss: true, at: openBy };
      else return null;
    }
    return out;
  }

  /* The duel as it stands at `now` (the server's clock, as near as the reader
     has it).
       phase    'open' (nobody in), 'joined' (waiting on a to show), 'live', 'done'
       kicks    every kick settled: { n, by, goal, a, b, at }
       cur      the kick being taken: { n, by, o }
       winner   'a', 'b' or null; `out` names a side that left (missed OUT in
                a row); `gone` is both sides leaving, which hands the stakes back
       early    kicks left untaken when it ended because nobody could catch up
       endAt    when it finished, by the server's clock */
  function state(d, now = Date.now()) {
    d = d || {};
    const res = { phase: 'open', kicks: [], ga: 0, gb: 0, cur: null, done: false, winner: null, out: null, gone: false, endAt: null, rounds: 0, sudden: false, early: 0 };
    const bAt = num(d.bAt), go = num(d.go);
    if (d.b && bAt && !go) {
      res.phase = now <= bAt + SHOW_MS ? 'joined' : 'open';
      res.showBy = bAt + SHOW_MS;
      return res;
    }
    if (!d.b || !go) return res;
    res.phase = 'live';
    const fresh = go >= NEW;
    const run = { a: 0, b: 0 };
    let o = go;
    // ponytail: LAST (the rules' kick limit) caps sudden death; level that long is ~1e-150
    for (let n = 0; n < (fresh ? LAST : MAX * 2); n++) {
      const by = shooter(n), keep = by === 'a' ? 'b' : 'a';
      const k = kick(d.k && d.k[n], o, now);
      if (!k) { res.cur = { n, by, o }; break; }
      const goal = !k[by].miss && (!!k[keep].miss || k[by].pick !== k[keep].pick);
      const at = Math.max(k.a.at, k.b.at);
      res.kicks.push({ n, by, goal, a: k.a, b: k.b, at });
      if (goal) res['g' + by]++;
      for (const x of 'ab') run[x] = k[x].miss ? run[x] + 1 : 0;
      o = at;
      // three missed in a row is leaving; both at once, nobody wins
      if (run.a >= OUT || run.b >= OUT) {
        res.done = true; res.endAt = at;
        if (run.a >= OUT && run.b >= OUT) res.gone = true;
        else { res.out = run.a >= OUT ? 'a' : 'b'; res.winner = res.out === 'a' ? 'b' : 'a'; }
        break;
      }
      // in the first five, it's over once the side behind can't draw level
      if (fresh && n < KICKS * 2 - 1) {
        const left = x => KICKS - Math.floor((n + (x === 'a' ? 2 : 1)) / 2);
        if (res.ga + left('a') < res.gb || res.gb + left('b') < res.ga) {
          res.done = true; res.endAt = at; res.early = KICKS * 2 - 1 - n;
          res.winner = res.ga > res.gb ? 'a' : 'b';
          break;
        }
      }
      // rounds are scored whole: after five, the first one with the score apart
      if (n % 2) {
        const r = (n + 1) / 2;
        res.rounds = r;
        if (r >= KICKS && (res.ga !== res.gb || (!fresh && r === MAX))) {
          res.done = true; res.endAt = at;
          res.winner = res.ga > res.gb ? 'a' : res.gb > res.ga ? 'b' : null;
          break;
        }
      }
    }
    if (res.done) res.phase = 'done';
    res.sudden = res.kicks.length >= KICKS * 2;
    return res;
  }

  // which letter you are in a duel, or null
  const side = (d, email) => d && d.a === email ? 'a' : d && d.b && d.b === email ? 'b' : null;
  const stakeOf = d => { const n = Math.round(num(d && d.stake)); return n >= 1 && n <= BET_MAX ? n : 0; };

  globalThis.DUEL = { KICKS, MAX, NEW, MOVE_MS, GRACE_MS, SHOW_MS, DAILY, BETS, BET_MAX, OUT, state, side, stakeOf, sha256, shooter };
})();
