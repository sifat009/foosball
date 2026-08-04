import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import assert from 'assert';

/* run: npx playwright@1.61 install chromium && node test.mjs
   Firebase itself is blocked here, so this covers the app logic and the admin
   gate offline. Real Google sign-in and the live sync need the manual checks
   listed in the README. */

const HASH = 'eyJzY3JlZW4iOiJ0b3VybmV5IiwiZndkVGV4dCI6IlJpZmF0XG5OdXJcblNhemVkdWwgSGFxdWVcblNhamVlYlxuU2lkZGlxIiwiZGVmVGV4dCI6Ik9maVxuU2hld2FcblRvdWZpcVxuUmFzaGVkXG5TaWZhdFxuIiwiZndkcyI6W3sibmFtZSI6IlJpZmF0IiwicGlja2VkIjp0cnVlfSx7Im5hbWUiOiJOdXIiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlNhemVkdWwgSGFxdWUiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlNhamVlYiIsInBpY2tlZCI6dHJ1ZX0seyJuYW1lIjoiU2lkZGlxIiwicGlja2VkIjp0cnVlfV0sImRlZnMiOlt7Im5hbWUiOiJPZmkiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlNoZXdhIiwicGlja2VkIjp0cnVlfSx7Im5hbWUiOiJUb3VmaXEiLCJwaWNrZWQiOnRydWV9LHsibmFtZSI6IlJhc2hlZCIsInBpY2tlZCI6dHJ1ZX0seyJuYW1lIjoiU2lmYXQiLCJwaWNrZWQiOnRydWV9XSwidGVhbXMiOlt7ImZ3ZCI6Ik51ciIsImRlZiI6IlJhc2hlZCJ9LHsiZndkIjoiU2lkZGlxIiwiZGVmIjoiU2hld2EifSx7ImZ3ZCI6IlJpZmF0IiwiZGVmIjoiU2lmYXQifSx7ImZ3ZCI6IlNhamVlYiIsImRlZiI6IlRvdWZpcSJ9LHsiZndkIjoiU2F6ZWR1bCBIYXF1ZSIsImRlZiI6Ik9maSJ9XSwia29TdGFydGVkIjpmYWxzZSwiZ3JvdXBTY29yZXMiOltbW251bGwsbnVsbF0sWzEwLDhdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFtudWxsLG51bGxdLFsxMCw3XSxbbnVsbCxudWxsXSxbbnVsbCxudWxsXV1dLCJrb1BpY2tzIjpbXSwiY3VwSWQiOiIxNzg1NzAwMDAwMDAwIn0=';

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
// the admin reads the same live clock off the schedule note, and keeps ticking
assert.match(await page.textContent('#schedNote'), /— 0[0-3]:\d\d:\d\d$/, 'the admin has no live countdown');
assert.ok(await page.evaluate(() => cdTimer), 'the countdown stopped ticking for the admin');
// the picker fills even when auth resolves after the snapshot landed
await page.evaluate(t => { window.setAdmin(false); document.getElementById('schedInput').value = '';
  window.applyState({ screen: 'setup', draftStartAt: t }); window.setAdmin(true); }, future);
await page.waitForTimeout(30);
assert.equal((await page.evaluate(() => document.getElementById('schedInput').value)).length, 16, 'late auth left the schedule picker empty');
await page.evaluate(() => { window.setAdmin(false); draftStartAt = null; stopCountdown(); show('setup'); });
console.log('scheduled live draft OK');

// ---------- the live cup renders from a pushed state ----------
await page.evaluate(h => window.applyState(window.decodeState(h)), HASH);
await page.waitForTimeout(200);
const groupsText = await page.textContent('#groups');
for (const t of ['Nur + Rashed', 'Siddiq + Shewa', 'Rifat + Sifat', 'Sajeeb + Toufiq', 'Sazedul Haque + Ofi'])
  assert.ok(groupsText.includes(t), 'missing team: ' + t);
/* Four boxes a match now — one per player, and the team score is their sum.
   The two matches this state carries were played before the boxes existed: a
   team score with no breakdown behind it, so those rows show no boxes at all. */
assert.equal((await page.$$('#groups .score')).length, 32, 'expected 8 open matches x 4 goal boxes, and none on the 2 already played');
assert.equal((await page.$$('#groups .score.fwd')).length, 16, 'each team needs a forward box and a defender box');
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

/* Per-player entry: a team score is nothing but its two players added up, and a
   half-filled team is not a result yet — the partner who scored nothing has to
   say so with a 0 rather than an empty box. */
const goalBoxes = () => page.$$('#groups .score');
const type = async (i, v) => {
  const inp = (await goalBoxes())[i];
  await inp.fill(String(v));
  await inp.dispatchEvent('change');
  await page.waitForTimeout(60);
};
const firstMatch = () => page.evaluate(() => {
  const m = groups[0].matches[0];
  return { sa: m.sa, sb: m.sb, pa: m.pa, pb: m.pb, a: teamName(m.a), winner: m.winner && teamName(m.winner) };
});
await type(0, 6);                                   // A forward
assert.deepEqual((await firstMatch()).sa, null, 'one player entered should not settle a team score');
await type(1, 4);                                   // A defender
await type(2, 3);                                   // B forward
assert.equal((await firstMatch()).winner, null, 'three boxes in is still not a match');
await type(3, 2);                                   // B defender
const scored = await firstMatch();
assert.equal(scored.sa, 10, 'the team score is not its two players added up');
assert.equal(scored.sb, 5, 'the team score is not its two players added up');
assert.deepEqual(scored.pa, { fwd: 6, def: 4 }, 'per-player goals were not kept');
assert.equal(scored.winner, scored.a, 'the higher total did not win');

const writes = await page.evaluate(() => window.writes);
assert.ok(writes.length > 0, 'admin edit did not write to the database');

// the write must survive a round-trip with its nulls intact — the reason
// state is stored as a JSON string rather than a nested RTDB object
const last = JSON.parse(writes[writes.length - 1]);
assert.deepEqual(last.groupScores[0][0], [10, 5, { fwd: 6, def: 4 }, { fwd: 3, def: 2 }],
  'the per-player breakdown did not reach the payload');
assert.deepEqual(last.groupScores[0][2], [null, null, null, null], 'unplayed match lost its nulls');
assert.equal(last.groupScores[0].length, 10, 'match list truncated');
assert.equal(last.teams.length, 5, 'teams lost in the payload');

// and it has to come back the same way it went out
const roundTrip = await page.evaluate(j => {
  window.applyState(JSON.parse(j));
  const m = groups[0].matches[0];
  return [m.sa, m.sb, m.pa, m.pb];
}, writes[writes.length - 1]);
assert.deepEqual(roundTrip, [10, 5, { fwd: 6, def: 4 }, { fwd: 3, def: 2 }],
  'the breakdown did not survive a round trip through applyState');
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

// Esc dismisses the top layer only — it used to fall straight through the
// celebration and shut the hall the replay was opened from
await page.click('.hall-row:nth-of-type(2)');
await page.keyboard.press('Escape');
assert.ok(!(await page.isVisible('#celebrate')), 'Esc did not close the celebration');
assert.ok(await page.isVisible('#hall'), 'Esc closed the hall underneath the celebration');
await page.keyboard.press('Escape');
assert.ok(!(await page.isVisible('#hall')), 'Esc no longer closes the hall on its own');

await page.click('#hallBtn');
await page.click('#hallClose');
assert.ok(!(await page.isVisible('#hall')), 'past champions did not close');

