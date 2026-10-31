# Power-ups and the market

An old oak has nothing left to aim for: the tree spec left "anything past the
oak" for when people got there. Now an oak drops power-ups as well as coins.
Its owner can't use them, only sell them, and the buyer gets the power. The
game sells power-ups too, but nobody can tell which listings are the game's.

The market is built for items in general. Power-ups are the first family of
items. A later family is a new row in one table plus whatever it does when
used, with no new market code.

## Power-ups from the oak

- **Only an old oak drops them.** Every 5th water at oak stage drops one, with
  no randomness. A weekend or holiday water counts once like any other. An
  Auto Water water (below) counts too.
- **The oak holds 3.** While it holds 3, waters don't count towards the next.
- **If the oak drops a stage, the count starts again.** Power-ups it already
  dropped stay.
- **A dropped power-up is blank.** The owner picks which one it becomes when
  they list it.
- **The owner can't use their own.** A dropped power-up can only be sold.
- **A dropped power-up lasts 7 workdays**, listed or not, and is gone at the
  midnight that ends the 7th. Workdays are Monday to Friday, less the admin's
  holidays. The day it dropped counts as the first if it's a workday.

## The four power-ups

| Power-up   | What it does when used |
|------------|------------------------|
| Win Boost  | A won game bet pays half again, rounded down: bet 6, win +9 |
| Shield     | A lost game bet gives back half the stake, rounded down: bet 6, lose 3 |
| Auto Water | Waters your tree for you at 9am, 3 times |
| Extra Game | One more challenge today, free |

- **Win Boost and Shield work on game bets only**, not cup bets. You add one to
  a bet as you place it, and it's used up whether the bet wins or loses. A draw
  or a cancelled game hands back the stake and the power-up, and its countdown
  doesn't change.
- **Auto Water** gives 3 waters, starting the day you use it, weekends
  included. Each day at 9am it waters the tree unless you've watered it
  already. A day you water yourself doesn't use one up; it just waits for the
  next day. Used after 9 on a day the tree hasn't been watered, it waters
  straight away. Each water costs the usual 1 and pays as usual (double on a
  bonus day). It counts as a real water for misses and for the oak's count. A
  day you can't pay the 1 is skipped: it counts as a miss but doesn't use one
  up. A used Auto Water leaves My power-ups at once. You need a living tree to
  use one.
- **Extra Game** adds one challenge today at no cost. An unplayed one is gone
  at midnight with nothing back. No game is "the Extra Game one": it only
  raises today's cap, so the best time is when you've run out. A player who
  has run out and holds one gets "You've played 5 challenges today. Use your
  Extra Game to play one more?" with a Use button where the cap message shows,
  and joins on one tap. Use in My power-ups still works earlier in the day.

## Items

Everything the market sells is an **item**. Each item belongs to a family, and
one table in the script describes them all:

| Family    | Items | Holds | Lasts | Listed at |
|-----------|-------|-------|-------|-----------|
| Power-ups | Win Boost, Shield, Auto Water, Extra Game | 3 | 7 workdays | 1–20 |

Each item has a name, a line on what it does, an icon, a bank price, and where
it's used (on a bet, or with Use). The market, My power-ups, the filter chips,
the bank and the history all read from this table. While power-ups are the
only family, the owned list is called My power-ups; with a second family it
becomes My items.

## The market

The market has its own **Market** tab in the menu, between Games and Account,
with a shopping-bag icon drawn in the same line style as the others. It shows
only to a signed-in player. On a phone it opens as a sheet from the bottom, the
way Alerts does, with the balance at the top. On a desktop it's one more corner
button. An amber dot on the tab means one of your power-ups has less than a
day left.

- **Listing.** From under the tree, the owner picks a dropped power-up, which
  one it becomes, and a price from 1 to 20. They can take it down any time. To
  change it or its price, they take it down and list it again.
- **Buying.** Buy pays the seller at once, and the power-up goes to My
  power-ups. If two people buy the same listing, the first row wins and the
  second is refused at no cost.
- **Sellers are hidden.** Listings show the power-up, what it does, the price
  and the countdown, and no name. History reads "Sold a Shield at the market ·
  +4" and "Bought a Shield at the market · −4". The seller doesn't learn who
  bought it.
- **Your own listing** shows with a Yours tag and no Buy button.
- **My power-ups holds 3.** A buy past that is refused.
- **A bought power-up lasts 7 workdays** from the day it's bought, counted the
  same way, whatever was left on its listing. One bought on a Thursday lasts
  until the end of the Friday after next.
- **No reselling.** A bought power-up can only be used.

## The bank

The game always has one listing of each power-up, at its bank price from the
table:

| Win Boost | Shield | Auto Water | Extra Game |
|-----------|--------|------------|------------|
| 6         | 6      | 10         | 3          |

- **It looks like any other listing.** Each bank listing has a countdown of
  its own: a 7-workday cycle, with each item's cycle starting at a different
  point so they don't all reset together. At the end of a cycle a fresh
  listing with a new countdown takes its place.
