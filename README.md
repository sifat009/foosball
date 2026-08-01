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

Push is the exception: there is no FCM emulator, so notifications only really
happen against the live project with the relay running.

## Push notifications

Six things reach a phone: a group match recorded, a knockout match decided, the
knockout opening, a champion crowned, a draft being scheduled, and the draft
falling due. Suggestions ping the admin alone.

Sending needs a service-account key, which can never live in a page — so the
page only *says what happened*. It writes a row to `/notify`, and a small
always-on process (`relay/relay.mjs`) holding the key reads the row, sends it,
and deletes it. It keeps an open Firebase listener rather than polling, so a
score reaches a phone in about a second, and it knows nothing about foosball:
all six messages are composed in `index.html`, next to the code that already
knew the match was over.

`/notify` is admin-writable only. That is why suggestions are the one thing the
relay watches directly — opening the node to every signed-in account would let
any Google user push to every phone in the office.

**Until it's configured nothing changes.** `VAPID_KEY` in `index.html` is empty
by default and the Notify button stays hidden, so the app is exactly what it
was before.

### 1. Keys

Firebase Console → Project settings → **Cloud Messaging** → Web Push
certificates → *Generate key pair*. Paste it into `VAPID_KEY` in `index.html`.
It's a public key — it belongs in the page, like the rest of `firebaseConfig`.

Then Project settings → **Service accounts** → *Generate new private key*. That
JSON is a real secret: it goes on the relay host only, never in this repo
(`.gitignore` already covers `*service-account*.json`).

Deploy the new rules — `notify`, `pushTokens` and `pushPrefs` won't exist
otherwise:

```
firebase deploy --only database
```

### 2. The relay host

It needs to be always on, so a Firebase listener can stay open. An **Oracle
Cloud Always Free** ARM VM (Ampere A1) is free permanently, even on a
pay-as-you-go account, and is what this is written for — but any box that stays
up works, including a Raspberry Pi.

The live one shares a box with an unrelated project, so it's deliberately built
to touch nothing outside its own directory: a system user, a private Node, and
`/opt` rather than a home directory. Everything below is additive and the
uninstall at the end removes all of it.

```
sudo useradd --system --no-create-home --shell /usr/sbin/nologin foosrelay
```

**Its own Node, not the system's.** Don't `apt install nodejs` — that can change
what `node` resolves to for whatever else runs on the box. Don't point at an
nvm install either: systemd can't see it, and `ProtectHome` below hides it
anyway. Build the tree in `/tmp` first (adjust arch and version to taste):

```
mkdir -p /tmp/foosball-build && cd /tmp/foosball-build
curl -fsSLO https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-arm64.tar.xz
tar xf node-v20.18.1-linux-arm64.tar.xz && mv node-v20.18.1-linux-arm64 node
```

Copy `relay/*.mjs`, `relay/package.json` and the service-account JSON (as
`sa.json`) into that directory, then:

```
./node/bin/node test-relay.mjs                              # "ok"
PATH=/tmp/foosball-build/node/bin:$PATH ./node/bin/npm i
```

`@firebase/app` is a **direct** dependency in `package.json` and it looks
unused, because nothing here imports it. Leave it. `firebase-admin` loads
`@firebase/database-compat/standalone`, whose whole point is not needing
`@firebase/app` — but it requires it anyway, while `database-compat` declares
it an *optional* peer so npm skips installing it. Without the explicit
dependency the relay dies on boot with `Cannot find module '@firebase/app'`.
The dependency-free `test-relay.mjs` won't catch it; only starting it will.

Then hand the finished tree to the service user:

```
rm -f /tmp/foosball-build/node-*.tar.xz
sudo mv /tmp/foosball-build /opt/foosball-relay
sudo chown -R foosrelay:foosrelay /opt/foosball-relay
sudo chmod 600 /opt/foosball-relay/sa.json
```

`/etc/systemd/system/foosball-relay.service`:

```
[Unit]
Description=Foosball push relay
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/opt/foosball-relay/node/bin/node /opt/foosball-relay/relay.mjs
WorkingDirectory=/opt/foosball-relay
Environment=GOOGLE_APPLICATION_CREDENTIALS=/opt/foosball-relay/sa.json
Environment=DB_URL=https://ollyo-foosball-default-rtdb.asia-southeast1.firebasedatabase.app
Environment=ADMIN_EMAIL=bhacker150@gmail.com
Environment=SITE_URL=https://sifat009.github.io/foosball/
User=foosrelay
Restart=always
RestartSec=10

# containment: enforced by systemd, not by good intentions
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true
MemoryMax=512M

[Install]
WantedBy=multi-user.target
```

