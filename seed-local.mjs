/* node seed-local.mjs [coins] — for trying things against the local emulators.
 *
 * Puts a "Test coins" card in the emulator's database, open today and for a
 * week, worth `coins` (200 unless given). Every account that signs in on
 * localhost sees it pop up and claims it once, which is a real claim row the
 * walk pays like any other.
 *
 * And five finished challenges among Rifat, Nur, Sajeeb and Siddiq, so those
 * four hold raid tickets (a ticket only comes from a real win): Rifat & Nur
 * win three, Sajeeb & Siddiq two. Only ever talks to 127.0.0.1:9000; the live
 * database is never touched. The emulator forgets everything when it stops,
 * so run this again after each start.
 */
const coins = +process.argv[2] || 200;
const NS = `${process.env.GCLOUD_PROJECT || 'ollyo-foosball'}-default-rtdb`;
const iso = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const card = { title: 'Test coins', text: `Local testing only: ${coins} coins to try the village with.`, coins, style: 'gold',
  from: iso(Date.now()), to: iso(Date.now() + 7 * 864e5) };
// `owner` is the emulator's admin bypass: it skips the rules, which cap a real card at 20
const res = await fetch(`http://127.0.0.1:9000/cards/${Date.now()}.json?ns=${NS}`,
  { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(card) }).catch(e => ({ ok: false, statusText: e.message }));
if (!res.ok) { console.error('Could not reach the database emulator on :9000. Start it first:\n  firebase emulators:start --only auth,database\n', res.statusText); process.exit(1); }
const P = { Rifat: 'rifathaque93@gmail.com', Nur: 'nuralam862@gmail.com', Sajeeb: 'sajeeb.ollyo@gmail.com', Siddiq: 'siddikcoder@gmail.com' };
const seat = (n, at) => ({ name: n, email: P[n], at });
for (let i = 0; i < 5; i++) {
  const at = Date.now() - (10 - i) * 6e4, blueWins = i < 3;
  const game = { by: P.Rifat, at, slots: { bf: seat('Rifat', at), bd: seat('Nur', at), rf: seat('Sajeeb', at), rd: seat('Siddiq', at) },
    score: { b: blueWins ? 1 : 0, r: blueWins ? 0 : 1, at: at + 3e4 } };
  await fetch(`http://127.0.0.1:9000/challenges/seed${i}.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(game) });
}
console.log(`Seeded a "Test coins" card worth ${coins}, and 5 games: Rifat & Nur hold 3 raid tickets, Sajeeb & Siddiq 2.`);
