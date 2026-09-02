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
is what feeds the **Golden Boot** (most individual goals) and the **Golden Glove**
(fewest goals conceded **per match**, and only the players drafted onto the
**defence** are eligible — goals against are a team total shared by both partners,
so opening it to forwards could only ever name a pair, never a person). Per match
rather than in total because the two aren't comparable: everyone plays the same
group fixtures, but a finalist plays two or three knockouts on top, and on a raw
total those extra matches are pure cost — a defence conceding 5 a match over 6
would lose to one conceding 7 a match that went out in the group, so the award
would reward getting knocked out early. The rate is rounded to a tenth, the same
number the panel prints, so the board never splits two defences the reader sees
as level. Ties on the rate go to whoever held it over more matches; both awards
are shared when players are still level after that.
A no-show is set with the **forfeit picker** under the match: it has no
goalscorer so it moves no Boot, but its 1-0 is a real goal conceded and does
count against the Glove. The group can void a match nobody turned up for, the
knockout cannot, because somebody has to go through. Awards are archived at
`history/<cupId>` next to `champion`/`players`, and the all-time Players board
counts them the way it counts titles — cups archived before any of this simply
contribute nothing to those two columns. Cups won before the Glove replaced the
old Golden Ball carry a `ball` key that nothing reads any more: the award is
retired rather than renamed, since it measured something else entirely.

Per-player scoring starts with the cup after the one running on 2 Aug 2026:
older cups get one box a side — the team total, nobody's name on it — and hand
out no Boot and no Glove. The switch is `INDIV_FROM`, a cutoff against `cupId`,
which is the millisecond its cup was started at, so it needs no field in the
data and no migration. The rules sheet describes whichever mode is running.

The celebration overlay has a **Share** button that draws a 1200×1200 PNG of
the moment and hands it to the OS share sheet (or downloads it, on desktops
with no file sharing). It's drawn on a canvas rather than screenshotted, so
`drawCard()` and the overlay's CSS have to be kept in step by hand. Anyone
looking at the page can share any cup: the image is built locally and never
uploaded, so there is nothing to authorise.

Finished cups are archived: "Past Champions" opens a list of every previous
winner, readable by anyone, at any point in a tournament.

Tapping a row on the **Players** board opens that player's profile — their
badges, their career totals, and a cup-by-cup record. Every badge is on the
card, split into what they have won and what is **Still to win**, with a count
beside the heading — a flat grid mixes the two and reads as a list of failures,
where the second heading turns the same tiles into the things to go after.
The won half is a grid of tiles and the chase half is rows that spell their
descriptions out, which is where that text is most wanted. Neither hides
anything behind a hover, since a phone has none and cannot see a `title`: the
tiles put the tapped one's description in a fixed line under the grid. It has
to be a fixed line — growing a tile in place to hold the text repacks the grid
and every tile after it jumps. **Badges** is the third tab of the Hall and
describes every badge in one readable list.

Nothing but an archived cup ever moves a badge, so a cup being decided is the
only moment anything can change — which makes it the only moment worth
announcing, and the celebration overlay already fires in *every* viewer's
browser rather than only the admin's. It lists what the cup handed out, worked
out by running `career()` with and without that last entry: no seen-flag, no
stored field, and it clears itself when the next cup lands. Winning something
again is not news, so only a first time or a climb to a new tier is listed. The
same difference marks the tiles **NEW** on a profile, for whoever missed the
moment. The entry reaches `history` *after* the crowning starts, so
`renderNewBadges()` runs again from the history subscription — rendering it
once inside `celebrate()` would show an empty list to the admin who decided it.
`drawCard()` is untouched: the share PNG is about the champions. All of it
is worked out from `history` at render time, the way `bestRounds()` already
derives how far someone got — no stored field, no migration, and cups archived
years ago still count. That also fixes what a badge may ask: the archive holds
per-cup totals, so *won every match in a cup* is answerable for an entry saved
before badges existed and *scored three in one match* never will be, because no
entry carries the matches. **Nil** is the one exception and shows what it
costs: a match that finished 0 vanishes the moment the cup is added up, so
`rollupPlayers()` counts it while the matches are still there and archives it
as `nil` beside the totals. It therefore starts from the cup after it was
added, exactly like `g` did, and reads none for everything older. Forfeits are
excluded — the no-show ends on zero too, but nobody kept them out. It is also
the one badge flagged `bad`: it stays out of *Still to win* and out of the
count, because a list of things to go after must not invite anyone to lose
10-0. The **Win streak** counts cups won in a row in
calendar order, so a cup a player sat out is a cup they didn't win and it ends
the run. The tier thresholds in `TIERS` are guesses until somebody measures a
real season — retune that one table and nothing else moves. "How it works" in the
footer explains the format, the table, and the knockout — keep it in step with
`rank()` and `startKnockout()` if you change either.

