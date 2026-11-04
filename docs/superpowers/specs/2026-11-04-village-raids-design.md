# Village raids: defences, the Barracks and the raid

Pieces 2 and 3 of the village (see `2026-11-04-village-design.md`), designed as
one, because neither means anything without the other. Real wins earn raid
tickets. Coins train an army. You raid a colleague's village while they're
offline: you drop attackers round its edge and watch a 60-second fight. You
take coins from their Bank in proportion to the damage you do to it. Their
Cannon, Archer tower and walls are what stop you.

Decided: Clash-style base raids (not a phone mini-game). Two attackers and two
defences. Attackers are used up every raid. Loot comes from damage to the Bank,
up to half of it. A 12-hour peace shield and one raid per pair per day. Every
phone works the result out from the drops. You pick your target from a list,
and can look before you attack.

## Raid tickets

- **Each real challenge win that pays coins gives 1 raid ticket.** The test is
  the same one the wallet uses: a draw, a game past the daily limit, or a lobby
  that isn't four listed players gives nothing.
- **You hold at most 3.** A win while you hold 3 gives nothing more.
- **Starting a raid uses one**, whatever happens after.
- Only wins from `VILLAGE_FROM` count.

## New buildings

Placed on the grid like any other. They use the same build timers (level 1
at once, then 1, 3 and 8 hours) and the same single builder, and the
Clubhouse caps their levels as before.

| Building | Size | Job | L1 | L2 | L3 |
|---|---|---|---|---|---|
| **Barracks** | 3×3 | Trains the army. Its level sets how many it holds. Archers need level 2 | 25 → 10 troops | 60 → 15 | 140 → 20 |
| **Cannon** | 2×2 | Short range, heavy, slow | 20 | 50 | 120 |
| **Archer tower** | 2×2 | Long range, light, fast, shoots over walls | 30 | 70 | 150 |

- **How many:**

  | Building | First one | Second one |
  |---|---|---|
  | Cannon | at once | at Clubhouse level 3 |
  | Archer tower | at Clubhouse level 2 | at Clubhouse level 4 |
  | Barracks | at once | only ever one |

  A second Cannon or tower is its own building, with its own level.
- **Walls get health** by the Wall's level: 150, 300, 500 a piece.

## The army

| | Brawler | Archer |
|---|---|---|
| Trained in | batches of 5 | batches of 5 |
| Cost a batch | 2 coins | 3 coins |
| Time a batch | 2 min | 3 min |
| Health | 60 | 25 |
| Hit | 10 every 1.0 s, range 0.8 | 7 every 1.0 s, range 3 |
| Speed | 1.0 square/s | 1.2 squares/s |
| Goes for | nearest building; a wall in its way, it breaks | nearest building, over walls |

- **One batch trains at a time.** A batch that wouldn't fit in the Barracks
  can't be started.
- **The army waits in the Barracks** until a raid. **A dropped attacker is used
  up**, win or lose. Ones not dropped stay.

## Defences and building health

| | L1 | L2 | L3 |
|---|---|---|---|
| **Cannon**: range 4 squares, one shot every 1.5 s | hits 20, health 300 | 27, 400 | 36, 530 |
| **Archer tower**: range 6, one shot every 0.6 s | hits 6, health 250 | 8, 330 | 11, 440 |

A defence shoots the closest living attacker in range, and sticks with it
until it's down or out of range.

Health of everything else:

| Building | Health |
|---|---|
| Clubhouse | 600 |
| Bank | 400 |
| Gold mine, Stadium, Barracks | 300 |
| Old oak | 150 |
| Trophy hall, statues | 100 |

## Who can be raided

The Raid list shows everyone. You can raid someone who:

- isn't you;
- has no peace shield;
- you haven't raided today (local day);

as long as you hold a ticket and at least one trained attacker. Anyone you
can't raid is greyed out with the reason.

- **Peace shield:** 12 hours from the moment a raid on you starts. It ends early
  the moment you start a raid yourself.
- **Looking is free.** Tap a name to see their village as it stands, with
  "up to N coins": half of what's in their Bank, rounded down.

## The raid

- **Attack** writes the raid row and uses the ticket. The 60 seconds start then.
- **Dropping:** pick an attacker type, then tap the ground. A drop must be on
  the plot, at least 2 squares from every building and wall piece. Those cells
  are tinted red. Each drop is saved the moment it's made, so closing the app
  can't take a raid back.
- **It ends** at 60 seconds, when every building is destroyed, or when every
  attacker is down with none left to drop.
