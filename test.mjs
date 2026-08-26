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
// a labelled duration, not a clock: fmtLeft drops the units that are still zero,
// so three hours out reads "2h 59m 59s" and never "02:59:59"
assert.match(await page.textContent('#cdClock'), /^2h \d{1,2}m \d{1,2}s$/, 'the countdown is not ticking down from the three hours it was set');

// waiting viewers read the squad, not just the clock — names as typed, duplicates
// and all, so the count matches the wheel. Empty boxes leave no empty block behind.
await page.evaluate(t => window.applyState({
  screen: 'setup', draftStartAt: t, fwdText: 'Sifat\nSazedul\nSifat', defText: 'Ofi\nShewa\nOfi' }), future);
await page.waitForTimeout(50);
assert.equal(await page.textContent('.cd-col.fwd h4'), 'Forwards3', 'the forwards column lost its count');
assert.deepEqual(await page.$$eval('.cd-col.def li', ns => ns.map(n => n.textContent)),
  ['Ofi', 'Shewa', 'Ofi'], 'the defenders list should read as typed, duplicates kept');
await page.evaluate(t => window.applyState({ screen: 'setup', draftStartAt: t, fwdText: '', defText: '' }), future);
await page.waitForTimeout(50);
assert.ok(!(await page.isVisible('#cdRoster')), 'an empty roster still left a block on the countdown');

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
assert.match(await page.textContent('#schedNote'), /— 2h \d{1,2}m \d{1,2}s$/, 'the admin has no live countdown');
assert.ok(await page.evaluate(() => cdTimer), 'the countdown stopped ticking for the admin');
// the picker fills even when auth resolves after the snapshot landed
await page.evaluate(t => { window.setAdmin(false); document.getElementById('schedInput').value = '';
  window.applyState({ screen: 'setup', draftStartAt: t }); window.setAdmin(true); }, future);
