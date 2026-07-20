# The Ollyo Foosball Cup

Single-page tournament app: draft wheels, group stage, knockout bracket.
Plain HTML — no build step, no npm. Deployed at
<https://sifat009.github.io/foosball/>.

State lives in a Firebase Realtime Database, so everyone sees the standings
update live. One admin account can edit; everyone else is read-only.

Finished cups are archived: "Past Champions" opens a list of every previous
winner, readable by anyone, at any point in a tournament. "How it works" in the
footer explains the format, the table, and the knockout — keep it in step with
`rank()` and `startKnockout()` if you change either.

## Before it works

**Authorized domains.** Firebase Console → Authentication → Settings →
Authorized domains → add `sifat009.github.io`. Google sign-in is rejected from
any domain not on that list. `localhost` is already there.

**Database rules.** `firebase.json` and `.firebaserc` are checked in, so
deploying is:

```
npm i -g firebase-tools
firebase login
firebase deploy --only database
```

Don't run `firebase init database` — it offers to overwrite
`database.rules.json`, and that file is the real access boundary. Pasting the
file into Console → Realtime Database → Rules works too.

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
the first snapshot, sign-out re-locks, Past Champions lists cups newest-first,
and the final drives the record — nothing written until it's decided,
corrections overwrite one entry, undo removes it, viewers never write.

What the suite **cannot** cover, because it needs real Google OAuth — check
these by hand after deploying:

- Signing in with the admin account unlocks the score inputs.
- Signing in with any *other* Google account leaves the page read-only, and a
  write attempt via the console fails with a permission error.
- Two browsers open at once: a score entered in one appears in the other
  within a second or so, without a reload.
- Killing the network shows the offline warning and edits stop saving.
- Deciding the Grand Final adds the winner to Past Champions, and a viewer's
  open list picks it up without a reload.

## Notes

- State is stored as a single JSON string, not a nested object. RTDB deletes
  nulls, which would silently drop unplayed matches from `groupScores` and
  turn the array into an object.
- The Firebase config in `index.html` is public by design. It identifies the
  project; it does not grant access. The rules do that.
- "Start Over" wipes the cup for everyone watching, not just the admin's tab.
  It does not touch the archive.
- The champion is recorded the moment the Grand Final is decided. Each cup
  gets a `cupId` and its winner is stored at `history/<cupId>`, so correcting
  the final overwrites that one entry and undoing it removes the entry
  entirely — clicking around the bracket can't leave junk behind. There is no
  UI for editing the archive; fix a bad entry in the Firebase console.
- Past Champions is an overlay, not one of the `.screen` divs. `applyState()`
  calls `show()` on every remote snapshot, so a screen would close itself the
  moment the admin scored a match.
