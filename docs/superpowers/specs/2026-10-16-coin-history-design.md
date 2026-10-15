# Coin history: where your coins came from and went

A player couldn't tell why their balance was what it was. No balance is stored:
`coinWalk` works every one out from the games, cups, bets, gifts and tree rows,
in time order. So the history is that same walk, writing down each change as it
makes it. Nothing new is stored, and a corrected result rewrites the history
along with the balance.

## What you see

A third tab in the coins sheet, **History**, beside Earn & bet and Spend. Only
your own lines, newest first. Each line: when, why, how much (green +, red −,
grey 0) and the balance after. The first 30, then **Show more**.

Signed out, or not on the player list: the tab says so instead of a list.

## The lines

One per change, in the words of what happened:

- a challenge won or lost, with your partner and the two across, and the bet or
  "to nil" when there was one
- a cup's champion, runner-up, Golden Boot or Golden Glove
- a side bet or cup bet won or lost
- a gift sent or received
- a bounty posted, refunded, a fee paid or received, a split won
- a tree planted, grown, watered or collected
- a colour, an icon or an extra game bought

The amount is what actually moved, not the price: a loser on 0 who loses to nil
shows −0.

## Lines where nothing moved

These are the "I tapped it and nothing happened" cases, shown grey with 0:

- a spend or bet you couldn't afford then: "not enough coins"; any other refused
  spend: "didn't go through"
- a bet that can't be covered when its game or cup settles: "couldn't cover it
  by then"
- a game past someone's daily allowance: "past the day's game limit, paid
  nothing"
- a bet still waiting on its game or champion: "waiting for the result"

A row from somebody not on the player list has nobody to show it to, and is
skipped.

## How

`coinWalk` gains a `log` (player → lines) on what it returns. Every place it
changes a balance goes through one helper that records the actual change and
the balance after. The refusals log a 0 line where they return. Pending bets are
the ones left unsettled when the walk ends.

## Check

In `test.mjs`: for every player, the history's amounts add up to their balance,
and a challenge win, a nil loss on nought, a gift and an unaffordable spend come out with the
right words.

## Left out

Filters, search, export, and anybody else's history.
