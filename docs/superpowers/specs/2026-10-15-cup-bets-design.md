# Cup bets: who wins the cup

Spectator bets gave a challenge somewhere for coins to go. A cup has nobody
watching to bet on it, because nearly everyone is in it. So here everyone bets,
on any team, their own included.

The README says coins buy nothing in the Cup. A bet changes nothing about how the
cup is drawn or played, so that still holds.

## The rule

When the draft wheels stop on the last team, bets are open for **five minutes**.
Anyone on the player list can bet **1–10 coins on one team**. Each player gets
one bet per cup and can't change it.

If that team wins the cup, the bettor gets **the bet × (teams − 1)**, so in a
4-team cup a bet of 5 pays 15. If the team doesn't win, the bet is gone and
nobody receives it. Everyone can see who bet on what.

- **A 2-team cup has no betting.** At 1× a winning bet just comes back.
- **A cup with no champion settles nothing.** Abandoned or started over, it
  costs nobody anything.
- **Undoing the final undoes the payouts. Correcting the final pays the new
  winner's backers.** Both happen because bets settle off the history entry,
  the same way cup prizes do.

A bettor picking at random gets back (teams − 1)/teams of what they bet: 75%
in a 4-team cup, 80% in a 5-team one. Coins slowly leave the economy, which is
the point. Someone who reads the draw well can beat it.

## The window

The admin's **Kick Off the Cup** button stays disabled through the five minutes
and counts down ("Start in 4:12"). No match can be played while bets are open,
so the window needs no "before the first result" check. Only the admin sees the
button. Everyone else sees the teams arrive live, as they do now.

Five minutes every cup, even with no bets, is the price. An admin "start now"
can come later if the wait bothers people.

## Data

- `cupDrawn/<cupId>`: `{ at, teams }`. The admin's page writes it when the last
  team is drawn. `at` is the server's time and `teams` is the team names
  (`"Sifat + Ofi"`). It's a new node because `cupRoster` isn't written until
  kick-off. A redraw rewrites it with a new `at`, and bets placed before that
  stop counting, the same way a swapped seat restarts a challenge's window.
- A bet is a `spends` row: `{ kind: 'cupbet', cup, team, amt }`, where `team` is
  the team's place in `cupDrawn/<cup>/teams` (0, 1, 2…). An index rather than the
  name, because the rules can check that `teams/<team>` exists but can't search a
  list for a name.

## Enforcement

- **The database rules:** only the admin writes `cupDrawn`, and its `at` must
  equal `now`. A `cupbet` needs `cupDrawn/<cup>` with `at` no more than 300
  seconds ago, more than two teams, `teams/<team>` present, and `amt` a whole number
  from 1 to 10.
- **The wallet walk (`coinWalk`):** the bettor is on the player list. The bet
  falls inside `[at, at + 5 min]` of the current `cupDrawn`. It is their first
  `cupbet` on this cup, and they held the amount when they placed it. The bet
  settles at the history entry's date. If `champion` is the team, the bettor
  gets `amt × (teams − 1)`. Otherwise they lose `amt`, but only if they still
  hold it, as with challenge bets. With no history entry, nothing settles.
- **The page:** an open cup bet counts as held, alongside table bets and
  challenge bets, so it can't be spent twice while the cup runs.

## Interface

Under the drawn teams, everyone (the admin included) sees a **Who wins the
cup?** panel with the countdown. Each team is shown with the coins on it and a
chip for every bettor. Tapping **Bet on them** opens the same amount picker as
challenge bets, with "Win 15 · lose 5" and a **Bet 5 on Sifat + Ofi** button.
Once someone has bet, they see "You bet 5 on Sifat + Ofi. If they win the cup
you get 15." The panel stays up, without buttons, until the cup ends.

## Not doing

- No push notification when the betting window opens. The draft time is
  already announced, so people are around when it opens.
- No odds per team. A single multiplier is one rule, and the challenge spec
  already dropped "favourite" odds.

## Test

- Rules (`test-rules.mjs`): a bet is accepted inside the window and refused
  after it. A bet is refused on a 2-team cup, on a team not in the cup, and
  with a bad amount. Only the admin can write `cupDrawn`.
- `coinWalk` (`test.mjs`): a winning bet pays ×(teams − 1) and a losing bet
  takes the stake. It ignores a second bet, a late bet, and a bet placed before
  a redraw. A cup with no champion settles nothing, and an open bet counts as
  held.
