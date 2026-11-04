# The village

The app turns into a base-building game wrapped around the real table. Every
player gets a village they lay out themselves. Buildings produce coins into a
Bank. Later, real wins become the fuel to raid other people's villages. The
point is more real games: a raid needs a real win, and losing coins to a raid
makes people want a rematch.

## The whole game, in four pieces

Each piece gets its own spec, plan and build, in this order:

1. **The village** (this spec): the plot, buildings, upgrades, the Bank,
   collecting, and the earned buildings.
2. **Defences and the Barracks**: cannons and towers that defend, and attackers
   you train.
3. **The raid**: attack someone's village while they're offline. You choose
   where to drop your attackers on its edge, then watch a 30-second fight play
   out. You steal from their Bank and earn stars. Real wins give raid fuel; with
   no real games there are no raids. This piece also adds replays, the push
   notification after you're raided, and a Revenge button that opens a real
   challenge against the raider.
4. **Visiting and rankings**: look round anyone's village, and a board by
   Clubhouse level and raid stars.

Decided for the whole game: base raids, as in strategy games of this kind, not
phone foosball or card duels. Free placement on a grid. A raid takes only what
is waiting in the Bank, never your coin balance.

## The look

A real-time 3D village: low-poly models in summer daylight with soft shadows,
seen from above at an angle, with chunky outlined game overlays (coins,
builder line, big round buttons). The models are Kenney's (kenney.nl) castle,
nature, fantasy-town, mini-arena, pirate, platformer and tower-defense kits,
all CC0. The reference mockup is the green summer day at
`.superpowers/brainstorm/…/content/files/village3d.html`. Autumn, winter,
tropical and night were tried and turned down.

## Buildings

Everyone has one of each. More than one Gold mine can come later.

### Bought

| Building | Job | Level 1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|---|
| **Clubhouse** | Home base. No other building can be above its level | free, from the start | 40 | 100 | 200 | 400 |
| **Gold mine** | Coins into the Bank over workday hours | 15 → 3 a day | 40 → 5 | 90 → 8 | | |
| **Bank** | Holds coins until Collect. A full Bank stops the mine | free → holds 10 | 30 → 20 | 70 → 35 | 150 → 55 | 300 → 80 |
| **Old oak** | The tree as it is today, standing on the grid | as today | | | | |
| **Wall** | Pieces laid one by one. Defence only matters from piece 3 | 24 pieces free | 30 | 80 | | |
| **Stadium** | Free extra games a day, on top of the daily 5 | 60 → +1 | 150 → +2 | | | |

- **Wall pieces** past the free 24 cost 1 coin each. The Wall's level applies to
  every piece at once.
- **The Clubhouse cap:** an upgrade to level N needs the Clubhouse at level N or
  higher. A Clubhouse upgrade has no cap.
- **Stadium games** are free games, like the daily 5. The extra-game refund at
  midnight counts them with the free ones.

### Earned, never bought

| Building | Appears when |
|---|---|
| **Trophy hall** | You've won a cup. It shows one cup per title |
| **Golden Boot statue** | You've won the Boot. Until then it's a see-through ghost with a lock, "win it to unlock" |
| **Golden Glove statue** | Same, for the Glove |
| **Badge banners** | One on the wall per badge you hold |

These come from data the app already has (history, awards, badges). Only their
positions are stored.

## Upgrades take time

| Reaching | Takes |
|---|---|
| Level 1 | instant |
| Level 2 | 1 hour |
| Level 3 | 3 hours |
| Level 4 and 5 | 8 hours |

- **One building is under construction at a time.** The coins are paid when it
  starts.
- **A building keeps working at its old level until the upgrade finishes.** A
  Bank upgrade raises the cap only once it's done.
- **Timers run in real time**, nights and weekends included.
- There's no paying to finish early, and no cancelling.

## The Bank

- **The Gold mine produces only during workday hours**, 09:00 to 18:00 local
  time, Monday to Friday, minus the admin's holidays: the same workdays the
  power-ups use. A day's output is spread evenly over those 9 hours. The Bank
  holds whole coins, rounded down, and the fraction carries over.
- **A full Bank stops the mine.** Output past the cap is lost, not saved for
  later.
- **The Old oak pays into the Bank** from `VILLAGE_FROM`, a cutoff set to the
  moment piece 1 ships, like `INDIV_FROM`. Its coins land at
  ripe time exactly as they land in the balance today. **The oak ignores the
  cap**, so a full Bank never wastes a tree's day. Before `VILLAGE_FROM` the oak
  pays the balance, as now.
- **Collect** moves everything in the Bank into the balance at that moment.

## Your first visit

Everyone starts with a ready-made layout: the Clubhouse in the middle, the Bank
and the Old oak (if they have a living tree) beside it, and the 24 free wall
pieces in a ring round all three. Earned buildings already won are placed in the
first free space. Nothing about this start is stored until the player saves a
layout of their own; until then the app draws the default.

## The plot and editing

