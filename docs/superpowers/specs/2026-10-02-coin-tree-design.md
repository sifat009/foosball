# A coin tree

A player who has lost a few games ends up on nought and can't sit at a bet
table. Coins also need more to be spent on. A tree does both: it is cheap to
plant, pays a little every day it is watered, and costs coins to grow and to
keep alive.

## The tree

One tree per player.

| Stage      | Cost to reach it | Collected a day  | Net per day |
|------------|------------------|------------------|-------------|
| Sapling    | 10 to plant      | 2                | 0           |
| Young tree | 25               | 3                | +1          |
| Tree       | 50               | 5                | +3          |
| Old oak    | 100              | 7                | +5          |

- **Weekends don't exist for a tree.** On Saturday and Sunday it can't be
  planted, watered or grown, it pays nothing, and it can't be missed.
- **Water** costs 2, paid up front, once per weekday. A player who can't pay
  the 2 can't water: they win a challenge first. A second water that day buys
  nothing.
- **Collect.** Watering grows the day's coins on the tree. They ripen 3 hours
  after watering, but never later than 9pm, so an evening water still has a
  window. Collect pays the yield of the stage the tree was at when it was
  watered, once. Coins not collected by midnight drop off and are lost.
- **Plant** costs 10 and needs no living tree. Planting counts as that day's
  watering for neglect and for growing, but grows no coins: there is no harvest
  on the day you plant.
- **Grow** costs the next stage's price. It needs a living tree that is not an
  oak and that has been watered today, so growing can't hide a neglected tree.
- **Neglect:** every three whole weekdays in a row without water drops one
  stage, and what was paid for that stage is lost. A sapling that drops dies,
  and the plot is empty until you plant again. Watering stops the fall at
  whatever stage the tree has reached.

Example: watered Monday and then left alone. Tuesday, Wednesday and Thursday are
missed, so on Friday it is one stage down. Friday, Monday and Tuesday are
missed next, so on the following Wednesday it is two stages down. Watered on a
Friday, the tree is safe until the next Thursday.

## How it's worked out

These are four new kinds of row in `spends`, with no new node and no stored
tree:

- `plant`, `grow`, `water` and `collect` each carry only `by`, `at` and `kind`. The
  stage that `grow` buys is the tree's next one, read from the walk rather than
  from the row.

`coinWalk` keeps `trees[player] = { stage, day, ripe, pay, got }`, where `day` is
the last day the tree was watered (or planted), `ripe` is when that day's coins
ripen (none on a planting day), `pay` is what they are worth, and `got` says
they've been collected, in the same local-date days the daily five uses.
The effective stage on any day `D` is `stage - floor(missed / 3)`, where
`missed` is the number of whole weekdays (Monday to Friday) between `day` and `D`. Below the sapling,
the tree is dead. This is worked out before every plant, grow and water, and at
`now` for display. Watering sets `stage` to the effective stage and `day` to
today.

Like any spend, a row that can't be honoured buys nothing and costs nothing:
planting over a living tree, growing an unwatered tree or an oak, watering a
dead or missing tree, watering twice in a day or without the 2, growing
without the price, collecting before the coins ripen, on another day, or twice,
or any of the four on a Saturday or Sunday.
`ok` carries the rows that went through, and the walk returns `trees` so the
page can read them.

The rules accept `plant`, `grow`, `water` and `collect` in `kind`, with none of `item`,
`to` or `amt`.

## Page

On the coins sheet, under "You have N coins", the tree shows its picture, its
stage, whether it is watered today, and one button that follows its state:

- **Plant · 10** when there is no tree
- **Water · 2** when it is not watered today, greyed out without 2 to spend
- once watered, "Coins ripen at 13:20" until they do, then **Collect · +yield**,
  with the coins hanging on the tree's picture
- **Grow · price** once it is watered today and nothing is waiting to be
  collected, if there is a next stage

On a weekend there's no button, just "Resting till Monday", and no dot on the
pill.

Each stage has its own picture, and the empty plot has one too. Until the
tree is watered, its leaves look dry: the oak uses its own autumn picture, and
the other stages use their usual picture with a brown filter. The pictures grow
with the stage, so the oak always reads as the biggest.

A line under it says three weekdays without water drops a stage. The coins pill
shows a dot while the day's watering is still waiting, or while ripe coins are
waiting to be collected. There's no new item on
the Spend shelf, because the tree lives with the balance.

## Pictures

Six transparent PNGs in `icons/tree/`, at most 256 pixels on a side: `none`,
`sapling`, `young`, `tree`, `oak` and `dry`. They are plain files the page
loads, and the service worker caches nothing, so there's nothing to register.

## Not doing

- More than one tree. Several oaks would let the richest players outbet everyone.
- Anything past the oak. +5 a day is the reward; add an endgame if people reach it.
- Disasters (a storm that must be paid off). They can be added later as a
  hashed-day event in the walk without changing these rules.

## Test

In `test.mjs`, `coinWalk`:
- a second water that day buys nothing
- three missed days drop one stage, and nine drop three
- a weekend is not missed: watered Friday, still the same stage on Wednesday
- a water, plant or grow on a Saturday or Sunday buys nothing
- a neglected sapling dies, and you can plant again
- planting over a living tree buys nothing
- growing an unwatered tree buys nothing

- watering without 2 to spend buys nothing
- collecting before the coins ripen, on the next day, or twice buys nothing;
  collecting ripe coins pays the stage's yield
- an evening water ripens by 9pm
- a planting day has nothing to collect

In `test-rules.mjs`: `plant`, `grow`, `water` and `collect` are accepted, and an unknown
kind is still refused.
