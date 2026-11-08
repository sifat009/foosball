/* Penalty duels: the 3D screen. Loaded the first time a duel opens, so nobody
   who never plays downloads three.js or a model. The rules are duel.js's; this
   only draws a duel and turns taps into writes through `api` (see index.html,
   openDuel).
   The look: a front-on goal at night, a hexagon net, three see-through balls to
   aim at, and a real keeper. models/keeper.glb is Mixamo's "Shannon" with four
   of its motions (idle, dive-left, dive-right, catch-high), its textures shrunk
   to 1k; his kit is tinted to whoever is in goal. Everything else is built here.
   Sounds, in sounds/: the whistle is SpliceSound's (CC0, Wikimedia Commons), the
   crowd's "ooh" is CC0 from OpenGameArt; the cheer is Gregor Quendel's "Free Crowd
   Cheering Sounds" (CC-BY 4.0) and the kick and glove are from CGEffex's "Punch,
   slap, n' kick" (CC-BY 3.0, freesound.org/people/CGEffex/sounds/98341). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const D = globalThis.DUEL;
const ME = '#3f7fd0', THEM = '#d64545';
const GZ = 0, GW = 3.2, GH = 2.05, DEPTH = .9; // the goal line, the mouth, how deep the net runs
const BR = .15; // the ball's radius: wherever it rests, it rests on the grass
const TARGETS = { L: [-GW / 2 + .45, GH - .5], M: [0, GH - .44], R: [GW / 2 - .45, GH - .5] };
const KEEPER_SCALE = .0085; // Mixamo works in centimetres
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const coin = '<span class="dl-coin" aria-hidden="true"></span>';

const CSS = `
#duel { position: fixed; top: 0; bottom: 0; left: 50%; width: min(100%, 480px); transform: translateX(-50%); box-shadow: 0 0 0 100vmax rgba(11,18,32,.88); z-index: 200; display: none; background: #1b2740; overflow: hidden; user-select: none; -webkit-user-select: none; touch-action: manipulation; font-family: Inter, system-ui, sans-serif; color: #fff; }
#duel.open { display: block; }
#duel canvas { display: block; width: 100%; height: 100%; }
.dl-hud { position: absolute; inset: 0; pointer-events: none; }
.dl-hud > * { pointer-events: auto; }
.dl-ts { text-shadow: 0 2px 0 #1b1b1b, 0 0 3px #1b1b1b; }
.dl-coin { display: inline-block; width: 1.05em; height: 1.05em; border-radius: 50%; vertical-align: -0.18em; background: radial-gradient(circle at 35% 35%, #fff3a6, #f5c400 45%, #b98a00); box-shadow: 0 0 0 2px #7a5a00; }
.dl-top { position: absolute; top: calc(12px + env(safe-area-inset-top)); left: 12px; right: 12px; display: flex; gap: 8px; align-items: center; }
.dl-pill { background: rgba(0,0,0,.55); border-radius: 14px; padding: 7px 12px; font-weight: 800; font-size: 15px; display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.dl-top .dl-pill:first-of-type { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dl-x { width: 42px; height: 42px; border-radius: 14px; border: 3px solid #1b1b1b; background: linear-gradient(#ff7a6b, #c62d2d); color: #fff; font: 900 20px system-ui; box-shadow: 0 3px 0 #1b1b1b; cursor: pointer; flex: none; }
.dl-vs { position: absolute; left: 12px; right: 12px; top: calc(66px + env(safe-area-inset-top)); background: rgba(0,0,0,.5); border-radius: 16px; padding: 8px 12px; }
.dl-row { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: 15px; margin: 3px 0; }
.dl-av { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; flex: none; }
.dl-row > span:nth-child(2) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-dots { margin-left: auto; display: flex; gap: 5px; flex: none; }
.dl-dots i { width: 19px; height: 19px; border-radius: 50%; background: rgba(255,255,255,.15); border: 2px solid rgba(255,255,255,.35); display: grid; place-items: center; font: 900 11px system-ui; font-style: normal; }
.dl-dots .g { background: #3ec43e; border-color: #fff; }
.dl-dots .m { background: #d64545; border-color: #fff; }
.dl-hint { position: absolute; left: 16px; right: 16px; text-align: center; font-weight: 800; font-size: 19px; line-height: 1.3; pointer-events: none; }
.dl-hint small { display: block; font-size: 14px; font-weight: 600; color: #ffe27a; margin-top: 4px; }
.dl-three { position: absolute; left: 14px; right: 14px; bottom: calc(30px + env(safe-area-inset-bottom)); display: flex; gap: 10px; }
.dl-three button { flex: 1; height: 82px; border-radius: 18px; background: linear-gradient(#5aa9ff, #2f6fd0); border: 3px solid #10233f; box-shadow: 0 6px 0 #10233f; color: #fff; font: 800 18px Inter, system-ui; text-shadow: 0 2px 0 #10233f; cursor: pointer; }
.dl-three button span { display: block; font-size: 26px; line-height: 1.1; }
.dl-three button:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 3px 0 #10233f; }
.dl-three button:disabled { opacity: .45; }
.dl-banner { position: absolute; left: 0; right: 0; top: 34%; text-align: center; font: 400 68px Anton, Impact, sans-serif; color: #ffd84d; transform: rotate(-6deg); pointer-events: none; animation: dl-pop .35s cubic-bezier(.2,1.6,.4,1); }
.dl-banner.save { color: #8fe08f; }
@keyframes dl-pop { from { transform: rotate(-6deg) scale(.3); opacity: 0; } }
.dl-line { position: absolute; left: 16px; right: 16px; bottom: calc(130px + env(safe-area-inset-bottom)); text-align: center; font-weight: 800; font-size: 17px; pointer-events: none; }
.dl-dim { position: absolute; inset: 0; background: rgba(11,18,32,.72); }
.dl-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(360px, calc(100% - 40px)); max-height: calc(100% - 40px); overflow: auto; box-sizing: border-box; background: #fff8ea; color: #2a1d14; border: 3px solid #2a1d14; border-radius: 24px; padding: 22px 20px 18px; text-align: center; box-shadow: 0 8px 0 #2a1d14; }
.dl-card h2 { margin: 0; font: 400 32px Anton, Impact, sans-serif; letter-spacing: .02em; color: #1f8a3b; }
.dl-card h2.lose { color: #b3261e; } .dl-card h2.even { color: #2a1d14; }
.dl-card .dl-score { font: 400 52px Anton, Impact, sans-serif; margin: 4px 0 0; }
.dl-card .who { display: flex; justify-content: space-around; font-size: 15px; font-weight: 700; color: #6b5a48; }
.dl-card p { font-size: 15px; line-height: 1.45; margin: 12px 0 0; }
.dl-prize { margin: 14px auto 4px; display: inline-flex; gap: 8px; align-items: center; background: #fff1b8; border: 2.5px solid #2a1d14; border-radius: 14px; padding: 7px 16px; font-weight: 900; font-size: 21px; }
.dl-btn { display: block; width: 100%; margin-top: 12px; min-height: 52px; border-radius: 16px; border: 3px solid #2a1d14; box-shadow: 0 5px 0 #2a1d14; font: 800 18px Inter, system-ui; cursor: pointer; background: #fff; color: #2a1d14; }
.dl-btn.y { background: linear-gradient(#ffd84d, #f5b400); }
.dl-btn.g { background: linear-gradient(#5fd35f, #2fa52f); color: #fff; text-shadow: 0 2px 0 #1b1b1b; }
.dl-btn.q { box-shadow: none; border: 0; min-height: 40px; background: none; color: #6b5a48; font-weight: 700; text-decoration: underline; }
.dl-btn:disabled { opacity: .5; cursor: default; }
.dl-note { font-size: 13px; color: #6b5a48; margin-top: 10px; }
.dl-q { background: linear-gradient(#5aa9ff, #2f6fd0); }
.dl-role { top: calc(150px + env(safe-area-inset-top)); font: 400 34px Anton, Impact, sans-serif; letter-spacing: .03em; }
.dl-role small { font-family: Inter, system-ui, sans-serif; }
.dl-ring { position: absolute; right: 18px; bottom: calc(24px + env(safe-area-inset-bottom)); width: 58px; height: 58px; border-radius: 50%; border: 4px solid #ffd84d; background: rgba(0,0,0,.5); display: grid; place-items: center; font: 400 28px Anton, Impact, sans-serif; color: #ffd84d; pointer-events: none; }
.dl-ring:empty { display: none; }
.dl-ring.up { bottom: calc(126px + env(safe-area-inset-bottom)); }
.dl-tgt { position: absolute; border: 0; padding: 0; border-radius: 50%; background: none; cursor: pointer; transform: translate(-50%, -50%); }
.dl-tgt:active { transform: translate(-50%, -50%) scale(.94); }
.dl-locked { bottom: calc(60px + env(safe-area-inset-bottom)); }
.dl-steps { text-align: left; margin: 14px 0 0; padding-left: 22px; font-size: 15px; line-height: 1.45; }
.dl-steps li { margin: 6px 0; }
.dl-load { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 800; }
.dl-snd { display: grid; place-items: center; padding: 0; }
.dl-snd svg { width: 22px; height: 22px; fill: none; stroke: #fff; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 2px 0 #10233f); }
`;

/* Sound: Web Audio, so a kick lands on the frame it's drawn. Phones keep the
   audio asleep until a tap, so any tap in a duel wakes it; closing one puts it
   back to sleep. Off is remembered per phone. */
