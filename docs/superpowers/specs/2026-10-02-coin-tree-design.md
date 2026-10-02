# A coin tree

A player who has lost a few games ends up on nought and can't sit at a bet
table. Coins also need more to be spent on. A tree does both: it is cheap to
plant, pays a little every day it is watered, and costs coins to grow and to
keep alive.

## The tree

One tree per player.

| Stage      | Cost to reach it | Paid on watering | Net per day |
|------------|------------------|------------------|-------------|
| Sapling    | 10 to plant      | 2                | 0           |
| Young tree | 25               | 3                | +1          |
| Tree       | 50               | 5                | +3          |
| Old oak    | 100              | 7                | +5          |

- **Weekends don't exist for a tree.** On Saturday and Sunday it can't be
  planted, watered or grown, it pays nothing, and it can't be missed.
- **Water** costs 2, once per weekday. It pays the stage's yield in the same
  moment, so a player on nought can still water: the pay lands before the 2 is
  taken. A second water that day buys nothing.
- **Plant** costs 10 and needs no living tree. Planting counts as that day's
  watering.
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

These are three new kinds of row in `spends`, with no new node and no stored
tree:

- `plant`, `grow` and `water` each carry only `by`, `at` and `kind`. The
  stage that `grow` buys is the tree's next one, read from the walk rather than
  from the row.

`coinWalk` keeps `trees[player] = { stage, day }`, where `day` is the last day the
tree was watered (or planted), in the same local-date days the daily five uses.
The effective stage on any day `D` is `stage - floor(missed / 3)`, where
`missed` is the number of whole weekdays (Monday to Friday) between `day` and `D`. Below the sapling,
the tree is dead. This is worked out before every plant, grow and water, and at
`now` for display. Watering sets `stage` to the effective stage and `day` to
today.

Like any spend, a row that can't be honoured buys nothing and costs nothing:
planting over a living tree, growing an unwatered tree or an oak, watering a
dead or missing tree, watering twice in a day, or growing without the price, or any of the three on a Saturday or Sunday.
`ok` carries the rows that went through, and the walk returns `trees` so the
page can read them.

The rules accept `plant`, `grow` and `water` in `kind`, with none of `item`,
`to` or `amt`.

## Page

On the coins sheet, under "You have N coins", the tree shows its stage, whether
it is watered today, and one button that follows its state:

- **Plant · 10** when there is no tree
- **Water · 2 (+yield)** when it is not watered today
- **Grow · price** once it is watered today, if there is a next stage

On a weekend there's no button, just "Resting till Monday", and no dot on the
pill.

A line under it says three days without water drops a stage. The coins pill
shows a dot while the day's watering is still waiting. There's no new item on
the Spend shelf, because the tree lives with the balance.

## Not doing

- More than one tree. Several oaks would let the richest players outbet everyone.
- Anything past the oak. +5 a day is the reward; add an endgame if people reach it.
- Disasters (a storm that must be paid off). They can be added later as a
  hashed-day event in the walk without changing these rules.

## Test

In `test.mjs`, `coinWalk`:
- watering on nought pays out
- a second water that day buys nothing
- three missed days drop one stage, and nine drop three
- a weekend is not missed: watered Friday, still the same stage on Wednesday
- a water, plant or grow on a Saturday or Sunday buys nothing
- a neglected sapling dies, and you can plant again
- planting over a living tree buys nothing
- growing an unwatered tree buys nothing

In `test-rules.mjs`: `plant`, `grow` and `water` are accepted, and an unknown
kind is still refused.