## Challenges

Between cups there is the **Challenges** board: casual 2v2 pickup games that
count for nothing a cup counts. One player opens a lobby — their seat and a
kick-off time — and the other three seats fill from whoever sees it. Any of the
four then files the score. Cup titles, badges, the Golden Boot and the Players
board are untouched by all of it: nothing here ever writes to `history`.

It lives at `challenges/<id>`, where the id is `Date.now()`, the same
convention `cupId` uses:

```
by      the creator's email        playAt  kick-off, set by the creator
at      opened                     slots   bf / bd / rf / rd -> { name, email }
score   { b, r }, absent until played
```

There is no status field. An absent seat is an empty seat, an absent `score`
means the game hasn't been played, and the winner is `b > r`. Team score only —
one box a side, not the cup's forward/defender pair — which still gives the
winner, goal difference and the nils, with two numbers to agree on rather than
four. Draws are storable and get their own column; foosball to a target score
has none, but a timed lunch game does.

The ladder is **derived at render** from the finished lobbies, the way
`career()` derives everything from `history`. No rollup node, no stored totals,
no migration: correcting a mistyped score fixes the board immediately. `Nil`
counts the games a side was held to nothing — the same thing the cup's Nil
badge counts — and `Win %` scores a draw as half a win, so one 4-4 doesn't read
like one 0-5. Level players sort alphabetically, so the board never reorders
itself between two readers.

**Who you are is `EMAIL_NAMES` in `index.html`**, next to `ADMIN_EMAIL`. The
rules can only see an email address; the page is what turns one into a player.
An account that isn't in the map reads the board but can't sit down, and is
told to ask the admin — adding somebody is an edit to that map and a deploy,
the same cost as adding them to a cup. The admin plays like everybody else:
who may edit the cup and who is sitting at the table are different questions,
which is why the page tracks `acctEmail` alongside `isAdmin`.

The `challenges` rules are the one place a non-admin write is really enforced
rather than trusted. Anyone verified may create a lobby; only its creator or
the admin may delete one; a seat is writable only when it's empty or already
yours, and the row you write must carry your own `auth.token.email`. So nobody
sits down as somebody else and nobody is turfed out of their own seat. Filing
the score stays open to any verified account, because the rules can't tell who
the four players are — the UI shows the boxes to the lobby's four and the same
honour system the suggestion flow runs on covers the rest. Four people were
standing at the table.

Taking a seat is a **transaction**, not a `set`: two people tapping the last
one at the same moment would otherwise both be told they had it, and the second
write would quietly overwrite the first.

The board is three panes behind the same tab strip the Hall uses — **Open**,
**Ladder**, **Recent** — because stacked, the ladder sat below the fold behind
however many lobbies were open. Both cards scope their tab wiring to their own
id, or one strip drives the other.

