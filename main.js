import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches;

setupThemeToggle();
setupCardTilt();
setupScene();

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
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  camera.position.set(1.2, 3.2, 18);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-0.6, 0, 0);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minAzimuthAngle = -0.8;
  controls.maxAzimuthAngle = 0.8;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.62;
  let dragging = false;
  controls.addEventListener('start', () => { dragging = true; });
  controls.addEventListener('end', () => { dragging = false; });
  // On phones, dragging the canvas would trap page scrolling, so the scene only sways there.
  if (coarsePointer) {
    controls.enabled = false;
    renderer.domElement.style.touchAction = 'pan-y';
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(4, 7, 9);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
  rimLight.position.set(-6, -2, -5);
  scene.add(rimLight);

  const system = new THREE.Group();
  system.position.x = 0.6;
  scene.add(system);

  // Faint floor grid gives the scene a sense of depth.
  const grid = new THREE.GridHelper(22, 30);
  grid.position.set(-0.6, -3.5, 0);
  grid.material.transparent = true;
  grid.material.opacity = 0.16;
  scene.add(grid);

  // Slowly drifting particles behind the system.
  const dustCount = coarsePointer ? 240 : 480;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = THREE.MathUtils.randFloatSpread(26);
    dustPositions[i * 3 + 1] = THREE.MathUtils.randFloat(-4, 7);
    dustPositions[i * 3 + 2] = THREE.MathUtils.randFloat(-12, 6);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({ size: 0.05, transparent: true, opacity: 0.5, depthWrite: false });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  // ---------- Components ----------

  const edgeLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 });
  const frameMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.32 });
  const linkMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
  const faintLinkMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.2 });
  const replicationMaterial = new THREE.LineDashedMaterial({ dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.7 });

  const components = {};
  const pickables = [];
  const points = {};
  const meshesByPoint = {};

  // Labels sit above their part and grow upward; `below` flips that for crowded spots.
  function addComponent(id, label, short, desc, labelPos, { below = false } = {}) {
    const labelEl = document.createElement('div');
    labelEl.className = 'node-label';
    const name = document.createElement('span');
    name.className = 'node-name';
    const full = document.createElement('span');
    full.className = 'name-full';
    full.textContent = label;
    const shortEl = document.createElement('span');
    shortEl.className = 'name-short';
    shortEl.textContent = short;
    name.append(full, shortEl);
    const descEl = document.createElement('span');
    descEl.className = 'node-desc';
    descEl.textContent = desc;
    labelEl.append(name, descEl);
    const labelObject = new CSS2DObject(labelEl);
    labelObject.position.set(...labelPos);
    labelObject.center.set(0.5, below ? 0 : 1);
    system.add(labelObject);
    components[id] = { id, meshes: [], labelEl };
  }

  function addMesh(componentId, pointName, geometry, pos, { rotation, opacity = 1 } = {}) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.25, flatShading: true, transparent: opacity < 1, opacity });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...pos);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeLineMaterial));
    mesh.userData = { component: componentId, targetScale: 1, baseOpacity: opacity, down: false };
    system.add(mesh);
    components[componentId].meshes.push(mesh);
    pickables.push(mesh);
    if (pointName) {
      points[pointName] = mesh.position.clone();
      meshesByPoint[pointName] = mesh;
    }
    return mesh;
  }

  // Clients
  addComponent('clients', 'Clients', 'Clients', 'Web and mobile apps sending HTTP requests', [-6.3, 1.5, 0]);
  const clientGeometry = new THREE.IcosahedronGeometry(0.32, 0);
  [1.1, 0, -1.1].forEach((y, i) => addMesh('clients', `c${i}`, clientGeometry, [-6.3, y, 0]));

  // Edge
  addComponent('lb', 'Load balancer', 'LB', 'Spreads incoming traffic and terminates TLS', [-4.5, -0.6, 0], { below: true });
  addMesh('lb', 'lb', new THREE.CylinderGeometry(0.5, 0.5, 0.3, 6), [-4.5, 0, 0], { rotation: [Math.PI / 2, 0, 0] });

  addComponent('gateway', 'API gateway', 'Gateway', 'Routes each request to the right service and applies rate limits', [-2.8, 0.6, 0]);
  addMesh('gateway', 'gw', new THREE.OctahedronGeometry(0.5, 0), [-2.8, 0, 0]);

  // Service clusters, three replicas each.
  const CLUSTER_X = -0.45;
  const clusters = [
    { id: 'auth', y: 1.9, label: 'Auth service ×3', short: 'Auth', desc: 'Login and tokens with Spring Security, running as 3 replicas' },
    { id: 'users', y: 0, label: 'User service ×3', short: 'Users', desc: 'Reads profiles from the cache or read replicas, running as 3 replicas' },
    { id: 'orders', y: -1.9, label: 'Order service ×3', short: 'Orders', desc: 'Writes orders to the primary and publishes events, running as 3 replicas' },
  ];
  const replicaGeometry = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  const frameGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.1, 0.85, 2.35));
  for (const cluster of clusters) {
    addComponent(cluster.id, cluster.label, cluster.short, cluster.desc, [CLUSTER_X, cluster.y + 0.45, 0]);
    const frame = new THREE.LineSegments(frameGeometry, frameMaterial);
    frame.position.set(CLUSTER_X, cluster.y, 0);
    system.add(frame);
    [-0.75, 0, 0.75].forEach((z, i) => addMesh(cluster.id, `${cluster.id}.r${i}`, replicaGeometry, [CLUSTER_X, cluster.y, z]));
    points[`${cluster.id}.in`] = new THREE.Vector3(CLUSTER_X - 0.55, cluster.y, 0);
    points[`${cluster.id}.out`] = new THREE.Vector3(CLUSTER_X + 0.55, cluster.y, 0);
  }

  // Data layer
  addComponent('redis', 'Redis cluster', 'Redis', 'Sessions and hot data kept in memory, split across 3 nodes', [2.75, 2.3, 0]);
  const redisGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 32);
  [-0.6, 0, 0.6].forEach((z, i) => addMesh('redis', `redis.d${i}`, redisGeometry, [2.75, 2.05, z]));
  points['redis.in'] = new THREE.Vector3(2.2, 2.05, 0);

  addComponent('replicas', 'Read replicas', 'Replicas', 'Copies of the primary that serve read traffic', [3.0, 0.82, 0]);
  const replicaDbGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.62, 36);
  addMesh('replicas', 'rr0', replicaDbGeometry, [3.0, 0.45, -0.8]);
  addMesh('replicas', 'rr1', replicaDbGeometry, [3.0, 0.45, 0.8]);

  addComponent('primary', 'PostgreSQL primary', 'Primary', 'Every write lands here, then replicates to the read replicas', [2.9, -0.5, 0]);
  addMesh('primary', 'primary', new THREE.CylinderGeometry(0.48, 0.48, 0.9, 40), [2.9, -1.0, 0]);

  addComponent('kafka', 'Kafka', 'Kafka', 'Carries events so slow work happens in the background', [2.4, -2.3, 0.2]);
  addMesh('kafka', null, new THREE.CylinderGeometry(0.22, 0.22, 2.6, 8), [2.4, -2.55, 0.2], { rotation: [0, 0, Math.PI / 2], opacity: 0.55 });
  points['kafka.in'] = new THREE.Vector3(1.1, -2.55, 0.2);
  points['kafka.out'] = new THREE.Vector3(3.7, -2.55, 0.2);

  addComponent('workers', 'Workers', 'Workers', 'Consume events to send emails, update search, and more', [5.0, -1.8, 0]);
  const workerGeometry = new THREE.TetrahedronGeometry(0.3, 0);
  addMesh('workers', 'w0', workerGeometry, [5.0, -2.15, -0.45]);
  addMesh('workers', 'w1', workerGeometry, [5.0, -2.95, 0.45]);

  // ---------- Connections ----------

  const curves = {};
  function connect(a, b, lift = 0, material = linkMaterial) {
    const pa = points[a];
    const pb = points[b];
    const mid = pa.clone().lerp(pb, 0.5);
    mid.y += lift;
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
  for (const cluster of clusters) {
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

  function leg(a, b) {
    if (curves[`${a}>${b}`]) return { curve: curves[`${a}>${b}`], reverse: false, end: b };
    return { curve: curves[`${b}>${a}`], reverse: true, end: b };
  }

  function pathThrough(names) {
    const legs = [];
    for (let i = 0; i < names.length - 1; i += 1) legs.push(leg(names[i], names[i + 1]));
    return legs;
  }

  function healthyReplica(clusterId) {
    const healthy = [0, 1, 2].filter((i) => !meshesByPoint[`${clusterId}.r${i}`].userData.down);
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
  const packetGeometry = new THREE.SphereGeometry(0.085, 14, 14);
  const packets = [];
  const pulses = [];
  let requestCount = 0;

  const packetToken = {
    request: '--signal',
    bug: '--bug',
    fixed: '--ok',
    event: '--event',
    replication: '--accent',
  };

  function spawnPacket(kind, path, { trail = true, size = 1, speed = 0.9 } = {}) {
    const head = new THREE.Mesh(packetGeometry, new THREE.MeshBasicMaterial());
    head.scale.setScalar(size);
    system.add(head);
    const ghosts = [];
    if (trail) {
      for (let k = 0; k < TRAIL_LENGTH; k += 1) {
        const ghost = new THREE.Mesh(packetGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45 * (1 - k / TRAIL_LENGTH), depthWrite: false }));
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
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), material);
    mesh.position.copy(position);
    system.add(mesh);
    pulses.push({ mesh, age: 0, token });
  }

  function onLegFinished(packet, finished) {
    // Bugs get fixed once they reach a service replica.
    if (packet.state === 'bug' && /\.r\d$/.test(finished.end)) {
      packet.state = 'fixed';
      paintPacket(packet);
      emitPulse(points[finished.end]);
    }
    // A write on the primary replicates to the read replicas and publishes an event.
    if (packet.kind !== 'event' && packet.kind !== 'replication' && finished.end === 'primary' && !packet.wrote) {
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
    const cluster = pickOne(clusters);
    downReplica = meshesByPoint[`${cluster.id}.r${Math.floor(Math.random() * 3)}`];
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

  // ---------- Hover ----------

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const black = new THREE.Color(0x000000);
  let hovered = null;

  function setHovered(componentId) {
    if (componentId === hovered) return;
    if (hovered) {
      components[hovered].labelEl.classList.remove('is-active');
      components[hovered].meshes.forEach((m) => { m.userData.targetScale = 1; });
    }
    hovered = componentId;
    if (hovered) {
      components[hovered].labelEl.classList.add('is-active');
      components[hovered].meshes.forEach((m) => { m.userData.targetScale = 1.15; });
    }
    renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    paintNodes();
    if (reduceMotion) {
      pickables.forEach((m) => m.scale.setScalar(m.userData.targetScale));
      render();
    }
  }

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    setHovered(hit ? hit.object.userData.component : null);
  }

  renderer.domElement.addEventListener('pointermove', pick);
  renderer.domElement.addEventListener('pointerdown', pick);
  renderer.domElement.addEventListener('pointerleave', () => setHovered(null));

  // ---------- Colors ----------

  function paintNodes() {
    const accent = cssColor('--accent');
    const bug = cssColor('--bug');
    for (const mesh of pickables) {
      const isHovered = mesh.userData.component === hovered;
      const { down, baseOpacity } = mesh.userData;
      mesh.material.color.copy(down ? bug : accent);
      mesh.material.transparent = down || baseOpacity < 1;
      mesh.material.opacity = down ? 0.4 : baseOpacity;
      mesh.material.emissive.copy(isHovered ? accent : black);
      mesh.material.emissiveIntensity = isHovered ? 0.45 : 0;
    }
  }

  function applyTheme() {
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

  function resize() {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // The system is about 12 units wide and 6 tall; keep both in view as it sways.
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(6.6 / (halfFov * camera.aspect), 3.6 / halfFov) + 2.5;
    camera.position.sub(controls.target).setLength(distance).add(controls.target);
    controls.update();
    render();
  }

  function render() {
    renderer.render(scene, camera);
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
      const k = pulse.age / 1.0;
      pulse.mesh.scale.setScalar(1 + k * 1.6);
      pulse.mesh.material.opacity = 0.7 * (1 - k);
      if (k >= 1) {
        system.remove(pulse.mesh);
        pulse.mesh.geometry.dispose();
        pulse.mesh.material.dispose();
        pulses.splice(i, 1);
      }
    }

    if (downReplica) {
      downTimeLeft -= dt;
      downReplica.rotation.z = Math.sin(elapsed * 18) * 0.08;
      if (downTimeLeft <= 0) recoverReplica();
    } else {
      nextFailureIn -= dt;
      if (nextFailureIn <= 0) failRandomReplica();
    }

    for (const mesh of pickables) {
      const s = THREE.MathUtils.lerp(mesh.scale.x, mesh.userData.targetScale, Math.min(1, dt * 10));
      mesh.scale.setScalar(s);
    }
    components.gateway.meshes[0].rotation.y += dt * 0.4;
    components.clients.meshes.forEach((m, i) => { m.rotation.y += dt * (0.2 + i * 0.05); });
    components.workers.meshes.forEach((m) => { m.rotation.y -= dt * 0.5; });

    // The whole system sways gently unless someone is looking at a part or dragging it.
    if (!hovered && !dragging) {
      system.rotation.y = THREE.MathUtils.lerp(system.rotation.y, Math.sin(elapsed * 0.16) * 0.35, Math.min(1, dt * 2));
    }
    dust.rotation.y += dt * 0.012;
  }

  applyTheme();
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('themechange', applyTheme);

  if (reduceMotion) {
    // A still frame with traffic on the wire; mouse users can still rotate it.
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
