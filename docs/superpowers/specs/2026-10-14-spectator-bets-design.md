# Spectator bets: somewhere for coins to go

On 2026-10-14 the club held 210 coins, about 12 for the middle player, and
nine trees were paying in roughly 100 a week. About 85% of everything ever
spent went on colours and icons, and four players had never spent a coin.
Every other spend moves coins between players. Nothing takes them out.

## The rule

When a challenge fills, anyone not playing has two minutes to bet 1–10 coins
on a pair. If that pair wins, they get the bet times 1.5, rounded down (bet 6,
get 9). If the pair loses, the bet is gone and nobody receives it. A draw or a
cancelled lobby costs nothing. Each player gets one bet per game, and everyone
can see who bet on what.

The payout is the same for both pairs. Marking one pair as the favourite was
tried and dropped as one rule too many. At 1.5×, a bettor loses coins over
time unless they pick the winner more than two times in three.

## The window

The window runs for two minutes from the latest of the four seat times. Across
102 games, the score was filed a median of 12 minutes after the lobby opened,
so waiting for the score would let people bet on a game they had already
watched. Taking the latest seat time means a player swapped in by the admin
starts a new window, and bets placed earlier don't stand. That covers "the
players changed" without a separate rule.

## Data

- `challenges/<id>/slots/<seat>/at`: the server's time when the seat was
  taken, written once and validated against `now`. The creator's seat is
  stamped when the lobby is created. Other seats are stamped in a separate
  write after the seat transaction, because the transaction can't carry the
  server's time. A lobby with an unstamped seat can't be bet on.
- A bet is a `spends` row: `{ kind: 'bet', game, side: 'b'|'r', amt }`.

## Enforcement

- **The database rules check:** the lobby is full, it has no claim and no
  score, the bettor isn't in one of its seats, one seat time falls within the
  last 120 seconds, and the amount is a whole number from 1 to 10.
- **The wallet walk (`coinWalk`) checks:** the bettor is on the player list
  under a different name from all four seats, so a second Gmail doesn't count.
  The bet falls inside the window and before the result. It is the bettor's
  first bet on this game, and they held the amount when they placed it. When
  the game is agreed, the bet settles only if the bettor still holds the
  amount. A game the walk doesn't pay (a draw, past the daily cap, or not four
  listed players) settles no bets.
- **The page:** coins on an open bet count as held, alongside table bets, so
  they can't be spent twice.

## Interface

Under a full lobby's seats is a **Who wins?** row with the countdown. The two
pairs are shown as panels, each with the coins on them and a chip for every
bettor. A spectator taps **Bet on them**, sets the amount with a box and − / +
buttons, sees "Win 9 · lose 6", and confirms with **Bet 6 on Sifat & Ofi**. The
four players see the same panels without the buttons. After betting, the
bettor sees "You bet 6 on Sifat & Ofi. If they win you get 9."
