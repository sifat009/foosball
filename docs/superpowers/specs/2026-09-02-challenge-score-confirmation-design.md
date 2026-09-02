# Challenge scores — two people, not one

A challenge score today is whatever the last person to type won. The four
seated players see the boxes, any of them can fill or overwrite them at any
time, and the ladder moves the moment they do. Nobody can tell who filed a
score, or that it changed.

The rules are wider still. `challenges/$id/score` is granted to
`auth != null && auth.token.email_verified === true` — no seat check anywhere.
Any verified Google account on earth can set any challenge's score. "Only the
four see the boxes" is a rendering condition (`index.html:2561`), not a rule.

This closes both: a score enters the ladder only when someone on the *other*
side agrees to it.

## The rule in one sentence

One of the four files a score. It counts once a player on the opposing side, or
the admin, confirms it. Until then it is a claim, and the ladder does not know
about it.

Nothing counts without that confirmation — there is no timeout that ratifies a
claim by silence. A challenge nobody confirms stays out of the standings
indefinitely, which is why the claim has to be hard to miss (see *Notifications*).

Corrections run the same path. A confirmed score can be re-filed by any of the
four, and the new figure needs the same opposing confirmation before it
replaces the old one. There is one code path for filing and for fixing, and the
ladder never moves on one person's say-so.

## Data

One new node beside `score`:

```
challenges/<id>
  score:   { b: 5, r: 3 }              absent until agreed — unchanged
  pending:                             absent unless a claim is in flight
    b:    5
    r:    3
    by:   "rifat@…"                    the filer
    side: "b"                          the filer's side, "b" or "r"
    at:   1725195600000
```

`score` keeps its exact current meaning: the agreed result. `pending` is a
claim, and only a claim. Confirming is one multi-path update —
`{ score: {b, r}, pending: null }` — so the claim is never both pending and
recorded.

Because `score` is untouched in meaning, **nothing derived from it changes**:
`chalDone`, `chalLadder`, `chalPct`, the Played badge and the ladder table all
key off `score` and therefore keep an unconfirmed game out of the standings
without a line of new logic. There is nothing to migrate either — every score
already filed is, by definition, a confirmed score.

## Rules

Replacing the current `score` block under `challenges/$id`:

**`pending`** — writable by the four seated players and by the admin. Validated:

- all four seats are filled
- `by` equals the writer's own email
- `side` names the side the writer actually sits on
- `b` and `r` are integers, zero or more

Deleting `pending` is open to the same four. *Withdraw* (by the filer) and
*Reject* (by an opponent) are the same write behind two labels, so rejection
costs no extra code. Overwriting a pending claim is allowed too: if Red
disagrees with Blue's 5–3, Red files 5–4, which replaces the claim and now
waits on Blue. Counter-offer and reject-then-refile collapse into one operation.

**`score`** — writable only when

- a `pending` exists, and
- the writer holds a seat on the side opposite `pending.side`, and
- the written values equal that pending's

The rules read `data.parent().child('pending')` — the pre-write state — so the
claim is still there to validate against even though the same update deletes it.

The admin keeps an override on `score` for the games they are not in, but is
blocked when `pending.by` is their own address. The admin plays; they should
not be able to ratify their own result.

**Seats freeze while a claim is pending.** Today a seat can be vacated any time
before a score is filed. If a player left after filing, `pending.side` would
point at a seat they no longer hold and the rules would go incoherent. A
pending claim blocks seat changes exactly as a filed score already does
(`index.html:2506`, plus the matching rule) — the game has been played, the
line-up is settled.

**A pending claim keeps the lobby alive.** `chalLive` (`index.html:2465`) drops
an unplayed lobby six hours past kick-off, and only a filed `score` exempts it.
With no auto-confirm, a claim filed at the table would fall off the board that
evening and take the game with it. `chalLive` must treat a `pending` claim the
way it treats a score: the game was played, it is waiting on a person, not
rotting.

## The card

`scoreRow` (`index.html:2531`) writes `pending` instead of `score`. What the
card shows depends on who is looking:

| State | Filer's side | Opposing side | Admin | Everyone else |
| --- | --- | --- | --- | --- |
| No score, no claim | boxes | boxes | boxes | "Waiting on one of the four" |
| Claim pending | "Sent — waiting on Siddiq & Shewa" + Withdraw | "Rifat filed 5–3" + Confirm + Reject | Confirm + Reject, unless it is their own claim | "5–3, waiting to be confirmed" |
| Confirmed | score + "Correct this score" | same | same | score |

The pending bar borrows the cup's existing visual language for this exact
state — amber `#e6c65c` on `#fff8e6` (`index.html:364`) — so a pending
challenge score reads like a pending cup score. "Correct this score" reopens
the boxes and files a fresh claim; the confirmed score stays in the ladder
until the correction is confirmed.

Three new writers: `chalFile`, `chalConfirm` (the multi-path update) and
`chalReject` (a `remove`). `chalScore` goes away.

## Notifications

`chalNews` (`relay/relay.mjs:93`) announces a filed score to everybody today,
with the comment *"A score has no author, so that one goes to everybody."* Now
it has one, and the announcement splits in two:

- **a claim** pings the two opponents and the admin — the people who can act on it
- **a confirmation** pings everyone, because that is the moment the ladder moves

`recipients()` understands only *admin-only* and *except-one-person*; it gains
an explicit email list. `chalNews` is a pure function already covered by
`relay/test-relay.mjs`, so both branches are tested there.

The alerts drawer reuses the existing `suggest` toggle rather than adding a
kind — its label is already "Someone suggested a score to accept"
(`index.html:1732`). That row is admin-only today (`index.html:1866`) and must
show for any signed-in player.

## Tests

`test.mjs` gains the card states: filing creates a claim rather than a score, a
teammate sees Withdraw where an opponent sees Confirm, a pending game stays out
of the ladder, confirming puts it in, and a correction leaves the old score
standing until it is confirmed.

`relay/test-relay.mjs` gains the two `chalNews` branches and the recipient list.

The rules are the actual fix, and `database.rules.json` has no tests at all
today — `test.mjs` stubs the database out, so it never evaluates a rule. A new
`test-rules.mjs` runs under `firebase emulators:exec --only database`, using
the `firebase-tools` already in the project. It covers what the UI cannot
enforce:

- an outsider with a verified account cannot write `pending` or `score`
- a teammate on the filer's own side cannot confirm
- the admin cannot confirm a claim they filed themselves
- a confirmation whose values differ from the claim is rejected
- a seat cannot be vacated while a claim is pending

One `test.mjs` case covers the staleness exemption: a lobby whose kick-off is
a day past still shows on the board while a claim is pending.

## Not doing

- **No auto-confirm on a timer.** Silence does not ratify a score.
- **No dispute reason field.** A counter-score says it better than free text,
  and free text is a length limit and an escaping problem for nothing.
- **No reuse of the cup's `suggestions/` node.** `sugBar` and `sugTarget` are
  built around cup match keys and admin-accept; the challenge UI is new either
  way, and a claim living outside its own challenge would force cross-subtree
  rules and a two-subtree confirm.
- **No `confirms` map on the score.** Keeping `score` directly writable and
  badging it unconfirmed would make `score` mean *filed* and *agreed* at once —
  the very ambiguity that caused this — and would rewrite `chalDone`,
  `chalLadder` and the relay to tell them apart.
