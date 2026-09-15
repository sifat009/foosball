# Freeze their rods: buying the seat your opponent stands at

A goal box is keyed by the seat, not the person. `matchBox` draws two inputs per
team, `fwd` and `def` (`index.html:4519`), and `credit` hands each one to the
name that was drafted into it:

```js
add(team.fwd, won, gf, ga, (p && p.fwd) || 0, nil);
add(team.def, won, gf, ga, (p && p.def) || 0, nil);
```

`t.fwd` is fixed for the whole cup — it is the wheel a player came off. So the
forward box belongs to the drafted forward all night, whoever was actually
holding that rod when the ball went in.

Pairs swap rods mid-match. When they do, the goals a player scores from the
other end are filed under his partner's name, and nothing in the record says it
happened: `credit` cannot see a rod, and `ga` is a team total shared by both
halves of the pair, so the Glove does not notice either.

That is a free mechanic sitting in the cup right now. A pair splitting six goals
three and three wins no Golden Boot; the same pair standing one man at the
forward rod all evening files six under one name and takes it. Nobody has to
cheat to do this — it is what the boxes mean.

This spec does not close that hole. It puts a price on it and hands it to the
other side of the table.

## The rule in one sentence

Before a match you are playing in, ten coins names both seats of the opposing
pair, and they hold those rods for the whole match.

## Spending

**Who.** Only the two players in that fixture, and only against the other pair.
A spectator with ten coins cannot reach in. Buying the Boot race of two people
you will never face is a different game, and a nastier one.

**When.** From the moment the fixture exists until a score is filed against it.
A knockout tie cannot be frozen before the round that fills it, because until
then it has no opponents to name.

**How much.** Ten coins, the same as a re-spin, on its own budget. **One
honoured freeze per payer per cup** — group match or final, spent where it hurts
most.

**What you name.** Both seats of the opposing pair. There are exactly two
arrangements, and both are worth buying:

| You name | What it buys |
|---|---|
| Their drafted arrangement | A lock. They cannot swap mid-match to pile goals onto one name. |
| The swap | Their scorer spends the match filling his partner's box. |

Naming the drafted arrangement is not a wasted spend. It is the cheaper thing to
understand and it is the only defence against the laundering above.

**Both sides may spend.** Sifat freezing Toufiq + Siddiq does not stop Toufiq
freezing Sifat + Rifat in the same match. They are two payers, two rows, two
budgets, and both are honoured.

**One arrangement per match, per pair.** Sifat and Rifat can both afford to
freeze the same opponents, and could name opposite arrangements. The **earlier
`at` stands**; the second row is ignored and charged nothing. Same rule the
replay already uses for two re-spins against one spin index.

## Where the goal gets filed

Nothing about goal entry changes. The boxes stay welded to `t.fwd` and `t.def`,
and that weld is the feature.

Draft is `t.fwd = Toufiq`, `t.def = Siddiq`. Siddiq is four clear in the Boot
race. Sifat pays and freezes Siddiq onto the **forward** rod.

| | Scored | Filed in | Credited to |
|---|---|---|---|
| Siddiq, at the forward rod | 4 | `fwd` box | **Toufiq** |
| Toufiq, at the defence rod | 1 | `def` box | **Siddiq** |

Siddiq scores four and banks one. The other four land on a partner who scored
once. Ten coins moved a Boot run across the table.

It runs in both directions, because defenders are in the Boot race: `boot` is
`lead(ns, bootKey(P))` over every player in the rollup with no pool filter
(`index.html:4910`), and only the Glove is gated, by `keepers` on the cup-wide
defence pool (`index.html:4898`). So whichever half of the pair is chasing the
Boot, you stand him on the rod that is not his.

The goals are not destroyed. They are donated to his partner. The same ten coins
tank one Boot run and inflate another, which means the spend can be aimed at the
leader or used to prop up a rival and split the race.

## Data

`freezes/<cupId>/<matchId>/<pushId>`, append-only, exactly as `respins` is: a
row carrying its own `auth.token.email`, writable only when the row does not
exist. No overwrite, no delete, not even by the admin.

The row holds the payer, the two names, and which of them takes the forward rod.
`at` is the write time, and it is what the replay orders on.

**The match key.** Matches have no id. They live positionally in
`groups[i].matches[j]` and `koRounds[r][i]`, and the archive stores them
positionally too (`index.html:4270`). So `matchId` is that position —
`g<group>.<match>` for the group stage, `k<round>.<match>` for the knockout.

