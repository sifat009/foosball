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
  // a tree's three rows carry nothing but who and when
  assert.ok(await put('spends/t1', B1, sp(B1, { kind: 'plant' })), 'a player could not plant a tree');
  assert.ok(await put('spends/t2', B1, sp(B1, { kind: 'grow' })), 'a player could not grow a tree');
  assert.ok(await put('spends/t3', B1, sp(B1, { kind: 'water' })), 'a player could not water a tree');
  assert.ok(await put('spends/t4', B1, sp(B1, { kind: 'collect' })), "a player could not collect a tree's coins");
  assert.ok(!await put('spends/x10', B1, sp(B1, { kind: 'water', amt: 5 })), 'a water carrying an amount');
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
console.log('ok');
