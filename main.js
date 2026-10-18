import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/OrbitControls.js';

const canvasHost = document.getElementById('game-canvas');
const levelEl = document.getElementById('level-num');
const shapeEl = document.getElementById('shape-name');
const cellEl = document.getElementById('cell-count');
const statusEl = document.getElementById('status');
const levelInput = document.getElementById('level-input');
const tower = new THREE.Group();
const arrowLayer = new THREE.Group();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090b14);
scene.fog = new THREE.Fog(0x090b14, 24, 55);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
camera.position.set(11, 10, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.replaceWith(renderer.domElement);
renderer.domElement.id = 'game-canvas';
renderer.domElement.setAttribute('aria-label', '3D Arrow Pro tower puzzle');

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 4, 0);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 7;
controls.maxDistance = 30;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI - 0.35;
controls.rotateSpeed = 0.75;
controls.zoomSpeed = 0.8;
controls.addEventListener('start', () => statusEl.textContent = 'Rotate the tower by dragging.');
controls.addEventListener('end', () => statusEl.textContent = 'Tower ready. Pick an arrow.');

scene.add(tower);
tower.add(arrowLayer);

const hemi = new THREE.HemisphereLight(0xb9d7ff, 0x15101f, 1.7);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(8, 16, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xf6821f, 35, 30, 2);
rimLight.position.set(-8, 8, -8);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CylinderGeometry(12, 12, 0.35, 64),
  new THREE.MeshStandardMaterial({ color: 0x111522, metalness: 0.25, roughness: 0.65 })
);
floor.position.y = -0.35;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(22, 22, 0x293044, 0x161b29);
grid.position.y = -0.16;
scene.add(grid);

const towerMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x39445d, transparent: true, opacity: 0.48, roughness: 0.42, metalness: 0.28 }),
  new THREE.MeshStandardMaterial({ color: 0x667799, transparent: true, opacity: 0.16, roughness: 0.2, metalness: 0.45 })
];
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x8ca1c8, transparent: true, opacity: 0.34 });
const frameMaterial = new THREE.LineBasicMaterial({ color: 0xf6821f, transparent: true, opacity: 0.22 });
const surfaceMaterial = new THREE.MeshStandardMaterial({ color: 0xf6821f, emissive: 0x5a2300, emissiveIntensity: 0.7, transparent: true, opacity: 0.34, roughness: 0.35, metalness: 0.2 });

const arrowShaftMaterial = new THREE.MeshStandardMaterial({ color: 0xf6821f, emissive: 0x4c1d00, emissiveIntensity: 0.65, roughness: 0.3, metalness: 0.45 });
const arrowHeadMaterial = new THREE.MeshStandardMaterial({ color: 0xffc078, emissive: 0x7a3100, emissiveIntensity: 0.8, roughness: 0.24, metalness: 0.35 });
const blockedMaterial = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0x7d0800, emissiveIntensity: 1.8, roughness: 0.28, metalness: 0.35 });
const selectedMaterial = new THREE.MeshStandardMaterial({ color: 0x6fffe9, emissive: 0x087d70, emissiveIntensity: 1.4, roughness: 0.22, metalness: 0.45 });
const arrowShaftGeometry = new THREE.CylinderGeometry(0.105, 0.105, 0.48, 10);
const arrowHeadGeometry = new THREE.ConeGeometry(0.23, 0.34, 10);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;
let currentLevel = Number(localStorage.getItem('arrow3d_renderer_level') || 1);
let autoRotate = false;
let spinVelocity = 0.004;
let activeTower = null;
let activePuzzle = null;
let movingArrow = null;
let solved = false;

function key(x, y, z) {
  return `${x},${y},${z}`;
}

function cellPosition(cell, bounds) {
  return new THREE.Vector3(
    cell.x - (bounds.width - 1) / 2,
    cell.y,
    cell.z - (bounds.depth - 1) / 2
  );
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse(obj => {
      if (obj.geometry && obj.userData.disposeGeometry) obj.geometry.dispose();
    });
  }
}

function clearTower() {
  while (tower.children.length) {
    const child = tower.children.pop();
    child.traverse(obj => {
      if (obj.geometry && obj.userData.disposeGeometry) obj.geometry.dispose();
    });
  }
  tower.add(arrowLayer);
}

function addVoxel(cell, bounds) {
  const size = 0.92;
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = towerMaterials[(cell.y + cell.x + cell.z) & 1];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(cellPosition(cell, bounds));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.cell = cell;
  mesh.userData.disposeGeometry = true;

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
  edges.userData.disposeGeometry = true;
  mesh.add(edges);
  tower.add(mesh);
}

