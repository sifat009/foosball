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
    { by: B1, at: 1, playAt: 2, slots: SLOTS, ...extra }), 'fixture ' + id + ' failed to plant');
  return id;
};
const claim = (by, side, b, r) => ({ b, r, by, side, at: 3 });
const confirm = (id, who, b, r) => patch('challenges/' + id, who, { score: { b, r }, pending: null });

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
  // and this is the one that works
  assert.ok(await confirm(id, R1, 5, 3), 'the opponent could not confirm');
  assert.deepEqual(await read(`challenges/${id}/score`), { b: 5, r: 3 });
  assert.equal(await read(`challenges/${id}/pending`), null, 'the claim outlived its confirmation');
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

// ---- a claim freezes the line-up ----
{
  const id = await lobby();
  assert.ok(await del(`challenges/${id}/slots/bd`, B2), 'a player could not leave before a claim');
  assert.ok(await put(`challenges/${id}/slots/bd`, B2, { name: 'Rashed', email: B2 }), 'the seat did not go back');
  await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, 3));
  // otherwise the side a claim was filed from could be vacated under it
  assert.ok(!await del(`challenges/${id}/slots/bd`, B2), 'a player left with a claim standing');
  assert.ok(!await del(`challenges/${id}/slots/rf`, R1), 'an opponent left with a claim standing');
  await confirm(id, R1, 5, 3);
  assert.ok(!await del(`challenges/${id}/slots/bd`, B2), 'a player left a settled game');
}

// ---- correcting a settled score ----
{
  const id = await lobby();
  await put(`challenges/${id}/pending`, B1, claim(B1, 'b', 5, 3));
  await confirm(id, R1, 5, 3);
  // the same path a first score takes, and the old figure stands until it lands
  assert.ok(await put(`challenges/${id}/pending`, R2, claim(R2, 'r', 5, 4)), 'a correction could not be filed');
  assert.deepEqual(await read(`challenges/${id}/score`), { b: 5, r: 3 }, 'a claim moved the ladder on its own');
  assert.ok(!await confirm(id, R1, 5, 4), 'a teammate confirmed the correction');
  assert.ok(await confirm(id, B1, 5, 4), 'the other side could not confirm the correction');
  assert.deepEqual(await read(`challenges/${id}/score`), { b: 5, r: 4 });
}

// ---- a lobby is never born with a result ----
{
  // the create write grants everything under it, so without this one clause an
  // account could open a lobby holding four names it typed and a score to match
  assert.ok(!await put('challenges/forged', OUT, {
    by: OUT, at: 1, playAt: 2, score: { b: 10, r: 0 },
    slots: { bf: { name: 'Rifat', email: OUT }, bd: { name: 'Rashed', email: OUT },
             rf: { name: 'Siddiq', email: OUT }, rd: { name: 'Shewa', email: OUT } },
  }), 'a lobby was created with a score on it');
  assert.ok(!await put('challenges/forged2', OUT, {
    by: OUT, at: 1, playAt: 2, pending: claim(OUT, 'b', 10, 0),
    slots: { bf: { name: 'Rifat', email: OUT } },
  }), 'a lobby was created with a claim on it');
  // opening one the ordinary way still works
  assert.ok(await put('challenges/plain', OUT,
    { by: OUT, at: 1, playAt: 2, slots: { bf: { name: 'Stranger', email: OUT } } }),
    'an ordinary lobby could not be opened');
}

console.log('ok');
