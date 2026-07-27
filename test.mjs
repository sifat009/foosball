import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import assert from 'assert';

/* run: npx playwright@1.61 install chromium && node test.mjs
   Firebase itself is blocked here, so this covers the app logic and the admin
   gate offline. Real Google sign-in and the live sync need the manual checks
   listed in the README. */

const HASH = 'eyJzY3JlZW4iOiJ0b3VybmV5IiwiZndkVGV4dCI6IlJpZmF0XG5OdXJcblNhemVkdWwgSGFxdWVcblNhamVlYlxuU2lkZGlxIiwiZGVmVGV4dCI6Ik9maVxuU2hld2FcblRvdWZpcVxuUmFzaGVkXG5TaWZhdFxuIiwiZndkcyI6W3sibmFtZSI6IlJpZmF0IiwicGlja2VkIjp0cnVlfSx7Im5hbWUiOiJOdXIiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlNhemVkdWwgSGFxdWUiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlNhamVlYiIsInBpY2tlZCI6dHJ1ZX0seyJuYW1lIjoiU2lkZGlxIiwicGlja2VkIjp0cnVlfV0sImRlZnMiOlt7Im5hbWUiOiJPZmkiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlNoZXdhIiwicGlja2VkIjp0cnVlfSx7Im5hbWUiOiJUb3VmaXEiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlJhc2hlZCIsInBpY2tlZCI6dHJ1ZX0seyJuYW1lIjoiU2lmYXQiLCJwaWNrZWQiOnRydWV9XSwidGVhbXMiOlt7ImZ3ZCI6Ik51ciIsImRlZiI6IlJhc2hlZCJ9LHsiZndkIjoiU2lkZGlxIiwiZGVmIjoiU2hld2EifSx7ImZ3ZCI6IlJpZmF0IiwiZGVmIjoiU2lmYXQifSx7ImZ3ZCI6IlNhamVlYiIsImRlZiI6IlRvdWZpcSJ9LHsiZndkIjoiU2F6ZWR1bCBIYXF1ZSIsImRlZiI6Ik9maSJ9XSwia29TdGFydGVkIjpmYWxzZSwiZ3JvdXBTY29yZXMiOltbW251bGwsbnVsbF0sWzEwLDhdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFsxMCw3XSxbbnVsbCxudWxsXSxbbnVsbCxudWxsXV1dLCJrb1BpY2tzIjpbXX0';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  try {
    const body = await readFile(new URL('.' + path, import.meta.url));
    const ext = path.slice(path.lastIndexOf('.'));
    if (MIME[ext]) res.setHeader('Content-Type', MIME[ext]);
    res.end(body);
  } catch { res.statusCode = 404; res.end('nope'); }
}).listen(0);
const URL_BASE = `http://localhost:${server.address().port}/index.html`;

const b = await chromium.launch();
const page = await b.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// block Firebase so the suite runs offline and deterministically
await page.route(/gstatic\.com|fonts\.googleapis\.com/, r => r.abort());

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

// ---------- scheduled live draft: viewers count down, then drop into the draft ----------
// a viewer whose cup carries a future draftStartAt (draft not opened yet) waits on a
// ticking countdown; the admin still lands on setup so they can run the draft.
const future = Date.now() + 3 * 3600 * 1000;
await page.evaluate(t => window.applyState({ screen: 'setup', draftStartAt: t }), future);
await page.waitForTimeout(50);
assert.ok(await page.isVisible('#countdown'), 'a scheduled viewer never sees the countdown');
assert.ok(!(await page.isVisible('#setup')), 'the setup screen is showing under the countdown');
assert.match(await page.textContent('#cdClock'), /^0[0-3]:\d\d:\d\d$/, 'the countdown clock is not ticking HH:MM:SS');

// past the scheduled instant but before the admin opens: hold on "Starting soon…"
await page.evaluate(() => window.applyState({ screen: 'setup', draftStartAt: Date.now() - 60000 }));
await page.waitForTimeout(50);
assert.ok((await page.textContent('#cdClock')).includes('Starting soon'), 'a passed schedule should hold on Starting soon');

