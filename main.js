import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/OrbitControls.js';

const canvasHost = document.getElementById('game-canvas');
const levelEl = document.getElementById('level-num');
const shapeEl = document.getElementById('shape-name');
const cellEl = document.getElementById('cell-count');
const statusEl = document.getElementById('status');
const levelInput = document.getElementById('level-input');
const tower = new THREE.Group();

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
renderer.domElement.setAttribute('aria-label', '3D Arrow Pro tower');

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
controls.addEventListener('end', () => statusEl.textContent = 'Tower ready.');

scene.add(tower);

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
  new THREE.MeshStandardMaterial({ color: 0x39445d, transparent: true, opacity: 0.72, roughness: 0.42, metalness: 0.28 }),
  new THREE.MeshStandardMaterial({ color: 0x667799, transparent: true, opacity: 0.24, roughness: 0.2, metalness: 0.45 })
];
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x8ca1c8, transparent: true, opacity: 0.45 });
const surfaceMaterial = new THREE.MeshStandardMaterial({ color: 0xf6821f, emissive: 0x5a2300, emissiveIntensity: 1.2, transparent: true, opacity: 0.72, roughness: 0.35, metalness: 0.2 });

let currentLevel = Number(localStorage.getItem('arrow3d_renderer_level') || 1);
let autoRotate = false;
let spinVelocity = 0.004;
let activeTower = null;

function clearTower() {
  while (tower.children.length) {
    const child = tower.children.pop();
    child.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
    });
  }
}

function addVoxel(cell, bounds) {
  const size = 0.92;
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = towerMaterials[(cell.y + cell.x + cell.z) & 1];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    cell.x - (bounds.width - 1) / 2,
    cell.y,
    cell.z - (bounds.depth - 1) / 2
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.cell = cell;

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
  mesh.add(edges);
  tower.add(mesh);
}

function addSurfaceMarker(cell, bounds) {
  const base = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  for (const normal of cell.normals) {
    const marker = new THREE.Mesh(base, surfaceMaterial);
    marker.position.set(
      cell.x - (bounds.width - 1) / 2 + normal.x * 0.5,
      cell.y + normal.y * 0.5,
      cell.z - (bounds.depth - 1) / 2 + normal.z * 0.5
    );
    marker.scale.setScalar(0.72);
    marker.userData.surfaceCell = cell;
    tower.add(marker);
  }
}

function frameTower(bounds) {
  const box = new THREE.BoxGeometry(bounds.width + 0.3, bounds.height + 0.3, bounds.depth + 0.3);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({ color: 0xf6821f, transparent: true, opacity: 0.22 })
  );
  edges.position.y = (bounds.height - 1) / 2;
  tower.add(edges);
}

function renderTower(level = currentLevel) {
  currentLevel = Math.max(1, Math.floor(level));
  localStorage.setItem('arrow3d_renderer_level', String(currentLevel));
  const seed = `arrow-pro-${currentLevel}`;
  activeTower = window.ArrowTowerGenerator.generateTower({ level: currentLevel, seed });

  clearTower();
  tower.rotation.set(0, 0, 0);

  for (const cell of activeTower.cells) addVoxel(cell, activeTower.bounds);
  for (const cell of activeTower.surface) addSurfaceMarker(cell, activeTower.bounds);
  frameTower(activeTower.bounds);

  const centerY = (activeTower.bounds.height - 1) / 2;
  controls.target.set(0, centerY, 0);
  const span = Math.max(activeTower.bounds.width, activeTower.bounds.depth, activeTower.bounds.height);
  camera.position.set(span * 1.35, span * 0.95, span * 1.65);
  controls.minDistance = Math.max(6, span * 0.9);
  controls.maxDistance = Math.max(20, span * 3.2);
  controls.update();

  levelEl.textContent = currentLevel;
  shapeEl.textContent = activeTower.type;
  cellEl.textContent = activeTower.cellCount;
  levelInput.value = currentLevel;
  statusEl.textContent = `${activeTower.type} tower generated — drag to rotate.`;
}

function renderRandomTower() {
  const seed = `${Date.now()}-${Math.random()}`;
  activeTower = window.ArrowTowerGenerator.generateTower({ level: currentLevel, seed });
  clearTower();
  tower.rotation.set(0, 0, 0);
  for (const cell of activeTower.cells) addVoxel(cell, activeTower.bounds);
  for (const cell of activeTower.surface) addSurfaceMarker(cell, activeTower.bounds);
  frameTower(activeTower.bounds);
  shapeEl.textContent = activeTower.type;
  cellEl.textContent = activeTower.cellCount;
  statusEl.textContent = `${activeTower.type} tower randomized.`;
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

window.addEventListener('resize', resize);
document.getElementById('prev-btn').addEventListener('click', () => renderTower(currentLevel - 1));
document.getElementById('next-btn').addEventListener('click', () => renderTower(currentLevel + 1));
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
document.getElementById('load-level-btn').addEventListener('click', () => renderTower(Number(levelInput.value) || 1));
levelInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') renderTower(Number(levelInput.value) || 1);
});

resize();
renderTower(currentLevel);
animate();
