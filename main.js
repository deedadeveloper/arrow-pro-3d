import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

'use strict';

const $ = id => document.getElementById(id);
const canvasHost = $('game-canvas');
const levelEl = $('level-num');
const shapeEl = $('shape-name');
const cellEl = $('cell-count');
const statusEl = $('status');
const levelInput = $('level-input');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090b14);
scene.fog = new THREE.Fog(0x090b14, 24, 60);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
camera.position.set(11, 10, 15);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
} catch (error) {
  statusEl.textContent = `WebGL unavailable: ${error?.message || error}`;
  statusEl.style.color = '#ff7b72';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.replaceWith(renderer.domElement);
renderer.domElement.id = 'game-canvas';
renderer.domElement.setAttribute('aria-label', 'Arrow Pro 3D game board');

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.75;
controls.zoomSpeed = 0.8;
controls.minDistance = 6;
controls.maxDistance = 32;

const tower = new THREE.Group();
const arrowLayer = new THREE.Group();
scene.add(tower);
tower.add(arrowLayer);

scene.add(new THREE.HemisphereLight(0xb9d7ff, 0x15101f, 1.7));
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

const voxelMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x39445d, transparent: true, opacity: 0.48, roughness: 0.42, metalness: 0.28 }),
  new THREE.MeshStandardMaterial({ color: 0x667799, transparent: true, opacity: 0.16, roughness: 0.2, metalness: 0.45 })
];
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x8ca1c8, transparent: true, opacity: 0.34 });
const frameMaterial = new THREE.LineBasicMaterial({ color: 0xf6821f, transparent: true, opacity: 0.22 });
const shaftMaterial = new THREE.MeshStandardMaterial({ color: 0xf6821f, emissive: 0x4c1d00, emissiveIntensity: 0.65, roughness: 0.3, metalness: 0.45 });
const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffc078, emissive: 0x7a3100, emissiveIntensity: 0.8, roughness: 0.24, metalness: 0.35 });
const blockedMaterial = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0x7d0800, emissiveIntensity: 1.8, roughness: 0.28, metalness: 0.35 });
const selectedMaterial = new THREE.MeshStandardMaterial({ color: 0x6fffe9, emissive: 0x087d70, emissiveIntensity: 1.4, roughness: 0.22, metalness: 0.45 });
const shaftGeometry = new THREE.CylinderGeometry(0.105, 0.105, 0.48, 10);
const headGeometry = new THREE.ConeGeometry(0.23, 0.34, 10);

let currentLevel = Math.max(1, Number(localStorage.getItem('arrow3d_level') || 1));
let activeTower = null;
let activePuzzle = null;
let movingArrow = null;
let solved = false;
let autoRotate = false;
let pointerDown = null;

function key(x, y, z) { return `${x},${y},${z}`; }

function cellPosition(cell, bounds) {
  return new THREE.Vector3(
    cell.x - (bounds.width - 1) / 2,
    cell.y - (bounds.height - 1) / 2,
    cell.z - (bounds.depth - 1) / 2
  );
}

function clearObject(object) {
  while (object.children.length) {
    const child = object.children.pop();
    child.traverse(node => {
      if (node.geometry && node.userData.disposeGeometry) node.geometry.dispose();
    });
  }
}

function buildTowerVisual(towerData) {
  clearObject(tower);
  tower.add(arrowLayer);

  for (const cell of towerData.cells) {
    const geometry = new THREE.BoxGeometry(0.92, 0.92, 0.92);
    const mesh = new THREE.Mesh(geometry, voxelMaterials[(cell.x + cell.y + cell.z) & 1]);
    mesh.position.copy(cellPosition(cell, towerData.bounds));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.disposeGeometry = true;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    edges.userData.disposeGeometry = true;
    mesh.add(edges);
    tower.add(mesh);
  }

  const box = new THREE.BoxGeometry(
    towerData.bounds.width + 0.3,
    towerData.bounds.height + 0.3,
    towerData.bounds.depth + 0.3
  );
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(box), frameMaterial);
  frame.userData.disposeGeometry = true;
  tower.add(frame);
}

function createArrowMesh(arrow) {
  const group = new THREE.Group();
  group.userData.arrow = arrow;
  group.name = `arrow-${arrow.id}`;

  const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 0.39;
  shaft.castShadow = head.castShadow = true;
  group.add(shaft, head);
  group.position.copy(cellPosition(arrow, activePuzzle.bounds));
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(arrow.dx, arrow.dy, arrow.dz)
  );
  return group;
}

function renderArrows() {
  clearObject(arrowLayer);
  for (const arrow of activePuzzle.arrows) {
    arrow.mesh = createArrowMesh(arrow);
    arrowLayer.add(arrow.mesh);
  }
}

function occupiedMap() {
  return new Map(activePuzzle.arrows
    .filter(a => !a.removed && !a.animating)
    .map(a => [key(a.x, a.y, a.z), a]));
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
  arrow.mesh.children.forEach(child => { child.material = material; });
}

function blocked(arrow) {
  if (!arrow.mesh || arrow.removed || arrow.animating) return;
  const mesh = arrow.mesh;
  const original = mesh.position.clone();
  setArrowMaterial(arrow, blockedMaterial);
  statusEl.textContent = 'Blocked — another arrow is in the way.';
  const started = performance.now();
  function shake(now) {
    const t = Math.min(1, (now - started) / 260);
    if (t < 1) {
      const amount = Math.sin(t * Math.PI * 7) * (1 - t) * 0.12;
      mesh.position.copy(original);
      mesh.position.x += amount;
      requestAnimationFrame(shake);
    } else {
      mesh.position.copy(original);
      setArrowMaterial(arrow, shaftMaterial);
      if (mesh.children[1]) mesh.children[1].material = headMaterial;
      if (!solved) statusEl.textContent = 'Pick an arrow with a clear path.';
    }
  }
  requestAnimationFrame(shake);
}