// deciding the final records the champion; clearing the score takes it back out.
// the final is scored like any other match now — there is no tap-to-win left.
const log = await page.evaluate(() => {
  const got = [];
  window.recordChampion = (id, c) => got.push(['set', id, c]);
  window.clearChampion = id => got.push(['clear', id]);
  window.setAdmin(true);
  window.markRemote();
  const nur = { fwd: 'Nur', def: 'Rashed' }, rifat = { fwd: 'Rifat', def: 'Sifat' };
  koStarted = true;
  koRounds = [[{ a: nur, b: rifat, sa: null, sb: null, pa: null, pb: null, winner: null }]];
  cupId = '1785700000001';
  renderAll();                                                    // unfinished final
  setKoGoals(0, 0, { fwd: 6, def: 4 }, { fwd: 3, def: 2 });        // decided
  setKoGoals(0, 0, { fwd: 6, def: 4 }, { fwd: 7, def: 4 });        // corrected
  setKoGoals(0, 0, { fwd: 5, def: 5 }, { fwd: 5, def: 5 });        // a draw is no result
  return got;
});
assert.deepEqual(log, [
  ['set', '1785700000001', 'Nur + Rashed'],
  ['set', '1785700000001', 'Rifat + Sifat'],
  ['clear', '1785700000001'],
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
// any single instant may hold nothing but a thin trail. The sky needs ~3s to
// fill — headless rAF is slow off the mark — so the window has to outlast the
// ramp or this flakes; a healthy run breaks out of the loop early anyway
let peak = 0;
for (let i = 0; i < 30 && peak < 40000; i++) {
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
/* rollupPlayers: foosball is 2v2, so both partners share the team result — but
   goals belong to whoever scored them, which is the whole point of `g` and the
   only thing that can tell two teammates apart. Both stages carry scores now.
   A forfeit has a result and no breakdown, so it adds a play and a win but no
   goal to anybody's name. */
const T = { nur: { fwd: 'Nur', def: 'Rashed' }, rifat: { fwd: 'Rifat', def: 'Sifat' },
            saj: { fwd: 'Sajeeb', def: 'Toufiq' } };
const goals = (fwd, def) => ({ fwd, def });
const roll = await page.evaluate(({ nur, rifat, saj }) => {
  groups = [{ name: 'A', teams: [nur, rifat, saj], matches: [
    { a: nur, b: rifat, sa: 10, sb: 7, pa: { fwd: 7, def: 3 }, pb: { fwd: 5, def: 2 }, winner: nur },
    { a: rifat, b: saj, sa: 8, sb: 9, pa: { fwd: 6, def: 2 }, pb: { fwd: 4, def: 5 }, winner: saj },
    { a: nur, b: saj, sa: null, sb: null, pa: null, pb: null, winner: null }, // unplayed — ignored
  ] }];
  // the final: nur turned up, saj didn't — a result nobody scored in
  koRounds = [[{ a: nur, b: saj, sa: 1, sb: 0, pa: null, pb: null, winner: nur }]];
  koStarted = true;
  return rollupPlayers();
}, T);
assert.deepEqual(roll['Nur'], { p: 2, w: 2, gf: 11, ga: 7, g: 7 }, 'winner not credited group goals + the KO forfeit');
assert.deepEqual(roll['Rashed'], { p: 2, w: 2, gf: 11, ga: 7, g: 3 },
  'partners share the team result but never each other’s goals');
assert.deepEqual(roll['Sajeeb'], { p: 2, w: 1, gf: 9, ga: 9, g: 4 }, 'KO loss should add a play, no goals');
assert.deepEqual(roll['Rifat'], { p: 2, w: 0, gf: 15, ga: 19, g: 11 }, 'loser goals wrong');

/* Golden Boot and Golden Ball, worked out from that rollup. Boot is raw
   individual goals; Ball is furthest round -> win % -> GD -> goals, and that
   last step is the only one that can separate two players on the same team. */
const aw = await page.evaluate(() => cupAwards(rollupPlayers(), koRounds[0][0].winner));
assert.deepEqual(aw.boot, ['Rifat'], 'Golden Boot is not the top individual scorer: ' + aw.boot);
assert.equal(aw.bootGoals, 11, 'Golden Boot goal count wrong');
// Nur and Rashed both won the cup on identical team numbers — only their own
// goals are left to tell them apart, and Nur scored more
assert.deepEqual(aw.ball, ['Nur'],
  'Golden Ball did not fall to the champion who outscored his own partner: ' + aw.ball);

// a dead-level pair shares both awards rather than being split arbitrarily
const tied = await page.evaluate(({ nur, rifat }) => {
  groups = [{ name: 'A', teams: [nur, rifat], matches: [
    { a: nur, b: rifat, sa: 10, sb: 6, pa: { fwd: 5, def: 5 }, pb: { fwd: 3, def: 3 }, winner: nur },
  ] }];
  koRounds = []; koStarted = false;
  return cupAwards(rollupPlayers(), nur);
}, T);
assert.deepEqual(tied.boot, ['Nur', 'Rashed'], 'a tie on goals must be a shared Golden Boot: ' + tied.boot);
assert.deepEqual(tied.ball, ['Nur', 'Rashed'], 'a tie the formula cannot break must be shared: ' + tied.ball);

// a cup with nothing but forfeits has no scorer at all, so no Boot to award
const dry = await page.evaluate(({ nur, rifat }) => {
  groups = [{ name: 'A', teams: [nur, rifat], matches: [
    { a: nur, b: rifat, sa: 1, sb: 0, pa: null, pb: null, winner: nur },
  ] }];
  return cupAwards(rollupPlayers(), nur);
}, T);
assert.deepEqual(dry.boot, [], 'a cup nobody scored in still handed out a Golden Boot');
assert.deepEqual(dry.ball, ['Nur', 'Rashed'], 'the Golden Ball should still resolve without goals');

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
assert.ok(widths.every(n => n === 9), 'every row (header included) must emit all 9 cells');

/* Golden Boots and Golden Balls are counted across cups exactly the way Cups
   is. Cups archived before the awards existed carry none, and must simply not
   contribute — the same graceful degradation the play counts already get. */
await page.evaluate(() => window.renderHall([
  { champion: 'Nur + Rashed', date: 1, players: { Nur: { p: 2, w: 2, gf: 9, ga: 4, g: 6 }, Rashed: { p: 2, w: 2, gf: 9, ga: 4, g: 3 } },
    awards: { boot: ['Nur'], bootGoals: 6, ball: ['Nur'] } },
  { champion: 'Rifat + Sifat', date: 2, players: { Rifat: { p: 2, w: 2, gf: 8, ga: 3, g: 4 }, Sifat: { p: 2, w: 2, gf: 8, ga: 3, g: 4 } },
    awards: { boot: ['Nur', 'Rifat'], bootGoals: 4, ball: ['Rifat', 'Sifat'] } },
  { champion: 'Ofi + Shewa', date: 3 }, // archived before any of this existed
]));
const awardCells = Object.fromEntries(await page.$$eval('.pl-row:not(.pl-head)', rs =>
  rs.map(r => [r.querySelector('.pl-name').textContent,
               [...r.querySelectorAll('.pl-award')].map(c => c.textContent)])));
assert.deepEqual(awardCells.Nur, ['2', '1'], 'a Boot shared with another cup’s winner did not count twice');
assert.deepEqual(awardCells.Rifat, ['1', '1'], 'a shared Boot and a shared Ball must each count for everyone tied');
assert.deepEqual(awardCells.Sifat, ['—', '1'], 'a Ball won without the Boot is not being counted on its own');
assert.deepEqual(awardCells.Ofi, ['—', '—'], 'an old cup with no awards is inventing them');
const heads = await page.$$eval('.pl-head .pl-award', cs => cs.map(c => c.textContent));
assert.deepEqual(heads, ['Boot', 'Ball'], 'the two award columns are not labelled');

await page.click('.hall-tab[data-tab="cups"]');
assert.ok(await page.isVisible('#hallList') && !(await page.isVisible('#hallPlayers')), 'cups tab did not restore');
await page.click('#hallClose');
// this block poked koRounds/groups directly — clear it so the next test starts fresh
await page.evaluate(() => { groups = []; koRounds = []; koStarted = false; lastChamp = null; });
console.log('player leaderboard OK');

await page.click('#rulesBtn');
assert.ok(await page.isVisible('#rules'), 'the rules link did not open anything');
const rules = (await page.textContent('#rules')).replace(/\s+/g, ' '); // source wraps mid-sentence
for (const t of ['no points system', 'no draws', 'one group', '1 v 8', 'every group match is settled',
                 '2 working days', 'forfeits 1-0', 'goes down as 0-0', 'Match Toss decides it'])
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

// only the unrecorded matches open up — 2 of the 10 already have scores, and
// a recorded match carries no boxes at all, so every box on screen is live
const sugDisabled = await Promise.all((await page.$$('#groups .score')).map(s => s.isDisabled()));
assert.deepEqual([sugDisabled.length, sugDisabled.filter(Boolean).length], [32, 0],
  'a suggester should reach every box of the 8 matches with no score yet, and no others');
assert.ok(await page.evaluate(() => document.body.classList.contains('view')), 'a suggester is not an admin');
// a forfeit is the admin ruling on a deadline, not a score anyone watched
assert.equal((await page.$$('#groups .ff')).length, 0, 'a suggester can forfeit a match');

// a suggestion carries the whole breakdown, so accepting it needs no second guess
const openInput = (await page.$$('#groups .score'))[0];
await openInput.fill('7');
await openInput.dispatchEvent('change');
await page.waitForTimeout(150);
assert.deepEqual(await page.evaluate(() => window.sugLog), [
  ['set', cup, '0_0', null, null, { fwd: 7, def: null }, null, 'Nur', 'nur@example.com'],
], 'the suggestion did not land in the suggestions node with its author and breakdown');
assert.deepEqual(await page.evaluate(() => window.writes), [], 'a suggestion wrote to the live cup');

// the suggester (still signed in) must see their score was sent, not just guess
await page.evaluate(c => window.renderSuggestions({ [c]: { '0_0':
  { sa: 7, sb: 3, pa: { fwd: 4, def: 3 }, pb: { fwd: 2, def: 1 }, by: 'Nur', email: 'nur@example.com' } } }), cup);
await page.waitForTimeout(150);
const mineText = (await page.textContent('.sug-bar.mine')).toLowerCase();
assert.ok(mineText.includes('sent') && mineText.includes('approv'), 'the suggester gets no confirmation their score was sent');
assert.equal((await page.$$('.sug-bar.mine .sug-btn')).length, 1, 'the suggester cannot withdraw their own suggestion');

// everyone else reads it off the bar; a viewer gets no controls
await page.evaluate(c => {
  window.setSignedIn(null);
  window.renderSuggestions({ [c]: { '0_0':
    { sa: 10, sb: 6, pa: { fwd: 6, def: 4 }, pb: { fwd: 4, def: 2 }, by: 'Nur', email: 'nur@example.com' } } });
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
assert.deepEqual(accepted.groupScores[0][0], [10, 6, { fwd: 6, def: 4 }, { fwd: 4, def: 2 }],
  'accepting wrote a team total without the breakdown behind it');
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

// ---------- one group at every size: 10 teams round-robin -> quarterfinals ----------
// startCup must never split the field; 10 teams means 45 fixtures in a single
// group and a top-8 bracket, with 8 rows highlighted as qualified
const big = await page.evaluate(() => {
  window.setAdmin(true);
  const T = 'ABCDEFGHIJ'.split('').map(x => ({ fwd: x, def: x.toLowerCase() }));
  teams = T;
  startCup();
  const played = new Set(groups[0].matches.map(m => [m.a.fwd, m.b.fwd].sort().join('')));
  // lower letter always wins, so the table ranks A>B>...>J
  groups[0].matches.forEach((m, mi) => setGroupScore(0, mi, m.a.fwd < m.b.fwd ? 2 : 1, m.a.fwd < m.b.fwd ? 1 : 2));
  const qualified = document.querySelectorAll('#groups tr.qualified').length;
  startKnockout();
  const pair = m => [m.a && m.a.fwd, m.b && m.b.fwd];
  return { groups: groups.length, fixtures: groups[0].matches.length, distinct: played.size,
           qualified, rounds: koRounds.length, qf: koRounds[0].map(pair),
           titles: [...document.querySelectorAll('.round-title')].map(e => e.textContent) };
});
assert.equal(big.groups, 1, '10 teams were split into more than one group');
assert.equal(big.fixtures, 45, 'a 10-team round robin is 45 matches, got ' + big.fixtures);
assert.equal(big.distinct, 45, 'every pair must meet exactly once — some fixture is duplicated or missing');
assert.equal(big.qualified, 8, 'the group table should highlight the top eight at 10 teams');
assert.equal(big.rounds, 3, '10 teams should play quarterfinals, semis and a final');
assert.deepEqual(big.qf, [['A', 'H'], ['D', 'E'], ['B', 'G'], ['C', 'F']],
  'quarterfinals must seed 1v8 / 4v5 / 2v7 / 3v6 so the top seeds meet as late as possible');
assert.deepEqual(big.titles, ['Quarterfinals', 'Semifinals', 'Grand Final'], 'bracket rounds are mislabelled');
// this block replaced the cup wholesale — put the 5-team snapshot back for what follows
await page.evaluate(h => { window.applyState(window.decodeState(h)); window.setAdmin(true); }, HASH);
await page.waitForTimeout(200);
console.log('10-team single group + quarterfinals OK');

// ---------- the knockout is scored, not tapped ----------
/* The bracket used to be decided by clicking a team. It is scored exactly like
   a group match now, which means the same four boxes, the same derived winner
   and the same no-draws rule — and a correction upstream has to take the
   matchups it fed with it, scores included. */
const koScore = await page.evaluate(() => {
  window.setAdmin(true); window.markRemote();
  const T = ['A', 'B', 'C', 'D', 'E'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  teams = T;
  const matches = [];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++)
    matches.push({ a: T[i], b: T[j], sa: 2, sb: 1, pa: { fwd: 1, def: 1 }, pb: { fwd: 1, def: 0 }, winner: T[i] });
  groups = [{ name: 'Group', teams: T.slice(), matches }];
  koRounds = []; koStarted = false; cupId = '1785700000002'; lastChamp = null;
  startKnockout();                                       // semis A v D, B v C
  const out = { boxes: document.querySelectorAll('#bracket .score').length,
                clickable: !!document.querySelector('#bracket .m-side').onclick };
  setKoGoals(0, 0, { fwd: 6, def: null }, { fwd: 3, def: 2 });
  out.half = koRounds[0][0].winner;                      // three boxes is not a result
  setKoGoals(0, 0, { fwd: 5, def: 5 }, { fwd: 4, def: 6 });
  out.draw = koRounds[0][0].winner;                      // 10-10 is not a result either
  out.drawNote = $('koNote').textContent;
  out.flagged = document.querySelectorAll('#bracket .score.bad').length;
  setKoGoals(0, 0, { fwd: 6, def: 4 }, { fwd: 3, def: 2 });   // A 10, D 5
  setKoGoals(0, 1, { fwd: 4, def: 3 }, { fwd: 5, def: 5 });   // B 7, C 10
  out.finalists = koRounds[1][0].a.fwd + koRounds[1][0].b.fwd;
  out.semiScore = [koRounds[0][0].sa, koRounds[0][0].sb];
  // a correction that leaves the same team through must not wipe the final
  setKoGoals(1, 0, { fwd: 6, def: 5 }, { fwd: 4, def: 4 });   // A win the cup
  setKoGoals(0, 0, { fwd: 7, def: 4 }, { fwd: 3, def: 2 });   // A still through
  out.keptFinal = koRounds[1][0].winner && koRounds[1][0].winner.fwd;
  // one that flips it has to take the final's teams AND its score with it
  setKoGoals(0, 0, { fwd: 1, def: 1 }, { fwd: 6, def: 4 });   // D through instead
  out.flipped = [koRounds[1][0].a.fwd, koRounds[1][0].sa, koRounds[1][0].pa, koRounds[1][0].winner];
  return out;
});
assert.equal(koScore.boxes, 8, 'the two semis should show four goal boxes each; the empty final none');
assert.ok(!koScore.clickable, 'the bracket still decides matches by clicking a team');
assert.equal(koScore.half, null, 'a half-entered knockout team counted as a result');
assert.equal(koScore.draw, null, 'equal totals decided a knockout tie — there are no draws');
assert.match(koScore.drawNote, /no draws/, 'a drawn knockout tie says nothing about why it was rejected');
assert.equal(koScore.flagged, 4, 'a drawn knockout tie does not flag its boxes');
assert.equal(koScore.finalists, 'AC', 'the higher totals did not reach the final: ' + koScore.finalists);
assert.deepEqual(koScore.semiScore, [10, 5], 'the knockout team score is not its two players added up');
assert.equal(koScore.keptFinal, 'A', 'correcting a semi wiped a final it still feeds the same team into');
assert.deepEqual(koScore.flipped, ['D', null, null, null],
  'flipping a semi left the final holding the old team’s score: ' + JSON.stringify(koScore.flipped));

// ---------- forfeits: a result with no goalscorer ----------
/* Forfeits are the one way to a result without attributing a goal to a real
   player, which is also why they are the one thing left out of the awards. The
   group can void a match nobody turned up for; the knockout cannot, because
   somebody has to go through. */
const ff = await page.evaluate(h => {
  const opts = sel => [...sel.options].map(o => o.value);
  // settled matches sink, so a forfeited row moves — find the picker by what it
  // is set to rather than by where it sits
  const picked = box => [...document.querySelectorAll(box + ' .ff')].map(s => s.value).filter(Boolean);
  const out = { ko: opts(document.querySelector('#bracket .ff')) };
  setKoScore(0, 0, 0, 1);                          // A no-show, D advance 1-0
  const m = koRounds[0][0];
  out.koForfeit = [m.sa, m.sb, m.pa, m.pb, m.winner.fwd, forfeitOf(m)];
  out.koPicked = picked('#bracket');

  window.applyState(window.decodeState(h));
  window.setAdmin(true);
  out.group = opts(document.querySelector('#groups .ff'));
  setGroupScore(0, 0, 1, 0);                       // b didn't turn up
  const g = groups[0].matches[0];
  out.groupForfeit = [g.sa, g.sb, g.pa, g.pb, g.winner === g.a, forfeitOf(g)];
  setGroupScore(0, 2, 0, 0);                       // nobody turned up
  out.void = [groups[0].matches[2].winner, settled(groups[0].matches[2]), picked('#groups').sort()];
  // a forfeit has no breakdown, so nobody's Golden Boot moves
  out.goals = Object.values(rollupPlayers()).reduce((n, s) => n + s.g, 0);
  // and typing real goals over one takes the match straight back to Played
  setGroupGoals(0, 0, { fwd: 5, def: 5 }, { fwd: 3, def: 4 });
  out.retyped = [groups[0].matches[0].sa, forfeitOf(groups[0].matches[0]), picked('#groups')];
  return out;
}, HASH);
assert.deepEqual(ff.ko, ['', 'a', 'b'], 'the knockout forfeit picker offers a void — somebody has to go through');
assert.deepEqual(ff.group, ['', 'a', 'b', 'void'], 'the group forfeit picker lost its double no-show option');
assert.deepEqual(ff.koForfeit, [0, 1, null, null, 'D', 'a'],
  'a knockout forfeit should be a bare 1-0 with nobody credited: ' + JSON.stringify(ff.koForfeit));
assert.deepEqual(ff.koPicked, ['a'], 'the knockout picker does not show the forfeit it recorded');
assert.deepEqual(ff.groupForfeit, [1, 0, null, null, true, 'b'],
  'a group forfeit should be a bare 1-0 with nobody credited: ' + JSON.stringify(ff.groupForfeit));
assert.deepEqual(ff.void, [null, true, ['b', 'void']], 'a group void is not settled, or the picker forgot it');
assert.equal(ff.goals, 0, 'a forfeited match handed somebody a goal they never scored');
assert.deepEqual(ff.retyped, [10, '', ['void']], 'entering real goals did not clear the forfeit');

// ---------- the Golden Boot and Golden Ball races run live ----------
// the group table is live for everyone, so both races are too
const race = await page.evaluate(h => {
  window.applyState(window.decodeState(h));
  window.setAdmin(true);
  // results are in but nobody is credited a goal yet: a Ball standing exists,
  // a scoring race does not
  const scoreless = [...document.querySelectorAll('.gb-race h4')].map(e => e.textContent);
  setGroupGoals(0, 0, { fwd: 9, def: 1 }, { fwd: 2, def: 3 });
  setGroupGoals(0, 2, { fwd: 4, def: 6 }, { fwd: 1, def: 1 });
  const board = i => {
    const b = document.querySelectorAll('.gb-race')[i];
    return { title: b.querySelector('h4').textContent,
             note: b.querySelector('.gb-note').textContent,
             names: [...b.querySelectorAll('.gb-name')].map(e => e.textContent),
             top: b.querySelector('.gb-row').textContent,
             lead: b.querySelectorAll('.gb-row.lead').length };
  };
  return { scoreless, boards: document.querySelectorAll('.gb-race').length,
           boot: board(0), ball: board(1),
           visible: $('golden').style.display !== 'none' };
}, HASH);
assert.deepEqual(race.scoreless, ['Golden Ball race'],
  'a cup with results but no scorers should show the Ball race alone: ' + race.scoreless);
assert.ok(race.visible, 'the board never appeared once results went in');
assert.equal(race.boards, 2, 'both races should be on the board, got ' + race.boards);
assert.ok(race.boot.title.includes('Boot') && race.ball.title.includes('Ball'),
  'the two races are mislabelled or out of order: ' + race.boot.title + ' / ' + race.ball.title);
assert.ok(race.boot.top.includes('9'), 'the leading scorer is not on top of the board: ' + race.boot.top);
assert.equal(race.boot.lead, 1, 'exactly one player leads the scoring race');
assert.ok(race.ball.top.includes('100%'), 'the Golden Ball race is not led by a winner: ' + race.ball.top);
// the note has to describe the ranking actually in use, and the round part of
// it is not in use until the knockouts
assert.ok(!race.ball.note.includes('round') && race.ball.note.includes('GD'),
  'the group-stage Ball note misdescribes the ranking: ' + race.ball.note);
assert.ok(race.boot.note.includes('goals'), 'the Boot note says nothing about goals: ' + race.boot.note);
// the tie-breaks the note promises have to be on the row, signed
assert.ok(/\+\d+ GD/.test(race.ball.top) && /\dg/.test(race.ball.top),
  'the Ball row hides the GD and goals it was ordered by: ' + race.ball.top);
assert.ok(race.ball.names.length <= 5 && race.boot.names.length <= 5,
  'the live boards should stay to the top few, got ' + race.boot.names.length + '/' + race.ball.names.length);

// ---------- awards on the celebration and the share card ----------
// the canvas is drawn by hand, so the overlay and the PNG have to be moved
// together — this is the check that they were
const AW = { boot: ['Nur', 'Rashed'], bootGoals: 9, ball: ['Sifat'] };
await page.evaluate(a => celebrate('Rifat + Sifat', { date: Date.UTC(2026, 6, 26), awards: a }), AW);
const shown = await page.textContent('#awards');
assert.ok(shown.includes('Golden Boot') && shown.includes('Nur & Rashed') && shown.includes('9 goals'),
  'the celebration does not name the shared Golden Boot: ' + shown);
assert.ok(shown.includes('Golden Ball') && shown.includes('Sifat'),
  'the celebration does not name the Golden Ball: ' + shown);
const cardInk = await page.evaluate(async a => {
  // the confetti is random, so pin it before comparing two cards' pixels
  const real = Math.random;
  Math.random = () => 0;
  const band = c => {
    const d = c.getContext('2d').getImageData(0, 930, 1200, 200).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i];
    return s;
  };
  const out = { with: band(await drawCard('Rifat + Sifat', 0, a)), without: band(await drawCard('Rifat + Sifat', 0, null)) };
  Math.random = real;
  return out;
}, AW);
assert.ok(cardInk.with > cardInk.without * 1.2,
  `the share card did not draw the awards (${cardInk.with} vs ${cardInk.without} ink in the awards band)`);
await page.evaluate(() => closeCelebration());

// a replayed cup that never had awards must not borrow the live cup's
await page.evaluate(() => celebrate('Nur + Rashed', { date: 1, awards: null }));
assert.equal(await page.textContent('#awards'), '', 'an old cup with no awards showed some anyway');
await page.evaluate(() => closeCelebration());

await page.evaluate(h => { window.applyState(window.decodeState(h)); window.setAdmin(true); }, HASH);
await page.waitForTimeout(200);
console.log('knockout scoring + forfeits + awards OK');

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
// the bar floats as a card, so it sits just clear of the bottom edge — but it
// must stay parked there, not drift up the screen with the content
assert.ok(bar.h - bar.b >= 0 && bar.h - bar.b <= 16,
  `the button bar is not parked at the bottom of the screen (${bar.h - bar.b}px above it)`);

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

// ---------- match toss ----------
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
assert.ok(toss.open, 'the match toss overlay did not open');
assert.ok(toss.a >= 2 && toss.b >= 1, 'the toss dropdowns were not filled from the roster');
assert.ok(!toss.dup, 'the toss let a team play itself');
/* The hand lands somewhere random and the winner is read off where it stopped, so
   one spin proves nothing: it would pass just as happily against the old version
   that only ever stopped at 9 and 3. Spin it a dozen times and check the whole
   contract — the named winner is the half the hand is actually in, the hand never
   rests within a clock mark of a divider where the side is arguable, and the
   landings are genuinely spread rather than a couple of fixed spots.
   The ticker runs for SPIN_MS, same as the draw wheels — shorten it as the draw
   test does rather than sit through twelve full spins. */
await page.evaluate(() => { SPIN_MS = 60; });
const spins = [];
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => { window.tossAngle = null; });
  await page.click('#tossFlip');
  await page.waitForFunction(() => window.tossAngle !== null, null, { timeout: 3000 });
  spins.push(await page.evaluate(() => ({
    angle: window.tossAngle,
    result: document.getElementById('tossResult').textContent,
    a: tossA.value, b: tossB.value,
  })));
}
await page.evaluate(() => { SPIN_MS = 4000; });
for (const s of spins) {
  const inBlueHalf = Math.cos(s.angle) < 0;   // left half of the dial is the blue team
  assert.ok(s.result.startsWith(inBlueHalf ? s.a : s.b),
    `the hand stopped in the ${inBlueHalf ? 'blue' : 'orange'} half but the toss said "${s.result}"`);
  assert.ok(Math.abs(Math.cos(s.angle)) >= Math.sin(Math.PI / 6) - 1e-9,
    `the hand rested less than a clock mark from the divider — which side is that?`);
}
assert.ok(new Set(spins.map(s => s.angle.toFixed(3))).size >= 8,
  `the ticker keeps stopping in the same places: ${new Set(spins.map(s => s.angle.toFixed(2))).size} distinct spots in 12 spins`);
// catches half the dial being unreachable, which the checks above cannot see — a
// fair toss trips this 1 run in 2048, and that is the price of catching it at all
assert.ok(spins.some(s => Math.cos(s.angle) < 0) && spins.some(s => Math.cos(s.angle) > 0),
  'twelve spins and the toss never picked one of the two sides');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), vw,
  'the match toss overlay scrolls the page sideways');
