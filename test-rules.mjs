/* node test-rules.mjs — the rules, against the real engine.
 *
 *   firebase emulators:exec --only database "node test-rules.mjs"
 *
 * test.mjs stubs the database out, so nothing there ever evaluates a rule —
 * and the rules are what actually stop a challenge score being whatever the
 * last person typed. This talks to the emulator over REST with hand-made
 * tokens: the emulator does not check a signature, so no key, no service
 * account and no dependency beyond what firebase-tools already installs.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
// the emulator loads firebase.json's rules under this one namespace; any other
// name it will happily create for you, wide open, and every test would pass
const NS = process.env.RULES_NS || `${process.env.GCLOUD_PROJECT || 'ollyo-foosball'}-default-rtdb`;
const ADMIN = 'bhacker150@gmail.com';
// four players and a stranger; the names are the ones on the board
const B1 = 'rifathaque93@gmail.com', B2 = 'rashedcse18@gmail.com';
const R1 = 'siddikcoder@gmail.com', R2 = 'shewa.ollyo@gmail.com';
const OUT = 'stranger@gmail.com';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
/* `owner` is the emulator's admin bypass, used only to plant a fixture. Anyone
   else gets a token the rules read the way they read a real one. */
const token = who => who === 'owner' ? 'owner'
  : `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: who, user_id: who, email: who, email_verified: true,
      iat: 0, exp: 9999999999, firebase: { sign_in_provider: 'google.com' },
    })}.`;

/* `owner` only travels in the header — the emulator ignores it as a query
   parameter and answers 401. Everyone else goes in the query, the way the
   database REST API has always taken a token. */
const url = (path, who) => `http://${HOST}/${path}.json?ns=${NS}`
  + (who === 'owner' ? '' : `&auth=${token(who)}`);
const send = async (method, path, who, body) =>
  (await fetch(url(path, who), {
    method,
    ...(who === 'owner' ? { headers: { Authorization: 'Bearer owner' } } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })).ok;
const put = (p, who, body) => send('PUT', p, who, body);
const patch = (p, who, body) => send('PATCH', p, who, body);
const del = (p, who) => send('DELETE', p, who);
const read = async p => (await fetch(url(p, 'owner'),
  { headers: { Authorization: 'Bearer owner' } })).json();

const SLOTS = {
  bf: { name: 'Rifat', email: B1 }, bd: { name: 'Rashed', email: B2 },
  rf: { name: 'Siddiq', email: R1 }, rd: { name: 'Shewa', email: R2 },
};
let n = 0;
const lobby = async extra => {
  const id = 'c' + (++n);
  assert.ok(await put('challenges/' + id, 'owner',
    { by: B1, at: 1, slots: SLOTS, ...extra }), 'fixture ' + id + ' failed to plant');
  return id;
};
const claim = (by, side, b, r) => ({ b, r, by, side, at: 3 });
/* The score carries when the two sides agreed it, because that is when a bet
   moves and the walk has to order on it. */
// the server's clock: a time the client picks is refused, see below
const NOW = { '.sv': 'timestamp' };
const confirm = (id, who, b, r, at = NOW) =>
  patch('challenges/' + id, who, { score: { b, r, at }, pending: null });

// ---- filing a claim ----
{
  const id = await lobby();
  // a verified account that never sat down is not part of this game
  assert.ok(!await put(`challenges/${id}/pending`, OUT, claim(OUT, 'b', 9, 0)),
    'a stranger filed a score');
  // nor can they file one in somebody else's name
  assert.ok(!await put(`challenges/${id}/pending`, OUT, claim(B1, 'b', 9, 0)),
    'a stranger filed a score as a player');
  // a player cannot file as their opponent, which would make it self-confirmable
  assert.ok(!await put(`challenges/${id}/pending`, B1, claim(B1, 'r', 9, 0)),
    'a blue player filed from the red side');
  assert.ok(!await put(`challenges/${id}/pending`, B1, claim(R1, 'r', 9, 0)),
    'a blue player filed in a red player’s name');
  // a score is whole numbers, none of them negative
  assert.ok(!await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, -1)), 'a negative score stood');
  assert.ok(!await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, 1.5)), 'half a goal stood');
  assert.ok(!await put(`challenges/${id}/pending`, B1, { b: 5, r: 3, by: B1, side: 'b' }), 'a claim with no time stood');
  // and this is the one that works
  assert.ok(await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, 3)), 'the filer could not file');
}

