/* node relay/test-relay.mjs — no database, no key, no network. */
import assert from 'node:assert';
import { delayFor, recipients } from './relay.mjs';

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

console.log('ok');