- **A 20 × 20 grid.** Footprints: Clubhouse 4×4, Stadium 5×4, Bank, Gold mine
  and Trophy hall 3×3, Old oak 2×2, statue 1×1, wall piece 1×1. Banners hang
  on wall pieces and take no space.
- **View mode:** drag to pan, pinch to zoom, tap a building for its sheet, tap
  the Bank to Collect.
- **Edit mode:** grid lines show. Drag a building; it snaps to the grid and shows
  green, or red where it would overlap something or leave the plot. Drag a
  finger across the grid to lay a line of wall from your spare pieces. Tap a
  piece to take it back into spares. **Save** or **Cancel**. Moving is free and
  instant. A building under construction can be moved.
- **A newly bought building** drops into the first free space it fits, with
  Edit mode open, ready to drag.
- There's no selling or demolishing, no saved alternate layouts, and no
  rotating. Each can come later if people ask.

## How it's stored

Money goes in `spends`, as new kinds of append-only row that `coinWalk`
replays. Each carries `by`, `at` and `kind`:

| kind | extra fields | Walk does |
|---|---|---|
| `vbuild` | `item` (`mine` or `stadium`) | Pays its level-1 cost. The row's key becomes the building's id. Refused if you already have one |
| `vup` | `item` (`club`, `mine`, `bank`, `wall`, `stadium`) | Pays the next level's cost and starts the timer. The level, cost and finish time are worked out by the walk, not read from the row. Refused if something is already building, the Clubhouse cap blocks it, it's at max level, or the coins aren't there |
| `vwall` | `n` | Pays `n` coins for `n` spare pieces |
| `vcollect` | none | Moves the Bank into the balance |

A row the walk refuses pays nothing and changes nothing, the way a refused bet
does today. `coinWalk` keeps `villages[player] = { lvl: {club, mine, bank, wall,
stadium}, building: {item, done}, bank, frac, pieces }` and works the Bank
forward to each row's `at`, and to `now` for display.

Layout has no money in it, so it lives in its own node,
`villages/<email with dots as commas>`:

```
layout: { <id>: { x, z } }     // id: club, bank, oak, mine, stadium, trophy, boot, glove
walls:  { "<x>_<z>": true }
```

- **Rules:** only the owner can write theirs; `x` and `z` are whole numbers
  from 0 to 19; ids come from the list above. Everyone can read every village
  (piece 4 needs that).
- **The app checks** overlaps and that there are no more walls than pieces owned.
  A bad layout can't move coins; at worst it draws oddly.

**Pushes (relay):** "Your Bank is level 3", when an upgrade finishes. "Your
Bank is full", at most once a day per player.

## Screens

- **A Village item in the menu.** The phone bar becomes Hall · Games ·
  Village · Market · Account. Install and Alerts move inside Account. The app
  still opens where it does today.
- **The Village tab:** the 3D village full screen. At the top: coins, and the
  builder line ("🔨 Bank → level 3 · 1h 20m" or "Builder free"). Over the
  Bank, a coin bubble with what's in it out of the cap ("8 / 20"), red when
  full. At the bottom: **Collect 8**, **Build**, **Edit**.
- **Building sheet** (tap a building): name, level and job, the next level's
  gain, cost and time, and **Upgrade**. When Upgrade is unavailable it is
  greyed out with the reason: not enough coins, builder busy, or Clubhouse
  level too low.
- **Build list:** what you can buy, with cost and footprint. Locked items say
  what unlocks them.
- **Edit bar:** "Wall pieces: 6 spare · Buy more", **Cancel**, **Save**.
- **First visit:** a three-part card (the existing `---` cards):
  1. The mine fills the Bank, and you collect it.
  2. Upgrades earn more. One builds at a time.
  3. Coming soon: raids, using wins from real games.
- **The tree card** on the challenge board stays, saying "Pays into your
  Bank", with a link to the village.
- **No 3D:** a phone that can't run WebGL gets a plain list of buildings with
  the same Upgrade and Collect buttons.
- **Desktop:** the same view in a large panel.
- The raid banner, Revenge and the Raids button from the mockup wait for piece 3.

## Loading

three.js 0.160.0 from jsdelivr (pinned), with its GLTFLoader. The models,
about 1 MB, go in the repo under `models/<kit>/` with their `Textures/`. The
README gets a credit line for Kenney, CC0. None of it loads until the Village
tab opens, so the rest of the app stays as fast as today.

## Tests

- `test.mjs` (walk):
  - Costs and the Clubhouse cap.
  - One upgrade at a time.
  - The finish time, and the old level working until then.
  - The mine filling only during workday hours, holidays included, with the
    fraction carried over.
  - The cap stopping the mine; the oak ignoring the cap; the oak paying the
    balance before `VILLAGE_FROM` and the Bank after.
  - Collect; buying wall pieces; refused rows changing nothing.
  - Stadium games raising the daily free games, and the midnight refund.
- `test-rules.mjs`: the new spend kinds; the layout node (owner only, whole
  numbers 0 to 19, known ids).
- `test-relay.mjs`: the upgrade-done push, and Bank-full at most once a day.
