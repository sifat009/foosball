# The draw has no memory

Every draw since the first cup has been a fresh roll. `spinBtn.onclick` picks a
uniform random unpicked forward and a uniform random unpicked defender
(`index.html:3216-3217`), and nothing anywhere records that those two have been
teammates six times already.

Over sixteen cups that has produced a league where the same names keep landing
together:

| Pair | Cups together |
|---|---|
| Sajeeb + Toufiq | 7 |
| Nur + Sifat | 6 |
| Ofi + Rifat | 6 |
| Rashed + Sazedul | 6 |
| Shewa + Siddiq | 4 |
| Rifat + Toufiq | 4 |
| Sajeeb + Shewa | 4 |

Six of the fifteen cup-to-cup transitions repeated at least one team. The worst
was the most recent: cup 15 to cup 16 carried **three of five teams** straight
over — Ofi+Rifat, Rashed+Sazedul, Sajeeb+Toufiq.

The dice are not broken. With five forwards and five defenders there are only
twenty-five possible pairs, and eighty teams have been formed, so every pair is
*expected* about 3.2 times. A memoryless draw on a pool that small will always
clump. The fix is to give it a memory.

## The rule in one sentence

A pair that were teammates in any of the last three cups cannot be drawn
together again.

That is the whole rule. No rankings, no seeding, no special handling for weaker
players — everyone is subject to the same three-cup cooldown, and the players who
were stuck together get unstuck as a side effect.

## What this is not

It is not a rotation. An earlier design guaranteed that every forward met every
defender exactly once per five-cup cycle, which is a Latin square. It delivers
perfect fairness and it was rejected, for a reason worth recording: **any rule
that guarantees a full rotation makes the last cup of each cycle deterministic.**
Simulated, the number of legal draws collapses 120 → 44 → 13 → 2 → 1 across a
cycle. The fifth cup has exactly one possible outcome and the fourth has two, so
on those nights the wheels are ceremony and everyone present already knows the
teams.

A four-cup cooldown reaches the rotation by another road and pays the same
price, in a worse form. On a 5×5 roster it blocks four of five partners per
forward, so exactly one partner survives — and those survivors always form a
valid matching. From the fifth cup onward there is **one legal draw, forever**.
Worse than the Latin square, which at least restarts with a 120-way choice at
the top of each cycle; a rolling four-cup cooldown never restarts, so cup 5's
teams are cup 10's teams are cup 15's teams until the roster changes. The
relaxation in step 3 below never rescues it, because one arrangement always
survives — which is why the code loosens at one, not at zero.

Three cups is the largest cooldown that leaves the draw genuinely open. It
forbids three of five partners per forward, leaving a 2-regular bipartite graph
that in practice yields two or three arrangements a night — few, but never one,
and never the same two nights running.

## Measured effect

Simulated sixteen-cup runs, compared against the sixteen cups actually played:

| | worst repeated pair | back-to-back repeats | legal draws per cup | all five partners within 5 cups |
|---|---|---|---|---|
| today | 7 | 6 | 120 | 1% |
| cooldown 2 | 4.8 | 0 | ≥12 | 1% |
| **cooldown 3** | **4.0** | **0** | **2–3** | **41%** |
| cooldown 4 | 4.0 | 0 | 1 from cup 5 on | 100% |

Four thousand simulated sixteen-cup runs each. At cooldown 3 the worst pair never
once exceeded 4, against 7 actually played. Everyone meets everyone inside five
cups 41% of the time, inside six 65%, inside eight 88% — the rotation as a strong
tendency rather than a promise, which is the most that can be had without
handing back a determined night.

Weighting the choice toward the most overdue pair was measured and skipped. It
buys coverage — 96% within eight cups — but concentrates the probability: some
nights one arrangement carries 98% of the mass, so the night is determined in
everything but name. Among the legal draws the choice stays uniform.

The cooldown does not promise that any one player meets every partner in turn.
It promises four different partners in any four consecutive cups. That is the
trade: a live draw every night instead of a schedule.

## Data

Teams are not recorded anywhere. `history/<cupId>` holds `champion`, `date`,
`players` and `awards`, and the ledger needs to know who played with whom.

Teammates share an identical stat line, so pairs *can* be reconstructed by
grouping players on `[p, w, gf, ga]` — this is how the numbers above were
derived, and it resolves all sixteen cups with no ambiguity. It is not the
mechanism to ship. The day two teams finish a cup with the same record it
produces a bucket of four names and fails silently.

So one new field, written going forward and backfilled once:

```
history/<cupId>
  champion: "Rifat + Ofi"              unchanged
  date:     1788424636525              unchanged
  players:  { … }                      unchanged
  awards:   { … }                      unchanged
  teams:    [ { fwd: "Rifat", def: "Ofi" }, … ]    new
```