function removeArrow(arrow) {
  if (movingArrow || arrow.removed || arrow.animating) return;
  if (!canSlide(arrow)) {
    blocked(arrow);
    return;
  }

  movingArrow = arrow;
  arrow.animating = true;
  setArrowMaterial(arrow, selectedMaterial);
  if (arrow.mesh.children[1]) arrow.mesh.children[1].material = selectedMaterial;

  const start = arrow.mesh.position.clone();
  const direction = new THREE.Vector3(arrow.dx, arrow.dy, arrow.dz);
  const distance = Math.max(activePuzzle.bounds.width, activePuzzle.bounds.height, activePuzzle.bounds.depth) + 3;
  const end = start.clone().addScaledVector(direction, distance);
  const started = performance.now();
  const duration = 420;

  function animate(now) {
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    arrow.mesh.position.lerpVectors(start, end, eased);
    arrow.mesh.scale.setScalar(1 - eased * 0.18);
    if (t < 1) {
      requestAnimationFrame(animate);
      return;
    }
    arrow.removed = true;
    arrow.animating = false;
    arrow.mesh.visible = false;
    movingArrow = null;
    updateCount();
    checkSolved();
  }
  requestAnimationFrame(animate);
}

function updateCount() {
  const remaining = activePuzzle?.arrows.filter(a => !a.removed).length || 0;
  cellEl.textContent = remaining;
}

function checkSolved() {
  const remaining = activePuzzle.arrows.filter(a => !a.removed).length;
  if (!remaining) {
    solved = true;
    statusEl.textContent = `🎉 Level ${currentLevel} cleared!`;
    return;
  }
  const movable = activePuzzle.arrows.some(a => !a.removed && !a.animating && canSlide(a));
  statusEl.textContent = movable
    ? `${remaining} arrows remaining.`
    : 'No moves available. Regenerating this level…';
  if (!movable) setTimeout(() => loadLevel(currentLevel), 500);
}

function loadLevel(level, options = {}) {
  currentLevel = Math.max(1, Math.floor(Number(level) || 1));
  localStorage.setItem('arrow3d_level', String(currentLevel));
  levelInput.value = String(currentLevel);
  solved = false;
  movingArrow = null;
  statusEl.style.color = '';
  statusEl.textContent = 'Generating tower…';

  const seed = options.seed || `arrow-pro-3d-${currentLevel}`;
  activeTower = ArrowTowerGenerator.generateTower({
    level: currentLevel,
    seed,
    type: options.type
  });
  activePuzzle = ArrowPuzzleGenerator.generate({
    tower: activeTower,
    level: currentLevel,
    seed
  });

  buildTowerVisual(activeTower);
  renderArrows();
  levelEl.textContent = currentLevel;
  shapeEl.textContent = activeTower.type;
  updateCount();

  const center = new THREE.Vector3(0, 0, 0);
  controls.target.copy(center);
  const size = Math.max(activeTower.bounds.width, activeTower.bounds.height, activeTower.bounds.depth);
  controls.minDistance = Math.max(5, size * 0.9);
  controls.maxDistance = Math.max(24, size * 3.2);
  camera.position.set(size * 1.4, size * 1.15, size * 1.7);
  controls.update();
  statusEl.textContent = `${activePuzzle.total} arrows. Pick one with a clear path.`;
}

function pickArrow(event) {
  if (!activePuzzle || movingArrow) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(arrowLayer.children, true);
  const hit = hits.find(h => h.object.userData.arrowGroup || h.object.parent?.userData.arrow);
  if (!hit) return;
  const group = hit.object.userData.arrowGroup || hit.object.parent;
  if (group?.userData.arrow) removeArrow(group.userData.arrow);
}

renderer.domElement.addEventListener('pointerdown', event => {
  pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
});
renderer.domElement.addEventListener('pointerup', event => {
  if (!pointerDown) return;
  const dx = event.clientX - pointerDown.x;
  const dy = event.clientY - pointerDown.y;
  const elapsed = performance.now() - pointerDown.time;
  pointerDown = null;
  if (Math.hypot(dx, dy) < 8 && elapsed < 600) pickArrow(event);
});

$('spin-btn').addEventListener('click', event => {
  autoRotate = !autoRotate;
  event.currentTarget.textContent = autoRotate ? '⏸ Stop Spin' : '⟳ Auto Spin';
});

$('reset-view-btn').addEventListener('click', () => {
  if (!activeTower) return;
  const size = Math.max(activeTower.bounds.width, activeTower.bounds.height, activeTower.bounds.depth);
  camera.position.set(size * 1.4, size * 1.15, size * 1.7);
  controls.target.set(0, 0, 0);
  controls.update();
});

$('random-btn').addEventListener('click', () => {
  const types = ArrowTowerGenerator.SHAPES;
  const type = types[Math.floor(Math.random() * types.length)];
  loadLevel(currentLevel, { seed: `random-${Date.now()}`, type });
});

$('prev-btn').addEventListener('click', () => loadLevel(Math.max(1, currentLevel - 1)));
$('next-btn').addEventListener('click', () => loadLevel(currentLevel + 1));
$('load-level-btn').addEventListener('click', () => loadLevel(levelInput.value));
levelInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') loadLevel(levelInput.value);
});

function resize() {
  const rect = renderer.domElement.parentElement.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(320, rect.height || width * 0.75);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  if (autoRotate && !movingArrow) tower.rotation.y += 0.004;
  controls.update();
  renderer.render(scene, camera);
}

loadLevel(currentLevel);
resize();
animate();
