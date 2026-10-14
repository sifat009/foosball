# Your own profile behind your name

On a phone, the tab bar's account button shows your name, and tapping it asks
"Sign out?". People tap it meaning "that's me" and want to see their own
record: badges, wins, coins. The profile that answers this already exists
(`openProfile`), but you can only reach it from the Hall.

## The rule

Tapping the account button:

- **Signed out:** opens the account picker, as it does now.
- **Signed in, with a player name** (`playerName()` is set): opens your own
  profile, `openProfile(myName())`.
- **Signed in, no player name** (someone not in `EMAIL_NAMES`): asks
  `confirm('Sign out?')`, as it does now. With no player name there's no
  profile to open.

The desktop label drops "— sign out". It now reads just your name, matching
what the mobile tab bar already shows. Without a player name it still reads
"Admin — sign out" or "Sign out", because that's still what the button does.

## What your own profile adds

The current layout (design A of four mockups) stays as it is. When the profile
is your own (`name === myName()`), three things are added:

1. **Photo.** Your Google photo (`auth.currentUser.photoURL`), a 72px circle
   centred above your name. It uses `referrerpolicy="no-referrer"`, because
   Google's image links often fail to load on other sites without it. If there
   is no photo, or it fails to load (`onerror`), the element hides and the
   header looks as it does today.
2. **Coins.** A fifth stat tile, "Coins", after Goals. It shows the same
   number as the coin pill: `myCoins()` minus unopened sealed gifts. That
   calculation moves out of `renderCoins()` into one small function so both
   use it. While your coins haven't loaded (`myCoins()` is null), the tile
   shows "–", like the pill does.
3. **Sign out.** A red button beside Close. It keeps the
   `confirm('Sign out?')` step, then calls `signOut(auth)` and closes the
   profile.

Other players' profiles, opened from the Hall, stay exactly as they are: no
photo, no coins and no Sign out. The app only knows the signed-in person's
photo and balance. Showing everyone's photo would mean saving it to the
database and making it visible to spectators. That's out of scope.

## Wiring

`signOut` and `auth` live in the module script, and `openProfile` lives in the
plain script, so the module exposes two things on `window`:

- `window.signOutMe()`: asks to confirm, then signs out.
- `window.myPhoto()`: returns `auth.currentUser?.photoURL || null`.

`openProfile` reads both only when the profile is your own. Everything stays
in `index.html`, with no database or rules changes.

## Checks

At phone width:

- signed in with a name: the button opens your profile, with photo, coins and
  Sign out;
- Sign out asks to confirm, then signs you out;
- the admin with no player name gets the confirm, as before;
- signed out: the picker opens;
- a profile opened from the Hall shows none of the three additions;
- an account with no photo, or a broken photo link, shows no empty circle.