// ---- confirming it ----
{
  const id = await lobby();
  await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, 3));
  // the filer cannot wave their own score through
  assert.ok(!await confirm(id, B1, 5, 3), 'the filer confirmed their own score');
  // neither can the person sitting next to them
  assert.ok(!await confirm(id, B2, 5, 3), 'a teammate confirmed the score');
  // nor anyone who was not at the table
  assert.ok(!await confirm(id, OUT, 5, 3), 'a stranger confirmed the score');
  // an opponent confirming something other than what was filed is not confirming
  assert.ok(!await confirm(id, R1, 5, 4), 'a confirmation changed the score');
  assert.ok(!await put(`challenges/${id}/score`, R1, { b: 5, r: 4 }), 'a score landed past the claim');
  // a result with no time on it cannot be ordered, so a bet could not settle against it
  assert.ok(!await put(`challenges/${id}/score`, R1, { b: 5, r: 3 }), 'a result with no time stood');
  // and this is the one that works
  assert.ok(await confirm(id, R1, 5, 3), 'the opponent could not confirm');
  const got = await read(`challenges/${id}/score`);
  assert.ok(got.b === 5 && got.r === 3 && Math.abs(got.at - Date.now()) < 60e3, 'the score was not stamped by the server');
  assert.equal(await read(`challenges/${id}/pending`), null, 'the claim outlived its confirmation');
}

// ---- a nil travels from the claim to the score unchanged ----
{
  const id = await lobby();
  assert.ok(!await put(`challenges/${id}/pending`, B1, { ...claim(B1, 'b', 1, 0), nil: false }),
    'a nil that is not true stood');
  assert.ok(await put(`challenges/${id}/pending`, B1, { ...claim(B1, 'b', 1, 0), nil: true }),
    'a claim to nil could not be filed');
  // the confirm can neither drop it nor, on a plain claim, add one
  assert.ok(!await confirm(id, R1, 1, 0), 'a confirm dropped the nil');
  assert.ok(await patch('challenges/' + id, R1, { score: { b: 1, r: 0, nil: true, at: NOW }, pending: null }),
    'a nil claim could not be confirmed as one');
  const plain = await lobby();
  await put(`challenges/${plain}/pending`, B1, claim(B1, 'b', 1, 0));
  assert.ok(!await patch('challenges/' + plain, R1, { score: { b: 1, r: 0, nil: true, at: NOW }, pending: null }),
    'a confirm turned a plain win into a nil');
}

// ---- what the game is played for ----
/* The rules cannot count coins — a balance is every row walked, and there is no
   expression that walks them — so who may sit at a ten-coin table is the page's
   gate and the replay's. What they can hold is the number itself: three people
   take a seat on the strength of it, so it may not move afterwards. */
{
  const id = 'bet1';
  const base = { by: B1, at: NOW, slots: { bf: { name: 'Rifat', email: B1 } } };
  assert.ok(!await put('challenges/' + id, B1, { ...base, stake: -1 }), 'a negative bet stood');
  assert.ok(!await put('challenges/' + id, B1, { ...base, stake: 2.5 }), 'half a coin stood');
  assert.ok(!await put('challenges/' + id, B1, { ...base, stake: 51 }), 'a bet past the ceiling stood');
  assert.ok(!await put('challenges/' + id, B1, { ...base, stake: '10' }), 'a bet that is not a number stood');
  assert.ok(await put('challenges/' + id, B1, { ...base, stake: 10 }), 'a ten-coin game could not be opened');
  // it is what it was opened at, for its creator and for the admin alike
  assert.ok(!await put(`challenges/${id}/stake`, B1, 2), 'the creator moved the bet after opening it');
  assert.ok(!await put(`challenges/${id}/stake`, ADMIN, 2), 'the admin moved the bet after opening it');
  assert.ok(!await del(`challenges/${id}/stake`, B1), 'the creator took the bet off after opening it');
  assert.equal(await read(`challenges/${id}/stake`), 10, 'the bet did not survive');
  // a game played for nothing carries no field at all, which is every row already filed
  assert.ok(await put('challenges/bet2', B1, base), 'a game for nothing could not be opened');
  assert.equal(await read('challenges/bet2/stake'), null, 'a game for nothing grew a bet');
}

// ---- the admin ----
{
  const id = await lobby();
  await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, 3));
  // the fallback, for the game nobody else answers about
  assert.ok(await confirm(id, ADMIN, 5, 3), 'the admin could not confirm');
}
{
  // the admin plays too, and must not be their own second opinion
  const id = await lobby({ slots: { ...SLOTS, bf: { name: 'Sifat', email: ADMIN } } });
  assert.ok(await put(`challenges/${id}/pending`, ADMIN, claim(ADMIN, 'b', 9, 0)),
    'the admin could not file from their own seat');
  assert.ok(!await confirm(id, ADMIN, 9, 0), 'the admin confirmed their own score');
  assert.ok(await confirm(id, R1, 9, 0), 'the opponent could not confirm the admin’s score');
}

