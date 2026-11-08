/* node og-duels.mjs — writes d/1.html … d/50.html and their preview images (d/N.jpg).
 *
 * A share link's #d/<id> never reaches Slack or WhatsApp (the hash stays in the
 * browser, and unfurlers don't run scripts), so every duel unfurled as the home
 * page. A duel is shared as d/<stake>.html?id=<id> instead: a static page whose
 * tags name the stake, which forwards a real visitor on to #d/<id>.
 *
 * Re-run after changing the design or DUEL.BET_MAX. Needs Google Chrome (macOS path below) and
 * macOS sips: a JPEG is about a tenth of Chrome's PNG.
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import './duel.js';

const SITE = 'https://sifat009.github.io/foosball/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const coins = n => `${n} coin${n === 1 ? '' : 's'}`;
const logo = resolve('icons/icon-512.png');

const card = n => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{position:relative;color:#fff;font-family:Inter,-apple-system,system-ui,sans-serif;
  background:radial-gradient(circle at 0 0,#1f3a66,#141c2e 60%,#16192a)}
.logo{position:absolute;left:68px;top:68px;width:112px;height:112px;border-radius:24px;background:#fff url("file://${logo}") center/cover}
.pill{position:absolute;left:216px;top:98px;border:2px solid #6b5a2a;background:#2e2b25;color:#f2b632;font-size:22px;letter-spacing:4px;font-weight:700;padding:12px 24px;border-radius:40px}
.big{position:absolute;left:66px;top:220px;font-size:150px;font-weight:900;line-height:1;letter-spacing:-3px;
  background:linear-gradient(90deg,#f6c23e,#e19a12);-webkit-background-clip:text;color:transparent}
.sub{position:absolute;left:68px;top:392px;font-size:50px;font-weight:800}
.bar{position:absolute;left:68px;bottom:118px;width:240px;height:8px;border-radius:4px;background:linear-gradient(90deg,#f6c23e,#c8601a)}
.foot{position:absolute;left:68px;bottom:56px;font-size:32px;color:#9fb0cc}
</style><div class="logo"></div><div class="pill">PENALTY DUEL</div>
<div class="big">${coins(n)}</div><div class="sub">on the line. Who's stepping up?</div>
<div class="bar"></div><div class="foot">${DUEL.KICKS} kicks each · winner takes ${n * 2}</div>`;

// The id only ever lands in the hash of this same site, so it can't redirect anywhere else.
const page = n => {
  const title = `Penalty duel: ${coins(n)} on the line`;
  const desc = `First to join takes the shots. Win the duel, take ${n * 2}. The Ollyo Foosball Cup.`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Ollyo Foosball Cup">
<meta property="og:url" content="${SITE}d/${n}.html">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${SITE}d/${n}.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<script>
const id = new URLSearchParams(location.search).get('id');
location.replace('../' + (id ? '#d/' + encodeURIComponent(id) : ''));
</script>
</head><body><a href="../">Open the Ollyo Foosball Cup</a></body></html>
`;
};

mkdirSync('d', { recursive: true });
const tmp = join(tmpdir(), 'og-duel.html'), shot = join(tmpdir(), 'og-duel.png');
for (let n = 1; n <= DUEL.BET_MAX; n++) {
  writeFileSync(`d/${n}.html`, page(n));
  writeFileSync(tmp, card(n));
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    `--screenshot=${shot}`, '--window-size=1200,630', 'file://' + tmp], { stdio: 'ignore' });
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', shot, '--out', `d/${n}.jpg`], { stdio: 'ignore' });
}
rmSync(tmp); rmSync(shot);
console.log(`wrote d/1 … d/${DUEL.BET_MAX}`);