**Share** on a lobby hands over an invitation, not a bare address: the link
`#c/<id>`, and a line saying how many seats are left and when it kicks off (or
naming the four, once it's full). To the OS share sheet where there is one, the
clipboard where there isn't. Text and url both travel, unlike the champions
card, which sends files alone — a link loses nothing to a target that posts only
one of the two, where the image share would have lost the image. Opening that
link lands on the Open pane with the lobby outlined, and waits for the boot gate
like everything else: sooner, it would show an empty board and fill it in a
second later.

Nobody holds two seats in one lobby: one person can't play both ends of a
table, and the ladder would count them twice in the same game. That one rule is
the page's rather than the database's — it guards against a mis-tap, not
against anybody malicious, since the seat being taken is empty and the write is
honestly the tapper's own.

Leaving is allowed until a score is filed and reopens the seat; the creator can
cancel at any point. A filed score can be corrected by the four or by the
admin, because mistyping 5-3 as 53 must not need a database console. A lobby
still unfilled six hours past its kick-off drops off the board, and the admin's
page is what actually deletes those rows — it holds the only account allowed to.

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

The `suggestions` and `challenges` nodes are writable by **any verified Google
account**, not just the admin — that's what lets players suggest scores and run
their own pickup games. They're separate nodes; `cup` and `history` still take
writes from the admin alone. If you want to narrow either to your own
organisation, add an email-domain check to that rule (e.g. `&&
auth.token.email.endsWith('@yourdomain.com')`).

`EMAIL_NAMES` in `index.html` is the third thing to keep in step: it maps an
address to the player it belongs to, and an account missing from it can read the
challenge board but not play. See [Challenges](#challenges).

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

Ten things reach a phone: a group match recorded, a knockout match decided, the
knockout opening, a champion crowned, a draft being scheduled, the draft falling
due, and a challenge opening, filling, being scored or kicking off. Suggestions
ping the admin alone.

Sending needs a service-account key, which can never live in a page — so the
page only *says what happened*. It writes a row to `/notify`, and a small
always-on process (`relay/relay.mjs`) holding the key reads the row, sends it,
and deletes it. It keeps an open Firebase listener rather than polling, so a
score reaches a phone in about a second, and it knows nothing about foosball:
all six messages are composed in `index.html`, next to the code that already
knew the match was over.

`/notify` is admin-writable only. That is why suggestions and challenges are
the two things the relay watches directly — opening the node to every signed-in
account would let any Google user push to every phone in the office.

A challenge announces itself three times — opened, all four seats gone, score
filed — and one `value` listener tells them apart by diffing against the last
snapshot. A full lobby also arms a kick-off reminder on the relay's own timer.
Whoever caused an announcement is left out of it: `recipients` takes an
`except` address, so nobody is pinged about their own tap. Kick-off times are
formatted in `OFFICE_TZ` at the top of `relay.mjs` (`Asia/Dhaka`), not the
host's clock — a VM that quietly sits on another timezone can't print the wrong
kick-off. Change that constant if the office moves.

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
Environment=TZ=Asia/Dhaka
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

Under it are the kinds — draw times, match results, cup milestones, challenges,
and score suggestions for the admin. Each `/notify` row carries its `kind`, each device
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

The relay check covers the decisions worth getting wrong: when a queued row
fires (an unscheduled row goes at once, a past time isn't a negative timeout, a
draft months out is clamped rather than fired immediately by `setTimeout`'s
overflow), who receives it (an admin-only ping reaching the admin's devices and
nothing else, and nobody hearing about their own tap), and which of a
challenge's three announcements a given snapshot diff is — including the ones
that must stay silent, since a lobby this process is meeting for the first time
already full is a restart, not news.

The challenge board is driven from a fixture with the writes stubbed, which is
what deriving the ladder at render time buys: the maths (draws, nils, and the
win%-then-games sort), the seats read as mine / theirs / empty from three
viewpoints, the score boxes reaching the lobby's four and nobody else, an
account off `EMAIL_NAMES` offered nothing, a stale lobby swept by the admin
alone, a shared `#c/<id>` link marking the right card, and the whole thing at
360px without pushing the page sideways.

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