await page.click('#tossClose');
assert.ok(!(await page.evaluate(() => document.getElementById('toss').classList.contains('open'))),
  'the match toss overlay would not close');
console.log('match toss OK');

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

// ---------- fixture deadline: 2 working days, weekends skipped ----------
// The arithmetic is the part that can be quietly wrong all week, so it's checked
// against the calendar rather than against itself: Thu 2 Jul 2026 is due Mon 6th,
// and no start day anywhere in a fortnight may land the wall on a weekend.
const wd = await page.evaluate(() => {
  const day = ms => new Date(ms).getDate();
  const landed = [];
  for (let i = 0; i < 14; i++) {
    const start = new Date(2026, 6, 1 + i, 9).getTime();
    const end = workDaysFrom(start, 2);
    if (new Date(end).getDay() % 6 === 0) landed.push(new Date(end).toDateString());
    if (end <= start) landed.push('not in the future: ' + new Date(end).toDateString());
  }
  return { thu: day(workDaysFrom(new Date(2026, 6, 2, 9).getTime(), 2)),   // Thu -> Mon
           fri: day(workDaysFrom(new Date(2026, 6, 3, 9).getTime(), 2)),   // Fri -> Tue
           mon: day(workDaysFrom(new Date(2026, 6, 6, 9).getTime(), 2)),   // Mon -> Wed
           landed };
});
assert.deepEqual(wd.landed, [], 'deadline landed on a weekend: ' + wd.landed.join('; '));
assert.equal(wd.thu, 6, 'Thursday + 2 working days should be Monday the 6th, got the ' + wd.thu);
assert.equal(wd.fri, 7, 'Friday + 2 working days should be Tuesday the 7th, got the ' + wd.fri);
assert.equal(wd.mon, 8, 'Monday + 2 working days should be Wednesday the 8th, got the ' + wd.mon);

