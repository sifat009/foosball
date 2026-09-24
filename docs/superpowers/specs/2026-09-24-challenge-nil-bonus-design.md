# Nil pays double in challenges

Beating a side 10-0 is worth more than beating it 10-9. A challenge won to nil
pays double, and costs the losers double, in free games and bet games alike.

## What counts as a nil

A settled challenge (`chalDone` and `chalFull`) where the scores differ and the
losing side's total is **0**. A 0-0 draw is still a draw and pays nothing.

Only games agreed at or after `NIL_FROM` count: `chalAt(c) >= NIL_FROM`, where
`NIL_FROM` is a fixed timestamp set to the moment the change ships. Every game
agreed before it pays exactly what it paid before, so no balance moves on
release.

## What a nil pays

| Game | Winners, each | Losers, each |
|---|---|---|
| Free | +4 (instead of +2) | −2, floored at 0 |
| Bet of N, honoured | +2N | −2N, floored at 0 |
| Bet of N, not honoured | as a free nil: +4 | −2, floored at 0 |

- **Floored at 0.** No balance ever goes negative. A loser who cannot cover the
  full amount drops to 0.
- **Winners are paid in full regardless.** When a loser pays less than the full
  amount, the shortfall is minted rather than taken from the winners' payout.
  A nil always pays what it says.
- **Honoured** keeps today's meaning: both losers can cover the plain bet N at
  that point in the walk. Seating already refuses anyone who cannot, so this only
  fails after a corrected result. When it fails, the game falls back to being
  paid as a free game, as it does today, and at nil that means the free nil row.
- The seat gate (`chalShort`) is unchanged. You need N to sit at an N-coin table,
  not 2N.

## Where it lives

One change, in `coins()` in `index.html`. The walk already orders events by
`chalAt`. Each event gains a `nil` flag, set only when the losing total is 0 and
the game is on or after `NIL_FROM`. Free events carry the losers' names as well,
so they can be charged. When the walk applies an event:

- `mult = nil ? 2 : 1`
- winners `+= (honoured ? N : COIN_WIN) * mult`
- losers `= Math.max(0, bal - (honoured ? N : COIN_WIN) * mult)` at nil, and
  unchanged otherwise (a normal free loss still costs nothing; a normal honoured
  bet still costs N)

No database, rules or stored-field change. Balances stay derived at render.

## Text

- **Rules sheet, Betting section:** one bullet, "Win to nil and it pays double:
  winners take twice, losers pay twice, free games included. Nobody goes below
  zero."
- **README, coins section:** one paragraph with the table above and the reason
  for `NIL_FROM`.

## Tests

One block in `test.mjs` that runs `coins()` on fixture rows:

1. Free nil after `NIL_FROM`: winners +4, losers −2.
2. Free nil where a loser is on 0: that loser stays on 0.
3. Bet-5 nil: winners +10, losers −10.
4. Bet-5 nil where a loser holds 7: that loser ends on 0, and the winners still
   get +10.
5. A 0-0 draw: nobody moves.
6. A nil agreed before `NIL_FROM`: paid as a normal result.

## Out of scope

Any nil mark on the Recent card or the profile. Add one if players ask to see
it.
