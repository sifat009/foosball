# The Ollyo Foosball Cup

Single-page tournament app: draft wheels, group stage, knockout bracket.
Plain HTML — no build step, no npm. Deployed at
<https://sifat009.github.io/foosball/>.

State lives in a Firebase Realtime Database, so everyone sees the standings
update live. One admin account can edit; everyone else is read-only. Any other
signed-in Google account can *suggest* a score for an unrecorded group match —
captured for the admin to accept, never applied on its own.

Every match — group *and* knockout — is scored per player: two boxes per team,
forward then defender, and the team score is only ever those two added up. That
is what feeds the **Golden Boot** (most individual goals) and the **Golden Ball**
(cup MVP: furthest round, then win %, then GD, then goals — the last step being
the only one that can separate two players on the same team). Both are shared on
a tie. A no-show has no goalscorer, so it is set with the **forfeit picker**
under the match instead, and counts towards neither award; the group can void a
match nobody turned up for, the knockout cannot, because somebody has to go
through. Awards are archived at `history/<cupId>` next to `champion`/`players`,
and the all-time Players board counts them the way it counts titles — cups
archived before any of this simply contribute nothing to those two columns.

The celebration overlay has a **Share** button that draws a 1200×1200 PNG of
the moment and hands it to the OS share sheet (or downloads it, on desktops
with no file sharing). It's drawn on a canvas rather than screenshotted, so
`drawCard()` and the overlay's CSS have to be kept in step by hand. Anyone
looking at the page can share any cup: the image is built locally and never
uploaded, so there is nothing to authorise.

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
`ADMIN_EMAIL` in `index.html`, and the address in the `cup`/`history` `.write`
rule. The one in `index.html` only decides whether the UI shows the editing
controls; the one in the rules is the actual boundary, enforced by Firebase
rather than by the page. Changing admin means editing both.

The `suggestions` node is writable by **any verified Google account**, not just
the admin — that's what lets players suggest scores. It's a separate node;
`cup` and `history` still take writes from the admin alone. If you want to
narrow suggestions to your own organisation, add an email-domain check to that
rule (e.g. `&& auth.token.email.endsWith('@yourdomain.com')`).

## Running it locally

Localhost is wired to the **Firebase emulators**, not the live project — a local
Start Over can't wipe a cup people are watching. Start them first, in their own
terminal:

```
firebase emulators:start --only auth,database
```

Then serve the page (Google sign-in refuses to run from a `file://` page):

```
npx serve .        # then visit the printed localhost URL
```

Sign-in opens the emulator's fake account picker instead of Google's — add an
account with the admin address from `ADMIN_EMAIL` and you get the admin UI, add
any other address and you're a viewer. `database.rules.json` is loaded by the
emulator, so the real write boundary is enforced locally too. Emulator state is
in memory: stopping it wipes the test cup. The emulator UI is at
<http://localhost:4000>.

The database emulator needs a Java runtime (`brew install openjdk`). If the
emulators aren't running the page just sits offline — that's deliberate, local
edits have nowhere to go but the emulator.

The switch is a hostname check next to `initializeApp` in `index.html`; a
deployed page never takes that branch.

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
corrections overwrite one entry, undo removes it, viewers never write. The
share card is checked for size, a rasterised trophy, a files-only payload with
the right filename, a cancelled sheet not reading as an error, and the award
lines actually reaching the canvas. Per-player scoring is covered end to end:
the team score as a sum, a half-filled team not counting, no draws in either
stage, the forfeit picker in both its shapes, the Golden Boot and Golden Ball
formulas including a shared tie and the teammate tie-break, the live scoring
race, and the two new all-time columns. Esc is
checked to dismiss only the top layer — a replayed celebration closes without
taking the Hall of Fame behind it with it.

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
- Signing in with a non-admin Google account lets you type each player's goals
  into an unrecorded group match; it appears to everyone as a pending suggestion
  with your name, the standings don't move, and the admin sees Accept / Dismiss.
  Accepting writes the real score *with its per-player breakdown* and clears the
  suggestion. Suggesters never get the forfeit picker.
- On a phone, Share in the celebration opens the real OS share sheet with the
  PNG attached, and posting it to a chat shows the image rather than a link.
  The suite stubs `navigator.share`, so only the plumbing is covered offline.

## Notes

- State is stored as a single JSON string, not a nested object. RTDB deletes
  nulls, which would silently drop unplayed matches from `groupScores` and
  turn the array into an object. `groupScores` and `koScores` are both
  `[sa, sb, pa, pb]` per match — the team totals are stored rather than
  recomputed, so a forfeit (a result with no breakdown behind it) survives the
  round trip too. A cup left mid-bracket by an older version carries `koPicks`
  instead, and `applyState()` still reads it.
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