// a cup carrying a deadline shows a live countdown above the stage
await page.evaluate(h => {
  const s = window.decodeState(h);
  s.deadlineAt = Date.now() + (26 * 60 + 5) * 60000; // 1d 2h 5m out
  window.applyState(s);
}, HASH);
assert.ok(await page.isVisible('#deadline'), 'no deadline banner on a cup that has one');
assert.match(await page.textContent('.dl-label'), /Group matches due /, 'deadline banner has no due date');
assert.match(await page.textContent('.dl-clock'), /^1d 2h [45]m \d{1,2}s$/,
  'the clock is not counting down in labelled units: ' + await page.textContent('.dl-clock'));
// the cup in HASH has 8 of its 10 group matches unplayed
assert.match(await page.textContent('.dl-note'), /8 matches still to play/,
  'wrong outstanding-match count: ' + await page.textContent('.dl-note'));
// the penalty has to be legible BEFORE it lands, or the forfeit is an ambush
assert.match(await page.textContent('.dl-warn'), /It's a 1-0 to the team that turned up/,
  'no forfeit warning while there is still time: ' + await page.textContent('.dl-warn'));
assert.match(await page.textContent('.dl-warn'), /neither team turns up it goes down as 0-0/,
  'the double no-show rule is never stated: ' + await page.textContent('.dl-warn'));