await page.waitForTimeout(30);
assert.equal((await page.evaluate(() => document.getElementById('schedInput').value)).length, 16, 'late auth left the schedule picker empty');
// "Now" is the shortcut for scheduling this minute — it must fill the picker
// and take the same path a hand-picked date does, countdown and all
const now = await page.evaluate(() => {
  document.getElementById('schedInput').value = '';
  document.getElementById('schedNow').click();
  return { value: document.getElementById('schedInput').value, at: draftStartAt, ms: Date.now() };
});
assert.equal(now.value.length, 16, 'the Now button left the picker empty');
assert.ok(Math.abs(now.at - now.ms) < 60000, 'the Now button did not schedule the current minute');
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
// blur is the commit, the way a real entry ends — the board holds its repaint
// while a box has focus, so that a phone can hop from one box to the next
const type = async (i, v) => {
  const inp = (await goalBoxes())[i];
  await inp.fill(String(v));
  await inp.evaluate(e => e.blur());
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
assert.deepEqual(roll['Nur'], { p: 2, w: 2, gf: 11, ga: 7, g: 7, nil: 0 }, 'winner not credited group goals + the KO forfeit');
assert.deepEqual(roll['Rashed'], { p: 2, w: 2, gf: 11, ga: 7, g: 3, nil: 0 },
  'partners share the team result but never each other’s goals');
assert.deepEqual(roll['Sajeeb'], { p: 2, w: 1, gf: 9, ga: 9, g: 4, nil: 0 },
  'a forfeit adds a play and no goals — and it is not a nil, nobody kept them out');
assert.deepEqual(roll['Rifat'], { p: 2, w: 0, gf: 15, ga: 19, g: 11, nil: 0 }, 'loser goals wrong');

/* Golden Boot and Golden Glove, worked out from that rollup. Boot is raw
   individual goals; Glove is fewest conceded per match among the defence only,
   then more matches played. The defence pool is passed in, so these drive it
   directly — and cupAwards stays pure enough to hand a rollup straight in. */
const D = ['Rashed', 'Sifat', 'Toufiq'];  // the def half of each pair in T
const TD = { ...T, d: D };                // evaluate() takes one argument, so ride along
const aw = await page.evaluate(d => cupAwards(rollupPlayers(), new Set(d)), D);
assert.deepEqual(aw.boot, ['Rifat'], 'Golden Boot is not the top individual scorer: ' + aw.boot);
assert.equal(aw.bootGoals, 11, 'Golden Boot goal count wrong');
// everyone played twice: Rashed conceded 7, Toufiq 9, Sifat 19 — and Nur is
// level with Rashed but plays up front, so a Glove naming him means forwards leaked in
assert.deepEqual(aw.glove, ['Rashed'],
  'Golden Glove is not the defender who conceded fewest: ' + aw.glove);
assert.equal(aw.gloveRate, 3.5, 'Golden Glove conceded rate wrong');

// the Boot cannot separate two players on one team; the Glove is what does
const tied = await page.evaluate(({ nur, rifat, d }) => {
  groups = [{ name: 'A', teams: [nur, rifat], matches: [
    { a: nur, b: rifat, sa: 10, sb: 6, pa: { fwd: 5, def: 5 }, pb: { fwd: 3, def: 3 }, winner: nur },
  ] }];
  koRounds = []; koStarted = false;
  return cupAwards(rollupPlayers(), new Set(d));
}, TD);
assert.deepEqual(tied.boot, ['Nur', 'Rashed'], 'a tie on goals must be a shared Golden Boot: ' + tied.boot);
assert.deepEqual(tied.glove, ['Rashed'], 'the Glove should go to the defence that conceded 6, not 10: ' + tied.glove);

// three defences dead level on rate and on matches — shared, not split
const level = await page.evaluate(({ nur, rifat, saj, d }) => {
  groups = [{ name: 'A', teams: [nur, rifat, saj], matches: [
    { a: nur, b: rifat, sa: 10, sb: 8, pa: { fwd: 6, def: 4 }, pb: { fwd: 5, def: 3 }, winner: nur },
    { a: rifat, b: saj, sa: 10, sb: 8, pa: { fwd: 6, def: 4 }, pb: { fwd: 4, def: 4 }, winner: rifat },
    { a: nur, b: saj, sa: 8, sb: 10, pa: { fwd: 5, def: 3 }, pb: { fwd: 6, def: 4 }, winner: saj },
  ] }];
  return cupAwards(rollupPlayers(), new Set(d));
}, TD);
assert.deepEqual(level.glove, ['Rashed', 'Sifat', 'Toufiq'],
  'defences level on both counts must share the Glove: ' + level.glove);

/* The reason the Glove is a rate and not a total. Reaching the final means two
   or three knockouts on top of the group everyone plays, so a raw total charges
   the deepest run for the privilege: Toufiq's 28 would beat Rashed's 30 despite
   conceding two more a match. Handed in as a rollup rather than built out of
   fixtures, because a 6-match run needs a whole cup to reproduce. */
const evens = await page.evaluate(d => cupAwards({
  Rashed: { p: 6, w: 4, gf: 40, ga: 30, g: 0 },  // 5.0 a match, went to the final
  Sifat:  { p: 4, w: 1, gf: 20, ga: 20, g: 0 },  // 5.0 a match, out in the group
  Toufiq: { p: 4, w: 1, gf: 20, ga: 28, g: 0 },  // 7.0 a match, but the smallest total
}, new Set(d)), D);
assert.deepEqual(evens.glove, ['Rashed'],
  'going deep is costing the Glove — the fewest conceded per match should win: ' + evens.glove);
assert.equal(evens.gloveRate, 5, 'the archived rate is not the number the award was decided on');

// a cup with nothing but forfeits has no scorer at all, so no Boot to award —
// but the 1-0 is still a goal conceded, and it decides the Glove
const dry = await page.evaluate(({ nur, rifat, d }) => {
  groups = [{ name: 'A', teams: [nur, rifat], matches: [
    { a: nur, b: rifat, sa: 1, sb: 0, pa: null, pb: null, winner: nur },
  ] }];
  koRounds = []; koStarted = false;
  return cupAwards(rollupPlayers(), new Set(d));
}, TD);
assert.deepEqual(dry.boot, [], 'a cup nobody scored in still handed out a Golden Boot');
assert.deepEqual(dry.glove, ['Rashed'], 'the forfeit’s 1-0 did not count against the no-show’s Glove: ' + dry.glove);
assert.equal(dry.gloveRate, 0, 'the Glove winner kept a clean sheet, so the panel should read 0.0');

/* A match that finished 0 is invisible once the cup is added up, so the rollup
   has to count it while the matches are still there. A forfeit leaves the
   no-show on zero too, and that is not the same thing — nobody kept them out. */
const nils = await page.evaluate(() => {
  const a = { fwd: 'Nur', def: 'Rashed' }, b = { fwd: 'Sifat', def: 'Ofi' };
  groups = [{ name: 'A', teams: [a, b], matches: [
    { a, b, sa: 10, sb: 0, pa: { fwd: 6, def: 4 }, pb: { fwd: 0, def: 0 }, winner: a },
    { a: b, b: a, sa: 1, sb: 0, pa: null, pb: null, winner: b }, // forfeit: a no-show
  ] }];
  koRounds = []; koStarted = false;
  const P = rollupPlayers();
  return { sifat: P.Sifat.nil, ofi: P.Ofi.nil, nur: P.Nur.nil, rashed: P.Rashed.nil, gf: P.Sifat.gf };
});
assert.deepEqual(nils, { sifat: 1, ofi: 1, nur: 0, rashed: 0, gf: 1 },
  'a 10-0 is a nil for both losers and a forfeit is not: ' + JSON.stringify(nils));

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

/* Golden Boots and Golden Gloves are counted across cups exactly the way Cups
   is. Cups archived before the awards existed carry none, and cups won before
   the Glove replaced the Golden Ball carry a retired `ball` key — both must
   simply not contribute, the same graceful degradation the play counts get. */
await page.evaluate(() => window.renderHall([
  { champion: 'Nur + Rashed', date: 1, players: { Nur: { p: 2, w: 2, gf: 9, ga: 4, g: 6 }, Rashed: { p: 2, w: 2, gf: 9, ga: 4, g: 3 } },
    awards: { boot: ['Nur'], bootGoals: 6, glove: ['Rashed'], gloveRate: 2 } },
  { champion: 'Rifat + Sifat', date: 2, players: { Rifat: { p: 2, w: 2, gf: 8, ga: 3, g: 4 }, Sifat: { p: 2, w: 2, gf: 8, ga: 3, g: 4 } },
    awards: { boot: ['Nur', 'Rifat'], bootGoals: 4, glove: ['Rashed', 'Sifat'], gloveRate: 1.5 } },
  { champion: 'Ofi + Shewa', date: 3 }, // archived before any of this existed
  { champion: 'Siddiq + Shewa', date: 4, awards: { boot: [], bootGoals: 0, ball: ['Siddiq'] } }, // retired award
]));
const awardCells = Object.fromEntries(await page.$$eval('.pl-row:not(.pl-head)', rs =>
  rs.map(r => [r.querySelector('.pl-name').textContent,
               [...r.querySelectorAll('.pl-award')].map(c => c.textContent)])));
assert.deepEqual(awardCells.Nur, ['2', '—'], 'a Boot shared with another cup’s winner did not count twice');
assert.deepEqual(awardCells.Rashed, ['—', '2'], 'a shared Glove must count for everyone tied');
assert.deepEqual(awardCells.Rifat, ['1', '—'], 'a shared Boot must count for everyone tied');
assert.deepEqual(awardCells.Sifat, ['—', '1'], 'a Glove won without the Boot is not being counted on its own');
assert.deepEqual(awardCells.Ofi, ['—', '—'], 'an old cup with no awards is inventing them');
assert.deepEqual(awardCells.Siddiq, ['—', '—'], 'a retired Golden Ball is being counted as something');
const heads = await page.$$eval('.pl-head .pl-award', cs => cs.map(c => c.textContent));
assert.deepEqual(heads, ['Boot', 'Glove'], 'the two award columns are not labelled');

/* Player profile: opened off a board row, every number on it derived from the
   same archive the board reads. Four cups, so the win streak has something to
   break on: Nur wins the 1st, misses the 2nd, then takes the 3rd and 4th. */
await page.evaluate(() => window.renderHall([
  { champion: 'Nur + Rashed', date: 1, players: {
      Nur: { p: 6, w: 6, gf: 30, ga: 12, g: 14 }, Rashed: { p: 6, w: 6, gf: 30, ga: 12, g: 16 },
      Sifat: { p: 6, w: 3, gf: 24, ga: 20, g: 11 }, Ofi: { p: 6, w: 3, gf: 24, ga: 20, g: 13 },
      Rifat: { p: 4, w: 1, gf: 12, ga: 22, g: 5 }, Shewa: { p: 4, w: 1, gf: 12, ga: 22, g: 7 } },
    awards: { boot: ['Rashed'], bootGoals: 16, glove: ['Nur'], gloveRate: 2 } },
  { champion: 'Sifat + Ofi', date: 2 }, // archived before per-player stats existed
  { champion: 'Nur + Rashed', date: 3, players: {
      Nur: { p: 5, w: 5, gf: 26, ga: 9, g: 12 }, Rashed: { p: 5, w: 5, gf: 26, ga: 9, g: 14 },
      Sifat: { p: 5, w: 2, gf: 18, ga: 21, g: 9 }, Ofi: { p: 5, w: 2, gf: 18, ga: 21, g: 8 } },
    awards: { boot: ['Rashed'], bootGoals: 14, glove: ['Nur'], gloveRate: 1.8 } },
  { champion: 'Nur + Rashed', date: 4, players: {
      Nur: { p: 5, w: 4, gf: 22, ga: 14, g: 10, nil: 0 }, Rashed: { p: 5, w: 4, gf: 22, ga: 14, g: 11 },
      Sifat: { p: 5, w: 2, gf: 16, ga: 19, g: 7, nil: 2 }, Ofi: { p: 5, w: 2, gf: 16, ga: 19, g: 6 } },
    awards: { boot: ['Rashed'], bootGoals: 11, glove: ['Nur'], gloveRate: 2.8 } },
]));
// the row is the way in: clicking one is what a player actually does
await page.click('button.pl-row:has-text("Sifat")');
assert.ok(await page.isVisible('#profile'), 'tapping a board row did not open the profile');
assert.equal(await page.textContent('#prName'), 'Sifat', 'the profile opened on the wrong player');
/* Every badge is on the card; what differs is the half it lands in. Won ones
   are tiles keyed by the label as displayed, which is the tier's name once one
   is reached; the rest are rows that spell out what they take, because a phone
   has no hover to reveal a description with. */
const badges = () => page.$$eval('#prBadges .pr-badge', bs => Object.fromEntries(bs.map(b =>
  [b.querySelector('.pb-l').textContent, b.querySelector('.pb-n').textContent])));
const chase = () => page.$$eval('#prLocked .bd-row', rs => Object.fromEntries(rs.map(r =>
  [r.querySelector('b').textContent,
   [r.querySelector('.bd-v').textContent, r.querySelector('i').textContent]])));
let bg = await badges();
// one title from a cup carrying nothing but a champion string, three lost finals
// inferred from play counts — both have to survive the thin old entry
let ch = await chase();
assert.equal(Object.keys(bg).length + Object.keys(ch).length, 16,
  'every badge belongs on the card — the unearned ones are the chase list');
/* Two nils in one cup, and cups saved before it was counted contribute none.
   It sits in the cabinet because it happened, but it is not one of the fifteen
   the count is out of — a target nobody has is still a target, a nil is not. */
assert.equal(bg['Nil'], '×2', 'a nil from an archived cup is not reaching the badge: ' + JSON.stringify(bg));
assert.equal(await page.textContent('#prCount'), '5 of 15', 'an anti-badge must not count towards the total');
assert.equal(bg.Champion, '×1', 'a title from a champion-string-only cup did not earn the badge');
assert.equal(bg['Runner-up'], '×3', 'losing a final should earn Runner-up: ' + bg['Runner-up']);
// a milestone prints the progress to its next rung — that number is the chase
assert.equal(bg['Bronze Veteran'], '4 / 8', 'Veteran wrong: ' + JSON.stringify(bg));
assert.equal(bg['Bronze Ironman'], '16 / 30', 'Ironman counts matches from the cups that carry them');
assert.equal(bg['Bronze Goal Scorer'], '27 / 100', 'Goal Scorer counts career goals');
/* The unearned half carries its description on the page rather than behind a
   hover, which a phone does not have — that text is the whole point of it. */
assert.deepEqual(ch['Golden Boot'], ['—', 'Scored the most goals in a cup.'],
  'an unwon award must be listed with what it takes: ' + JSON.stringify(ch['Golden Boot']));
assert.deepEqual(ch['Perfect Cup'], ['—', 'Won every single match in a cup.'], 'an unearned badge belongs in the chase list');
assert.equal(ch.Double[0], '—', 'an unwon Double belongs in the chase list');
// one title, never two running: not earned, so it is something to chase — and
// it still carries how far along it is
assert.equal(ch['Win streak'][0], '1 / 2', 'a streak of one is still to win: ' + JSON.stringify(ch['Win streak']));
// one title, won alongside one person — the partner comes out of the champion string
assert.equal(ch.Partners[0], '1 / 2', 'Partners counts who you won with: ' + JSON.stringify(ch.Partners));
// 11 in a cup of six matches: under the first rung, and never 4 a match
assert.equal(ch['Big Haul'][0], '11 / 15', 'Big Haul is the best single cup, not the career: ' + JSON.stringify(ch['Big Haul']));
assert.equal(ch['Goal Machine'][0], '—', 'under 4 goals a match should not earn Goal Machine');
assert.equal(ch['Brick Wall'][0], '—', 'a defence letting in over 3 a match is not a Brick Wall');
assert.equal(ch['Clean Sweep'][0], '—', 'both awards in one cup is not being counted');
assert.ok(!('Champion' in ch) && !('Win streak' in bg), 'a badge is being rendered in both halves');

/* The won half is tiles, so its descriptions have nowhere to live but a line
   under the grid — a phone has no hover and cannot see a title attribute. The
   tiles must not move when it changes: that is what broke expanding in place. */
const tileTops = () => page.$$eval('#prBadges .pr-badge', bs => bs.map(b => b.offsetTop));
assert.equal(await page.textContent('#prCap'), 'Tap a badge to see what it means.',
  'the caption should invite the tap before anything is picked');
const before = await tileTops();
await page.click('#prBadges .pr-badge:has-text("Runner-up")');
assert.equal(await page.textContent('#prCap'), 'Runner-up — Played in a final and lost.',
  'tapping a tile did not put its description in the caption');
assert.deepEqual(await tileTops(), before, 'the tiles moved when the caption changed');
// the tier's name is what the tile shows, so it is what the caption must name
await page.click('#prBadges .pr-badge:has-text("Veteran")');
assert.equal(await page.textContent('#prCap'), 'Bronze Veteran — Number of cups played in.',
  'the caption is not following the tile that was tapped');
assert.equal(await page.$$eval('#prBadges .sel', xs => xs.length), 1, 'exactly one tile is ever marked');
// newest cup first, the same order the cup list uses
const runs = await page.$$eval('.pr-run', rs => rs.map(r =>
  [r.querySelector('.pl-best').textContent, r.querySelector('.pr-line').textContent]));
assert.equal(runs.length, 4, 'expected one row per cup entered');
assert.deepEqual(runs[3], ['Final', '3W–3L · 11 goals'], 'the oldest run is wrong: ' + JSON.stringify(runs[3]));
assert.deepEqual(runs[2], ['Won', '—'], 'a champion-only entry has no W–L to print');

await page.evaluate(() => window.openProfile('Nur'));
bg = await badges();
ch = await chase();
assert.equal(bg['Perfect Cup'], '×2', 'winning every match in a cup did not earn Perfect Cup');
assert.equal(bg['Golden Glove'], '×3', 'the Glove is not reaching the profile');
assert.equal(bg.Double, '×3', 'a cup and an award in the same cup is a Double');
assert.equal(ch['Golden Boot'][0], '—', 'the other winner’s Boot is being credited here');
assert.equal(ch['Runner-up'][0], '—', 'a player who never lost a final is being called a Runner-up');
/* One cup at 1.8 a match clears the wall; the other two, at 2.0 and 2.8, do
   not — the bar is under two, and exactly two is not under it. */
assert.equal(bg['Brick Wall'], '×1', 'Brick Wall is counting the wrong cups: ' + JSON.stringify(bg));
assert.equal(bg['Bronze Veteran'], '3 / 8', 'the milestones must keep counting past their first rung');
assert.equal(ch['Big Haul'][0], '14 / 15', 'Big Haul takes the best cup, not the total');
assert.equal(ch.Partners[0], '1 / 2', 'three titles with the same partner is still one partner');
assert.equal(await page.textContent('#prCount'), '9 of 15', 'the badge count is not following the player');
// never nilled, so it appears nowhere — least of all as something to go after
assert.ok(!('Nil' in bg), 'a player who was never nilled is wearing the badge');
assert.ok(!('Nil' in ch), 'getting beaten 10-0 must never be listed as something to win');
/* Three in a row on the calendar, but the cup he sat out is one he did not win,
   so the run is 1 + 2 rather than 3 — and the tier renames the badge. */
assert.equal(bg['Two in a Row'], '2 / 3', 'a skipped cup must break the streak: ' + JSON.stringify(bg));
assert.ok(!('Three in a Row' in bg) && !('Win streak' in ch), 'the streak badge is being rendered twice');

// Esc takes the top layer only — the Hall underneath was the way in
await page.keyboard.press('Escape');
assert.ok(!(await page.isVisible('#profile')), 'Escape did not close the profile');
assert.ok(await page.isVisible('#hall'), 'Escape closed the Hall out from under the profile');

// the guide lists every badge, including the ones no profile is showing
await page.click('.hall-tab[data-tab="badges"]');
assert.ok(await page.isVisible('#hallBadges'), 'badges tab did not open its pane');
assert.ok(!(await page.isVisible('#hallPlayers')) && !(await page.isVisible('#hallList')),
  'the badges tab left another pane open');
// scoped: the profile's chase list is built from the same row, and a closed
// overlay is still in the DOM
const guide = await page.$$eval('#hallBadges .bd-row', rs => rs.map(r =>
  [r.querySelector('b').textContent, [...r.querySelectorAll('.bd-tier')].map(c => c.textContent)]));
assert.equal(guide.length, 16, 'the guide must list every badge, earned or not');
assert.deepEqual(guide.find(([n]) => n === 'Nil')[1], ['Not one to chase'],
  'the guide must say which badge is not a target');
assert.ok(guide.some(([n]) => n === 'Golden Boot'), 'a badge nobody on screen has earned is missing from the guide');
assert.deepEqual(guide.find(([n]) => n === 'Win streak')[1],
  ['Two in a Row · 2', 'Three in a Row · 3', 'Five in a Row · 5', 'Eight in a Row · 8'],
  'the streak tiers are not spelled out');
assert.deepEqual(guide.find(([n]) => n === 'Veteran')[1],
  ['Bronze · 3', 'Silver · 8', 'Gold · 15', 'Platinum · 30'],
  'a generic milestone should chip its tiers as Bronze/Silver/Gold/Platinum');
assert.deepEqual(guide.find(([n]) => n === 'Champion')[1], [], 'a repeatable badge has no tiers to list');

await page.click('.hall-tab[data-tab="cups"]');
assert.ok(await page.isVisible('#hallList') && !(await page.isVisible('#hallPlayers')), 'cups tab did not restore');

/* The one moment a badge can change is a cup being archived, so that is the
   one moment worth announcing — and the celebration is already the thing every
   watcher is looking at. The list is the career worked out with and without
   the last entry, so it needs nothing stored. */
await page.click('.hall-row'); // newest first: the cup dated 4
const fresh = () => page.$$eval('#newBadges .nb-row', rs => rs.map(r =>
  [r.querySelector('.nb-n').textContent, r.querySelector('.nb-b').textContent]));
assert.deepEqual(await fresh(), [
  ['Nur', 'Two in a Row'],        // a third title, but only now two running
  ['Nur', 'Bronze Veteran'],      // his third cup — he sat the second one out
  ['Ofi', 'Bronze Goal Scorer'],  // 21 goals became 27, over the first rung
  ['Rashed', 'Two in a Row'],
  ['Rashed', 'Bronze Veteran'],
  ['Sifat', 'Bronze Goal Scorer'],
  ['Sifat', 'Nil'],          // an anti-badge is still news
], 'the cup is not reporting what it handed out');
// a repeat is not news: all three of these were already held before this cup
const labels = (await fresh()).map(r => r[1]);
assert.ok(!labels.includes('Champion') && !labels.includes('Golden Glove') && !labels.includes('Runner-up'),
  'winning something again is being announced as a new badge');
await page.keyboard.press('Escape');
assert.ok(await page.isVisible('#hall'), 'closing the celebration took the Hall with it');

// and the tile carries a NEW flag afterwards, for whoever missed the moment
await page.evaluate(() => window.openProfile('Nur'));
assert.deepEqual(await page.$$eval('#prBadges .pr-badge:has(.pb-new) .pb-l', ls => ls.map(l => l.textContent)),
  ['Two in a Row', 'Bronze Veteran'], 'the newest cup’s badges are not flagged on the profile');
await page.keyboard.press('Escape');

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
// blur, not a synthetic change: leaving the box is what commits it, and the
// board only repaints once the boxes are free
await openInput.evaluate(i => i.blur());
await page.waitForTimeout(150);
// the two teams ride along, so the relay can name them on the admin's phone
assert.deepEqual(await page.evaluate(() => window.sugLog), [
  ['set', cup, '0_0', null, null, { fwd: 7, def: null }, null, 'Nur', 'nur@example.com',
    { fwd: 'Siddiq', def: 'Shewa' }, { fwd: 'Sazedul Haque', def: 'Ofi' }],
], 'the suggestion did not land in the suggestions node with its author, breakdown and teams');
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
// the whole breakdown, not just the totals — the admin's own boxes stay empty
// until they accept, so the bar is the only place the numbers are readable
assert.ok(barText.includes('Nur suggests') && barText.includes('Siddiq 6 + Shewa 4 (10)') &&
  barText.includes('Sazedul Haque 4 + Ofi 2 (6)'), 'the bar hides who scored what: ' + barText);
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

// ---------- the Golden Boot and Golden Glove races run live ----------
// the group table is live for everyone, so both races are too
const race = await page.evaluate(h => {
  window.applyState(window.decodeState(h));
  window.setAdmin(true);
  // results are in but nobody is credited a goal yet: a Glove standing exists
  // off the team scores alone, a scoring race does not
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
  // what the board is supposed to be showing, worked out from the same rollup
  const P = rollupPlayers(), dn = defNames();
  const keeps = Object.keys(P).filter(n => dn.has(n) && P[n].p > 0);
  return { scoreless, boards: document.querySelectorAll('.gb-race').length,
           boot: board(0), glove: board(1), defence: [...dn],
           fewest: Math.min(...keeps.map(n => concededRate(P, n))).toFixed(1),
           visible: $('golden').style.display !== 'none' };
}, HASH);
assert.deepEqual(race.scoreless, ['Golden Glove race'],
  'a cup with results but no scorers should show the Glove race alone: ' + race.scoreless);
assert.ok(race.visible, 'the board never appeared once results went in');
assert.equal(race.boards, 2, 'both races should be on the board, got ' + race.boards);
assert.ok(race.boot.title.includes('Boot') && race.glove.title.includes('Glove'),
  'the two races are mislabelled or out of order: ' + race.boot.title + ' / ' + race.glove.title);
assert.ok(race.boot.top.includes('9'), 'the leading scorer is not on top of the board: ' + race.boot.top);
assert.equal(race.boot.lead, 1, 'exactly one player leads the scoring race');
// the Glove is the defence's award — a forward on this board means the filter leaked
assert.ok(race.glove.names.every(n => race.defence.includes(n)),
  'a forward turned up on the Golden Glove board: ' + race.glove.names);
assert.ok(race.glove.top.includes(race.fewest),
  `the Glove board is not led by the fewest conceded per match (${race.fewest}): ` + race.glove.top);
assert.ok(race.boot.note.includes('goals'), 'the Boot note says nothing about goals: ' + race.boot.note);
assert.ok(race.glove.note.includes('per match'),
  'the Glove note calls it a total rather than a rate: ' + race.glove.note);
// the rate is a ratio, so the row has to show both numbers behind it — the raw
// conceded and the matches played, which is also what breaks a tie on the rate
assert.ok(/\d+ in \d+ match/.test(race.glove.top),
  'the Glove row hides the conceded and matches its rate came from: ' + race.glove.top);
assert.ok(race.glove.names.length <= 5 && race.boot.names.length <= 5,
  'the live boards should stay to the top few, got ' + race.boot.names.length + '/' + race.glove.names.length);

// ---------- awards on the celebration and the share card ----------
// the canvas is drawn by hand, so the overlay and the PNG have to be moved
// together — this is the check that they were
const AW = { boot: ['Nur', 'Rashed'], bootGoals: 9, glove: ['Sifat'], gloveRate: 4 };
await page.evaluate(a => celebrate('Rifat + Sifat', { date: Date.UTC(2026, 6, 26), awards: a }), AW);
const shown = await page.textContent('#awards');
assert.ok(shown.includes('Golden Boot') && shown.includes('Nur & Rashed') && shown.includes('9 goals'),
  'the celebration does not name the shared Golden Boot: ' + shown);
// a flat 4 has to print as 4.0, or the panel reads as a goal count not a rate
assert.ok(shown.includes('Golden Glove') && shown.includes('Sifat') && shown.includes('4.0 per match'),
  'the celebration does not name the Golden Glove: ' + shown);
const cardInk = await page.evaluate(async a => {
  // the awards are the plaque column beside the card; without them the card is
  // drawn narrower and that whole strip is never painted at all
  const band = c => {
    const d = c.getContext('2d').getImageData(851, 47, 377, 1150).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * (d[i + 3] / 255);
    return s;
  };
  return { with: band(await drawCard('Rifat + Sifat', 0, a)), without: band(await drawCard('Rifat + Sifat', 0, null)) };
}, AW);
assert.ok(cardInk.with > cardInk.without * 1.2,
  `the share card did not draw the awards (${cardInk.with} vs ${cardInk.without} ink in the plaque column)`);
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
// anyone can open it, it tosses between the two sides of the table rather than any
// named team, and a spin always names one. It's ephemeral, so it must not scroll the
// page or touch cup state.
await page.evaluate(() => { window.setAdmin(false); show('tourney'); });
await page.click('#tossBtn');
await page.waitForTimeout(150);
assert.ok(await page.evaluate(() => document.getElementById('toss').classList.contains('open')),
  'the match toss overlay did not open');
/* The side labels flank the dial in one row, so on a phone they are the first thing
   to run out of room — and a label clipped to "ORANG" is the failure that looks
   like a rendering glitch rather than a layout bug. Each label must fit its track. */
const labelFit = await page.evaluate(() => ['tossSideA', 'tossSideB'].map(id => {
  const el = document.getElementById(id);
  return { id, want: Math.ceil(el.scrollWidth), got: Math.floor(el.parentElement.clientWidth) };
}));
for (const l of labelFit)
  assert.ok(l.want <= l.got, `${l.id} is clipped: needs ${l.want}px, has ${l.got}px`);
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
    lit: ['tossSideA', 'tossSideB'].map(id => document.getElementById(id).className),
  })));
}
await page.evaluate(() => { SPIN_MS = 4000; });
for (const s of spins) {
  const inBlueHalf = Math.cos(s.angle) < 0;   // left half of the dial is the blue side
  assert.ok(s.result.startsWith(inBlueHalf ? 'Blue' : 'Red'),
    `the hand stopped in the ${inBlueHalf ? 'blue' : 'red'} half but the toss said "${s.result}"`);
  // the label beside the winning half lights up, the other one steps back
  const [a, b] = s.lit, win = inBlueHalf ? a : b, lose = inBlueHalf ? b : a;
  assert.ok(win.includes('won') && lose.includes('lost') && !win.includes('lost'),
    `the hand stopped in the ${inBlueHalf ? 'blue' : 'red'} half but the labels read "${a}" / "${b}"`);
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
// invisible ones: the cup bitmap not decoding, toBlob handing back nothing,
// a filename built from an undefined champion. Google Fonts is blocked above,
// so this asserts the bytes and the plumbing — never the pixels.
await page.evaluate(() => celebrate('Sifat + Ofi', { date: Date.UTC(2026, 6, 26) }));
const card = await page.evaluate(async () => {
  const img = await ready($('champEmblem'));
  const c = await drawCard('Sifat + Ofi', Date.UTC(2026, 6, 26));
  const ctx = c.getContext('2d');
  // the bowl covers the card's centre line; unpainted background is near-black
  const [r, g] = ctx.getImageData(422, 300, 1, 1).data;
  return { w: c.width, h: c.height, art: img.naturalWidth, lit: r > 180 && g > 150 };
});
// no awards on this cup, so there is no plaque column and the card is the frame
assert.equal(card.w, 845, 'awardless share card is not 845 wide');
assert.equal(card.h, 1254, 'share card is not 1254 tall');
assert.ok(card.art > 0, 'the champion cup bitmap did not decode');
assert.ok(card.lit, 'no trophy on the share card — centre of the card is still background');

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

// ---------- typing a score box to box on a phone ----------
/* Entering a score used to mean tap a box, type, tap somewhere blank, tap the
   next box: the commit re-rendered the board and destroyed the box the finger
   was already landing on, so the tap never took and the keypad closed. The
   board now holds its repaint until the boxes are free, and each box commits
   all four numbers rather than the stale ones it was rendered with. */
await page.evaluate(() => {
  window.setAdmin(true);
  window.markRemote();
  const T = ['A', 'B', 'C', 'D'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  teams = T;
  const blank = (a, b) => ({ a, b, sa: null, sb: null, pa: null, pb: null, winner: null });
  groups = [{ name: 'Group', teams: T.slice(), matches: [blank(T[0], T[1]), blank(T[2], T[3])] }];
  koRounds = []; koStarted = false; lastChamp = null;
  cupId = String(Date.now()); // per-player boxes
  renderAll();
});
// an earlier section left a celebration up, and its confetti eats every tap
if (await page.isVisible('#celebrate')) await page.locator('#celebrate').dispatchEvent('click');
const goalRow = () => page.$$('#groups .match:first-of-type .score');
const first = (await goalRow())[0];
await first.click();
await first.type('5');
await (await goalRow())[1].click(); // straight to the next box, no tap in between
assert.equal(await page.evaluate(() => document.activeElement.className), 'score def',
  'tapping the next box did not focus it — the re-render ate the tap');
assert.equal(await (await goalRow())[0].inputValue(), '5', 'the first box lost what was typed into it');
await page.keyboard.type('3');
await page.keyboard.press('Enter'); // a keyboard with a next key walks the boxes
assert.equal(await page.evaluate(() =>
  document.querySelectorAll('#groups .match:first-of-type .score')[2] === document.activeElement),
  true, 'Enter did not move to the next box');
await page.keyboard.type('2');
await page.keyboard.press('Enter');
await page.keyboard.type('1');
await page.evaluate(() => document.activeElement.blur());
await page.waitForTimeout(60);
assert.deepEqual(await page.evaluate(() => {
  const m = groups[0].matches[0];
  return [m.sa, m.sb, m.pa, m.pb];
}), [8, 3, { fwd: 5, def: 3 }, { fwd: 2, def: 1 }],
  'four boxes typed one after another did not all reach the match');
assert.deepEqual(await page.$$eval('#groups .match:first-of-type .m-tot', e => e.map(x => x.textContent)),
  ['8', '3'], 'the totals never caught up once the boxes were free');
// coming back to a filled box replaces the number rather than appending to it
const filled = (await goalRow())[0];
await filled.click();
await page.keyboard.type('9');
assert.equal(await filled.inputValue(), '9', 'retyping a score appended to the old one');
console.log('score entry, box to box OK');


// ---------- the bar over the phone keypad ----------
/* A phone's numeric keypad has no next key — iOS shows nothing at all — so the
   boxes get their own prev/next/done above it. It must not exist on a desktop,
   where Tab already does the job. */
await page.evaluate(() => document.activeElement.blur());
assert.equal(await page.evaluate(() => getComputedStyle($('kbBar')).display), 'none',
  'the keypad bar is on screen with no box open');
await page.setViewportSize({ width: 375, height: 667 });
await page.evaluate(() => { show('tourney'); renderAll(); });
const kbRow = () => page.$$('#groups .match:first-of-type .score');
await (await kbRow())[1].click();
assert.equal(await page.evaluate(() => $('kbBar').classList.contains('on')), true,
  'no keypad bar on a phone-sized screen');
assert.equal(await page.evaluate(() => [$('kbWho').textContent, $('kbPrev').disabled, $('kbNext').disabled]).then(x => x.join('|')),
  'a — goals|false|false', 'the bar does not say which box is open, or misjudges the ends');
// the buttons walk the boxes without the keypad ever closing
await page.click('#kbNext');
assert.equal(await page.evaluate(() => document.activeElement.title), 'B — goals', 'Next did not move a box on');
await page.click('#kbPrev');
assert.equal(await page.evaluate(() => document.activeElement.title), 'a — goals', 'Prev did not move a box back');
await page.keyboard.type('4'); // focus selects the old number, so this replaces it
await page.click('#kbDone');
assert.equal(await page.evaluate(() => isScore(document.activeElement)), false, 'Done did not leave the boxes');
assert.equal(await page.evaluate(() => $('kbBar').classList.contains('on')), false, 'the bar stayed up after Done');
assert.equal(await page.evaluate(() => groups[0].matches[0].pa.def), 4, 'Done did not commit what was typed');
/* Stepping nudges the page by exactly what the bar covers. Centring the box
   instead lurched it hundreds of pixels a press — a fixed bar over a moving page
   is what the flicker was. */
await (await kbRow())[0].click();
await page.evaluate(() => { // put the open box down where the bar stands
  const r = document.activeElement.getBoundingClientRect();
  scrollBy(0, r.top - innerHeight + 70);
});
const scrolled = await page.evaluate(() => scrollY);
await page.click('#kbNext');
await page.waitForTimeout(120);
const step = await page.evaluate(() => {
  const box = document.activeElement.getBoundingClientRect(), bar = $('kbBar').getBoundingClientRect();
  return { moved: scrollY, gap: bar.top - box.bottom };
});
assert.ok(step.moved - scrolled < 120,
  'stepping lurched the page ' + Math.round(step.moved - scrolled) + 'px — the nudge should only clear the bar');
assert.ok(step.gap >= 0, 'the open box was left under the keypad bar');

// the first and last box have nowhere further to go
await (await kbRow())[0].click();
assert.equal(await page.evaluate(() => $('kbPrev').disabled), true, 'Prev is live on the first box');
await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => { document.activeElement.blur(); });
await (await kbRow())[0].click();
assert.equal(await page.evaluate(() => $('kbBar').classList.contains('on')), false,
  'the keypad bar showed on a desktop, where Tab already walks the boxes');
await page.evaluate(() => document.activeElement.blur());
console.log('keypad bar OK');

// ---------- the two legs share one card ----------
/* A double round-robin plays every pairing twice — once from each side of the
   table — which used to mean twice the fixtures in the list. The pair now rides
   in one card behind two tabs, named for the side the first team starts on. */
const legs = await page.evaluate(() => {
  window.setAdmin(true);
  window.markRemote();
  const T = ['A', 'B', 'C', 'D'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  teams = T; koRounds = []; koStarted = false; lastChamp = null; heldRow = null; legTab = {};
  cupId = String(Date.now());
  doubleRound = true;
  groups = [{ name: 'Group', teams: T.slice(), matches: roundRobin(T, true) }];
  renderAll();
  const out = { fixtures: groups[0].matches.length, cards: document.querySelectorAll('#groups .match').length };
  const card = () => document.querySelector('#groups .match');
  const tabs = () => [...card().querySelectorAll('.leg-tab')].map(b => b.textContent);
  out.tabs = tabs();
  // the card opens on the blue leg, and the boxes on it write that leg
  const teamsOn = () => [...card().querySelectorAll('.m-team')].map(t => t.textContent);
  out.blueTeams = teamsOn();
  card().querySelectorAll('.leg-tab')[1].click();      // red: same pair, ends changed
  out.redTeams = teamsOn();
  const box = i => card().querySelectorAll('.score')[i];
  const type = (i, v) => { box(i).value = v; box(i).onchange(); };
  [6, 4, 2, 1].forEach((v, i) => type(i, v));          // scores the leg on screen: 10-3
  out.redScored = [groups[0].matches[6].sa, groups[0].matches[0].sa];
  out.stillRed = card().querySelectorAll('.leg-tab')[1].classList.contains('on');
  return out;
});
assert.equal(legs.fixtures, 12, 'a four-team double round-robin is 12 fixtures');
assert.equal(legs.cards, 6, 'the two legs did not fold into one card each: ' + legs.cards + ' cards');
assert.deepEqual(legs.tabs, ['Blue', 'Red'], 'the pair card is missing its Blue/Red tabs');
assert.deepEqual(legs.redTeams, legs.blueTeams.slice().reverse(),
  'the Red tab did not show the same fixture with the teams at the other end');
assert.deepEqual(legs.redScored, [10, null],
  'the boxes on the Red tab wrote the wrong leg');
assert.ok(legs.stillRed, 'scoring the red leg flipped the card back to blue under the boxes');
console.log('blue & red leg tabs OK');

// ---------- the database echoing a score back mid-entry ----------
/* Firebase hands a local write straight back to its own listener, in the same
   tick as the commit, and applyState rebuilds the whole cup from it — passing
   through koStarted = false on the way. Laying the sections out at that moment
   hid the bracket and pulled the open goal box out of the page, and the repaint
   that would have put it back is held while a box has focus: the knockout
   vanished and stayed vanished. A half-typed breakdown has to survive the round
   trip too — team totals are still null until the partner's box is in. */
await page.evaluate(() => {
  document.activeElement.blur(); // the section above left a box open
  window.setAdmin(true);
  window.markRemote();
  const T = ['A', 'B', 'C', 'D', 'E'].map(x => ({ fwd: x, def: x.toLowerCase() }));
  const played = [10, 3, { fwd: 6, def: 4 }, { fwd: 3, def: 0 }];
  window.saveToDb = j => window.applyState(JSON.parse(j)); // the way the database answers
  window.applyState({
    screen: 'tourney', fwds: T.map(t => ({ name: t.fwd, picked: true })),
    defs: T.map(t => ({ name: t.def, picked: true })), teams: T, koStarted: true,
    cupId: String(Date.now()),
    groupScores: [Array.from({ length: 10 }, () => played.slice())],
    koScores: [[[null, null, null, null], [null, null, null, null]], [[null, null, null, null]]],
  });
});
await page.waitForTimeout(60);
const koBox = async i => (await page.$$('#bracket .score'))[i];
await (await koBox(0)).click();
await page.keyboard.type('8');
await page.keyboard.press('Enter'); // still in the boxes: the repaint is held
assert.ok(await page.isVisible('#bracket'), 'the bracket disappeared the moment a score was typed into it');
assert.equal(await page.evaluate(() => koStarted), true, 'the knockout unstarted itself');
assert.deepEqual(await page.evaluate(() => koRounds[0][0].pa), { fwd: 8, def: null },
  'one player in and the goals were lost on the round trip through the database');
await page.keyboard.type('2');
await page.evaluate(() => document.activeElement.blur());
await page.waitForTimeout(60);
assert.equal(await page.evaluate(() => koRounds[0][0].sa), 10, 'the two boxes never added up to a team score');
assert.ok(await page.isVisible('#bracket'), 'the bracket never came back');
await page.evaluate(() => { window.saveToDb = j => window.writes.push(j); });
console.log('database echo mid-entry OK');

// ---------- suggesting a knockout score ----------
/* The bracket makes the same offer the group stage does: whoever played the tie
   puts the score up and the admin accepts it. Keys carry the stage ('k0_1' is
   round 0, match 1) so a knockout tie and a group fixture can't land on each
   other, and a suggestion sent for a pairing the bracket has since changed is
   nobody's score. The cup from the section above is mid-knockout: the first
   semi is part-scored, the second is untouched. */
const koCup = await page.evaluate(() => {
  window.writes = []; window.sugLog = [];
  window.suggestScore = (...a) => window.sugLog.push(['set', ...a]);
  window.clearSuggestion = (...a) => window.sugLog.push(['clear', ...a]);
  window.setAdmin(false);
  window.setSignedIn({ name: 'Nur', email: 'nur@example.com' }); // signed in, not the admin
  return cupId;
});
await page.waitForTimeout(80);
const sugBoxes = () => page.$$('#bracket .score');
const liveBoxes = async () => (await Promise.all((await sugBoxes()).map(s => s.isDisabled()))).filter(d => !d).length;
assert.equal(await liveBoxes(), 4, 'a suggester should reach the four boxes of the tie with no score yet, and no others');
assert.equal((await page.$$('#bracket .ff')).length, 0, 'a suggester can forfeit a knockout tie');

const semiTwo = async () => (await sugBoxes())[4]; // first box of the untouched semi
await (await semiTwo()).fill('9');
await (await semiTwo()).evaluate(i => i.blur());
await page.waitForTimeout(120);
assert.deepEqual((await page.evaluate(() => window.sugLog)).map(x => x.slice(0, 3)), [['set', koCup, 'k0_1']],
  'the knockout suggestion did not land under its own key');
assert.deepEqual(await page.evaluate(() => window.writes), [], 'a suggestion wrote to the live cup');

const sugK = { sa: 10, sb: 6, pa: { fwd: 6, def: 4 }, pb: { fwd: 4, def: 2 }, by: 'Nur', email: 'nur@example.com' };
const teamsOf = await page.evaluate(() => [koRounds[0][1].a, koRounds[0][1].b]);
await page.evaluate(([c, s]) => window.renderSuggestions({ [c]: { k0_1: s } }), [koCup, sugK]);
await page.waitForTimeout(120);
assert.equal((await page.$$('#bracket .sug-bar')).length, 1, 'the pending knockout suggestion is not on the bracket');

// the admin accepts: it becomes the real result and sends a team through
await page.evaluate(() => { window.setAdmin(true); window.sugLog = []; window.writes = []; });
await page.waitForTimeout(120);
await page.click('#bracket .sug-ok');
await page.waitForTimeout(120);
assert.deepEqual(await page.evaluate(() => {
  const m = koRounds[0][1];
  return [m.sa, m.sb, m.pa, m.pb, m.winner === m.a, koRounds[1][0].b === m.a];
}), [10, 6, { fwd: 6, def: 4 }, { fwd: 4, def: 2 }, true, true],
  'accepting a knockout suggestion did not record the tie and carry the winner into the final');
assert.deepEqual(await page.evaluate(() => window.sugLog), [['clear', koCup, 'k0_1']],
  'the accepted knockout suggestion was not cleared');

// the bracket is redrawn from the group table, so a slot can change hands under
// a suggestion already in flight — that one is not a score for the new pairing
await page.evaluate(([c, s, t]) => {
  window.setAdmin(false);
  koRounds[0][1].sa = null; koRounds[0][1].sb = null; koRounds[0][1].pa = null; koRounds[0][1].pb = null;
  window.renderSuggestions({ [c]: { k0_1: { ...s, ta: t[1], tb: t[0] } } }); // the pairing it was sent for, swapped
}, [koCup, sugK, teamsOf]);
await page.waitForTimeout(120);
assert.equal((await page.$$('#bracket .sug-bar')).length, 0,
  'a suggestion for a pairing that is no longer in that slot was still offered');
// the Grand Final is a knockout tie like any other: once both semis are settled
// its boxes open to a suggester, under its own key
await page.evaluate(() => {
  window.setAdmin(true);
  setKoScore(0, 0, 10, 5); setKoScore(0, 1, 10, 4); // both semis decided — the final has two teams
  window.setAdmin(false); window.sugLog = []; window.writes = [];
});
await page.waitForTimeout(120);
const finalBox = async () => (await page.$$('#bracket .round'))[1].$$('.score');
assert.equal((await Promise.all((await finalBox()).map(i => i.isDisabled()))).filter(d => !d).length, 4,
  'the Grand Final did not open its boxes to a suggester the way the semis do');
const fb = (await finalBox())[0];
await fb.fill('9');
await fb.evaluate(i => i.blur());
await page.waitForTimeout(120);
assert.deepEqual((await page.evaluate(() => window.sugLog)).map(x => x.slice(0, 3)), [['set', koCup, 'k1_0']],
  'a suggestion for the Grand Final did not land under its own key');
assert.deepEqual(await page.evaluate(() => window.writes), [], 'a Grand Final suggestion wrote to the live cup');

console.log('knockout suggestions OK');

assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
await b.close();
server.close();
console.log('ALL PASS');
