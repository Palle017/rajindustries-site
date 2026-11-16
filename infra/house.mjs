// House screen: holographic three.js view of the RoomPlan scan. Floors stack by floors[].elevation.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const COL = { wall: 0x38e1ff, door: 0xffb648, window: 0x8ff3ff, opening: 0x8ff3ff, floor: 0x1a6f86, object: 0x2aa9c4 };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function holo(mesh, kind) {
  const c = COL[kind] ?? COL.object;
  const fillOpacity = { wall: 0.025, floor: 0.035, object: 0.02, door: 0.06, window: 0.08 }[kind] ?? 0.06;
  mesh.material = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: fillOpacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20),
    new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: kind === 'object' ? 0.4 : kind === 'floor' ? 0.3 : 0.9, blending: THREE.AdditiveBlending }));
  mesh.add(edges);
}

// DXF fallback: wall segments are in the DXF plane; model space is x = -dxf_x, z = dxf_y.
function buildFromDxf(dxf) {
  const g = new THREE.Group();
  const box = (s, kind, h0, h1, t) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.l, h1 - h0, t));
    const dx = -Math.cos(s.a), dz = Math.sin(s.a);
    m.position.set(-s.x, (h0 + h1) / 2, s.y); m.rotation.y = -Math.atan2(dz, dx); holo(m, kind); g.add(m);
  };
  for (const w of dxf.walls) box(w, 'wall', w.z0, w.z1, w.t);
  for (const o of dxf.openings) box(o, o.kind === 'door' ? 'door' : 'window', o.z0, o.z1, 0.04);
  for (const o of dxf.objects) box(o, 'object', o.z0, o.z1, o.t);
  return g;
}

