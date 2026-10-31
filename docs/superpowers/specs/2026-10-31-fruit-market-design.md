# Fruit and the market

An old oak has nothing left to aim for: the tree spec left "anything past the
oak" for when people got there. Now an oak grows fruit as well as coins. Its
owner can't use the fruit, only sell it, and the buyer gets its power. The
game sells fruit too, but nobody can tell which listings are the game's.

The market is built for items in general, not fruit alone. Fruit is the first
family of items. A later family (seeds, say) is a new entry in one table plus
whatever it does when used, with no new market code.

## Fruit

- **Only an old oak fruits.** Every 5th water at oak stage grows one fruit,
  with no randomness. A weekend or holiday water counts once like any other.
  A Juicy auto-water (below) counts too.
- **My harvest holds 3.** While it's full, waters don't count towards the next
  fruit.
- **If the oak drops a stage, the count starts again.** Fruit already in My
  harvest stays.
- **A harvest fruit has no power yet.** The owner picks one when they list it.
- **A harvest fruit lasts 7 workdays**, listed or not, and is gone at the
  midnight that ends the 7th. Workdays are Monday to Friday, less the admin's
  holidays. The day it grew counts as the first if it's a workday.

## Powers

| Power | What it does when used |
|-------|------------------------|
| Sweet | A won game bet pays half again, rounded down: bet 6, win +9 |
| Sour  | A lost game bet gives back half the stake, rounded down: bet 6, lose 3 |
| Juicy | Waters your tree for you at 9am, 3 times |
| Ripe  | One extra challenge today, like the 3-coin extra game |

- **Sweet and Sour work on game bets only**, not cup bets. You add one fruit to
  a bet as you place it. The fruit is used up whether the bet wins or loses.
  A draw or a cancelled game hands back the stake and the fruit, and the
  fruit's countdown doesn't change.
- **Juicy** gives 3 auto-waters, starting the day you use it, weekends
  included. Each day at 9am it waters the tree unless you've watered it
  already. A day you water yourself doesn't use one up; Juicy just waits for
  the next day. Used after 9 on a day the tree hasn't been watered, it waters
  straight away. Each water costs the usual 1 and pays as usual (double on a
  bonus day). It counts as a real water for misses and for oak fruit. A day
  you can't pay the 1 is skipped: it counts as a miss but doesn't use one up.
  A used Juicy leaves My items at once. You need a living tree to use one.
- **Ripe** adds one extra challenge today at no cost. An unplayed Ripe game
  is gone at midnight with nothing back. No game is "the Ripe one": it only
  raises today's cap, so the best time is when you've run out. A player who
  has run out and holds a Ripe gets "You've played 5 challenges today. Use
  your Ripe to play one more?" with a Use button where the cap message shows,
  and joins on one tap. Use in My items still works earlier in the day.

## Items

Everything the market sells is an **item**. Each item belongs to a family, and
one table in the script describes them all:

| Family | Items | Holds | Lasts | Listed at |
|--------|-------|-------|-------|-----------|
| Fruit | Sweet, Sour, Juicy, Ripe | 3 | 7 workdays | 1–20 |

Each item has a name, a line on what it does, an icon, a bank price, and where
it's used (on a bet, or with Use). The market, My items, the filter chips, the
bank and the history all read from this table. Nothing in them names fruit.

## The market

The market has its own **Market** tab in the menu, between Games and Account,
with a shopping-bag icon drawn in the same line style as the others. It shows only to
a signed-in player. On a phone it opens as a sheet from the bottom, the way
Alerts does, with the balance at the top. On a desktop it's one more corner
button. An amber dot on the tab means one of your items has less than a day
left.

- **Listing.** From My harvest, the owner picks a fruit, a power and a price
  from 1 to 20. They can take it down any time. To change the power or price,
  they take it down and list it again.
- **Buying.** Buy pays the seller at once, and the item goes to **My items**
  with its power fixed. If two people buy the same fruit, the first row wins and
  the second is refused at no cost.
- **Sellers are hidden.** Listings show the item, what it does, the price and
  the countdown, and no name. History reads "Sold Sweet at the market · +4"
  and "Bought Sweet at the market · −4". The seller doesn't learn who bought it.
- **Your own listing** shows with a Yours tag and no Buy button.
- **My items holds as many of each family as its table row says**: 3 fruit.
  A buy past that is refused.
- **A bought item lasts as long as its family says** from the day it's bought,
  whatever was left on its listing: fruit lasts 7 workdays, counted the same way
  as harvest fruit. A fruit bought on a Thursday lasts until the end of the
  Friday after next.
- **No reselling.** A bought item can only be used.

## The bank

The game always has one listing of each item, at its bank price from the table:

| Sweet | Sour | Juicy | Ripe |
|-------|------|-------|------|
| 6     | 6    | 10    | 3    |

- **It looks like any other listing.** Each bank listing has a countdown of
  its own: a 7-workday cycle, with each item's cycle starting at a different
  point so they don't all reset together. At the end of a cycle a fresh
  listing with a new countdown takes its place.