// the admin opening the draft flips every viewer straight to the live wheels
await page.evaluate(() => window.applyState({ screen: 'draw', draftStartAt: Date.now() - 60000,
  fwds: [{ name: 'A', picked: false }, { name: 'B', picked: false }],
  defs: [{ name: 'a', picked: false }, { name: 'b', picked: false }], teams: [] }));
await page.waitForTimeout(50);
assert.ok(await page.isVisible('#draw') && !(await page.isVisible('#countdown')),
  'opening the draft did not switch the viewer to the live wheels');
assert.ok(await page.isVisible('#draw .live-badge'), 'the live draft has no LIVE badge');
assert.equal(await page.evaluate(() => cdTimer), null, 'the countdown timer kept ticking after the draft opened');

// a spin is an animation, not state: the admin publishes it and viewers replay the
// same turn, rather than snapping to the result
const drawState = extra => ({ screen: 'draw', teams: [],
  fwds: [{ name: 'A', picked: false }, { name: 'B', picked: false }],
  defs: [{ name: 'a', picked: false }, { name: 'b', picked: false }], ...extra });
await page.evaluate(() => { SPIN_MS = 300; lastSpinN = null; fwdAngle = 0; defAngle = 0; }); // a fresh viewer
// joining mid-draft must NOT replay a spin that already happened
await page.evaluate(s => window.applyState(s), drawState({ spin: { n: 4, fi: 0, di: 0, sf: 0, sd: 0 } }));
const settled = await page.evaluate(() => fwdAngle);
await page.waitForTimeout(120);
assert.equal(await page.evaluate(() => fwdAngle), settled, 'joining mid-draft replayed an old spin');

// the real sequence: "Open the Draft" carries spin:null, and the FIRST spin after
// it must still register as new — this is the case that silently swallowed spin #1
await page.evaluate(() => { lastSpinN = null; });
await page.evaluate(s => window.applyState(s), drawState({}));           // no spin yet
await page.evaluate(s => window.applyState(s), drawState({ spin: { n: 1, fi: 1, di: 1, sf: 0, sd: 0 } }));
await page.waitForTimeout(80);
assert.notEqual(await page.evaluate(() => fwdAngle), settled, 'the first spin after opening the draft never reached viewers');
await page.waitForTimeout(400);

