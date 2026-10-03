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
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(1.5, 2.2, 11);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.1, 0);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = Math.PI * 0.28;
  controls.maxPolarAngle = Math.PI * 0.68;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.5;
  // On phones, dragging the canvas would trap page scrolling, so only auto-rotate there.
  if (coarsePointer) {
    controls.enabled = false;
    renderer.domElement.style.touchAction = 'pan-y';
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(4, 6, 8);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
  rimLight.position.set(-6, -2, -4);
  scene.add(rimLight);

  const system = new THREE.Group();
  scene.add(system);

  // Faint floor grid gives the scene a sense of depth.
  const grid = new THREE.GridHelper(16, 24);
  grid.position.y = -2.6;
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);

  // Slowly drifting particles behind the system.
  const dustCount = coarsePointer ? 220 : 420;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = THREE.MathUtils.randFloatSpread(20);
    dustPositions[i * 3 + 1] = THREE.MathUtils.randFloat(-3, 6);
    dustPositions[i * 3 + 2] = THREE.MathUtils.randFloat(-9, 5);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({ size: 0.045, transparent: true, opacity: 0.5, depthWrite: false });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  // Backend components: the shape hints at what each one is.
  const serviceBox = new THREE.BoxGeometry(0.95, 0.95, 0.95);
  const nodeDefs = [
    { id: 'client', label: 'Client', desc: 'Web or mobile app sending HTTP requests', pos: [-4.3, 0.7, 0.4], geometry: new THREE.IcosahedronGeometry(0.55, 0) },
    { id: 'gateway', label: 'API gateway', short: 'Gateway', desc: 'Routes each request and spreads load across replicas', pos: [-1.9, -0.35, 1.0], geometry: new THREE.OctahedronGeometry(0.62, 0) },
    { id: 'serviceA', label: 'Spring Boot service', short: 'Service', desc: 'REST APIs, business logic, Spring Security', pos: [0.8, 1.05, -0.5], geometry: serviceBox },
    { id: 'serviceB', label: 'Service replica', short: 'Replica', desc: 'A second copy, so one failure does not take the API down', pos: [1.0, -0.95, 0.9], geometry: serviceBox },
    { id: 'redis', label: 'Redis', desc: 'In-memory cache for hot data', pos: [3.5, 1.7, -0.9], geometry: new THREE.CylinderGeometry(0.55, 0.55, 0.42, 40) },
    { id: 'db', label: 'PostgreSQL', short: 'Postgres', desc: 'Source of truth, with transactions', pos: [3.6, -1.4, 0.4], geometry: new THREE.CylinderGeometry(0.58, 0.58, 1.15, 40) },
  ];

  const edgeLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
  const nodes = {};
  const nodeList = [];

  for (const def of nodeDefs) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.25, flatShading: true });
    const mesh = new THREE.Mesh(def.geometry, material);
    mesh.position.set(...def.pos);
    mesh.userData = { id: def.id, targetScale: 1 };
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(def.geometry, 30), edgeLineMaterial));

    const labelEl = document.createElement('div');
    labelEl.className = 'node-label';
    const name = document.createElement('span');
    name.className = 'node-name';
    const full = document.createElement('span');
    full.className = 'name-full';
    full.textContent = def.label;
    const short = document.createElement('span');
    short.className = 'name-short';
    short.textContent = def.short || def.label;
    name.append(full, short);
    const desc = document.createElement('span');
    desc.className = 'node-desc';
    desc.textContent = def.desc;
    labelEl.append(name, desc);
    const label = new CSS2DObject(labelEl);
    label.position.set(0, def.id === 'db' ? 1.0 : 0.9, 0);
    mesh.add(label);
    mesh.userData.labelEl = labelEl;

    system.add(mesh);
    nodes[def.id] = mesh;
    nodeList.push(mesh);
  }

  // Connections between components, drawn as gentle arcs.
  const linkMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 });
  const links = {};
  function link(from, to, lift) {
    const a = nodes[from].position;
    const b = nodes[to].position;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += lift;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    system.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), linkMaterial));
    links[`${from}-${to}`] = curve;
  }

  link('client', 'gateway', 0.7);
  link('gateway', 'serviceA', 0.5);
  link('gateway', 'serviceB', -0.3);
  link('serviceA', 'redis', 0.4);
  link('serviceA', 'db', 0.2);
  link('serviceB', 'redis', 0.3);
  link('serviceB', 'db', -0.3);

  // The gateway picks a replica, the service reads from the cache or the database,
  // and the response travels back the same way.
  function route() {
    const service = Math.random() < 0.5 ? 'serviceA' : 'serviceB';
    const store = Math.random() < 0.55 ? 'redis' : 'db';
    const legs = [links['client-gateway'], links[`gateway-${service}`], links[`${service}-${store}`]];
    return [
      ...legs.map((curve, i) => ({ curve, reverse: false, arrivesAt: i === 1 ? service : null })),
      ...legs.slice().reverse().map((curve) => ({ curve, reverse: true, arrivesAt: null })),
    ];
  }

  const TRAIL_LENGTH = 4;
  const packetGeometry = new THREE.SphereGeometry(0.1, 16, 16);
  const packets = [];
  const pulses = [];
  let spawned = 0;

  function spawnPacket() {
    spawned += 1;
    const isBug = spawned % 5 === 0;
    const head = new THREE.Mesh(packetGeometry, new THREE.MeshBasicMaterial());
    head.scale.setScalar(isBug ? 1.5 : 1);
    system.add(head);

    const trail = [];
    for (let k = 0; k < TRAIL_LENGTH; k += 1) {
      const ghost = new THREE.Mesh(packetGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45 * (1 - k / TRAIL_LENGTH), depthWrite: false }));
      ghost.scale.setScalar((isBug ? 1.3 : 0.85) * (1 - k / (TRAIL_LENGTH + 1)));
      system.add(ghost);
      trail.push(ghost);
    }

    const packet = {
      head,
      trail,
      state: isBug ? 'bug' : 'normal',
      path: route(),
      segment: 0,
      t: 0,
      speed: 0.55 + Math.random() * 0.2,
    };
    packets.push(packet);
    paintPacket(packet);
    placePacket(packet);
    return packet;
  }

  function paintPacket(packet) {
    const token = packet.state === 'bug' ? '--bug' : packet.state === 'fixed' ? '--ok' : '--signal';
    const color = cssColor(token);
    packet.head.material.color.copy(color);
    packet.trail.forEach((ghost) => ghost.material.color.copy(color));
  }

  function placePacket(packet) {
    const leg = packet.path[packet.segment];
    const at = (t) => (leg.reverse ? 1 - t : t);
    leg.curve.getPoint(at(packet.t), packet.head.position);
    packet.trail.forEach((ghost, k) => {
      leg.curve.getPoint(at(Math.max(0, packet.t - 0.035 * (k + 1))), ghost.position);
    });
  }

  function removePacket(index) {
    const packet = packets[index];
    [packet.head, ...packet.trail].forEach((mesh) => {
      system.remove(mesh);
      mesh.material.dispose();
    });
    packets.splice(index, 1);
  }

  function emitPulse(nodeId) {
    const material = new THREE.MeshBasicMaterial({ color: cssColor('--ok'), wireframe: true, transparent: true, opacity: 0.7 });
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), material);
    mesh.position.copy(nodes[nodeId].position);
    system.add(mesh);
    pulses.push({ mesh, age: 0 });
  }

  // Hovering (or tapping) a component highlights it and shows what it does.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const black = new THREE.Color(0x000000);
  let hovered = null;

  function setHovered(mesh) {
    if (mesh === hovered) return;
    if (hovered) {
      hovered.userData.targetScale = 1;
      hovered.userData.labelEl.classList.remove('is-active');
    }
    hovered = mesh;
    if (hovered) {
      hovered.userData.targetScale = 1.18;
      hovered.userData.labelEl.classList.add('is-active');
    }
    renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    controls.autoRotate = !reduceMotion && !hovered;
    applyNodeColors();
    if (reduceMotion) {
      nodeList.forEach((n) => n.scale.setScalar(n.userData.targetScale));
      render();
    }
  }

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(nodeList, false)[0];
    setHovered(hit ? hit.object : null);
  }

  renderer.domElement.addEventListener('pointermove', pick);
  renderer.domElement.addEventListener('pointerdown', pick);
  renderer.domElement.addEventListener('pointerleave', () => setHovered(null));

  function applyNodeColors() {
    const accent = cssColor('--accent');
    for (const mesh of nodeList) {
      mesh.material.color.copy(accent);
      mesh.material.emissive.copy(mesh === hovered ? accent : black);
      mesh.material.emissiveIntensity = mesh === hovered ? 0.45 : 0;
    }
  }

  function applyTheme() {
    applyNodeColors();
    edgeLineMaterial.color.copy(cssColor('--text'));
    linkMaterial.color.copy(cssColor('--muted'));
    grid.material.color.copy(cssColor('--muted'));
    dustMaterial.color.copy(cssColor('--muted'));
    packets.forEach(paintPacket);
    pulses.forEach((p) => p.mesh.material.color.copy(cssColor('--ok')));
    render();
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // The system is about 10 units wide and 5 tall; keep both in view as it rotates.
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(5.4 / (halfFov * camera.aspect), 3.4 / halfFov) + 2;
    camera.position.sub(controls.target).setLength(distance).add(controls.target);
    controls.update();
    render();
  }

  function render() {
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function step(dt) {
    for (let i = packets.length - 1; i >= 0; i -= 1) {
      const packet = packets[i];
      packet.t += dt * packet.speed;
      if (packet.t >= 1) {
        const finished = packet.path[packet.segment];
        if (finished.arrivesAt && packet.state === 'bug') {
          packet.state = 'fixed';
          paintPacket(packet);
          emitPulse(finished.arrivesAt);
        }
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
      const k = pulse.age / 1.1;
      pulse.mesh.scale.setScalar(1 + k * 1.4);
      pulse.mesh.material.opacity = 0.7 * (1 - k);
      if (k >= 1) {
        system.remove(pulse.mesh);
        pulse.mesh.geometry.dispose();
        pulse.mesh.material.dispose();
        pulses.splice(i, 1);
      }
    }

    for (const mesh of nodeList) {
      const s = THREE.MathUtils.lerp(mesh.scale.x, mesh.userData.targetScale, Math.min(1, dt * 10));
      mesh.scale.setScalar(s);
    }
    nodes.serviceA.rotation.y += dt * 0.35;
    nodes.serviceB.rotation.y -= dt * 0.3;
    nodes.client.rotation.y += dt * 0.2;
    nodes.gateway.rotation.y -= dt * 0.25;
    dust.rotation.y += dt * 0.015;
  }

  applyTheme();
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('themechange', applyTheme);

  if (reduceMotion) {
    // Show a still frame with a few requests on the wire; mouse users can still rotate it.
    [0.3, 0.55, 0.8].forEach((t, i) => {
      const packet = spawnPacket();
      packet.segment = i;
      packet.t = t;
      placePacket(packet);
    });
    controls.addEventListener('change', render);
    render();
    return;
  }

  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(stage);

  const clock = new THREE.Clock();
  let sinceSpawn = 0.8;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    sinceSpawn += dt;
    if (sinceSpawn > 0.75 && packets.length < 16) {
      spawnPacket();
      sinceSpawn = 0;
    }
    step(dt);
    controls.update();
    render();
  });
}
