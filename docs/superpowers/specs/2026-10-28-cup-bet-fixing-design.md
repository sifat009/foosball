# Cup bets: no reason to throw a match

A finalist who backed the other finalist made more by losing than by winning:
in a 5-team cup a 10-coin bet on the opponent pays +30, the runner-up gets +5,
so throwing the final was worth +35 against 0 for winning it.

## The rule

- **Meet the team you backed in the knockout, get your bet back**, whoever
  wins. A bet on a team you never meet there plays as usual, so anyone can
  still back anyone.
- **A cup bet is 1 to 5 coins** for cups drawn after the one running on
  28 Oct 2026 (cup `1793089471591`). That closes the last gap: at 10 coins,
  losing a semi on purpose to keep a bet alive for the final paid slightly.
- The payout stays the bet × (teams − 2).
- The group stage is left alone: with 5 teams, 4 go through, so throwing one
  group game hardly moves anyone's chances.

## The running cup

The refund covers cup `1793089471591` onward (`CUP_KO_FROM`). Its bets keep
their amounts, 10 included. The walk settles bets from history every load, so
the rule applies to the running cup even if its final is saved first.

## Data

The champion's history entry gains `ko`: every knockout pairing as
`[teamA, teamB]`. The final's pairing is also read from `champion` and
`runnerUp`. A refunded bet is marked `back` in the walk; it moves no coins and
is left out of the boards like an unsettled one.
