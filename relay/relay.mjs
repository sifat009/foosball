/* Push relay — the one piece that can't live in the page.
 *
 * Sending an FCM message needs a service-account key, which can never ship to a
 * browser. So this holds the key and nothing else: it keeps an open Firebase
 * listener (no polling, no cron — a write reaches a phone in about a second)
 * and knows nothing about foosball. The page decides what is worth announcing
 * and writes a row to /notify; this reads the row, sends it, deletes it.
 *
 * The exceptions are /suggestions and /challenges, which are watched directly:
 * opening /notify to non-admin accounts would let any signed-in Google user
 * push to every phone, so those announcements are derived here instead.
 *
 * Run it on an Always Free Oracle VM — see the README. Config comes from the
 * environment:
 *   GOOGLE_APPLICATION_CREDENTIALS  path to the service-account JSON
 *   DB_URL                          databaseURL from the firebase config
 *   ADMIN_EMAIL                     must match ADMIN_EMAIL in index.html
 *   SITE_URL                        where tapping a notification lands
 */
/* The two decisions worth getting right, kept pure so test-relay.mjs can check
   them without a database or a service-account key. firebase-admin is imported
   inside main() for the same reason: the test can then run in a bare checkout,
   with nothing installed. */

// ms until a queued row should be sent. setTimeout overflows past ~24.9 days
// and fires immediately, so a far-future draft date is clamped rather than
// announced at once; the row survives the wait, so the next pass re-arms it.
export const delayFor = (n, now = Date.now()) =>
  Math.min(Math.max(((n && n.at) || 0) - now, 0), 2 ** 31 - 1);

/* Suggestion pings go to the admin's devices alone. A token's value is its
   owner's email, and the rules only let a signed-in account write its own
   address — so an anonymous viewer can't claim to be the admin and eavesdrop.

   `except` is whoever caused the announcement — you are not pinged about your
   own tap. It is matched as a string, because an anonymous device stores a
   timestamp rather than an address and must never be dropped by it.

   `kind` is the alerts drawer: a device that switched this kind off wrote so
   under /pushPrefs. Only an explicit false drops a device — no prefs row, no
   entry for this kind, or a row for a kind the page never sends all mean yes,
   so a phone that subscribed before the drawer existed keeps its alerts.

   `only` is the other direction: an announcement addressed to named people
   rather than broadcast. A device that stored a timestamp instead of an address
   is signed out and belongs to nobody, so it is never on such a list. */
export const recipients = (tokens, adminOnly, adminEmail, kind, prefs, except, only) =>
  Object.keys(tokens || {}).filter(t =>
    (!adminOnly || tokens[t] === adminEmail) &&
    !(only && !only.includes(tokens[t])) &&
    !(typeof except === 'string' && tokens[t] === except) &&
    !(kind && ((prefs || {})[t] || {})[kind] === false));

/* The page saves a suggestion on every box the suggester leaves, so the first
   version in the node is nearly always half a score — one team's goals and
   nothing for the other. Announcing that one gives the admin "9–undefined",
   and the pings never repeat, so the finished score is never announced at all.
   Same rule the page uses for its Accept button: both totals in, and no draw,
   since foosball has none and the admin couldn't accept it anyway. */
export const sugReady = v => !!v && v.sa != null && v.sb != null && v.sa !== v.sb;

/* The alert carries the whole suggested result, not just the two totals: the
   admin decides on it from the lock screen, and "9–6" says nothing about who
   scored them. The names travel on the suggestion — this end knows no teams.
   A cup that doesn't count individual goals has no breakdown to print, so it
   falls back to the team and its total. */
export const sugText = v => {
  const side = (t, p, s) => t && p ? `${t.fwd} ${p.fwd ?? 0} + ${t.def} ${p.def ?? 0} = ${s}`
    : t ? `${t.fwd} + ${t.def} ${s}` : String(s);
  return `${v.by} suggested ${side(v.ta, v.pa, v.sa)} vs ${side(v.tb, v.pb, v.sb)} — tap to accept or reject.`;
};


/* ---- challenges ----
   A pickup game announces itself three times: when it opens, when the fourth
   seat goes, and when someone files the score. One `value` listener sees all
   three, so what separates them is the diff against the last snapshot — kept
   pure here, out of the listener, so test-relay.mjs can check every branch
   without a database.

   Seat order is the reading order of the card: blue then red, forward then
   defender. */
