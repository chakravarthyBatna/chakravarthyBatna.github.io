import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches;

function setupThemeToggle() {
  const button = document.getElementById('theme-toggle');
  const sync = () => {
    const isLight = root.dataset.theme === 'light';
    button.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  };
  sync();
  button.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
    sync();
    window.dispatchEvent(new Event('themechange'));
  });
}

// The "How I work" cards lean toward the cursor.
function setupCardTilt() {
  if (reduceMotion || coarsePointer) return;
  const maxTilt = 7;
  document.querySelectorAll('.steps li').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `rotateX(${(-y * maxTilt).toFixed(2)}deg) rotateY(${(x * maxTilt).toFixed(2)}deg) translateZ(6px)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
}

function cssColor(name) {
  return new THREE.Color(getComputedStyle(root).getPropertyValue(name).trim());
}

function pickOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

// ---------- System description ----------

const COMPONENTS = {
  clients: { label: 'Clients', desc: 'Web and mobile apps sending HTTP requests' },
  lb: { label: 'Load balancer', desc: 'Spreads incoming traffic and terminates TLS' },
  gateway: { label: 'API gateway', desc: 'Routes each request to the right service and applies rate limits' },
  auth: { label: 'Auth service', desc: 'Login and tokens with Spring Security, running as 3 replicas' },
  users: { label: 'User service', desc: 'Reads profiles from the cache or the read replicas, running as 3 replicas' },
  orders: { label: 'Order service', desc: 'Writes orders to the primary and publishes events, running as 3 replicas' },
  redis: { label: 'Redis cluster', desc: 'Sessions and hot data kept in memory, split across 3 nodes' },
  replicas: { label: 'Read replicas', desc: 'Copies of the primary that serve read traffic' },
  primary: { label: 'PostgreSQL primary', desc: 'Every write lands here, then copies to the read replicas' },
  kafka: { label: 'Kafka', desc: 'Carries events so slow work happens in the background' },
  workers: { label: 'Workers', desc: 'Consume events to send emails, update search, and more' },
};

const TOUR = ['clients', 'lb', 'gateway', 'auth', 'users', 'orders', 'redis', 'replicas', 'primary', 'kafka', 'workers'];

const CLUSTERS = [
  { id: 'auth', y: 1.9 },
  { id: 'users', y: 0 },
  { id: 'orders', y: -1.9 },
];
const CLUSTER_X = -0.45;

const TIERS = [
  { label: 'Edge', x: -4.5 },
  { label: 'Services', x: CLUSTER_X },
  { label: 'Data', x: 2.85 },
  { label: 'Background jobs', x: 4.55 },
];

function setupScene() {
  const stage = document.getElementById('stage');
  const figure = document.getElementById('hero-stage');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    figure.hidden = true;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  stage.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 20, 40);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minAzimuthAngle = -0.6;
  controls.maxAzimuthAngle = 0.6;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.56;
  let dragging = false;
  controls.addEventListener('start', () => { dragging = true; });
  controls.addEventListener('end', () => { dragging = false; });
  // On phones, dragging the canvas would trap page scrolling, so the scene only sways there.
  if (coarsePointer) {
    controls.enabled = false;
    renderer.domElement.style.touchAction = 'pan-y';
  }

  // Glow on bright things (requests, events), dark theme only. Skipped on phones to save battery.
  let composer = null;
  let bloomPass = null;
  if (!coarsePointer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.45, 0.55);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  let bloomOn = false;

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(4, 7, 9);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
  rimLight.position.set(-6, -2, -5);
  scene.add(rimLight);

  const system = new THREE.Group();
  scene.add(system);

  const grid = new THREE.GridHelper(34, 44);
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);

  // Slowly drifting particles behind the system.
  const dustCount = coarsePointer ? 260 : 520;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = THREE.MathUtils.randFloatSpread(30);
    dustPositions[i * 3 + 1] = THREE.MathUtils.randFloat(-5, 9);
    dustPositions[i * 3 + 2] = THREE.MathUtils.randFloat(-14, 4);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({ size: 0.05, transparent: true, opacity: 0.5, depthWrite: false });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  // Shared materials and geometries.
  const edgeLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 });
  const frameMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.3 });
  const linkMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 });
  const faintLinkMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.18 });
  const replicationMaterial = new THREE.LineDashedMaterial({ dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.7 });

  const geometries = {
    client: new THREE.IcosahedronGeometry(0.32, 0),
    lb: new THREE.CylinderGeometry(0.5, 0.5, 0.3, 6),
    gateway: new THREE.OctahedronGeometry(0.5, 0),
    replica: new THREE.BoxGeometry(0.42, 0.42, 0.42),
    redis: new THREE.CylinderGeometry(0.3, 0.3, 0.18, 32),
    readReplica: new THREE.CylinderGeometry(0.32, 0.32, 0.62, 36),
    primary: new THREE.CylinderGeometry(0.48, 0.48, 0.9, 40),
    kafka: new THREE.CylinderGeometry(0.22, 0.22, 2.6, 8),
    worker: new THREE.TetrahedronGeometry(0.3, 0),
    frameLandscape: new THREE.EdgesGeometry(new THREE.BoxGeometry(1.1, 0.85, 2.35)),
    framePortrait: new THREE.EdgesGeometry(new THREE.BoxGeometry(0.85, 1.1, 2.35)),
    packet: new THREE.SphereGeometry(0.08, 14, 14),
    pulse: new THREE.IcosahedronGeometry(0.45, 1),
  };
  const edgeGeometryCache = new Map();
  function edgesOf(geometry) {
    if (!edgeGeometryCache.has(geometry)) edgeGeometryCache.set(geometry, new THREE.EdgesGeometry(geometry, 30));
    return edgeGeometryCache.get(geometry);
  }

  // ---------- Building the system ----------
  // The layout is written left-to-right. On tall screens it is turned so requests flow top-to-bottom.

  let portrait = null;
  let world = null;
  const packets = [];
  const pulses = [];

  function place(x, y, z) {
    return portrait ? new THREE.Vector3(y, -x * 0.95, z) : new THREE.Vector3(x, y, z);
  }

  function makeLabel(className, nameText, descText) {
    const el = document.createElement('div');
    el.className = className;
    const name = document.createElement('span');
    name.className = 'label-name';
    name.textContent = nameText;
    el.append(name);
    if (descText) {
      const desc = document.createElement('span');
      desc.className = 'label-desc';
      desc.textContent = descText;
      el.append(desc);
    }
    return el;
  }

  function clearSystem() {
    for (let i = packets.length - 1; i >= 0; i -= 1) removePacket(i);
    for (let i = pulses.length - 1; i >= 0; i -= 1) removePulse(i);
    while (system.children.length) {
      const child = system.children[0];
      system.remove(child);
      if (child.material && child.isMesh) child.material.dispose();
    }
  }

  function build() {
    clearSystem();
    const components = {};
    const pickables = [];
    const points = {};
    const meshesByPoint = {};
    const curves = {};

    for (const id of Object.keys(COMPONENTS)) components[id] = { id, meshes: [], labelEl: null };

    function addMesh(componentId, pointName, geometry, pos, { rotation, opacity = 1 } = {}) {
      const material = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.25, flatShading: true, transparent: opacity < 1, opacity });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(place(...pos));
      if (rotation) mesh.rotation.set(...rotation);
      mesh.add(new THREE.LineSegments(edgesOf(geometry), edgeLineMaterial));
      mesh.userData = { component: componentId, targetScale: 1, baseOpacity: opacity, down: false };
      system.add(mesh);
      components[componentId].meshes.push(mesh);
      pickables.push(mesh);
      if (pointName) {
        points[pointName] = mesh.position.clone();
        meshesByPoint[pointName] = mesh;
      }
    }

    [1.1, 0, -1.1].forEach((y, i) => addMesh('clients', `c${i}`, geometries.client, [-6.3, y, 0]));
    addMesh('lb', 'lb', geometries.lb, [-4.5, 0, 0], { rotation: [Math.PI / 2, 0, 0] });
    addMesh('gateway', 'gw', geometries.gateway, [-2.8, 0, 0]);

    for (const cluster of CLUSTERS) {
      const frame = new THREE.LineSegments(portrait ? geometries.framePortrait : geometries.frameLandscape, frameMaterial);
      frame.position.copy(place(CLUSTER_X, cluster.y, 0));
      system.add(frame);
      [-0.75, 0, 0.75].forEach((z, i) => addMesh(cluster.id, `${cluster.id}.r${i}`, geometries.replica, [CLUSTER_X, cluster.y, z]));
      points[`${cluster.id}.in`] = place(CLUSTER_X - 0.55, cluster.y, 0);
      points[`${cluster.id}.out`] = place(CLUSTER_X + 0.55, cluster.y, 0);
    }

    [-0.6, 0, 0.6].forEach((z, i) => addMesh('redis', `redis.d${i}`, geometries.redis, [2.75, 2.05, z]));
    points['redis.in'] = place(2.2, 2.05, 0);
    addMesh('replicas', 'rr0', geometries.readReplica, [3.0, 0.45, -0.8]);
    addMesh('replicas', 'rr1', geometries.readReplica, [3.0, 0.45, 0.8]);
    addMesh('primary', 'primary', geometries.primary, [2.9, -1.0, 0]);
    addMesh('kafka', null, geometries.kafka, [2.4, -2.55, 0.2], { rotation: portrait ? [0, 0, 0] : [0, 0, Math.PI / 2], opacity: 0.55 });
    points['kafka.in'] = place(1.1, -2.55, 0.2);
    points['kafka.out'] = place(3.7, -2.55, 0.2);
    addMesh('workers', 'w0', geometries.worker, [5.0, -2.15, -0.45]);
    addMesh('workers', 'w1', geometries.worker, [5.0, -2.95, 0.45]);

    function connect(a, b, lift = 0, material = linkMaterial) {
      const pa = points[a];
      const pb = points[b];
      const mid = pa.clone().lerp(pb, 0.5);
      // Arcs bend "up" in landscape and sideways in portrait, so they never cross a part.
      if (portrait) mid.x += lift; else mid.y += lift;
      const curve = new THREE.QuadraticBezierCurve3(pa.clone(), mid, pb.clone());
      curves[`${a}>${b}`] = curve;
      if (material) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), material);
        if (material.isLineDashedMaterial) line.computeLineDistances();
        system.add(line);
      }
    }

    [0, 1, 2].forEach((i) => connect(`c${i}`, 'lb', 0.2));
    connect('lb', 'gw', 0.2);
    for (const cluster of CLUSTERS) {
      connect('gw', `${cluster.id}.in`, 0.25);
      [0, 1, 2].forEach((i) => {
        connect(`${cluster.id}.in`, `${cluster.id}.r${i}`, 0, faintLinkMaterial);
        connect(`${cluster.id}.r${i}`, `${cluster.id}.out`, 0, faintLinkMaterial);
      });
    }
    connect('auth.out', 'redis.in', 0.3);
    connect('users.out', 'redis.in', 0.6);
    [0, 1, 2].forEach((i) => connect('redis.in', `redis.d${i}`, 0, faintLinkMaterial));
    connect('users.out', 'rr0', 0.3);
    connect('users.out', 'rr1', 0.3);
    connect('orders.out', 'primary', 0.3);
    connect('primary', 'rr0', 0, replicationMaterial);
    connect('primary', 'rr1', 0, replicationMaterial);
    connect('orders.out', 'kafka.in', -0.2);
    connect('kafka.in', 'kafka.out', 0, null);
    connect('kafka.out', 'w0', 0.2);
    connect('kafka.out', 'w1', -0.1);

    // Bounds of the whole system, used for labels, the floor and the camera.
    const bounds = new THREE.Box3().setFromObject(system);
    const boundsSize = bounds.getSize(new THREE.Vector3());

    // One label per component, hidden until the tour or a hover activates it.
    // Labels sit above a part, or below it when the part is near the top edge.
    for (const [id, info] of Object.entries(COMPONENTS)) {
      const box = new THREE.Box3();
      components[id].meshes.forEach((mesh) => box.expandByObject(mesh));
      const center = box.getCenter(new THREE.Vector3());
      const below = center.y > bounds.max.y - boundsSize.y * 0.3;
      const labelEl = makeLabel('node-label', info.label, info.desc);
      const label = new CSS2DObject(labelEl);
      label.position.set(center.x, below ? box.min.y - 0.12 : box.max.y + 0.12, center.z);
      label.center.set(0.5, below ? 0 : 1);
      system.add(label);
      components[id].labelEl = labelEl;
    }

    const floorY = bounds.min.y - 0.45;
    grid.position.set(bounds.getCenter(new THREE.Vector3()).x, floorY, 0);

    // Column headings above the system. On phones the tour and legend explain the layout instead.
    if (!portrait) {
      for (const tier of TIERS) {
        const tierLabel = new CSS2DObject(makeLabel('tier-label', tier.label));
        tierLabel.position.set(tier.x, bounds.max.y + 0.55, 0);
        tierLabel.center.set(0.5, 1);
        system.add(tierLabel);
      }
    }

    const fitBox = bounds.clone();
    fitBox.min.y = floorY;
    fitBox.max.y += portrait ? 0.35 : 0.9;
    world = { components, pickables, points, meshesByPoint, curves, fitBox };
  }

  // ---------- Routes ----------

  function leg(a, b) {
    const { curves } = world;
    if (curves[`${a}>${b}`]) return { curve: curves[`${a}>${b}`], reverse: false, end: b };
    return { curve: curves[`${b}>${a}`], reverse: true, end: b };
  }

  function pathThrough(names) {
    const legs = [];
    for (let i = 0; i < names.length - 1; i += 1) legs.push(leg(names[i], names[i + 1]));
    return legs;
  }

  function healthyReplica(clusterId) {
    const healthy = [0, 1, 2].filter((i) => !world.meshesByPoint[`${clusterId}.r${i}`].userData.down);
    return `${clusterId}.r${pickOne(healthy)}`;
  }

  // A request picks a service, a healthy replica, and a data store, then returns the same way.
  function requestPath() {
    const roll = Math.random();
    const clusterId = roll < 0.3 ? 'auth' : roll < 0.65 ? 'users' : 'orders';
    let store;
    if (clusterId === 'auth') store = ['redis.in', `redis.d${Math.floor(Math.random() * 3)}`];
    else if (clusterId === 'users') store = Math.random() < 0.55 ? ['redis.in', `redis.d${Math.floor(Math.random() * 3)}`] : [pickOne(['rr0', 'rr1'])];
    else store = ['primary'];
    const outbound = [pickOne(['c0', 'c1', 'c2']), 'lb', 'gw', `${clusterId}.in`, healthyReplica(clusterId), `${clusterId}.out`, ...store];
    return pathThrough([...outbound, ...outbound.slice(0, -1).reverse()]);
  }

  // ---------- Moving packets ----------

  const TRAIL_LENGTH = 4;
  let requestCount = 0;
  const packetToken = { request: '--signal', bug: '--bug', fixed: '--ok', event: '--event', replication: '--accent' };

  function spawnPacket(kind, path, { trail = true, size = 1, speed = 0.9 } = {}) {
    const head = new THREE.Mesh(geometries.packet, new THREE.MeshBasicMaterial());
    head.scale.setScalar(size);
    system.add(head);
    const ghosts = [];
    if (trail) {
      for (let k = 0; k < TRAIL_LENGTH; k += 1) {
        const ghost = new THREE.Mesh(geometries.packet, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 * (1 - k / TRAIL_LENGTH), depthWrite: false }));
        ghost.scale.setScalar(size * 0.85 * (1 - k / (TRAIL_LENGTH + 1)));
        system.add(ghost);
        ghosts.push(ghost);
      }
    }
    const packet = { kind, state: kind, path, segment: 0, t: 0, speed: speed * (0.9 + Math.random() * 0.25), head, ghosts, wrote: false };
    packets.push(packet);
    paintPacket(packet);
    placePacket(packet);
    return packet;
  }

  function spawnRequest() {
    requestCount += 1;
    const isBug = requestCount % 7 === 0;
    return spawnPacket(isBug ? 'bug' : 'request', requestPath(), { size: isBug ? 1.45 : 1 });
  }

  function paintPacket(packet) {
    const color = cssColor(packetToken[packet.state]);
    packet.head.material.color.copy(color);
    packet.ghosts.forEach((ghost) => ghost.material.color.copy(color));
  }

  function placePacket(packet) {
    const current = packet.path[packet.segment];
    const at = (t) => (current.reverse ? 1 - t : t);
    current.curve.getPoint(at(packet.t), packet.head.position);
    packet.ghosts.forEach((ghost, k) => {
      current.curve.getPoint(at(Math.max(0, packet.t - 0.05 * (k + 1))), ghost.position);
    });
  }

  function removePacket(index) {
    const packet = packets[index];
    [packet.head, ...packet.ghosts].forEach((mesh) => {
      system.remove(mesh);
      mesh.material.dispose();
    });
    packets.splice(index, 1);
  }

  function emitPulse(position, token = '--ok') {
    const material = new THREE.MeshBasicMaterial({ color: cssColor(token), wireframe: true, transparent: true, opacity: 0.7 });
    const mesh = new THREE.Mesh(geometries.pulse, material);
    mesh.position.copy(position);
    system.add(mesh);
    pulses.push({ mesh, age: 0, token });
  }

  function removePulse(index) {
    const pulse = pulses[index];
    system.remove(pulse.mesh);
    pulse.mesh.material.dispose();
    pulses.splice(index, 1);
  }

  function onLegFinished(packet, finished) {
    // Bugs get fixed once they reach a service replica.
    if (packet.state === 'bug' && /\.r\d$/.test(finished.end)) {
      packet.state = 'fixed';
      paintPacket(packet);
      emitPulse(world.points[finished.end]);
    }
    // A write on the primary copies to the read replicas and publishes an event.
    if ((packet.kind === 'request' || packet.kind === 'bug') && finished.end === 'primary' && !packet.wrote) {
      packet.wrote = true;
      spawnPacket('replication', pathThrough(['primary', 'rr0']), { trail: false, size: 0.7, speed: 1.3 });
      spawnPacket('replication', pathThrough(['primary', 'rr1']), { trail: false, size: 0.7, speed: 1.3 });
      spawnPacket('event', pathThrough(['orders.out', 'kafka.in', 'kafka.out', pickOne(['w0', 'w1'])]), { speed: 0.75 });
    }
  }

  // ---------- Replica failures ----------

  let downReplica = null;
  let downTimeLeft = 0;
  let nextFailureIn = 5;

  function failRandomReplica() {
    const cluster = pickOne(CLUSTERS);
    downReplica = world.meshesByPoint[`${cluster.id}.r${Math.floor(Math.random() * 3)}`];
    downReplica.userData.down = true;
    downTimeLeft = 4.5;
    paintNodes();
  }

  function recoverReplica() {
    downReplica.userData.down = false;
    downReplica.rotation.z = 0;
    emitPulse(downReplica.position);
    downReplica = null;
    nextFailureIn = 7 + Math.random() * 4;
    paintNodes();
  }

  // ---------- Highlight: guided tour, overridden by hover ----------

  let hovered = null;
  let tourCurrent = null;
  let tourIndex = -1;
  let tourTimer = 1.2;
  let shown = null;

  function refreshHighlight() {
    const active = hovered || tourCurrent;
    if (active === shown) return;
    if (shown) {
      world.components[shown].labelEl.classList.remove('is-active');
      world.components[shown].meshes.forEach((m) => { m.userData.targetScale = 1; });
    }
    shown = active;
    if (shown) {
      world.components[shown].labelEl.classList.add('is-active');
      world.components[shown].meshes.forEach((m) => { m.userData.targetScale = 1.18; });
    }
    paintNodes();
    if (reduceMotion) {
      world.pickables.forEach((m) => m.scale.setScalar(m.userData.targetScale));
      render();
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(world.pickables, false)[0];
    const next = hit ? hit.object.userData.component : null;
    if (next === hovered) return;
    hovered = next;
    if (!hovered) tourTimer = Math.max(tourTimer, 2);
    renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    refreshHighlight();
  }

  renderer.domElement.addEventListener('pointermove', pick);
  renderer.domElement.addEventListener('pointerdown', pick);
  renderer.domElement.addEventListener('pointerleave', () => {
    hovered = null;
    renderer.domElement.style.cursor = '';
    refreshHighlight();
  });

  // ---------- Colors ----------

  const black = new THREE.Color(0x000000);

  function paintNodes() {
    const accent = cssColor('--accent');
    const bug = cssColor('--bug');
    for (const mesh of world.pickables) {
      const isActive = mesh.userData.component === shown;
      const { down, baseOpacity } = mesh.userData;
      mesh.material.color.copy(down ? bug : accent);
      mesh.material.transparent = down || baseOpacity < 1;
      mesh.material.opacity = down ? 0.4 : baseOpacity;
      mesh.material.emissive.copy(isActive ? accent : black);
      mesh.material.emissiveIntensity = isActive ? 0.5 : 0;
    }
  }

  function applyTheme() {
    const bg = cssColor('--bg');
    bloomOn = Boolean(composer) && root.dataset.theme !== 'light';
    // Bloom needs a solid background; without it the canvas stays transparent over the page.
    scene.background = bloomOn ? bg : null;
    scene.fog.color.copy(bg);
    paintNodes();
    edgeLineMaterial.color.copy(cssColor('--text'));
    frameMaterial.color.copy(cssColor('--muted'));
    linkMaterial.color.copy(cssColor('--muted'));
    faintLinkMaterial.color.copy(cssColor('--muted'));
    replicationMaterial.color.copy(cssColor('--accent'));
    grid.material.color.copy(cssColor('--muted'));
    dustMaterial.color.copy(cssColor('--muted'));
    packets.forEach(paintPacket);
    pulses.forEach((p) => p.mesh.material.color.copy(cssColor(p.token)));
    render();
  }

  // ---------- Layout and rendering ----------

  const viewDirection = new THREE.Vector3(0.12, 0.3, 1).normalize();

  function resize() {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    if (composer) {
      composer.setSize(w, h);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const nextPortrait = camera.aspect < 0.9;
    if (nextPortrait !== portrait) {
      portrait = nextPortrait;
      downReplica = null;
      hovered = null;
      shown = null;
      build();
      applyTheme();
    }

    // Fit the camera so the whole system fills the panel.
    const { fitBox } = world;
    const size = fitBox.getSize(new THREE.Vector3());
    const center = fitBox.getCenter(new THREE.Vector3());
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max((size.y / 2) / halfFov, (size.x / 2) / (halfFov * camera.aspect)) * 1.04 + size.z / 2;
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(viewDirection, distance);
    scene.fog.near = distance + 3;
    scene.fog.far = distance + 22;
    controls.update();
    render();
  }

  function render() {
    if (bloomOn) composer.render();
    else renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  let elapsed = 0;

  function step(dt) {
    elapsed += dt;

    for (let i = packets.length - 1; i >= 0; i -= 1) {
      const packet = packets[i];
      packet.t += dt * packet.speed;
      if (packet.t >= 1) {
        onLegFinished(packet, packet.path[packet.segment]);
        packet.segment += 1;
        packet.t = 0;
        if (packet.segment >= packet.path.length) {
          removePacket(i);
          continue;
        }
      }
      placePacket(packet);
    }

    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i];
      pulse.age += dt;
      pulse.mesh.scale.setScalar(1 + pulse.age * 1.6);
      pulse.mesh.material.opacity = 0.7 * (1 - pulse.age);
      if (pulse.age >= 1) removePulse(i);
    }

    if (downReplica) {
      downTimeLeft -= dt;
      downReplica.rotation.z = Math.sin(elapsed * 18) * 0.08;
      if (downTimeLeft <= 0) recoverReplica();
    } else {
      nextFailureIn -= dt;
      if (nextFailureIn <= 0) failRandomReplica();
    }

    if (!hovered) {
      tourTimer -= dt;
      if (tourTimer <= 0) {
        tourIndex = (tourIndex + 1) % TOUR.length;
        tourCurrent = TOUR[tourIndex];
        tourTimer = 3.2;
        refreshHighlight();
      }
    }

    for (const mesh of world.pickables) {
      mesh.scale.setScalar(THREE.MathUtils.lerp(mesh.scale.x, mesh.userData.targetScale, Math.min(1, dt * 10)));
    }
    world.components.gateway.meshes[0].rotation.y += dt * 0.4;
    world.components.clients.meshes.forEach((m, i) => { m.rotation.y += dt * (0.2 + i * 0.05); });
    world.components.workers.meshes.forEach((m) => { m.rotation.y -= dt * 0.5; });

    // The whole system sways gently unless someone is hovering or dragging.
    if (!hovered && !dragging) {
      system.rotation.y = THREE.MathUtils.lerp(system.rotation.y, Math.sin(elapsed * 0.16) * 0.22, Math.min(1, dt * 2));
    }
    dust.rotation.y += dt * 0.012;
  }

  resize();
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('themechange', applyTheme);

  if (reduceMotion) {
    // A still frame with traffic on the wire; hovering still explains each part.
    for (let i = 0; i < 6; i += 1) {
      const packet = spawnRequest();
      packet.segment = Math.min(i, packet.path.length - 1);
      packet.t = 0.5;
      placePacket(packet);
    }
    controls.addEventListener('change', render);
    render();
    return;
  }

  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(stage);

  const clock = new THREE.Clock();
  let sinceSpawn = 0.5;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    sinceSpawn += dt;
    const requestsInFlight = packets.filter((p) => p.kind === 'request' || p.kind === 'bug').length;
    if (sinceSpawn > 0.42 && requestsInFlight < 18) {
      spawnRequest();
      sinceSpawn = 0;
    }
    step(dt);
    controls.update();
    render();
  });
}

// Start up once every constant above is defined.
setupThemeToggle();
setupCardTilt();
setupScene();
