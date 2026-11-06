# Penalty duel

A small 1v1 game in place of the village (parked on branch `village`). You post
a duel with a stake, the first colleague to join plays you, and the two of you
take penalties live, one kick at a time. A duel takes about two minutes. It is
pure luck, so nobody plays more than five a day.

This replaces the first version, where you challenged a named player and aimed
all five kicks in advance.

## How a duel goes

1. **Post.** From **+ Penalty duel**, pick a stake: 2, 5 or 10, or type any
   amount up to 50, the same as a challenge lobby. The stake leaves your coins
   now. You can have one open post at a time and take it back, for all your
   coins, until somebody joins.
2. **Share.** The post has a **Share** button, like a lobby. It uses the share
   sheet on a phone and copies the link on a computer. The link `#d/<id>` opens
   the duel with Join ready, asking a signed-out reader to sign in first.
   Text: "Penalty duel for 20 coins. First to join plays me."
3. **Join.** Anyone else taps **Join** on the board or from the link. Their
   stake goes in.
   - The poster gets a push: "Rashed joined your 20-coin duel. Play now".
   - The joiner sees "Waiting for Sifat…".
   - If the poster hasn't opened the duel within 3 minutes, the join is undone:
     the joiner's stake comes back and the post is open again.
4. **Play.** It starts when the poster opens it, since the joiner is already
   there. Kicks alternate, the poster's first. For each kick:
   - Both players see a 10-second ring. The shooter taps Left, Middle or Right
     and the keeper taps Left, Stay or Right, at the same time.
   - When both picks are in, both are opened and the kick plays out as GOAL! or
     SAVED!.
   - If your ring runs out while you're on the screen, your phone picks a
     random side for you.
5. **End.** Five kicks each, and the most goals wins. Level after five means
   sudden death, scored by whole rounds, up to ten kicks each. Still level after
   ten is a draw, and both stakes come back.

## Scoring

A dive on the kick's side is a save, and anything else is a goal. Stay covers
only Middle.

## Sealed picks

The database can be read by anyone, so a pick written in plain text would reach
the other phone before the other player picks. Each pick is sealed in two steps
instead:

- **Seal:** the phone saves `SHA-256(pick + salt)`, where the salt is 16 random
  bytes that stay on the phone. Nobody can read the pick from the seal.
- **Open:** once both seals are in, each phone saves its pick and salt. Anyone
  can check them against the seal.

An opened pick that doesn't match its seal counts as a missed move. `duel.js`
has a small synchronous SHA-256 so that the page, the relay and the tests all
check picks the same way. The salt is kept in `sessionStorage` until the pick
is opened, so a reload in the middle of a kick doesn't lose it.

## Leaving mid-game

- Each kick opens at a server time: the start for the first kick, and the
  moment the previous kick settled for the rest.
- A player with no seal 15 s after the kick opens, or no opened pick 15 s after
  both seals, has missed that move.
  - The ring on screen shows 10 seconds after the previous kick's 2.5-second
    animation, so the 15 s leaves room for the network.
  - Nobody writes a miss down: `duel.js` reads it from the times.
  - A missed kick counts as saved, and a missed dive as a goal.
- Three missed moves in a row forfeits the duel, and the other player wins the
  pot.
- If both sides miss three in a row, because both left, the duel stops and
  both stakes come back.

## Daily limit

You can play 5 duels a day, local day as the challenges count it. Only duels
that started (joined, poster showed up) count: a post nobody joined, a join that
was undone, and a post taken back don't. The board blocks Post and Join at 5.
The rules can't count, so the walk voids a sixth duel started the same day and
hands both stakes back.

## Coins

The winner takes both stakes, so a 20-coin duel pays 40. Coins only move
between the two players, so there is no daily coin cap. The walk (`coinWalk`)
does the bookkeeping:

- It takes the poster's stake at `at` and the joiner's at `bAt`.
- It hands the joiner's stake back when a join is undone, and the poster's when
  a post is taken back.
- It pays out when the last kick is opened. A draw, a lapse or a sixth duel of
  the day sends both stakes back.
- If either player couldn't cover their stake when it was taken, the duel is
  void and whatever was taken comes back.

History lines:

- "Penalty duel: your 20 stake"
- "Won penalties vs Rashed 3–2: +40"
- "Lost penalties vs Rashed 2–3" (a 0 line)
- "Your 20 back: drawn" / "nobody joined" / "Sifat didn't show" / "it stopped"
  / "6th duel today"

## Data

There is one row per duel in `/duels/<push id>`:

