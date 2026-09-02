/* node relay/test-relay.mjs — no database, no key, no network. */
import assert from 'node:assert';
import { delayFor, recipients, sugReady, sugText, chalNews, chalSeats, chalScored,
  chalClaim, chalClaimId, chalOthers } from './relay.mjs';

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

// nobody is pinged about their own tap, and the exclusion stacks with the rest
assert.deepEqual(recipients(tokens, false, 'boss@x.com', null, null, 'mate@x.com'), ['anon', 'boss']);
assert.deepEqual(recipients(tokens, false, 'boss@x.com', 'result', prefs, 'mate@x.com'), ['boss']);
// an anonymous device carries a timestamp, not an address — it is never excluded
assert.deepEqual(recipients(tokens, false, 'boss@x.com', null, null, 1700000000000), ['anon', 'boss', 'mate']);

// an announcement addressed to named people reaches them and nobody else —
// not the rest of the office, and not the signed-out devices
assert.deepEqual(recipients(tokens, false, 'boss@x.com', null, null, null, ['mate@x.com']), ['mate']);
assert.deepEqual(recipients(tokens, false, 'boss@x.com', null, null, null,
  ['mate@x.com', 'boss@x.com']), ['boss', 'mate']);
// a device signed in as nobody on the list is not on it
assert.deepEqual(recipients(tokens, false, 'boss@x.com', null, null, null, ['ghost@x.com']), []);
// the list stacks with the kind filter and with `except` rather than overriding
assert.deepEqual(recipients(tokens, false, 'boss@x.com', 'result', prefs, null,
  ['mate@x.com', 'anon']), ['mate']);
assert.deepEqual(recipients(tokens, false, 'boss@x.com', null, null, 'mate@x.com',
  ['mate@x.com', 'boss@x.com']), ['boss']);

// ---- challenges ----
const at = { hour: 'numeric', minute: '2-digit' };
const fmt = () => '3:00 PM'; // the clock is the host's; the branches are what matter
const seat = (n, e) => ({ name: n, email: e || n.toLowerCase() + '@x.com' });
const lobby = (slots, score) => ({ by: 'sifat@x.com', at: NOW, playAt: NOW + 3_600_000, slots, score });

const one = lobby({ bf: seat('Sifat') });
assert.deepEqual(chalSeats(one), ['bf']);
assert.equal(chalScored(one), false);

// opened: three seats to fill, and the person who opened it is not told
const opened = chalNews(null, one, fmt);
assert.equal(opened.title, 'Challenge open');
assert.equal(opened.body, 'Sifat wants a game at 3:00 PM — 3 seats left.');
assert.equal(opened.except, 'sifat@x.com');
// one seat left reads as a seat, not as 1 seats
assert.match(chalNews(null, lobby({ bf: seat('Sifat'), bd: seat('Ofi'), rf: seat('Nur') }), fmt).body,
  /1 seat left\.$/);

const full = lobby({ bf: seat('Sifat'), bd: seat('Ofi'), rf: seat('Nur'), rd: seat('Rashed') });
// full: the announcement names both pairs, and skips whoever just sat down
const on = chalNews({ seats: ['bf', 'bd', 'rf'], scored: false }, full, fmt);
assert.equal(on.title, 'Challenge on');
assert.equal(on.body, 'Sifat & Ofi vs Nur & Rashed at 3:00 PM.');
assert.equal(on.except, 'rashed@x.com');

// scored: both sides have agreed by the time this fires, so it goes to everybody
const won = chalNews({ seats: ['bf', 'bd', 'rf', 'rd'], scored: false },
  { ...full, score: { b: 5, r: 3 } }, fmt);
assert.equal(won.title, 'Blue 5–3 Red');
assert.equal(won.body, 'Sifat & Ofi win the challenge.');
assert.equal(won.except, null);
assert.equal(chalNews({ seats: ['bf', 'bd', 'rf', 'rd'], scored: false },
  { ...full, score: { b: 3, r: 5 } }, fmt).body, 'Nur & Rashed win the challenge.');
assert.match(chalNews({ seats: ['bf', 'bd', 'rf', 'rd'], scored: false },
  { ...full, score: { b: 4, r: 4 } }, fmt).body, /drawn\.$/);
// 0 is a score: a nil still announces the winner rather than reading as unplayed
assert.equal(chalNews({ seats: ['bf', 'bd', 'rf', 'rd'], scored: false },
  { ...full, score: { b: 5, r: 0 } }, fmt).title, 'Blue 5–0 Red');

