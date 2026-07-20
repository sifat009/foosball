import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import assert from 'assert';

/* run: npx playwright@1.61 install chromium && node test.mjs
   Firebase itself is blocked here, so this covers the app logic and the admin
   gate offline. Real Google sign-in and the live sync need the manual checks
   listed in the README. */

const HASH = 'eyJzY3JlZW4iOiJ0b3VybmV5IiwiZndkVGV4dCI6IlJpZmF0XG5OdXJcblNhemVkdWwgSGFxdWVcblNhamVlYlxuU2lkZGlxIiwiZGVmVGV4dCI6Ik9maVxuU2hld2FcblRvdWZpcVxuUmFzaGVkXG5TaWZhdFxuIiwiZndkcyI6W3sibmFtZSI6IlJpZmF0IiwicGlja2VkIjp0cnVlfSx7Im5hbWUiOiJOdXIiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlNhemVkdWwgSGFxdWUiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlNhamVlYiIsInBpY2tlZCI6dHJ1ZX0seyJuYW1lIjoiU2lkZGlxIiwicGlja2VkIjp0cnVlfV0sImRlZnMiOlt7Im5hbWUiOiJPZmkiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlNoZXdhIiwicGlja2VkIjp0cnVlfSx7Im5hbWUiOiJUb3VmaXEiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlJhc2hlZCIsInBpY2tlZCI6dHJ1ZX0seyJuYW1lIjoiU2lmYXQiLCJwaWNrZWQiOnRydWV9XSwidGVhbXMiOlt7ImZ3ZCI6Ik51ciIsImRlZiI6IlJhc2hlZCJ9LHsiZndkIjoiU2lkZGlxIiwiZGVmIjoiU2hld2EifSx7ImZ3ZCI6IlJpZmF0IiwiZGVmIjoiU2lmYXQifSx7ImZ3ZCI6IlNhamVlYiIsImRlZiI6IlRvdWZpcSJ9LHsiZndkIjoiU2F6ZWR1bCBIYXF1ZSIsImRlZiI6Ik9maSJ9XSwia29TdGFydGVkIjpmYWxzZSwiZ3JvdXBTY29yZXMiOltbW251bGwsbnVsbF0sWzEwLDhdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFsxMCw3XSxbbnVsbCxudWxsXSxbbnVsbCxudWxsXV1dLCJrb1BpY2tzIjpbXX0';

const server = createServer(async (req, res) => {
  try {
    res.end(await readFile(new URL('.' + req.url.split('?')[0], import.meta.url)));
  } catch { res.statusCode = 404; res.end('nope'); }
}).listen(0);
const URL_BASE = `http://localhost:${server.address().port}/index.html`;

const b = await chromium.launch();
const page = await b.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// block Firebase so the suite runs offline and deterministically
await page.route('**gstatic.com/**', r => r.abort());

await page.goto(URL_BASE);

// ---------- boot gate: nothing paints until the database answers ----------
assert.ok(await page.isVisible('#boot'), 'no loading state on first paint');
assert.ok(!(await page.isVisible('#setup')), 'setup screen painted before the snapshot — this is the flicker');
// Firebase is blocked here, so only the escape-hatch timer can clear it
await page.waitForSelector('#setup', { timeout: 6000 });
assert.ok(!(await page.isVisible('#boot')), 'loading state never cleared');
console.log('boot gate + fallback OK');

// ---------- default state is read-only ----------
assert.ok(await page.isVisible('#viewBadge'), 'view badge should show for a signed-out visitor');
assert.equal(await page.evaluate(() => isAdmin), false, 'nobody is admin before sign-in');
assert.ok(await page.evaluate(() => document.body.classList.contains('view')), 'body should start in view mode');
assert.ok(!(await page.isVisible('#startBtn')), 'draft button visible to a viewer');
console.log('default read-only OK');