// the leading zero units drop off as it runs down, so it never reads "0d 0h 9s"
assert.deepEqual(await page.evaluate(() => [90061000, 7509000, 309000, 9000].map(fmtLeft)),
  ['1d 1h 1m 1s', '2h 5m 9s', '5m 9s', '9s'], 'the clock keeps units that are already zero');

/* and the clock has to actually tick. Wait for the change rather than sleeping a
   fixed span: the interval's phase comes from page load, not from the moment the
   deadline was set, so the displayed second can legitimately stay put for nearly
   two ticks — a fixed 1.2s sleep here failed three runs in five. */
const t1 = await page.textContent('.dl-clock');
await page.waitForFunction(prev => document.querySelector('.dl-clock').textContent !== prev,
  t1, { timeout: 4000 }).catch(() => { throw new Error('the deadline clock is frozen at ' + t1); });

// past it, the banner turns and names the forfeit
await page.evaluate(h => {
  const s = window.decodeState(h);
  s.deadlineAt = Date.now() - 60000;
  window.applyState(s);
}, HASH);
assert.equal(await page.textContent('.dl-clock'), 'Time up', 'a passed deadline still shows a clock');
assert.match(await page.textContent('.dl-note'), /8 unplayed matches — each forfeits 1-0/,
  'a passed deadline never says what happens next: ' + await page.textContent('.dl-note'));
