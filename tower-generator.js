/*
 * Arrow Pro 3D — procedural tower generator
 *
 * Generates a voxel tower mask for the 3D puzzle.
 * The generator deliberately separates SHAPE generation from ARROW generation:
 *   tower.cells     -> valid puzzle slots
 *   tower.surface   -> exposed cells, useful for rendering/highlighting
 *   tower.bounds    -> dimensions for the 3D scene
 *
 * No dependencies. Deterministic when a seed is supplied.
 */
(function (root) {
  'use strict';

  const SHAPES = ['square', 'octagon', 'tapered', 'stepped', 'cross', 'irregular'];

  function hashSeed(value) {
    let h = 2166136261 >>> 0;
    const text = String(value ?? Date.now());
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    let state = hashSeed(seed) || 1;
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

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function addCell(set, cells, x, y, z) {
    const k = key(x, y, z);
    if (set.has(k)) return;
    set.add(k);
    cells.push({ x, y, z });
  }

  function centeredRadius(x, z, cx, cz, rx, rz) {
    const dx = (x - cx) / Math.max(rx, 1);
    const dz = (z - cz) / Math.max(rz, 1);
    return Math.sqrt(dx * dx + dz * dz);
  }

  function makeFootprint(type, width, depth, y, height, random) {
    const cells = [];
    const set = new Set();
    const cx = (width - 1) / 2;
    const cz = (depth - 1) / 2;

    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        const rx = Math.max((width - 1) / 2, 1);
        const rz = Math.max((depth - 1) / 2, 1);
        const r = centeredRadius(x, z, cx, cz, rx, rz);
        let inside = false;

        switch (type) {
          case 'octagon':
            inside = Math.abs(x - cx) / rx + Math.abs(z - cz) / rz <= 1.55;
            break;
          case 'cross':
            inside = Math.abs(x - cx) <= Math.max(1, rx * 0.38) ||
                     Math.abs(z - cz) <= Math.max(1, rz * 0.38);
            break;
          case 'irregular':
            inside = r <= 1.0 && random() > 0.10;
            if (x === Math.floor(cx) && z === Math.floor(cz)) inside = true;
            break;
          default:
            inside = r <= 1.0;
            break;
        }

        if (inside) addCell(set, cells, x, y, z);
      }
    }

    return cells;
  }

  function generateTower(options = {}) {
    const level = Math.max(1, Number(options.level) || 1);
    const seed = options.seed ?? `arrow-pro-${level}`;
    const random = rng(seed);

    const width = clamp(
      options.width || 4 + Math.floor(level / 7) + Math.floor(random() * 2),
      4,
      9
    );
    const depth = clamp(
      options.depth || 4 + Math.floor(level / 8) + Math.floor(random() * 2),
      4,
      9
    );
    const height = clamp(
      options.height || 5 + Math.floor(level / 4) + Math.floor(random() * 3),
      5,
      16
    );

    const type = options.type || SHAPES[Math.floor(random() * SHAPES.length)];
    const cells = [];
    const set = new Set();

    // Build the tower one layer at a time. Tapering and stepping are applied
    // to the footprint so the resulting silhouette changes with height.
    for (let y = 0; y < height; y++) {
      let layerWidth = width;
      let layerDepth = depth;

      if (type === 'tapered') {
        const t = y / Math.max(height - 1, 1);
        const scale = 1 - 0.38 * t;
        layerWidth = Math.max(3, Math.round(width * scale));
        layerDepth = Math.max(3, Math.round(depth * scale));
      } else if (type === 'stepped') {
        const band = Math.floor(y / Math.max(2, Math.ceil(height / 4)));
        const shrink = Math.min(2, band);
        layerWidth = Math.max(3, width - shrink * 2);
        layerDepth = Math.max(3, depth - shrink * 2);
      } else if (type === 'irregular') {
        const shift = Math.floor(random() * 3) - 1;
        layerWidth = clamp(width + shift, 3, 9);
        layerDepth = clamp(depth + Math.floor(random() * 3) - 1, 3, 9);
      }

      const layer = makeFootprint(type === 'tapered' ? 'octagon' : type,
        layerWidth, layerDepth, y, height, random);

      const offsetX = Math.floor((width - layerWidth) / 2);
      const offsetZ = Math.floor((depth - layerDepth) / 2);

      for (const cell of layer) {
        let x = cell.x + offsetX;
        let z = cell.z + offsetZ;

        // Small controlled offsets make irregular towers less symmetrical
        // without disconnecting the structure.
        if (type === 'irregular' && random() < 0.08) {
          x = clamp(x + (random() < 0.5 ? -1 : 1), 0, width - 1);
        }
        if (x >= 0 && x < width && z >= 0 && z < depth) {
          addCell(set, cells, x, y, z);
        }
      }
    }

    // Surface = cells with at least one missing 6-neighbor.
    const dirs = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1]
    ];
    const surface = [];

    for (const cell of cells) {
      const exposed = [];
      for (const [dx, dy, dz] of dirs) {
        if (!set.has(key(cell.x + dx, cell.y + dy, cell.z + dz))) {
          exposed.push({ x: dx, y: dy, z: dz });
        }
      }
      if (exposed.length) {
        surface.push({ ...cell, normals: exposed });
      }
    }

    return {
      level,
      seed: String(seed),
      type,
      bounds: { width, height, depth },
      cells,
      surface,
      cellCount: cells.length,
      surfaceCount: surface.length
    };
  }

  root.ArrowTowerGenerator = {
    SHAPES,
    generateTower,
    rng
  };
})(typeof window !== 'undefined' ? window : globalThis);