`ProtectSystem=strict` works because the relay writes nothing to disk — all its
state is in Firebase. `ProtectHome` means the co-tenant project's files don't
exist as far as it's concerned. `MemoryMax` is a leak guard: it idles around
20 MB, so the cap only ever fires on a runaway, and it fires on the relay
rather than on whatever else shares the box.

`ADMIN_EMAIL` must match the one in `index.html` and the `.write` rule — it's
how the relay knows which devices are yours for the suggestion pings.

```
sudo systemctl daemon-reload
sudo systemctl enable --now foosball-relay
journalctl -u foosball-relay -f      # want: [relay] listening
```

Oracle's default security list blocks nothing outbound, so no firewall rule is
needed — the relay only makes outgoing connections. Don't open any port; it
listens on none, and `ss -tulpn` should be identical before and after.

To remove every trace of it:

```
sudo systemctl disable --now foosball-relay
sudo rm /etc/systemd/system/foosball-relay.service
sudo systemctl daemon-reload
sudo rm -rf /opt/foosball-relay
sudo userdel foosrelay
```

A scheduled draft reminder is a `setTimeout` in that process, but the row stays
in `/notify` until it's actually sent, so a restart re-arms it. A reboot can't
swallow the reminder.

### 3. On the phone

Tap **Alerts** (**Notify me** on desktop) to open the notifications drawer, and
accept the permission prompt. *All notifications* is the subscription itself:
switching it off drops the device's token and everything stops; switching it
back on turns every kind on again.

**iPhone must install the app first** — iOS delivers web push only to a
home-screen app, not to a Safari tab, so the button is hidden until then (the
install steps say so). Android and desktop Chrome work in a plain tab.

Tokens live at `/pushTokens`, keyed by token, valued with the owner's email or
a timestamp when signed out. The rules only let a signed-in account write its
own address, so nobody can pose as the admin to receive the suggestion pings.
Dead tokens (uninstalled apps) are pruned by the relay when a send rejects
them.

Under it are the kinds — draw times, match results, cup milestones, and score
suggestions for the admin. Each `/notify` row carries its `kind`, each device
mirrors its switches to `/pushPrefs/<token>`, and the **relay** is what drops a
device that said no: the page can't filter what it doesn't send. Silence means
yes, so a phone that subscribed before the drawer existed still gets
everything — which also means an old relay ignores the switches entirely.
Restart the relay after deploying this.

## Tests

```
npx playwright@1.61 install chromium
node test.mjs
node relay/test-relay.mjs   # no database, no key, nothing installed
```

The relay check covers the two decisions worth getting wrong: when a queued row
fires (an unscheduled row goes at once, a past time isn't a negative timeout, a
draft months out is clamped rather than fired immediately by `setTimeout`'s
overflow) and who receives it (an admin-only ping reaching the admin's devices
and nothing else).

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

Notifications are covered by stubbing `window.notify` and driving the real code
paths: a group match typed four boxes at a time announces **once**, on the box
that settles it; a correction re-announces only if it changed who won; the
knockout names its round and the final stays silent because the champion
notification covers it; the draft timer emits an announcement plus a reminder at
fixed keys, and clearing the date cancels the reminder. Two silence checks carry
the most weight — a viewer must never announce (the call sites run in *every*
watcher's browser, so a missing admin check means one notification per person
watching) and replaying a snapshot must not re-announce a recorded match. All
four guards are mutation-tested: removing any one of them fails the suite.

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
- Push **delivery**, once the relay is running — there is no FCM emulator, so
  this is the one part no suite can reach. Tap Notify me on a phone, then record
  a group score as admin: it should arrive with the app closed. Which
  notifications fire, and how many, is covered offline (see Tests); what needs a
  real device is the last hop, FCM to the handset. A suggestion from another
  account pinging only the admin also needs two real accounts.

  To check delivery without touching a cup that's mid-season, write a row to
  `/notify` by hand in the Console — `{ "title": "test", "body": "hello" }`.
  The node is independent of `cup`, so nothing a viewer sees moves.

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