- **Loot** = floor(half the Bank's coins at the start × the share of the Bank's
  health knocked off), and never more than is still in the Bank when it
  settles. It goes into the attacker's balance.
- **Destruction** is the share of buildings destroyed, walls not counted.
  **Stars:** one at 50%, one for the Clubhouse, one at 100%.
- **The village is whole again straight after.** Only the coins are lost.

## How it's worked out

Every phone simulates the raid from the drops. The attacker's phone sends no
result, so there's none to fake.

### Rows in `spends`

| kind | fields | The walk accepts it when |
|---|---|---|
| `train` | `u`: `b` or `a` | There's a Barracks (level 2 for `a`), nothing training, room for 5, and the coins |
| `raid` | `on`: the victim's email | The player holds a ticket and a trained attacker, and the victim can be raided (above) |
| `drop` | `raid`: the raid row's id, `u`, `x` and `z` in tenths of a square, `t` in ms from the raid's start | The drop is the raid's attacker's, `t` is 0 to 60000, the row's `at` is within 90 s of the raid's, the cell is legal, and an attacker of that type is left |

### Layouts get a history

A raid has to replay on the layout as it was, so a layout save no longer
overwrites. `villages/<email with dots as commas>/saves/<push id>` =
`{ at: server time, layout, walls }`, only ever added to. The walk uses each
player's latest save at or before a time. Piece 1's single `layout` / `walls`
is local-only (it never shipped), so it simply moves under `saves`.

### The simulation, in `village.js`

- **Shared** by the page, the relay and the tests.
- **Ticks** are fixed 100 ms steps, 600 to a raid.
- **Arithmetic only:** `+ − × ÷` and `Math.sqrt`, which are exact the same
  everywhere. No randomness, no trigonometry. Ties break by a fixed order:
  building id, then the cell, then drop order.
- **Movement:** attackers move in straight lines to their target. A Brawler
  whose next step enters a wall piece attacks that piece instead.
- **Inputs:** the victim's levels and layout at the raid's start, and the
  drops. **Outputs:** the Bank's health lost, which buildings fell, the
  Clubhouse, the stars, and the attackers used.
- **The walk settles a raid** 90 s after it starts, the latest a drop can
  arrive. Results are cached by raid id: once settled, nothing about a raid
  can change.

### Pushes

The relay runs the same simulation when a raid settles. It sends the victim
"Sifat raided you, took 6 coins", which opens the replay.

## Screens

- **Village HUD:**
  - A red **Raid** button with the tickets shown as ●●○.
  - An army line beside the builder ("Army 10/15 · Archers 1:20").
  - A shield badge ("Shield 8h").
  - A **Raid log** button: raids made and raids suffered, each with **Replay**.
- **Barracks popup:** the army by type, **Train 5 Brawlers · 2**, **Train 5
  Archers · 3**, the batch in training with its countdown, and the upgrade row.
- **Raid list:** name, Clubhouse level, "up to N coins", or greyed with why.
- **Looking at a village:** their village in the 3D view; "Rafi's village · up
  to 9 coins"; **Attack** and **Back**.
- **The raid:**
  - Top: the countdown, destruction %, stars, and coins taken.
  - Bottom: attacker cards with counts, and the red no-drop cells.
  - Attackers are Kenney's soldier and archer figures. The Cannon fires
    cannonballs and the tower fires arrows.
  - Everything has a health bar. Destroyed buildings drop to rubble.
  - At the end: a popup with the stars, coins and destruction, and **Back home**.
- **Replay:** the same screen, playing by itself, with Skip. The push after
  being raided opens it, with **Raid back** (needs a ticket) and **Challenge at
  the table** (opens a real lobby against them).
- **No 3D:** training, the Raid log and losses still work; Raid says it needs 3D.
- **`?play` on localhost:** training batches take 10 seconds.

## Tests

- **`test.mjs`:**
  - Tickets: one per paying win, capped at 3.
  - Training: costs, one batch at a time, the cap, Archers needing level 2.
  - Who can be raided: tickets, the shield, raiding ending your own shield,
    once per pair per day, self.
  - Drops: their legality, late drops, a raid with no drops.
  - The simulation: two runs give identical results, and fixed layouts with
    fixed drops give known loot and stars.
  - Settling: loot capped by what's left in the Bank, attackers used up.
  - Layout history: a later save doesn't change an old raid.
- **`test-rules.mjs`:** `train`, `raid` and `drop` rows; `saves` only ever
  added to, and only by the owner.
- **`test-relay.mjs`:** the push after a raid, with the right coins.