assert.ok(await page.evaluate(() => $('deadline').classList.contains('over')),
  'a passed deadline is not styled as passed');

// with every match played there is nothing to forfeit, and it must not claim there is
await page.evaluate(() => {
  groups.forEach(g => g.matches.forEach((m, mi) => setGroupScore(groups.indexOf(g), mi, 10, 5)));
  renderDeadline();
});
assert.match(await page.textContent('.dl-note'), /no forfeits/,
  'a fully played group still threatens forfeits: ' + await page.textContent('.dl-note'));
// nothing outstanding, so nothing to warn about
await page.evaluate(() => { deadlineAt = Date.now() + 3600e3; renderDeadline(); });
assert.equal(await page.locator('.dl-warn').count(), 0,
  'still warning about forfeits with every match played');

/* ---- a double no-show is settled, not outstanding ----
   The whole point of voiding: one match nobody turned up for must not hold the
   knockout shut forever. 0-0 is the marker because a real match can't end 0-0. */
const voided = await page.evaluate(h => {
  window.applyState(window.decodeState(h));            // fresh cup
  // every match played but one: the cup is one no-show away from frozen
  groups[0].matches.forEach((m, mi) => { if (mi !== 3) setGroupScore(0, mi, 10, 5); });
  const m = groups[0].matches[3], stat = t => ({ ...rank(groups[0]).stats.get(t) });
  const blocked = $('koBtn').style.display;
  const before = [stat(m.a), stat(m.b)];               // the match simply unplayed
  setGroupScore(0, 3, 0, 0);                           // neither team showed
  return {
    blocked, koBtn: $('koBtn').style.display, outstanding: unplayedCount(),
    before, after: [stat(m.a), stat(m.b)],
    tieNote: document.querySelector('#groups .tie-note')?.textContent ?? null,
  };
}, HASH);
assert.equal(voided.blocked, 'none', 'the knockout opened with a match still outstanding');
assert.notEqual(voided.koBtn, 'none', 'a voided match still blocks the knockout — the freeze is back');
assert.equal(voided.outstanding, 0, 'a voided match still counts as outstanding');
// a void has to leave the table exactly as if the match had never happened
assert.deepEqual(voided.after, voided.before,
  'a void moved the table: ' + JSON.stringify(voided.before) + ' -> ' + JSON.stringify(voided.after));
assert.equal(voided.tieNote, null, 'a 0-0 void trips the "no draws" warning');

/* ---- settled matches sink to the bottom ----
   Ten fixtures fill more than a phone screen. If a scored match keeps its slot
   you scroll past results to find what's still to play. */
const sunk = await page.evaluate(h => {
  window.applyState(window.decodeState(h));            // matches 1 and 7 arrive scored
  const key = m => teamName(m.a) + '|' + teamName(m.b);
  const dom = () => [...document.querySelectorAll('#groups .match')]
    .map(d => [...d.querySelectorAll('.m-team')].map(t => t.textContent).join('|'));
  const before = dom();
  setGroupScore(0, 4, 0, 0);                           // a no-show is settled too
  // the row just recorded holds its slot rather than jumping out from under you
  const heldAt = [before.indexOf(key(groups[0].matches[4])), dom().indexOf(key(groups[0].matches[4]))];
  heldRow = null; renderAll();                         // ...until the next render says otherwise
  const rows = [...document.querySelectorAll('#groups .match')];
  return {
    heldAt,
    dom: dom(),
    todo: groups[0].matches.filter(m => !settled(m)).map(key),
    done: groups[0].matches.filter(settled).map(key),
    divs: document.querySelectorAll('.played-div').length,
    // the void has no winner, so both sides must be greyed by hand
    greyed: rows.filter(d => d.querySelectorAll('.m-side.loser').length === 2).length,
  };
}, HASH);
assert.equal(sunk.todo.length, 7, 'wrong fixture seeded — this checks the mixed case');
assert.equal(sunk.heldAt[0], sunk.heldAt[1], 'the match just scored sank away under the cursor instead of holding its slot');
// one deepEqual covers both halves: the split AND fixture order surviving inside each
assert.deepEqual(sunk.dom, [...sunk.todo, ...sunk.done],
  'played matches did not sink below the unplayed ones, or fixture order was lost');
assert.equal(sunk.divs, 1, 'no single "Played" divider between the two blocks');
assert.equal(sunk.greyed, 1, 'the 0-0 void reads as unplayed while sitting in the played block');

// a genuine equal score is still an error, not a void
await page.evaluate(() => setGroupScore(0, 3, 5, 5));
assert.match(await page.textContent('#groups .tie-note'), /no draws/,
  'an equal score other than 0-0 is no longer flagged');
assert.equal(await page.evaluate(() => $('koBtn').style.display), 'none',
  '5-5 was treated as a settled match');

// applyState rebuilds the cup through startCup(), so the stored wall must survive
// every remote snapshot — otherwise the deadline walks two days further out each
// time anyone scores and never arrives
const fixed = await page.evaluate(h => {
  const s = window.decodeState(h);
  s.deadlineAt = Date.UTC(2026, 6, 6, 9);
  window.applyState(s);
  window.applyState(s);
  window.applyState(s);
  return deadlineAt;
}, HASH);
assert.equal(fixed, Date.UTC(2026, 6, 6, 9), 'a remote snapshot moved the deadline');

// and it has to reach the database, or only the admin's own tab knows the wall
await page.evaluate(() => { window.setAdmin(true); window.writes = []; gotRemote = true; renderAll(); });
assert.equal(JSON.parse((await page.evaluate(() => window.writes)).pop()).deadlineAt,
  Date.UTC(2026, 6, 6, 9), 'deadline missing from the saved payload');
await page.evaluate(() => window.setAdmin(false));

// the bar has to drain with the window, not just exist — half the window gone
// means half a bar, and it must survive a snapshot the same way the wall does
const dlBar = await page.evaluate(h => {
  const s = window.decodeState(h), now = Date.now();
  s.deadlineFrom = now - 36e5; s.deadlineAt = now + 36e5; // half of a 2h window left
  window.applyState(s); window.applyState(s);
  const half = document.querySelector('#deadline .dl-bar i').style.width;
  s.deadlineFrom = now - 36e5 * 7; s.deadlineAt = now + 36e5; // 1h of 8 left
  window.applyState(s);
  return { half, low: document.querySelector('#deadline .dl-bar').className, thin: document.querySelector('#deadline .dl-bar i').style.width };
}, HASH);
assert.equal(Math.round(parseFloat(dlBar.half)), 50, 'bar is not half full halfway through: ' + dlBar.half);
assert.ok(parseFloat(dlBar.thin) < 15, 'bar did not drain near the wall: ' + dlBar.thin);
assert.match(dlBar.low, /low/, 'bar stayed amber with an eighth of the window left');
console.log('fixture deadline OK');

// ---------- install button ----------
// Chromium here never fires beforeinstallprompt, which is exactly the iOS
// Safari / Firefox case: the button used to stay hidden and those phones got
// no install option at all. It must be offered anyway, with manual steps.
await page.evaluate(() => { closeCelebration(); }); // it covers the whole screen by now
await page.setViewportSize({ width: 375, height: 667 });
await page.waitForTimeout(100);
assert.ok(await page.isVisible('#installBtn'), 'no install button without beforeinstallprompt');
const ibox = await page.$eval('#installBtn', el => {
  const r = el.getBoundingClientRect();
  return { l: r.left, r: r.right, t: r.top, w: window.innerWidth, h: window.innerHeight };
});
assert.ok(ibox.l >= 0 && ibox.r <= ibox.w, 'the install button runs off the side of a phone screen');
assert.ok(ibox.t > ibox.h / 2, 'the install button is not in the bottom bar on mobile');

