/* The village's rules: what each building costs, does and takes up, how the
   Gold mine fills the Bank, and where things go on the 20 × 20 plot. Plain
   script, no imports, so the page loads it before the walk, the relay and the
   tests import it, and all three read the same numbers. Hangs off globalThis.
   See docs/superpowers/specs/2026-11-04-village-design.md. */
(() => {
  const H = 36e5;
  /* When the village opens on the live site, and the oak starts paying into the
     Bank. Far in the future until piece 1 ships: set it to that moment then.
     The page opens it early on localhost with ?village or ?play. */
  const FROM = 8.64e15;
  const GRID = 20;
  /* lvl[i] is level i + 1: what it costs to reach and what it gives.
     club and bank are there from the start, at level 1, for nothing. */
  const B = {
    club: { name: 'Clubhouse', w: 4, d: 4, buy: false, lvl: [{ cost: 0 }, { cost: 40 }, { cost: 100 }, { cost: 200 }, { cost: 400 }],
      job: l => `Home base. Nothing else can be above level ${l}` },
    mine: { name: 'Gold mine', w: 3, d: 3, buy: true, lvl: [{ cost: 15, day: 3 }, { cost: 40, day: 5 }, { cost: 90, day: 8 }],
      job: l => `${B.mine.lvl[l - 1].day} coins a workday into your Bank` },
    bank: { name: 'Bank', w: 3, d: 3, buy: false, lvl: [{ cost: 0, cap: 10 }, { cost: 30, cap: 20 }, { cost: 70, cap: 35 }, { cost: 150, cap: 55 }, { cost: 300, cap: 80 }],
      job: l => `Holds ${B.bank.lvl[l - 1].cap} coins until you collect` },
    wall: { name: 'Wall', w: 1, d: 1, buy: false, lvl: [{ cost: 0 }, { cost: 30 }, { cost: 80 }],
      job: l => `Level ${l} stone. It defends once raids arrive` },
    stadium: { name: 'Stadium', w: 5, d: 4, buy: true, lvl: [{ cost: 60, games: 1 }, { cost: 150, games: 2 }],
      job: l => `+${B.stadium.lvl[l - 1].games} free game${l > 1 ? 's' : ''} a day` },
    /* Raids (docs/superpowers/specs/2026-11-04-village-raids-design.md). `need`
       is the Clubhouse level a first build asks for; a second Cannon or tower
       is its own building with its own level. */
    barracks: { name: 'Barracks', w: 3, d: 3, buy: true, need: 1, lvl: [{ cost: 25, army: 10 }, { cost: 60, army: 15 }, { cost: 140, army: 20 }],
      job: l => `Trains your army. Holds ${B.barracks.lvl[l - 1].army}${l < 2 ? '. Archers from level 2' : ''}` },
    cannon: { name: 'Cannon', w: 2, d: 2, buy: true, need: 1, lvl: [{ cost: 20 }, { cost: 50 }, { cost: 120 }],
      job: l => `Defends: hits ${DEF.cannon.dmg[l - 1]} every 1.5 s, 4 squares out` },
    cannon2: { name: 'Cannon', w: 2, d: 2, buy: true, need: 3, lvl: [{ cost: 20 }, { cost: 50 }, { cost: 120 }],
      job: l => `Defends: hits ${DEF.cannon.dmg[l - 1]} every 1.5 s, 4 squares out` },
    tower: { name: 'Archer tower', w: 2, d: 2, buy: true, need: 2, lvl: [{ cost: 30 }, { cost: 70 }, { cost: 150 }],
      job: l => `Defends: hits ${DEF.tower.dmg[l - 1]} every 0.6 s, 6 squares out, over walls` },
    tower2: { name: 'Archer tower', w: 2, d: 2, buy: true, need: 4, lvl: [{ cost: 30 }, { cost: 70 }, { cost: 150 }],
      job: l => `Defends: hits ${DEF.tower.dmg[l - 1]} every 0.6 s, 6 squares out, over walls` },
  };
  const DEF = { cannon: { range: 4, every: 1500, dmg: [30, 40, 54], hp: [300, 400, 530] }, tower: { range: 6, every: 600, dmg: [8, 11, 15], hp: [250, 330, 440] } };
  const KIND = { cannon: 'cannon', cannon2: 'cannon', tower: 'tower', tower2: 'tower' };
  const HP = { club: 600, bank: 400, mine: 300, stadium: 300, barracks: 300, oak: 150, trophy: 100, boot: 100, glove: 100 };
  const WALL_HP = [150, 300, 500];
  // per tick (100 ms): move is squares a tick; every and the cooldowns are whole ms
  const UNITS = {
    b: { name: 'Soldier', cost: 2, train: 2 * 6e4, hp: 50, dmg: 5, every: 1000, range: .8, move: .1, walls: true },
    a: { name: 'Archer', cost: 3, train: 3 * 6e4, hp: 22, dmg: 4, every: 1000, range: 3, move: .12, walls: false },
  };
  const BATCH = 5, TICKETS = 3, SHIELD_MS = 12 * H, TICK = 100, RAID_MS = 6e4, SETTLE_MS = 9e4;
  // never bought: where they stand comes from the layout, whether they stand from the Hall
  const EARNED = {
    oak: { name: 'Old oak', w: 2, d: 2 },
    trophy: { name: 'Trophy hall', w: 3, d: 3 },
    boot: { name: 'Golden Boot', w: 1, d: 1 },
    glove: { name: 'Golden Glove', w: 1, d: 1 },
  };
  const IDS = ['club', 'bank', 'oak', 'mine', 'stadium', 'barracks', 'cannon', 'cannon2', 'tower', 'tower2', 'trophy', 'boot', 'glove'];
  const size = id => B[id] || EARNED[id];
  const FREE_WALLS = 28, WALL_MAX_BUY = 50;
  // how long reaching a level takes: level 1 at once, then 1, 3, 8 and 8 hours
  const BUILD_H = [0, 0, 1, 3, 8, 8];
  const buildMs = (lvl, play) => BUILD_H[lvl] * H / (play ? 360 : 1);
  const DAY_FROM = 9, DAY_TO = 18; // the mine works office hours

  /* What the mine adds between t0 and t1 at `perDay` a workday: spread evenly
     over 09:00 to 18:00 local of each workday. In play mode (localhost ?play)
     every day works, all day, and a "day" is 90 seconds. Fractions are kept. */
  const PLAY_DAY = 90e3;
  function mined(perDay, t0, t1, isWorkday, play) {
    if (!(perDay > 0) || !(t1 > t0)) return 0;
    if (play) return (t1 - t0) * perDay / PLAY_DAY;
    let n = 0;
    // ponytail: a day-by-day walk, ~250 steps for a Bank left a year
    for (const d = new Date(t0); d.setHours(0, 0, 0, 0), +d < t1; d.setDate(d.getDate() + 1)) {
      if (!isWorkday(new Date(d))) continue;
      const a = Math.max(t0, +d + DAY_FROM * H), b = Math.min(t1, +d + DAY_TO * H);
      if (b > a) n += (b - a) * perDay / ((DAY_TO - DAY_FROM) * H);
    }
    return n;
  }

  const fresh = () => ({ lvl: { club: 1, mine: 0, bank: 1, wall: 1, stadium: 0, barracks: 0, cannon: 0, cannon2: 0, tower: 0, tower2: 0 },
    building: null, bank: 0, pieces: FREE_WALLS, t: 0, army: { b: 0, a: 0 }, training: null, tickets: 0, shield: 0, raided: {} });
  const trainMs = (u, play) => UNITS[u].train / (play ? 12 : 1);
  const armyCap = v => v.lvl.barracks ? B.barracks.lvl[v.lvl.barracks - 1].army : 0;
  const armyN = v => v.army.b + v.army.a;
  const cap = v => B.bank.lvl[v.lvl.bank - 1].cap;
  const perDay = v => v.lvl.mine ? B.mine.lvl[v.lvl.mine - 1].day : 0;
  const games = v => v.lvl.stadium ? B.stadium.lvl[v.lvl.stadium - 1].games : 0;
  /* The mine fills up to the cap and no further; what's over it is lost. Coins
     the oak paid can sit above the cap, and then the mine adds nothing. */
  function fill(v, t, o) {
    if (t <= v.t) return;
    const add = mined(perDay(v), v.t, t, o.isWorkday, o.play);
    if (v.bank < cap(v)) v.bank = Math.min(cap(v), v.bank + add);
    v.t = t;
  }
  // bring a village up to t: the build in hand finishes on its own time, then the mine runs on
  function advance(v, t, o) {
    const b = v.building;
    if (b && b.done <= t) { fill(v, b.done, o); v.lvl[b.item] = b.lvl; v.building = null; }
    const tr = v.training;
    if (tr && tr.done <= t) { v.army[tr.u] += BATCH; v.training = null; }
    fill(v, t, o);
  }
  /* A row's price and what it does, or why it can't. `bal` is what the player
     holds then: the relay passes Infinity, since it only needs the timers. */
  function act(v, s, bal, o) {
    const t = +s.at;
    advance(v, t, o);
    if (s.kind === 'vbuild') {
      const x = B[s.item];
      if (!x || !x.buy) return { no: 'no such building' };
      if (v.lvl[s.item]) return { no: 'you already have one' };
      if (x.need && v.lvl.club < x.need) return { no: `needs the Clubhouse at level ${x.need}` };
      if (bal < x.lvl[0].cost) return { no: 'not enough coins', short: true };
      v.lvl[s.item] = 1;
      return { cost: x.lvl[0].cost, why: `Built a ${x.name.toLowerCase()}` };
    }
    if (s.kind === 'vup') {
      const x = B[s.item], lvl = x && v.lvl[s.item], next = lvl + 1;
      if (!x || !lvl) return { no: 'build it first' };
      if (!x.lvl[next - 1]) return { no: 'it is at its top level' };
      if (s.item !== 'club' && next > v.lvl.club) return { no: `needs the Clubhouse at level ${next}` };
      if (v.building) return { no: 'the builder is busy' };
      const cost = x.lvl[next - 1].cost;
      if (bal < cost) return { no: 'not enough coins', short: true };
      v.building = { item: s.item, lvl: next, done: t + buildMs(next, o.play), at: t };
      return { cost, why: `Upgrading your ${x.name.toLowerCase()} to level ${next}` };
    }
    if (s.kind === 'vwall') {
      const n = +s.n;
      if (!(n >= 1 && n <= WALL_MAX_BUY) || n % 1) return { no: 'that many wall pieces' };
      if (bal < n) return { no: 'not enough coins', short: true };
      v.pieces += n;
      return { cost: n, why: n > 1 ? `Bought ${n} wall pieces` : 'Bought a wall piece' };
    }
    if (s.kind === 'train') {
      const u = UNITS[s.u];
      if (!u) return { no: 'no such attacker' };
      if (!v.lvl.barracks) return { no: 'build a Barracks first' };
      if (s.u === 'a' && v.lvl.barracks < 2) return { no: 'Archers need the Barracks at level 2' };
      if (v.training) return { no: 'a batch is already training' };
      if (armyN(v) + BATCH > armyCap(v)) return { no: 'the Barracks is full' };
      if (bal < u.cost) return { no: 'not enough coins', short: true };
      v.training = { u: s.u, done: t + trainMs(s.u, o.play), at: t };
      return { cost: u.cost, why: `Training ${BATCH} ${u.name}s` };
    }
    // troops let go to make room: no coins back, so it can't be a way to make any
    if (s.kind === 'dismiss') {
      const n = +s.n;
      if (!UNITS[s.u] || !(n >= 1 && n <= 20) || n % 1) return { no: 'that many' };
      if (!(v.army[s.u] >= 1)) return { no: `no ${UNITS[s.u].name}s to remove` };
      const k = Math.min(n, v.army[s.u]);
      v.army[s.u] -= k;
      return { cost: 0, why: `Removed ${k} ${UNITS[s.u].name}${k > 1 ? 's' : ''} from your army` };
    }
    if (s.kind === 'vcollect') {
      const got = Math.floor(v.bank);
      if (got < 1) return { no: 'the Bank was empty' };
      v.bank -= got;
      return { cost: -got, why: 'Collected from your Bank' };
    }
    return { no: 'unknown' };
  }
  const KINDS = ['vbuild', 'vup', 'vwall', 'vcollect', 'train', 'dismiss'];
  // a village as of now, for display: the build that finished, the mine run on
  function at(v, now, o) {
    const c = JSON.parse(JSON.stringify(v));
    advance(c, now, o);
    return c;
  }

  /* ---- the plot ---- */
  const cells = (id, p) => {
    const z = size(id), out = [];
    for (let x = p.x; x < p.x + z.w; x++) for (let y = p.z; y < p.z + z.d; y++) out.push(x + '_' + y);
    return out;
  };
  const fits = (id, p) => { const z = size(id); return p && p.x >= 0 && p.z >= 0 && p.x + z.w <= GRID && p.z + z.d <= GRID; };
  // the start: Clubhouse in the middle, Bank and oak beside it, the free wall round all three
  const START = { club: { x: 8, z: 8 }, bank: { x: 12, z: 10 }, oak: { x: 12, z: 8 } };
  const startWalls = () => {
    const w = [];
    for (let x = 7; x <= 15; x++) for (let z = 7; z <= 13; z++) if (x === 7 || x === 15 || z === 7 || z === 13) w.push(x + '_' + z);
    return w;
  };
  /* Where everything the player has actually stands. A saved spot is kept if it
     fits and is free, in the order IDS lists them; anything else (new, never
     placed, or stepped on) goes to the first free space, scanning row by row
     from the middle out. Walls past the pieces owned are dropped. */
  function place(has, saved, pieces) {
    const own = !!(saved && saved.layout), lay = own ? saved.layout : START, used = new Set(), out = {};
    const walls = (own ? Object.keys(saved.walls || {}) : startWalls())
      .filter(k => /^\d+_\d+$/.test(k) && k.split('_').every(n => +n >= 0 && +n < GRID)).slice(0, pieces);
    walls.forEach(k => used.add(k));
    const take = (id, p) => { out[id] = p; cells(id, p).forEach(k => used.add(k)); };
    const free = (id, p) => fits(id, p) && cells(id, p).every(k => !used.has(k));
    const todo = [];
    IDS.filter(id => has.includes(id)).forEach(id => {
      const p = lay[id];
      if (p && free(id, p)) take(id, { x: +p.x, z: +p.z }); else todo.push(id);
    });
    const order = [];
    for (let r = 0; r < GRID; r++) for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++)
      if (Math.max(Math.abs(x - 9.5), Math.abs(z - 9.5)) <= r + .5 && Math.max(Math.abs(x - 9.5), Math.abs(z - 9.5)) > r - .5) order.push({ x, z });
    todo.forEach(id => { const p = order.find(p => free(id, p)); if (p) take(id, p); });
    return { pos: out, walls };
  }
  // a layout is fine to save if nothing overlaps, everything is on the plot and the walls are owned
  function valid(pos, walls, pieces) {
    const used = new Set();
    for (const [id, p] of Object.entries(pos)) {
      if (!fits(id, p)) return false;
      for (const k of cells(id, p)) { if (used.has(k)) return false; used.add(k); }
    }
    if (walls.length > pieces) return false;
    return walls.every(k => !used.has(k) && (used.add(k), true));
  }

  /* ---- raids ---- */
  const dayKey = t => { const d = new Date(t); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); };
  // why `a` (attacker `me`) can't raid `b` (`them`) at t, or null if they can
  function raidNo(a, b, t, me, them) {
    if (!b || me === them) return 'that’s you';
    if (b.shield > t) return 'shield';
    if (a.raided[them] === dayKey(t)) return 'raided today';
    if (!a.tickets) return 'no raid tickets: win a real game';
    if (!armyN(a)) return 'train an army first';
    return null;
  }
  const lootable = b => Math.floor(Math.floor(b.bank) / 2);
  /* What a raid is fought on: the victim's levels and layout as they stood, and
     the attacker's army. `ghosts` are statues not yet won: they take up room
     but aren't there to knock down. */
  const raidInput = (b, pos, walls, ghosts, army) => ({ lvl: { ...b.lvl }, pos, walls: walls.slice(), ghosts: ghosts.slice(), army: { ...army } });
  // cells no drop may land within two of: every building, ghost or not, and every wall piece
  const blockMemo = new WeakMap();
  function blocked(inp) {
    if (blockMemo.has(inp)) return blockMemo.get(inp);
    const s = new Set(), mark = k => { const [x, z] = k.split('_').map(Number); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) s.add((x + i) + '_' + (z + j)); };
    Object.entries(inp.pos).forEach(([id, p]) => cells(id, p).forEach(mark));
    inp.walls.forEach(mark);
    blockMemo.set(inp, s);
    return s;
  }
  const canDrop = (inp, x, z) => x >= 0 && z >= 0 && x < GRID && z < GRID && !blocked(inp).has(Math.floor(x) + '_' + Math.floor(z));

  /* The fight, in 100 ms ticks. Plain arithmetic and Math.sqrt only, and every
     choice breaks its ties by a fixed order (buildings in IDS order, attackers
     in drop order), so every phone gets the same raid from the same drops.
     drop() between steps, step() until over(), then result(). `shots` is what
     fired this tick, for the drawing. */
  function battle(inp) {
    const bs = IDS.filter(id => inp.pos[id] && !inp.ghosts.includes(id)).map(id => {
      const z = size(id), p = inp.pos[id], k = KIND[id], l = inp.lvl[id] || 1;
      const max = k ? DEF[k].hp[l - 1] : HP[id] || 200;
      return { id, x0: p.x, z0: p.z, w: z.w, d: z.d, cx: p.x + z.w / 2, cz: p.z + z.d / 2, hp: max, max,
        def: k ? { range: DEF[k].range, every: DEF[k].every, dmg: DEF[k].dmg[l - 1], kind: k } : null, cool: 0, target: null };
    });
    const wallHp = WALL_HP[(inp.lvl.wall || 1) - 1], walls = new Map(inp.walls.map(k => [k, wallHp]));
    const units = [], left = { ...inp.army };
    let tick = 0, shots = [];
    const alive = () => bs.filter(b => b.hp > 0);
    const near = (b, x, z) => {
      const px = Math.min(Math.max(x, b.x0), b.x0 + b.w), pz = Math.min(Math.max(z, b.z0), b.z0 + b.d);
      return { px, pz, d: Math.sqrt((px - x) * (px - x) + (pz - z) * (pz - z)) };
    };
    const api = {
      bs, units, walls, wallHp,
      get tick() { return tick; }, get shots() { return shots; }, left,
      drop(u, x, z) {
        if (!UNITS[u] || !(left[u] > 0)) return false;
        left[u]--;
        units.push({ u, x, z, hp: UNITS[u].hp, cool: 0, t: null, wall: null, n: units.length });
        return true;
      },
      over() {
        if (tick >= RAID_MS / TICK || !alive().length) return true;
        return !units.some(u => u.hp > 0) && !(left.b > 0) && !(left.a > 0);
      },
      step() {
        shots = [];
        for (const u of units) {
          if (u.hp <= 0) continue;
          const st = UNITS[u.u];
          u.cool = Math.max(0, u.cool - TICK);
          if (!u.t || u.t.hp <= 0) {
            u.t = null; let best = Infinity;
            for (const b of bs) if (b.hp > 0) { const d = near(b, u.x, u.z).d; if (d < best) { best = d; u.t = b; } }
          }
          if (!u.t) continue;
          const n = near(u.t, u.x, u.z);
          if (n.d <= st.range) {
            u.wall = null;
            if (!u.cool) { u.t.hp -= st.dmg; u.cool = st.every; shots.push({ from: u, to: u.t }); }
            continue;
          }
          const k = Math.min(st.move, n.d), nx = u.x + (n.px - u.x) / n.d * k, nz = u.z + (n.pz - u.z) / n.d * k;
          if (st.walls) {
            const key = Math.floor(nx) + '_' + Math.floor(nz);
            if (walls.get(key) > 0 && key !== Math.floor(u.x) + '_' + Math.floor(u.z)) {
              u.wall = key;
              if (!u.cool) { walls.set(key, walls.get(key) - st.dmg); u.cool = st.every; shots.push({ from: u, wall: key }); }
              continue;
            }
          }
          u.wall = null; u.x = nx; u.z = nz;
        }
        for (const b of bs) {
          if (!b.def || b.hp <= 0) continue;
          b.cool = Math.max(0, b.cool - TICK);
          const dist = u => Math.sqrt((u.x - b.cx) * (u.x - b.cx) + (u.z - b.cz) * (u.z - b.cz));
          if (!b.target || b.target.hp <= 0 || dist(b.target) > b.def.range) {
            b.target = null; let best = Infinity;
            for (const u of units) if (u.hp > 0) { const d = dist(u); if (d <= b.def.range && d < best) { best = d; b.target = u; } }
          }
          if (b.target && !b.cool) { b.target.hp -= b.def.dmg; b.cool = b.def.every; shots.push({ from: b, to: b.target }); }
        }
        tick++;
      },
      result() {
        const bank = bs.find(b => b.id === 'bank'), club = bs.find(b => b.id === 'club');
        const fell = bs.filter(b => b.hp <= 0).length, pct = bs.length ? fell / bs.length : 0;
        const clubDown = !!club && club.hp <= 0;
        return { bank: bank ? Math.min(1, (bank.max - Math.max(0, bank.hp)) / bank.max) : 0, pct, club: clubDown,
          stars: (pct >= .5 ? 1 : 0) + (clubDown ? 1 : 0) + (pct >= 1 ? 1 : 0),
          used: { b: inp.army.b - left.b, a: inp.army.a - left.a }, ticks: tick };
      },
    };
    return api;
  }
  // a whole raid from its drops ({ u, x, z, t }), each landing on the first tick at or after its t
  function fight(inp, drops) {
    const b = battle(inp), ds = drops.slice().sort((p, q) => p.t - q.t);
    for (let i = 0; ;) {
      while (i < ds.length && ds[i].t <= b.tick * TICK) { const d = ds[i++]; b.drop(d.u, d.x, d.z); }
      if (b.over()) return b.result();
      b.step();
    }
  }

  globalThis.VILLAGE = { FROM, B, EARNED, IDS, GRID, KINDS, FREE_WALLS, WALL_MAX_BUY, BUILD_H, DAY_FROM, DAY_TO,
    size, buildMs, mined, fresh, cap, perDay, games, advance, act, at, cells, fits, place, valid, START,
    DEF, KIND, HP, WALL_HP, UNITS, BATCH, TICKETS, SHIELD_MS, TICK, RAID_MS, SETTLE_MS, trainMs, armyCap, armyN,
    dayKey, raidNo, lootable, raidInput, canDrop, battle, fight };
})();
