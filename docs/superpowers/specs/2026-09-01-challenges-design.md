# Challenges — casual 2v2 pickup games

Between cups, anyone opens a lobby, three others take the remaining seats, the
four play, someone files the score. It has its own board and touches nothing the
cup owns: no title, badge, Golden Boot or Players-board number moves because of a
lunch-break game.

## Data

One node, public read, `challenges/<id>` where the id is `Date.now()` — the same
convention `cupId` already uses.

```
challenges/<id>
  by:     "sifat@…"                  creator's email
  at:     1725190000000              opened
  playAt: 1725195600000              match time, set by the creator
  slots:
    bf: { name: "Sifat", email: "…" }   blue forward
    bd: { … }                            blue defender
    rf: { … }                            red forward
    rd: { … }                            red defender
  score:  { b: 5, r: 3 }             absent until played
```

An absent seat is an empty seat. There is no status field: absent `score` means
open, present means done, and the winner is `b > r`. A nil is a side on 0. A draw
is storable and gets its own column rather than a validation argument at the
table.

Team score only — one box a side, not the cup's forward/defender pair. It yields
the winner, the nils and goal difference, and it is two numbers to agree on
instead of four.

The ladder is **derived at render** from finished challenges, the way `career()`
already derives everything from `history`. No rollup node, no stored totals, no
migration: fixing a mistyped score fixes the board immediately.

## Identity

A hardcoded `EMAIL_NAMES` map in `index.html`, beside `ADMIN_EMAIL`. Signing in
with a mapped address is what makes you a player.

An account that isn't in the map reads everything and gets "Ask the admin to add
you" where the Join buttons would be. Adding a player is an edit to that map and
a deploy, which is the same cost as adding one to a cup.

## Permissions

The rules cannot see the map — it lives in the page — but they can see
`auth.token.email`, and that is enough for the part that matters.

| Action | Who |
|---|---|
| Create a challenge | any verified account |
| Delete one | creator or admin |
| Take a seat | anyone, only if the seat is empty |
| Vacate a seat | the seat's holder, or admin |
| File or correct a score | any verified account |

A seat write must carry the writer's own `auth.token.email`, so nobody sits down
as somebody else and nobody is turfed out of their own seat.

Score writes stay open to any verified account: the rules can't tell who the four
players are, so the UI shows the boxes to the lobby's four and the honour system
covers the rest — the same trust level the existing suggestion flow runs on, and
four people were standing at the table.

## The screen

A **Challenges** button beside Hall of Fame. Three stacked parts: open lobbies,
the ladder, recent results.

**Opening.** *New challenge* → pick your seat (blue forward, blue defender, red
forward, red defender) → set a time with the schedule picker the draft already
uses, `Now` button included → post. You are seated, three seats are empty.

**Joining.** The lobby card is a 2×2 grid: blue and red columns, forward and
defender rows. An empty seat is a *Join* button, your seat is a *Leave*, another
player's seat is their name. Joins run through an RTDB **transaction**, so two
people tapping the last seat at once cannot both take it — the loser watches the
seat fill and the card repaints.

**Sharing.** *Share* hands `…/#c/<id>` to the OS share sheet, falling back to the
clipboard, mirroring the celebration Share. Landing on that hash opens the
Challenges screen with that lobby scrolled to and outlined.

**Recording.** A full lobby grows two score boxes, blue and red, live for its four
players and nobody else. Filing a score moves the card to Recent and repaints the
ladder.

**The ladder.** One row per player: P, W, D, L, GF, GA, Nil, Win %. Sorted by win
percentage with games played as the tiebreak, so one lucky game doesn't outrank
thirty.

Mobile first, like the rest of the app: the 2×2 grid is already the phone layout,
and the ladder scrolls inside its own container rather than crushing eight columns
into 360px.

## Notifications

A new kind `challenge` joins `ALERT_KINDS` with its own row in the alerts drawer,
so these can be silenced without losing cup results.

The relay gains a `challenges` watcher built like the `suggestions` one, but its
`seen` map holds each lobby's filled-seat count and whether a score exists. That
is what lets a single listener tell three events apart:

- **opened** — "Sifat opened a challenge for 3:00 PM — 3 seats left"
- **full** — "Challenge on: Sifat & Rashed vs Nur & Ofi, 3:00 PM"
- **scored** — "Blue 5–3 Red — Sifat & Rashed win"

`seen` starts `null` so the first snapshot only seeds it; without that a relay
restart re-announces every open lobby. The relay already holds `pushTokens` as
token→email, so whoever caused an event is skipped and nobody is pinged for their
own tap.

A full lobby also arms a **reminder at `playAt`**, reusing the relay's existing
`timers` map. The value listener refires on boot, so a restart re-arms it — the
same property that stops a reboot swallowing the draft reminder.

This is the only part of the feature that needs a deploy to the Oracle VM:
edit `relay/relay.mjs`, then `systemctl restart foosball-relay`.

## Lifecycle

Leaving is allowed until a score is filed, and reopens the seat. The creator can
cancel at any point, full or not. A filed score can be overwritten by the four or
by the admin — mistyping 5–3 as 53 must not need a database console.

An unfilled lobby more than six hours past its time drops off the board client
side, and the admin's page sweeps those rows on load. Nothing accumulates and
nobody tidies by hand.

## Tests

`test.mjs` runs Playwright with Firebase blocked, so the logic goes on `window`
and is driven from a fixture snapshot:

- ladder maths: draws, nils, and the win%-then-games-played sort
- seat states from three viewpoints — mine, empty, another player's
- score boxes present for a participant, absent for a bystander
- an unmapped account sees no Join button
- `#c/<id>` selects the right card
- the expiry filter hides a lobby six hours past its time
- a 360px pass on the lobby card and the ladder

On the relay side, the opened/full/scored diff is a pure function so the
dependency-free `test-relay.mjs` can assert it without Firebase.

## Out of scope

Per-player goals, and therefore any casual Golden Boot or Glove. Waitlists for a
full lobby. Recurring or standing challenges. Any path from a challenge result
into `history`, cup titles or badges.