await page.click('#installBtn');
assert.ok(await page.isVisible('#installTip'), 'no manual steps shown when the browser has no prompt');
assert.ok(/Add to Home|Install app|Add to Home screen/.test(await page.$eval('#installSteps', e => e.innerText)),
  'the manual steps do not name the browser menu item');
const tbox = await page.$eval('#installTip', el => {
  const r = el.getBoundingClientRect();
  return { l: r.left, r: r.right, w: window.innerWidth };
});
assert.ok(tbox.l >= 0 && tbox.r <= tbox.w, 'the install steps overflow a phone screen');
await page.keyboard.press('Escape');
assert.ok(!(await page.isVisible('#installTip')), 'Esc does not close the install steps');

// a browser that does offer a prompt must replay it instead of showing steps
const native = await page.evaluate(async () => {
  const e = new Event('beforeinstallprompt');
  e.prompt = () => { window.__prompted = true; };
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
  document.getElementById('installBtn').click();
  await new Promise(r => setTimeout(r, 50));
  return { prompted: !!window.__prompted, tip: document.getElementById('installTip').classList.contains('open') };
});
assert.deepEqual(native, { prompted: true, tip: false }, 'the native install prompt was not used');
console.log('install button OK');

// ---------- notifications fire once per event, and only for the admin ----------
/* Every notify() call site is guarded, and the guards are the feature. A group
   score is typed four boxes at a time and every keystroke lands in
   setGroupScore, so announcing per call would buzz everyone four times a match;
   and the call sites run in each viewer's browser, so a missing admin check
   would mean one notification per person watching. window.notify is stubbed
   here — the real one writes to /notify for the relay to drain, which is not
   something an offline suite should reach. */
await page.evaluate(() => closeCelebration());
await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => {
  window.__notes = [];
  window.notify = (title, body, at, key, kind) => { window.__notes.push({ title, body, at, key, kind }); return Promise.resolve(); };
  window.cancelNotify = key => { window.__notes.push({ cancelled: key }); return Promise.resolve(); };
  window.saveToDb = () => {};
  const T = ['A', 'B', 'C', 'D'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  teams = T;
  groups = [{ name: 'Group A', teams: T.slice(), matches: [
    { a: T[0], b: T[1], sa: null, sb: null, pa: null, pb: null, winner: null },
    { a: T[2], b: T[3], sa: null, sb: null, pa: null, pb: null, winner: null },
  ] }];
  koRounds = []; koStarted = false; restoring = false; lastChamp = null;
  window.markRemote(); window.setAdmin(true);
  renderAll();
});
await page.waitForTimeout(150);
const notes = () => page.evaluate(() => window.__notes);

// the box that settles the match is the news, not the three before it
await type(0, 6); await type(1, 4); await type(2, 3);
assert.deepEqual(await notes(), [], 'a half-entered match already sent a notification');
await type(3, 2);
const firstNote = await notes();
assert.equal(firstNote.length, 1,
  'a match typed four boxes at a time sent ' + firstNote.length + ' notifications instead of one');
assert.equal(firstNote[0].title, 'Group match recorded', 'wrong title for a group result');
assert.equal(firstNote[0].body, 'A + a 10–5 B + b', 'the group notification does not name both teams and the score');
assert.equal(firstNote[0].key, undefined, 'a match result must queue, not overwrite a fixed key');
assert.equal(firstNote[0].kind, 'result', 'a group result is not tagged for the Match results switch');

// a correction that leaves the winner alone is not news; one that flips it is
await type(1, 5);
assert.equal((await notes()).length, 1, 'a correction that did not change the winner still notified');
await type(2, 20);
const flipped = await notes();
assert.equal(flipped.length, 2, 'a correction that changed the winner did not re-notify');
assert.equal(flipped[1].body, 'A + a 11–22 B + b', 'the re-notification does not carry the corrected score');

