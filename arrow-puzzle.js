(function () {
  'use strict';

  const DIRECTIONS = [
    { x: 1, y: 0, z: 0, name: '+X' },
    { x: -1, y: 0, z: 0, name: '-X' },
    { x: 0, y: 1, z: 0, name: '+Y' },
    { x: 0, y: -1, z: 0, name: '-Y' },
    { x: 0, y: 0, z: 1, name: '+Z' },
    { x: 0, y: 0, z: -1, name: '-Z' }
  ];

  function hashSeed(value) {
    let h = 2166136261 >>> 0;
    const text = String(value ?? 'arrow-puzzle');
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
  }

  function rng(seed) {
    let state = hashSeed(seed);
    return function () {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function key(x, y, z) {
    return `${x},${y},${z}`;
  }

  function canSlide(arrow, occupied, bounds) {
    let x = arrow.x + arrow.dx;
    let y = arrow.y + arrow.dy;
    let z = arrow.z + arrow.dz;
    while (
      x >= 0 && x < bounds.width &&
      y >= 0 && y < bounds.height &&
      z >= 0 && z < bounds.depth
    ) {
      if (occupied.has(key(x, y, z))) return false;
      x += arrow.dx;
      y += arrow.dy;
      z += arrow.dz;
    }
    return true;
  }

  function isSolvable(arrows, bounds) {
    const remaining = arrows.map(a => ({ ...a }));
    const occupied = new Set(remaining.map(a => key(a.x, a.y, a.z)));
    while (remaining.length) {
      const index = remaining.findIndex(a => canSlide(a, occupied, bounds));
      if (index < 0) return false;
      const [removed] = remaining.splice(index, 1);
      occupied.delete(key(removed.x, removed.y, removed.z));
    }
    return true;
  }

  function shuffle(items, random) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function directionFromNormal(normal) {
    return DIRECTIONS.find(d =>
      d.x === normal.x && d.y === normal.y && d.z === normal.z
    );
  }

  function makeCandidate(surface, level, random) {
    const positions = shuffle(surface.slice(), random);
    const count = Math.min(
      positions.length,
      Math.max(8, Math.min(64, 7 + Math.floor(level * 1.7)))
    );
    const arrows = [];
    const used = new Set();

    for (const cell of positions) {
      if (arrows.length >= count) break;
      const positionKey = key(cell.x, cell.y, cell.z);
      if (used.has(positionKey) || !cell.normals?.length) continue;
      used.add(positionKey);

      const normal = cell.normals[Math.floor(random() * cell.normals.length)];
      const direction = directionFromNormal(normal);
      if (!direction) continue;

      arrows.push({
        id: arrows.length,
        x: cell.x,
        y: cell.y,
        z: cell.z,
        dx: direction.x,
        dy: direction.y,
        dz: direction.z,
        direction: direction.name,
        removed: false,
        animating: false
      });
    }
    return arrows;
  }

  function generate({ tower, level = 1, seed = 'arrow-puzzle' }) {
    const random = rng(`${seed}:arrows`);
    const maxAttempts = 350;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const arrows = makeCandidate(tower.surface, level, random);
      if (arrows.length >= 2 && isSolvable(arrows, tower.bounds)) {
        return {
          seed, attempt, arrows, total: arrows.length,
          bounds: tower.bounds, solvable: true
        };
      }
    }

    const fallback = tower.surface
      .slice(0, Math.min(tower.surface.length, Math.max(8, Math.min(32, level + 8))))
      .map((cell, index) => {
        const normal = cell.normals[0] || { x: 1, y: 0, z: 0 };
        const direction = directionFromNormal(normal) || DIRECTIONS[0];
        return {
          id: index,
          x: cell.x, y: cell.y, z: cell.z,
          dx: direction.x, dy: direction.y, dz: direction.z,
          direction: direction.name, removed: false, animating: false
        };
      });

    return {
      seed, attempt: maxAttempts, arrows: fallback, total: fallback.length,
      bounds: tower.bounds, solvable: isSolvable(fallback, tower.bounds)
    };
  }

  window.ArrowPuzzleGenerator = { DIRECTIONS, canSlide, isSolvable, generate };
})();
