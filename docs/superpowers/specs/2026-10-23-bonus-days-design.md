# Bonus days: weekends and holidays pay double and are never missed

## Goal

Saturdays, Sundays and the admin's holidays become optional tree days. A water
on one pays twice the tree's coins, and skipping one never counts toward
neglect.

## Today

- Weekends: every tree action is refused ("a weekend doesn't count"), and a
  weekend is never counted as missed.
- Holidays (`/holidays`, admin-set ranges): a water pays double, but a skipped
  holiday weekday counts as missed like any other weekday.

## Rules, from `BONUS_FROM`

`BONUS_FROM = 1792778400000`: midnight starting Saturday 2026-10-24, Dhaka.
Everything before it keeps the old rules, so no past balance or tree changes
(the same pattern as `WATER_CHEAP_FROM`).

A **bonus day** is a day at or after `BONUS_FROM` that is a Saturday, a Sunday
or inside a holiday range.

1. Plant, water, grow and collect all work on a bonus day.
2. A water costs `waterCost` as usual and pays `TREE[stage].pay * 2` when it
   falls on a bonus day or a holiday. A holiday on a weekend is still 2×, not 4×.
3. A water on a bonus day is a real water: it becomes the tree's `day`, so the
   missed-day count restarts from it.
4. Neglect counts only days that are neither weekends nor holidays, for days at
   or after `BONUS_FROM`. Days before it count as now: weekdays, holidays
   included. `TREE_MISS` stays 3.
5. Before `BONUS_FROM`, a weekend tree row is still refused with "a weekend
   doesn't count".
6. Track goals count every water (`f.k === 'water'`, unchanged).
7. Nothing else doubles: wins, bets, bounties, gifts and cards stay the same.

## Page (`index.html`)

- One helper, `bonusDay(t)`: `t >= BONUS_FROM && (weekend(d) || holiday(t))`.
  `weekend` and `holiday` stay as they are.
- `coinWalk`: the weekend refusal applies only when `t < BONUS_FROM`; the pay
  multiplier becomes `bonusDay(t) || holiday(t) ? 2 : 1`.
- `weekdaysBetween` (used by `treeAt`): skips a day if it is a weekend, or if it
  is at or after `BONUS_FROM` and a holiday.
- Tree row (`treeRow`): no more "The weekend" state from `BONUS_FROM` on. Before
  watering on a bonus day it shows the gold line `Weekend · get N coins` or
  `Holiday · get N coins` (N = pay × 2). Coins on the branches show on weekends
  too.
- Coin pill title: `Weekend: your tree pays double today` on a weekend, the
  existing holiday line on a holiday. The pill glows on bonus days the same as
  on workdays.
- Grow page: "Grows on a weekday" goes; growing works any day after the day's
  water.
- Copy:
  - Rules sheet tree item: "Water it for 1 each workday … Three workdays without
    water and it drops a stage; a sapling that drops dies. On weekends and
    holidays watering is optional and pays double." The trailing "A water on a
    holiday pays double." goes.
  - Tree note under the sheet's tree: "3 workdays without water drops a stage."
  - Track goal `how` text for both water goals: "on three days" / "on five days".
  - Empty tree line: "Plant one and water it each workday."

## Relay (`relay/relay.mjs`)

- Same `BONUS_FROM`. It reads `/holidays` with a listener and passes it in.
- `treesOf`: the off-day skip applies only before `BONUS_FROM`; `weekdaysBetween`
  skips holidays at or after `BONUS_FROM`, as on the page.
- `thirsty`: nobody on a weekend or a holiday (watering is optional).
- `nextRemind`: skips weekends and holidays.
- The relay needs a restart after the deploy.

## Tests

`test.mjs`:
- A Saturday water after `BONUS_FROM` is accepted, pays 2× and resets the
  missed-day count.
- A tree left alone over a weekend plus a holiday weekday, with two workdays
  missed, keeps its stage.
- A weekend water before `BONUS_FROM` is still refused.
- A holiday on a weekend pays 2×, not 4×.

`relay/test-relay.mjs`:
- `thirsty` returns nobody on a holiday or a weekend.
- A skipped holiday after `BONUS_FROM` doesn't count as missed in `treesOf`.
- `nextRemind` skips a holiday.

## Out of scope

Doubling anything other than the tree, and a separate admin switch for bonus
days: the holiday list already covers extra days.