// the knockout names its round, and the final stays quiet because the champion covers it
const koNotes = await page.evaluate(() => {
  window.__notes = [];
  const T = ['A', 'B', 'C', 'D'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  const blank = (a, b) => ({ a, b, sa: null, sb: null, pa: null, pb: null, winner: null });
  teams = T;
  koRounds = [[blank(T[0], T[1]), blank(T[2], T[3])], [blank(null, null)]];
  koStarted = true; lastChamp = null; restoring = false;
  setKoScore(0, 0, 10, 5);
  const afterSemi = window.__notes.slice();
  setKoScore(0, 1, 10, 4);
  setKoScore(1, 0, 10, 7);
  return { afterSemi, titles: window.__notes.map(n => n.title) };
});
assert.equal(koNotes.afterSemi.length, 1, 'a decided semifinal sent no notification');
assert.equal(koNotes.afterSemi[0].title, 'Semifinals', 'the knockout notification is not titled by its round');
assert.ok(!koNotes.titles.includes('Grand Final'),
  'the final announced itself as a match — the champion notification already covers it');
assert.equal(koNotes.titles.filter(t => t === 'We have a champion').length, 1,
  'crowning the champion sent ' + koNotes.titles.filter(t => t === 'We have a champion').length
  + ' notifications, expected exactly one');

// opening the bracket
const koOpen = await page.evaluate(() => {
  window.__notes = [];
  const T = ['A', 'B', 'C', 'D'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  teams = T;
  const matches = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++)
    matches.push({ a: T[i], b: T[j], sa: 2, sb: 1, pa: null, pb: null, winner: T[i] });
  groups = [{ name: 'Group A', teams: T.slice(), matches }];
  koRounds = []; koStarted = false; lastChamp = null; restoring = false;
  startKnockout();
  return window.__notes.slice();
});
assert.equal(koOpen.length, 1, 'opening the knockout sent ' + koOpen.length + ' notifications, expected one');
assert.equal(koOpen[0].title, 'Knockout is live', 'wrong title when the bracket goes up');
assert.equal(koOpen[0].kind, 'milestone', 'the bracket going up is not tagged as a milestone');

/* The draft timer is two notifications from one control: the announcement now
   and the reminder when the countdown runs out. Both sit at fixed keys, so
   moving the draft replaces them rather than stacking a second reminder on the
   first, and clearing the date has to call the reminder off. */
const sched = await page.evaluate(() => {
  window.__notes = [];
  window.setAdmin(true);
  const el = document.getElementById('schedInput');
  el.value = '2031-03-04T17:30';
  el.dispatchEvent(new Event('change'));
  const set = window.__notes.slice();
  window.__notes = [];
  el.value = '';
  el.dispatchEvent(new Event('change'));
  return { set, cleared: window.__notes.slice(), expected: new Date('2031-03-04T17:30').getTime() };
});
assert.equal(sched.set.length, 2,
  'scheduling the draft should announce it and arm the reminder, got ' + sched.set.length);
assert.deepEqual(sched.set.map(n => n.key), ['drawSet', 'drawDue'],
  'the draft rows must sit at fixed keys, or rescheduling stacks a second reminder on the first');
assert.equal(sched.set[0].at, null, 'the announcement should go out at once, not be scheduled');
assert.equal(sched.set[1].at, sched.expected, 'the reminder is not armed for the scheduled instant');
assert.deepEqual(sched.cleared, [{ cancelled: 'drawDue' }], 'clearing the draft date left the reminder armed');
assert.deepEqual(sched.set.map(n => n.kind), ['draw', 'draw'],
  'the draft rows are not tagged for the Draw & draft times switch');

// a viewer, and an admin replaying a snapshot, both stay silent
const quiet = await page.evaluate(() => {
  window.__notes = [];
  const T = ['A', 'B', 'C', 'D'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  teams = T;
  const fresh = () => [{ name: 'Group A', teams: T.slice(), matches: [
    { a: T[0], b: T[1], sa: null, sb: null, pa: null, pb: null, winner: null } ] }];
  koRounds = []; koStarted = false; restoring = false;
  groups = fresh();
  window.setAdmin(false);
  setGroupScore(0, 0, 10, 5);           // every watcher runs this on the live update
  const viewer = window.__notes.slice();
  groups = fresh();
  window.setAdmin(true);
  restoring = true;
  setGroupScore(0, 0, 10, 5);           // the admin's own echo coming back from the database
  restoring = false;
  return { viewer, replay: window.__notes.slice() };
});
assert.deepEqual(quiet.viewer, [],
  'a viewer announced a live update — every phone would get one notification per person watching');
assert.deepEqual(quiet.replay, [],
  'replaying a snapshot re-announced a match that was already recorded');
console.log('notifications OK');

// ---------- the alerts drawer ----------
/* The switches are only real because the relay reads them: what this checks is
   that a tap ends up in the prefs the relay is handed (mirrored by
   savePushPrefs), and that they can't say "on" while the subscription is off.
   The push module itself needs Firebase messaging, which is blocked here, so
   window.pushOn and setPushOn are stubbed the way it sets them. */
const drawer = await page.evaluate(async () => {
  localStorage.removeItem('foosball-push-prefs');
  const saved = [];
  window.savePushPrefs = () => saved.push(window.alertPrefs());
  const boxes = () => [...document.querySelectorAll('#alerts [data-kind]')];
  const tap = box => { box.click(); };

  // subscription off: nothing may claim to be on, and nothing is tappable
  window.pushOn = false; paintAlerts();
  const off = { all: alertsAll.checked, on: boxes().filter(b => b.checked).length,
                live: boxes().filter(b => !b.disabled).length };

  window.pushOn = true; paintAlerts();
  const on = { all: alertsAll.checked, on: boxes().filter(b => b.checked).length };

  const result = boxes().find(b => b.dataset.kind === 'result');
  tap(result);
  const afterOff = { pref: window.alertPrefs().result, saved: saved.length,
                     stored: JSON.parse(localStorage.getItem('foosball-push-prefs')).result };
  tap(result);
  const afterOn = window.alertPrefs().result;

  // the master switch is select-all: off and back on restores every kind
  tap(result);
  window.setPushOn = want => { window.pushOn = want; };
  alertsAll.click(); // off
  const masterOff = { on: window.pushOn, pref: window.alertPrefs().result };
  alertsAll.click(); // on again
  await new Promise(r => setTimeout(r, 0)); // onchange awaits setPushOn
  const masterOn = { on: window.pushOn, kinds: window.alertPrefs() };

  /* Subscribing is a permission prompt and a token round-trip: the kinds must
     light up on the tap, not when the network gets back. Hold setPushOn open
     and look at the rows while it is still in flight. */
  alertsAll.click(); // off
  let release;
  window.setPushOn = want => new Promise(r => { release = () => { window.pushOn = want; r(); }; });
  alertsAll.click(); // on, and stuck mid-subscribe
  const midSubscribe = { on: boxes().filter(b => b.checked).length,
                         live: boxes().filter(b => !b.disabled).length };
  release();
  await new Promise(r => setTimeout(r, 0));

  // the suggestions row is the admin's
  window.setAdmin(false);
  const viewerSees = getComputedStyle(document.querySelector('.al-admin')).display;
  window.setAdmin(true);
  const adminSees = getComputedStyle(document.querySelector('.al-admin')).display;
  return { off, on, afterOff, afterOn, masterOff, masterOn, midSubscribe, viewerSees, adminSees };
});
assert.deepEqual(drawer.off, { all: false, on: 0, live: 0 },
  'with notifications off the drawer still showed kinds switched on, or let them be tapped');
assert.deepEqual(drawer.on, { all: true, on: 4 }, 'a fresh device does not start with every kind on');
assert.equal(drawer.afterOff.pref, false, 'switching a kind off did not stick');
assert.equal(drawer.afterOff.stored, false, 'the choice was not remembered on this device');
assert.equal(drawer.afterOff.saved, 1, 'the relay was never told the kind was switched off');
assert.equal(drawer.afterOn, true, 'switching a kind back on did not stick');
assert.deepEqual(drawer.masterOff, { on: false, pref: false },
  'the master switch did not drop the subscription');
assert.deepEqual(drawer.midSubscribe, { on: 4, live: 4 },
  'the kinds stayed dark while the subscription was still in flight');
assert.equal(drawer.masterOn.on, true, 'the master switch did not resubscribe');
assert.deepEqual(Object.values(drawer.masterOn.kinds), [true, true, true, true],
  'turning notifications back on left a kind silently switched off');
assert.equal(drawer.viewerSees, 'none', 'a viewer was offered the admin-only suggestions switch');
assert.notEqual(drawer.adminSees, 'none', 'the admin lost the suggestions switch');
console.log('alerts drawer OK');

// ---------- a cup from before individual goals ----------
/* Everything above runs on a cup started after the cutoff, so it is scored per
   player. A cup started before it is scored by team total instead: one box a
   side, no Golden Boot and no Golden Ball. The two modes have to be able to run
   off the same page — the running cup finishes on the old rules while the next
   one starts on the new. */
const teamMode = await page.evaluate(() => {
  window.setAdmin(true);
  window.markRemote();
  const T = ['A', 'B'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  teams = T;
  groups = [{ name: 'Group', teams: T.slice(), matches: [{ a: T[0], b: T[1], sa: null, sb: null, pa: null, pb: null, winner: null }] }];
  koRounds = []; koStarted = false; lastChamp = null;
  cupId = '1000000000000'; // long before the cutoff
  renderAll();
  const out = { boxes: document.querySelectorAll('#groups .score').length };
  const box = i => document.querySelectorAll('#groups .score')[i];
  const type = (i, v) => { box(i).value = v; box(i).onchange(); };
  type(0, 10);
  out.half = groups[0].matches[0].winner;              // one box in is not a result
  type(1, 7);
  const m = groups[0].matches[0];
  out.settled = [m.sa, m.sb, m.pa, m.pb, m.winner === T[0]];
  out.golden = getComputedStyle($('golden')).display;
  out.sub = $('tourneySub').textContent;
  // the rules have to describe the cup that's actually running
  $('rulesBtn').click();
  out.rules = { team: getComputedStyle(document.querySelector('#rules .team-only')).display,
                indiv: getComputedStyle(document.querySelector('#rules .indiv-only')).display };
  $('rulesClose').click();
  out.recorded = [];
  window.recordChampion = (id, c, P, aw) => out.recorded.push(aw);
  syncChampion(T[0]);                                  // nothing is awarded
  // and the next cup goes back to per-player boxes
  setGroupScore(0, 0, null, null, null, null);         // an unplayed match on a new cup
  cupId = String(Date.now());
  renderAll();
  out.nextCupBoxes = document.querySelectorAll('#groups .score').length;
  return out;
});
assert.equal(teamMode.boxes, 2, 'a team-total cup did not get exactly one score box a side');
assert.equal(teamMode.half, null, 'one team total settled the match on its own');
assert.deepEqual(teamMode.settled, [10, 7, null, null, true],
  'a team total was not recorded as the score, or invented a breakdown behind it');
assert.equal(teamMode.golden, 'none', 'the Golden Boot/Ball races showed on a cup that counts no individual goals');
assert.ok(!teamMode.sub.includes('player'), 'the admin is still told to enter each player’s goals: ' + teamMode.sub);
assert.equal(teamMode.rules.indiv, 'none', 'the rules still describe per-player boxes and a Golden Boot');
assert.notEqual(teamMode.rules.team, 'none', 'the rules never explain the team-total box that is actually on screen');
assert.deepEqual(teamMode.recorded, [null], 'a cup that counts no individual goals still handed out awards');
assert.equal(teamMode.nextCupBoxes, 4, 'the next cup did not get its per-player boxes back');
console.log('team-total cup OK');

assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
await b.close();
server.close();
console.log('ALL PASS');
