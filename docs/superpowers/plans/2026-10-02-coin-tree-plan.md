# A coin tree — implementation plan

Spec: `docs/superpowers/specs/2026-10-02-coin-tree-design.md`

One phase, four commits in this order: the walk and its test, the rules and
their test, the tree on the coins sheet, the dot on the pill. Each one leaves
the app working.

---

## 1. The walk — `index.html`, beside the other spend constants (~line 3043)

```js
/* A tree: planted, grown and watered with spend rows, kept nowhere but here.
   Stage i costs TREE[i].cost to reach and pays TREE[i].pay when watered. */
const TREE = [{ name: 'Sapling', cost: 10, pay: 2 }, { name: 'Young tree', cost: 25, pay: 3 },
  { name: 'Tree', cost: 50, pay: 5 }, { name: 'Old oak', cost: 100, pay: 7 }];
const WATER_COST = 2, TREE_MISS = 3, TREE_KINDS = ['plant', 'grow', 'water'];
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
const weekend = d => d.getDay() === 0 || d.getDay() === 6;
// ponytail: a day-by-day count, a few hundred steps for a tree left a year
const weekdaysBetween = (a, b) => {
  let n = 0;
  for (const d = new Date(a); d.setDate(d.getDate() + 1), d < b;) if (!weekend(d)) n++;
  return n;
};
/* What a tree is on day t, after neglect: a stage lost for every three missed
   weekdays since it was last watered, dead below the sapling. Never stored back,
   since `day` stays the last watering and storing would count the loss twice. */
const treeAt = (tr, t) => {
  if (!tr) return null;
  const stage = tr.stage - Math.floor(weekdaysBetween(tr.day, dayStart(t)) / TREE_MISS);
  return stage < 0 ? null : { stage, day: tr.day };
};
```

In `coinWalk`, add `trees = {}` next to `bounties`. In the spend branch, before
`cost` is checked, tree rows take their own path. `spendCost` doesn't know them,
because a grow's price depends on the tree:

```js
if (TREE_KINDS.includes(s.kind)) {
  const day = dayStart(+s.at), cur = treeAt(trees[who], +s.at);
  if (who === undefined || weekend(day)) return;
  const today = cur && +cur.day === +day, next = cur && TREE[cur.stage + 1];
  if (s.kind === 'plant') {
    if (cur || bal[who] < TREE[0].cost) return;
    bal[who] -= TREE[0].cost; trees[who] = { stage: 0, day };
  } else if (s.kind === 'water') {
    if (!cur || today) return;
    // the pay lands before the 2 is taken, so a tree waters on nought
    bal[who] += TREE[cur.stage].pay - WATER_COST; trees[who] = { stage: cur.stage, day };
  } else {
    if (!today || !next || bal[who] < next.cost) return;
    bal[who] -= next.cost; trees[who] = { stage: cur.stage + 1, day };
  }
  ok.push(s);
  return;
}
```

The walk returns `trees` as player → `{ stage, watered }` at `now`, where
`watered` means it was watered today:

```js
const treesNow = {};
Object.entries(trees).forEach(([n, tr]) => {
  const t = treeAt(tr, now);
  if (t) treesNow[n] = { stage: t.stage, watered: +t.day === +dayStart(now) };
});
return { bal, ok, bounties, tags, trees: treesNow };
```

### Test — `test.mjs`, after the bounty checks (~line 2870)

This test gets its own seed: Sifat & Ofi beat Nur & Rashed 100 times, so Sifat
holds 200, enough for an oak. Dates are built in the page with
`new Date(2026, 9, d, 10).getTime()`. 5 October 2026 is a Monday.

- Plant, grow ×3 on Mon 5th, with `now` = Fri 9th: Old oak drops to Tree.
  With `now` = Mon 19th (nine weekdays missed): Sapling. With `now` = Thu 22nd
  (twelve missed): no tree.
- Water on Fri 9th, with `now` = Wed 14th: still the same stage. With `now` =
  Thu 15th: one stage down.
- A water on Sat 10th is not in `ok`.
- A second water on the same day is not in `ok`.
- Nur, on nought, is gifted 10, plants and waters the next weekday. The water
  is in `ok`, and Nur is on 0 again, not refused.
- A second plant while the tree lives is not in `ok`. After it dies, a plant is.
- A grow the day after planting, with no water, is not in `ok`.

Commit: *A tree is planted, grown and watered with coins, and wilts when it isn't*

## 2. Rules — `database.rules.json`, `spends`

- `kind`: accept `'plant'`, `'grow'` and `'water'` too.
- `.validate`: the non-flair branch becomes
  `['slot','plant','grow','water'].includes(kind) || hasChildren(['to','amt'])`,
  written out as `===` checks, since rules have no `includes`.
- `item`, `to` and `amt` already insist on their own kinds, so a `water`
  carrying `amt` is still refused.

### Test — `test-rules.mjs`, in the spending block (~line 241)

- `put` with `{ kind: 'plant' }`, `{ kind: 'grow' }` and `{ kind: 'water' }`
  each succeed.
- `{ kind: 'water', amt: 5 }` is refused.

Commit: *The rules take a tree's three rows*

## 3. The tree on the coins sheet — `renderCoins` (~line 3258)

- At ~line 3693, beside `chalFlair`: `chalTrees = walk.trees`
  (`var chalTrees = {}`).
- In `renderCoins`, after the bounty lines, append a `.coin-tree` row: the
  stage name (or "No tree"), then "watered today" / "not watered today", and one
  `<button class="btn">` built from the state:
  - no tree: **Plant · 10**
  - not watered: **Water · 2 (+pay)**
  - watered, with a next stage: **Grow · cost**, disabled with the balance as its
    title when the player can't afford it
  - watered oak: no button
  - Saturday or Sunday: no button, text "Resting till Monday"
- Underneath, a small note: *3 weekdays without water drops a stage.*
- Click: plant and grow go through `confirm()` like the Spend button. Water
  doesn't, since it's the daily tap. Each then calls
  `window.spendCoins({ kind, by: acctEmail })`.
- The Spending rules list gets one `<li>` with the table in a sentence:
  *Tree — plant for 10, grow for 25 / 50 / 100, water for 2 a weekday and it
  pays 2 / 3 / 5 / 7.*
- CSS: `.coin-tree` sits inside `.coin-you`, with a top border and the button
  aligned right.

Check by hand in the browser: plant, water, grow, and reload to see the state
persist.

Commit: *The coins sheet holds your tree, and one button for what it needs today*

## 4. The dot on the pill

- `#coins.coin-thirsty::after`: an 8px green dot on the pill's top-right corner.
- In `renderCoins`: toggle `coin-thirsty` when there's a living tree, today is a
  weekday, and it isn't watered.
- The pill's title becomes *"Your tree wants water"* while the dot shows.

Commit: *The wallet shows a dot while your tree waits for water*

---

## Not in this plan

Disasters, more than one tree, and anything past the oak, as the spec says.
