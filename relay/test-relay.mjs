/* node relay/test-relay.mjs — no database, no key, no network. */
import assert from 'node:assert';
import { delayFor, recipients, sugReady, sugText } from './relay.mjs';

const NOW = 1_700_000_000_000;

// unscheduled rows go out at once; a past time is not a negative timeout
assert.equal(delayFor({ title: 'x' }, NOW), 0);
assert.equal(delayFor({ at: NOW - 60_000 }, NOW), 0);
assert.equal(delayFor({ at: NOW + 60_000 }, NOW), 60_000);
// a draft set months out must wait, not fire immediately on the overflow
assert.equal(delayFor({ at: NOW + 90 * 86_400_000 }, NOW), 2 ** 31 - 1);

const tokens = { anon: 1700000000000, boss: 'boss@x.com', mate: 'mate@x.com' };
assert.deepEqual(recipients(tokens, false, 'boss@x.com'), ['anon', 'boss', 'mate']);
// admin-only reaches the admin alone — not the viewer who left a timestamp,
// and not another signed-in account
assert.deepEqual(recipients(tokens, true, 'boss@x.com'), ['boss']);
assert.deepEqual(recipients({}, false, 'boss@x.com'), []);

// the alerts drawer: a kind switched off drops that device and nobody else
const prefs = { anon: { draw: true, result: false }, boss: { result: true } };
assert.deepEqual(recipients(tokens, false, 'boss@x.com', 'result', prefs), ['boss', 'mate']);
assert.deepEqual(recipients(tokens, false, 'boss@x.com', 'draw', prefs), ['anon', 'boss', 'mate']);
// silence is consent: no prefs row, no entry for the kind, or no kind on the
// row all mean the device still gets it
assert.deepEqual(recipients(tokens, false, 'boss@x.com', 'milestone', prefs), ['anon', 'boss', 'mate']);
assert.deepEqual(recipients(tokens, false, 'boss@x.com', 'result', null), ['anon', 'boss', 'mate']);
assert.deepEqual(recipients(tokens, false, 'boss@x.com', null, prefs), ['anon', 'boss', 'mate']);
// admin-only and the kind filter both apply — one can't smuggle past the other
assert.deepEqual(recipients(tokens, true, 'boss@x.com', 'result', prefs), ['boss']);
assert.deepEqual(recipients(tokens, true, 'boss@x.com', 'suggest',
  { boss: { suggest: false } }), []);

// a suggestion saved box by box: nothing is announced until both teams are in,
// or the admin's phone gets "9–undefined" and no second ping ever corrects it
assert.equal(sugReady({ by: 'Nur', pa: { fwd: 4, def: null } }), false);
assert.equal(sugReady({ by: 'Nur', sa: 9, pa: { fwd: 4, def: 5 } }), false);
assert.equal(sugReady({ by: 'Nur', sa: 9, sb: 6 }), true);
assert.equal(sugReady({ by: 'Nur', sa: 0, sb: 6 }), true); // 0 is a score, not a blank
assert.equal(sugReady({ by: 'Nur', sa: 5, sb: 5 }), false); // foosball has no draws
assert.equal(sugReady(null), false);

// the alert spells the result out — the admin decides on it without opening the app
const sug = {
  by: 'Nur', sa: 9, sb: 6, pa: { fwd: 4, def: 5 }, pb: { fwd: 2, def: 4 },
  ta: { fwd: 'Rifat', def: 'Sifat' }, tb: { fwd: 'Sajeeb', def: 'Toufiq' },
};
assert.equal(sugText(sug),
  'Nur suggested Rifat 4 + Sifat 5 = 9 vs Sajeeb 2 + Toufiq 4 = 6 — tap to accept or reject.');
// a cup with no individual goals still names the teams behind the totals
assert.equal(sugText({ ...sug, pa: null, pb: null }),
  'Nur suggested Rifat + Sifat 9 vs Sajeeb + Toufiq 6 — tap to accept or reject.');
// a suggestion saved before the names travelled reads as it always did
assert.equal(sugText({ by: 'Nur', sa: 9, sb: 6 }), 'Nur suggested 9 vs 6 — tap to accept or reject.');
// a goalless player is 0, not a blank
assert.match(sugText({ ...sug, pa: { fwd: 0, def: 9 } }), /Rifat 0 \+ Sifat 9 = 9/);

console.log('ok');