// ---------- the live cup renders from a pushed state ----------
await page.evaluate(h => window.applyState(window.decodeState(h)), HASH);
await page.waitForTimeout(200);
const groupsText = await page.textContent('#groups');
for (const t of ['Nur + Rashed', 'Siddiq + Shewa', 'Rifat + Sifat', 'Sajeeb + Toufiq', 'Sazedul Haque + Ofi'])
  assert.ok(groupsText.includes(t), 'missing team: ' + t);
assert.equal((await page.$$('#groups .score')).length, 20, 'expected 10 matches for 5 teams');
const disabled = await Promise.all((await page.$$('#groups .score')).map(s => s.isDisabled()));
assert.ok(disabled.every(Boolean), 'viewer can edit scores');
assert.ok(!(await page.isVisible('#koBtn')), 'viewer sees the knockout button');
console.log('viewer renders live cup OK');

// ---------- admin unlocks editing and writes ----------
await page.evaluate(() => {
  window.writes = [];
  window.saveToDb = j => window.writes.push(j);
  window.markRemote();
  window.setAdmin(true);
});
await page.waitForTimeout(200);
assert.ok(!(await page.evaluate(() => document.body.classList.contains('view'))), 'admin still in view mode');
const adminDisabled = await Promise.all((await page.$$('#groups .score')).map(s => s.isDisabled()));
assert.ok(!adminDisabled.some(Boolean), 'admin cannot edit scores');

const first = (await page.$$('#groups .score'))[0];
await first.fill('9');
await first.dispatchEvent('change');
await page.waitForTimeout(150);
const writes = await page.evaluate(() => window.writes);
assert.ok(writes.length > 0, 'admin edit did not write to the database');

// the write must survive a round-trip with its nulls intact — the reason
// state is stored as a JSON string rather than a nested RTDB object
const last = JSON.parse(writes[writes.length - 1]);
assert.equal(last.groupScores[0][0][0], 9, 'edited score not in the payload');
assert.deepEqual(last.groupScores[0][2], [null, null], 'unplayed match lost its nulls');
assert.equal(last.groupScores[0].length, 10, 'match list truncated');
assert.equal(last.teams.length, 5, 'teams lost in the payload');
console.log('admin edit + write payload OK');

// ---------- writes are refused before the first snapshot ----------
await page.evaluate(() => { window.writes = []; gotRemote = false; renderAll(); });
assert.equal((await page.evaluate(() => window.writes)).length, 0,
  'wrote to the database before knowing what was in it');
console.log('pre-snapshot write guard OK');

// ---------- signing out re-locks ----------
await page.evaluate(() => window.setAdmin(false));
await page.waitForTimeout(150);
const relocked = await Promise.all((await page.$$('#groups .score')).map(s => s.isDisabled()));
assert.ok(relocked.every(Boolean), 'scores still editable after sign-out');
console.log('sign-out re-lock OK');

// ---------- past champions ----------
assert.ok(await page.isVisible('#hallBtn'), 'a viewer cannot reach the past champions');
assert.ok((await page.textContent('#hallList')).includes('No cups completed yet'), 'missing empty state');

await page.evaluate(() => window.renderHall([
  { champion: 'Nur + Rashed', date: Date.parse('2026-01-05') },
  { champion: 'Rifat + Sifat', date: Date.parse('2026-03-11') },
]));
const rows = await page.$$eval('.hall-row', rs => rs.map(r => r.textContent));
assert.equal(rows.length, 2, 'expected one row per recorded cup');
assert.ok(rows[0].includes('Rifat + Sifat'), 'newest cup is not listed first');
assert.ok(rows[0].includes('#2') && rows[1].includes('#1'), 'cup numbering does not follow chronology');

await page.click('#hallBtn');
assert.ok(await page.isVisible('#hall'), 'past champions did not open');
await page.click('#hallClose');
assert.ok(!(await page.isVisible('#hall')), 'past champions did not close');

