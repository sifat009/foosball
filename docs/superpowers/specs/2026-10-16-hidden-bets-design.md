# Hidden bets: nobody sees which pair the money is on

Players threw challenges. They saw a big spectator bet on their own pair and
lost on purpose to wipe it out. Losing costs a player only the 2 coins a win
would have paid, so trolling a bettor was nearly free.

Hiding bets from just the four players isn't enough, because they can ask a
spectator who bet on what. So nobody sees anyone else's side while the game is on.

## The rule

While a game's Who wins? panel is up, each person sees only their own bet. Everyone
sees the pot: "2 bets · 13 coins in", with no split by side and no names.

A player who throws the game can't tell whether that costs the bettors coins or
pays them. The only person who knows a bet is on their pair is the bettor, who
has no reason to say.

## Interface

- Under the countdown, a gold pot line: `N bets · M coins in`. It isn't shown
  when nobody has bet.
- The two pair panels show no totals and no chips. The bettor's own pair is
  highlighted with a `You 10` chip.
- With no bet of your own, the panel ends with "Who bet on which pair stays
  hidden until the score is in." A spectator who can still bet first sees "Tap the
  pair you think will win."
- After betting: "You bet 10 on Sifat & Ofi. If they win you get 15. Only you
  can see which pair."

The panel already disappears once the score is agreed, and it stays that way.
Each bettor's coins History shows how their bet settled.

## Limits

- `spends` can be read by everyone, because the wallet walk runs on each
  page. Someone reading the database directly can still see the sides. Closing
  that would mean a server-side walk, which isn't worth it for this club.
- A bettor who tells people their own bet is choosing to risk it.
- Cup bets are unchanged. Their own hole (betting on another team, then throwing
  your own matches) is a separate issue.
