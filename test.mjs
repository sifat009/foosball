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

// ---------- the live cup renders from a pushed state ----------
await page.evaluate(h => window.applyState(window.decodeState(h)), HASH);
await page.waitForTimeout(200);
const groupsText = await page.textContent('#groups');
for (const t of ['Nur + Rashed', 'Siddiq + Shewa', 'Rifat + Sifat', 'Sajeeb + Toufiq', 'Sazedul + Ofi'])
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

assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
await b.close();
server.close();
console.log('ALL PASS');
