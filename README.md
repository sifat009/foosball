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
count for nothing a cup counts. One player opens a lobby by taking a seat, and
the other three fill from whoever sees it. There is no kick-off time: people
play when they play. Any of the four then taps which side won, and somebody
from the other side of the table has to agree to it. Cup titles, badges, the Golden Boot and the Players board are
untouched by all of it: nothing here ever writes to `history`.

It lives at `challenges/<id>`, where the id is `Date.now()`, the same
convention `cupId` uses:

```
by      the creator's email        slots   bf / bd / rf / rd -> { name, email }
at      opened; a lobby nobody filled ages out a day later
stake   coins bet a head, absent means none; fixed when the lobby is opened
score   { b, r, at }, the agreed result, absent until both sides have agreed
pending { b, r, by, side, at }, a claim in flight, absent the rest of the time
```

There is no status field. An absent seat is an empty seat, an absent `score`
means nobody has agreed a result yet, and the winner is `b > r`.

`b` and `r` are **1 and 0**, not goals. The card asks which side won and nothing
else: a lunch game has no referee, two people remember the figure differently,
and every digit of it was a chance to mistype something the other side then had
to squint at. One of two buttons is a question the four of them can always
answer. The pair stays numeric rather than becoming a `winner` field so that the
rules, `coins()` and the rows already filed all carry on as they
were — nothing below this line learned that the boxes went away. Rows filed while
there were boxes keep their real score, which is why a draw is still storable and
still worth half a win; nothing filed since can add another one.

### Two people, not one

A result is two people agreeing, so it lands in two steps. One of the four files
a claim into `pending`; somebody sitting on the **other** side turns it into
`score`, in one update that writes the result and clears the claim together.
Nothing ratifies a claim by silence — there is no timer that lets a wrong result
through while nobody is looking — so a lobby with a claim on it stays on the
board however stale it gets, and the two opponents (and the admin, as the
fallback) get the ping.

Rejecting and withdrawing are the same write: the claim goes and both buttons
reopen. A tap files with nothing in the way — no hold, no second confirm — because
the claim is the confirm: it cannot settle anything on its own, and **Withdraw**
on the card is the undo for whoever sent it. Tapping the other side over a
standing claim replaces it, so a counter-offer and a rejection-then-refile are
one gesture; the side already filed is not a button, since re-filing what is
standing is not a correction. Correcting a settled result is the same path again
— **Wrong winner?** on the Recent pane, worded rather than tappable-by-accident
because that pane is a list somebody scrolls, and the recorded result stands
until the other side confirms the new one.

The rules are what enforce all of this, not the page: see
`database.rules.json`, where a claim may only be filed by a seated player from
the seat they actually hold, a `score` write must match a standing claim filed
by somebody else on the other side, the admin can settle anybody's claim but
their own, the fourth player to sit down freezes the line-up, and a lobby can
never be created with a result already on it. `test-rules.mjs` covers each of
those against the emulator.

**There is no ladder.** There was one — `P W L Win %`, derived at render from
the finished lobbies — and it went when coins became spendable here. It measured
form, and the wallet measures the same wins already, priced. Two boards ranking
the same ten people on the same games is one board too many, and the one that
goes is the one that is only ever read. The `GF`, `GA` and `Nil` columns had
already gone with the score boxes; `Win %`'s half-a-win for a draw was the last
thing a draw was for.

**Who you are is `EMAIL_NAMES` in `index.html`**, next to `ADMIN_EMAIL`. The
rules can only see an email address; the page is what turns one into a player.
An account that isn't in the map reads the board but can't sit down, and is
told to ask the admin — adding somebody is an edit to that map and a deploy,
the same cost as adding them to a cup. The admin plays like everybody else:
who may edit the cup and who is sitting at the table are different questions,
which is why the page tracks `acctEmail` alongside `isAdmin`.

Signing in asks for a **name, not an address**. Most people carry several Gmail
accounts, and Google's popup hands back whichever one the browser is already
in — so somebody would sign in as nobody, and the seat they tapped went nowhere.
Tapping Sign in (or an empty seat) opens a grid built from `EMAIL_NAMES`, one
tile per player; the tile passes that player's address to Google as a
`login_hint`, which opens straight on it. It is a hint and not a filter: if they
aren't signed into that account Google still asks, and an address off the map
still lands on the same "ask the admin" line. Somebody with two addresses in the
map gets one tile, hinting the first — the map is many-to-one by name.

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

