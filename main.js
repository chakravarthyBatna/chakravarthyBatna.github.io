import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

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

// Each part belongs to a layer; the layer decides its color.
// `wide` and `tall` say where the name label goes in the wide (desktop) and tall (phone) layouts;
// `short` is the name used on phones, where parts sit closer together.
const COMPONENTS = {
  clients: { layer: '--c-edge', label: 'Clients', short: 'Clients', wide: 'above', tall: 'right', desc: 'Web and mobile apps sending HTTP requests' },
  lb: { layer: '--c-edge', label: 'Load balancer', short: 'Load balancer', wide: 'below', tall: 'right', desc: 'Spreads incoming traffic and terminates TLS' },
  gateway: { layer: '--c-edge', label: 'API gateway', short: 'API gateway', wide: 'above', tall: 'right', desc: 'Routes each request to the right service and applies rate limits' },
  auth: { layer: '--c-service', label: 'Auth service ×3', short: 'Auth ×3', wide: 'below', tall: 'below', desc: 'Login and tokens with Spring Security, running as 3 replicas' },
  users: { layer: '--c-service', label: 'User service ×3', short: 'Users ×3', wide: 'above', tall: 'below', desc: 'Reads profiles from the cache or the read replicas, running as 3 replicas' },
  orders: { layer: '--c-service', label: 'Order service ×3', short: 'Orders ×3', wide: 'above', tall: 'below', desc: 'Writes orders to the primary and publishes events, running as 3 replicas' },
  redis: { layer: '--c-data', label: 'Redis cluster', short: 'Redis', wide: 'below', tall: 'below', desc: 'Sessions and hot data kept in memory, split across 3 nodes' },
  replicas: { layer: '--c-data', label: 'Read replicas', short: 'Replicas', wide: 'right', tall: 'below', desc: 'Copies of the primary that serve read traffic' },
  primary: { layer: '--c-data', label: 'PostgreSQL primary', short: 'Postgres', wide: 'above', tall: 'below', desc: 'Every write lands here, then copies to the read replicas' },
  kafka: { layer: '--c-async', label: 'Kafka', short: 'Kafka', wide: 'above', tall: 'above', desc: 'Carries events so slow work happens in the background' },
  workers: { layer: '--c-async', label: 'Workers', short: 'Workers', wide: 'above', tall: 'below', desc: 'Consume events to send emails, update search, and more' },
};

const CLUSTERS = [
  { id: 'auth', y: 1.9 },
  { id: 'users', y: 0 },
  { id: 'orders', y: -1.9 },
];
const CLUSTER_X = -0.45;