Re-running an earlier knockout round voids everything after it, which can leave
a freeze row pointing at a slot that now holds a different fixture. **A freeze
whose two names are not the pair currently in that slot is ignored and charged
nothing.** The row stays — it is append-only — and the replay simply does not
honour it. This is the same shape as a row nobody could afford: written,
ignored, never charged.

## Balance

`2 x wins - 10 x (honoured re-spins + honoured freezes)`.

One more row type in the walk that already exists, in the same chronological
order, honoured under the same two conditions: the payer held ten coins at that
instant, and has had no freeze honoured in that cup already. The walk stays
deterministic, so every reader's ledger reaches the same answer and the
once-a-cup limit needs no storage of its own.

Only cups that reached `history` charge. An abandoned cup refunds everyone, the
way re-spins and the pair ledger both already work. The running cup charges
anyway, which is what stops a second freeze inside the cup happening now.

## What the rules cannot do

They cannot count coins, and they cannot see a rod.

Affordability is decided by the replay, as it already is for re-spins. Whether
the pair actually stood where they were told is decided by the room. Nothing in
the app observes the table, so the freeze is printed on the match card and the
four people present hold each other to it — the same contract a score claim
already runs on, and the same one that makes the existing laundering possible.

This is not a gap to be closed later. A rod is not a thing the database can
reach.

## Surface

**The button.** On the match card, under the pair it acts on, visible only to
the two players in that fixture and only while the match has no score. A coin
disc and `Freeze their rods · 10`. Under ten coins it reads `Not enough coins`
and does nothing — the pill already pitches to people on zero, and this should
too.

**The sheet.** One question: where do these two stand? The two arrangements as
two options, each saying what it buys, and a green `Spend 10 coins` to commit.
Two names and two rods; no picker, no per-player toggles.

**The tag.** Once filed, the button is replaced on the card by a locked line —
who paid, who takes which rod, and that it holds all match. It is the record,
and the card is where it belongs, because that is where the four people will be
looking when they set up.

The two role colours are the ones the draft already uses: `#2563eb` forward,
`#dc5a1e` defender (`index.html:334`).

## What it does not touch

| Code | Why it is unchanged |
|---|---|
| `credit`, `rollupPlayers` | Seats stay welded to `t.fwd` / `t.def`. The weld is the feature. |
| `planDraw`, `pairLedger` | The ledger is keyed on names sorted, never roles (`index.html:3618`). |
| `keepers`, `concededRate` | `ga` is a team total and the defence pool is cup-wide. The Glove cannot see a rod. |
| `groupScores`, `koScores` | The archive shape is unchanged, so every cup already in the Hall replays identically. |
| `canRespin` | There is no rotation to protect here. A freeze cannot wedge a draw. |

No derived figure moves. That is the argument for building it this way: it
prices a mechanic the cup already has instead of rewriting how goals are
counted.

## Check

In `test.mjs`, against the replay:

- a freeze from a player with nine coins is ignored and charged nothing
- a second freeze from the same player in one cup is ignored and charged
  nothing, and the limit resets at the next cup
- two rows against the same match: the earlier `at` stands
- a freeze from a player not in that match is ignored and charged nothing
- a freeze whose named pair no longer occupies that match slot is ignored and
  charged nothing
- an abandoned cup charges nobody; a cup that reached `history` charges
- balance is `2 x wins - 10 x (re-spins + freezes)` with both kinds in one cup
- a freeze changes no entry in `rollupPlayers`, no award in `cupAwards`, and no
  key in `pairLedger`

In `test-rules.mjs`, matching the existing `respins` coverage: a row must carry
the writer's own address, and an existing row cannot be overwritten or deleted.

## Skipped

**Making the record honest.** The alternative build gives each match its own
fwd/def override, relabels the boxes and has `credit` read it, so goals always
land on whoever actually scored. It closes the laundering hole and makes the
freeze a pure tactical handicap with no effect on any trophy. It also touches
`credit`, `rollupPlayers`, the archive shape and the replay path for every cup
already in the Hall. Rejected: the credit consequence is the reason ten coins is
worth spending, and the honest version costs far more code to make the spend
matter less.

**Enforcing the rods.** Impossible, as above.

**A spectator freeze.** Ten coins reaching into a match you are not in makes the
Boot race purchasable by people with no stake in it.

**Freezing your own pair.** You already choose where you stand. There is nothing
to buy.

**Undo, or a counter-spend.** A filed row is the record. An arms race over one
match turns a ten-coin spend into a twenty-coin spend and settles nothing.

**Push on a freeze.** Same reasoning the coins spec gave for re-spins: the
announcement is the strongest loop available and it waits until people are
earning.
