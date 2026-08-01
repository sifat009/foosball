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

console.log('ok');