export async function mountHouse(house, host, buttons, info, sub) {
  const floors = house?.floors || [];
  const W = () => host.clientWidth, H = () => host.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W(), H()); renderer.setClearColor(0x01060a);
  host.querySelector('.house-loading')?.remove(); host.append(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.setSize(W(), H()); Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' }); host.append(labels.domElement);

  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x01060a, 0.012);
  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; controls.autoRotateSpeed = 0.6; controls.maxPolarAngle = Math.PI * 0.49;

  const root = new THREE.Group(); scene.add(root);
  const groups = {}; const status = [];
  const loader = new GLTFLoader();
  for (const f of floors) {
    const g = new THREE.Group(); g.position.y = f.elevation || 0; g.name = f.id; groups[f.id] = g; root.add(g);
    let ok = false;
    if (f.model) {
      try {
        const gltf = await loader.loadAsync(f.model);
        gltf.scene.traverse(o => { if (o.isMesh) { const k = (/^(wall|door|window|opening|floor|object)/.exec(o.name) || [, 'object'])[1]; holo(o, k); } });
        g.add(gltf.scene); ok = true; status.push(`${f.name}: ${f.model_source} → GLB`);
      } catch (e) { console.warn('GLB failed, using DXF', e); }
    }
    if (!ok && f.dxf) { g.add(buildFromDxf(f.dxf)); status.push(`${f.name}: DXF fallback`); }
    for (const r of f.rooms || []) {
      const d = el('div', 'room-label' + (/unlabeled/i.test(r.label) ? ' unl' : ''), r.label);
      const o = new CSS2DObject(d); o.position.set(r.x, 2.6, r.z); o.userData.kind = 'room'; g.add(o);
    }
    for (const ob of f.objects_labeled || []) {
      const o = new CSS2DObject(el('div', 'obj-label', ob.label)); o.position.set(ob.x, ob.top + 0.15, ob.z); o.userData.kind = 'object'; o.visible = false; g.add(o);
    }
    for (const sn of f.sensors || []) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.22, 40), new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(sn.x, 0.05, sn.z); ring.userData.pulse = true; g.add(ring);
      const o = new CSS2DObject(el('div', 'sensor-label', sn.label)); o.position.set(sn.x, (sn.y ?? 2.2) + 0.2, sn.z); g.add(o);
    }
  }

  // fit camera to model
  const bb = new THREE.Box3().setFromObject(root); const c = bb.getCenter(new THREE.Vector3()); const size = bb.getSize(new THREE.Vector3());
  const R = Math.max(size.x, size.z) || 12;
  controls.target.set(c.x, 0.8, c.z); camera.position.set(c.x + R * 0.75, R * 0.85, c.z + R * 0.95); controls.update();
  const grid = new THREE.GridHelper(R * 2.4, Math.round(R * 2.4 / 0.5), 0x1f7d93, 0x0b2a33); grid.position.set(c.x, -0.01, c.z);
  grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid);
  // decorative radar sweep around the scan (not sensor data)
  const sweep = new THREE.Mesh(new THREE.CircleGeometry(R * 0.78, 48, 0, Math.PI / 5), new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  sweep.rotation.x = -Math.PI / 2; sweep.position.set(c.x, 0.01, c.z); scene.add(sweep);
  const rings = new THREE.Group(); for (let i = 1; i <= 3; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(R * 0.26 * i, R * 0.26 * i + 0.03, 96), new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; rings.add(r); } rings.position.set(c.x, 0.005, c.z); scene.add(rings);

  let composer = null;
  try { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.5, 0.3, 0.3)); composer.addPass(new OutputPass()); } catch { composer = null; }

  // UI: floor buttons + label toggles
  const mk = (txt, on, fn, disabled) => { const b = el('button', null, txt); b.type = 'button'; b.setAttribute('aria-pressed', String(!!on)); if (disabled) b.disabled = true; b.addEventListener('click', () => fn(b)); buttons.append(b); return b; };
  const floorBtns = [];
  const setFloor = id => { for (const [k, g] of Object.entries(groups)) g.visible = id === 'all' || k === id; floorBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id))); };
  const all = mk('All floors', true, () => setFloor('all')); all.dataset.id = 'all'; floorBtns.push(all);
  for (const f of floors) { const b = mk(f.name, false, () => setFloor(f.id)); b.dataset.id = f.id; floorBtns.push(b); }
  if (!floors.some(f => f.id === 'upper')) mk('Upper floor · scan pending', false, () => {}, true);
  const toggle = (kind, start) => mk(kind === 'room' ? 'Room labels' : 'Object labels', start, b => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); root.traverse(o => { if (o.userData.kind === kind) o.visible = on; }); });
  toggle('room', true); toggle('object', false);
  mk('Auto-rotate', controls.autoRotate, b => { controls.autoRotate = !controls.autoRotate; b.setAttribute('aria-pressed', String(controls.autoRotate)); });

  // info panel
  const f0 = floors[0] || {};
  sub.textContent = floors.map(f => f.name).join(' + ') + ' · ' + (f0.model_source || f0.dxf?.source || '');
  const dl = el('dl', 'kv'); const row = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
  info.replaceChildren(el('h2', null, 'Scan detail'), dl);
  for (const f of floors) {
    const k = f.model_kinds || {}; const d = f.dxf || {};
    row('Floor', `${f.name} (elevation ${f.elevation} m)`);
    row('Render', status.find(s => s.startsWith(f.name)) || '—');
    row('Footprint', d.extent_m ? `${d.extent_m[0]} × ${d.extent_m[1]} m (${(d.extent_m[0] * 3.281).toFixed(0)} × ${(d.extent_m[1] * 3.281).toFixed(0)} ft)` : '—');
    row('Wall height', f.model_wall_height_m ? `${f.model_wall_height_m} m (${(f.model_wall_height_m * 3.281).toFixed(1)} ft), from scan` : '—');
    row('Model parts', `${k.wall || 0} walls · ${k.door || 0} doors · ${k.window || 0} windows · ${k.object || 0} objects`);
    row('Rooms', (f.rooms || []).map(r => r.label).join(', ') || 'none in scan');
    const cats = {}; for (const o of f.objects_labeled || []) cats[o.label] = (cats[o.label] || 0) + 1;
    row('Objects', Object.entries(cats).map(([a, n]) => `${a} ${n}`).join(', ') || '—');
    row('Radar sensors', (f.sensors || []).length ? f.sensors.map(s => s.label).join(', ') : 'None placed. LD2450 room tracking is unverified in HA records; add positions to floors[].sensors in data.json.');
  }
  if (!floors.some(f => f.id === 'upper')) row('Upper floor', 'Scan pending from Raj');

  const ro = new ResizeObserver(() => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); labels.setSize(W(), H()); composer?.setSize(W(), H()); }); ro.observe(host);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (!host.clientWidth || !host.clientHeight) return; // tab hidden
    const t = clock.getElapsedTime(); sweep.rotation.z = -t * 0.8;
    root.traverse(o => { if (o.userData.pulse) { const s = 1 + 0.25 * Math.sin(t * 3); o.scale.set(s, s, s); } });
    controls.update(); composer ? composer.render() : renderer.render(scene, camera); labels.render(scene, camera);
  });
  host.dataset.ready = '1';
}