// ---- claims ----
// half a claim is not one: nothing is announced until both figures are in
assert.equal(chalClaim({ ...full, pending: { b: 5, by: 'sifat@x.com', side: 'b' } }), null);
assert.equal(chalClaim(full), null);
assert.equal(chalClaim({ ...full, pending: { b: 5, r: 0, by: 'sifat@x.com', side: 'b' } }).r, 0);
// the identity carries the figures, so a counter-offer is a new claim
assert.equal(chalClaimId({ ...full, pending: { b: 5, r: 3, by: 'sifat@x.com', side: 'b' } }),
  'sifat@x.com|5-3');
assert.equal(chalClaimId(full), null);
// the far side of the table, which is who has to answer for it
assert.deepEqual(chalOthers(full, 'b'), ['nur@x.com', 'rashed@x.com']);
assert.deepEqual(chalOthers(full, 'r'), ['sifat@x.com', 'ofi@x.com']);

const claimed = { ...full, pending: { b: 5, r: 3, by: 'sifat@x.com', side: 'b' } };
const prevFull = { seats: ['bf', 'bd', 'rf', 'rd'], scored: false, claim: null };
const filed = chalNews(prevFull, claimed, fmt);
assert.equal(filed.title, 'Score to confirm');
assert.equal(filed.body, 'Sifat filed 5–3 in Sifat & Ofi vs Nur & Rashed — tap to confirm or reject.');
// it goes to the two who can settle it, never to the person who filed it
assert.deepEqual(filed.only, ['nur@x.com', 'rashed@x.com']);
assert.equal(filed.except, 'sifat@x.com');
// and under the alerts row for scores waiting on you, not the challenge row
assert.equal(filed.kind, 'suggest');

// the same claim twice is not news; a counter-offer from the other side is
assert.equal(chalNews({ ...prevFull, claim: 'sifat@x.com|5-3' }, claimed, fmt), null);
const counter = chalNews({ ...prevFull, claim: 'sifat@x.com|5-3' },
  { ...full, pending: { b: 5, r: 4, by: 'nur@x.com', side: 'r' } }, fmt);
assert.equal(counter.body, 'Nur filed 5–4 in Sifat & Ofi vs Nur & Rashed — tap to confirm or reject.');
// it now waits on the side that filed the first one
assert.deepEqual(counter.only, ['sifat@x.com', 'ofi@x.com']);
// a filer who never took a seat still reads as somebody
assert.match(chalNews(prevFull, { ...full, pending: { b: 5, r: 3, by: 'boss@x.com', side: 'b' } }, fmt).body,
  /^boss@x\.com filed 5–3 /);

// confirming clears the claim and writes the score in one update: that reads as
// the result, going to everybody, not as a claim that quietly disappeared
const agreed = chalNews({ ...prevFull, claim: 'sifat@x.com|5-3' },
  { ...full, score: { b: 5, r: 3 } }, fmt);
assert.equal(agreed.title, 'Blue 5–3 Red');
assert.equal(agreed.except, null);
assert.equal(agreed.only, undefined);
// a rejected claim just goes — there is nothing to announce about silence
assert.equal(chalNews({ ...prevFull, claim: 'sifat@x.com|5-3' }, full, fmt), null);
// a lobby first met with a claim on it is a row this process hadn't seen, not news
assert.equal(chalNews(null, claimed, fmt), null);

// nothing happened: the same snapshot twice says nothing
assert.equal(chalNews({ seats: ['bf'], scored: false }, one, fmt), null);
assert.equal(chalNews({ seats: ['bf', 'bd', 'rf', 'rd'], scored: true },
  { ...full, score: { b: 5, r: 3 } }, fmt), null);
// a seat filled short of the fourth is nobody's business but the board's
assert.equal(chalNews({ seats: ['bf'], scored: false },
  lobby({ bf: seat('Sifat'), bd: seat('Ofi') }), fmt), null);
// a lobby this process first meets already full or already played just is —
// announcing it would fire the whole node at everybody on a restart
assert.equal(chalNews(null, full, fmt), null);
assert.equal(chalNews(null, { ...full, score: { b: 5, r: 3 } }, fmt), null);
assert.equal(chalNews(null, null, fmt), null);
assert.equal(chalNews(null, { slots: {} }, fmt), null); // a row with no `at` is not a challenge

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
