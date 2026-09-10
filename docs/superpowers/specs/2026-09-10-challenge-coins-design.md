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
row buys nothing the first has not already bought. An ignored row spends nothing
and burns nobody's one re-spin: only an honoured row counts against the limit.

The rejected partner is not consulted. The draw has always assigned partners
without asking, and putting a second person between the payer and the wheel
would turn a fifteen-second moment into a negotiation.

### Ten coins, once a cup

A re-spin costs **10 coins**, and a player may buy one per tournament. Nothing
escalates, because nothing repeats: your second re-spin of the night does not
have a price, it has a refusal.

At two coins a win that is five challenge wins for one re-spin — about a week of
lunch games, not an afternoon. The scarcity is the point, and it was chosen over
a cheaper start with eyes open: a re-spin should be a thing the room talks about
afterwards, not a routine step in every draft. The cost is a slower first
purchase from a board sitting at zero, which is the risk this design is
otherwise built to avoid.

Escalating prices were designed and dropped. They existed to stop a player with
a large balance spinning until they got the partner they wanted; a hard limit of
one does that outright and needs no table. `4 << n` is a rule to explain. "Once a
cup" is not.

The limit also makes the blocking rule almost decorative. A player who re-spins
has forbidden themselves exactly one partner for the night, and cannot reach the
second.

## The rotation binds, and sometimes it binds absolutely

`planDraw` runs a rotation as of 2026-09-10: inside a cycle no pair plays twice,
so every forward meets every defender before anyone repeats. The legal draws
collapse across a five-cup cycle:

| Night of cycle | `cool` | Legal draws | Re-spins available |
|---|---|---|---|
| 1 | 0 | 120 | freely |
| 2 | 1 | 44 | freely |
| 3 | 2 | 13 | usually |
| 4 | 3 | 2 | at most one, whoever gets there |
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
ten coins by one person who did not like their partner.

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
2 x (challenge wins)  -  10 x (honoured re-spins on cups that reached history)
```

A cup with no recorded champion charges nothing — the same rule the pair ledger
follows, and for the same reason. Correcting a mistyped challenge score corrects
every wallet in the building immediately, with nothing to migrate.

## What the rules cannot do

The rules cannot count coins. They cannot sum a wallet any more than they can
tell who the four people at the table were — the honour system the score flow
already runs on.

So enforcement sits where it changes something. Every client replays the rows of
`respins/<cupId>` in `at` order, honouring a row only when the payer has 10 coins
at that point and has not already had one honoured this cup. Everything else is
ignored and not charged. The walk is deterministic, so the admin's draft and
every reader's ledger reach the same answer, and the once-a-cup limit needs no
storage of its own — it is a property of the rows already there.

A forged row — filed by someone not in the landed pair, or after the pair
committed — fails the same replay and does nothing. Writing it is possible.
Having it mean anything is not.

## The hold, and how viewers see it

The one genuinely new piece of the draft, and smaller than it first looks.

Today `animateSpin` lands and its callback runs `finishSpin`, which after a beat
calls `formTeam` — and `formTeam` calls `save()`. That `save()` is what puts the
team on every other screen. **Viewers never form a team from a spin.** They
animate when `s.spin.n` changes (`index.html:3730`) and read `teams` straight out
of the snapshot (`index.html:3717`).

So the hold is one delay on one client. `finishSpin` waits before `formTeam`
instead of committing after 1100ms, and every viewer is already waiting on that
`save()` — nothing to synchronise, no shared clock, no divergence between what
the admin sees and what the room sees.

A re-spin is then an **ordinary spin**. The admin discards `drawPlan`, adds the
rejected pair to the blocked set, and publishes `{ n: n + 1, ... }` exactly as
`spinBtn.onclick` does today. Viewers see `n` change and animate again. No team
was formed, so there is nothing to undo, and no viewer code changes at all.

One field is added, and only so the countdown reads the same everywhere:

```
cup.spin   { n, fi, di, sf, sd, at }      at: when the wheels landed
```

Viewers render the remaining hold from `at`; the admin renders it from the same
number. It decides what the countdown says, never what is committed. An earlier
draft of this design made every client commit on `at + HOLD_MS`. That was
solving a problem the replay path does not have, and it would have introduced
one — two clients disagreeing about a team.

The re-spin fires by itself when an honoured row arrives, rather than waiting for
the admin to tap again. The payer drove it; making the room wait on the admin
noticing turns a fifteen-second moment into an awkward one.

The last-pair auto-assign needs no special case. One forward and one defender
remaining is one legal arrangement, the availability check finds no alternative,
and no button appears.

## Surface

The wallet's home is the **home screen**, not the challenge board. Putting it
only where challenges live would repeat the mistake this whole design exists to
correct: the board has sat behind a toolbar button with a badge count for nine
days and has zero rows. A reward nobody can see from where they already are is
not a reward.

### The coins card

A `#coins` card on `#tourney`, above the Group Stage. It is the same conditional
`.card` pattern `#golden` already uses (`index.html:1587`), so it needs no new
layout primitive, and it costs nothing in data — every balance derives from the
lobbies and `respins` rows the page already subscribes to. No node, no rule, no
migration.