export const SEAT_IDS = ['bf', 'bd', 'rf', 'rd'];
export const chalSeats = c => SEAT_IDS.filter(s => c && c.slots && c.slots[s]);
export const chalScored = c => !!(c && c.score && c.score.b != null && c.score.r != null);
export const chalPair = (c, a, b) => `${c.slots[a].name} & ${c.slots[b].name}`;
export const chalTeams = c => `${chalPair(c, 'bf', 'bd')} vs ${chalPair(c, 'rf', 'rd')}`;

/* A claim is a score one of the four has filed and the other side has not
   agreed to yet. It is announced whenever it changes hands or figures, so a
   counter-offer reaches the person who filed the first one — hence an identity
   built from the filer and the numbers, not merely "a claim exists". */
export const chalClaim = c => c && c.pending && c.pending.b != null && c.pending.r != null ? c.pending : null;
export const chalClaimId = c => {
  const p = chalClaim(c);
  return p ? `${p.by}|${p.b}-${p.r}` : null;
};
export const chalSeatOf = (c, email) => SEAT_IDS.find(s => c.slots && c.slots[s] && c.slots[s].email === email);
// whoever has to answer for it: the two seats on the far side of the table
export const chalOthers = (c, side) => (side === 'b' ? ['rf', 'rd'] : ['bf', 'bd'])
  .map(s => c.slots && c.slots[s] && c.slots[s].email).filter(Boolean);

/* What is worth saying about one lobby, given what it looked like last time.
   `except` is the address behind the change — you are not told about your own
   tap. A confirmed score goes to everybody, because that is the moment the
   ladder moves; the claim before it goes only to the people who can settle it,
   which is what `only` carries.

   A lobby first seen already full or already played is news to nobody: that is
   a row this process simply hadn't met yet, not something that just happened. */
export const chalNews = (prev, c) => {
  if (!c || !c.at) return null;
  const seats = chalSeats(c), scored = chalScored(c);
  if (!prev) {
    if (scored || seats.length === 4) return null;
    const left = 4 - seats.length;
    const who = seats.length ? c.slots[seats[0]].name : 'Someone';
    return {
      title: 'Challenge open',
      body: `${who} wants a game — ${left} ${left === 1 ? 'seat' : 'seats'} left.`,
      except: c.by,
    };
  }
  if (!prev.scored && scored && seats.length === 4) {
    const b = +c.score.b, r = +c.score.r;
    return {
      title: `Blue ${b}\u2013${r} Red`,
      body: b === r ? `${chalTeams(c)} — drawn.`
        : `${b > r ? chalPair(c, 'bf', 'bd') : chalPair(c, 'rf', 'rd')} win the challenge.`,
      except: null,
    };
  }
  /* A claim goes to the two people who can settle it and nobody else — main()
     adds the admin, who is the fallback. It is checked after the score so that
     confirming, which clears the claim and writes the score in one update,
     reads as the result it is rather than as a claim that vanished. */
  const claim = chalClaim(c), claimId = chalClaimId(c);
  if (claim && claimId !== prev.claim && seats.length === 4) {
    const seat = chalSeatOf(c, claim.by);
    const by = (seat && c.slots[seat].name) || claim.by;
    return {
      title: 'Score to confirm',
      body: `${by} filed ${claim.b}\u2013${claim.r} in ${chalTeams(c)} — tap to confirm or reject.`,
      except: claim.by,
      only: chalOthers(c, claim.side),
      kind: 'suggest',
    };
  }
  if (prev.seats.length < 4 && seats.length === 4) {
    const last = seats.find(x => !prev.seats.includes(x));
    return {
      title: 'Challenge on',
      body: `${chalTeams(c)} — all four in.`,
      except: last ? c.slots[last].email : null,
    };
  }
  return null;
};

/* ---- trees ----
   The page works trees out in coinWalk, from /spends; this end repeats the
   part a reminder needs: whose tree is alive, whether today's water is in, and
   when its coins ripen. Same constants and day arithmetic as index.html, which
   is why the process runs on the office's clock (TZ, set in main).

   ponytail: no balances here, so a row the page's walk refuses for want of
   coins still counts. The page never sends one, so only a hand-written row
   would earn a stray ping. Port coinWalk if that ever matters. */
