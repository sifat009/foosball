# Coins — implementation plan

Spec: `docs/superpowers/specs/2026-09-10-challenge-coins-design.md`

Three phases. **Phase 1 ships on its own** and should: it touches nothing the cup
runs on, and it starts people earning before there is anything to spend on. A
re-spin is meaningless while every balance is 0, so the wallet has to exist first
and accumulate for a week or two. Phase 2 is the only part that goes near the
draft.

---

## Phase 1 — Earning and the wallet

Read-only. No new writes, no rules change, no change to any cup code path.

### 1.1 Subscribe to `respins`

Beside the challenges listener (`index.html:5173`):

```js
onValue(ref(db, 'respins'), snap => { allRespins = snap.val() || {}; renderCoins(); }, …)
```

Small node, whole-node read, same shape as the challenges subscription. Nothing
writes to it until Phase 2 — it exists now so the balance function is complete
and never needs revisiting.

### 1.2 `coins(chalRows, hist, respins)` — next to `chalLadder` (`index.html:2512`)

Returns `{ name: balance }`. A chronological walk, so a spend can only be
honoured out of coins already earned:

- **Earn** — for each lobby where `chalDone(c)`, the winning side (`c.score.b >
  c.score.r`) gets `+2` per seated player. `b === r` pays nothing. A lobby with
  only `pending` pays nothing, matching what `chalLadder` already reads.
- **Timestamp** — a lobby earns at its own `at`. The agreed score carries no time
  of its own, and a lobby is scored the day it opens.
- **Spend** — `-10` per honoured re-spin row, at the row's `at`.
- **Honoured** means all three: the payer's balance is `>= 10` at that instant,
  no earlier row from that payer in the same cup was honoured, and the cup
  reached `history`.
- **Order** — merge earnings and spends into one list sorted by timestamp and
  walk it once. Deterministic, so every client agrees.

One consequence to write in a comment: the running cup is not in `history` yet,
so its own rows are treated as spent while it is live and stop being charged if
it is abandoned. An abandoned cup refunds everyone, the same way it counts for
nothing else.

### 1.3 The `#coins` card

A `.card` on `#tourney` above `<details id="groupSection">` (`index.html:1582`),
built like `#golden` (`index.html:1587`) — but **rendered unconditionally**, never
`display:none`. Every player from `EMAIL_NAMES`, balance descending, level
balances alphabetical (the `chalLadder` tie rule, so two readers never disagree).
Yours marked. Chips that wrap, not a table.

Empty state carries the pitch: *"Nobody has earned a coin yet — two coins for a
challenge win."*

### 1.4 The sheet

A `hall-card` overlay in the shape of `#rules` (`index.html:1616`), wired through
the same `[btn, panel, close]` table at `index.html:2912` that already wires the
Hall, Challenges and Notifications overlays. Content: what a coin is, `+2` a win,
`10` buys one re-spin a cup, your balance, whether you can afford one.

Ends in a button that closes the sheet and opens `#chal`. This is the conversion
step — build it as a real primary button, not a link.

### 1.5 Coins column on the challenge ladder

`chalLadder` (`index.html:2512`) gains a column from the same `coins()` result.

### Check (`test.mjs`, via `page.evaluate` on the globals)

- two wins pay 4; a draw and a loss pay 0
- a lobby with only a `pending` claim pays nothing
- balances are `2 x wins` with no respins present
- the card renders at all-zero and is not hidden
- level balances sort alphabetically
- the sheet's button opens the challenge overlay

---

## Phase 2 — The re-spin

### 2.1 Rules (`database.rules.json` + `test-rules.mjs`)

```
"respins": {
  ".read": true,
  "$cup": { "$id": {
    ".write": "auth != null && auth.token.email_verified === true && !data.exists()",
    ".validate": "newData.hasChildren(['name','email','rejected','n','at'])
                  && newData.child('email').val() === auth.token.email",
    …
  } }
}
```

Append-only: no overwrite, no delete, no seat logic. `test-rules.mjs` covers a
row carrying somebody else's address, and an attempt to overwrite or delete an
existing row.

### 2.2 `planDraw` takes a blocked set

`planDraw(fwdNames, defNames, ledger, cool, blocked)` (`index.html:3227`) — one
condition in the existing walk, beside `fresh()`:

```js
if (blocked.has(pairKey(fwdNames[i], defNames[j]))) continue;
```

The set is rebuilt from `respins/<cupId>` on every call, so an admin reload
mid-draft restores it exactly as it already restores `drawPlan`.

### 2.3 The availability check

`canRespin(payer, partner)` — enumerate matchings over the undrafted players at
the **current `cool`**, with the blocked set, and return whether one exists
pairing `payer` with anyone else.

**It must not use the `if (!seen && cool > 0)` fallback** (`index.html:3245`). Left
in, a paid re-spin on a tight night would forget the oldest cup of the cycle and
dissolve the rotation for all ten players. Give `planDraw` a flag that suppresses
the relaxation, and have `canRespin` set it. This is the single most important
line in Phase 2.

### 2.4 The hold

In `finishSpin` (`index.html:3348`), replace the fixed `1100`ms before `formTeam`
with a hold of `HOLD_MS` (15s), and put `at: Date.now()` on the published spin
record so viewers render the same countdown.

Viewers need no other change — they already animate on `s.spin.n` and take
`teams` from the snapshot. Do not touch the replay block at `index.html:3730`.

During the hold, a player in the landed pair who can afford it and passes
`canRespin` sees a button. Everyone else sees the countdown.

### 2.5 Acting on a row

The admin's page watches `respins/<cupId>`. On an honoured row for the current
`n`: cancel the pending `formTeam`, add the pair to `blocked`, clear `drawPlan`,
and publish `{ n: n + 1, … }` — the same path `spinBtn.onclick` (`index.html:3336`)
already takes. It fires automatically; the room should not wait on the admin
noticing.

Guard `sess !== session` on every timer, as the existing code does.

### Check (`test.mjs`)

- a rejected pair never reappears later in the same draft
- a re-spin publishes an ordinary `n+1` spin, and no team is formed for the
  landing it replaced
- `canRespin` is false on the last night of a cycle, and nothing is charged
- **the availability check never relaxes** — a tight night with a paid re-spin
  leaves the blocking set exactly as it was
- a second row from the same player in one draft is ignored and costs nothing
- a row the payer cannot afford is ignored and costs nothing
- two rows against the same spin index: earlier `at` stands
- a re-spin on the second-to-last pair is refused when it would force the payer
  onto the only remaining player anyway
- balance is `2 x wins - 10 x honoured`, and a cup with no champion charges nothing

---

## Phase 3 — Words

- A `## Coins` section in `README.md`, after `## Challenges`.
- One paragraph in "How the Cup works" (`index.html:1616`), next to the rotation.

---

## Risks

**The availability check relaxing the rotation** (2.3) is the only change here
that can silently damage something people already rely on. It is one flag, and it
has its own test for that reason.

**The hold lengthens every draft** by up to 15s per spin — around a minute across
a five-team draw, on a screen everyone is already watching. If that reads as dead
air, shorten `HOLD_MS`; it is one constant.

**Nobody earns anything.** The real risk, and Phase 1 is the hedge: ship it alone,
watch for two weeks. If `challenges.json` is still `null` at the end of
September, the price is the first knob to turn, not the design.
