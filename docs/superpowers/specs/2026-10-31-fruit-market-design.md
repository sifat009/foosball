# Fruit and the market

An old oak has nothing left to aim for: the tree spec left "anything past the
oak" for when people got there. Now an oak grows fruit as well as coins. Its
owner can't use the fruit, only sell it, and the buyer gets its power. The
game sells fruit too, but nobody can tell which listings are the game's.

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
| Juicy | Your tree is watered for you each day at 9am for 3 days |
| Ripe  | One extra challenge today, like the 3-coin extra game |

- **Sweet and Sour work on game bets only**, not cup bets. You add one fruit to
  a bet as you place it. The fruit is used up whether the bet wins or loses.
  A draw or a cancelled game hands back the stake and the fruit, and the
  fruit's countdown doesn't change.
- **Juicy** covers the day you use it and the next two, weekends included.
  Each of those days, at 9am, the tree is watered unless you've watered it
  already. Used after 9 on a day the tree hasn't been watered, it waters
  straight away. Each water costs the usual 1 and pays as usual (double on a
  bonus day). It counts as a real water for misses and for oak fruit. A day
  you can't pay the 1 is skipped and counts as a miss. You need a living tree
  to use one.
- **Ripe** adds one extra challenge today at no cost. An unplayed Ripe game
  is gone at midnight with nothing back.

## The market

The Spend tab gets a **Market** section.

- **Listing.** From My harvest, the owner picks a fruit, a power and a price
  from 1 to 20. They can take it down any time. To change the power or price,
  they take it down and list it again.
- **Buying.** Buy pays the seller at once, and the fruit goes to My fruit with
  its power fixed. If two people buy the same fruit, the first row wins and
  the second is refused at no cost.
- **Sellers are hidden.** Listings show the power, what it does, the price and
  the countdown, and no name. History reads "Sold Sweet at the market · +4"
  and "Bought Sweet at the market · −4". The seller doesn't learn who bought it.
- **Your own listing** shows with a Yours tag and no Buy button.
- **My fruit holds 3.** A buy that would make 4 is refused.
- **Bought fruit lasts 3 workdays**, counted the same way as harvest fruit. A
  fruit bought on a Thursday lasts Thursday, Friday and Monday.
- **No reselling.** A bought fruit can only be used.

## The bank

The game always has one listing of each power, at a fixed price:

| Sweet | Sour | Juicy | Ripe |
|-------|------|-------|------|
| 6     | 6    | 10    | 3    |

- **It looks like any other listing.** Each bank listing has a countdown of
  its own: a 7-workday cycle, with each power's cycle starting at a different
  point so they don't all reset together. At the end of a cycle a fresh
  listing with a new countdown takes its place.
- **Selling to one player doesn't use it up.** It stays for everybody else.
- **Each player can buy 1 bank fruit a workday.** After that, the bank's
  listings drop out of their market until the next workday. Nothing says why.
- **Bank fruit is the same as grown fruit** once bought. Coins paid for it
  leave the game.
- **Only the admin's view** tags bank listings, with a small Bank chip.

The bank's prices cap the market: growers sell below them or don't sell.

## Interface

Layout D from the mockups:

- **My fruit** is a row of chips at the top of the Market section, each with
  its countdown. It turns amber in the last 6 hours. A Juicy or Ripe chip
  opens a Use button. A Sweet or Sour chip says "Add it when you bet".
- **Filter chips**: All, Sweet, Sour, Juicy, Ripe. The row scrolls sideways
  with no scrollbar on any device, and fades at the right edge.
- **Sort**: Cheapest, Most time left, Ending soon. The choice is kept in
  `localStorage` on that device, and Cheapest is the default.
- **Each row** shows the fruit icon, the power, what it does, "Gone in 2d 5h",
  and the price on a Buy button.
- **The bet panel**: with a Sweet or Sour in My fruit, an "Add Sweet" or "Add
  Sour" chip sits under the amount, and the payout line shows what it changes.
- **My harvest** sits under the tree in the coin panel and shows only for an
  oak: "2 of 5 waters to the next fruit" and each fruit with its countdown.
  A fruit not yet listed has a List button. That opens the four powers with
  what each does, and a 1–20 price stepper. A listed fruit shows "On sale · 5"
  and Take down.
- **Help text**: a Fruit entry in the Spend list, after Tree.
- **Icons**: one fruit shape, coloured per power (gold, lime, blue,
  red-orange), drawn for the app.

## How it's worked out

New `spends` kinds, replayed by `coinWalk` like the tree's:

| kind     | fields                          | |
|----------|---------------------------------|---|
| `list`   | `fruit`, `power`, `price`       | `fruit` is the id of the water row that grew it |
| `unlist` | `list`                          | `list` is the id of the `list` row |
| `buy`    | `list`, or `bank` (a power)     | |
| `use`    | `fruit`                         | a Juicy or a Ripe; `fruit` is the id of the `buy` row |
| `bet`    | gets an optional `fruit`        | a Sweet or a Sour, the id of the `buy` row |

- **Fruit grows inside the replay.** It needs no row. It's named after the
  water that grew it, so every page agrees on it.
- **The walk gives back** each player's harvest, fruit and fruit count, the
  open listings, and today's bank buys.
- **A Juicy** adds a water event at 9am on each day it covers, and the walk
  skips it if a water already stands that day.
- **A Ripe** counts with the day's `slot` rows for the challenge cap, at cost 0.
- **A bank listing's countdown** comes from a fixed start and each power's
  offset, so it needs no row.
- **The walk refuses** a row that breaks a rule, at no cost: listing a fruit
  that isn't yours, is listed already or has expired; buying your own listing,
  a sold or expired one, with My fruit full, without the coins, or a second
  bank fruit that workday; using a fruit you don't hold, the wrong power, or a
  Juicy without a tree.
- **`database.rules.json`** accepts the new kinds and fields with their types
  and ranges: `power` is one of the four, `price` is a whole number from 1 to
  20, and `fruit` and `list` are strings of 40 characters or fewer.

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
- Juicy waters at 9, skips a day already watered, waters straight away after 9, and skips a day with no coin.
- A Ripe adds a challenge.

`test-rules.mjs`:

- The new kinds are accepted.
- A bad `power` or a `price` of 21 is rejected.

## Not now

- Seeds, rain or other goods.
- Fruit on cup bets.
- Fruit from stages below the oak.
- Anonymity that holds up against someone reading the database (it would need a server).
- Admin-set bank prices: fixed numbers until they need changing.
