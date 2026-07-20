import { chromium } from 'playwright';
import assert from 'assert';

// run: npx playwright@1.61 install chromium && node test.mjs
const FILE = new URL('./index.html', import.meta.url).href;
const b = await chromium.launch();
const page = await b.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); process.exitCode = 1; });

// ---------- admin: run a full cup ----------
await page.goto(FILE);
await page.evaluate(() => { SPIN_MS = 30; });
await page.fill('#fwdInput', 'A1\nA2\nA3');
await page.fill('#defInput', 'B1\nB2\nB3');
await page.click('#startBtn');
for (let i = 0; i < 5; i++) {
  if (!(await page.isVisible('#spinBtn')) || await page.isDisabled('#spinBtn')) break;
  await page.click('#spinBtn');
  await page.waitForTimeout(2200);
}
await page.waitForSelector('#tourneyBtn:visible');
await page.click('#tourneyBtn');

assert.equal((await page.$$('#groups .score')).length, 6, 'expected 3 round-robin matches');
// the group re-renders on every change, so re-query the input each time
for (let i = 0; i < 6; i++) {
  const inp = (await page.$$('#groups .score'))[i];
  await inp.fill(i % 2 ? '1' : '3');
  await inp.dispatchEvent('change');
  await page.waitForTimeout(50);
}
await page.waitForSelector('#koBtn:visible');
await page.click('#koBtn');
await page.click('#bracket .slot:not(.empty)');
await page.click('#celebrate');
const champ = await page.textContent('#champion');
assert.ok(champ.includes('Champions'), 'no champion recorded');
const hash = await page.evaluate(() => location.hash);
assert.ok(hash.length > 20, 'state not in hash');

// admin's Share button must hand out a ?view=1 link
const shared = await page.evaluate(() => viewLink());
assert.ok(shared.endsWith('index.html?view=1' + hash), 'view link malformed: ' + shared);
console.log('admin flow OK — champion:', champ.trim());

// ---------- viewer: same state, read-only ----------
const v = await b.newPage();
v.on('pageerror', e => { console.log('VIEW PAGE ERROR:', e.message); process.exitCode = 1; });
await v.goto(FILE + '?view=1' + hash);
await v.waitForTimeout(300);

assert.ok(await v.isVisible('#viewBadge'), 'view badge hidden');
assert.ok((await v.textContent('#champion')).includes('Champions'), 'viewer sees no champion');
assert.ok((await v.textContent('#groups')).includes('A1'), 'viewer sees no standings');
for (const id of ['#spinBtn', '#tourneyBtn', '#koBtn', '#startBtn', '#resetBtn'])
  assert.ok(!(await v.isVisible(id)), id + ' visible in view mode');
assert.ok(await v.isVisible('#shareBtn'), 'viewer cannot re-share');

const vScores = await v.$$('#groups .score');
assert.ok(vScores.length > 0 && (await Promise.all(vScores.map(s => s.isDisabled()))).every(Boolean),
  'score inputs editable in view mode');

// clicking a bracket slot must not change the champion
const before = await v.textContent('#champion');
await v.click('#bracket .slot:not(.empty)', { force: true });
await v.waitForTimeout(150);
assert.equal(await v.textContent('#champion'), before, 'viewer changed the bracket');

// viewer must not write state anywhere
assert.equal(await v.evaluate(() => localStorage.getItem('ollyoCup')), null, 'viewer wrote localStorage');
assert.equal(await v.evaluate(() => location.hash), hash, 'viewer rewrote the hash');
console.log('view-only flow OK');

await b.close();
console.log('ALL PASS');