The board is two panes behind the same tab strip the Hall uses — **Open** and
**Recent** — because stacked, the results sat below the fold behind however many
lobbies were open. There were three until the ladder went. Both cards scope
their tab wiring to their own id, or one strip drives the other.

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
table, and the wallet would pay them twice for the same game. That one rule is
the page's rather than the database's — it guards against a mis-tap, not
against anybody malicious, since the seat being taken is empty and the write is
honestly the tapper's own.

Leaving is allowed only while the lobby is short of four. The fourth player
closes it: the game gets played long before anybody files the score, and a seat
emptied in between takes the lobby back under four and the score boxes away with
it. If the four are wrong, the creator or the admin cancels the lobby — and the
admin can free a single seat, the one exception the rules keep. A filed score
can be corrected by the four or by the admin, because mistyping 5-3 as 53 must
not need a database console. A lobby still unfilled a day after it was opened
drops off the board, and the admin's page is what actually deletes those rows —
it holds the only account allowed to.

## Coins

The challenge board shipped and sat at zero. Not a handful of stale lobbies —
`challenges.json` held nothing, nine days in, while seventeen cups ran in
forty-six days at near-perfect attendance. It was never access, plumbing or
discovery: all ten players are in `EMAIL_NAMES`, the rules are enforced and
tested, the relay announces a lobby three times, and `chalBtn` carries a badge.
It was that the section above says out loud what a pickup game is worth —
*"count for nothing a cup counts"* — two days before a cup that counts for
everything.

So a challenge win pays. **Two coins** to each player on the winning side of a
settled score; a draw, a loss and an unconfirmed claim pay nothing.

Coins stay on the challenge board. They buy nothing in the Cup — not a draw, not
a match, not a title. A re-spin at the draft and a freeze on a match card were
both built and taken out again: the draw lands a team the moment the wheels stop.

### Betting them back

Two coins for a win and nowhere to spend them is half a loop: the
people playing pickup games earn the coin and never see it do anything, and the
board that mints it is the one board it buys nothing on. So a lobby is opened
**for** an amount — nothing, 2, 5, 10, or anything up to fifty typed in — and
every seat at it agrees to that by being taken.

A game played for a bet pays the bet **instead of** the two, not on top of it:
each winner takes it, each loser pays it, and the four of them net to nothing.
Which means coins only ever enter the world through a game played for nothing,
and that is the point of keeping those — somebody who has bet themselves down to
nothing can still play, still win, and still climb back to where they can bet
again. A board where the broke have nothing to do is a board they stop opening.

**A game won to nil pays double**, and costs double. Free: each winner +4, each
loser −2. For a bet of N: each winner +2N, each loser −2N. No balance goes below
zero, and the winners are paid in full even when a loser can't cover it — the
shortfall is minted, so a nil always pays what it says. A bet the losers can't
cover even once still falls back to paying as a free game, nil rules included.
A result is filed as 1-0, so the loser is always on nought and the score cannot
say it. Nil is a **To nil** box ticked on the claim instead: it travels as
`nil: true` in `pending`, the rules only let the confirm copy it across to
`score` unchanged, and the other side is agreeing to it when they confirm. No
row filed before the box carries it, so no old game is re-paid.

The bet is fixed when the lobby is opened and never moves: three people sit down
on the strength of the number, so it may not change under them. That much the
rules can hold, and do — `stake` is a whole number of coins inside the ceiling,
and no `.write` rule grants it after the row exists.

### Who may sit at a ten-coin table

The rules cannot count coins. A balance is every row in `challenges` walked in
order, and rules have no loop and no sum — they can read
a number somebody stored, and nothing here stores one. So the gate is the page's,
the way *nobody holds two seats in one lobby* already is, and the replay is what
makes it safe to leave it there: **sitting at a table you cannot cover does not
pay you the bet.** There is nothing to steal, only a game to spoil, and the page
refuses the seat with the reason printed on the card rather than going quiet.

**Coins already on a table do not count.** A seat in a game nobody has agreed yet
is spent until it settles, so three ten-coin seats need thirty. Without that one
rule the same ten could be bet at three tables at once, only the first could be
paid, and the other two would quietly pay out two instead — which needed a
warning strip on the card, a downgraded row in Recent, and a paragraph here
explaining both. Closing the hole deleted all three. `chalHeld` is the whole of
it, and `chalFree` is worked out once a render because the balance is the entire
ledger walked and four seats on a card would otherwise ask for it four times.

A bet the losers cannot cover is still not honoured, because a corrected result
can move somebody onto the losing side of a game they have since spent the coins
from. It falls back to paying the winners the usual two — written, ignored,
charged nothing.

**The coins move when both sides agree the result**, not when anybody sits down,
which is why `score` carries an `at` of its own. It is the only honest moment:
the lobby's `at` is when somebody opened it, and a game opened on Monday and
agreed on Tuesday was not paid for on Monday. `chalConfirm` stamps it in the same
update that writes the result and clears the claim, and a correction re-stamps —
a result put right moves the coins when the new one was agreed, not the wrong one.