function setupScene() {
  const stage = document.getElementById('stage');
  const figure = document.getElementById('hero-stage');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    figure.hidden = true;
    return;
  }
  // Render at the screen's full sharpness (capped at 2x to keep phones fast).
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  stage.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  // Drag to turn the system all the way around; it also spins on its own.
  controls.minPolarAngle = Math.PI * 0.08;
  controls.maxPolarAngle = Math.PI * 0.8;
  controls.rotateSpeed = 0.8;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 1.6;
  // On phones, a sideways swipe turns the system while an up/down swipe still scrolls the page.
  if (coarsePointer) renderer.domElement.style.touchAction = 'pan-y';

  // White key light plus two colored side lights give the parts depth and color.
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(3, 8, 10);
  scene.add(keyLight);
  const coolLight = new THREE.PointLight(0x5b8def, 30, 30);
  coolLight.position.set(-7, 3, 5);
  scene.add(coolLight);
  const warmLight = new THREE.PointLight(0xa78bfa, 26, 30);
  warmLight.position.set(7, -2, 5);
  scene.add(warmLight);

  const system = new THREE.Group();
  scene.add(system);

  const grid = new THREE.GridHelper(30, 36);
  grid.material.transparent = true;
  grid.material.opacity = 0.12;
  scene.add(grid);

  // Shared materials and geometries.
  const edgeLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.22 });
  const linkMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 });
  const replicationMaterial = new THREE.LineDashedMaterial({ dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.7 });

  const geometries = {
    client: new THREE.IcosahedronGeometry(0.32, 0),
    lb: new THREE.CylinderGeometry(0.5, 0.5, 0.3, 6),
    gateway: new THREE.OctahedronGeometry(0.5, 0),
    replica: new THREE.BoxGeometry(0.42, 0.42, 0.42),
    pad: new THREE.BoxGeometry(1.0, 0.05, 2.4),
    redis: new THREE.CylinderGeometry(0.3, 0.3, 0.18, 40),
    readReplica: new THREE.CylinderGeometry(0.32, 0.32, 0.62, 48),
    primary: new THREE.CylinderGeometry(0.48, 0.48, 0.9, 48),
    kafka: new THREE.CylinderGeometry(0.22, 0.22, 2.6, 32),
    worker: new THREE.TetrahedronGeometry(0.3, 0),
    packet: new THREE.SphereGeometry(0.075, 16, 16),
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

  function makeLabel(nameText, descText) {
    const el = document.createElement('div');
    el.className = 'node-label';
    const name = document.createElement('span');
    name.className = 'label-name';
    name.textContent = nameText;
    const desc = document.createElement('span');
    desc.className = 'label-desc';
    desc.textContent = descText;
    el.append(name, desc);
    return el;
  }

  function clearSystem() {
    for (let i = packets.length - 1; i >= 0; i -= 1) removePacket(i);
    for (let i = pulses.length - 1; i >= 0; i -= 1) removePulse(i);
    while (system.children.length) {
      const child = system.children[0];
      system.remove(child);
      if (child.isMesh) child.material.dispose();
    }
  }

  function build() {
    clearSystem();
    const components = {};
    const pickables = [];
    const pads = [];
    const points = {};
    const meshesByPoint = {};
    const curves = {};

    for (const id of Object.keys(COMPONENTS)) components[id] = { id, meshes: [], labelEl: null };

    function addMesh(componentId, pointName, geometry, pos, { rotation, opacity = 1 } = {}) {
      const material = new THREE.MeshPhysicalMaterial({
        roughness: 0.32,
        metalness: 0.15,
        clearcoat: 0.8,
        clearcoatRoughness: 0.25,
        transparent: opacity < 1,
        opacity,
      });
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
      // A glowing pad under each cluster groups its three replicas without extra lines.
      const pad = new THREE.Mesh(geometries.pad, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false }));
      pad.position.copy(place(CLUSTER_X, cluster.y, 0));
      pad.position.y -= 0.32;
      system.add(pad);
      pads.push(pad);
      [-0.75, 0, 0.75].forEach((z, i) => addMesh(cluster.id, `${cluster.id}.r${i}`, geometries.replica, [CLUSTER_X, cluster.y, z]));
      points[`${cluster.id}.in`] = place(CLUSTER_X - 0.55, cluster.y, 0);
      points[`${cluster.id}.out`] = place(CLUSTER_X + 0.55, cluster.y, 0);
    }

    [-0.6, 0, 0.6].forEach((z, i) => addMesh('redis', `redis.d${i}`, geometries.redis, [2.75, 2.05, z]));
    points['redis.in'] = place(2.2, 2.05, 0);
    addMesh('replicas', 'rr0', geometries.readReplica, [3.0, 0.45, -0.8]);
    addMesh('replicas', 'rr1', geometries.readReplica, [3.0, 0.45, 0.8]);
    addMesh('primary', 'primary', geometries.primary, [2.9, -1.0, 0]);
    addMesh('kafka', null, geometries.kafka, [2.4, -2.55, 0.2], { rotation: portrait ? [0, 0, 0] : [0, 0, Math.PI / 2], opacity: 0.6 });
    points['kafka.in'] = place(1.1, -2.55, 0.2);
    points['kafka.out'] = place(3.7, -2.55, 0.2);
    addMesh('workers', 'w0', geometries.worker, [5.0, -2.15, -0.45]);
    addMesh('workers', 'w1', geometries.worker, [5.0, -2.95, 0.45]);

    // Visible links between parts. Hops inside a cluster or the Redis group stay invisible.
    function connect(a, b, lift = 0, material = linkMaterial) {
      const pa = points[a];
      const pb = points[b];
      const mid = pa.clone().lerp(pb, 0.5);
      // Arcs bend up in landscape and sideways in portrait, so they never cross a part.
      if (portrait) mid.x += lift; else mid.y += lift;
      const curve = new THREE.QuadraticBezierCurve3(pa.clone(), mid, pb.clone());
      curves[`${a}>${b}`] = curve;
      if (material) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), material);
        if (material.isLineDashedMaterial) line.computeLineDistances();
        system.add(line);
      }
    }

    [0, 1, 2].forEach((i) => connect(`c${i}`, 'lb', 0.2));
    connect('lb', 'gw', 0.2);
    for (const cluster of CLUSTERS) {
      connect('gw', `${cluster.id}.in`, 0.25);
      [0, 1, 2].forEach((i) => {
        connect(`${cluster.id}.in`, `${cluster.id}.r${i}`, 0, null);
        connect(`${cluster.id}.r${i}`, `${cluster.id}.out`, 0, null);
      });
    }
    connect('auth.out', 'redis.in', 0.3);
    connect('users.out', 'redis.in', 0.6);
    [0, 1, 2].forEach((i) => connect('redis.in', `redis.d${i}`, 0, null));
    connect('users.out', 'rr0', 0.3);
    connect('users.out', 'rr1', 0.3);
    connect('orders.out', 'primary', 0.3);
    connect('primary', 'rr0', 0, replicationMaterial);
    connect('primary', 'rr1', 0, replicationMaterial);
    connect('orders.out', 'kafka.in', -0.2);
    connect('kafka.in', 'kafka.out', 0, null);
    connect('kafka.out', 'w0', 0.2);
    connect('kafka.out', 'w1', -0.1);

    const bounds = new THREE.Box3().setFromObject(system);

    // Every part has a small name label; hovering or tapping a part expands it with a description.
    for (const [id, info] of Object.entries(COMPONENTS)) {
      const box = new THREE.Box3();
      components[id].meshes.forEach((mesh) => box.expandByObject(mesh));
      const center = box.getCenter(new THREE.Vector3());
      const side = portrait ? info.tall : info.wide;
      const labelEl = makeLabel(portrait ? info.short : info.label, info.desc);
      const label = new CSS2DObject(labelEl);
      if (side === 'right') {
        label.position.set(box.max.x + 0.15, center.y, center.z);
        label.center.set(0, 0.5);
      } else if (side === 'below') {
        label.position.set(center.x, box.min.y - 0.15, center.z);
        label.center.set(0.5, 0);
      } else {
        label.position.set(center.x, box.max.y + 0.12, center.z);
        label.center.set(0.5, 1);
      }
      system.add(label);
      components[id].labelEl = labelEl;
    }

    const floorY = bounds.min.y - 0.45;
    grid.position.set(bounds.getCenter(new THREE.Vector3()).x, floorY, 0);

    const fitBox = bounds.clone();
    fitBox.min.y = floorY;
    fitBox.max.y += 0.45;
    world = { components, pickables, pads, points, meshesByPoint, curves, fitBox };
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

  const TRAIL_LENGTH = 3;
  let requestCount = 0;
  const packetToken = { request: '--signal', bug: '--bug', fixed: '--ok', event: '--event', replication: '--c-data' };

  function spawnPacket(kind, path, { trail = true, size = 1, speed = 0.9 } = {}) {
    const head = new THREE.Mesh(geometries.packet, new THREE.MeshBasicMaterial());
    head.scale.setScalar(size);
    system.add(head);
    const ghosts = [];
    if (trail) {
      for (let k = 0; k < TRAIL_LENGTH; k += 1) {
        const ghost = new THREE.Mesh(geometries.packet, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 * (1 - k / TRAIL_LENGTH), depthWrite: false }));
        ghost.scale.setScalar(size * 0.8 * (1 - k / (TRAIL_LENGTH + 1)));
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
    return spawnPacket(isBug ? 'bug' : 'request', requestPath(), { size: isBug ? 1.5 : 1 });
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

  // ---------- Highlight on hover ----------

  let hovered = null;
  let shown = null;

  function refreshHighlight() {
    const active = hovered;
    if (active === shown) return;
    if (shown) {
      const previous = world.components[shown].labelEl;
      previous.classList.remove('is-active');
      previous.style.marginLeft = '';
      previous.style.marginTop = '';
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
    if (!world) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(world.pickables, false)[0];
    const next = hit ? hit.object.userData.component : null;
    if (next === hovered) return;
    setHovered(next);
  }

  // The description card shows only while a part is hovered (or tapped), and the spin pauses
  // so the card stays readable.
  function setHovered(next) {
    hovered = next;
    controls.autoRotate = !reduceMotion && !hovered;
    renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    refreshHighlight();
  }

  renderer.domElement.addEventListener('pointermove', pick);
  renderer.domElement.addEventListener('pointerdown', pick);
  renderer.domElement.addEventListener('pointerleave', () => {
    if (hovered) setHovered(null);
  });

  // ---------- Colors ----------

  const black = new THREE.Color(0x000000);

  function paintNodes() {
    const bug = cssColor('--bug');
    for (const mesh of world.pickables) {
      const { component, down, baseOpacity } = mesh.userData;
      const layerColor = cssColor(COMPONENTS[component].layer);
      const isActive = component === shown;
      mesh.material.color.copy(down ? bug : layerColor);
      mesh.material.transparent = down || baseOpacity < 1;
      mesh.material.opacity = down ? 0.45 : baseOpacity;
      mesh.material.emissive.copy(isActive ? layerColor : black);
      mesh.material.emissiveIntensity = isActive ? 0.55 : 0;
    }
  }

  function applyTheme() {
    if (!world) return;
    paintNodes();
    world.pads.forEach((pad) => pad.material.color.copy(cssColor('--c-service')));
    edgeLineMaterial.color.copy(cssColor('--text'));
    linkMaterial.color.copy(cssColor('--muted'));
    replicationMaterial.color.copy(cssColor('--c-data'));
    grid.material.color.copy(cssColor('--muted'));
    packets.forEach(paintPacket);
    pulses.forEach((p) => p.mesh.material.color.copy(cssColor(p.token)));
    render();
  }

  // ---------- Layout and rendering ----------

  const viewDirection = new THREE.Vector3(0.12, 0.28, 1).normalize();
  let fitted = false;

  function resize() {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
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
      controls.autoRotate = !reduceMotion;
    }

    // Fit the camera so the whole system fills the panel.
    const { fitBox } = world;
    const size = fitBox.getSize(new THREE.Vector3());
    const center = fitBox.getCenter(new THREE.Vector3());
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max((size.y / 2) / halfFov, (size.x / 2) / (halfFov * camera.aspect)) * 1.03 + size.z / 2;
    // Keep whatever angle the visitor has turned to; only the first fit uses the default view.
    const direction = fitted ? camera.position.clone().sub(controls.target).normalize() : viewDirection;
    fitted = true;
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.update();
    render();
  }

  function render() {
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    if (!world) return;
    // Seen from the side, every part lines up and the names pile on top of each other,
    // so the small names fade out until the system turns back toward the front or back.
    const sideOn = Math.abs(Math.sin(controls.getAzimuthalAngle())) > 0.7;
    labelRenderer.domElement.classList.toggle('labels-faded', sideOn);
    for (const component of Object.values(world.components)) keepInsidePanel(component.labelEl);
    // The label renderer stacks labels by depth; keep the expanded card above its neighbours.
    if (shown) world.components[shown].labelEl.style.zIndex = '10000';
  }

  // Parts near an edge (like the clients) would push half their label outside the panel,
  // where it gets clipped. Nudge the label back inside with margins.
  function keepInsidePanel(card) {
    const panel = labelRenderer.domElement.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const shiftX = parseFloat(card.style.marginLeft) || 0;
    const shiftY = parseFloat(card.style.marginTop) || 0;
    const left = rect.left - shiftX;
    const right = rect.right - shiftX;
    const top = rect.top - shiftY;
    const bottom = rect.bottom - shiftY;
    const gap = 8;
    let dx = 0;
    let dy = 0;
    if (left < panel.left + gap) dx = panel.left + gap - left;
    else if (right > panel.right - gap) dx = panel.right - gap - right;
    if (top < panel.top + gap) dy = panel.top + gap - top;
    else if (bottom > panel.bottom - gap) dy = panel.bottom - gap - bottom;
    card.style.marginLeft = `${dx}px`;
    card.style.marginTop = `${dy}px`;
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

    for (const mesh of world.pickables) {
      mesh.scale.setScalar(THREE.MathUtils.lerp(mesh.scale.x, mesh.userData.targetScale, Math.min(1, dt * 10)));
    }
    world.components.gateway.meshes[0].rotation.y += dt * 0.4;
    world.components.clients.meshes.forEach((m, i) => { m.rotation.y += dt * (0.2 + i * 0.05); });
    world.components.workers.meshes.forEach((m) => { m.rotation.y -= dt * 0.5; });
  }

  resize();
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('themechange', applyTheme);

  if (reduceMotion) {
    // A still frame with traffic on the wire; hovering still explains each part.
    for (let i = 0; world && i < 6; i += 1) {
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
    // Nothing to animate until the panel has a size and the system is built.
    if (!world || !visible || document.hidden) return;
    sinceSpawn += dt;
    const requestsInFlight = packets.filter((p) => p.kind === 'request' || p.kind === 'bug').length;
    if (sinceSpawn > 0.45 && requestsInFlight < 16) {
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