let ac = null, muted = false;
const spk = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff"/>${muted ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'}</svg>`;
const buf = {};
try { muted = localStorage.duelMute === '1'; } catch {}
function sounds() {
  if (ac) return;
  ac = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
  for (const n of ['kick', 'glove', 'cheer', 'ooh', 'whistle'])
    fetch(`sounds/${n}.mp3`).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(d => { buf[n] = d; }).catch(() => {});
  const wake = () => { if (ac.state !== 'running' && document.querySelector('#duel.open')) ac.resume(); };
  addEventListener('pointerdown', wake, true); addEventListener('touchend', wake, true);
}
function sfx(n, vol = 1) {
  if (muted || !ac || ac.state !== 'running') return;
  const g = ac.createGain(), t = ac.currentTime; g.connect(ac.destination);
  if (n === 'tick') { // the last three seconds of a pick
    const o = ac.createOscillator(); o.frequency.value = 1100; o.connect(g);
    g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .09);
    o.start(t); o.stop(t + .1); return;
  }
  if (!buf[n]) return;
  g.gain.value = vol;
  const s = ac.createBufferSource(); s.buffer = buf[n]; s.connect(g); s.start();
}

export function mount(el, api) {
  sounds();
  if (!document.getElementById('duelCss')) {
    const st = document.createElement('style'); st.id = 'duelCss'; st.textContent = CSS; document.head.append(st);
  }
  el.innerHTML = '<div class="dl-load">Warming up…</div>';
  const R = new THREE.WebGLRenderer({ antialias: true });
  R.setPixelRatio(Math.min(devicePixelRatio, 2));
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace;
  const hud = document.createElement('div'); hud.className = 'dl-hud';
  const cam = new THREE.PerspectiveCamera(40, 1, .05, 200);
  const sc = new THREE.Scene();
  let kp = null, ball, ghosts = [], ready = null;
  const tex = (w, h, draw, rep) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); }
    return t;
  };

  /* ---------- the scene ---------- */
  function stadium() {
    // night sky, floodlights, a soft blur of crowd behind the goal
    sc.background = tex(4, 512, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#071331'); g.addColorStop(.55, '#173f86'); g.addColorStop(1, '#0d2557'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    sc.fog = new THREE.Fog('#123173', 9, 26);
    const glow = tex(128, 128, c => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.2, 'rgba(200,225,255,.7)'); g.addColorStop(1, 'rgba(120,170,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
    for (const [x, y, s] of [[-3.6, 5.4, 3.4], [-1.2, 5.9, 2.4], [1.2, 5.9, 2.4], [3.6, 5.4, 3.4], [-6, 4.8, 3], [6, 4.8, 3]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.position.set(x, y, -7.5); sp.scale.setScalar(s); sc.add(sp);
    }
    const crowd = new THREE.Mesh(new THREE.PlaneGeometry(34, 12), new THREE.MeshBasicMaterial({ fog: false, map: tex(512, 128, (c, w, h) => {
      c.fillStyle = '#0b1f4d'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { c.fillStyle = `hsla(${200 + Math.random() * 40},60%,${25 + Math.random() * 35}%,.55)`; c.beginPath(); c.arc(Math.random() * w, h * .45 + Math.random() * h * .55, 1 + Math.random() * 2, 0, 7); c.fill(); }
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(7,19,49,1)'); g.addColorStop(.42, 'rgba(10,30,80,.9)'); g.addColorStop(.6, 'rgba(10,25,70,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    }) }));
    crowd.position.set(0, 5.6, -8); sc.add(crowd);
    const board = new THREE.Mesh(new THREE.BoxGeometry(30, .5, .1), new THREE.MeshStandardMaterial({ color: '#1d4fb8', emissive: '#16367e', emissiveIntensity: .6 }));
    board.position.set(0, .25, -5); sc.add(board);
    // light
    sc.add(new THREE.HemisphereLight(0xcfe2ff, 0x1d3a1d, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2, 8, 6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); // plenty for one keeper; a phone's GPU thanks it Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 }); key.shadow.bias = -.0003; sc.add(key);
    const rim = new THREE.DirectionalLight(0x9cc4ff, 1.4); rim.position.set(-3, 5, -6); sc.add(rim);
    // grass: mown stripes, white lines
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ roughness: .95, map: tex(512, 512, (c, w, h) => {
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#2f8f2c' : '#3aa335'; c.fillRect(0, i * h / 8, w, h / 8); }
      for (let i = 0; i < 30000; i++) { c.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,40,0'},${Math.random() * .08})`; c.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 3); }
    }, [8, 6]) }));
    grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; sc.add(grass);
    const white = new THREE.MeshStandardMaterial({ color: '#f4f7f4', roughness: .8 });
    for (const [d, z] of [[.07, GZ], [.08, 2.6]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(30, .004, d), white); m.position.set(0, .002, z); m.receiveShadow = true; sc.add(m); }
  }
  function goal() {
    // the frame: one glossy tube, its top corners bent round
    const post = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: .28, clearcoat: 1, clearcoatRoughness: .15 });
    const BEND = .16, P = (x, y) => new THREE.Vector3(x, y, GZ), path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(P(-GW / 2, 0), P(-GW / 2, GH - BEND)));
    path.add(new THREE.QuadraticBezierCurve3(P(-GW / 2, GH - BEND), P(-GW / 2, GH), P(-GW / 2 + BEND, GH)));
    path.add(new THREE.LineCurve3(P(-GW / 2 + BEND, GH), P(GW / 2 - BEND, GH)));
    path.add(new THREE.QuadraticBezierCurve3(P(GW / 2 - BEND, GH), P(GW / 2, GH), P(GW / 2, GH - BEND)));
    path.add(new THREE.LineCurve3(P(GW / 2, GH - BEND), P(GW / 2, 0)));
    const frame = new THREE.Mesh(new THREE.TubeGeometry(path, 200, .075, 24, false), post); frame.castShadow = true; sc.add(frame);
    for (const x of [-GW / 2, GW / 2]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, Math.hypot(DEPTH, GH), 8), post);
      s.position.set(x, GH / 2, GZ - DEPTH / 2); s.rotation.x = Math.atan2(DEPTH, GH); sc.add(s);
    }
    // a hexagon net, and a dark wash behind it so the mesh reads
    const net = rep => new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: .05, roughness: .9, map: tex(256, 222, c => {
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 4; const r = 32, hw = r * Math.sqrt(3) / 2;
      const hex = (cx, cy) => { c.beginPath(); for (let i = 0; i <= 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; c[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a)); } c.stroke(); };
      for (let row = -1; row < 6; row++) for (let col = -1; col < 6; col++) hex(col * hw * 2 + (row % 2 ? hw : 0), row * r * 1.5);
    }, rep) });
    const N = 3.6, H6 = .87;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), net([GW * N, GH * N * H6])); back.position.set(0, GH / 2, GZ - DEPTH); sc.add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GW, DEPTH), net([GW * N, DEPTH * N * H6])); roof.rotation.x = Math.PI / 2; roof.position.set(0, GH, GZ - DEPTH / 2); sc.add(roof);
    for (const x of [-GW / 2, GW / 2]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(DEPTH, GH), net([DEPTH * N, GH * N * H6])); s.rotation.y = Math.PI / 2; s.position.set(x, GH / 2, GZ - DEPTH / 2); sc.add(s); }
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), new THREE.MeshBasicMaterial({ color: '#0e2a66', transparent: true, opacity: .35, fog: false }));
    wash.position.set(0, GH / 2, GZ - DEPTH - .02); sc.add(wash);
  }
  /* A football: a truncated icosahedron, panel by panel: each point is
     coloured by whether it's nearer a pentagon's centre or a hexagon's. A ghost
     is the pale see-through one you aim at. */
  function football(r, ghost) {
    // the see-through targets are small: a quarter of the triangles
    const g = new THREE.IcosahedronGeometry(1, ghost ? 20 : 40), pos = g.attributes.position, col = [];
    const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position, pent = [], hexC = [];
    for (let i = 0; i < ico.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(ico, i).normalize(); if (!pent.some(p => p.distanceTo(v) < 1e-3)) pent.push(v); }
    for (let i = 0; i < ico.count; i += 3) hexC.push(new THREE.Vector3().fromBufferAttribute(ico, i).add(new THREE.Vector3().fromBufferAttribute(ico, i + 1)).add(new THREE.Vector3().fromBufferAttribute(ico, i + 2)).normalize());
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const ap = Math.acos(Math.min(1, Math.max(...pent.map(p => p.dot(v))))), ah = Math.acos(Math.min(1, Math.max(...hexC.map(p => p.dot(v))))) * 1.17;
      const seam = Math.abs(ap - ah) < .035, c = ghost ? (seam ? .7 : ap < ah ? .3 : .97) : seam ? .35 : ap < ah ? .06 : .96;
      col.push(c, c, c); pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, ghost ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .72, depthWrite: false, fog: false })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .35, metalness: .05 }));
    m.castShadow = !ghost; return m;
  }
  /* A fair-skinned keeper: a copy of the body's texture with every skin-coloured
     pixel moved to a light tone, its shading kept. Eyes, brows and lips aren't
     skin-coloured, so they stay as they are. */
  function lighterSkin(t) {
    const im = t.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    const skin = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0; return r >= g && g >= b * .9 && s > .18 && s < .8 && mx > 25 && mx < 235; };
    const vs = []; for (let i = 0; i < p.length; i += 4 * 7) if (skin(p[i], p[i + 1], p[i + 2])) vs.push(Math.max(p[i], p[i + 1], p[i + 2]));
    vs.sort((a, b) => a - b); const ref = vs[vs.length >> 1] || 128, tone = [238, 172, 132];
    for (let i = 0; i < p.length; i += 4) {
      if (!skin(p[i], p[i + 1], p[i + 2])) continue;
      const k = Math.min(1.25, Math.max(p[i], p[i + 1], p[i + 2]) / ref);
      for (let j = 0; j < 3; j++) p[i + j] = Math.min(255, tone[j] * k);
    }
    x.putImageData(d, 0, 0);
    const n = new THREE.CanvasTexture(c); n.flipY = t.flipY; n.colorSpace = t.colorSpace; n.wrapS = t.wrapS; n.wrapT = t.wrapT; return n;
  }
  /* The keeper and his saves. For each save: when to start it so he's mid-dive
     as the ball arrives (halfway across for a dive, the top of the jump for a
     catch), which way it goes, and trimmed to stay on his line and inside the
     post: Mixamo's dives run 1.7 m at the camera and 2 m sideways. */
  async function keeper() {
    const gl = await new GLTFLoader().loadAsync('models/keeper.glb'), k = gl.scene, kit = [];
    k.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false;
      if (/Shirt|Shorts|Socks/.test(o.name)) { o.material = o.material.clone(); kit.push(o); }
      if (o.name === 'Ch38_Body') { o.material = o.material.clone(); o.material.map = lighterSkin(o.material.map); }
    });
    const mixer = new THREE.AnimationMixer(k), act = {}, at = {}, side = {};
    gl.animations.forEach(c => { act[c.name] = mixer.clipAction(c); });
    for (const n of ['dive-left', 'dive-right', 'catch-high']) {
      const tr = act[n].getClip().tracks.find(t => /Hips\.position$/.test(t.name)), v = tr.values, ts = tr.times;
      const far = Math.abs(v[v.length - 3] - v[0]);
      let best = -1e9;
      for (let i = 0; i < ts.length; i++) {
        if (n !== 'catch-high') { if (Math.abs(v[i * 3] - v[0]) >= far / 2) { at[n] = ts[i]; break; } continue; }
        if (v[i * 3 + 1] > best) { best = v[i * 3 + 1]; at[n] = ts[i]; }
      }
      const reach = n === 'catch-high' ? 0 : (GW / 2 - .95) / KEEPER_SCALE / (far || 1);
      side[n] = (v[v.length - 3] - v[0]) * reach;
      for (let i = 0; i < v.length; i += 3) { v[i] = v[0] + (v[i] - v[0]) * reach; v[i + 2] = v[2]; }
    }
    k.scale.setScalar(KEEPER_SCALE); k.position.set(0, 0, GZ + .35); sc.add(k);
    act.idle.play();
    return { k, mixer, act, at, side, kit, save: null };
  }
  async function build() {
    stadium(); goal();
    ball = football(BR); sc.add(ball);
    const glow = sc.children.find(o => o.isSprite).material.map;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.position.z = -.05; halo.scale.setScalar(2.6); ball.add(halo);
    for (const [x, y] of Object.values(TARGETS)) {
      const g = new THREE.Group(); g.position.set(x, y, GZ + .02);
      g.add(football(.24, true));
      g.add(new THREE.Mesh(new THREE.TorusGeometry(.3, .016, 16, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9, fog: false })));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(.3, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .14, depthWrite: false, fog: false }));
      disc.position.z = -.25; g.add(disc);
      g.visible = false; sc.add(g); ghosts.push(g);
    }
    kp = await keeper();
  }
  const ballHome = () => new THREE.Vector3(-.12, BR, cam.position.z - 2.3);
  // everyone back on their mark; `keeping` puts the keeper in your colour
  function reset(keeping) {
    if (kp.save) { kp.save.stop(); kp.act.idle.reset().play(); kp.save = null; }
    ball.position.copy(ballHome()); ball.visible = true;
    ghosts.forEach(g => { g.visible = false; });
    if (keeping !== undefined) {
      const c = new THREE.Color(keeping ? ME : THEM);
      kp.kit.forEach(o => o.material.color.copy(c).multiplyScalar(/Shorts/.test(o.name) ? .7 : 1));
    }
  }

  /* ---------- the loop, and tweens on it ---------- */
  let on = false, tweens = [];
  const clock = new THREE.Clock();
  const tween = (ms, fn) => new Promise(res => tweens.push({ t0: performance.now(), ms, fn, res }));
  const ease = t => 1 - (1 - t) ** 3;
  function frame(now) {
    if (!on) return;
    const dt = clock.getDelta();
    kp && kp.mixer.update(dt);
    ghosts.forEach(g => { g.children[0].rotation.y += dt * .5; });
    tweens = tweens.filter(w => { const t = Math.min(1, (now - w.t0) / w.ms); w.fn(t); if (t >= 1) { w.res(); return false; } return true; });
    R.render(sc, cam);
    requestAnimationFrame(frame);
  }
  // stand where the whole goal mouth fits across, with a little either side
  function size() {
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    R.setSize(w, h, false); cam.aspect = w / h;
    const half = GW / 2 + .35;
    cam.fov = Math.max(38, 2 * Math.atan(half / cam.aspect / 6) * 180 / Math.PI);
    cam.position.set(0, .7, GZ + half / Math.tan(cam.fov * Math.PI / 360) / cam.aspect); cam.lookAt(0, .78, GZ);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    if (ball && !tweens.length) ball.position.copy(ballHome());
  }
  addEventListener('resize', () => { if (on) { size(); key = ''; step(); } });
  // where a point in the scene is on the screen, in CSS pixels
  const proj = (x, y, z) => { cam.updateMatrixWorld(); const v = new THREE.Vector3(x, y, z).project(cam); return [(v.x + 1) / 2 * el.clientWidth, (1 - v.y) / 2 * el.clientHeight]; };

  /* One kick: the ball flies at its target and the keeper makes his save. `k`
     is where it was hit and `v` where the keeper went, either null for a side
     that ran out of time: a shot never taken dribbles, a keeper who never
     picked stands still. Left and Right are as the shooter sees the goal. */
  async function kick(k, v, goal) {
    if (v) {
      const clip = v === 'M' ? 'catch-high' : (kp.side['dive-left'] < 0) === (v === 'L') ? 'dive-left' : 'dive-right', a = kp.act[clip];
      a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.time = Math.max(0, kp.at[clip] - .55);
      a.play(); kp.act.idle.crossFadeTo(a, .12, false); kp.save = a;
    }
    const b0 = ball.position.clone();
    sfx('kick', k ? 1 : .35);
    if (!k) return tween(700, t => ball.position.set(b0.x, BR, b0.z - 1.2 * ease(t)));
    const [tx, ty] = TARGETS[k];
    const end = goal ? new THREE.Vector3(tx, ty, GZ - .55) : new THREE.Vector3(tx * .85, ty * (tx ? .8 : 1.02), GZ + .8); // a save meets his gloves, in front of him, not inside him
    await tween(560, t => {
      const e = ease(t);
      ball.position.set(b0.x + (end.x - b0.x) * e, b0.y + (end.y - b0.y) * e + Math.sin(t * Math.PI) * .25, b0.z + (end.z - b0.z) * e);
      ball.rotation.x -= .25; ball.rotation.z += .1;
    });
    // a goal drops into the net; a save bounces back out
    if (goal) sfx('cheer', .8); else { sfx('glove'); sfx('ooh', .7); }
    const p0 = ball.position.clone();
    await tween(420, t => goal ? ball.position.set(p0.x, p0.y * (1 - t) + BR * t, p0.z - .1 * t)
      : ball.position.set(p0.x * (1 - t * .3), p0.y + Math.sin(t * Math.PI) * .4 - p0.y * t + BR * t, p0.z + 2 * t));
  }

  /* ---------- the duel ----------
     One loop drives it: every change to the row, and a tick four times a
     second for the clock, calls step(), which plays any kick newly settled and
     then paints what the duel wants from you. A screen is only rebuilt when
     its key changes, so a tap isn't lost to a repaint. */
  let cur = null, busy = false, key = '', tick = null;
  const ANIM = 2500; // a kick's flight and banner: the next one's ring waits for it
  const other = x => x === 'a' ? 'b' : 'a';
  const them = () => cur.d[cur.s ? other(cur.s) : 'a'];
  const nameOf = () => api.name(them());
  const stake = () => D.stakeOf(cur.d);
  const top = (dots = '') => `<div class="dl-top dl-ts"><button class="dl-x" data-x aria-label="Close">✕</button>
    <span class="dl-pill">Penalties vs ${esc(nameOf())}</span><span class="dl-pill">${coin}${stake() * 2}</span><button class="dl-x dl-q dl-snd" data-snd aria-pressed="${muted}" aria-label="Sound">${spk()}</button><button class="dl-x dl-q" data-how aria-label="How to play">?</button></div>` + dots;
  // the score so far, from the kicks already shown
  function vs(kicks) {
    const me = cur.s, n = Math.max(D.KICKS, Math.ceil(kicks.length / 2));
    const row = x => kicks.filter(k => k.by === x);
    const dots = x => { const r = row(x); return Array.from({ length: n }, (_, i) => i < r.length ? (r[i].goal ? '<i class="g">✓</i>' : '<i class="m">✕</i>') : '<i></i>').join(''); };
    const goals = x => row(x).filter(k => k.goal).length;
    return `<div class="dl-vs dl-ts">
      <div class="dl-row"><span class="dl-av" style="background:${ME}"></span><span>You</span><b>${goals(me)}</b><span class="dl-dots">${dots(me)}</span></div>
      <div class="dl-row"><span class="dl-av" style="background:${THEM}"></span><span>${esc(nameOf())}</span><b>${goals(other(me))}</b><span class="dl-dots">${dots(other(me))}</span></div></div>`;
  }
  const show = (k, html) => {
    key = k; hud.innerHTML = html;
    hud.querySelectorAll('[data-x]').forEach(x => { x.onclick = close; }); // the ✕ and every card's OK, Done or Not now
    const h = hud.querySelector('[data-how]'); if (h) h.onclick = how;
    const m = hud.querySelector('[data-snd]'); if (m) m.onclick = () => {
      muted = !muted; try { localStorage.duelMute = muted ? '1' : '0'; } catch {}
      m.innerHTML = spk(); m.setAttribute('aria-pressed', muted);
    };
  };
  const card = (k, inner) => key === k ? false : (show(k, top() + `<div class="dl-dim"></div><div class="dl-card">${inner}</div>`), true);
  const on$ = (sel, fn) => { const b = hud.querySelector(sel); if (b) b.onclick = fn; return b; };
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // how to play: once on your first duel, then from the ? button
  function how() {
    hud.insertAdjacentHTML('beforeend', `<div class="dl-how"><div class="dl-dim"></div><div class="dl-card">
      <h2 class="even">How to play</h2>
      <ol class="dl-steps">
        <li><b>Post a duel</b> with a stake, or join somebody’s.</li>
        <li><b>Take turns.</b> One shoots, one dives, and you both pick at the same time, in 10 seconds. A dive to the side of the shot saves it.</li>
        <li><b>Five kicks each.</b> The most goals takes both stakes.</li>
      </ol>
      <p class="dl-note">Level after five? One more each until someone’s ahead. Nobody sees a pick until both are in. ${D.DAILY} duels a day.</p>
      <button class="dl-btn y" data-ok>Got it</button></div></div>`);
    hud.querySelector('.dl-how [data-ok]').onclick = () => hud.querySelector('.dl-how').remove();
    try { localStorage.duelHow = 1; } catch {}
  }
  const firstTime = () => { try { return !localStorage.duelHow; } catch { return false; } };

  // what the duel wants now
  function step() {
    if (!cur || busy || key === 'fail') return;
    const d = api.duel(cur.id);
    if (!d) return cur.lost ? card('gone', `<h2 class="even">That duel is gone</h2><p>It was taken down, or the link is wrong.</p><button class="dl-btn y" data-x>OK</button>`)
      : key !== 'look' && show('look', '<div class="dl-load">Looking for that duel…</div>');
    cur.d = d; cur.s = D.side(d, api.me());
    const st = D.state(d, api.now());
    if (cur.shown === undefined) cur.shown = st.kicks.length; // opened mid-duel: don't replay what's been
    if (cur.s && st.kicks.length > cur.shown) {
      busy = true;
      return play(st.kicks[cur.shown], st.kicks.slice(0, cur.shown + 1)).then(() => { cur.shown++; busy = false; key = ''; step(); });
    }
    if (!cur.s) return st.phase === 'open' ? invite(st) : card('taken', `<h2 class="even">Someone got there first</h2>
      <p>${esc(api.name(d.a))}’s duel already has a player. Post one of your own from the board.</p><button class="dl-btn y" data-x>OK</button>`);
    if (st.phase === 'open') return cur.s === 'a' ? posted() : card('noshow', `<h2 class="even">${esc(nameOf())} didn’t show</h2>
      <p>Your ${stake()} coins are back.</p><button class="dl-btn y" data-x>OK</button>`);
    if (st.phase === 'joined') return cur.s === 'a' ? begin() : waiting(st);
    if (st.phase === 'live') return live(st);
    return result(st);
  }

  // somebody else's post: join it
  function invite() {
    const why = api.me() ? api.canJoin(cur.d) : '', S = stake();
    if (key === 'invite' + why) return;
    card('invite' + why, `<h2 class="even">${esc(api.name(cur.d.a))}’s penalty duel</h2>
      <p>Pure luck, played live: one shoots, one dives, both pick at once. Five kicks each.</p>
      <div class="dl-prize">${coin}Winner takes ${S * 2}</div>
      <button class="dl-btn g" data-go ${why ? 'disabled' : ''}>${api.me() ? `Join for ${S} coins` : 'Sign in to join'}</button>
      ${why ? `<div class="dl-note">${esc(why)}</div>` : ''}
      <button class="dl-btn" data-x>Not now</button>`);
    if (firstTime()) how();
    on$('[data-go]', async e => {
      if (!api.me()) { close(); return api.signIn(cur.id); }
      e.target.disabled = true;
      try { await api.join(cur.id); } catch (err) { fail(err); }
    });
  }
  // your post, nobody in yet
  function posted() {
    if (key === 'posted') return;
    card('posted', `<h2 class="even">Your duel is up</h2>
      <p>Whoever joins first plays you, live. You’ll get a push when they do.</p>
      <div class="dl-prize">${coin}${stake()} each</div>
      <button class="dl-btn y" data-share>Share the link</button>
      <button class="dl-btn" data-x>OK</button>
      <button class="dl-btn q" data-back>Take it back</button>`);
    on$('[data-share]', e => api.share(cur.id, e.target));
    if (firstTime()) how();
    on$('[data-back]', async () => { try { await api.remove(cur.id); close(); } catch (err) { fail(err); } });
  }
  // you joined; the poster has three minutes to show
  function waiting(st) {
    const left = st.showBy - api.now();
    if (key !== 'wait') card('wait', `<h2 class="even">Waiting for ${esc(nameOf())}</h2>
      <p>They’ve had a push. The duel starts the moment they open it, so keep this screen open.</p>
      <p class="dl-note">If they don’t come in <b data-left>${mmss(left)}</b>, your ${stake()} coins come back.</p>`) && firstTime() && how();
    const b = hud.querySelector('[data-left]'); if (b) b.textContent = mmss(left);
  }
  // you posted, they joined: opening it is showing up
  function begin() {
    if (key === 'begin') return;
    card('begin', `<h2 class="even">Starting…</h2><p>${esc(nameOf())} is waiting.</p>`);
    api.go(cur.id).catch(fail);
  }

  // a kick being taken: both pick at once, sealed, then both picks are opened
  function live(st) {
    const c = st.cur, n = c.n, me = cur.s, k = (cur.d.k && cur.d.k[n]) || {}, shooting = c.by === me;
    const mine = k[me + 's'], store = `duel:${cur.id}:${n}`;
    // both sealed: open yours. Kept in sessionStorage, so a reload can still open it
    if (mine && k[other(me) + 's'] && !k[me + 'p'] && cur.opening !== n) {
      let v = null; try { v = sessionStorage[store]; } catch {}
      if (v) { cur.opening = n; api.mark(cur.id, n, me + 'p', v).catch(err => { cur.opening = null; console.error('[duel] open failed:', err); }); }
    }
    const ringEnd = c.o + ANIM + D.MOVE_MS, left = ringEnd - api.now();
    const sealed = mine || cur.sealing === n;
    const round = Math.floor(n / 2) + 1;
    if (key !== `live${n}${!!sealed}`) {
      if (n === 0 && !sealed) sfx('whistle');
      reset(!shooting);
      const role = shooting ? 'You shoot' : 'You’re in goal';
      const tap = shooting ? 'Tap where to aim · ' : '';
      const sub = `${tap}${round > D.KICKS ? 'Sudden death · ' : ''}Kick ${round} of ${Math.max(D.KICKS, round)} · ${shooting ? `${esc(nameOf())} dives` : `${esc(nameOf())} shoots`}`;
      show(`live${n}${!!sealed}`, top(vs(st.kicks.slice(0, cur.shown))) + `
        <div class="dl-hint dl-ts dl-role">${role}<small>${sub}</small></div>
        <div class="dl-ring dl-ts ${shooting ? '' : 'up'}" data-ring></div>
        ${sealed ? `<div class="dl-line dl-ts dl-locked">Locked in. Waiting for ${esc(nameOf())}…</div>`
        : shooting ? '' : `<div class="dl-three dl-ts">${['L', 'M', 'R'].map(z => `<button data-v="${z}"><span>${{ L: '◀', M: '●', R: '▶' }[z]}</span>${z === 'L' ? 'Left' : z === 'R' ? 'Right' : 'Stay'}</button>`).join('')}</div>`}`);
      // shooting: tap one of the balls on the goal
      if (shooting && !sealed) Object.entries(TARGETS).forEach(([z, [x, y]], i) => {
        ghosts[i].visible = true;
        const [sx, sy] = proj(x, y, GZ), [ex] = proj(x + .32, y, GZ), b = document.createElement('button');
        b.className = 'dl-tgt'; b.dataset.v = z; b.setAttribute('aria-label', { L: 'Shoot left', M: 'Shoot down the middle', R: 'Shoot right' }[z]);
        Object.assign(b.style, { left: sx + 'px', top: sy + 'px', width: (ex - sx) * 2 + 'px', height: (ex - sx) * 2 + 'px' });
        hud.append(b);
      });
      hud.querySelectorAll('[data-v]').forEach(b => b.onclick = () => seal(n, b.dataset.v));
    }
    const r = hud.querySelector('[data-ring]');
    const secs = Math.max(0, Math.min(10, Math.ceil(left / 1000)));
    if (r) r.textContent = sealed ? '' : String(secs);
    if (!sealed && secs >= 1 && secs <= 3 && cur.tick !== `${n}:${secs}`) { cur.tick = `${n}:${secs}`; sfx('tick'); }
    // out of time with the screen open: a side picked for you
    if (!sealed && left <= 0) seal(n, 'LMR'[crypto.getRandomValues(new Uint8Array(1))[0] % 3]);
  }
  async function seal(n, pick) {
    if (cur.sealing === n) return;
    cur.sealing = n;
    const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
    const v = pick + ':' + salt;
    try { sessionStorage[`duel:${cur.id}:${n}`] = v; } catch {}
    key = ''; step();
    try { await api.mark(cur.id, n, cur.s + 's', D.sha256(v)); } catch (err) { cur.sealing = null; key = ''; console.error('[duel] seal failed:', err); step(); }
  }

  // play one settled kick out, from your side of it
  async function play(kk, shown) {
    const me = cur.s, by = kk.by, keep = other(by), you = by === me;
    const shot = kk[by].pick || null, dive = kk[keep].pick || null;
    reset(!you);
    show('play', top(vs(shown.slice(0, -1))));
    await kick(shot, dive, kk.goal);
    const where = z => z === 'M' ? 'down the middle' : z === 'L' ? 'left' : 'right';
    const dived = z => z === 'M' ? 'stayed in the middle' : `dived ${z === 'L' ? 'left' : 'right'}`;
    const who = x => x === me ? 'You' : esc(nameOf());
    const line = !shot ? `${who(by)} ran out of time.`
      : !dive ? `${who(by)} shot ${where(shot)}. ${who(keep)} ran out of time.`
      : `${who(by)} shot ${where(shot)}. ${who(keep)} ${dived(dive)}.`;
    const dots = hud.querySelector('.dl-vs'); if (dots) dots.outerHTML = vs(shown);
    hud.insertAdjacentHTML('beforeend', `<div class="dl-banner dl-ts ${kk.goal ? '' : 'save'}">${kk.goal ? 'GOAL!' : 'SAVED!'}</div><div class="dl-line dl-ts">${line}</div>`);
    await new Promise(r => setTimeout(r, 1500));
  }

  function result(st) {
    if (key === 'done') return;
    sfx('whistle');
    const me = cur.s, win = st.winner === me, draw = !st.winner, S = stake();
    const [my, th] = me === 'a' ? [st.ga, st.gb] : [st.gb, st.ga];
    const why = st.gone ? 'You both ran out of time, so the duel stopped. Both stakes are back.'
      : st.out ? (st.out === me ? 'You missed three moves in a row, so it counts as leaving.' : `${esc(nameOf())} missed three moves in a row and left.`)
      : st.sudden ? 'Settled in sudden death.' : '';
    card('done', `<h2 class="${win ? '' : draw ? 'even' : 'lose'}">${win ? 'You win!' : draw ? (st.gone ? 'Stopped' : 'All square') : `${esc(nameOf())} wins`}</h2>
      <div class="dl-score">${my} – ${th}</div><div class="who"><span>You</span><span>${esc(nameOf())}</span></div>
      ${why ? `<p>${why}</p>` : ''}
      <div class="dl-prize">${coin}${win ? `+${S * 2}` : draw ? `${S} back` : `−${S}`} coins</div>
      <button class="dl-btn y" data-again>Post another</button>
      <button class="dl-btn" data-x>Done</button>`);
    on$('[data-again]', () => { close(); api.again(); });
  }

  function fail(err) {
    console.error('[duel] write failed:', err);
    card('fail', `<h2 class="lose">That didn’t save</h2><p>Check your connection and try again.</p><button class="dl-btn y" data-ok>OK</button>`);
    on$('[data-ok]', () => { key = ''; step(); });
  }

  /* ---------- opening and closing ---------- */
  async function open(id) {
    el.classList.add('open'); document.body.style.overflow = 'hidden';
    ready ||= build().then(() => { el.innerHTML = ''; el.append(R.domElement, hud); });
    try { await ready; } catch (err) {
      console.error('[duel] load failed:', err); ready = null;
      el.innerHTML = '<div class="dl-load">Couldn’t load the pitch. Check your connection and try again.</div>';
      setTimeout(close, 2500); return;
    }
    cur = { id }; busy = false; key = ''; size(); reset(false);
    if (!on) { on = true; requestAnimationFrame(frame); }
    clearInterval(tick); tick = setInterval(step, 250);
    // a link can arrive before the duels have: give them a few seconds
    setTimeout(() => { if (cur && cur.id === id) { cur.lost = true; step(); } }, 5000);
    step();
  }
  function close() {
    on = false; cur = null; key = ''; clearInterval(tick); tweens.forEach(w => w.res()); tweens = [];
    el.classList.remove('open'); document.body.style.overflow = '';
    ac && ac.suspend(); // the phone's audio sleeps until the next duel
    if (/^#d\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    api.closed && api.closed(); // the board waited while the duel was up
  }
  const update = () => step();
  return { open, close, update, isOpen: () => !!cur };
}