- **Selling to one player doesn't use it up.** It stays for everybody else.
- **Each player can buy 1 bank item a workday**, whatever its family. After
  that, the bank's listings drop out of their market until the next workday.
  Nothing says why.
- **A bank item is the same as a player's** once bought. Coins paid for it
  leave the game.
- **Only the admin's view** tags bank listings, with a small Bank chip.

The bank's prices cap the market: oak owners sell below them or don't sell.

## Interface

Inside the Market sheet, layout D from the mockups:

- **My power-ups** is a row of chips at the top of the sheet, each with its
  countdown. It turns amber in the last 6 hours. Auto Water and Extra Game
  open a Use button. Win Boost and Shield say "Add it when you bet".
- **Filter chips**: All, then one per item, built from the table. Once a
  second family exists, the family names come first. The row scrolls sideways
  with no scrollbar on any device, and fades at the right edge.
- **Sort**: Cheapest, Most time left, Ending soon. The choice is kept in
  `localStorage` on that device, and Cheapest is the default.
- **Each row** shows the item's icon, its name, what it does, "Gone in 2d 5h",
  and the price on a Buy button.
- **The bet panel**: with a Win Boost or Shield in My power-ups, an "Add Win
  Boost" or "Add Shield" chip sits under the amount, and the payout line shows
  what it changes.
- **Under the tree**, in the coin panel, for an oak only: "2 of 5 waters to
  the next power-up" and each dropped one with its countdown. One not yet
  listed has a List button. That opens the four power-ups with what each does,
  and a 1–20 price stepper. A listed one shows "On sale · 5" and Take down.
- **Help text**: a Market entry in the Spend list on how buying and selling
  work, and a Power-ups entry after Tree on what an oak drops and what each one
  does.
- **Icons**: a coloured disc with a white line symbol: an up arrow for Win
  Boost (gold), a shield for Shield (lime), a drop for Auto Water (blue), a
  ball for Extra Game (red-orange).

## How it's worked out

New `spends` kinds, replayed by `coinWalk` like the tree's:

| kind     | fields                          | |
|----------|---------------------------------|---|
| `list`   | `src`, `type`, `price`          | `src` is the id of what's sold (for a power-up, the water row that dropped it); `type` is the item, `shield` |
| `unlist` | `list`                          | `list` is the id of the `list` row |
| `buy`    | `list`, or `bank` (a `type`)    | |
| `use`    | `own`                           | an item used with Use; `own` is the id of the `buy` row |
| `bet`    | gets an optional `own`          | an item used on a bet |

- **Drops happen inside the replay.** They need no row. Each is named after
  the water that dropped it, so every page agrees on it.
- **The walk gives back** each oak's count and drops, each player's items, the
  open listings, and today's bank buys. It runs the market rules (hold, lasts,
  price range, first buy wins) off the table, so they hold for any family.
- **Auto Water** adds a water event at 9am each day until it has watered 3
  times. A day that already has a water, or that the player can't pay for,
  is skipped and not counted.
- **Extra Game** counts with the day's `slot` rows for the challenge cap, at
  cost 0.
- **A bank listing's countdown** comes from a fixed start and each item's
  offset, so it needs no row.
- **The walk refuses** a row that breaks a rule, at no cost: listing a drop
  that isn't yours, is listed already or has expired; buying your own listing,
  a sold or expired one, with that family full, without the coins, or a second
  bank item that workday; using an item you don't hold, one used the other way
  (a bet item with Use), or an Auto Water without a tree.
- **`database.rules.json`** accepts the new kinds and fields with their types
  and ranges: `type` and `bank` are short strings, `price` is a whole number
  from 1 to 50 (the walk holds each family to its own range), and `src`,
  `list` and `own` are strings of 40 characters or fewer. A new family then
  needs no rules change.

## Limits

- `spends` can be read by anyone. Someone reading the database directly can
  see who listed what and work out the bank's listings. That's the same
  trade-off as hidden bets.
- Nothing counts before this ships: oaks start counting waters on launch day.

## Testing

`test.mjs`:

- An oak's 5th water drops a power-up, and a 4th doesn't.
- An oak holding 3 doesn't count waters.
- A stage drop resets the count.
- The owner can't use their own drop.
- When two players buy one listing, the second is refused.
- Buying your own listing, or a 4th power-up, is refused.
- A listing at 21 is refused.
- A second bank buy on the same workday is refused, and the next workday's is
  allowed.
- Expiry skips a weekend and a holiday.
- Win Boost on a won bet, on a lost one, and on a draw.
- Shield on a lost bet, and on a won one.
- Auto Water waters at 9, waits out a day already watered (still 3 waters in
  all), waters straight away after 9, and skips a day with no coin.
- Extra Game adds a challenge.

`test-rules.mjs`:

- The new kinds are accepted.
- A `price` of 51 or a missing `src` is rejected.

## Not now

- Other families of items.
- Power-ups on cup bets.
- Drops from stages below the oak.
- Anonymity that holds up against someone reading the database (it would need
  a server).
- Admin-set bank prices: fixed numbers until they need changing.
