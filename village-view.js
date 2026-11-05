/* The Village tab: your plot in 3D, the buildings on it, their sheets, the
   build list and edit mode. Loaded the first time the tab opens, so nobody
   who never opens it downloads three.js or a model. The rules (costs, levels,
   the Bank, where things fit) are village.js's; this file only draws them and
   turns taps into spend rows and layout saves through `api` (see index.html,
   openVillage). Models: Kenney (kenney.nl) and, for the town's buildings, KayKit's
   Medieval Hexagon Pack (kaylousberg.itch.io), both CC0, in models/. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

const V = globalThis.VILLAGE;
const G = 0.18; // the plot's top, above the field
const HALF = V.GRID / 2;
const NAMES = { ...Object.fromEntries(Object.entries(V.B).map(([k, b]) => [k, b.name])), ...Object.fromEntries(Object.entries(V.EARNED).map(([k, b]) => [k, b.name])) };
const ICON = {
  hammer: '<path d="M15 12l-8.5 8.5a2.1 2.1 0 01-3-3L12 9"/><path d="M17.6 15L22 10.6M20.9 11.7l-6.4-6.4a3.9 3.9 0 00-5.6 0L8 6.2"/>',
  move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  wall: '<path d="M3 21V9h4V6h4v3h2V6h4v3h4v12z"/><path d="M3 15h18M9 15v6M15 15v6M12 9v6"/>',
  sword: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6M16 16l4 4M19 21l2-2"/>',
  log: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
  town: '<path d="M3 21h18M5 21V10l4-3 4 3v11M13 21v-7h6v7M8 14h2M8 17h2"/>',
  ticket: '<path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dur = ms => {
  const m = Math.max(1, Math.ceil(ms / 6e4));
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`;
};
// a ticking countdown: 2h 14m, 4m 05s, 12s
const clock = ms => {
  const t = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
};
const coin = '<span class="vg-coin" aria-hidden="true"></span>';

const CSS = `
#village { position: fixed; inset: 0; z-index: 30; display: none; background: #5d9f35; overflow: hidden; overflow: clip; touch-action: none; user-select: none; -webkit-user-select: none; }
#village.open { display: block; }
#village canvas { display: block; width: 100%; height: 100%; }
#village .vg-hud, #village .vg-labels { position: absolute; inset: 0; pointer-events: none; font-family: 'Lilita One', system-ui, sans-serif; color: #fff; text-shadow: 0 2px 0 #1b1b1b, 0 0 2px #1b1b1b; letter-spacing: .01em; }
#village .vg-hud > * { pointer-events: auto; }
.vg-coin { display: inline-block; width: 1.15em; height: 1.15em; border-radius: 50%; vertical-align: -0.2em; background: radial-gradient(circle at 35% 35%, #fff6b0, #f5c22b 45%, #c48a0d); box-shadow: 0 0 0 2px #1b1b1b; }
.vg-top { position: absolute; top: calc(12px + env(safe-area-inset-top)); left: 12px; right: 12px; display: flex; gap: 8px; align-items: flex-start; }
.vg-pill { display: flex; align-items: center; gap: 7px; background: rgba(0,0,0,.5); border-radius: 14px; padding: 6px 12px 6px 8px; font-size: 18px; }
.vg-builder { font-size: 15px; flex: 1; min-width: 0; }
.vg-builder span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vg-builder svg, .vg-btn svg, .vg-tool svg { width: 20px; height: 20px; flex: none; }
.vg-x { width: 44px; height: 44px; border-radius: 14px; border: 3px solid #1b1b1b; background: linear-gradient(#ff7a6b, #c62d2d); color: #fff; display: grid; place-items: center; box-shadow: 0 3px 0 #1b1b1b; cursor: pointer; flex: none; }
.vg-x svg { width: 22px; height: 22px; stroke-width: 3; }
.vg-bottom { position: absolute; left: 12px; right: 12px; bottom: calc(18px + env(safe-area-inset-bottom)); display: flex; gap: 10px; justify-content: center; align-items: flex-end; }
.vg-btn { font: inherit; color: #fff; text-shadow: inherit; border: 3px solid #1b1b1b; border-radius: 16px; padding: 10px 16px; font-size: 19px; box-shadow: 0 4px 0 #1b1b1b, inset 0 2px 0 rgba(255,255,255,.45); cursor: pointer; display: flex; gap: 8px; align-items: center; justify-content: center; min-height: 52px; }
.vg-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 #1b1b1b; }
/* four across a phone: they share the width rather than run off it */
.vg-bottom .vg-btn { flex: 1 1 0; min-width: 0; padding: 10px 6px; font-size: 17px; gap: 5px; white-space: nowrap; }
.vg-bottom .vg-btn svg { width: 18px; height: 18px; }
@media (min-width: 520px) { .vg-bottom .vg-btn { flex: 0 1 auto; padding: 10px 16px; font-size: 19px; } }
.vg-btn[disabled] { filter: grayscale(.85) brightness(.85); cursor: default; }
.vg-green { background: linear-gradient(#8ee35a, #3ea21f); }
.vg-gold { background: linear-gradient(#ffd75a, #e09a10); }
.vg-blue { background: linear-gradient(#62b6ff, #2a6fd6); }
.vg-grey { background: linear-gradient(#b8bec9, #7c8494); }
.vg-lab { position: absolute; transform: translate(-50%, -100%); text-align: center; white-space: nowrap; font-size: 14px; line-height: 1.05; }
.vg-lab small { display: block; font-size: 11.5px; color: #ffe27a; }
.vg-bub { position: absolute; transform: translate(-50%, -100%); background: #fff; color: #2a1d14; text-shadow: none; border: 2.5px solid #2a1d14; border-radius: 12px; padding: 3px 10px 3px 6px; font-size: 17px; display: flex; gap: 6px; align-items: center; }
.vg-bub.vg-timer { flex-direction: column; gap: 4px; padding: 4px 10px 6px; font-size: 16px; }
.vg-timer span { display: flex; gap: 5px; align-items: center; }
.vg-timer svg { width: 15px; height: 15px; }
.vg-timer i { display: block; width: 92px; height: 8px; border-radius: 4px; background: #e6dccb; border: 1.5px solid #2a1d14; overflow: hidden; }
.vg-timer b { display: block; height: 100%; background: #f5c400; }
.vg-bub.full { background: #ffe1dc; border-color: #b3261e; color: #b3261e; }
.vg-bub:after { content: ''; position: absolute; left: 50%; bottom: -9px; margin-left: -7px; border: 7px solid transparent; border-top-color: #2a1d14; border-bottom: 0; }
.vg-sheet { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100% - 32px)); background: #fffaf0; color: #2a1d14; text-shadow: none; border: 3px solid #1b1b1b; border-radius: 22px; padding: 18px; max-height: min(80%, 640px); overflow: auto; box-shadow: 0 6px 0 #1b1b1b, 0 0 0 100vmax rgba(10,16,28,.45); animation: vg-pop .2s cubic-bezier(.34, 1.56, .64, 1); font-family: system-ui, -apple-system, sans-serif; }
@keyframes vg-pop { from { transform: translate(-50%, -50%) scale(.85); opacity: 0; } }
@keyframes vg-up { from { transform: translateY(30px); opacity: 0; } }
.vg-sheet h3 { font: 22px 'Lilita One', system-ui; margin: 0 34px 2px 0; color: #2a1d14; }
.vg-sheet .vg-sub { color: #6b5a44; font-size: 14px; margin: 0 0 14px; line-height: 1.4; }
.vg-sheet .vg-x { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; border-width: 2.5px; }
.vg-row { display: flex; gap: 12px; align-items: center; border: 2px solid #ead9b8; background: #fff; border-radius: 14px; padding: 12px; margin-bottom: 10px; }
.vg-row b { display: block; font-size: 15px; }
.vg-row .vg-txt { flex: 1; min-width: 0; font-size: 13.5px; color: #6b5a44; line-height: 1.4; }
.vg-row .vg-btn { font-size: 16px; min-height: 44px; padding: 8px 14px; flex: none; }
.vg-why { color: #b3261e; font-size: 13px; font-weight: 600; margin-top: 3px; }
.vg-bar { height: 10px; border-radius: 6px; background: #ead9b8; overflow: hidden; margin-top: 6px; }
.vg-bar i { display: block; height: 100%; background: linear-gradient(#ffd75a, #e09a10); }
.vg-edit { position: absolute; top: calc(12px + env(safe-area-inset-top)); left: 12px; right: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: rgba(0,0,0,.55); border-radius: 16px; padding: 8px; }
.vg-edit .vg-n { flex: 1; min-width: 120px; font-size: 15px; padding-left: 4px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.vg-edit .vg-pill { font-size: 15px; padding: 4px 10px 4px 6px; }
.vg-flash { animation: vg-flash .9s ease; border-radius: 8px; }
@keyframes vg-flash { 0%, 60% { background: #ffd75a; color: #2a1d14; text-shadow: none; } }
.vg-edit .vg-btn { font-size: 15px; min-height: 42px; padding: 6px 12px; }
.vg-tool.on { outline: 3px solid #fff; outline-offset: 1px; }
.vg-hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(96px + env(safe-area-inset-bottom)); background: rgba(0,0,0,.6); border-radius: 12px; padding: 7px 12px; font-size: 14px; white-space: nowrap; }
.vg-toast { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); background: rgba(0,0,0,.75); border-radius: 14px; padding: 10px 16px; font-size: 17px; animation: vg-up .2s ease; pointer-events: none; }
#village .vg-hud > .vg-tour { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
.vg-spot { position: absolute; border-radius: 16px; box-shadow: 0 0 0 3px #ffd75a, 0 0 0 100vmax rgba(10,16,28,.55); transition: all .25s ease; pointer-events: none; animation: vg-pulse 1.6s ease-in-out infinite; }
@keyframes vg-pulse { 50% { box-shadow: 0 0 0 7px #ffd75a, 0 0 0 100vmax rgba(10,16,28,.55); } }
.vg-dim { position: absolute; inset: 0; background: rgba(10,16,28,.55); }
.vg-tb { position: absolute; pointer-events: auto; background: #fffaf0; color: #2a1d14; text-shadow: none; border: 3px solid #1b1b1b; border-radius: 16px; padding: 14px 14px 12px; box-shadow: 0 5px 0 #1b1b1b; font-family: system-ui, -apple-system, sans-serif; font-size: 15px; line-height: 1.45; animation: vg-pop .2s ease-out; }
.vg-tb b.vg-th { display: block; font: 19px 'Lilita One', system-ui; margin-bottom: 4px; }
.vg-tb .vg-tf { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
.vg-tb .vg-tf .vg-btn { font-size: 16px; min-height: 40px; padding: 6px 16px; margin-left: auto; }
.vg-tb .vg-skip { background: none; border: 0; padding: 6px 0; font: inherit; font-size: 13px; color: #8a7558; text-decoration: underline; cursor: pointer; }
.vg-tb .vg-tn { font-size: 12px; color: #8a7558; }
.vg-help { width: 44px; height: 44px; border-radius: 14px; border: 3px solid #1b1b1b; background: linear-gradient(#62b6ff, #2a6fd6); color: #fff; font: 22px 'Lilita One', system-ui; text-shadow: inherit; box-shadow: 0 3px 0 #1b1b1b; cursor: pointer; flex: none; margin-left: auto; }
.vg-top2 button.vg-pill { font: inherit; color: inherit; text-shadow: inherit; border: 0; cursor: pointer; }
.vg-load { position: absolute; inset: 0; display: grid; place-items: center; font-size: 20px; }
.vg-list { position: absolute; inset: 70px 0 0; overflow: auto; padding: 0 14px 30px; }
.vg-top2 { position: absolute; top: calc(66px + env(safe-area-inset-top)); left: 12px; right: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.vg-top2 .vg-pill { font-size: 14px; padding: 4px 10px 4px 7px; }
.vg-top2 svg { width: 17px; height: 17px; }
.vg-top2 .vg-log { margin-left: auto; font: inherit; color: inherit; text-shadow: inherit; border: 0; cursor: pointer; }
.vg-red { background: linear-gradient(#ff7a6b, #c62d2d); }
.vg-dots2 { font-size: 9px; letter-spacing: 0; margin-left: 1px; color: #ffe27a; }
.vg-raidtop { position: absolute; top: calc(12px + env(safe-area-inset-top)); left: 12px; right: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.vg-raidtop .vg-big { font-size: 26px; min-width: 56px; text-align: center; }
.vg-stars { font-size: 22px; letter-spacing: 2px; color: #ffd75a; }
.vg-stars i { font-style: normal; color: rgba(255,255,255,.35); }
.vg-cards { position: absolute; left: 12px; right: 12px; bottom: calc(18px + env(safe-area-inset-bottom)); display: flex; gap: 10px; justify-content: center; align-items: flex-end; flex-wrap: wrap; }
.vg-card { font: inherit; color: #fff; text-shadow: inherit; width: 92px; padding: 8px 6px; border: 3px solid #1b1b1b; border-radius: 14px; background: linear-gradient(#5a6577, #353d4b); box-shadow: 0 4px 0 #1b1b1b; cursor: pointer; text-align: center; font-size: 15px; }
.vg-card b { display: block; font-size: 24px; font-weight: normal; }
.vg-card.on { background: linear-gradient(#ffd75a, #e09a10); transform: translateY(-4px); }
.vg-card[disabled] { opacity: .45; cursor: default; }
.vg-hp { position: absolute; transform: translate(-50%, -100%); width: 30px; height: 5px; background: rgba(0,0,0,.55); border-radius: 3px; overflow: hidden; }
.vg-hp i { display: block; height: 100%; background: #6be04a; }
.vg-hp.foe i { background: #ff5a4a; }
.vg-hp.big { width: 46px; height: 6px; }
.vg-res { text-align: center; }
.vg-res .vg-stars { font-size: 40px; color: #e09a10; }
.vg-res .vg-stars i { color: #ead9b8; }
.vg-pl { display: flex; gap: 10px; align-items: center; }
.vg-coins { font: inherit; font-size: 18px; color: inherit; text-shadow: inherit; border: 0; cursor: pointer; }
.vg-bell { margin-left: 0; display: grid; place-items: center; position: relative; }
.vg-top .vg-builder + .vg-bell { margin-left: auto; }
.vg-bell svg { width: 22px; height: 22px; }
.vg-bell.dot:after { content: ''; position: absolute; top: 4px; right: 4px; width: 10px; height: 10px; border-radius: 50%; background: #ff5a4a; border: 2px solid #1b1b1b; }
.vg-live i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #ff5a4a; box-shadow: 0 0 0 3px rgba(255,90,74,.35); animation: vg-pulse2 1.2s infinite; }
@keyframes vg-pulse2 { 50% { opacity: .35; } }
.vg-golink { width: 100%; font: inherit; text-align: left; cursor: pointer; color: inherit; }
.vg-golink:hover { border-color: #e0c48f; }
.vg-arrow { font: 26px 'Lilita One', system-ui; color: #b89a6a; }
.vg-tag { display: inline-block; font-size: 11px; font-weight: 700; color: #fff; background: #e09a10; border-radius: 6px; padding: 1px 6px; margin-left: 4px; vertical-align: 2px; }
.vg-town { font-size: 15px; }
.vg-face { display: inline-block; width: 64px; height: 64px; object-fit: contain; }
.vg-face.sm { width: 26px; height: 26px; margin: -4px -2px -4px -4px; vertical-align: middle; }
.vg-armyline { gap: 4px !important; }
.vg-of { opacity: .7; }
.vg-army { border: 2px solid #ead9b8; background: linear-gradient(#fff, #fbf3e2); border-radius: 14px; padding: 10px 12px 12px; margin-bottom: 10px; }
.vg-armyh { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.vg-armyh b { font: 18px 'Lilita One', system-ui; }
.vg-armyh span { font: 16px 'Lilita One', system-ui; color: #8a7558; }
.vg-cap { height: 8px; border-radius: 5px; background: #ead9b8; overflow: hidden; margin-bottom: 10px; }
.vg-cap i { display: block; height: 100%; background: linear-gradient(#8ee35a, #3ea21f); }
.vg-slots { display: flex; gap: 10px; flex-wrap: wrap; }
.vg-slot { position: relative; width: 92px; height: 104px; border: 3px solid #1b1b1b; border-radius: 12px; background: linear-gradient(#7aa7e8, #3f6fc4); box-shadow: 0 3px 0 #1b1b1b; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding: 0 0 4px; overflow: visible; font: inherit; }
.vg-slot.a { background: linear-gradient(#b48be8, #6d45b8); }
.vg-slot .vg-face { position: absolute; top: 2px; left: 50%; transform: translateX(-50%); width: 82px; height: 82px; }
.vg-slot span { position: relative; font: 14px 'Lilita One', system-ui; color: #fff; text-shadow: 0 1px 0 #1b1b1b, 0 0 2px #1b1b1b; }
.vg-slot .vg-cnt { position: absolute; top: 3px; left: 6px; font: 20px 'Lilita One', system-ui; font-style: normal; color: #fff; text-shadow: 0 2px 0 #1b1b1b, 0 0 2px #1b1b1b; z-index: 1; }
.vg-minus { position: absolute; top: -10px; right: -10px; width: 30px; height: 30px; border-radius: 50%; border: 2.5px solid #1b1b1b; background: linear-gradient(#ff7a6b, #c62d2d); color: #fff; font: 22px/1 'Lilita One', system-ui; padding: 0 0 3px; cursor: pointer; box-shadow: 0 2px 0 #1b1b1b; z-index: 2; }
.vg-slot.wip { filter: saturate(.75); }
.vg-wipbar { position: absolute; left: 6px; right: 6px; bottom: 22px; height: 7px; border-radius: 4px; background: rgba(0,0,0,.45); overflow: hidden; }
.vg-wipbar i { display: block; height: 100%; background: #6be04a; }
.vg-buy { cursor: pointer; padding-bottom: 18px; }
.vg-buy .vg-price { position: absolute; top: 3px; right: 6px; font: 16px 'Lilita One', system-ui; font-style: normal; color: #fff; text-shadow: 0 2px 0 #1b1b1b, 0 0 2px #1b1b1b; display: flex; gap: 3px; align-items: center; z-index: 1; }
.vg-buy em { position: absolute; bottom: 3px; left: 4px; right: 4px; font-style: normal; font-size: 10.5px; line-height: 1.1; color: #ffe1dc; text-shadow: 0 1px 0 #1b1b1b; }
.vg-buy em.ok { color: #d9ffd0; }
.vg-buy[disabled] { filter: grayscale(.8); opacity: .75; cursor: default; }
.vg-buy:not([disabled]):active { transform: translateY(2px); box-shadow: 0 1px 0 #1b1b1b; }
.vg-empty { color: #8a7558; font-size: 14px; margin: 4px 0; }
.vg-note { color: #8a7558; font-size: 12.5px; margin: 10px 0 0; line-height: 1.4; }
.vg-pl .vg-txt { flex: 1; }
@media (prefers-reduced-motion: reduce) { .vg-sheet, .vg-toast { animation: none; } }
`;

export function mount(root, api) {
  if (!document.getElementById('vg-css')) {
    const st = document.createElement('style'); st.id = 'vg-css'; st.textContent = CSS; document.head.append(st);
    const f = document.createElement('link'); f.rel = 'stylesheet'; f.href = 'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap'; document.head.append(f);
  }
  root.innerHTML = `<canvas></canvas><div class="vg-labels"></div><div class="vg-hud"></div><div class="vg-load">Building your village…</div>`;
  const cv = root.querySelector('canvas'), hud = root.querySelector('.vg-hud'), labs = root.querySelector('.vg-labels');
  /* The buttons and bars are redrawn every second for their countdowns, into
     this one child only, and only when their text changed. The sheet, the intro
     and toasts sit beside it and are never taken out, so nothing replays. */
  const bar = document.createElement('div'); bar.style.display = 'contents'; hud.append(bar);
  let lastSpare = null;
  const setBar = html => {
    if (bar.dataset.html === html) return;
    bar.innerHTML = html; bar.dataset.html = html;
    const sp = bar.querySelector('.vg-spare');
    if (sp && lastSpare !== null && +sp.dataset.n !== lastSpare) sp.classList.add('vg-flash');
    lastSpare = sp ? +sp.dataset.n : null;
  };

  let S = api.state();
  let sheet = null; // { kind: 'building', id } | { kind: 'build' }
  let editing = null; // { pos, walls, tool }
  let open = true, toastT = 0;
  /* What's on screen: your village ('home'), someone's you're looking at
     ('scout'), or a fight, live or played back. `fx` holds a fight: its id,
     what it's fought on, the simulation, the clock and the drops. */
  let mode = 'home', whom = null, fx = null;
  /* The town round your plot: the app's own screens as buildings, the same for
     everyone, fixed on the grass outside the walls. Not raid targets and not
     part of the plot. `go` is what api.go opens. */
  const TOWN = [
    { id: 'arena', name: 'Arena', go: 'arena', x: -15.5, z: -15.5, r: 5.5 },
    { id: 'games', name: 'Foosball hall', go: 'games', x: -17, z: -8, r: 3 },
    { id: 'fame', name: 'Hall of Fame', go: 'hall', x: -8, z: -17, r: 3 },
    { id: 'market', name: 'Market', go: 'market', x: -19, z: -1, r: 2.5 },
    { id: 'notice', name: 'Notice board', go: 'track', x: -1, z: -19, r: 2 },
    { id: 'sign', name: 'Toss & rules', go: 'toss', x: 12.6, z: 12.6, r: 1.5 },
  ];
  // the village being drawn, whichever it is: levels, where things stand, walls, ghosts, and its owner's look
  function D() {
    if (fx) return { lvl: fx.input.lvl, pos: fx.input.pos, walls: fx.walls || fx.input.walls, ghosts: fx.input.ghosts, x: fx.look || {} };
    const L = mode === 'scout' ? S.look(whom) : S;
    const l = mode === 'home' && editing ? editing : V.place(L.has, L.saved, L.v.pieces);
    return { lvl: L.v.lvl, pos: l.pos, walls: l.walls, ghosts: L.ghosts, x: L, v: L.v };
  }

  /* ---------- the 3D scene ---------- */
  let R;
  try {
    R = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    if (!R.getContext()) throw new Error('no WebGL');
  } catch {
    R = null;
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#5d9f35');
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  const target = new THREE.Vector3(0, 0, 1);
  const OFF = new THREE.Vector3(30, 33, 30);
  let zoom = 1;
  const groups = {}; // id -> { g, sig }
  const wallGroup = new THREE.Group();
  const loader = new GLTFLoader(), cache = {};
  const load = p => cache[p] || (cache[p] = new Promise((res, rej) => loader.load(`models/${p.includes('.') ? p : p + '.glb'}`, g => {
    g.scene.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    res(g.scene);
  }, undefined, rej)));
  const get = async p => (await load(p)).clone(true);

  function resize() {
    const W = root.clientWidth, H = root.clientHeight;
    if (!R || !W) return;
    R.setPixelRatio(Math.min(2, devicePixelRatio));
    R.setSize(W, H, false);
    // the whole plot across the screen at zoom 1
    const vw = 27, vh = Math.max(vw * H / W, 22);
    Object.assign(cam, { left: -vh * W / H / 2, right: vh * W / H / 2, top: vh / 2, bottom: -vh / 2, zoom });
    cam.updateProjectionMatrix();
  }
  const aim = () => { cam.position.copy(target).add(OFF); cam.lookAt(target); };

  const tex = (draw, n = 512) => {
    const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  };
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...o });
  const box = (w, h, d, color, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color) : color);
    m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  // centre a model on its footprint, scaled so its wider side fills `span`
  function fit(o, span, maxH) {
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
    let k = span / Math.max(s.x, s.z);
    if (maxH && s.y * k > maxH) k = maxH / s.y;
    o.scale.multiplyScalar(k);
    const b2 = new THREE.Box3().setFromObject(o), c = b2.getCenter(new THREE.Vector3());
    o.position.x -= c.x; o.position.z -= c.z; o.position.y -= b2.min.y;
    return o;
  }
  async function stack(parts) {
    const g = new THREE.Group(); let y = 0;
    for (const p of parts) { const o = await get(p); o.position.y = y; g.add(o); y = new THREE.Box3().setFromObject(g).max.y; }
    return g;
  }
  const tint = (o, color, ghost) => o.traverse(m => {
    if (!m.isMesh) return;
    m.material = ghost ? new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: .42, roughness: .6 })
      : new THREE.MeshStandardMaterial({ color, metalness: .55, roughness: .35 });
    if (ghost) m.castShadow = false;
  });

  /* Each building's look at its level. Grows with the level, so an upgrade shows. */
  async function model(id, x) {
    const g = new THREE.Group(), z = V.size(id);
    if (id === 'club') {
      const parts = ['castle/tower-square-base'];
      for (let i = 1; i < x.lvl; i++) parts.push(i % 2 ? 'castle/tower-square-mid-windows' : 'castle/tower-square-mid');
      parts.push(x.lvl >= 3 ? 'castle/tower-square-top-roof-high-windows' : 'castle/tower-square-roof');
      const t = fit(await stack(parts), 3.3); g.add(t);
      if (x.lvl >= 2) { const f = await get('castle/flag-wide'); f.scale.setScalar(2.2); f.position.set(0, new THREE.Box3().setFromObject(t).max.y - .3, -.2); g.add(f); }
      if (x.lvl >= 4) for (const [a, b] of [[-1.7, 1.7], [1.7, 1.7]]) { const l = await get('fantasy-town/lantern'); l.scale.setScalar(1.3); l.position.set(a, 0, b); g.add(l); }
    } else if (id === 'bank') {
      /* A stone vault: a round gold vault door on each face the camera sees,
         a gold roof edge, a big coin turning over it, and coin stacks that
         grow with its level. Nothing round and dark, so it can't pass for a Cannon. */
      const gold = mat('#e8b923', { metalness: .6, roughness: .3 }), stone = mat('#d6d9e0'), dark = mat('#8d93a0');
      box(2.8, .2, 2.8, dark, 0, 0, 0, g);
      box(2.3, 1.45, 2.3, stone, 0, .2, 0, g);
      box(2.5, .16, 2.5, gold, 0, 1.65, 0, g);
      box(1.9, .3, 1.9, stone, 0, 1.81, 0, g);
      box(1.3, .12, 1.3, gold, 0, 2.11, 0, g);
      for (const [ax, rot] of [['z', 0], ['x', Math.PI / 2]]) { // a door on the +z face and one on the +x face
        const d = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .08, 28), gold); disc.rotation.x = Math.PI / 2; d.add(disc);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.55, .07, 8, 28), dark); d.add(rim);
        for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(.9, .07, .1), dark); sp.rotation.z = k * Math.PI / 3; sp.position.z = .06; d.add(sp); }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .14, 16), dark); hub.rotation.x = Math.PI / 2; hub.position.z = .08; d.add(hub);
        d.position.set(ax === 'x' ? 1.16 : 0, .95, ax === 'z' ? 1.16 : 0); d.rotation.y = rot;
        d.traverse(m => { if (m.isMesh) m.castShadow = true; });
        g.add(d);
      }
      const big = await get('platformer/coin-gold'); big.scale.setScalar(1.5); big.position.y = 2.65; g.add(big); g.userData.spin = big;
      const stacks = [[1.25, 1.25], [-1.25, 1.25], [1.25, -1.25], [-1.25, -1.25]].slice(0, Math.min(4, x.lvl + 1));
      for (const [sx, sz] of stacks) for (let k = 0; k < 2 + x.lvl; k++) {
        const cn = await get('platformer/coin-gold'); cn.scale.setScalar(.55); cn.rotation.x = Math.PI / 2; cn.position.set(sx, .22 + k * .1, sz); g.add(cn);
      }
    } else if (id === 'mine') {
      g.add(fit(await get('castle/rocks-large'), 2.7 + x.lvl * .1, 1.6 + x.lvl * .25));
      const ct = fit(await get('fantasy-town/cart'), 1.4); ct.position.set(.6, 0, 1.05); ct.rotation.y = .5; g.add(ct);
      for (let k = 0; k < x.lvl * 2; k++) { const cn = await get('platformer/coin-gold'); cn.scale.setScalar(.45); cn.rotation.x = Math.PI / 2; cn.position.set(.6 + (k % 2) * .18, .62 + Math.floor(k / 2) * .08, 1.05); g.add(cn); }
      const l = await get('fantasy-town/lantern'); l.scale.setScalar(1); l.position.set(-1.1, 0, 1.1); g.add(l);
    } else if (id === 'stadium') {
      const pw = 4.4, pd = 3, stand = x.lvl >= 2 ? '#d64545' : '#3f7fd0';
      box(pw + .5, .1, pd + .5, '#d9d9d9', 0, 0, .35, g);
      const pitch = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshStandardMaterial({ roughness: 1, map: tex((c, n) => {
        for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#4fae45' : '#5cbd50'; c.fillRect(i * n / 8, 0, n / 8 + 1, n); }
        c.strokeStyle = '#fff'; c.lineWidth = 7; c.strokeRect(14, 14, n - 28, n - 28);
        c.beginPath(); c.moveTo(n / 2, 14); c.lineTo(n / 2, n - 14); c.stroke(); c.beginPath(); c.arc(n / 2, n / 2, 60, 0, 7); c.stroke();
        c.strokeRect(14, n / 2 - 90, 70, 180); c.strokeRect(n - 84, n / 2 - 90, 70, 180);
      }) }));
      pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, .11, .35); pitch.receiveShadow = true; g.add(pitch);
      for (let k = 0; k < x.lvl + 1; k++) box(pw + .5, .3, .4, k % 2 ? '#e8e8e8' : stand, 0, k * .3, -1.4 - k * .4 + .4, g);
      if (x.lvl >= 2) for (let k = 0; k < 2; k++) box(.4, .3, pd + .5, k % 2 ? '#e8e8e8' : stand, -2.6 - k * .4 + .2, k * .3, .35, g);
      for (const s of [-1, 1]) box(.1, .45, .9, '#fff', s * (pw / 2 - .12), .1, .35, g);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.15, 16, 12), mat('#fff')); ball.position.set(.5, .27, .6); ball.castShadow = true; g.add(ball);
    } else if (id === 'barracks') {
      box(2.8, .12, 2.8, '#b89a6a', 0, 0, 0, g);
      const t = fit(await get('mini-forest/tent'), 2 + x.lvl * .15); t.position.set(-.2, .12, -.2); g.add(t);
      const r = fit(await get('mini-arena/weapon-rack'), .9); r.position.set(.9, .12, .9); r.rotation.y = -Math.PI / 4; g.add(r);
      const f = await get('castle/flag-banner-long'); f.scale.setScalar(1.3); f.position.set(-1.2, 0, 1.1); g.add(f);
    } else if (id === 'cannon' || id === 'cannon2') {
      const b = fit(await get('tower-defense/tower-round-base'), 1.5 + x.lvl * .1); g.add(b);
      const c = fit(await get('tower-defense/weapon-cannon'), 1.1 + x.lvl * .1); c.position.y = new THREE.Box3().setFromObject(b).max.y; c.rotation.y = Math.PI * .75; g.add(c);
      g.userData.top = c;
    } else if (id === 'tower' || id === 'tower2') {
      const parts = ['castle/tower-hexagon-base'];
      for (let i = 1; i < x.lvl; i++) parts.push('castle/tower-hexagon-mid');
      parts.push('castle/tower-hexagon-top-wood');
      g.add(fit(await stack(parts), 1.6, 1.4 + x.lvl * .7));
    } else if (id === 'oak') {
      const t = await get('nature/tree_oak'); t.scale.setScalar([1.4, 2.1, 2.8, 3.5][x.stage] || 2); g.add(t);
    } else if (id === 'trophy') {
      box(2.8, .3, 2.8, '#e9dcc0', 0, 0, 0, g); box(2.3, .18, 2.3, '#f6efe0', 0, .3, 0, g);
      for (const [a, b] of [[-.95, -.95], [.95, -.95], [-.95, .95], [.95, .95]]) { const c = await get('mini-arena/column'); c.scale.setScalar(1.35); c.position.set(a, .48, b); g.add(c); }
      const t = await get('mini-arena/trophy'); t.scale.setScalar(2.4 + Math.min(4, x.n) * .25); t.position.y = .48; g.add(t);
    } else if (id === 'boot' || id === 'glove') {
      box(.8, .3, .8, x.won ? '#e9dcc0' : '#8e8e96', 0, 0, 0, g);
      const st = await get('mini-arena/statue'); st.scale.setScalar(1.05); st.position.y = .3; st.rotation.y = -Math.PI / 4;
      tint(st, id === 'boot' ? '#f2c230' : '#c9d6e6', !x.won); g.add(st);
    }
    // standing on its footprint: the group's origin is the footprint's centre
    return g;
  }
  const sigOf = (id, x) => JSON.stringify([id, x]);
  const lookOf = (id, d) => {
    if (V.B[id]) return { lvl: d.lvl[id] || 1 };
    if (id === 'oak') return { stage: d.x.tree ? d.x.tree.stage : 3 };
    if (id === 'trophy') return { n: d.x.titles || 1 };
    return { won: !d.ghosts.includes(id) };
  };
  const center = (id, p) => { const z = V.size(id); return new THREE.Vector3(p.x + z.w / 2 - HALF, G, p.z + z.d / 2 - HALF); };

  // what the player has comes from the page (villageHas), the same list a raid on them uses
  const has = () => S.has;

  let syncing = Promise.resolve();
  function sync() {
    syncing = syncing.then(async () => {
      const d = D(), { pos, walls } = d, want = Object.keys(pos);
      for (const id of Object.keys(groups)) if (!want.includes(id)) { scene.remove(groups[id].g); delete groups[id]; }
      for (const id of want) {
        const x = lookOf(id, d), sig = sigOf(id, x);
        if (!groups[id] || groups[id].sig !== sig) {
          let g;
          try { g = await model(id, x); } catch (e) { console.warn('[village] model', id, e); g = new THREE.Group(); }
          g.userData.id = id;
          if (groups[id]) scene.remove(groups[id].g);
          groups[id] = { g, sig }; scene.add(g);
        }
        if (!(drag && drag.id === id)) groups[id].g.position.copy(center(id, pos[id]));
      }
      drawWalls(walls, d.lvl.wall);
      drawCamp(pos);
      root.querySelector('.vg-load')?.remove();
    });
    return syncing;
  }

  // walls: a stone post per piece, joined to the next piece along x or z
  let wallSig = '';
  function drawWalls(walls, lvl = 1) {
    const sig = walls.slice().sort().join(' ') + '|' + lvl;
    if (sig === wallSig) return;
    wallSig = sig;
    wallGroup.clear();
    const c = [null, ['#c9a46a', '#e0c591'], ['#9ea3ad', '#c3c7cf'], ['#5d6472', '#e3b341']][lvl] || ['#c9a46a', '#e0c591'];
    const body = mat(c[0]), top = mat(c[1]), set = new Set(walls);
    walls.forEach(k => {
      const [x, z] = k.split('_').map(Number), cx = x + .5 - HALF, cz = z + .5 - HALF;
      box(.64, .82, .64, body, cx, G, cz, wallGroup); box(.72, .12, .72, top, cx, G + .82, cz, wallGroup);
      if (set.has((x + 1) + '_' + z)) box(1, .6, .4, body, cx + .5, G, cz, wallGroup);
      if (set.has(x + '_' + (z + 1))) box(.4, .6, 1, body, cx, G, cz + .5, wallGroup);
    });
  }

  if (R) {
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05; R.outputColorSpace = THREE.SRGBColorSpace;
    scene.add(new THREE.HemisphereLight(0xdff2ff, 0x4a6a2a, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.6); sun.position.set(-9, 22, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    sun.shadow.bias = -.0005; sun.shadow.normalBias = .02; scene.add(sun);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ roughness: 1, map: tex((c, n) => {
      c.fillStyle = '#5f9f36'; c.fillRect(0, 0, n, n);
      for (let i = 0; i < 4000; i++) { c.fillStyle = Math.random() < .5 ? '#64a73a' : '#5a9832'; c.fillRect(Math.random() * n, Math.random() * n, 3, 3); }
    }) }));
    field.material.map.wrapS = field.material.map.wrapT = THREE.RepeatWrapping; field.material.map.repeat.set(16, 16);
    field.rotation.x = -Math.PI / 2; field.receiveShadow = true; scene.add(field);
    const plot = new THREE.Mesh(new THREE.BoxGeometry(V.GRID + .6, G, V.GRID + .6), [0, 1, 2, 3, 4, 5].map(i => new THREE.MeshStandardMaterial(i === 2 ? { roughness: 1, map: tex((c, n) => {
      const k = n / V.GRID;
      for (let x = 0; x < V.GRID; x++) for (let z = 0; z < V.GRID; z++) { c.fillStyle = (x + z) % 2 ? '#8fcd4d' : '#86c446'; c.fillRect(x * k, z * k, k + 1, k + 1); }
    }) } : { color: '#7a5232', roughness: 1 })));
    plot.position.y = G / 2; plot.receiveShadow = true; scene.add(plot);
    scene.add(wallGroup);
    // a forest round the plot, the same on every phone
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const trees = ['nature/tree_pineRoundA', 'nature/tree_pineRoundC', 'nature/tree_pineTallA_detailed', 'nature/tree_pineDefaultA', 'nature/tree_default', 'nature/tree_fat', 'nature/plant_bushLarge'];
    for (let i = 0; i < 400 && i < 900; i++) {
      const x = (rnd() - .5) * 70, z = (rnd() - .5) * 70;
      // none on the plot, and none tall in front of it, between it and the camera
      const far = Math.max(Math.abs(x), Math.abs(z));
      if (far < HALF + 2 || (x + z > 0 && far < HALF + 9)) continue;
      if (TOWN.some(t => (x - t.x) ** 2 + (z - t.z) ** 2 < (t.r + 1.5) ** 2)) continue;
      const p = trees[Math.floor(rnd() * trees.length)], s = 1.6 + rnd() * 1, r = rnd() * 6;
      get(p).then(o => { o.scale.setScalar(s); o.position.set(x, 0, z); o.rotation.y = r; scene.add(o); }).catch(() => {});
    }
  }

  /* ---------- the town ---------- */
  const town = {};
  async function townModel(id) {
    const g = new THREE.Group();
    if (id === 'arena') { // an oval of stands round a pitch, flags at the ends
      const rx = 4.2, rz = 3.2;
      const pitch = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ roughness: 1, map: tex((c, n) => {
        for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#4fae45' : '#5cbd50'; c.fillRect(i * n / 8, 0, n / 8 + 1, n); }
        c.strokeStyle = '#fff'; c.lineWidth = 8; c.beginPath(); c.moveTo(n / 2, 0); c.lineTo(n / 2, n); c.stroke();
        c.beginPath(); c.arc(n / 2, n / 2, 70, 0, 7); c.stroke();
      }) }));
      pitch.rotation.x = -Math.PI / 2; pitch.scale.set(rx - .9, rz - .9, 1); pitch.position.y = .06; pitch.receiveShadow = true; g.add(pitch);
      // a stone wall round it, a tower at each corner
      const ring = (a, r = 1) => [Math.cos(a) * rx * r, Math.sin(a) * rz * r];
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, [wx, wz] = ring(a), w = await get('kaykit/wall_straight.gltf');
        w.scale.setScalar(1.15); w.position.set(wx, 0, wz); w.rotation.y = -Math.atan2(rz * Math.cos(a), -rx * Math.sin(a)); g.add(w);
      }
      for (let i = 0; i < 4; i++) {
        const [tx, tz] = ring(Math.PI / 4 + i * Math.PI / 2, 1.02), t = await get('kaykit/building_tower_A_blue.gltf');
        t.scale.setScalar(1.3); t.position.set(tx, 0, tz); g.add(t);
      }
    } else if (id === 'games') { // the barrel tavern, where the games are
      g.add(fit(await get('kaykit/building_tavern_blue.gltf'), 3.4));
      const b = fit(await get('kaykit/barrel.gltf'), .7); b.position.set(1.7, 0, 1.4); g.add(b);
    } else if (id === 'fame') { // a watch tower with a gold banner
      g.add(fit(await get('kaykit/building_tower_A_blue.gltf'), 1.9));
      const f = fit(await get('kaykit/flag_yellow.gltf'), .9, 2.4); f.position.set(1.3, 0, 1.2); g.add(f);
    } else if (id === 'market') {
      g.add(fit(await get('kaykit/building_market_blue.gltf'), 3.8));
    } else if (id === 'notice') { // the town well, where the news is
      g.add(fit(await get('kaykit/building_well_blue.gltf'), 2.2));
    } else if (id === 'sign') {
      g.add(fit(await get('survival/signpost'), 1.3, 1.8));
    }
    return g;
  }
  if (R) for (const t of TOWN) townModel(t.id).then(g => {
    g.position.set(t.x, 0, t.z); g.userData.town = t.id;
    g.traverse(m => { if (m.isMesh) m.receiveShadow = true; });
    scene.add(g); town[t.id] = g;
  }).catch(e => console.warn('[village] town', t.id, e));

  /* ---------- the edit grid and a footprint under a dragged building ---------- */
  const grid = new THREE.GridHelper(V.GRID, V.GRID, 0xffffff, 0xffffff);
  grid.material.transparent = true; grid.material.opacity = .35; grid.position.y = G + .01; grid.visible = false; scene.add(grid);
  const foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x3ec43e, transparent: true, opacity: .45, depthWrite: false }));
  foot.rotation.x = -Math.PI / 2; foot.visible = false; scene.add(foot);

  /* ---------- pointer: pan, pinch, tap, drag, paint ---------- */
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -G);
  const ndc = e => { const r = cv.getBoundingClientRect(); return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); };
  const cellAt = e => {
    ray.setFromCamera(ndc(e), cam);
    const p = ray.ray.intersectPlane(ground, new THREE.Vector3());
    return p ? { x: Math.floor(p.x + HALF), z: Math.floor(p.z + HALF) } : null;
  };
  const hitId = e => {
    ray.setFromCamera(ndc(e), cam);
    const town3 = mode === 'home' && !editing ? Object.values(town) : [];
    for (const h of ray.intersectObjects([...Object.values(groups).map(g => g.g), ...town3], true)) {
      let o = h.object; while (o && !o.userData.id && !o.userData.town) o = o.parent;
      if (o) return o.userData.id || 'town:' + o.userData.town;
    }
    return null;
  };
  const pts = new Map();
  let drag = null, pan = null, pinch = null, moved = 0, painted = false;
  const free = (id, p, pos, walls) => {
    const others = { ...pos }; delete others[id];
    return V.valid({ ...others, [id]: p }, walls, Infinity);
  };
  const spare = () => S.v.pieces - editing.walls.length;
  const wallKey = c => c && c.x >= 0 && c.z >= 0 && c.x < V.GRID && c.z < V.GRID ? c.x + '_' + c.z : null;
  const occupied = k => Object.entries(editing.pos).some(([id, p]) => V.cells(id, p).includes(k));

  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; painted = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; drag = pan = null; return; }
    if (editing && editing.tool === 'wall') { pan = null; drag = { paint: true, first: wallKey(cellAt(e)) }; return; }
    const id = editing && hitId(e);
    if (id) { drag = { id, start: editing.pos[id], p: editing.pos[id] }; return; }
    pan = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const was = pts.get(e.pointerId); moved += Math.hypot(e.clientX - was.x, e.clientY - was.y);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      zoom = Math.min(2.6, Math.max(.7, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); resize(); return;
    }
    if (drag && drag.paint) return paintAt(e);
    if (drag) {
      const c = cellAt(e); if (!c) return;
      const z = V.size(drag.id), p = { x: Math.min(V.GRID - z.w, Math.max(0, c.x - Math.floor(z.w / 2))), z: Math.min(V.GRID - z.d, Math.max(0, c.z - Math.floor(z.d / 2))) };
      drag.p = p; drag.ok = free(drag.id, p, editing.pos, editing.walls);
      groups[drag.id].g.position.copy(center(drag.id, p)).setY(G + .25);
      foot.visible = true; foot.scale.set(z.w, z.d, 1); foot.position.copy(center(drag.id, p)).setY(G + .02);
      foot.material.color.set(drag.ok ? 0x3ec43e : 0xe53935);
      return;
    }
    if (pan) {
      const H = root.clientHeight, u = (cam.top - cam.bottom) / zoom / H, dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      pan = { x: e.clientX, y: e.clientY };
      const right = new THREE.Vector3(1, 0, -1).normalize(), fwd = new THREE.Vector3(-1, 0, -1).normalize();
      target.addScaledVector(right, -dx * u).addScaledVector(fwd, dy * u * 1.63);
      target.x = Math.max(-22, Math.min(16, target.x)); target.z = Math.max(-22, Math.min(16, target.z));
      aim();
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) pinch = null; return; }
    if (drag && drag.paint) {
      // a tap, not a drag: a piece comes up, an empty cell gets one
      if (!painted) { const k = wallKey(cellAt(e)); if (k && editing.walls.includes(k)) editing.walls = editing.walls.filter(w => w !== k); else lay(k); }
      drag = null; sync(); paintHud(); return;
    }
    if (drag) {
      if (drag.ok) editing.pos[drag.id] = drag.p;
      const id = drag.id; drag = null; foot.visible = false;
      groups[id].g.position.copy(center(id, editing.pos[id]));
      paintHud(); return;
    }
    pan = null;
    if (fx) { if (moved < 8 && fx.live && !fx.ended) dropAt(e); return; }
    if (mode !== 'home') return;
    if (moved < 8 && !editing) {
      const id = hitId(e);
      if (id && id.startsWith('town:')) return api.go(TOWN.find(t => t.id === id.slice(5)).go);
      if (id) openSheet({ kind: 'building', id }); else if (sheet) { sheet = null; paintSheet(); }
    }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.min(2.6, Math.max(.7, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); resize(); }, { passive: false });
  const lay = k => {
    if (!k || editing.walls.includes(k) || occupied(k) || spare() <= 0) return;
    editing.walls.push(k); painted = true;
  };
  // a drag lays a line, the cell it started on included
  function paintAt(e) {
    if (moved < 8) return;
    if (drag.first) { lay(drag.first); drag.first = null; }
    const n = editing.walls.length;
    lay(wallKey(cellAt(e)));
    if (editing.walls.length !== n) { sync(); paintHud(); }
  }

  /* ---------- the overlay ---------- */
  const toast = msg => {
    root.querySelector('.vg-toast')?.remove();
    const t = document.createElement('div'); t.className = 'vg-toast'; t.textContent = msg; hud.append(t);
    clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2200);
  };
  // the walk's own answer, asked of a copy now: what the row would cost, or why not
  const check = row => V.act(JSON.parse(JSON.stringify(S.v)), { ...row, at: S.now }, S.bal, api.opts);
  const spend = async (row, done) => {
    const r = check(row);
    if (r.no) return toast(r.no[0].toUpperCase() + r.no.slice(1));
    try { await api.spend(row); if (done) toast(done); } catch (err) { toast('That didn’t go through'); console.error(err); }
  };
  const building = () => S.v.building;
  function paintHud() {
    if (editing) {
      setBar(`<div class="vg-edit">
        <div class="vg-n"><span class="vg-pill">${coin}${S.bal}</span> <span class="vg-spare" data-n="${spare()}">Wall pieces: <b>${spare()}</b> spare</span></div>
        <button class="vg-btn vg-blue vg-tool ${editing.tool === 'wall' ? 'on' : ''}" data-a="tool">${svg(editing.tool === 'wall' ? 'move' : 'wall')}${editing.tool === 'wall' ? 'Move' : 'Walls'}</button>
        <button class="vg-btn vg-gold" data-a="buywall">Buy 5 walls · ${coin}5</button>
        <button class="vg-btn vg-grey" data-a="cancel">Cancel</button>
        <button class="vg-btn vg-green" data-a="save">Save</button></div>
        <div class="vg-hint">${editing.tool === 'wall' ? 'Drag to lay wall · tap a piece to take it up' : 'Drag a building to move it'}</div>`);
      return paintSheet();
    }
    if (mode === 'scout') {
      const o = S.others.find(x => x.name === whom) || {};
      setBar(`<div class="vg-top">
          <button class="vg-x vg-blue" data-a="back" aria-label="Back to your village">${svg('back')}</button>
          <div class="vg-pill vg-builder"><span>${esc(whom)}’s village · up to ${o.loot ?? 0} coins</span></div></div>
        <div class="vg-bottom">${o.no ? `<div class="vg-pill">${esc(why(o))}</div>` : ''}
          <button class="vg-btn vg-red" data-a="attack" ${o.no ? 'disabled' : ''}>${svg('sword')} Attack</button></div>`);
      return paintSheet();
    }
    if (fx) {
      const sim = fx.sim, cards = fx.live && !fx.ended
        ? ['b', 'a'].map(u => `<button class="vg-card ${fx.sel === u ? 'on' : ''}" data-a="sel" data-u="${u}" ${sim.left[u] > 0 ? '' : 'disabled'}>${V.UNITS[u].name}<b>×${sim.left[u]}</b></button>`).join('')
          + `<button class="vg-btn vg-grey" data-a="skip">End</button>`
        : !fx.ended ? `<button class="vg-btn vg-grey" data-a="skip">Skip</button>` : '';
      setBar(`<div class="vg-raidtop"></div><div class="vg-cards">${cards}</div>${fx.live && !fx.ended && sim.tick < 30 ? '<div class="vg-hint">Pick a card, then tap outside the red to drop</div>' : ''}`);
      paintRaidTop();
      return paintSheet();
    }
    const b = building(), bank = Math.floor(S.v.bank), v = S.v, tr = v.training;
    const home = api.isHome();
    setBar(`<div class="vg-top">
        ${home ? '' : `<button class="vg-x" data-a="close" aria-label="Close the village">${svg('x')}</button>`}
        <button class="vg-pill vg-coins" data-a="go" data-go="coins" aria-label="Your coins">${coin}<span>${S.bal}</span></button>
        <div class="vg-pill vg-builder">${svg('hammer')}<span>${b ? `${esc(NAMES[b.item])} → level ${b.lvl} · ${dur(b.done - S.now)}` : 'Builder free'}</span></div>
        <button class="vg-help vg-bell ${S.alertsDot ? 'dot' : ''}" data-a="go" data-go="alerts" aria-label="Notifications">${svg('bell')}</button>
        <button class="vg-help" data-a="help" aria-label="Show the tour again">?</button>
      </div>
      <div class="vg-top2">
        <button class="vg-pill" data-a="town">${svg('town')}Town</button>
        ${S.live ? `<button class="vg-pill vg-live" data-a="go" data-go="arena"><i></i>${esc(S.live)}</button>` : ''}
        ${v.lvl.barracks ? `<button class="vg-pill vg-armyline" data-a="army">${face('b', 'sm')}${v.army.b}${v.lvl.barracks > 1 || v.army.a ? ` ${face('a', 'sm')}${v.army.a}` : ''}<span class="vg-of">/${V.armyCap(v)}</span>${tr ? ` · ${dur(tr.done - S.now)}` : ''}</button>` : ''}
        ${v.shield > S.now ? `<div class="vg-pill">${svg('shield')}Shield ${dur(v.shield - S.now)}</div>` : ''}
        <button class="vg-pill vg-log" data-a="log">${svg('log')}Raid log</button>
      </div>
      <div class="vg-bottom">
        <button class="vg-btn vg-green" data-a="collect" ${bank < 1 ? 'disabled' : ''}>${coin} ${bank}</button>
        <button class="vg-btn vg-gold" data-a="build">${svg('hammer')} Build</button>
        <button class="vg-btn vg-blue" data-a="edit">${svg('move')} Edit</button>
        <button class="vg-btn vg-red" data-a="raids">${svg('sword')} Raid<span class="vg-dots2">${'●'.repeat(v.tickets)}${'○'.repeat(V.TICKETS - v.tickets)}</span></button>
      </div>`);
    paintSheet();
  }
  function paintRaidTop() {
    const el = bar.querySelector('.vg-raidtop'); if (!el || !fx) return;
    const r = fx.sim.result(), left = Math.max(0, Math.ceil((V.RAID_MS - fx.sim.tick * V.TICK) / 1000));
    const html = `<button class="vg-x vg-grey" data-a="${fx.live && !fx.ended ? 'skip' : 'home'}" aria-label="Leave">${svg('x')}</button>
      <div class="vg-pill vg-big">${left}s</div>
      <div class="vg-pill">${Math.round(r.pct * 100)}%</div><div class="vg-pill vg-stars">${stars(r.stars)}</div>
      <div class="vg-pill">${coin}${Math.floor(fx.loot0 * r.bank)}</div>
      ${fx.replay ? `<div class="vg-pill" style="font-size:14px">${esc(fx.by)} on ${esc(fx.on)}</div>` : ''}`;
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }
  const why = o => o.no === 'shield' ? `Shield ${dur(o.shield - S.now)}` : o.no[0].toUpperCase() + o.no.slice(1);
  function doAttack() {
    const o = S.others.find(x => x.name === whom);
    if (!o || o.no) return toast(o ? why(o) : 'Can’t raid them');
    const input = api.raidInput(whom), r = api.raid(whom);
    mode = 'raid';
    startFight({ id: r.key, input, live: true, loot0: o.loot, look: S.look(whom), on: whom, by: S.me, sel: input.army.b ? 'b' : 'a' });
    Promise.resolve(r.done).catch(() => { toast('The raid didn’t go through'); leaveFight(); });
  }
  function startReplay(id) {
    const r = S.raids.find(x => x.id === id); if (!r) return;
    mode = 'replay';
    startFight({ id, input: r.input, replay: true, drops: r.drops.slice().sort((a, b) => a.t - b.t), di: 0, loot0: r.loot0, look: S.look(r.on), on: r.on, by: r.by, raid: r });
  }
  function dropAt(e) {
    if (fx.sim.tick * V.TICK >= V.RAID_MS) return;
    ray.setFromCamera(ndc(e), cam);
    const p = ray.ray.intersectPlane(ground, new THREE.Vector3()); if (!p) return;
    // a tap off the plot lands on its nearest edge, so the whole field round it is a drop zone
    const edge = n => Math.min(V.GRID - .1, Math.max(0, Math.round((n + HALF) * 10) / 10));
    const x = edge(p.x), z = edge(p.z), u = fx.sel;
    if (!V.canDrop(fx.input, x, z)) return toast('Drop outside the red');
    if (!(fx.sim.left[u] > 0)) return toast(`No ${V.UNITS[u].name}s left`);
    fx.sim.drop(u, x, z);
    api.drop(fx.id, u, x, z, fx.sim.tick * V.TICK);
    if (!(fx.sim.left[u] > 0) && fx.sim.left[u === 'b' ? 'a' : 'b'] > 0) fx.sel = u === 'b' ? 'a' : 'b';
    paintHud();
  }
  const look = n => { mode = 'scout'; whom = n; sheet = null; target.set(0, 0, 1); aim(); sync(); paintHud(); };
  hud.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'); if (!a || a.disabled) return;
    const k = a.dataset.a;
    if (k === 'close') return api.close();
    if (k === 'collect') return spend({ kind: 'vcollect' }, `+${Math.floor(S.v.bank)} coins`);
    if (k === 'build') return openSheet({ kind: 'build' });
    if (k === 'edit') { const l = V.place(S.has, S.saved, S.v.pieces); editing = { pos: l.pos, walls: l.walls, tool: null }; sheet = null; grid.visible = true; sync(); return paintHud(); }
    if (k === 'tool') { editing.tool = editing.tool === 'wall' ? null : 'wall'; return paintHud(); }
    if (k === 'buywall') return spend({ kind: 'vwall', n: 5 }, editing ? '+5 wall pieces. Tap Walls to lay them' : '+5 wall pieces. Lay them in Edit');
    if (k === 'cancel') { editing = null; grid.visible = false; foot.visible = false; sync(); return paintHud(); }
    if (k === 'save') {
      if (!V.valid(editing.pos, editing.walls, S.v.pieces)) return toast('Something overlaps');
      const data = { layout: editing.pos, walls: Object.fromEntries(editing.walls.map(w => [w, true])) };
      return api.save(data).then(() => { editing = null; grid.visible = false; toast('Saved'); sync(); paintHud(); })
        .catch(err => { console.error(err); toast('Couldn’t save'); });
    }
    if (k === 'sheetx') { sheet = null; return paintSheet(); }
    if (k === 'up') return spend({ kind: 'vup', item: a.dataset.id }, 'Upgrade started');
    if (k === 'buy') return spend({ kind: 'vbuild', item: a.dataset.id }, `${NAMES[a.dataset.id]} built`).then(() => {
      sheet = null; paintSheet();
      setTimeout(() => { if (S.v.lvl[a.dataset.id] && !editing) hud.querySelector('[data-a="edit"]')?.click(); }, 1200);
    });
    if (k === 'tree') return api.openTree();
    if (k === 'raids') return openSheet({ kind: 'raids' });
    if (k === 'log') return openSheet({ kind: 'log' });
    if (k === 'look') return look(a.dataset.n);
    if (k === 'back') { mode = 'home'; whom = null; target.set(0, 0, 1); aim(); sync(); return paintHud(); }
    if (k === 'attack') return doAttack();
    if (k === 'sel') { fx.sel = a.dataset.u; return paintHud(); }
    if (k === 'skip') { fx.skip = true; return; }
    if (k === 'home') return leaveFight();
    if (k === 'replay') return startReplay(a.dataset.id);
    if (k === 'games') return api.openGames();
    if (k === 'train') return spend({ kind: 'train', u: a.dataset.u }, `Training 5 ${V.UNITS[a.dataset.u].name}s`);
    if (k === 'dismiss') return spend({ kind: 'dismiss', u: a.dataset.u, n: 1 }, `1 ${V.UNITS[a.dataset.u].name} let go`);
    if (k === 'tnext') { tourTo(tourAt + 1); return paintTour(); }
    if (k === 'tskip') { tourTo(TOUR.length); return paintTour(); }
    if (k === 'help') { tourTo(0); return paintTour(); }
    if (k === 'army') return openSheet({ kind: 'building', id: 'barracks' });
    if (k === 'town') return openSheet({ kind: 'town' });
    if (k === 'go') { sheet = null; paintSheet(); return api.go(a.dataset.go); }
  });

  function openSheet(s) { sheet = s; paintSheet(); }
  /* Repainted every second for its countdowns: the same sheet keeps its element,
     and only a change of text touches it, so it slides in once and never jumps. */
  function paintSheet() {
    let el = hud.querySelector('.vg-sheet:not(.vg-list)');
    const key = sheet && !editing ? sheet.kind + ':' + (sheet.id || '') : null;
    if (!key) return el && el.remove();
    if (el && el.dataset.key !== key) { el.remove(); el = null; }
    const body = { build: buildList, raids: raidList, log: raidLog, result: resultCard, town: townList }[sheet.kind] || (() => about(sheet.id));
    const html = (sheet.kind === 'result' ? '' : `<button class="vg-x" data-a="sheetx" aria-label="Close">${svg('x')}</button>`) + body();
    if (!el) { el = document.createElement('div'); el.className = 'vg-sheet'; el.dataset.key = key; hud.append(el); }
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }
  // an Upgrade (or Build) row: what it gives, costs and takes, or why it can't be had
  function offer(row, title, text) {
    const r = check(row);
    const label = row.kind === 'vbuild' ? 'Build' : 'Upgrade';
    return `<div class="vg-row"><div class="vg-txt"><b>${title}</b>${text}${r.no ? `<div class="vg-why">${esc(r.no[0].toUpperCase() + r.no.slice(1))}</div>` : ''}</div>
      <button class="vg-btn vg-green" data-a="${row.kind === 'vbuild' ? 'buy' : 'up'}" data-id="${row.item}" ${r.no ? 'disabled' : ''}>${label} ${coin}${r.cost ?? cost(row)}</button></div>`;
  }
  const cost = row => { const x = V.B[row.item], l = row.kind === 'vbuild' ? 1 : S.v.lvl[row.item] + 1; return x.lvl[l - 1] ? x.lvl[l - 1].cost : '–'; };
  function about(id) {
    const v = S.v, b = V.B[id];
    if (b) {
      const l = v.lvl[id], next = b.lvl[l], busy = v.building && v.building.item === id;
      let h = `<h3>${b.name} · Level ${l}</h3><p class="vg-sub">${esc(b.job(l))}.</p>`;
      if (id === 'bank') {
        const n = Math.floor(v.bank), capN = V.cap(v);
        h += `<div class="vg-row"><div class="vg-txt"><b>${n} of ${capN} coins</b>${v.lvl.mine ? 'Your Gold mine fills it on workdays, 9 to 6, and stops when it’s full.' : 'Build a Gold mine to fill it.'}${S.tree ? ' Your tree pays into it too.' : ''} Anything left here can be raided: half of it, by how hard the Bank is hit.<div class="vg-bar"><i style="width:${Math.min(100, n / capN * 100)}%"></i></div></div>
          <button class="vg-btn vg-green" data-a="collect" ${n < 1 ? 'disabled' : ''}>Collect ${n}</button></div>`;
      }
      if (id === 'bank') h += `<button class="vg-row vg-golink" data-a="go" data-go="coins"><div class="vg-txt"><b>Coins & history</b>Your balance, every coin in and out, gifts and bounties.</div><span class="vg-arrow">›</span></button>`;
      if (id === 'club') h += `<button class="vg-row vg-golink" data-a="go" data-go="profile"><div class="vg-txt"><b>Profile & settings</b>Your record, notifications, Classic view, sign out.</div><span class="vg-arrow">›</span></button>`;
      if (id === 'barracks') {
        const tr = v.training;
        /* Laid out the way base-builders do it: the army as square slots with a
           count badge and a red − to let one go, the batch in training below
           with its bar, then a tile per attacker to train more. */
        const slot = u => `<div class="vg-slot ${u}">${face(u)}<i class="vg-cnt">x${v.army[u]}</i>
          <button class="vg-minus" data-a="dismiss" data-u="${u}" aria-label="Remove one ${V.UNITS[u].name}">−</button><span>${V.UNITS[u].name}</span></div>`;
        const have = ['b', 'a'].filter(u => v.army[u] > 0);
        h += `<div class="vg-army"><div class="vg-armyh"><b>Army</b><span>${V.armyN(v)}/${V.armyCap(v)}</span></div>
          <div class="vg-cap"><i style="width:${V.armyN(v) / V.armyCap(v) * 100}%"></i></div>
          <div class="vg-slots">${have.length ? have.map(slot).join('') : '<p class="vg-empty">No troops yet. Train some below.</p>'}</div>`;
        if (tr) {
          const left = tr.done - S.now, all = V.trainMs(tr.u, api.opts.play);
          h += `<div class="vg-armyh" style="margin-top:10px"><b>Training</b><span>${dur(left)}</span></div>
            <div class="vg-slots"><div class="vg-slot ${tr.u} wip">${face(tr.u)}<i class="vg-cnt">x5</i><span>${V.UNITS[tr.u].name}</span>
            <div class="vg-wipbar"><i style="width:${Math.max(0, Math.min(100, (1 - left / all) * 100))}%"></i></div></div></div>`;
        }
        h += `<div class="vg-armyh" style="margin-top:12px"><b>Train troops</b><span>5 a batch</span></div><div class="vg-slots">
          ${['b', 'a'].map(u => {
            const x = V.UNITS[u], r = check({ kind: 'train', u });
            return `<button class="vg-slot ${u} vg-buy" data-a="train" data-u="${u}" ${r.no ? 'disabled' : ''} title="${esc(r.no || '')}">${face(u)}
              <i class="vg-price">${coin}${x.cost}</i><span>${x.name}</span>${r.no ? '' : `<em class="ok">${Math.round(V.trainMs(u, api.opts.play) / 6e4 * 10) / 10} min</em>`}</button>`;
          }).join('')}</div>
          ${['b', 'a'].map(u => { const r = check({ kind: 'train', u }); return r.no ? `<div class="vg-why">${V.UNITS[u].name}s: ${esc(r.no)}</div>` : ''; }).join('')}
          <p class="vg-note">Soldiers are tough and smash walls; Archers shoot over them from 3 squares. Tap − to let one go to make room (no coins back).</p></div>`;
      }
      if (busy) h += `<div class="vg-row"><div class="vg-txt"><b>Upgrading to level ${v.building.lvl}</b>${dur(v.building.done - S.now)} left. It keeps working at level ${l} until then.</div></div>`;
      else if (next) h += offer({ kind: 'vup', item: id }, `Level ${l + 1}`, `${esc(b.job(l + 1))}. Takes ${V.BUILD_H[l + 1]} hour${V.BUILD_H[l + 1] > 1 ? 's' : ''}.`);
      else h += `<p class="vg-sub">Top level.</p>`;
      return h;
    }
    if (id === 'oak') return `<h3>Old oak</h3><p class="vg-sub">Your tree, at the same stage as on the board. Its coins now land in your Bank when they ripen.</p>
      <div class="vg-row"><div class="vg-txt"><b>Look after it</b>Water and grow it from your coins, like before.</div><button class="vg-btn vg-blue" data-a="tree">Open</button></div>`;
    if (id === 'trophy') return `<h3>Trophy hall</h3><p class="vg-sub">${S.titles} cup${S.titles > 1 ? 's' : ''} won. Every title adds to it.</p>`;
    const won = id === 'boot' ? S.boot : S.glove, what = id === 'boot' ? 'Score the most goals in a cup' : 'Concede the fewest per match in a cup, drafted as a defender';
    return `<h3>${NAMES[id]}</h3><p class="vg-sub">${won ? `Won ${won} time${won > 1 ? 's' : ''}.` : `Locked. ${what} to unlock it.`}</p>`;
  }
  // every screen in one list: tapping buildings on a phone can be fiddly
  function townList() {
    const rows = [...TOWN.map(t => [t.go, t.name, { arena: 'The Cup: draft, groups, knockout', games: 'Challenges: open or join a game', hall: 'Hall of Fame, Players, Badges', market: 'Power-ups, colours, extra games', track: 'This month’s track', toss: 'Match Toss and how it works' }[t.go], (S.town || {})[t.id]]),
      ['coins', 'Bank', 'Your coins, history, gifts and bounties'], ['profile', 'Clubhouse', 'Your profile, notifications, Classic view']];
    return `<h3>Town</h3><p class="vg-sub">Everything in the app, one tap away.</p>` + rows.map(([go, name, what, note]) =>
      `<button class="vg-row vg-golink" data-a="go" data-go="${go}"><div class="vg-txt"><b>${esc(name)}${note ? ` <span class="vg-tag">${esc(note)}</span>` : ''}</b>${esc(what)}</div><span class="vg-arrow">›</span></button>`).join('');
  }
  function raidList() {
    const v = S.v;
    let h = `<h3>Raid</h3><p class="vg-sub">${v.tickets} ticket${v.tickets === 1 ? '' : 's'} and ${V.armyN(v)} troops. Each real win earns a ticket; train troops in the Barracks. Look at anyone for free.</p>`;
    for (const o of S.others) h += `<div class="vg-row vg-pl"><div class="vg-txt"><b>${esc(o.name)}</b>Clubhouse ${o.lvl} · up to ${o.loot} coins${o.no ? `<div class="vg-why">${esc(why(o))}</div>` : ''}</div>
      <button class="vg-btn vg-blue" data-a="look" data-n="${esc(o.name)}">Look</button></div>`;
    return h;
  }
  function raidLog() {
    let h = `<h3>Raid log</h3>`;
    const rs = S.raids.slice().reverse();
    if (!rs.length) h += `<p class="vg-sub">No raids yet, by you or on you.</p>`;
    for (const r of rs) {
      const mine = r.by === S.me, ago = dur(S.now - r.at) + ' ago';
      const what = mine ? `You raided ${esc(r.on)}` : `${esc(r.by)} raided you`;
      const res = r.done ? `${stars(r.res.stars)} · ${Math.round(r.res.pct * 100)}% · ${mine ? '+' : '−'}${r.loot} coins` : 'Still settling…';
      h += `<div class="vg-row vg-pl"><div class="vg-txt"><b>${what}</b><span class="vg-stars" style="font-size:14px;color:#e09a10">${res}</span> · ${ago}</div>
        ${r.done ? `<button class="vg-btn vg-blue" data-a="replay" data-id="${esc(r.id)}">Replay</button>` : ''}</div>`;
      if (!mine && r.done) h += `<div class="vg-row" style="gap:8px;margin-top:-6px"><button class="vg-btn vg-red" data-a="look" data-n="${esc(r.by)}">Raid back</button><button class="vg-btn vg-gold" data-a="games">Challenge at the table</button></div>`;
    }
    return h;
  }
  function resultCard() {
    const r = fx.res, theirs = fx.replay && fx.on === S.me;
    return `<div class="vg-res"><h3>${fx.live ? 'Raid over' : theirs ? `${esc(fx.by)} raided you` : 'Replay'}</h3><div class="vg-stars">${stars(r.stars)}</div>
      <p class="vg-sub">${Math.round(r.pct * 100)}% destroyed · ${theirs ? 'they took' : ''} ${fx.loot} coin${fx.loot === 1 ? '' : 's'}${fx.live ? '. They land in your balance within a minute and a half.' : ''}</p>
      ${theirs ? `<div class="vg-row" style="gap:8px"><button class="vg-btn vg-red" data-a="look" data-n="${esc(fx.by)}">Raid back</button><button class="vg-btn vg-gold" data-a="games">Challenge at the table</button></div>` : ''}
      <button class="vg-btn vg-green" data-a="home" style="width:100%">Back home</button></div>`;
  }
  function buildList() {
    let h = `<h3>Build</h3><p class="vg-sub">New buildings land in a free spot. Move them where you like.</p>`;
    for (const id of ['mine', 'stadium', 'barracks', 'cannon', 'tower', 'cannon2', 'tower2']) {
      if ((id === 'cannon2' && !S.v.lvl.cannon) || (id === 'tower2' && !S.v.lvl.tower)) continue;
      const b = V.B[id], z = V.size(id);
      if (S.v.lvl[id]) { h += `<div class="vg-row"><div class="vg-txt"><b>${b.name}${id.endsWith('2') ? ' (second)' : ''}</b>Built · level ${S.v.lvl[id]}. Tap it to upgrade.</div></div>`; continue; }
      h += offer({ kind: 'vbuild', item: id }, b.name, `${esc(b.job(1))}. Takes ${z.w}×${z.d}.`);
    }
    return h + `<div class="vg-row"><div class="vg-txt"><b>Wall pieces</b>${S.v.pieces} owned. Lay them in Edit, with Walls.</div><button class="vg-btn vg-gold" data-a="buywall">Buy 5 · ${coin}5</button></div>`;
  }

  /* ---------- fights: a live raid or a replay ----------
     Both run village.js's own battle, one 100 ms tick at a time against the
     clock, so what you watch is exactly what the walk settles. */
  const charCache = {};
  const CHAR = { b: 'mini-arena/character-soldier', a: 'mini-forest/character-archer' };
  const ARMS = { 'mini-arena/character-soldier': 'mini-dungeon/weapon-sword', 'mini-forest/character-archer': 'mini-forest/weapon-bow' };
  const loadChar = p => charCache[p] || (charCache[p] = new Promise((res, rej) => loader.load(`models/${p}.glb`, async g => {
    g.scene.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const b = new THREE.Box3().setFromObject(g.scene);
    g.H = b.max.y - b.min.y; g.k = .8 / g.H;
    g.weapon = ARMS[p] ? await load(ARMS[p]).catch(() => null) : null;
    res(g);
  }, undefined, rej)));
  /* A fresh copy of a character with its weapon in the right hand: a sword for
     the Soldier, a bow for the Archer. The arm bone hangs from the shoulder and
     the hand is about a sixth of the height below it. */
  function rigged(g) {
    const o = cloneRig(g.scene), arm = o.getObjectByName('arm-right');
    if (g.weapon && arm) {
      const w = g.weapon.clone(true), H = g.H, k = H / .55, hand = -H * .17, bow = /bow/.test(g.weapon.userData.src || '') || !!g.weapon.getObjectByName('weapon-bow');
      w.traverse(m => { if (m.isMesh) m.castShadow = true; });
      w.scale.setScalar(k * (bow ? .75 : .65));
      if (bow) { w.position.set(-H * .02, hand - H * .1, H * .06); w.rotation.set(0, -Math.PI / 2, 0); }
      else { w.position.set(0, hand, H * .04); w.rotation.set(Math.PI / 2.4, 0, 0); }
      arm.add(w);
    }
    return o;
  }
  const fightGroup = new THREE.Group(); scene.add(fightGroup);
  const redTex = document.createElement('canvas'); redTex.width = redTex.height = 400;
  const red = new THREE.Mesh(new THREE.PlaneGeometry(V.GRID, V.GRID), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: new THREE.CanvasTexture(redTex) }));
  red.rotation.x = -Math.PI / 2; red.position.y = G + .015; red.visible = false; scene.add(red);
  // the cells a drop can't land on, tinted red
  function redZone(inp) {
    const c = redTex.getContext('2d'), k = redTex.width / V.GRID;
    c.clearRect(0, 0, redTex.width, redTex.height); c.fillStyle = 'rgba(255,60,40,.32)';
    for (let x = 0; x < V.GRID; x++) for (let z = 0; z < V.GRID; z++) if (!V.canDrop(inp, x + .5, z + .5)) c.fillRect(x * k, z * k, k, k);
    red.material.map.needsUpdate = true; red.visible = true;
  }
  const W3 = (x, z, y = G) => new THREE.Vector3(x - HALF, y, z - HALF);
  function startFight(f) {
    fx = Object.assign(f, { sim: V.battle(f.input), t0: performance.now(), speed: 1, meshes: [], prev: [], shots: [], rubble: {}, walls: f.input.walls.slice(), ended: false });
    sheet = null; editing = null; grid.visible = false;
    for (const g of Object.values(groups)) g.g.visible = true;
    target.set(0, 0, 1); aim();
    if (f.live) redZone(f.input); else red.visible = false;
    sync(); paintHud();
  }
  function leaveFight(to = 'home') {
    fightGroup.clear(); fx = null; red.visible = false; mode = to; sheet = null; wallSig = '';
    for (const g of Object.values(groups)) g.g.visible = true;
    target.set(0, 0, 1); aim(); sync(); paintHud();
  }
  function endFight() {
    if (fx.ended) return;
    fx.ended = true; fx.res = fx.sim.result();
    fx.loot = Math.floor(fx.loot0 * fx.res.bank);
    sheet = { kind: 'result' }; paintHud();
  }
  // one tick forward, keeping where everyone was for smooth drawing between ticks
  function stepFight() {
    const sim = fx.sim;
    if (fx.replay) while (fx.di < fx.drops.length && fx.drops[fx.di].t <= sim.tick * V.TICK) { const d = fx.drops[fx.di++]; sim.drop(d.u, d.x, d.z); }
    if (sim.over()) return false;
    fx.prev = sim.units.map(u => [u.x, u.z]);
    sim.step();
    for (const sh of sim.shots) shoot(sh);
    return true;
  }
  const ball = new THREE.SphereGeometry(.13, 10, 8), arrowG = new THREE.BoxGeometry(.05, .05, .5);
  const ballM = new THREE.MeshStandardMaterial({ color: '#222' }), arrowM = new THREE.MeshStandardMaterial({ color: '#7a4b2a' });
  function shoot(sh) {
    let from, to, m;
    if (sh.from.def) { // a defence at an attacker
      from = W3(sh.from.cx, sh.from.cz, G + 1.4); to = W3(sh.to.x, sh.to.z, G + .4);
      m = new THREE.Mesh(sh.from.def.kind === 'cannon' ? ball : arrowG, sh.from.def.kind === 'cannon' ? ballM : arrowM);
    } else if (sh.from.u === 'a' && sh.to) { // an archer at a building
      from = W3(sh.from.x, sh.from.z, G + .5); to = W3(sh.to.cx, sh.to.cz, G + .8); m = new THREE.Mesh(arrowG, arrowM);
    } else return; // a Soldier's punch needs no flight
    m.position.copy(from); m.lookAt(to); fightGroup.add(m);
    fx.shots.push({ m, from, to, at: performance.now(), dur: sh.from.def && sh.from.def.kind === 'cannon' ? 260 : 180 });
  }
  function drawFight(now) {
    const sim = fx.sim, a = Math.min(1, Math.max(0, (now - fx.t0) / V.TICK * fx.speed - sim.tick + 1));
    // the attackers: a model each, walking, hitting or falling
    sim.units.forEach((u, i) => {
      let m = fx.meshes[i];
      if (!m) {
        m = fx.meshes[i] = { o: new THREE.Group(), ready: false };
        fightGroup.add(m.o);
        loadChar(CHAR[u.u]).then(g => {
          const c = rigged(g); c.scale.setScalar(g.k); m.o.add(c);
          m.mixer = new THREE.AnimationMixer(c);
          const clip = n => THREE.AnimationClip.findByName(g.animations, n);
          m.acts = { walk: clip('walk'), hit: clip(u.u === 'a' ? 'holding-right-shoot' : 'attack-melee-right'), die: clip('die') };
          m.ready = true;
        }).catch(() => {});
      }
      const p = fx.prev[i] || [u.x, u.z], x = p[0] + (u.x - p[0]) * a, z = p[1] + (u.z - p[1]) * a;
      m.o.position.copy(W3(x, z));
      const look = u.t ? W3(u.t.cx, u.t.cz) : W3(u.x, u.z);
      if (u.hp > 0 && (look.x !== m.o.position.x || look.z !== m.o.position.z)) m.o.rotation.y = Math.atan2(look.x - m.o.position.x, look.z - m.o.position.z);
      const want = u.hp <= 0 ? 'die' : (p[0] !== u.x || p[1] !== u.z) ? 'walk' : 'hit';
      if (m.ready && m.state !== want && m.acts[want]) {
        m.mixer.stopAllAction();
        const act = m.mixer.clipAction(m.acts[want]);
        if (want === 'die') { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; m.gone = now + 1400; }
        act.play(); m.state = want;
      }
      if (m.gone && now > m.gone) m.o.visible = false;
    });
    // flying cannonballs and arrows
    fx.shots = fx.shots.filter(sh => {
      const k = (now - sh.at) / sh.dur;
      if (k >= 1) { fightGroup.remove(sh.m); return false; }
      sh.m.position.lerpVectors(sh.from, sh.to, k); sh.m.position.y += Math.sin(k * Math.PI) * (sh.dur > 200 ? .8 : .25);
      return true;
    });
    // buildings that fell become rubble; walls that broke come down
    for (const b of sim.bs) if (b.hp <= 0 && !fx.rubble[b.id] && groups[b.id]) {
      groups[b.id].g.visible = false;
      const r = new THREE.Group(); r.position.copy(W3(b.cx, b.cz));
      box(b.w * .8, .18, b.d * .8, '#6b5a4a', 0, G, 0, r);
      for (let k = 0; k < 4; k++) box(.35, .25, .3, k % 2 ? '#8b8178' : '#5a4e44', (k % 2 - .5) * b.w * .4, G + .15, ((k >> 1) - .5) * b.d * .4, r);
      fightGroup.add(r); fx.rubble[b.id] = r;
    }
    const alive = [...sim.walls].filter(([, hp]) => hp > 0).map(([k]) => k);
    if (alive.length !== fx.walls.length) { fx.walls = alive; drawWalls(alive, fx.input.lvl.wall); }
  }
  // health bars over hurt buildings and over every attacker still standing
  function paintBars() {
    const W = root.clientWidth, H = root.clientHeight, out = [], sim = fx.sim;
    const at = (v, cls, frac) => {
      v.project(cam);
      out.push(`<div class="vg-hp ${cls}" style="left:${(v.x + 1) / 2 * W}px;top:${(1 - v.y) / 2 * H}px"><i style="width:${Math.max(0, frac) * 100}%"></i></div>`);
    };
    for (const b of sim.bs) if (b.hp > 0 && b.hp < b.max) at(W3(b.cx, b.cz, G + 2.2), 'foe big', b.hp / b.max);
    // a wall piece being broken shows how much it has left
    for (const [k, hp] of sim.walls) if (hp > 0 && hp < sim.wallHp) { const [x, z] = k.split('_').map(Number); at(W3(x + .5, z + .5, G + 1.25), 'foe', hp / sim.wallHp); }
    sim.units.forEach((u, i) => { if (u.hp > 0 && fx.meshes[i]) at(fx.meshes[i].o.position.clone().setY(G + 1.1), '', u.hp / V.UNITS[u.u].hp); });
    labs.innerHTML = out.join('');
  }
  const stars = n => '★'.repeat(n) + `<i>${'★'.repeat(3 - n)}</i>`;

  /* ---------- your army, standing round the Barracks ----------
     Each trained attacker is there in person, idling in rings round the tent,
     so the crowd grows as you train. Only at home: a raid has its own. */
  const camp = new THREE.Group(); scene.add(camp);
  let campSig = '', campMix = [];
  async function drawCamp(pos) {
    const p = mode === 'home' && !fx && pos.barracks, army = S.v.army;
    const sig = p ? JSON.stringify([p, army]) : '';
    if (sig === campSig) return;
    campSig = sig; camp.clear(); campMix = [];
    if (!p) return;
    const c = center('barracks', p), list = [...Array(army.b).fill('b'), ...Array(army.a).fill('a')];
    const gs = await Promise.all(['b', 'a'].map(u => loadChar(CHAR[u]).catch(() => null)));
    if (campSig !== sig) return; // something newer started meanwhile
    list.forEach((u, i) => {
      const g = gs[u === 'b' ? 0 : 1]; if (!g) return;
      const o = rigged(g); o.scale.setScalar(g.k * 1.15);
      // rings round the tent, front side first
      const ring = Math.floor(i / 10), k = i % 10, a = Math.PI / 4 + (k - 4.5) * .34 + (ring % 2) * .17, r = 1.95 + ring * .6;
      o.position.set(c.x + Math.cos(a) * r, G, c.z + Math.sin(a) * r);
      o.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI * .9;
      camp.add(o);
      const m = new THREE.AnimationMixer(o), idle = THREE.AnimationClip.findByName(g.animations, 'idle');
      if (idle) { const act = m.clipAction(idle); act.time = (i * .37) % 1; act.play(); }
      campMix.push(m);
    });
  }
  /* A picture of each attacker for the popup and the Army line: the same model,
     drawn once into a small image by a renderer of its own. */
  const portraits = {};
  let shooter = null;
  function portrait(u) {
    if (portraits[u] !== undefined) return portraits[u];
    portraits[u] = null;
    loadChar(CHAR[u]).then(g => {
      if (!shooter) {
        shooter = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        shooter.setSize(160, 160); shooter.outputColorSpace = THREE.SRGBColorSpace;
      }
      const sc = new THREE.Scene(), o = rigged(g);
      sc.add(new THREE.HemisphereLight(0xffffff, 0x667755, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 3, 4); sc.add(sun);
      const b = new THREE.Box3().setFromObject(o), h = b.max.y - b.min.y, cy = (b.max.y + b.min.y) / 2;
      const cm = new THREE.PerspectiveCamera(30, 1, .01, 100); cm.position.set(h * .9, cy + h * .25, h * 2.1); cm.lookAt(0, cy, 0);
      sc.add(o); shooter.render(sc, cm);
      portraits[u] = shooter.domElement.toDataURL('image/png');
      paintHud();
    }).catch(() => {});
    return null;
  }
  const face = (u, cls = '') => { const src = portrait(u); return src ? `<img class="vg-face ${cls}" src="${src}" alt="">` : `<span class="vg-face ${cls}"></span>`; };

  /* ---------- labels over the buildings ---------- */
  const v3 = new THREE.Vector3();
  function paintLabels() {
    if (editing) { labs.innerHTML = ''; return; }
    if (fx) return paintBars();
    const W = root.clientWidth, H = root.clientHeight, out = [], d = D();
    for (const [id, { g }] of Object.entries(groups)) {
      const b = new THREE.Box3().setFromObject(g);
      v3.set((b.min.x + b.max.x) / 2, b.max.y + .3, (b.min.z + b.max.z) / 2).project(cam);
      const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H;
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) continue;
      if (d.ghosts.includes(id)) continue; // a ghost needs no name till it's won
      const lvl = V.B[id] ? `Level ${d.lvl[id]}` : id === 'oak' ? ['Sapling', 'Young tree', 'Tree', 'Old oak'][d.x.tree?.stage ?? 3]
        : id === 'trophy' ? `${d.x.titles} cup${d.x.titles > 1 ? 's' : ''}` : 'Won';
      // bubbles stack up from the building, and the name rides above them
      let top = y - 2;
      if (id === 'bank' && mode === 'home') {
        const n = Math.floor(S.v.bank), full = S.v.bank >= V.cap(S.v);
        out.push(`<div class="vg-bub ${full ? 'full' : ''}" style="left:${x}px;top:${top}px">${coin}${n}/${V.cap(S.v)}</div>`);
        top -= 46;
      }
      const up = mode === 'home' && S.v.building && S.v.building.item === id ? S.v.building : null;
      if (up) { // the upgrade's countdown, with a bar that fills as it goes
        const now = Date.now(), pc = Math.min(100, Math.max(0, (now - up.at) / (up.done - up.at) * 100));
        out.push(`<div class="vg-bub vg-timer" style="left:${x}px;top:${top}px"><span>${svg('hammer')}${clock(up.done - now)}</span><i><b style="width:${pc}%"></b></i></div>`);
        top -= 58;
      }
      out.push(`<div class="vg-lab" style="left:${x}px;top:${top === y - 2 ? y : top}px">${NAMES[id]}<small>${up ? `Level ${d.lvl[id]} → ${up.lvl}` : lvl}</small></div>`);
    }
    if (mode === 'home') for (const t of TOWN) {
      const g = town[t.id]; if (!g) continue;
      const b = new THREE.Box3().setFromObject(g);
      v3.set(t.x, b.max.y + .3, t.z).project(cam);
      const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H;
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
      const note = (S.town || {})[t.id];
      if (note) out.push(`<div class="vg-bub" style="left:${x}px;top:${y - 2}px">${esc(note)}</div>`);
      out.push(`<div class="vg-lab vg-town" style="left:${x}px;top:${note ? y - 40 : y}px">${esc(t.name)}</div>`);
    }
    labs.innerHTML = out.join('');
  }

  /* ---------- the tour ----------
     A guided first run: the screen dims except one spotlit thing, a bubble says
     what to do, and each step waits for it to be done (or a Next). A step
     already done is passed over, so it fits whatever the player has. Progress
     is kept per phone; ? in the top bar starts it again. */
  const q = sel => () => root.querySelector(sel);
  const groupRect = id => () => {
    const g = groups[id] && groups[id].g; if (!g || !g.visible) return null;
    const b = new THREE.Box3().setFromObject(g), r = cv.getBoundingClientRect(), pts = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const v = new THREE.Vector3(x, y, z).project(cam); pts.push([(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]);
    }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  };
  const built = id => !!S.v.lvl[id];
  // placed: it's in a layout the player saved, so the step waits out the second before Edit opens
  const placed = id => !editing && !!(S.saved && S.saved.layout && S.saved.layout[id]);
  const TOUR = [
    { t: 'Welcome to your village', x: 'Build it up, fill your Bank with coins, then raid your colleagues for theirs. Let’s go.', next: 'Start' },
    { t: 'Build', x: 'Tap Build.', at: q('[data-a="build"]'), done: () => built('mine') || (sheet && sheet.kind === 'build') },
    { t: 'A Gold mine', x: 'It fills your Bank with coins on workdays, 9 to 6. Build one.', at: q('[data-a="buy"][data-id="mine"]'), back: q('[data-a="build"]'), done: () => built('mine'), need: 15 },
    { t: 'Put it somewhere', x: 'Drag it where you like, then tap Save.', at: q('[data-a="save"]'), back: q('[data-a="edit"]'), done: () => placed('mine') },
    { t: 'Your Bank', x: 'Coins collect here. Tap Collect (bottom left) when there are some. Anything left in the Bank can be raided.', at: q('.vg-bub'), next: 'Got it' },
    { t: 'Now an army', x: 'Tap Build again.', at: q('[data-a="build"]'), done: () => built('barracks') || (sheet && sheet.kind === 'build'), raid: true },
    { t: 'A Barracks', x: 'It trains your army. Build one.', at: q('[data-a="buy"][data-id="barracks"]'), back: q('[data-a="build"]'), done: () => built('barracks'), need: 25 },
    { t: 'Put it somewhere', x: 'Drag it where you like, then tap Save.', at: q('[data-a="save"]'), back: q('[data-a="edit"]'), done: () => placed('barracks') },
    { t: 'Open your Barracks', x: 'Tap it, or tap the Army line at the top.', at: groupRect('barracks'), done: () => (sheet && sheet.id === 'barracks') || S.v.training || V.armyN(S.v) > 0 },
    { t: 'Train', x: 'Train 5 Soldiers. A batch takes 2 minutes, and the Army line at the top counts it down.', at: q('[data-a="train"][data-u="b"]'), back: q('[data-a="army"]'), done: () => !!S.v.training || V.armyN(S.v) > 0, need: 2 },
    { t: 'Raid', x: 'Each real game you win gives a raid ticket (●). With an army ready: tap Raid, Look at a colleague, then Attack and tap round the edge of their village.', at: q('[data-a="raids"]'), next: 'Got it' },
    { t: 'Defend', x: 'They can raid you too. A Cannon guards your Bank: Build → Cannon. Happy raiding!', at: q('[data-a="build"]'), next: 'Finish' },
  ];
  let tourAt = null; // the step showing, or null when done
  try {
    const kept = localStorage.getItem('vgTour');
    // part 1's welcome already seen: only the raid steps are new
    tourAt = kept === 'done' ? null : kept != null ? +kept : localStorage.getItem('vgIntro') ? TOUR.findIndex(x => x.raid) : 0;
  } catch { tourAt = 0; }
  const keepTour = () => { try { localStorage.setItem('vgTour', tourAt == null ? 'done' : String(tourAt)); } catch {} };
  const tourTo = n => { tourAt = n >= TOUR.length ? null : n; keepTour(); };
  const tour = document.createElement('div'); tour.className = 'vg-tour'; hud.append(tour);
  let tourSig = '';
  function paintTour() {
    // passed over: anything already done, and no tour away from home or in a popup it doesn't point into
    while (tourAt != null && TOUR[tourAt].done && TOUR[tourAt].done()) tourTo(tourAt + 1);
    const st = tourAt != null && mode === 'home' && !fx && TOUR[tourAt];
    if (!st) { if (tourSig) { tour.innerHTML = ''; tourSig = ''; } return; }
    const el = (st.at && st.at()) || (st.back && st.back()), r = el && (el.getBoundingClientRect ? el.getBoundingClientRect() : el);
    const W = root.clientWidth, H = root.clientHeight, short = st.need && S.bal < st.need;
    const x = short ? `You need ${st.need} coins for this. Win a game or two, then come back.` : st.x;
    const pad = 6, spot = r && r.right > r.left ? { l: r.left - pad, t: r.top - pad, w: r.right - r.left + pad * 2, h: r.bottom - r.top + pad * 2 } : null;
    const bw = Math.min(320, W - 24), below = !spot || spot.t + spot.h / 2 < H / 2;
    const bl = Math.max(12, Math.min(W - bw - 12, spot ? spot.l + spot.w / 2 - bw / 2 : (W - bw) / 2));
    const pos = !spot ? `top:${H / 2 - 90}px` : below ? `top:${spot.t + spot.h + 14}px` : `bottom:${H - spot.t + 14}px`;
    const sig = JSON.stringify([tourAt, x, spot && [spot.l, spot.t, spot.w, spot.h].map(Math.round), pos, bl]);
    if (sig === tourSig) return;
    const fresh = !tourSig.startsWith('[' + tourAt + ',');
    tourSig = sig;
    const bubble = `<div class="vg-tb" style="left:${bl}px;width:${bw}px;${pos}${fresh ? '' : ';animation:none'}">
      <b class="vg-th">${esc(st.t)}</b>${esc(x)}
      <div class="vg-tf"><button class="vg-skip" data-a="tskip">Skip tour</button><span class="vg-tn">${tourAt + 1}/${TOUR.length}</span>
      ${st.next ? `<button class="vg-btn vg-green" data-a="tnext">${esc(st.next)}</button>` : short ? `<button class="vg-btn vg-grey" data-a="tnext">Skip step</button>` : ''}</div></div>`;
    tour.innerHTML = (spot ? `<div class="vg-spot" style="left:${spot.l}px;top:${spot.t}px;width:${spot.w}px;height:${spot.h}px"></div>` : '<div class="vg-dim"></div>') + bubble;
  }

  /* ---------- no 3D: the same buttons as a list ---------- */
  function paintList() {
    root.querySelector('.vg-load')?.remove();
    let el = root.querySelector('.vg-list');
    if (!el) { el = document.createElement('div'); el.className = 'vg-list vg-sheet'; el.style.cssText = 'position:absolute;inset:70px 0 0;width:auto;max-height:none;transform:none;border-radius:0;border-width:3px 0 0;box-shadow:none;animation:none'; hud.append(el); }
    el.innerHTML = has().map(id => about(id)).join('<hr style="border:0;border-top:2px solid #ead9b8;margin:14px 0">') + buildList();
  }

  /* ---------- loop ---------- */
  let lastFrame = performance.now();
  function frame() {
    if (!open) return;
    const now = performance.now(), dt = (now - lastFrame) / 1000; lastFrame = now;
    if (fx) {
      const want = fx.skip ? Infinity : Math.floor((now - fx.t0) / V.TICK * fx.speed);
      let n = 0;
      while (fx.sim.tick < want && n++ < 700 && stepFight());
      if (fx.sim.over() && !fx.ended) endFight();
      drawFight(now);
      fx.meshes.forEach(m => m.mixer && m.mixer.update(dt));
      if (!fx.ended) paintRaidTop();
    }
    for (const { g } of Object.values(groups)) if (g.userData.spin) g.userData.spin.rotation.y += dt * 1.6;
    campMix.forEach(m => m.update(dt));
    R.render(scene, cam); paintLabels(); paintTour();
    requestAnimationFrame(frame);
  }
  const tick = setInterval(() => update(), 1000);
  function update() {
    if (!open) return;
    const n = api.state();
    if (!n) return api.close();
    S = n;
    if (!R) { paintHud(); return paintList(); }
    if (!drag) sync();
    paintHud();
  }
  window.addEventListener('resize', resize);
  if (R) { resize(); aim(); sync(); requestAnimationFrame(frame); }
  paintHud();
  if (!R) paintList();

  return {
    update,
    log() { if (fx) leaveFight(); mode = 'home'; openSheet({ kind: 'log' }); },
    show() { open = true; S = api.state() || S; if (R) { resize(); sync(); requestAnimationFrame(frame); } paintHud(); },
    hide() { open = false; editing = null; sheet = null; grid.visible = false; foot.visible = false; },
    destroy() { open = false; clearInterval(tick); window.removeEventListener('resize', resize); R && R.dispose(); },
  };
}
