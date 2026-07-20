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

assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
await b.close();
server.close();
console.log('ALL PASS');
