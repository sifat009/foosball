# The monthly track: a hill to climb

Coins come in from challenge wins, cups and the tree, and each of those pays
the same every time. Nothing says "do this next". The track does: ten stages a
month, one goal each. Clearing a stage pays a prize that grows as you climb and
opens the next stage, and everyone can see how far up everyone else is.

## The rule

On the 1st of every month (local time, like the tree's days) everyone is on
**stage 1** of that month's track. Each stage has one goal and one prize:

| Stage | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Prize | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 15 | 18 | 25 |

- **Clearing a stage** pays its prize at that moment and opens the next stage.
- **Only what happens after a stage opens counts toward it.** The game that
  clears stage 3 can't also count for stage 4.
- **Only a game the wallet counts can count here.** A draw, a game past the
  daily limit, or a lobby that isn't four different listed players counts for
  nothing. Losing a free game costs nothing, but it still counts as played.
- **Skip** costs the current stage's prize. The skipped stage pays nothing and
  the next one opens. So skipping effectively costs twice the prize; it's for
  players stuck on a slow goal, like a cup final in a week with few cups.
- **End of the month** drops whatever stage you were on. Coins already earned
  stay.
- The first track is **November 2026**. Nothing before 1 November counts.

Clearing all ten pays 106 a month, about an Old oak's month. Most players are
expected to clear four to six stages, for 20 to 40.

## The goals

Every goal is read from data the walk already has. Each goal belongs to a tier,
and a month's track is **3 easy (stages 1–3), 4 medium (4–7), 3 hard (8–10)**.

| Tier | Goal | Counts |
|---|---|---|
| Easy | Win a challenge | 1 win |
| Easy | Play 3 challenges | 3 games won or lost |
| Easy | Water your tree 3 times | 3 waterings |
| Easy | Gift someone a coin | 1 gift |
| Easy | Place a side bet | 1 side bet placed |
| Medium | Win 3 challenges | 3 wins |
| Medium | Win a challenge to nil | 1 win to nil |
| Medium | Win with 2 different partners | 2 partners |
| Medium | Win a side bet | 1 side bet won |
| Medium | Win a challenge played for a bet | 1 win where the bet was paid |
| Medium | Water your tree 5 times | 5 waterings |
| Medium | Collect from your tree 3 times | 3 collects |
| Hard | Win 5 challenges | 5 wins |
| Hard | Win with 3 different partners | 3 partners |
| Hard | Make a cup final | 1 cup as champion or runner-up |
| Hard | Win a cup award | 1 Golden Boot or Golden Glove |
| Hard | Beat a bounty target | 1 bounty share |
| Hard | Grow your tree a stage | 1 grow |
| Hard | Win 2 challenges to nil | 2 wins to nil |

A gift, watering, collect, grow or side bet only counts if the walk actually
let it through. A row refused for lack of coins buys nothing here either. A cup
final and a cup award count on the history entries that pay cup prizes, the ones
carrying `runnerUp`.

**The pool only grows at the end.** A month's track is drawn from the pool's
order, so reordering it or removing a goal would quietly change every past
month's track and the prizes already paid. Goals are never removed or
reordered. A new one goes on the end with `from`, the first month it may be
drawn in, so months before it shuffle exactly as they did.

## The month's track

`trackOf(month)` shuffles each tier with a small seeded generator (mulberry32,
seeded with `year * 12 + month`) and takes the first 3 easy, 4 medium and 3 hard
goals. Every phone draws the same track for the same month, and nothing is
stored.

## How it's worked out

Inside `coinWalk`, the same way wallets are. No node and no stored progress, so
a corrected score corrects everyone's stage and prizes immediately.

The walk already goes through every event in time order. It keeps
`track[player] = { month, stage, from, count, partners }`:

- After each event, the walk turns it into facts per player: won (with partner,
  nil, bet paid), played, watered, collected, grew, gifted, side bet placed,
  side bet won, bounty share, cup final, cup award.
- A fact for a month that isn't `track[player].month` first resets the player
  to stage 1 of that month, with `from` at the month's start.
- A fact moves the current goal on only if its time is at or after `from`.
  Partners are a set, so winning twice with the same partner counts once.
- When `count` reaches the goal's number: `move(player, prize, 'Stage N
  cleared', t)`, the stage goes up by one, `from = t`, `count = 0`, and the
  partners set is emptied. The event that cleared a stage is not looked at
  again, so it can't count toward the next one.
- After stage 10 the player is done for the month and nothing more counts.

The walk returns `track`. The page reads a player's current stage from it, and
treats anyone whose `month` isn't this month as on stage 1.

### Skip

A new kind of spend row: `{ kind: 'skip', by, at }`, with no other fields.
There's no stage on the row; it always skips whatever stage the player is on at
`at`. The walk honours it only when the player is on stage 1–10 of this month
and holds that stage's prize. Then it does `move(player, -prize, 'Skipped stage
N', at)` and opens the next stage, exactly as clearing would, but with no
prize. Otherwise it's refused and the History tab shows it greyed out, like any
other spend that didn't go through.

The rules add `skip` to the accepted `kind` values. A `skip` carries none of
`item`, `to`, `amt`, `game`, `cup`, `team` or `side`.

## Page

The coins sheet gets a fourth tab: **Earn & bet · Spend · History · Track**.

The Track tab is a hill (design D1 from the mockups):

- "November track" and how many days are left.
- A small landscape with a sandy trail climbing to a trophy at the top, and the
  four tree pictures (`icons/tree/`) along the way, sapling at the bottom and oak
  near the top.
- Ten stops at fixed spots, with the trail drawn through them (Catmull-Rom curve).
  Cleared stops are gold coins with a check, the reader's stop is a green stone
  that gently bobs (no bob with reduced motion), and later stops are white
  stones. Each stop shows its prize in a tag beside it.
- Players' initials sit above the stop they're on. Initials are the first two
  letters of the first name. When two players would share them, each uses its
  first letter and the first letter that tells them apart: Sifat and Siddiq are
  Sf and Sd, Sajeeb and Sazedul are Sj and Sz. A stop shows three at most, yours
  first, and the rest as a count ("+8").
- Tapping a stop shows that stage in a card under the hill: its goal, its prize,
  and the full names of who's on it. On your own stage the card shows progress
  ("1 of 3"), and **Skip · N**, greyed out if you can't afford it. On a cleared
  stage it says what you collected; on a later stage, "Opens when you clear
  stage N".
- The card opens on your own stage. Signed out, the hill and everyone's places
  still show, with no "you" and no Skip.
- Before 1 November the tab shows November's hill with everyone at the foot,
  "Opens in N days", and no Skip.

Nobody's coins are shown, only stages, the same rule the coin pill follows.

## Not doing

- No push notification for clearing a stage. The History line and the hill
  already say it.
- No record of past months. A month's track and results can be worked out again
  from the data if one is ever wanted.
- No admin control over the goals. The pool and the shuffle choose them.

## Test

- `coinWalk` (`test.mjs`):
  - Clearing a stage pays its prize and opens the next.
  - A win before a stage opened doesn't count toward it.
  - One win can't clear two stages.
  - "Different partners" counts a repeat partner once.
  - A new month puts the player back on stage 1.
  - A draw counts for nothing.
  - Nothing before November 2026 counts.
  - A skip goes through with enough coins and is refused without.
  - A skip is refused after stage 10.
- `trackOf` (`test.mjs`): the same month always gives the same track; each
  track is 3 easy, 4 medium and 3 hard with no repeats; months differ.
- Page (`test.mjs`): the Track tab draws ten stops.
- Rules (`test-rules.mjs`): a `skip` row with only `by`, `at` and `kind` is
  accepted, and one carrying `amt` is refused.