// a NEW spin number turns the viewer's wheel
await page.evaluate(() => { fwdAngle = 0; defAngle = 0; });
await page.evaluate(s => window.applyState(s), drawState({ spin: { n: 5, fi: 1, di: 1, sf: 0, sd: 0 } }));
await page.waitForTimeout(80);
const midSpin = await page.evaluate(() => fwdAngle);
assert.notEqual(midSpin, settled, 'a published spin did not turn the viewer wheel');
await page.waitForTimeout(400);
const endF = await page.evaluate(() => fwdAngle);
assert.notEqual(endF, midSpin, 'the viewer wheel stopped before the spin finished');
// it must land where the admin landed: winner segment centred under the top pointer
assert.ok(Math.abs(((-Math.PI/2 - endF) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - (1*Math.PI + Math.PI/2)) < 0.01,
  'the viewer wheel landed on a different segment than the admin');
// re-applying the same spin number must not spin again
await page.evaluate(s => window.applyState(s), drawState({ spin: { n: 5, fi: 1, di: 1, sf: 0, sd: 0 } }));
await page.waitForTimeout(120);
assert.equal(await page.evaluate(() => fwdAngle), endF, 'the same spin replayed twice');
await page.evaluate(() => { SPIN_MS = 4000; lastSpinN = null; });
console.log('spin broadcast OK');

// admin auth resolving while the viewer countdown is up must drop them onto setup,
// never trap them on the countdown they can't act from
await page.evaluate(t => window.applyState({ screen: 'setup', draftStartAt: t }), future);
await page.waitForTimeout(30);
assert.ok(await page.isVisible('#countdown'), 'precondition: the countdown should be up for a viewer');
await page.evaluate(() => { window.markRemote(); window.setAdmin(true); });
await page.waitForTimeout(50);
assert.ok(await page.isVisible('#setup') && !(await page.isVisible('#countdown')), 'the admin was trapped on the viewer countdown');
// re-applying the state as admin reflects the stored time in the schedule picker
await page.evaluate(t => window.applyState({ screen: 'setup', draftStartAt: t }), future);
await page.waitForTimeout(30);
assert.equal((await page.evaluate(() => document.getElementById('schedInput').value)).length, 16, 'the schedule picker did not reflect the stored time');
await page.evaluate(() => { window.setAdmin(false); draftStartAt = null; stopCountdown(); show('setup'); });
console.log('scheduled live draft OK');

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

// a past cup's celebration outlives the cup itself — the hall row replays it
assert.deepEqual(await page.$$eval('.hall-row', rs => [...new Set(rs.map(r => r.tagName))]), ['BUTTON'],
  'hall rows must be real buttons so they are keyboard reachable');
await page.click('.hall-row:nth-of-type(2)'); // the older cup, Nur + Rashed
assert.ok(await page.isVisible('#celebrate'), 'tapping a past cup did not replay its celebration');
assert.equal(await page.textContent('#champsName'), 'Nur + Rashed', 'replayed the wrong champion');
await page.locator('#celebrate').dispatchEvent('click'); // the confetti canvas covers the overlay, so dispatch straight at it
assert.ok(!(await page.isVisible('#celebrate')), 'celebration did not close');
assert.ok(await page.isVisible('#hall'), 'closing the replay should leave the hall open behind it');

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

// the crown is the shortcut for the cup in progress, and a viewer — who never
// gets the automatic celebration — must be able to trigger it
await page.locator('#celebrate').dispatchEvent('click'); // the block above decided a final
await page.evaluate(() => {
  window.setAdmin(false);
  restoring = true; // as if replaying a remote snapshot: no auto-celebration
  koRounds = [[{ a: { fwd: 'Nur', def: 'Rashed' }, b: { fwd: 'Rifat', def: 'Sifat' }, winner: null }]];
  koRounds[0][0].winner = koRounds[0][0].a;
  renderAll();
  restoring = false;
});
assert.ok(!(await page.isVisible('#celebrate')), 'a restored snapshot must not auto-celebrate');
assert.equal(await page.$eval('.crown', c => c.tagName), 'BUTTON', 'the crown must be a real button');
assert.ok((await page.textContent('.crown')).includes('Tap to replay'), 'no hint that the crown is tappable');
await page.click('.crown');
assert.ok(await page.isVisible('#celebrate'), 'the crown did not replay the celebration');
assert.equal(await page.textContent('#champsName'), 'Nur + Rashed', 'crown replayed the wrong champion');
// replaying while confetti is still falling must retire the old loop, not race it
const reentry = await page.evaluate(() => {
  celebrate('A + B');
  const first = celebrateRun;
  celebrate('C + D');
  return { advanced: celebrateRun === first + 1, showing: document.getElementById('champsName').textContent };
});
assert.ok(reentry.advanced, 're-entering celebrate must retire the previous confetti loop');
assert.equal(reentry.showing, 'C + D', 'the newer replay should own the screen');

// the fireworks have to actually reach the canvas, and have to stand down for
// anyone whose OS asks for less motion
const inkOnCanvas = () => page.evaluate(() => {
  const c = document.getElementById('confetti');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let s = 0;
  for (let i = 3; i < d.length; i += 4 * 11) s += d[i];
  return s;
});
// poll rather than sample one frame: a shell has to climb before it opens, so
// any single instant may hold nothing but a thin trail
let peak = 0;
for (let i = 0; i < 12 && peak < 40000; i++) {
  await page.waitForTimeout(250);
  peak = Math.max(peak, await inkOnCanvas());
}
assert.ok(peak >= 40000, 'fireworks never burst on the canvas, peak ink ' + peak);
await page.evaluate(() => {
  const real = window.matchMedia;
  window.matchMedia = q => /reduced-motion/.test(q) ? { matches: true } : real.call(window, q);
  celebrate('E + F');
  window.matchMedia = real;
});
await page.waitForTimeout(400);
assert.equal(await inkOnCanvas(), 0, 'prefers-reduced-motion should leave the sky empty');
await page.locator('#celebrate').dispatchEvent('click'); // the confetti canvas covers the overlay, so dispatch straight at it
assert.ok(!(await page.isVisible('#celebrate')), 'celebration did not close');
// names are user input and the crown builds with innerHTML — the name must not be markup
await page.evaluate(() => {
  koRounds = [[{ a: { fwd: '<img src=x onerror="window.__xss=1">', def: 'D' }, b: { fwd: 'B', def: 'C' }, winner: null }]];
  koRounds[0][0].winner = koRounds[0][0].a;
  renderAll();
});
assert.ok(!(await page.evaluate(() => window.__xss)) && !(await page.$('.crown img')),
  'a player name reached the DOM as markup');
console.log('celebration replay OK');

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

// ---------- rules sheet ----------
// the champion tests above fired the celebration — dismiss it the way a user does
if (await page.isVisible('#celebrate')) await page.locator('#celebrate').dispatchEvent('click');
await page.waitForTimeout(150);
assert.ok(!(await page.isVisible('#celebrate')), 'tapping the celebration did not dismiss it');

// ---------- player leaderboard ----------
// rollupPlayers: foosball is 2v2, so both partners share the team result;
// group matches carry goals, KO matches add a play/win but no goals.
const roll = await page.evaluate(() => {
  const nur = { fwd: 'Nur', def: 'Rashed' }, rifat = { fwd: 'Rifat', def: 'Sifat' }, saj = { fwd: 'Sajeeb', def: 'Toufiq' };
  groups = [{ name: 'A', teams: [nur, rifat, saj], matches: [
    { a: nur, b: rifat, sa: 10, sb: 7, winner: nur },
    { a: rifat, b: saj, sa: 8, sb: 9, winner: saj },
    { a: nur, b: saj, sa: null, sb: null, winner: null }, // unplayed — ignored
  ] }];
  koRounds = [[{ a: nur, b: saj, winner: nur }]];         // final, no scores
  koStarted = true;
  return rollupPlayers();
});
assert.deepEqual(roll['Nur'], { p: 2, w: 2, gf: 10, ga: 7 }, 'winner not credited group goals + KO win');
assert.deepEqual(roll['Rashed'], roll['Nur'], 'both partners must share the team result');
assert.deepEqual(roll['Sajeeb'], { p: 2, w: 1, gf: 9, ga: 8 }, 'KO loss should add a play, no goals');
assert.deepEqual(roll['Rifat'], { p: 2, w: 0, gf: 15, ga: 19 }, 'loser goals wrong');

// renderPlayers: aggregate across cups; titles count retroactively for cups
// archived before per-player stats existed (champion string only).
await page.evaluate(() => window.renderHall([
  { champion: 'Nur + Rashed', date: 1, players: { Nur: { p: 3, w: 3, gf: 20, ga: 10 }, Rashed: { p: 3, w: 3, gf: 20, ga: 10 }, Rifat: { p: 3, w: 0, gf: 5, ga: 18 } } },
  { champion: 'Rifat + Sifat', date: 2 }, // old cup, no players — title only
]));
await page.click('#hallBtn');
await page.click('.hall-tab[data-tab="players"]');
assert.ok(await page.isVisible('#hallPlayers') && !(await page.isVisible('#hallList')), 'players tab did not swap panes');
const pl = await page.$$eval('.pl-row:not(.pl-head)', rs => rs.map(r => r.textContent));
assert.equal(pl.length, 4, 'expected one row per distinct player');
assert.ok(pl[0].includes('Nur') && pl[0].includes('🏆 1') && pl[0].includes('100%'), 'top player wrong');
assert.ok(pl.find(r => r.includes('Sifat')).includes('🏆 1'), 'retroactive title (title-only old cup) missing');
assert.ok(pl.find(r => r.includes('Rifat')).includes('🏆 1'), 'retroactive title from champion string missing');
// best round is derived from play counts, not a stored field: in a 5-team cup
// everyone plays 4 group matches, so finalists land on 6 and semi losers on 5
await page.evaluate(() => {
  const s = (p, w) => ({ p, w, gf: 20, ga: 20 });
  window.renderHall([{ champion: 'Ofi + Sazedul', date: 1, players: {
    Ofi: s(6, 3), Sazedul: s(6, 3),   // champions
    Shewa: s(6, 2), Siddiq: s(6, 2),  // lost the final
    Rifat: s(5, 4), Sifat: s(5, 4),   // lost a semi
    Nur: s(4, 1), Rashed: s(4, 1),    // never left the group
    Sajeeb: s(5, 3), Toufiq: s(5, 3),
  } }]);
});
const best = Object.fromEntries(await page.$$eval('.pl-row:not(.pl-head)', rs =>
  rs.map(r => [r.querySelector('.pl-name').textContent, r.querySelector('.pl-best').textContent])));
assert.deepEqual(
  [best.Ofi, best.Shewa, best.Rifat, best.Nur], ['Won', 'Final', 'Semi', 'Group'],
  'best round should follow how deep the player went, not their win rate');
// the columns only scan if every row emits the same cells — the whole point of the grid
const widths = await page.$$eval('.pl-row', rs => rs.map(r => r.children.length));
assert.ok(widths.every(n => n === 7), 'every row (header included) must emit all 7 cells');

await page.click('.hall-tab[data-tab="cups"]');
assert.ok(await page.isVisible('#hallList') && !(await page.isVisible('#hallPlayers')), 'cups tab did not restore');
await page.click('#hallClose');
// this block poked koRounds/groups directly — clear it so the next test starts fresh
await page.evaluate(() => { groups = []; koRounds = []; koStarted = false; lastChamp = null; });
console.log('player leaderboard OK');

await page.click('#rulesBtn');
assert.ok(await page.isVisible('#rules'), 'the rules link did not open anything');
const rules = (await page.textContent('#rules')).replace(/\s+/g, ' '); // source wraps mid-sentence
for (const t of ['no points system', 'no draws', 'A1 v B2', 'every group match has a score'])
  assert.ok(rules.includes(t), 'rules sheet is missing: ' + t);
await page.keyboard.press('Escape');
assert.ok(!(await page.isVisible('#rules')), 'Escape did not close the rules');
console.log('rules sheet OK');

// ---------- player score suggestions ----------
// the champion tests left a knockout running; replay the group-stage snapshot
await page.evaluate(h => { window.setAdmin(false); window.applyState(window.decodeState(h)); }, HASH);
await page.waitForTimeout(200);

// a signed-out viewer must be told that signing in unlocks suggesting
assert.ok((await page.textContent('#tourneySub')).toLowerCase().includes('sign in to suggest'),
  'nothing invites a viewer to sign in and suggest');

const cup = await page.evaluate(() => {
  window.writes = [];
  window.sugLog = [];
  window.suggestScore = (...a) => window.sugLog.push(['set', ...a]);
  window.clearSuggestion = (...a) => window.sugLog.push(['clear', ...a]);
  window.markRemote();
  window.setSignedIn({ name: 'Nur', email: 'nur@example.com' }); // signed in, not the admin
  return cupId;
});
assert.ok((await page.textContent('#tourneySub')).toLowerCase().includes('suggest'),
  'a signed-in suggester is not told they can suggest scores');

// only the unrecorded matches open up — 2 of the 10 already have scores
const sugDisabled = await Promise.all((await page.$$('#groups .score')).map(s => s.isDisabled()));
assert.equal(sugDisabled.filter(Boolean).length, 4, 'a suggester should only reach matches with no score yet');
assert.ok(await page.evaluate(() => document.body.classList.contains('view')), 'a suggester is not an admin');

const openInput = (await page.$$('#groups .score'))[0];
await openInput.fill('7');
await openInput.dispatchEvent('change');
await page.waitForTimeout(150);
assert.deepEqual(await page.evaluate(() => window.sugLog), [
  ['set', cup, '0_0', 7, null, 'Nur', 'nur@example.com'],
], 'the suggestion did not land in the suggestions node with its author');
assert.deepEqual(await page.evaluate(() => window.writes), [], 'a suggestion wrote to the live cup');

// the suggester (still signed in) must see their score was sent, not just guess
await page.evaluate(c => window.renderSuggestions({ [c]: { '0_0': { sa: 7, sb: 3, by: 'Nur', email: 'nur@example.com' } } }), cup);
await page.waitForTimeout(150);
const mineText = (await page.textContent('.sug-bar.mine')).toLowerCase();
assert.ok(mineText.includes('sent') && mineText.includes('approv'), 'the suggester gets no confirmation their score was sent');
assert.equal((await page.$$('.sug-bar.mine .sug-btn')).length, 1, 'the suggester cannot withdraw their own suggestion');

// everyone else reads it off the bar; a viewer gets no controls
await page.evaluate(c => {
  window.setSignedIn(null);
  window.renderSuggestions({ [c]: { '0_0': { sa: 10, sb: 6, by: 'Nur', email: 'nur@example.com' } } });
}, cup);
await page.waitForTimeout(150);
assert.equal((await page.$$('.sug-bar')).length, 1, 'the pending suggestion is not shown');
const barText = await page.textContent('.sug-bar');
assert.ok(barText.includes('Nur') && barText.includes('10') && barText.includes('6'), 'bar omits the author or the score');
assert.equal((await page.$$('.sug-btn')).length, 0, 'a viewer can act on a suggestion');

// the admin accepts: it becomes a real score and the suggestion is spent
await page.evaluate(() => window.setAdmin(true));
await page.waitForTimeout(150);
assert.equal((await page.$$('.sug-ok')).length, 1, 'the admin has no way to accept');
await page.evaluate(() => { window.writes = []; window.sugLog = []; });
await page.click('.sug-ok');
await page.waitForTimeout(150);
const accepted = JSON.parse((await page.evaluate(() => window.writes)).pop());
assert.deepEqual(accepted.groupScores[0][0], [10, 6], 'accepting did not write the suggested score to the cup');
assert.deepEqual(await page.evaluate(() => window.sugLog), [['clear', cup, '0_0']], 'the accepted suggestion was not cleared');

// a suggestion from an earlier cup must never surface in this one
await page.evaluate(() => {
  window.setAdmin(false);
  window.renderSuggestions({ 'some-old-cup': { '0_2': { sa: 9, sb: 3, by: 'Ghost', email: 'g@example.com' } } });
});
await page.waitForTimeout(150);
assert.equal((await page.$$('.sug-bar')).length, 0, 'a previous cup\'s suggestion leaked into this one');
console.log('suggestions OK');

// ---------- 5-team single group seeds top-4 crossed semis ----------
// build one group of 5 with a clean 1>2>3>4>5 ranking (lower index always wins),
// then start the knockout and check the bracket shape and seeding
const ko = await page.evaluate(() => {
  window.setAdmin(true);
  const T = ['A','B','C','D','E'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  teams = T;
  const matches = [];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++)
    matches.push({ a: T[i], b: T[j], sa: 2, sb: 1, winner: T[i] });
  groups = [{ name: 'Group A', teams: T.slice(), matches }];
  koRounds = []; koStarted = false;
  startKnockout();
  const pair = m => [m.a && m.a.fwd, m.b && m.b.fwd];
  return { rounds: koRounds.length, semis: koRounds[0].map(pair), final: koRounds[1].map(pair) };
});
assert.equal(ko.rounds, 2, 'a single group of 5 should produce semis + a final, not a straight final');
assert.deepEqual(ko.semis, [['A', 'D'], ['B', 'C']], 'the semis should seed 1 v 4 and 2 v 3');
assert.deepEqual(ko.final, [[null, null]], 'the final should start empty until the semis are decided');
console.log('5-team semis OK');

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

// a spin turns both wheels at once, so on a phone they must share a row and fit
// on screen together — stacked, a viewer scrolling between them misses half the draw
await page.evaluate(() => {
  fwds = [{ name: 'Sazedul Haque', picked: false }, { name: 'B', picked: false }];
  defs = [{ name: 'a', picked: false }, { name: 'b', picked: false }];
  show('draw');
  drawWheel('fwdWheel', fwds, 0, -1);
  drawWheel('defWheel', defs, 0, -1);
});
await page.waitForTimeout(100);
const wh = await page.evaluate(() => {
  const f = fwdWheel.getBoundingClientRect(), d = defWheel.getBoundingClientRect();
  return { sameRow: Math.abs(f.top - d.top) < 2, bothOnScreen: Math.max(f.bottom, d.bottom) <= innerHeight };
});
assert.ok(wh.sameRow, 'the wheels stack on mobile — both must be watchable during one spin');
assert.ok(wh.bothOnScreen, 'both wheels must fit on screen at once during a live spin');

// the white ring is a box-shadow: it paints outside the canvas box without taking
// layout space, so the gap and the page edge must both clear it or the circles touch
const ring = await page.evaluate(() => {
  const f = fwdWheel.getBoundingClientRect(), d = defWheel.getBoundingClientRect();
  const spreads = [...getComputedStyle(fwdWheel).boxShadow.matchAll(/0px 0px 0px (\d+(?:\.\d+)?)px/g)]
    .map(m => parseFloat(m[1]));
  return { r: Math.max(...spreads), gap: d.left - f.right, edge: f.left, rightEdge: innerWidth - d.right };
});
assert.ok(ring.gap > 2 * ring.r,
  `the wheel rings overlap: ${ring.gap}px gap vs two ${ring.r}px rings`);
assert.ok(ring.edge > ring.r && ring.rightEdge > ring.r,
  `the wheel rings bleed off the screen edge: ${ring.edge}/${ring.rightEdge}px vs a ${ring.r}px ring`);

// drawWheel sizes labels by the canvas's CSS ratio, but a hidden canvas reports
// zero width and falls back to 1:1 — which is the real first-paint path, since
// applyState runs while the boot gate still has every screen display:none.
// Without a redraw the names sit at a sixth of their size until something spins.
const fontFix = await page.evaluate(() => {
  const seen = [];
  const real = CanvasRenderingContext2D.prototype.__lookupSetter__('font');
  Object.defineProperty(CanvasRenderingContext2D.prototype, 'font',
    { configurable: true, set(v) { seen.push(v); real.call(this, v); }, get: () => '' });
  document.body.classList.add('booting');
  drawWheel('fwdWheel', fwds, 0, -1);          // drawn hidden, like first paint
  const booting = seen.slice();
  seen.length = 0;
  window.bootDone();                            // gate lifts — must redraw
  const after = seen.slice();
  delete CanvasRenderingContext2D.prototype.font;
  const px = a => a.length ? Math.max(...a.map(f => parseFloat(f.match(/([\d.]+)px/)[1]))) : 0;
  return { hidden: px(booting), shown: px(after), ratio: 360 / fwdWheel.clientWidth };
});
assert.ok(fontFix.shown > fontFix.hidden * 1.5,
  `boot gate left the wheel labels tiny: ${fontFix.hidden}px drawn hidden, still ${fontFix.shown}px after boot`);
// 13px on screen for the narrow mobile wheels (15px on full-size ones)
assert.ok(Math.abs(fontFix.shown - 13 * fontFix.ratio) < 0.5,
  `wheel labels are not 13px on screen after boot (got ${fontFix.shown}px at a ${fontFix.ratio.toFixed(2)}x ratio)`);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), vw,
  'the side-by-side wheels push the page sideways');