| Field | Meaning |
|---|---|
| `a`, `an` | the poster's email and name |
| `stake` | coins each, 1–50 |
| `at` | when it was posted (server time) |
| `b`, `bn`, `bAt` | the joiner, their name and when they joined (server time) |
| `go` | when the poster opened it, which starts kick 0 (server time) |
| `k/<n>` | kick `n`: even is the poster shooting, odd the joiner |
| `k/<n>/as`, `bs` | each side's seal and its server time, `{ v, t }` |
| `k/<n>/ap`, `bp` | each side's opened pick and salt and its time, `{ v: "L:9f…", t }` |

`duel.js` works out the score, whose move it is, the end and a forfeit from
this row and the clock. The page reads the server's clock through Firebase's
offset.

The rules:

- Only the poster can create a duel, as themselves, with a stake of 1–50.
- Anyone else can join an open duel, once, as themselves.
- `b` can be cleared by anyone once `bAt` is 3 minutes old with no `go`.
- Only the poster can set `go`, once, after a join.
- Each side writes only its own seal and pick: a seal once, a pick once and
  only after both seals are in.
- The poster can delete the row before anyone joins.

## Screens

- **The Games sheet** (was Challenges) has two tabs at the top, **Challenges**
  and **Penalties**, so neither game pushes the other down.
  - Challenges is the board as before.
  - Each tab has a red count: open lobbies, and duels waiting on you plus
    others' open duels.
  - The sheet remembers the last tab. A challenge link opens Challenges, and a
    duel that needs you (someone joined yours) switches to Penalties.
- **The Penalties tab**, tickets:
  - A line: "Pure luck, played live · 2 of 5 today".
  - Your live or joined duel on top, yellow, with **Play now** (or "Waiting
    for Sifat" if you joined and they haven't come).
  - **Post a duel**, a dashed box: stake chips 2, 5, 10, 20, 50 and **Other**,
    which turns into a number field for any whole amount from 1 to 50. The
    button reads "Post for 15 coins · winner takes 30", or is disabled with the
    reason under it ("Pick 1 to 50 coins.", "You need 15 coins.", "Finish the
    duel you're in first.").
  - **Open now**: everyone else's duels as tickets (who, when, stake, what the
    winner takes, **Join**). Yours is a blue ticket with **Share** and **Take
    back**.
  - **Recent**: your results from the last two days.
  - The Games button's badge counts open lobbies and duels waiting on you.
- **The duel (`duel-view.js`):** a front-on goal at night (floodlights, a
  blurred crowd, a hexagon net) and a realistic keeper: `models/keeper.glb`,
  Mixamo's "Shannon" with four motions (idle, a dive each way, a high catch),
  about 3 MB, loaded only when a duel opens.
  - The keeper's kit is the colour of whoever is in goal: blue when it's you,
    red when it's them.
  - Shooting, you tap one of three see-through balls on the goal (left,
    middle, right). In goal, Left / Stay / Right buttons.
  - The keeper's save is timed so he is mid-dive as the ball arrives.
  - Both players get the three buttons with a 10-second ring.
  - The score dots sit at the top.
  - Each kick ends with a GOAL!/SAVED! banner.
  - The result card has **Post again**.
- **How to play** (first time and the ? button), rewritten:
  1. Post a duel with a stake, or join one.
  2. Take turns: one shoots, one dives, both pick at once in 10 seconds.
  3. Five kicks each, and the most goals takes both stakes.
  - It also says: 5 duels a day.

## Pushes

The relay sends three, each opening the duel itself (`#d/<id>`):

- **A new post**, to everyone who could join it: "Sifat posted a 10-coin
  penalty duel. First to join plays".
  - It skips the poster, anyone already in a duel, and anyone who has played
    their 5 today.
  - Nobody gets more than one of these every 30 minutes.
  - It has its own switch in Notifications, **New penalty duels**, on unless
    turned off.
- **Somebody joined**, to the poster: "Rashed joined your 10-coin duel. Play
  now".
- **The poster showed up**, to the joiner, who may have left the waiting
  screen: "Sifat is ready. Your duel starts now".

Tapping a push while the app is already open sends it to the duel. The
messaging worker passes the link to the page, which opens it.

## Limits

- **Picking late:** a player can wait until the last second, but sealed picks
  mean waiting shows them nothing.
- **Bending luck:** someone could script their own random picks. It's still a
  guess against a sealed pick, so this gives no edge.
- **Closing mid-kick:** a reload keeps the salt, but closing the tab between
  sealing and opening loses it, so that pick can't be opened and counts as a
  miss.
