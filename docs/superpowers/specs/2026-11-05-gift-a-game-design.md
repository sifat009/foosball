# Gift a game

People who won't use all five of the day's free challenges can give one to a colleague.

- Free, no selling. Straight to a colleague you pick, no accepting, no undo.
- Only from your free five, only one not yet played (a lobby you're sitting in counts as played). A game you were given can't be passed on.
- Your limit for the day drops by one, theirs rises by one. Nobody receives more than 3 a day (`GIFT_RECV`).
- Any time that day. An unplayed gift is gone at midnight.
- A gifted game is played before a bought extra game, so a bought one nobody needed still comes back at midnight.

**UI.** The Challenges header ("Playing as Sifat · 2 of 5 today") gets a **Gift a game** link while you have a free game left. It opens a panel under the line: "Give one of your N games left today to:", a colleague picker leaving out anyone already at 3, Give, and "You'll have N−1 left today. It can't be undone." Both coin histories get a 0-coin line: "Gave a game to X" and "X gave you a game for today".

**Data.** A `spends` row `{ kind: 'gamegift', by, to, at }`. The rules accept it with a `to` that isn't you and no `amt`. The coin walk honours it only if, at that moment, the giver has played fewer than 5 minus what they gave, and the receiver has had fewer than 3 that day. It keeps `given` and `recv` per player per day, and both the day's game limit and the midnight refund of extra games read them.

**Tests.** `test.mjs`: a gift makes a sixth game that pays; a 4th gift does nothing; gifting after five played does nothing; gifting to yourself does nothing; a bought extra game still comes back when a gift was used. `test-rules.mjs`: the row's shape.