console.log('mobile layout OK');

// ---------- coin toss ----------
// anyone can open it, the two dropdowns come from the live roster and can't pick
// the same team twice, and a flip always names a winner. It's ephemeral, so it
// must not scroll the page or touch cup state.
await page.evaluate(() => { window.setAdmin(false); show('tourney'); });
await page.click('#tossBtn');
await page.waitForTimeout(150);
const toss = await page.evaluate(() => ({
  open: document.getElementById('toss').classList.contains('open'),
  a: tossA.options.length, b: tossB.options.length, dup: tossA.value === tossB.value,
}));
assert.ok(toss.open, 'the coin toss overlay did not open');
assert.ok(toss.a >= 2 && toss.b >= 1, 'the toss dropdowns were not filled from the roster');
assert.ok(!toss.dup, 'the toss let a team play itself');
await page.click('#tossFlip');
await page.waitForFunction(
  () => /serves first/.test(document.getElementById('tossResult').textContent),
  null, { timeout: 3000 });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), vw,
  'the coin toss overlay scrolls the page sideways');
await page.click('#tossClose');
assert.ok(!(await page.evaluate(() => document.getElementById('toss').classList.contains('open'))),
  'the coin toss overlay would not close');
console.log('coin toss OK');

// ---------- shareable champion card ----------
// The card is drawn, not screenshotted, so the failures that matter are the
// invisible ones: the trophy SVG not rasterising, toBlob handing back nothing,
// a filename built from an undefined champion. Google Fonts is blocked above,
// so this asserts the bytes and the plumbing — never the pixels.
await page.evaluate(() => celebrate('Sifat + Ofi', { date: Date.UTC(2026, 6, 26) }));
const card = await page.evaluate(async () => {
  const img = await cupImage();
  const c = await drawCard('Sifat + Ofi', Date.UTC(2026, 6, 26));
  const ctx = c.getContext('2d');
  // the bowl covers dead centre; unpainted background there is near-black
  const [r, g] = ctx.getImageData(600, 400, 1, 1).data;
  return { w: c.width, h: c.height, svg: img.naturalWidth, lit: r > 180 && g > 150 };
});
assert.equal(card.w, 1200, 'share card is not 1200 wide');
assert.equal(card.h, 1200, 'share card is not 1200 tall');
assert.ok(card.svg > 0, 'the trophy SVG data URL did not rasterise');
assert.ok(card.lit, 'no trophy on the share card — centre of the canvas is still background');

const shared = await page.evaluate(() => new Promise(res => {
  navigator.canShare = () => true;
  navigator.share = d => {
    const f = d.files[0];
    res({ keys: Object.keys(d), name: f.name, type: f.type, size: f.size });
    return Promise.resolve();
  };
  document.getElementById('shareBtn').click();
}));
assert.deepEqual(shared.keys, ['files'], 'share payload carries more than the image: ' + shared.keys);
assert.equal(shared.type, 'image/png', 'shared file is not a PNG');
assert.ok(shared.size > 10000, `shared PNG is suspiciously small (${shared.size} bytes)`);
assert.equal(shared.name, 'champions-sifat-ofi-2026-07-26.png', 'wrong filename: ' + shared.name);
assert.ok(await page.isVisible('#celebrate'), 'sharing dismissed the celebration overlay');

// backing out of the OS sheet is a cancel, not a failure
await page.evaluate(() => {
  navigator.canShare = () => true;
  navigator.share = () => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' }));
  document.getElementById('shareBtn').click();
});
await page.waitForTimeout(200);
assert.equal(await page.textContent('#shareBtn span'), 'Share',
  'cancelling the share sheet showed an error on the button');
console.log('share card OK');

assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
await b.close();
server.close();
console.log('ALL PASS');
