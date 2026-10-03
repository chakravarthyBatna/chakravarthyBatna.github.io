import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches;

setupThemeToggle();
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

  // Backend components: the shape hints at what each one is.
  const nodeDefs = [
    { id: 'client', label: 'Client', pos: [-4.1, 0.7, 0.4], geometry: new THREE.IcosahedronGeometry(0.55, 0) },
    { id: 'gateway', label: 'API gateway', pos: [-1.7, -0.5, 1.1], geometry: new THREE.OctahedronGeometry(0.62, 0) },
    { id: 'service', label: 'Spring Boot service', pos: [0.9, 0.35, 0], geometry: new THREE.BoxGeometry(1.15, 1.15, 1.15) },
    { id: 'redis', label: 'Redis', pos: [3.4, 1.9, -0.9], geometry: new THREE.CylinderGeometry(0.55, 0.55, 0.42, 40) },
    { id: 'db', label: 'PostgreSQL', pos: [3.5, -1.55, 0.6], geometry: new THREE.CylinderGeometry(0.58, 0.58, 1.15, 40) },
  ];

  const nodeMaterial = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.25, flatShading: true });
  const edgeLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
  const nodes = {};

  for (const def of nodeDefs) {
    const mesh = new THREE.Mesh(def.geometry, nodeMaterial);
    mesh.position.set(...def.pos);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(def.geometry, 30), edgeLineMaterial);
    mesh.add(outline);

    const labelEl = document.createElement('div');
    labelEl.className = 'node-label';
    labelEl.textContent = def.label;
    const label = new CSS2DObject(labelEl);
    label.position.set(0, def.id === 'db' ? 1.0 : 0.95, 0);
    mesh.add(label);

    system.add(mesh);
    nodes[def.id] = mesh;
  }

  // Connections between components, drawn as gentle arcs.
  const linkMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 });
  function link(from, to, lift) {
    const a = nodes[from].position;
    const b = nodes[to].position;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += lift;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), linkMaterial);
    system.add(line);
    return curve;
  }

  const links = {
    clientGateway: link('client', 'gateway', 0.7),
    gatewayService: link('gateway', 'service', 0.6),
    serviceRedis: link('service', 'redis', 0.5),
    serviceDb: link('service', 'db', -0.4),
  };

  // A request goes out to a data store and comes back the same way.
  function route(store) {
    const storeLink = store === 'redis' ? links.serviceRedis : links.serviceDb;
    return [
      { curve: links.clientGateway, reverse: false },
      { curve: links.gatewayService, reverse: false, arrivesAtService: true },
      { curve: storeLink, reverse: false },
      { curve: storeLink, reverse: true },
      { curve: links.gatewayService, reverse: true },
      { curve: links.clientGateway, reverse: true },
    ];
  }

  const packetGeometry = new THREE.SphereGeometry(0.1, 16, 16);
  const packets = [];
  const pulses = [];
  let spawned = 0;

  function spawnPacket() {
    spawned += 1;
    const isBug = spawned % 5 === 0;
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(packetGeometry, material);
    mesh.scale.setScalar(isBug ? 1.5 : 1);
    system.add(mesh);
    packets.push({
      mesh,
      state: isBug ? 'bug' : 'normal',
      path: route(Math.random() < 0.55 ? 'redis' : 'db'),
      segment: 0,
      t: 0,
      speed: 0.55 + Math.random() * 0.2,
    });
    paintPacket(packets[packets.length - 1]);
  }

  function paintPacket(packet) {
    const token = packet.state === 'bug' ? '--bug' : packet.state === 'fixed' ? '--ok' : '--signal';
    packet.mesh.material.color.copy(cssColor(token));
  }

  function emitPulse() {
    const material = new THREE.MeshBasicMaterial({ color: cssColor('--ok'), wireframe: true, transparent: true, opacity: 0.7 });
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), material);
    mesh.position.copy(nodes.service.position);
    system.add(mesh);
    pulses.push({ mesh, age: 0 });
  }

  function applyTheme() {
    nodeMaterial.color.copy(cssColor('--accent'));
    edgeLineMaterial.color.copy(cssColor('--text'));
    linkMaterial.color.copy(cssColor('--muted'));
    grid.material.color.copy(cssColor('--muted'));
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
    // Pull the camera back on narrow screens so the whole system stays in view.
    // The system is about 10 units wide and 5 tall; keep both in view as it rotates.
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(5.2 / (halfFov * camera.aspect), 3.4 / halfFov) + 2;
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
      const leg = packet.path[packet.segment];
      packet.t += dt * packet.speed;
      if (packet.t >= 1) {
        if (leg.arrivesAtService && packet.state === 'bug') {
          packet.state = 'fixed';
          paintPacket(packet);
          emitPulse();
        }
        packet.segment += 1;
        packet.t = 0;
        if (packet.segment >= packet.path.length) {
          system.remove(packet.mesh);
          packet.mesh.material.dispose();
          packets.splice(i, 1);
          continue;
        }
      }
      const current = packet.path[packet.segment];
      current.curve.getPoint(current.reverse ? 1 - packet.t : packet.t, packet.mesh.position);
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

    // Service gently spins so it reads as the active part of the system.
    nodes.service.rotation.y += dt * 0.35;
    nodes.client.rotation.y += dt * 0.2;
    nodes.gateway.rotation.y -= dt * 0.25;
  }

  applyTheme();
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('themechange', applyTheme);

  if (reduceMotion) {
    // Show a still frame with a few requests on the wire; still lets mouse users rotate it.
    [0.3, 0.55, 0.8].forEach((t, i) => {
      spawnPacket();
      const packet = packets[i];
      packet.segment = i;
      packet.path[i].curve.getPoint(t, packet.mesh.position);
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
    if (sinceSpawn > 0.9 && packets.length < 14) {
      spawnPacket();
      sinceSpawn = 0;
    }
    step(dt);
    controls.update();
    render();
  });
}