function addSurfaceMarker(cell, bounds) {
  const base = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  for (const normal of cell.normals) {
    const marker = new THREE.Mesh(base, surfaceMaterial);
    marker.position.copy(cellPosition(cell, bounds));
    marker.position.x += normal.x * 0.5;
    marker.position.y += normal.y * 0.5;
    marker.position.z += normal.z * 0.5;
    marker.scale.setScalar(0.5);
    marker.userData.surfaceCell = cell;
    marker.userData.disposeGeometry = false;
    tower.add(marker);
  }
}

function frameTower(bounds) {
  const box = new THREE.BoxGeometry(bounds.width + 0.3, bounds.height + 0.3, bounds.depth + 0.3);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), frameMaterial);
  edges.position.y = (bounds.height - 1) / 2;
  edges.userData.disposeGeometry = true;
  tower.add(edges);
}

function createArrowMesh(arrow) {
  const group = new THREE.Group();
  group.name = `arrow-${arrow.id}`;
  group.userData.arrow = arrow;

  const shaft = new THREE.Mesh(arrowShaftGeometry, arrowShaftMaterial);
  shaft.castShadow = true;
  shaft.userData.arrowGroup = group;

  const head = new THREE.Mesh(arrowHeadGeometry, arrowHeadMaterial);
  head.position.y = 0.39;
  head.castShadow = true;
  head.userData.arrowGroup = group;

  group.add(shaft, head);
  group.position.copy(cellPosition(arrow, activePuzzle.bounds));
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(arrow.dx, arrow.dy, arrow.dz)
  );
  return group;
}

function renderArrows() {
  clearGroup(arrowLayer);
  const bounds = activePuzzle.bounds;
  for (const arrow of activePuzzle.arrows) {
    arrow.mesh = createArrowMesh(arrow);
    arrowLayer.add(arrow.mesh);
  }
}

function occupiedMap() {
  return new Map(
    activePuzzle.arrows
      .filter(arrow => !arrow.removed && !arrow.animating)
      .map(arrow => [key(arrow.x, arrow.y, arrow.z), arrow])
  );
}

function canSlide(arrow) {
  const occupied = occupiedMap();
  occupied.delete(key(arrow.x, arrow.y, arrow.z));
  let x = arrow.x + arrow.dx;
  let y = arrow.y + arrow.dy;
  let z = arrow.z + arrow.dz;

  while (
    x >= 0 && x < activePuzzle.bounds.width &&
    y >= 0 && y < activePuzzle.bounds.height &&
    z >= 0 && z < activePuzzle.bounds.depth
  ) {
    if (occupied.has(key(x, y, z))) return false;
    x += arrow.dx;
    y += arrow.dy;
    z += arrow.dz;
  }
  return true;
}

function setArrowMaterial(arrow, material) {
  if (!arrow.mesh) return;
  arrow.mesh.children.forEach(child => {
    child.material = material;
  });
}

function flashBlocked(arrow) {
  if (!arrow.mesh || arrow.animating || arrow.removed) return;
  const mesh = arrow.mesh;
  const original = mesh.position.clone();
  setArrowMaterial(arrow, blockedMaterial);
  statusEl.textContent = 'Blocked — another arrow is in the way.';

  const started = performance.now();
  function shake(now) {
    const t = Math.min(1, (now - started) / 280);
    if (t < 1) {
      const strength = Math.sin(t * Math.PI * 6) * (1 - t) * 0.13;
      mesh.position.copy(original);
      mesh.position.x += strength;
      mesh.position.y += Math.sin(t * Math.PI * 7) * (1 - t) * 0.05;
      requestAnimationFrame(shake);
    } else {
      mesh.position.copy(original);
      setArrowMaterial(arrow, arrowShaftMaterial);
      arrow.mesh.children[1].material = arrowHeadMaterial;
      if (!solved) statusEl.textContent = 'Pick an arrow with a clear path.';
    }
  }
  requestAnimationFrame(shake);
}

function removeArrow(arrow) {
  if (!arrow.mesh || arrow.animating || arrow.removed || movingArrow) return;
  if (!canSlide(arrow)) {
    flashBlocked(arrow);
    return;
  }

  movingArrow = arrow;
  arrow.animating = true;
  setArrowMaterial(arrow, selectedMaterial);
  arrow.mesh.children[1].material = selectedMaterial;

  const start = arrow.mesh.position.clone();
  const direction = new THREE.Vector3(arrow.dx, arrow.dy, arrow.dz);
  const distance = Math.max(activePuzzle.bounds.width, activePuzzle.bounds.height, activePuzzle.bounds.depth) + 3;
  const end = start.clone().addScaledVector(direction, distance);
  const started = performance.now();
  const duration = 360 + Math.min(300, distance * 18);

  function animateOut(now) {
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    arrow.mesh.position.lerpVectors(start, end, eased);
    arrow.mesh.scale.setScalar(1 - eased * 0.18);

    if (t < 1) {
      requestAnimationFrame(animateOut);
      return;
    }

    arrow.removed = true;
    arrow.animating = false;
    arrow.mesh.visible = false;
    movingArrow = null;
    checkSolved();
  }
  requestAnimationFrame(animateOut);
}

