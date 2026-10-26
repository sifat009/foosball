# Hide bets while playing: nothing about the bets shows until the score is in

This follows on from `2026-10-16-hidden-bets-design.md`. That design hid which pair
the money was on but still showed the pot, and the cup panel still showed every
bettor by name. Now nobody sees anything about anyone else's bet while a game or
cup is on, not even that a bet exists. Everyone sees only their own.

## Challenge: Who wins?

- The pot line (`N bets · M coins in`) is removed.
- Once betting closes, the panel stays up only for somebody who placed a bet.
  For anyone else it disappears, because a panel left standing would itself say
  that somebody bet.
- No change to the bettor's own `You N` chip, the "You bet N on … Only you can
  see which pair." note, or the note shown to someone who hasn't bet.

## Cup: Who wins the cup?

- Each team's `N coins on them` line is removed, along with the other bettors'
  chips. The bettor's own `You N` chip stays on their team.
- Once betting closes, the panel stays up only for somebody who placed a bet.
- The note shown to someone who can still bet becomes: "Tap the team you think
  will win the cup. Who bet on which team stays hidden until the cup is won."

## Unchanged

- After a challenge is settled, tapping its row in Recent results still shows the
  `N bets` pill and the list of bets.
- When a cup is won, the celebration screen still shows its Cup bets list.
- Placing and settling bets work as before.

## Limits

`spends` can still be read by every signed-in player, since each page runs the
wallet walk itself. This change only hides the bets on screen.

## Tests

`test.mjs`:
- A spectator and a player see no pot line and no other bettors' chips.
- A non-bettor gets no panel once betting has closed.
- A bettor's own chip still shows.
- On the cup panel, a non-bettor sees no totals and no names, and a bettor sees
  only their own chip.