// ---- the fourth player freezes the line-up ----
{
  const id = await lobby({ slots: { ...SLOTS, rd: null } });
  assert.ok(await del(`challenges/${id}/slots/bd`, B2), 'a player could not leave a lobby short of four');
  assert.ok(await put(`challenges/${id}/slots/bd`, B2, { name: 'Rashed', email: B2 }), 'the seat did not go back');
  // the fourth seat closes it: the game is played before the score is filed,
  // and a seat emptied in between takes the score boxes away with it
  assert.ok(await put(`challenges/${id}/slots/rd`, R2, { name: 'Shewa', email: R2 }), 'the last seat could not be taken');
  assert.ok(!await del(`challenges/${id}/slots/bd`, B2), 'a player left a full lobby');
  assert.ok(await del(`challenges/${id}/slots/bd`, ADMIN), 'the admin could not free a seat');
  assert.ok(await put(`challenges/${id}/slots/bd`, B2, { name: 'Rashed', email: B2 }), 'the seat did not go back');
  await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, 3));
  // otherwise the side a claim was filed from could be vacated under it
  assert.ok(!await del(`challenges/${id}/slots/bd`, B2), 'a player left with a claim standing');
  assert.ok(!await del(`challenges/${id}/slots/rf`, R1), 'an opponent left with a claim standing');
  await confirm(id, R1, 5, 3);
  assert.ok(!await del(`challenges/${id}/slots/bd`, B2), 'a player left a settled game');
}

// ---- cancelling the lobby ----
{
  const id = await lobby({ slots: { ...SLOTS, rd: null } });
  assert.ok(!await del('challenges/' + id, OUT), 'a stranger cancelled a lobby');
  assert.ok(!await del('challenges/' + id, R1), 'a player cancelled somebody else’s lobby');
  assert.ok(await del('challenges/' + id, B1), 'the creator could not cancel a lobby still filling');
}
{
  // four in means the game gets played: a cancel from here is a loss deleted
  const id = await lobby();
  assert.ok(!await del('challenges/' + id, B1), 'the creator cancelled a full lobby');
  assert.ok(await del('challenges/' + id, ADMIN), 'the admin could not cancel a full lobby');
}

// ---- correcting a settled score ----
{
  const id = await lobby();
  await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, 3));
  await confirm(id, R1, 5, 3);
  // the same path a first score takes, and the old figure stands until it lands
  assert.ok(await put(`challenges/${id}/pending`, R2, claim(R2, 'r', 5, 4)), 'a correction could not be filed');
  const first = await read(`challenges/${id}/score`);
  assert.deepEqual([first.b, first.r], [5, 3], 'a claim moved the record on its own');
  assert.ok(!await confirm(id, R1, 5, 4), 'a teammate confirmed the correction');
  assert.ok(await confirm(id, B1, 5, 4), 'the other side could not confirm the correction');
  /* The correction carries its own time: a put-right result moves the coins when
     the two sides agreed the new one, not when they agreed the wrong one. */
  const fixed = await read(`challenges/${id}/score`);
  assert.ok(fixed.r === 4 && fixed.at >= first.at, 'the correction did not carry its own time');
}

// ---- a lobby is never born with a result ----
{
  // the create write grants everything under it, so without this one clause an
  // account could open a lobby holding four names it typed and a score to match
  assert.ok(!await put('challenges/forged', OUT, {
    by: OUT, at: NOW, score: { b: 10, r: 0 },
    slots: { bf: { name: 'Rifat', email: OUT }, bd: { name: 'Rashed', email: OUT },
             rf: { name: 'Siddiq', email: OUT }, rd: { name: 'Shewa', email: OUT } },
  }), 'a lobby was created with a score on it');
  assert.ok(!await put('challenges/forged2', OUT, {
    by: OUT, at: 1, pending: claim(OUT, 'b', 10, 0),
    slots: { bf: { name: 'Rifat', email: OUT } },
  }), 'a lobby was created with a claim on it');
  // opening one the ordinary way still works
  assert.ok(await put('challenges/plain', OUT,
    { by: OUT, at: NOW, slots: { bf: { name: 'Stranger', email: OUT } } }),
    'an ordinary lobby could not be opened');
  // and with the creator's seat stamped, the way the page opens one
  assert.ok(await put('challenges/plain2', OUT,
    { by: OUT, at: NOW, slots: { bf: { name: 'Stranger', email: OUT, at: NOW } } }),
    'a lobby could not be opened with its first seat stamped');
  assert.ok(!await put('challenges/plain3', OUT,
    { by: OUT, at: NOW, slots: { bf: { name: 'Stranger', email: OUT, at: 5 } } }),
    'a lobby was opened with a seat stamped by the client');
}