- **Selling to one player doesn't use it up.** It stays for everybody else.
- **Each player can buy 1 bank item a workday**, whatever its family. After that, the bank's
  listings drop out of their market until the next workday. Nothing says why.
- **A bank item is the same as a player's** once bought. Coins paid for it
  leave the game.
- **Only the admin's view** tags bank listings, with a small Bank chip.

The bank's prices cap the market: growers sell below them or don't sell.

## Interface

Inside the Market sheet, layout D from the mockups:

- **My items** is a row of chips at the top of the sheet, each with its
  countdown. It turns amber in the last 6 hours. An item used with Use (Juicy,
  Ripe) opens a Use button. An item used on a bet (Sweet, Sour) says "Add it
  when you bet".
- **Filter chips**: All, then one per item, built from the table. Once a
  second family exists, the family names (Fruit, Seeds) come first. The row
  scrolls sideways with no scrollbar on any device, and fades at the right edge.
- **Sort**: Cheapest, Most time left, Ending soon. The choice is kept in
  `localStorage` on that device, and Cheapest is the default.
- **Each row** shows the item's icon, its name, what it does, "Gone in 2d 5h",
  and the price on a Buy button.
- **The bet panel**: with a Sweet or Sour in My items, an "Add Sweet" or "Add
  Sour" chip sits under the amount, and the payout line shows what it changes.
- **My harvest** sits under the tree in the coin panel and shows only for an
  oak: "2 of 5 waters to the next fruit" and each fruit with its countdown.
  A fruit not yet listed has a List button. That opens the four powers with
  what each does, and a 1–20 price stepper. A listed fruit shows "On sale · 5"
  and Take down.
- **Help text**: a Market entry in the Spend list on how buying and selling
  work, and a Fruit entry after Tree on growing it and what each one does.
- **Icons**: one fruit shape, coloured per power (gold, lime, blue,
  red-orange), drawn for the app.

## How it's worked out

New `spends` kinds, replayed by `coinWalk` like the tree's:

| kind     | fields                          | |
|----------|---------------------------------|---|
| `list`   | `src`, `type`, `price`          | `src` is the id of what's sold (for fruit, the water row that grew it); `type` is the item, `sweet` |
| `unlist` | `list`                          | `list` is the id of the `list` row |
| `buy`    | `list`, or `bank` (a `type`)    | |
| `use`    | `own`                           | an item used with Use; `own` is the id of the `buy` row |
| `bet`    | gets an optional `own`          | an item used on a bet |

- **Fruit grows inside the replay.** It needs no row. It's named after the
  water that grew it, so every page agrees on it.
- **The walk gives back** each player's harvest and fruit count, their items,
  the open listings, and today's bank buys. It runs the market rules (hold,
  lasts, price range, first buy wins) off the table, so they hold for any family.
- **A Juicy** adds a water event at 9am each day until it has watered 3
  times. A day that already has a water, or that the player can't pay for,
  is skipped and not counted.
- **A Ripe** counts with the day's `slot` rows for the challenge cap, at cost 0.
- **A bank listing's countdown** comes from a fixed start and each item's
  offset, so it needs no row.
- **The walk refuses** a row that breaks a rule, at no cost: listing a fruit
  that isn't yours, is listed already or has expired; buying your own listing,
  a sold or expired one, with that family full in My items, without the
  coins, or a second bank item that workday; using an item you don't hold, one
  used the other way (a bet item with Use), or a Juicy without a tree.
- **`database.rules.json`** accepts the new kinds and fields with their types
  and ranges: `type` and `bank` are short strings, `price` is a whole number
  from 1 to 50 (the walk holds each family to its own range), and `src`,
  `list` and `own` are strings of 40 characters or fewer. A new family then
  needs no rules change.

## Limits

- `spends` can be read by anyone. Someone reading the database directly can
  see who listed what and work out the bank's listings. That's the same
  trade-off as hidden bets.
- Nothing is grown before this ships: oaks start counting waters on launch day.

## Testing

`test.mjs`:

- An oak's 5th water grows a fruit, and a 4th doesn't.
- A full harvest doesn't count waters.
- A stage drop resets the count.
- When two players buy one listing, the second is refused.
- Buying your own listing, or a 4th fruit, is refused.
- A second bank buy on the same workday is refused, and the next workday's is allowed.
- Expiry skips a weekend and a holiday.
- Sweet on a won bet, on a lost one, and on a draw.
- Sour on a lost bet, and on a won one.
- Juicy waters at 9, waits out a day already watered (still 3 waters in all), waters straight away after 9, and skips a day with no coin.
- A Ripe adds a challenge.

`test-rules.mjs`:

- The new kinds are accepted.
- A `price` of 51 or a missing `src` is rejected.
- In `test.mjs`, a fruit listed at 21 is refused by the walk.

## Not now

- Seeds, rain or other goods.
- Fruit on cup bets.
- Fruit from stages below the oak.
- Anonymity that holds up against someone reading the database (it would need a server).
- Admin-set bank prices: fixed numbers until they need changing.