`recordChampion` (`index.html:5025`) takes the array and writes it; `syncChampion`
(`index.html:4279`) passes the live `teams`. The rules grant `history` to the
admin wholesale with no per-field validation, so no rules change is needed.

The sixteen existing cups are backfilled once from the stat-line reconstruction.
Role order in those entries is not real history — history never stored it. The
champion string fixes the order for one team per cup and the rest are
reconstruction order. Nothing reads them: the ledger sorts the pair before
keying. Do not treat a backfilled `fwd`/`def` as evidence of who played where.

Only cups with a recorded champion enter the ledger. An abandoned cup never
reaches `history` and never counts against a pair — correct, since those teams
barely played.

## The ledger

From the history entries the app already subscribes to (`index.html:5040`), build
one map: for each unordered pair of names, the index of the most recent cup they
were teammates.

The key is the two names sorted, never the roles. This matters more than it
looks: roles are not stable. Sifat, Nur, Sazedul and Siddiq have each played
both forward and defender across the sixteen cups, so a ledger keyed on
"forward X, defender Y" would miss half the repeats. The question is only ever
*were these two on the same team*.

## Choosing the draw

The plan is built on the first spin rather than when the draft opens, and it is
built from whoever is still undrafted. That one choice covers the admin
reloading mid-draft: the plan lives only in memory, and rebuilding it for the
remaining players is correct whether it is the first spin or the fourth. It is
never published and never saved — a viewer who could read it would know the
teams before the wheels turned.

Given the forwards and defenders still available:

1. Enumerate every perfect matching of forwards to defenders. 120 for 5v5, 720
   for 6v6; the roster has never exceeded six a side.
2. Discard any matching containing a pair whose last cup was one of the last three.
3. If one or fewer survive, drop the cooldown by a cup and try again, down to
   nothing. A thin roster must never wedge the draw, and a roster that leaves a
   single arrangement must never turn the wheels into a replay. Four a side is
   the case that matters: three of four partners blocked leaves each forward one
   legal partner, and the club has played two cups that short.
4. Pick uniformly at random from the survivors.
5. Shuffle the order of the resulting teams, so the reveal does not run down the
   roster.

The result is an ordered list of `{fwd, def}` pairs — the plan the wheels will
land on. Enumeration uses reservoir sampling rather than collecting every
candidate: the count is factorial and exactly one of them is ever used.

Roster changes need no special handling. Abir and Irin have come and gone, and
two cups ran with eight players. A pair that has never played has no cooldown
entry and is simply free. This is where the rotation design would have broken,
and it would have broken in four of sixteen cups.

## The spin replays the plan

`spinBtn.onclick` stops rolling dice. It takes the next pair off the plan and
resolves it to the two wheel indices, then proceeds exactly as it does today:
publish `{ n, fi, di, sf, sd }`, call `animateSpin`, `finishSpin` forms the team.

Nothing downstream changes. The published spin record has the same shape, so
every viewer replays through the same path (`index.html:3612`) and sees the same
wheels turn for the same duration and land with the same click and the same
ding. The last-pair auto-assign (`index.html:3234`) still fires when one of each
remains.

## Nothing user-facing changes

This is deliberate and was decided explicitly. Viewers see two wheels spin and
match up, exactly as they always have. The only difference is which name comes
up.

No blocked-pairs list, no dimmed wheel segments, no explainer rewrite. The "How
the Cup works" sheet says "The wheel order is random" (`index.html:1611`), which
describes the segment layout and stays true.

Dimming the impossible segments was considered and does not fit regardless:
`animateSpin` turns both wheels in one loop and lands them together
(`index.html:3185`), so there is no moment when the forward is known and the
defender wheel is still turning.

## Check

`planDraw` lives in the classic script at `index.html:1762`, so it is a global
and `test.mjs` can reach it through `page.evaluate` — the pattern the suite
already uses. Added there:

- a pair from any of the last three cups never appears in the plan
- a four-a-side roster pinned to a single legal arrangement returns more than one
  distinct plan across repeated calls — the loosening fires at one, not at zero
- the plan is a valid perfect matching: every forward and every defender once
- the chooser returns a full plan for 4v4, 5v5 and 6v6 rosters, and for a
  cooldown state tight enough to force the relaxation path
- over sixteen simulated cups the worst pair count stays below five

## Skipped

The win-rate ladder is not consulted. Rashed at 18% and Siddiq at 23% are the
two weakest players and the two most in need of fresh partners, and the cooldown
gives them that without naming them anywhere in the code.

No UI for inspecting or editing the ledger. If a pairing looks wrong the history
node is the source of truth and is already visible.