### Balances

Derived at render, never stored, the way `career()` already
works: `2 x wins at nothing + bets won - bets lost`. Flipping a wrongly filed challenge winner
corrects every wallet in the building at once, with nothing to migrate.

The walk is chronological rather than two sums: a bet can only be paid out of coins its losers hold
at the moment they agreed to have lost. A game lands at `chalAt` — its `score.at`
where it has one, and its lobby's `at` for every row filed before the bet
existed, which is the whole of the migration.

### Where it lives

A **pill in the eyebrow**, beside the federation badge: a coin, a number, and a
green plus that means "get more" — which here is the challenge board. It rides in
the chrome above every screen rather than inside one, because the wallet belongs
to whoever is reading, not to whatever the cup is doing.

It replaced a full-width card that listed every player and their balance. Two
things were wrong with it. It said far more than a balance ever needs to — a
number is a glance, and what it buys is one tap away in the sheet. And it was a
leaderboard, which was the intent (seeing somebody else on ten is what makes a
coin worth having) but it also told the room what everyone could afford, and a
wallet is the reader's own business. The challenge ladder went the same way, in
the end, and for a related reason: what it measured, the wallet measures already.

Signed out the pill shows a dash and still says what a coin is, which is the only
pitch the board has ever had. Tapping it opens the sheet that explains the two
rules and ends in a button straight to the challenge board — that button is the
point of the surface.

The coin is drawn, not an icon: the sheet has no coin in it, and a disc with a
rim and a highlight is three gradients. Note that `.eyebrow > span` is scoped to
the direct child on purpose — the badge's padding and letter-spacing would
otherwise land on the pill's own spans and flatten it.

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

A challenge announces itself three times — opened, all four seats gone, result
filed — and one `value` listener tells them apart by diffing against the last
snapshot. Whoever caused an announcement is left out of it: `recipients` takes
an `except` address, so nobody is pinged about their own tap.

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
firebase emulators:exec --only database "node test-rules.mjs"
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
what deriving everything at render time buys: the seats read as mine / theirs /
empty from three viewpoints, the score boxes reaching the lobby's four and nobody else, an
account off `EMAIL_NAMES` offered nothing, a stale lobby swept by the admin
alone, a shared `#c/<id>` link marking the right card, and the whole thing at
360px without pushing the page sideways. Filing a score is covered as what it
is — a claim, not a result — along with the bar each of the five viewpoints
gets (filer, teammate, opponent, admin, bystander), the counter-offer, the
correction, and a claim keeping a stale lobby on the board.

Coins are checked the same way, and for the same reason: nothing is stored, so
the derivation is driven directly. Two wins pay four, a draw and an unconfirmed
claim pay nothing.

The bet gets the same treatment on both halves. The walk: a bet moves four coins
across the table and creates none, a bet the losers cannot cover falls back to
the usual two and charges nobody, a drawn bet moves nothing, a row with no
`stake` is a game played for nothing, and a lobby opened before anybody could
cover it but agreed long after they could is settled on **when they agreed** —
that last one is the whole of why `score` carries an `at`, and on the lobby's own
time it would come out the other way. What a row is worth is clamped rather than
trusted, since a number reaching the walk decides what other people are paid.
Then the board: the strip says what a game is worth before anybody sits at it, a
game played for nothing says the loser keeps theirs, a seat nobody can cover is
not a button and carries its reason, somebody with nothing is still offered every
game that costs nothing, and one ten is good for exactly one ten-coin table —
taking the second seat is refused while the first is unsettled. The pill is checked for the two things it
must not do — hide itself from somebody with nothing, and show one reader
another player's balance — along with its place above every screen and the
sheet's button actually opening the board.

The draft is checked for what it no longer does: a landing becomes a team a beat
after the wheels stop even when the pair holds coins, and neither the Cup rules
nor the coins sheet offers a way to spend them there.

`test-rules.mjs` is the only check that evaluates a rule: `test.mjs` stubs the
database out, so nothing there ever reaches one, and the rules are what
actually stop a challenge result being whatever the last person tapped. A lobby's bet is held there as well: a whole number of coins inside
the ceiling, and the suite tries to move it and to take it off after the fact, as
the creator and as the admin, since three people sat down on the strength of it.
A result carrying no time is refused, because a bet cannot be settled against one.
It talks
to the database emulator over REST with hand-made tokens — the emulator does
not check a signature, so there is no key, no service account and nothing to
install beyond `firebase-tools`.

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