// ---- spending coins ----
{
  const NOW = { '.sv': 'timestamp' };
  const sp = (by, extra) => ({ by, at: NOW, ...extra });
  assert.ok(await put('spends/s1', B1, sp(B1, { kind: 'flair', item: 'gold' })), 'a player could not buy a colour');
  assert.ok(await put('spends/s2', B1, sp(B1, { kind: 'slot' })), 'a player could not buy an extra game');
  assert.ok(await put('spends/s3', B1, sp(B1, { kind: 'gift', to: R1, amt: 5 })), 'a player could not send a gift');
  assert.ok(await put('spends/s4', B1, sp(B1, { kind: 'bounty', to: R1, amt: 6 })), 'a player could not post a bounty');
  // append-only: nobody rewrites or deletes a spend but the admin
  assert.ok(!await put('spends/s3', B1, sp(B1, { kind: 'gift', to: R1, amt: 1 })), 'a spend was rewritten');
  assert.ok(!await del('spends/s3', B1), 'a buyer deleted their own spend');
  assert.ok(await del('spends/s3', ADMIN), 'the admin could not remove a spend');
  // spending somebody else's coins, or backdating a spend
  assert.ok(!await put('spends/x1', OUT, sp(B1, { kind: 'slot' })), 'a spend was filed in someone else’s name');
  assert.ok(!await put('spends/x2', B1, { by: B1, at: 1, kind: 'slot' }), 'a spend was backdated');
  // shapes the walk never has to guess at
  assert.ok(!await put('spends/x3', B1, sp(B1, { kind: 'gift', to: B1, amt: 5 })), 'a gift to yourself');
  assert.ok(!await put('spends/x4', B1, sp(B1, { kind: 'gift', to: R1, amt: 51 })), 'a gift over the ceiling');
  assert.ok(!await put('spends/x5', B1, sp(B1, { kind: 'gift', to: R1, amt: 2.5 })), 'a fractional gift');
  assert.ok(!await put('spends/x6', B1, sp(B1, { kind: 'bounty', to: R1, amt: 5 })), 'an odd bounty');
  assert.ok(!await put('spends/x7', B1, sp(B1, { kind: 'gift', to: R1 })), 'a gift with no amount');
  assert.ok(!await put('spends/x8', B1, sp(B1, { kind: 'loan', to: R1, amt: 5 })), 'an unknown kind');
  assert.ok(!await put('spends/x9', B1, sp(B1, { kind: 'slot', amt: 5 })), 'a slot carrying an amount');

  /* A bet from the side: on a full lobby with no result, by somebody not in it,
     within two minutes of the last seat being taken. */
  const NUR = 'nuralam862@gmail.com';
  const seated = (at) => Object.fromEntries(Object.entries(SLOTS).map(([k, v]) => [k, { ...v, at }]));
  const fresh = await lobby({ slots: seated(Date.now()) });
  const stale = await lobby({ slots: seated(Date.now() - 3 * 6e4) });
  const scored = await lobby({ slots: seated(Date.now()), score: { b: 1, r: 0, at: 2 } });
  const filed = await lobby({ slots: seated(Date.now()), pending: claim(B1, 'b', 1, 0) });
  const half = await lobby({ slots: { bf: { ...SLOTS.bf, at: Date.now() } } });
  const bet = (game, extra) => sp(NUR, { kind: 'bet', game, side: 'b', amt: 6, ...extra });
  assert.ok(await put('spends/w1', NUR, bet(fresh)), 'a spectator could not bet on a game that just filled');
  assert.ok(await put('spends/w2', NUR, bet(fresh, { side: 'r', amt: 10 })), 'a spectator could not bet ten on the other side');
  assert.ok(!await put('spends/w3', B1, sp(B1, { kind: 'bet', game: fresh, side: 'r', amt: 6 })), 'a player bet on their own game');
  assert.ok(!await put('spends/w4', NUR, bet(stale)), 'a bet landed after the two minutes');
  assert.ok(!await put('spends/w5', NUR, bet(scored)), 'a bet landed on a game with a result');
  assert.ok(!await put('spends/w6', NUR, bet(filed)), 'a bet landed on a game with a result filed');
  assert.ok(!await put('spends/w7', NUR, bet(half)), 'a bet landed on a lobby that is not full');
  assert.ok(!await put('spends/w8', NUR, bet('nope')), 'a bet landed on a lobby that does not exist');
  assert.ok(!await put('spends/w9', NUR, bet(fresh, { amt: 11 })), 'a bet over ten');
  assert.ok(!await put('spends/w10', NUR, bet(fresh, { amt: 2.5 })), 'a fractional bet');
  assert.ok(!await put('spends/w11', NUR, bet(fresh, { side: 'x' })), 'a bet on no side');
  assert.ok(!await put('spends/w12', NUR, bet(fresh, { to: B1 })), 'a bet carrying a recipient');
  assert.ok(!await put('spends/w13', NUR, sp(NUR, { kind: 'bet', game: fresh, amt: 6 })), 'a bet naming no side');
  assert.ok(!await put('spends/w14', NUR, sp(NUR, { kind: 'gift', to: B1, amt: 5, side: 'b' })), 'a gift carrying a side');
  // a lobby opened from 2026-10-26 takes bets only if it is played for five or more
  const cheap = await lobby({ at: Date.now(), stake: 2, slots: seated(Date.now()) });
  const free = await lobby({ at: Date.now(), slots: seated(Date.now()) });
  const five = await lobby({ at: Date.now(), stake: 5, slots: seated(Date.now()) });
  assert.ok(!await put('spends/w15', NUR, bet(cheap)), 'a bet landed on a new 2-coin game');
  assert.ok(!await put('spends/w16', NUR, bet(free)), 'a bet landed on a new free game');
  assert.ok(await put('spends/w17', NUR, bet(five)), 'a spectator could not bet on a new 5-coin game');

  // a seat stamps when it was taken, on the server's clock, once, and only its own
  const open = await lobby({ slots: { bf: SLOTS.bf } });
  assert.ok(await put(`challenges/${open}/slots/bf/at`, B1, NOW), 'a player could not stamp their seat');
  assert.ok(!await put(`challenges/${open}/slots/bf/at`, B1, NOW), 'a seat was stamped twice, reopening the betting');
  const open2 = await lobby({ slots: { bf: SLOTS.bf } });
  assert.ok(!await put(`challenges/${open2}/slots/bf/at`, B1, 5), 'a seat was stamped with a time the client picked');
  assert.ok(!await put(`challenges/${open2}/slots/bf/at`, R1, NOW), 'somebody stamped another player’s seat');
  /* A bet on the cup: within five minutes of the admin's draw, on a team in it,
     by anyone, the players included. Only the admin stamps a draw. */
  const TS = ['Rifat + Rashed', 'Siddiq + Shewa', 'Nur + Ofi'];
  assert.ok(await put('cupDrawn/k1', ADMIN, { at: NOW, teams: TS }), 'the admin could not stamp a draw');
  assert.ok(!await put('cupDrawn/k2', B1, { at: NOW, teams: TS }), 'a player stamped a draw');
  assert.ok(!await put('cupDrawn/k3', ADMIN, { at: 5, teams: TS }), 'a draw was stamped with a time the client picked');
  assert.ok(await put('cupDrawn/old', 'owner', { at: Date.now() - 6 * 6e4, teams: TS }), 'fixture old failed to plant');
  assert.ok(await put('cupDrawn/two', 'owner', { at: Date.now(), teams: TS.slice(0, 2) }), 'fixture two failed to plant');
  const cb = (cup, extra) => sp(B1, { kind: 'cupbet', cup, team: 1, amt: 6, ...extra });
  assert.ok(await put('spends/c1', B1, cb('k1')), 'a player could not bet on the cup');
  assert.ok(await put('spends/c2', B1, cb('k1', { team: 0, amt: 10 })), 'a player could not bet ten on their own team');
  assert.ok(!await put('spends/c3', B1, cb('old')), 'a cup bet landed after the five minutes');
  assert.ok(!await put('spends/c4', B1, cb('two')), 'a cup bet landed on a 2-team cup');
  assert.ok(!await put('spends/c5', B1, cb('nope')), 'a cup bet landed on a cup never drawn');
  assert.ok(!await put('spends/c6', B1, cb('k1', { team: 3 })), 'a cup bet landed on a team not in the cup');
  assert.ok(!await put('spends/c7', B1, cb('k1', { team: 0.5 })), 'a cup bet on half a team');
  assert.ok(!await put('spends/c8', B1, cb('k1', { amt: 11 })), 'a cup bet over ten');
  assert.ok(!await put('spends/c9', B1, sp(B1, { kind: 'cupbet', cup: 'k1', amt: 6 })), 'a cup bet naming no team');
  assert.ok(!await put('spends/c10', B1, cb('k1', { side: 'b' })), 'a cup bet carrying a side');
  assert.ok(!await put('spends/c11', B1, sp(B1, { kind: 'gift', to: R1, amt: 5, team: 1 })), 'a gift carrying a team');
  // a gift may carry a short note, and nothing else may
  assert.ok(await put('spends/n1', B1, sp(B1, { kind: 'gift', to: R1, amt: 1, note: 'Happy birthday!' })), 'a gift could not carry a note');
  assert.ok(!await put('spends/n2', B1, sp(B1, { kind: 'gift', to: R1, amt: 1, note: 'x'.repeat(61) })), 'a note over 60 characters');
  assert.ok(!await put('spends/n3', B1, sp(B1, { kind: 'bounty', to: R1, amt: 2, note: 'hi' })), 'a bounty carrying a note');
  // a tree's three rows carry nothing but who and when
  assert.ok(await put('spends/t1', B1, sp(B1, { kind: 'plant' })), 'a player could not plant a tree');
  assert.ok(await put('spends/t2', B1, sp(B1, { kind: 'grow' })), 'a player could not grow a tree');
  assert.ok(await put('spends/t3', B1, sp(B1, { kind: 'water' })), 'a player could not water a tree');
  assert.ok(await put('spends/t4', B1, sp(B1, { kind: 'collect' })), "a player could not collect a tree's coins");
  assert.ok(!await put('spends/x10', B1, sp(B1, { kind: 'water', amt: 5 })), 'a water carrying an amount');
  // a skip is whatever stage the walk has you on: it carries nothing either
  assert.ok(await put('spends/k1', B1, sp(B1, { kind: 'skip' })), 'a player could not skip a track stage');
  assert.ok(!await put('spends/x11', B1, sp(B1, { kind: 'skip', amt: 5 })), 'a skip carrying an amount');
}
// ---- one seat each, on the server's clock ----
/* The walk only pays four different players, but the rules turn the obvious way
   of faking one away first: a second seat for the same account, in the opening
   write or taken later, and a lobby or a result dated by whoever wrote it. */
{
  const two = { by: B1, at: NOW, slots: { bf: { name: 'Rifat', email: B1 }, bd: { name: 'Rifat', email: B1 } } };
  assert.ok(!await put('challenges/dbl1', B1, two), 'a lobby opened holding one player in two seats');
  assert.ok(await put('challenges/dbl2', B1, { by: B1, at: NOW, slots: { bf: { name: 'Rifat', email: B1 } } }),
    'a lobby could not be opened');
  assert.ok(!await put('challenges/dbl2/slots/bd', B1, { name: 'Rifat', email: B1 }), 'a player took a second seat');
  assert.ok(!await put('challenges/dbl2/slots/rf', B1, { name: 'Rifat', email: B1 }), 'a player took a seat on both sides');
  assert.ok(await put('challenges/dbl2/slots/rf', R1, { name: 'Siddiq', email: R1 }), 'a second player could not sit');
  assert.ok(!await put('challenges/old1', B1, { by: B1, at: 1, slots: { bf: { name: 'Rifat', email: B1 } } }),
    'a lobby was backdated');
  const id = await lobby();
  await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, 3));
  assert.ok(!await confirm(id, R1, 5, 3, 1), 'a result was backdated');
  assert.ok(!await confirm(id, R1, 5, 3, Date.now() + 864e5), 'a result was dated tomorrow');
}
// ---- calling a full lobby off ----
/* A full lobby is sealed so nobody deletes a game they lost. Three of the four
   can still call it off — any three includes a winner, so two losers can't. */
{
  const id = await lobby();
  assert.ok(!await put(`challenges/${id}/off/bf`, OUT, true), 'a stranger voted for a seat');
  assert.ok(!await put(`challenges/${id}/off/bd`, B1, true), "a player voted for someone else's seat");
  assert.ok(!await put(`challenges/${id}/off/bf`, B1, 'yes'), 'a vote that is not true stood');
  assert.ok(await put(`challenges/${id}/off/bf`, B1, true), 'a player could not vote to call it off');
  assert.ok(await del(`challenges/${id}/off/bf`, B1), 'a player could not take their vote back');
  await put(`challenges/${id}/off/bf`, B1, true);
  await put(`challenges/${id}/off/bd`, B2, true);
  assert.ok(!await del('challenges/' + id, B2), 'two votes called a lobby off');
  await put(`challenges/${id}/off/rf`, R1, true);
  assert.ok(await del('challenges/' + id, R1), 'three votes could not call a lobby off');
  assert.equal(await read('challenges/' + id), null, 'the called-off lobby is still there');

  const filed = await lobby({ off: { bf: true, bd: true } });
  await put(`challenges/${filed}/pending`, R1, claim(R1, 'r', 5, 3));
  assert.ok(!await put(`challenges/${filed}/off/rd`, R2, true), 'a vote landed on a filed result');
  const short = await lobby({ slots: { bf: SLOTS.bf } });
  assert.ok(!await put(`challenges/${short}/off/bf`, B1, true), 'a vote landed on an unfilled lobby');
}
// ---- approving a cup score ----
/* The cup itself is the admin's alone; an approval lands beside it in
   cupResults. The roster is the admin's word on who plays for which team, so a
   suggestion names its two teams by index and the rules check the approver
   against them: an opponent of the suggester, or either side when a spectator
   suggested, and never the suggester's own teammate. */
{
  const SAZ = 'sazedulhaque5@gmail.com', NUR = 'nuralam862@gmail.com';
  // team 0 is blue's pair, team 1 red's, team 2 a pair with nobody listed
  assert.ok(await put('cupRoster/k1', 'owner', { 0: { fwd: B1, def: B2 }, 1: { fwd: R1, def: R2 }, 2: {} }), 'roster fixture');
  const TA = { fwd: 'Rifat', def: 'Rashed' }, TB = { fwd: 'Siddiq', def: 'Shewa' };
  const sug = (email, extra) => ({ sa: 10, sb: 6, pa: { fwd: 6, def: 4 }, pb: { fwd: 4, def: 2 },
    ta: TA, tb: TB, ia: '0', ib: '1', by: 'x', email, at: 1, ...extra });
  const approve = (key, who, s, over) => patch('', who, {
    [`cupResults/k1/${key}`]: { sa: s.sa, sb: s.sb, pa: s.pa, pb: s.pb, ta: s.ta, tb: s.tb,
      ia: s.ia, ib: s.ib, by: who, at: NOW, ...over },
    [`suggestions/k1/${key}`]: null,
  });

  // a suggestion is in its author's own name
  assert.ok(!await put('suggestions/k1/0_0', B1, sug(R1)), 'a suggestion was filed in someone else’s name');
  // and only a listed player files one: an alt account posing as a spectator
  // would otherwise open the match to the suggester's own teammate
  assert.ok(!await put('suggestions/k1/0_0', OUT, sug(OUT)), 'an unlisted account filed a suggestion');
  // the admin can list somebody from the page, and nobody else can
  const NEW = 'new.player@gmail.com', NEWKEY = 'players/new,player@gmail,com';
  assert.ok(!await put(NEWKEY, B1, 'New'), 'a player added somebody to the list');
  assert.ok(!await put(NEWKEY, ADMIN, ''), 'a player was added with no name');
  assert.ok(await put(NEWKEY, ADMIN, 'New'), 'the admin could not add a player');
  assert.ok(await put('suggestions/k1/9_9', NEW, sug(NEW)), 'a player the admin added could not suggest');
  assert.ok(!await del(NEWKEY, B1), 'a player removed somebody from the list');
  assert.ok(await del(NEWKEY, ADMIN) && await del('suggestions/k1/9_9', ADMIN), 'the admin could not remove a player');
  // holidays: only the admin sets them, as first day -> a last day not before it
  assert.ok(!await put('holidays/2026-10-20', B1, '2026-10-21'), 'a player set a holiday');
  assert.ok(!await put('holidays/2026-10-20', ADMIN, '2026-10-19'), 'a holiday ended before it began');
  assert.ok(await put('holidays/2026-10-20', ADMIN, '2026-10-21'), 'the admin could not set a holiday');
  assert.ok(await del('holidays/2026-10-20', ADMIN), 'the admin could not remove a holiday');
  // cards: only the admin writes them, and a claim names one that exists
  const CARD = { title: 'Jumu’ah Mubarak', text: 'Hi', coins: 2, from: '2026-10-23', to: '2026-10-23' };
  assert.ok(!await put('cards/1', B1, CARD), 'a player wrote a card');
  assert.ok(!await put('cards/1', ADMIN, { ...CARD, coins: 21 }), 'a card paid more than 20');
  assert.ok(!await put('cards/1', ADMIN, { ...CARD, to: '2026-10-22' }), 'a card ended before it began');
  assert.ok(!await put('cards/1', ADMIN, { ...CARD, style: 'neon' }), 'a card took a style there is none of');
  assert.ok(await put('cards/1', ADMIN, { ...CARD, style: 'jumuah' }), 'the admin could not write a card');
  assert.ok(!await put('spends/cl0', B1, { by: B1, at: NOW, kind: 'claim', card: '2' }), 'a claim on a card that does not exist');
  assert.ok(await put('spends/cl1', B1, { by: B1, at: NOW, kind: 'claim', card: '1' }), 'a player could not claim a card');
  assert.ok(await del('cards/1', ADMIN) && await del('spends/cl1', ADMIN), 'the admin could not remove a card');

  // a player suggested: only the other side may approve
  let s = sug(B1);
  assert.ok(await put('suggestions/k1/0_0', B1, s), 'a player could not suggest');
  assert.ok(!await approve('0_0', B1, s), 'the suggester approved their own score');
  assert.ok(!await approve('0_0', B2, s), 'the suggester’s teammate approved');
  assert.ok(!await approve('0_0', OUT, s), 'a stranger approved');
  assert.ok(!await approve('0_0', SAZ, s), 'a listed player outside the match approved');
  assert.ok(!await approve('0_0', R1, s, { sa: 10, sb: 7 }), 'an approval changed the score');
  assert.ok(!await approve('0_0', R1, s, { pa: { fwd: 7, def: 3 } }), 'an approval changed who scored');
  assert.ok(!await approve('0_0', R1, s, { ia: '2' }), 'an approval moved the match to other teams');
  assert.ok(!await approve('0_0', R1, s, { ta: { fwd: 'Nur', def: 'Ofi' } }), 'an approval renamed a team');
  assert.ok(!await approve('0_0', R1, s, { at: 5 }), 'an approval was backdated');
  assert.ok(await approve('0_0', R1, s), 'an opponent could not approve');
  assert.equal((await read('cupResults/k1/0_0')).sa, 10, 'the approved score is not in cupResults');
  assert.equal(await read('suggestions/k1/0_0'), null, 'the suggestion outlived its approval');
  // nothing to approve once the suggestion is spent
  assert.ok(!await approve('0_0', R2, s), 'an approval landed with no suggestion behind it');

  // a spectator suggested: either side may approve
  s = sug(NUR);
  await put('suggestions/k1/0_1', NUR, s);
  assert.ok(await approve('0_1', B2, s), 'a player could not approve a spectator’s suggestion');
  await put('suggestions/k1/0_2', NUR, s);
  assert.ok(await approve('0_2', R2, s), 'the other side could not approve a spectator’s suggestion');

  // a draw is no result, and an old suggestion that names no teams has nobody to approve it
  s = sug(B1, { sa: 6, sb: 6, pa: { fwd: 3, def: 3 }, pb: { fwd: 3, def: 3 } });
  await put('suggestions/k1/0_3', B1, s);
  assert.ok(!await approve('0_3', R1, s), 'a drawn score was approved');
  s = sug(B1); delete s.ia; delete s.ib;
  await put('suggestions/k1/0_4', B1, s);
  assert.ok(!await approve('0_4', R1, s), 'a suggestion with no teams was approved');

  // the admin merges results into the cup and clears them; nobody else can
  assert.ok(!await del('cupResults/k1/0_1', R1), 'a player removed an approved result');
  assert.ok(!await put('cupRoster/k1/2', B1, { fwd: B1 }), 'a player wrote themselves onto the roster');
  assert.ok(await del('cupResults/k1/0_1', ADMIN), 'the admin could not clear a merged result');
  assert.ok(await del('cupResults', ADMIN) && await del('cupRoster', ADMIN), 'Start Over could not wipe the cup’s side nodes');
}
// the rules carry their own copy of EMAIL_NAMES — they can't read the page — so
// adding a player means both; this fails the moment the two drift apart
{
  const emails = src => [...src.matchAll(/'([^']+@[^']+)'/g)].map(m => m[1]).sort();
  const page = readFileSync(new URL('index.html', import.meta.url), 'utf8').match(/const EMAIL_NAMES = \{([\s\S]*?)\};/)[1];
  const rule = JSON.parse(readFileSync(new URL('database.rules.json', import.meta.url), 'utf8'))
    .rules.suggestions.$cup.$key['.validate'];
  assert.deepEqual([...new Set(emails(rule))], emails(page), 'the rules’ player list and EMAIL_NAMES differ');
}
console.log('ok');
