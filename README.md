# Ollyo Foosball Cup

Single-page tournament app: draft wheels, group stage, knockout bracket.
Plain HTML — no build step, no npm. Deployed at
<https://sifat009.github.io/foosball/>.

State lives in a Firebase Realtime Database, so everyone sees the standings
update live. One admin account can edit; everyone else is read-only.

## Before it works

**Authorized domains.** Firebase Console → Authentication → Settings →
Authorized domains → add `sifat009.github.io`. Google sign-in is rejected from
any domain not on that list. `localhost` is already there.

Then paste `database.rules.json` into Console → Realtime Database → Rules and
hit Publish.

The admin account is set in two places and they must match:
`ADMIN_EMAIL` in `index.html`, and the address in the `.write` rule. The one in
`index.html` only decides whether the UI shows the editing controls; the one in
the rules is the actual boundary, enforced by Firebase rather than by the page.
Changing admin means editing both.

## Running it locally

Google sign-in refuses to run from a `file://` page, so open it over HTTP:

```
npx serve .        # then visit the printed localhost URL
```

## Tests

```
npx playwright@1.61 install chromium
node test.mjs
```

Firebase is blocked during the run, so the suite covers the app logic and the
admin gate offline: read-only by default, standings render from a pushed
state, admin unlocks editing, writes carry the right payload, no writes before
the first snapshot, and sign-out re-locks.

What the suite **cannot** cover, because it needs real Google OAuth — check
these by hand after deploying:

- Signing in with the admin account unlocks the score inputs.
- Signing in with any *other* Google account leaves the page read-only, and a
  write attempt via the console fails with a permission error.
- Two browsers open at once: a score entered in one appears in the other
  within a second or so, without a reload.
- Killing the network shows the offline warning and edits stop saving.

## Migrating an in-flight cup

The app used to keep state in the URL hash. If you have an old link with a
tournament in it, open it while signed in as admin: the page seeds the
database from the hash, but **only if the database is empty**, atomically, and
then strips the hash from the URL. A stale bookmark can't overwrite a live
cup. Once seeded, the hash is no longer used for anything.

## Notes

- State is stored as a single JSON string, not a nested object. RTDB deletes
  nulls, which would silently drop unplayed matches from `groupScores` and
  turn the array into an object.
- The Firebase config in `index.html` is public by design. It identifies the
  project; it does not grant access. The rules do that.
- "Start Over" wipes the cup for everyone watching, not just the admin's tab.
