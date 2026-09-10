# Coins: what a challenge win is worth

`challenges.json` is `null`. Not a handful of stale lobbies — the node has never
held a row. The board shipped on 2026-09-01, the score-confirmation flow on
2026-09-02, and in the nine days since, nobody has opened a single pickup game.

It is not access. All ten players are in `EMAIL_NAMES`. It is not plumbing. The
rules are enforced and covered by `test-rules.mjs`, and the relay announces a
lobby three times — opened, filled, scored. It is not discovery. `chalBtn` sits
in the toolbar at all times and carries a badge count.

It is that the board asked people to schedule something they already do without
scheduling it. Games between cups happen; they happen by four people walking to
the table. A lobby with a kick-off time is a calendar invite for a lunch break.
And the README says out loud what the reward for filing one is: *"casual 2v2
pickup games that count for nothing a cup counts."*

Meanwhile the thing that does count runs constantly:

| | |
|---|---|
| Cups played | 17 in 46 days |
| Average gap | 2.7 days |
| Roster | 10, at near-perfect attendance — five players 17 of 17 |
| Challenge lobbies ever opened | 0 |

A player asked to record a game that counts for nothing, two days before a cup
that counts for everything, is being asked for a favour. Seventeen times out of
seventeen they have declined.

## The rule in one sentence

Winning a challenge earns coins, and coins buy you out of a partner you don't
want at the draft.

## Earning

Two coins to each player on the winning side of a **settled** challenge — a
score both sides agreed. A claim sitting in `pending` pays nothing, which is the
same line the ladder already draws: everything derived reads `score`.

Nothing for a draw, nothing for a loss. The board goes on storing draws and
goes on giving them a column, because Win % still needs them; they simply do
not pay. Attendance is not an achievement, and a coin that arrives for turning
up is a coin that buys nothing anyone respects.

## Spending

The wheels turn exactly as they do today. `planDraw` is not consulted about
coins, no pair is bought in advance, and no viewer learns anything before a
landing that they would not have learned anyway.

A pair lands. Before it commits, **either of the two** may pay to reject the
other. Then:

- that pair is blocked for the rest of this draft, and only this draft
- both players return to the pool
- `drawPlan` is discarded and rebuilt over everyone still undrafted
- the wheels turn again

If both players file against the same landing, the earlier `at` stands and the
other is ignored and not charged — the pair is blocked either way, so the second
row buys nothing that the first has not already bought.

The rejected partner is not consulted. The draw has always assigned partners
without asking, and putting a second person between the payer and the wheel
would turn a fifteen-second moment into a negotiation.

### The price escalates

| Re-spin, per player, per draft | Cost |
|---|---|
| first | 4 |
| second | 8 |
| third | 16 |

`4 << (n)` where `n` is how many that player has already bought tonight.

Flat pricing was considered and rejected. At two coins a win, four coins is two
wins — cheap enough that the first purchase is reachable in a lunch break, which
is the number that matters most while the board is at zero. But a flat four
lets a player sitting on twenty coins spin until they get the partner they
wanted, and a draft that can be bought outright is not a draft. Doubling makes
the third attempt cost eight wins. Nobody will do it twice for fun.

The blocking rule limits it a second time and independently: each re-spin
burns a partner. A player who re-spins twice has forbidden themselves two of
the five people they could have been drawn with.

## The rotation binds, and sometimes it binds absolutely

`planDraw` runs a rotation as of 2026-09-10: inside a cycle no pair plays twice,
so every forward meets every defender before anyone repeats. The legal draws
collapse across a five-cup cycle:

| Night of cycle | `cool` | Legal draws | Re-spins available |
|---|---|---|---|
| 1 | 0 | 120 | freely |
| 2 | 1 | 44 | freely |
| 3 | 2 | 13 | usually |
| 4 | 3 | 2 | at most one, all night |
| 5 | 4 | 1 | **none** |

On the last night of a cycle the draw is determined by construction. There is
nowhere for a re-spin to go, so the button is not offered and nothing is
charged. This is not a defect to engineer around. The rotation exists because
Rashed and Siddiq — 0 cup wins between them across 30 appearances — needed every
partner in turn rather than a tendency toward it, and `planDraw` already refuses
to trade that away: *"relaxing there would give back the guarantee the whole
thing was built for."*

So coins are worth most at the top of a cycle and worth nothing on its last
night. That is a rule players can hold in their heads, and it is the honest
consequence of a guarantee the club already chose.

**The availability check must not relax.** Before the button is offered, the
page enumerates matchings over the undrafted players at the current `cool` and
asks whether one exists pairing the payer with somebody other than the name on
the wheel. That enumeration runs *without* the `if (!seen && cool > 0)` fallback.
Left in, a paid re-spin on a tight night would silently forget the oldest cup of
the cycle and dissolve the rotation for all ten players — the guarantee sold for
four coins by one person who did not like their partner.

