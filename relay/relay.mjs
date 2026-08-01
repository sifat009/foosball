/* Push relay — the one piece that can't live in the page.
 *
 * Sending an FCM message needs a service-account key, which can never ship to a
 * browser. So this holds the key and nothing else: it keeps an open Firebase
 * listener (no polling, no cron — a write reaches a phone in about a second)
 * and knows nothing about foosball. The page decides what is worth announcing
 * and writes a row to /notify; this reads the row, sends it, deletes it.
 *
 * The one exception is /suggestions, which is watched directly: opening /notify
 * to non-admin accounts would let any signed-in Google user push to every
 * phone, so the ping to the admin is derived here instead.
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

   `kind` is the alerts drawer: a device that switched this kind off wrote so
   under /pushPrefs. Only an explicit false drops a device — no prefs row, no
   entry for this kind, or a row for a kind the page never sends all mean yes,
   so a phone that subscribed before the drawer existed keeps its alerts. */
export const recipients = (tokens, adminOnly, adminEmail, kind, prefs) =>
  Object.keys(tokens || {}).filter(t =>
    (!adminOnly || tokens[t] === adminEmail) &&
    !(kind && ((prefs || {})[t] || {})[kind] === false));

async function main() {
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
  async function send(title, body, adminOnly, kind) {
    const list = recipients(tokens, adminOnly, ADMIN_EMAIL, kind, prefs);
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
        const id = cup + '/' + key;
        now.add(id);
        if (seen && !seen.has(id))
          send('Score suggested', `${v.by} suggested ${v.sa}–${v.sb} — tap to accept or reject.`, true, 'suggest')
            .catch(e => console.error('[send] failed:', e));
      }));
    seen = now;
  });

  console.log('[relay] listening');
}

// only when run, not when imported by the test
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) main();