export const TREE_MISS = 3, TREE_TOP = 3, RIPEN_MS = 3 * 36e5, RIPE_BY_HOUR = 21, REMIND_HOUR = 11;
export const dayOf = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
const offDay = t => [0, 6].includes(new Date(t).getDay());
export const ripeAt = t => Math.min(t + RIPEN_MS, dayOf(t) + RIPE_BY_HOUR * 36e5);
const weekdaysBetween = (a, b) => {
  let n = 0;
  for (const d = new Date(a); d.setDate(d.getDate() + 1), +d < b;) if (!offDay(+d)) n++;
  return n;
};
const treeAt = (tr, t) => {
  if (!tr) return null;
  const stage = tr.stage - Math.floor(weekdaysBetween(tr.day, dayOf(t)) / TREE_MISS);
  return stage < 0 ? null : { ...tr, stage };
};

// email -> { stage, day, ripe } as of now; a dead tree is left out
export const treesOf = (spends, now = Date.now()) => {
  const trees = {};
  Object.values(spends || {}).filter(s => s && s.at && s.by && ['plant', 'water', 'grow'].includes(s.kind))
    .sort((a, b) => a.at - b.at).forEach(s => {
      const t = +s.at, day = dayOf(t), cur = treeAt(trees[s.by], t), today = cur && cur.day === day;
      if (offDay(t)) return;
      if (s.kind === 'plant' && !cur) trees[s.by] = { stage: 0, day, ripe: null };
      else if (s.kind === 'water' && cur && !today) trees[s.by] = { stage: cur.stage, day, ripe: ripeAt(t) };
      else if (s.kind === 'grow' && today && cur.stage < TREE_TOP) trees[s.by] = { ...cur, stage: cur.stage + 1 };
    });
  const out = {};
  Object.entries(trees).forEach(([e, tr]) => { const t = treeAt(tr, now); if (t) out[e] = t; });
  return out;
};

// who to nag: a living tree with no water (or planting) today, on a weekday
export const thirsty = (trees, now = Date.now()) =>
  offDay(now) ? [] : Object.keys(trees).filter(e => trees[e].day !== dayOf(now));

// the next weekday REMIND_HOUR strictly after now
export const nextRemind = (now = Date.now()) => {
  const d = new Date(now); d.setHours(REMIND_HOUR, 0, 0, 0);
  while (+d <= now || offDay(+d)) d.setDate(d.getDate() + 1);
  return +d;
};

