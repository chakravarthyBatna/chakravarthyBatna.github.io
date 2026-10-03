import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

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

// Cards lean toward the cursor, their titles lift off the surface, and a soft light follows the mouse.
function setupCardTilt() {
  const cards = document.querySelectorAll('.project, .stats > div, .skills > div, .steps li');
  cards.forEach((card) => card.classList.add('tilt'));
  if (reduceMotion || coarsePointer) return;
  const maxTilt = 8;
  cards.forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.transform = `rotateX(${((0.5 - y) * maxTilt).toFixed(2)}deg) rotateY(${((x - 0.5) * maxTilt).toFixed(2)}deg) translateZ(8px)`;
      card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
}

// Each section tilts up into place the first time it scrolls into view.
function setupSectionReveal() {
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  const sections = document.querySelectorAll('.block');
  root.classList.add('js-reveal');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
  sections.forEach((section) => observer.observe(section));
}

// Low-poly shapes float behind the whole page. Scrolling moves the camera down through them
// and the mouse shifts the view a little, so the page itself feels like a 3D space.
function setupBackground() {
  if (reduceMotion) return;
  const host = document.getElementById('bg3d');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(4, 6, 8);
  scene.add(key);

  // ---------- Developer objects ----------
  // Each builder returns a group of meshes. Meshes share one material per object so a theme
  // change only has to recolor a handful of materials.

  function solid(geometry, material, edgeMaterial, { edges = true } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMaterial));
    return mesh;
  }

  function gear(mat, edge) {
    const teeth = 10;
    const outer = 0.9;
    const inner = 0.72;
    const shape = new THREE.Shape();
    for (let i = 0; i < teeth * 2; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const a0 = (i / (teeth * 2)) * Math.PI * 2;
      const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
      const p0 = [Math.cos(a0) * radius, Math.sin(a0) * radius];
      if (i === 0) shape.moveTo(...p0); else shape.lineTo(...p0);
      shape.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.3, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: false });
    geometry.center();
    const group = new THREE.Group();
    group.add(solid(geometry, mat, edge));
    return group;
  }

  function database(mat, edge) {
    const group = new THREE.Group();
    const disk = new THREE.CylinderGeometry(0.75, 0.75, 0.38, 32);
    [-0.45, 0, 0.45].forEach((y) => {
      const mesh = solid(disk, mat, edge);
      mesh.position.y = y;
      group.add(mesh);
    });
    return group;
  }

  function padlock(mat, edge) {
    const group = new THREE.Group();
    group.add(solid(new THREE.BoxGeometry(1.2, 0.95, 0.4), mat, edge));
    const shackle = solid(new THREE.TorusGeometry(0.4, 0.09, 10, 24, Math.PI), mat, edge, { edges: false });
    shackle.position.y = 0.47;
    group.add(shackle);
    const keyhole = solid(new THREE.CylinderGeometry(0.1, 0.1, 0.45, 16), mat, edge, { edges: false });
    keyhole.rotation.x = Math.PI / 2;
    group.add(keyhole);
    return group;
  }

  function server(mat, edge) {
    const group = new THREE.Group();
    const unit = new THREE.BoxGeometry(1.5, 0.42, 0.9);
    const led = new THREE.SphereGeometry(0.05, 8, 8);
    [-0.5, 0, 0.5].forEach((y) => {
      const box = solid(unit, mat, edge);
      box.position.y = y;
      group.add(box);
      [0.45, 0.6].forEach((x) => {
        const light = solid(led, mat, edge, { edges: false });
        light.position.set(x, y, 0.46);
        group.add(light);
      });
    });
    return group;
  }

  function terminal(mat, edge, font) {
    const group = new THREE.Group();
    group.add(solid(new THREE.BoxGeometry(2, 1.35, 0.12), mat, edge));
    const bar = solid(new THREE.BoxGeometry(2, 0.22, 0.16), mat, edge, { edges: false });
    bar.position.y = 0.56;
    group.add(bar);
    if (font) {
      const prompt = solid(textGeometry('>_', font, 0.42), mat, edge, { edges: false });
      prompt.position.set(-0.45, -0.1, 0.12);
      group.add(prompt);
    }
    return group;
  }

  function gitBranch(mat, edge) {
    const group = new THREE.Group();
    const node = new THREE.SphereGeometry(0.2, 16, 16);
    const commits = [[0, -0.9, 0], [0, 0, 0], [0, 0.9, 0], [0.75, 0.55, 0]];
    commits.forEach((p) => {
      const mesh = solid(node, mat, edge, { edges: false });
      mesh.position.set(...p);
      group.add(mesh);
    });
    const trunk = solid(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), mat, edge, { edges: false });
    group.add(trunk);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.75, -0.1, 0), new THREE.Vector3(0.75, 0.55, 0));
    group.add(solid(new THREE.TubeGeometry(curve, 16, 0.06, 8), mat, edge, { edges: false }));
    return group;
  }

  function textGeometry(text, font, size) {
    const geometry = new TextGeometry(text, { font, size, height: 0.22, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 });
    geometry.center();
    return geometry;
  }

  function codeSymbol(text) {
    return (mat, edge, font) => {
      const group = new THREE.Group();
      if (font) group.add(solid(textGeometry(text, font, 0.95), mat, edge, { edges: false }));
      return group;
    };
  }

  function cloud(mat, edge) {
    const group = new THREE.Group();
    [[0, 0, 0, 0.55], [-0.55, -0.12, 0, 0.4], [0.55, -0.1, 0, 0.42], [0.2, 0.3, 0, 0.38]].forEach(([x, y, z, r]) => {
      const puff = solid(new THREE.SphereGeometry(r, 18, 14), mat, edge, { edges: false });
      puff.position.set(x, y, z);
      group.add(puff);
    });
    return group;
  }

  function accessKey(mat, edge) {
    const group = new THREE.Group();
    const ring = solid(new THREE.TorusGeometry(0.32, 0.1, 10, 24), mat, edge, { edges: false });
    ring.position.x = -0.65;
    group.add(ring);
    const shaft = solid(new THREE.BoxGeometry(1.1, 0.14, 0.14), mat, edge);
    shaft.position.x = 0.2;
    group.add(shaft);
    [0.45, 0.68].forEach((x) => {
      const tooth = solid(new THREE.BoxGeometry(0.12, 0.26, 0.14), mat, edge);
      tooth.position.set(x, -0.18, 0);
      group.add(tooth);
    });
    return group;
  }

  function bug(mat, edge) {
    const group = new THREE.Group();
    const body = solid(new THREE.SphereGeometry(0.42, 18, 14), mat, edge, { edges: false });
    body.scale.set(1, 1.35, 0.8);
    group.add(body);
    const head = solid(new THREE.SphereGeometry(0.24, 14, 12), mat, edge, { edges: false });
    head.position.y = 0.7;
    group.add(head);
    const leg = new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6);
    [-0.25, 0.05, 0.35].forEach((y) => {
      [-1, 1].forEach((side) => {
        const mesh = solid(leg, mat, edge, { edges: false });
        mesh.position.set(side * 0.55, y, 0);
        mesh.rotation.z = side * (Math.PI / 2 - 0.35);
        group.add(mesh);
      });
    });
    [-1, 1].forEach((side) => {
      const antenna = solid(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), mat, edge, { edges: false });
      antenna.position.set(side * 0.16, 1.05, 0);
      antenna.rotation.z = -side * 0.5;
      group.add(antenna);
    });
    return group;
  }

  function coffee(mat, edge) {
    const group = new THREE.Group();
    group.add(solid(new THREE.CylinderGeometry(0.48, 0.4, 0.95, 28), mat, edge));
    const handle = solid(new THREE.TorusGeometry(0.24, 0.07, 10, 20), mat, edge, { edges: false });
    handle.position.x = 0.5;
    group.add(handle);
    return group;
  }

  function laptop(mat, edge) {
    const group = new THREE.Group();
    group.add(solid(new THREE.BoxGeometry(1.7, 0.08, 1.15), mat, edge));
    const screen = solid(new THREE.BoxGeometry(1.7, 1.1, 0.06), mat, edge);
    screen.position.set(0, 0.55, -0.62);
    screen.rotation.x = -0.25;
    group.add(screen);
    return group;
  }

  function shield(mat, edge) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.95);
    shape.quadraticCurveTo(0.45, 0.85, 0.75, 0.7);
    shape.quadraticCurveTo(0.75, -0.3, 0, -0.95);
    shape.quadraticCurveTo(-0.75, -0.3, -0.75, 0.7);
    shape.quadraticCurveTo(-0.45, 0.85, 0, 0.95);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
    geometry.center();
    const group = new THREE.Group();
    group.add(solid(geometry, mat, edge));
    return group;
  }

  function chip(mat, edge) {
    const group = new THREE.Group();
    group.add(solid(new THREE.BoxGeometry(1.0, 1.0, 0.18), mat, edge));
    const pin = new THREE.BoxGeometry(0.08, 0.22, 0.06);
    [-0.3, -0.1, 0.1, 0.3].forEach((p) => {
      [[p, 0.6, 0], [p, -0.6, 0], [0.6, p, Math.PI / 2], [-0.6, p, Math.PI / 2]].forEach(([x, y, rz]) => {
        const mesh = solid(pin, mat, edge, { edges: false });
        mesh.position.set(x, y, 0);
        mesh.rotation.z = rz;
        group.add(mesh);
      });
    });
    return group;
  }

  function documentFile(mat, edge) {
    const group = new THREE.Group();
    group.add(solid(new THREE.BoxGeometry(1.0, 1.3, 0.06), mat, edge));
    const line = new THREE.BoxGeometry(0.6, 0.06, 0.08);
    [0.35, 0.15, -0.05, -0.25].forEach((y, i) => {
      const mesh = solid(line, mat, edge, { edges: false });
      mesh.position.set(i === 3 ? -0.1 : 0, y, 0.04);
      mesh.scale.x = i === 3 ? 0.6 : 1;
      group.add(mesh);
    });
    return group;
  }

  const layers = ['--c-edge', '--c-service', '--c-data', '--c-async', '--c-ai'];
  // Every object appears once.
  const builders = [
    codeSymbol('{ }'), bug, codeSymbol('</>'), database, padlock, codeSymbol('=>'),
    server, terminal, codeSymbol('( )'), gitBranch, accessKey, codeSymbol('[ ]'),
    cloud, codeSymbol('&&'), shield, coffee, codeSymbol('//'), laptop,
    gear, codeSymbol('!='), chip, codeSymbol(';'), documentFile, codeSymbol('++'),
    codeSymbol('01'), codeSymbol('#'),
  ];
  const DEPTH = 60;
  const floaters = [];

  // Objects spread across the full width. `across` is the object's spot from the left edge (-1)
  // to the right edge (1), so the layout keeps its shape when the window is resized.
  function placeAcross(object) {
    const distance = camera.position.z - object.position.z;
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance * camera.aspect;
    object.position.x = object.userData.across * halfWidth * 0.92;
  }

  function populate(font) {
    // Phones get a lighter set.
    const chosen = coarsePointer ? builders.slice(0, 14) : builders;
    const columns = 5;
    chosen.forEach((build, i) => {
      const material = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2, transparent: true, depthWrite: false });
      const edgeMaterial = new THREE.LineBasicMaterial({ transparent: true });
      const object = build(material, edgeMaterial, font);
      if (!object.children.length) return;
      // Walk down the page one object at a time, hopping between five columns in a scattered
      // order, so objects cover the width evenly without bunching up.
      const column = (i * 3) % columns;
      const across = -1 + (2 * column + 1) / columns + THREE.MathUtils.randFloatSpread(0.25);
      const y = 3 - (i + 0.5) * (DEPTH / chosen.length) + THREE.MathUtils.randFloatSpread(1);
      object.position.set(0, y, THREE.MathUtils.randFloat(-20, -12));
      object.rotation.set(THREE.MathUtils.randFloatSpread(0.5), Math.random() * Math.PI * 2, THREE.MathUtils.randFloatSpread(0.3));
      object.scale.setScalar(THREE.MathUtils.randFloat(1.3, 1.7));
      object.userData = {
        layer: layers[i % layers.length],
        material,
        edgeMaterial,
        across,
        spin: THREE.MathUtils.randFloat(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1),
        bob: Math.random() * Math.PI * 2,
        baseY: y,
        baseTilt: object.rotation.x,
      };
      placeAcross(object);
      scene.add(object);
      floaters.push(object);
    });
    applyTheme();
  }

  // Code symbols need a font; until it loads (or if it fails) only the modelled objects appear.
  new FontLoader().load(
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
    (font) => populate(font),
    undefined,
    () => populate(null),
  );

  function applyTheme() {
    const light = root.dataset.theme === 'light';
    for (const object of floaters) {
      const color = cssColor(object.userData.layer);
      object.userData.material.color.copy(color);
      // Faint enough that text in front of an object stays easy to read.
      object.userData.material.opacity = light ? 0.07 : 0.11;
      object.userData.edgeMaterial.color.copy(color);
      object.userData.edgeMaterial.opacity = light ? 0.14 : 0.2;
    }
  }

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    floaters.forEach(placeAcross);
  }

  const mouse = { x: 0, y: 0 };
  window.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX / window.innerWidth - 0.5;
    mouse.y = event.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  applyTheme();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('themechange', applyTheme);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (document.hidden) return;
    const elapsed = clock.elapsedTime;
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = window.scrollY / scrollable;
    const targetY = -progress * (DEPTH - 8);
    camera.position.y += (targetY + -mouse.y * 1.2 - camera.position.y) * Math.min(1, dt * 4);
    camera.position.x += (mouse.x * 1.2 - camera.position.x) * Math.min(1, dt * 3);
    camera.lookAt(camera.position.x, camera.position.y, 0);
    // Objects turn around their upright axis so symbols stay readable, with a slight rock.
    for (const object of floaters) {
      const { spin, bob, baseY, baseTilt } = object.userData;
      object.rotation.y += dt * spin;
      object.rotation.x = baseTilt + Math.sin(elapsed * 0.6 + bob) * 0.15;
      object.position.y = baseY + Math.sin(elapsed * 0.5 + bob) * 0.4;
    }
    renderer.render(scene, camera);
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
setupSectionReveal();
setupBackground();
setupScene();