// deciding the final records the champion; undoing it takes the entry back out
const log = await page.evaluate(() => {
  const got = [];
  window.recordChampion = (id, c) => got.push(['set', id, c]);
  window.clearChampion = id => got.push(['clear', id]);
  window.setAdmin(true);
  window.markRemote();
  const nur = { fwd: 'Nur', def: 'Rashed' }, rifat = { fwd: 'Rifat', def: 'Sifat' };
  koStarted = true;
  koRounds = [[{ a: nur, b: rifat, winner: null }]];
  cupId = 'cup-1';
  renderAll();                       // unfinished final — nothing recorded
  setKoWinner(0, 0, nur);            // decided
  setKoWinner(0, 0, rifat);          // corrected
  setKoWinner(0, 0, rifat);          // clicking the winner again undoes it
  return got;
});
assert.deepEqual(log, [
  ['set', 'cup-1', 'Nur + Rashed'],
  ['set', 'cup-1', 'Rifat + Sifat'],
  ['clear', 'cup-1'],
], 'the final should drive the record: no write until decided, corrections overwrite the same entry, undo removes it');

// a viewer replaying the same snapshot must never write
const viewerLog = await page.evaluate(() => {
  const got = [];
  window.recordChampion = () => got.push('set');
  window.clearChampion = () => got.push('clear');
  window.setAdmin(false);
  koRounds[0][0].winner = koRounds[0][0].a;
  renderAll();
  return got;
});
assert.deepEqual(viewerLog, [], 'a viewer wrote to the champions record');

await page.evaluate(() => window.setAdmin(false));
console.log('past champions OK');

// ---------- mobile layout ----------
// the fixed buttons move to the bottom under @media (max-width: 640px). A media
// query adds no specificity, so an #id rule declared after the block silently
// beats it — which is exactly how the sign-in button ended up over the header.
await page.setViewportSize({ width: 375, height: 667 });
await page.evaluate(() => { window.setAdmin(true); show('tourney'); });
await page.waitForTimeout(200);

const { boxes, vw, vh } = await page.evaluate(() => ({
  vw: window.innerWidth,
  vh: window.innerHeight,
  boxes: ['hallBtn', 'resetBtn', 'authBtn'].map(id => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { id, l: r.left, r: r.right, t: r.top, b: r.bottom };
  }),
}));
for (const box of boxes) {
  assert.ok(box.l >= 0 && box.r <= vw, `${box.id} runs off the side of a phone screen`);
  assert.ok(box.t > vh / 2, `${box.id} is not pinned to the bottom on mobile — a later #id rule is overriding the media query`);
}
const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
for (let i = 0; i < boxes.length; i++)
  for (let j = i + 1; j < boxes.length; j++)
    assert.ok(!overlap(boxes[i], boxes[j]), `${boxes[i].id} and ${boxes[j].id} overlap on mobile`);

// all three share one row in the bottom bar — none stacked above another
const tops = boxes.map(b => Math.round(b.t));
assert.ok(Math.max(...tops) - Math.min(...tops) <= 1,
  'the bottom buttons are not on a single row: ' + JSON.stringify(tops));
const bar = await page.evaluate(() => {
  const r = document.getElementById('btnBar').getBoundingClientRect();
  return { b: Math.round(r.bottom), h: window.innerHeight };
});
assert.equal(bar.b, bar.h, 'the button bar is not flush with the bottom of the screen');

// the score inputs must bring up a numeric keypad, not the full keyboard
const kbd = await page.$eval('#groups .score', i => ({ type: i.type, mode: i.inputMode, pat: i.pattern }));
assert.deepEqual(kbd, { type: 'number', mode: 'numeric', pat: '[0-9]*' },
  'score inputs lost the numeric keypad hints');

assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), vw,
  'the page scrolls sideways on a phone');
console.log('mobile layout OK');

assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
await b.close();
server.close();
console.log('ALL PASS');