function checkSolved() {
  const remaining = activePuzzle.arrows.filter(arrow => !arrow.removed).length;
  if (remaining === 0) {
    solved = true;
    statusEl.textContent = `🎉 Level ${currentLevel} cleared! Press Next for another tower.`;
    return;
  }

  const movable = activePuzzle.arrows.some(arrow => !arrow.removed && !arrow.animating && canSlide(arrow));
  statusEl.textContent = movable
    ? `${remaining} arrows remaining.`
    : 'No moves available — this level should never happen. Regenerating…';

  if (!movable) {
    setTimeout(() => renderLevel(currentLevel), 180);
  }
}

function updateStats() {
  levelEl.textContent = currentLevel;
  shapeEl.textContent = activeTower.type;
  cellEl.textContent = `${activePuzzle.arrows.filter(a => !a.removed).length}/${activePuzzle.total}`;
  levelInput.value = currentLevel;
}

function frameCamera(bounds) {
  const centerY = (bounds.height - 1) / 2;
  controls.target.set(0, centerY, 0);
  const span = Math.max(bounds.width, bounds.depth, bounds.height);
  camera.position.set(span * 1.35, span * 0.95, span * 1.65);
  controls.minDistance = Math.max(6, span * 0.9);
  controls.maxDistance = Math.max(20, span * 3.2);
  controls.update();
  controls.saveState();
}

function renderLevel(level = currentLevel, seedOverride = null) {
  currentLevel = Math.max(1, Math.floor(level));
  localStorage.setItem('arrow3d_renderer_level', String(currentLevel));
  const seed = seedOverride || `arrow-pro-${currentLevel}`;
  activeTower = window.ArrowTowerGenerator.generateTower({ level: currentLevel, seed });
  activePuzzle = window.ArrowPuzzleGenerator.generate({ tower: activeTower, level: currentLevel, seed });
  solved = false;
  movingArrow = null;

  clearTower();
  tower.rotation.set(0, 0, 0);

  for (const cell of activeTower.cells) addVoxel(cell, activeTower.bounds);
  for (const cell of activeTower.surface) addSurfaceMarker(cell, activeTower.bounds);
  frameTower(activeTower.bounds);
  renderArrows();
  frameCamera(activeTower.bounds);
  updateStats();
  statusEl.textContent = `${activeTower.type} tower ready — pick an arrow with a clear path.`;
}

function renderRandomTower() {
  renderLevel(currentLevel, `${Date.now()}-${Math.random()}`);
  statusEl.textContent = `${activeTower.type} tower randomized — find the clear paths.`;
}

function pickArrow(event) {
  if (movingArrow || solved) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(arrowLayer.children, true);
  if (!hits.length) return;
  const group = hits[0].object.userData.arrowGroup;
  const arrow = group?.userData?.arrow;
  if (arrow) removeArrow(arrow);
}

function resize() {
  const width = Math.max(280, Math.min(window.innerWidth - 32, 900));
  const height = Math.max(420, Math.min(window.innerHeight * 0.66, 680));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  if (autoRotate) tower.rotation.y += spinVelocity;
  controls.update();
  renderer.render(scene, camera);
}

renderer.domElement.addEventListener('pointerdown', event => {
  pointerDown = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', event => {
  if (!pointerDown) return;
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;
  if (moved < 8) pickArrow(event);
});
renderer.domElement.addEventListener('pointercancel', () => { pointerDown = null; });

window.addEventListener('resize', resize);
document.getElementById('prev-btn').addEventListener('click', () => renderLevel(currentLevel - 1));
document.getElementById('next-btn').addEventListener('click', () => renderLevel(currentLevel + 1));
document.getElementById('random-btn').addEventListener('click', renderRandomTower);
document.getElementById('spin-btn').addEventListener('click', event => {
  autoRotate = !autoRotate;
  event.currentTarget.textContent = autoRotate ? '⏸ Stop Spin' : '⟳ Auto Spin';
  statusEl.textContent = autoRotate ? 'Auto rotation enabled.' : 'Auto rotation stopped.';
});
document.getElementById('reset-view-btn').addEventListener('click', () => {
  controls.reset();
  statusEl.textContent = 'Camera reset.';
});
document.getElementById('load-level-btn').addEventListener('click', () => renderLevel(Number(levelInput.value) || 1));
levelInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') renderLevel(Number(levelInput.value) || 1);
});

resize();
renderLevel(currentLevel);
animate();
