# Daily challenge cap

Some players keep playing while others wait for a turn at the table. Each
player gets at most **5 challenges a day**. The cap is the same for free games
and bet games.

## What counts

A lobby counts once toward your day if you are sitting in it and it is one of
these:

- **Settled.** Its score was agreed today (`chalAt`, which is `score.at` or the
  lobby's `at` for rows filed before the stamp existed).
- **Claimed.** A score was filed today (`pending.at`) and is waiting for the
  other side to confirm it.
- **Open.** It is still live (`chalLive`) and has no result yet, no matter what
  day it was opened. Otherwise joining yesterday's leftover lobbies would get
  around the cap.

Leaving a seat before the game frees that slot. A claim filed on an earlier day
that was never confirmed does not count, so an ignored claim cannot lock anyone
out. "Today" is the device's local calendar day.

## Enforcement

The page enforces the cap; the database rules do not. The rules only see one row
at a time and cannot count across rows. This is the same trust model that
`EMAIL_NAMES` and the bet cover gate (`chalShort`) already use.

- `CH_DAILY = 5` and a pure `chalToday(rows, email, now)` sit next to the other
  challenge helpers.
- The count is worked out once per render (`chalUsed`), like `chalFree`.
- **Taking a seat:** `chalShort` refuses an empty seat when `chalUsed >= CH_DAILY`.
  The card shows the reason in its existing `.ch-shy` line: "You've played 5
  challenges today — seats open again tomorrow." A seat you already hold is never
  taken away, and you can always leave one.
- **Opening a lobby:** the create form reuses the bet note. It shows the same
  sentence and disables **Post it**.
- **Sign-in intent:** a seat tapped while signed out is not taken on the way back
  if the cap is already reached.

There is no admin exemption. The admin can already delete lobbies.

## Not doing

Enforcing the cap in the database rules. Add a per-player counter node only if
someone actually works around the page from the console.

## Test

`test.mjs` gets one block. It drives the board with a fixture where Sifat has four
games settled today, plus one settled yesterday, one old unconfirmed claim and
one open lobby he sits in. That makes the count 5, so:

- the seats of another open lobby are not offered and the card says why
- the create form's Post button is disabled
- leaving the open lobby (drop it from the fixture) brings the count back to 4
  and the seats are offered again