Above the group stage rather than below it, which looks backwards during a live
cup and is right the rest of the time: the card matters most **between** cups,
when the group stage is finished and the screen is otherwise empty. It is
prominent exactly when the challenge board is the thing that should be happening.

Every player, every balance, highest first, level balances alphabetical — the
same tie rule `chalLadder` uses, so the card never reorders itself between two
readers. Yours is marked.

**It is never hidden.** This is the one place it must differ from `#golden`,
which disappears when there is nothing to show. Every balance is 0 today, and
ten names on zero under "nobody has earned a coin yet — two coins a win" is the
strongest prompt in the app. A card that switches itself on only once somebody
has earned is a card that appears after it has stopped being needed.

### The sheet

Tapping the card opens its own sheet, in the shape of "How the Cup works": what a
coin is, `+2` for a challenge win, `10` buys one re-spin a cup, your balance, and
whether you can afford one right now.

It ends in a button that opens the **Challenges** board. That button is the point
of the whole surface. An explainer tells somebody what a coin is worth; the
button is what turns having read it into a lobby, in the one tap where they are
still interested. Folding this into the footer's rules sheet was considered and
dropped: it lands a curious player in a wall of format rules, several scrolls
from anything they can act on.

### Elsewhere

The Challenges ladder gains a Coins column, for the people already looking at it.
During the hold, the two named players see a button carrying the price; everyone
else sees the countdown. One paragraph in "How the Cup works", next to the
rotation.

All of it wraps on a phone. Ten short name-and-number pairs is a chip row, not a
table, and the app is phone-first everywhere else.

## Check

`planDraw` is a global in the classic script, so `test.mjs` reaches the logic
through `page.evaluate`, the pattern the suite already uses:

- a rejected pair never reappears later in the same draft
- a re-spin publishes an ordinary n+1 spin, and no team is formed for the landing
  it replaced
- the availability check refuses on the last night of a cycle, and charges nothing
- the check never triggers the `!seen && cool > 0` fallback — a tight night with a
  paid re-spin leaves the rotation's blocking set exactly as it was
- a second row from the same player in one draft is ignored and costs nothing,
  and the limit resets at the next cup
- a row the payer cannot afford is ignored by the replay and costs nothing
- two rows against the same spin index: the earlier `at` stands
- balance is `2 x wins - charges`, and a cup with no champion charges nothing
- a re-spin on the second-to-last pair is refused when it would force the payer
  onto the only remaining player anyway
- the coins card renders with every balance at zero, and is not hidden there
- level balances sort alphabetically, so two readers see the same order

In `test-rules.mjs`, matching the existing coverage: a row must carry the
writer's own address, and an existing row cannot be overwritten or deleted.

## Skipped

**Push on a purchase.** The relay already watches `challenges` directly and one
more listener would announce "Rifat spent 10 coins rather than play with Nur" to
every phone in the office. That is the strongest growth loop available here and
it is deliberately not in v1 — add it once people are earning, when the
announcement has something to announce.

**Escalating prices.** Superseded by the one-a-cup limit, which achieves the
same thing without a table.

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