## Data

One node, append-only:

```
respins/<cupId>/<pushId>   { name, email, rejected, n, at }
```

Append-only is the simplest rule in the file — a verified account, a row
carrying its own `auth.token.email`, writable only when `!data.exists()`. No
seat logic, no overwrite path, no delete. `n` is the spin index the row answers,
so a row is tied to one landing and a duplicate is visible.

Nothing else is added anywhere. No field on `history`, no change to
`recordChampion` or `syncChampion`, no migration, no rollup.

The blocked-pair list is **not** session state. It is read back out of
`respins/<cupId>`, so an admin reload mid-draft rebuilds it exactly as it already
rebuilds `drawPlan` from whoever is left.

## Balance

Derived at render, never stored, the way `career()` and `chalLadder()` already
work:

```
2 x (challenge wins)  -  sum of re-spin prices on cups that reached history
```

A cup with no recorded champion charges nothing — the same rule the pair ledger
follows, and for the same reason. Correcting a mistyped challenge score corrects
every wallet in the building immediately, with nothing to migrate.

## What the rules cannot do

The rules cannot count coins. They cannot sum a wallet any more than they can
tell who the four people at the table were — the honour system the score flow
already runs on.

So enforcement sits where it changes something. Every client replays the rows of
`respins/<cupId>` in `at` order, charging each at the escalated price only if the
balance covers it at that point and ignoring it otherwise. The walk is
deterministic, so the admin's draft and every reader's ledger reach the same
answer. A row nobody could afford is written, ignored, and never charged.

A forged row — filed by someone not in the landed pair, or after the pair
committed — fails the same replay and does nothing. Writing it is possible.
Having it mean anything is not.

## The hold, and how viewers see it

The one genuinely new piece of the draft. Today `animateSpin` lands and
`finishSpin` forms the team. Between them goes a hold with a visible countdown,
defaulting to **15 seconds**, showing the two names and the price to each of
them.

The commit must be identical on every client, and viewers replay from the
published record rather than from messages, so the record carries the clock:

```
cup.spin   { n, fi, di, sf, sd, at }      at: new
```

Every client — admin and viewer alike — forms the team when `at + HOLD_MS`
passes with no replacement. A record arriving with the **same `n`** replaces the
previous landing: the first is discarded, never formed, and the new one animates.
No extra signal, no commit message, no divergence between what the admin sees and
what the room sees.

The last-pair auto-assign needs no special case. One forward and one defender
remaining is one legal arrangement, the availability check finds no alternative,
and no button appears.

## Surface

The wallet lives in the **Challenges** overlay header, and the ladder gains a
Coins column. Deliberate: the only place to see what you have is the board we
want opened. During the hold, the two named players see a button with their own
price on it; everyone else sees the countdown.

One paragraph in "How the Cup works", next to the rotation.

## Check

`planDraw` is a global in the classic script, so `test.mjs` reaches the logic
through `page.evaluate`, the pattern the suite already uses:

- a rejected pair never reappears later in the same draft
- the availability check refuses on the last night of a cycle, and charges nothing
- the check never triggers the `!seen && cool > 0` fallback — a tight night with a
  paid re-spin leaves the rotation's blocking set exactly as it was
- prices escalate 4 / 8 / 16 per player per draft, and reset at the next cup
- a row the payer cannot afford is ignored by the replay and costs nothing
- two rows against the same spin index: the earlier `at` stands
- balance is `2 x wins - charges`, and a cup with no champion charges nothing
- a re-spin on the second-to-last pair is refused when it would force the payer
  onto the only remaining player anyway

In `test-rules.mjs`, matching the existing coverage: a row must carry the
writer's own address, and an existing row cannot be overwritten or deleted.

## Skipped

**Push on a purchase.** The relay already watches `challenges` directly and one
more listener would announce "Rifat spent 4 coins rather than play with Nur" to
every phone in the office. That is the strongest growth loop available here and
it is deliberately not in v1 — add it once people are earning, when the
announcement has something to announce.

**A second sink.** Coins buy one thing. The wallet is generic by construction —
a spend is a priced row against a cup — so a second sink is a price and a button,
decided after watching real balances rather than guessed at now.

**Naming a replacement partner.** Rejected in favour of the re-spin: paying to
land on a specific person makes the draft purchasable, and the rotation would
have to yield to honour it.

**Rules-enforced affordability.** Impossible, as above. The replay enforces it.

**A veto for the rejected partner.** The draw never asked them either.

**Coins on the profile card.** The wallet is a live balance, not a career stat.
If a lifetime-earned figure is wanted later it is one more derivation over the
same lobbies.
