# Cup prizes in coins

The champions of a cup get **10 coins each**. The runners-up get **5 each**.

## Which cups pay

Only cups finished after this ships pay out. When a champion is crowned,
`syncChampion` also saves the final's losing team on the history entry as
`runnerUp: "A + B"`. `coins()` pays only entries that carry this field. Older
cups don't have it, so they are never paid retroactively. The challenge nil box
uses the same approach.

## How it's worked out

Coins are still worked out when the page renders. `coins(rows, cups)` takes the
history entries (`hallEntries`) and adds each paying cup as a payment at
`e.date`. Payments are ordered by time together with the challenge games, so
bets can only use coins that had already arrived. `renderHall` redraws the
challenges board, so a balance changes as soon as a cup is saved.

- Undoing a final deletes the history entry, and its coins go with it.
- Correcting a final overwrites the entry, so the coins go to the new teams.
- A name that isn't on the player list gets nothing, the same as in challenges.

The rules for history do not check which fields are saved, so no rule changes.

## Not doing

The champion celebration does not mention the prize. Add that if people miss it.

## Test

`coins()` pays 10 to each champion and 5 to each runner-up, and nothing for an
entry without `runnerUp`. `syncChampion` saves the final's losers as `runnerUp`.