async function main() {
  // the tree's day ends at the office's midnight, not the VM's
  process.env.TZ = process.env.TZ || 'Asia/Dhaka';

  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getDatabase } = await import('firebase-admin/database');
  const { getMessaging } = await import('firebase-admin/messaging');

  const DB_URL = process.env.DB_URL;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const SITE_URL = process.env.SITE_URL || 'https://sifat009.github.io/foosball/';
  if (!DB_URL || !ADMIN_EMAIL) {
    console.error('set DB_URL and ADMIN_EMAIL (and GOOGLE_APPLICATION_CREDENTIALS)');
    process.exit(1);
  }

  initializeApp({ credential: applicationDefault(), databaseURL: DB_URL });
  const db = getDatabase();
  const fcm = getMessaging();

  // every device that opted in: token -> owner's email, or a timestamp for the
  // signed-out majority. Held in memory, kept fresh by the listener.
  let tokens = {};
  db.ref('pushTokens').on('value', s => { tokens = s.val() || {}; });
  // what each device asked for in the alerts drawer, same shape: token -> kinds
  let prefs = {};
  db.ref('pushPrefs').on('value', s => { prefs = s.val() || {}; });

  // ponytail: sendEachForMulticast caps at 500 tokens; chunk it if a cup ever
  // outgrows that, which for one office's foosball it will not
  async function send(title, body, adminOnly, kind, except, only) {
    const list = recipients(tokens, adminOnly, ADMIN_EMAIL, kind, prefs, except, only);
    if (!list.length) return;
    const res = await fcm.sendEachForMulticast({
      tokens: list,
      notification: { title, body },
      /* Only `icon` is set here, not title and body: FCM merges the
         platform-specific block field by field over the common one, so the
         text above still stands. Without an icon Chrome draws a circle with
         the first letter of the domain in it, which reads as a stray "S".
         Built with the URL constructor so a SITE_URL without a trailing slash
         can't silently produce a 404 and put the "S" back. */
      webpush: {
        notification: { icon: new URL('icons/icon-192.png', SITE_URL).href },
        fcmOptions: { link: SITE_URL },
      },
    });
    console.log(`[send] ${title} -> ${res.successCount}/${list.length}`);
    /* Uninstalled apps and cleared browsers leave tokens behind that fail
       forever. Drop them here or the list grows without limit and every send
       spends its time on dead devices. */
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument')
        db.ref('pushTokens/' + list[i]).remove();
    });
  }

  /* A row with `at` in the future is a scheduled announcement (the draft time).
     Because the row is deleted only once it has been sent, a restart re-reads
     everything still pending and re-arms it — a reboot can't swallow the draw
     reminder. Rescheduling overwrites the row at a fixed key, so child_changed
     and child_removed have to cancel the timer the old value armed. */
  const timers = new Map();
  const cancel = key => { clearTimeout(timers.get(key)); timers.delete(key); };

  function schedule(key, n) {
    if (!n || !n.title) return;
    const fire = () => {
      timers.delete(key);
      send(n.title, n.body, false, n.kind).catch(e => console.error('[send] failed:', e))
        .finally(() => db.ref('notify/' + key).remove());
    };
    const wait = delayFor(n);
    if (wait > 0) timers.set(key, setTimeout(fire, wait));
    else fire();
  }

  db.ref('notify').on('child_added', s => schedule(s.key, s.val()));
  db.ref('notify').on('child_changed', s => { cancel(s.key); schedule(s.key, s.val()); });
  db.ref('notify').on('child_removed', s => cancel(s.key));

  /* Suggestions ping the admin alone. `seen` starts null so the first snapshot
     only seeds it: without that, every restart would re-announce every
     suggestion still sitting in the node. */
  let seen = null;
  db.ref('suggestions').on('value', s => {
    const now = new Set();
    Object.entries(s.val() || {}).forEach(([cup, matches]) =>
      Object.entries(matches || {}).forEach(([key, v]) => {
        if (!sugReady(v)) return; // stays out of `seen` too, so the ping waits for the finished score
        const id = cup + '/' + key;
        now.add(id);
        if (seen && !seen.has(id))
          send('Score suggested', sugText(v), true, 'suggest')
            .catch(e => console.error('[send] failed:', e));
      }));
    seen = now;
  });

  /* Challenges. `seen` seeds on the first snapshot for the same reason
     suggestions does — otherwise a restart re-announces every open lobby. */
  let chalSeen = null;
  db.ref('challenges').on('value', s => {
    const now = new Map();
    Object.entries(s.val() || {}).forEach(([id, c]) => {
      if (!c || !c.at) return;
      now.set(id, { seats: chalSeats(c), scored: chalScored(c), claim: chalClaimId(c) });
      if (!chalSeen) return; // first pass only seeds
      const news = chalNews(chalSeen.get(id), c);
      // the admin rides along on a claim as the fallback confirmer, and is the
      // one address this end can add — chalNews knows no admin
      if (news) send(news.title, news.body, false, news.kind || 'challenge', news.except,
        news.only && [...news.only, ADMIN_EMAIL]).catch(e => console.error('[send] failed:', e));
    });
    chalSeen = now;
  });

  /* Trees. Two pings, both to the tree's owner alone: a weekday-afternoon
     nudge if today's water isn't in, and one when today's coins ripen. A ripe
     time already past is skipped rather than sent, so a restart can't repeat
     one; a restart past REMIND_HOUR waits for tomorrow's nudge the same way. */
  let trees = {};
  const ripeTimers = new Map(); // email -> [ripe, timer]
  db.ref('spends').on('value', s => {
    trees = treesOf(s.val());
    Object.entries(trees).forEach(([email, tr]) => {
      const armed = ripeTimers.get(email);
      if (!tr.ripe || tr.ripe <= Date.now() || (armed && armed[0] === tr.ripe)) return;
      if (armed) clearTimeout(armed[1]);
      ripeTimers.set(email, [tr.ripe, setTimeout(() => {
        ripeTimers.delete(email);
        send('Coins are ripe', 'Your tree is ready — collect before midnight or they drop.',
          false, 'tree', null, [email]).catch(e => console.error('[send] failed:', e));
      }, tr.ripe - Date.now())]);
    });
  });
  const remind = () => setTimeout(() => {
    const list = thirsty(trees);
    if (list.length) send('Your tree wants water', 'Water it now and its coins ripen before the day is out.',
      false, 'tree', null, list).catch(e => console.error('[send] failed:', e));
    remind();
  }, nextRemind() - Date.now());
  remind();

  console.log('[relay] listening');
}

// only when run, not when imported by the test
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) main();
