import * as THREE from 'three';

export interface TextureBundle {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

const cache = new Map<string, TextureBundle>();

function makeCanvas(size = 512): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function makePrng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2Periodic(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let n = Math.imul(px * 374761393 + py * 668265263 + seed * 1442695041, 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function valueNoisePeriodic(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2Periodic(ix, iy, period, seed);
  const n10 = hash2Periodic(ix + 1, iy, period, seed);
  const n01 = hash2Periodic(ix, iy + 1, period, seed);
  const n11 = hash2Periodic(ix + 1, iy + 1, period, seed);
  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  return nx0 * (1 - sy) + nx1 * sy;
}

function fbmPeriodic(u: number, v: number, basePeriod: number, seed: number): number {
  return (
    0.55 * valueNoisePeriodic(u, v, basePeriod, seed) +
    0.30 * valueNoisePeriodic(u, v, basePeriod * 2, seed + 17) +
    0.15 * valueNoisePeriodic(u, v, basePeriod * 4, seed + 53)
  );
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  isColor = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function getMaterialTextures(kind: string): TextureBundle {
  if (cache.has(kind)) return cache.get(kind)!;

  const size = kind === 'grass' ? 768 : 512;
  const [cCol, ctxC] = makeCanvas(size);
  const [cBump, ctxB] = makeCanvas(size);
  const [cRough, ctxR] = makeCanvas(size);
  const rng = makePrng(
    kind.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 1337)
  );

  if (kind === 'terracotta') {
    ctxC.fillStyle = '#cf6c44';
    ctxC.fillRect(0, 0, size, size);
    ctxB.fillStyle = '#808080';
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = '#a8a8a8';
    ctxR.fillRect(0, 0, size, size);

    const cols = 8;
    const rows = 6;
    const cw = size / cols;
    const rh = size / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const shade = ((r * 7 + c * 13) % 28) - 14;
        const R = Math.min(255, Math.max(150, 218 + shade));
        const G = Math.min(255, Math.max(85, 114 + Math.round(shade * 0.6)));
        const B = Math.min(255, Math.max(50, 72 + Math.round(shade * 0.4)));
        const grad = ctxC.createLinearGradient(c * cw, 0, (c + 1) * cw, 0);
        grad.addColorStop(0, `rgb(${R - 26},${G - 18},${B - 14})`);
        grad.addColorStop(0.45, `rgb(${Math.min(255, R + 18)},${Math.min(255, G + 14)},${Math.min(255, B + 10)})`);
        grad.addColorStop(1, `rgb(${R - 30},${G - 20},${B - 14})`);
        ctxC.fillStyle = grad;
        ctxC.fillRect(c * cw, r * rh, cw, rh);

        ctxC.fillStyle = 'rgba(62, 18, 6, 0.42)';
        ctxC.fillRect(c * cw, (r + 1) * rh - 5, cw, 5);

        const bGrad = ctxB.createLinearGradient(c * cw, 0, (c + 1) * cw, 0);
        bGrad.addColorStop(0, '#444444');
        bGrad.addColorStop(0.5, '#f2f2f2');
        bGrad.addColorStop(1, '#444444');
        ctxB.fillStyle = bGrad;
        ctxB.fillRect(c * cw, r * rh, cw, rh);
        ctxB.fillStyle = '#141414';
        ctxB.fillRect(c * cw, (r + 1) * rh - 6, cw, 6);
      }
    }
    for (let i = 0; i < 4500; i++) {
      const gx = Math.floor(rng() * size);
      const gy = Math.floor(rng() * size);
      ctxC.fillStyle = i % 2 === 0 ? 'rgba(255,232,204,0.08)' : 'rgba(85,30,12,0.08)';
      ctxC.fillRect(gx, gy, 2, 2);
      ctxR.fillStyle = i % 3 === 0 ? '#c8c8c8' : '#949494';
      ctxR.fillRect(gx, gy, 3, 3);
    }
  } else if (kind === 'terracotta_tile') {
    // Organic fired clay ceramic with warm kiln patches (no seam borders)
    const imgC = ctxC.createImageData(size, size);
    const imgB = ctxB.createImageData(size, size);
    const imgR = ctxR.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const n = fbmPeriodic(u, v, 6, 201);
        const micro = valueNoisePeriodic(u, v, 48, 299);
        const R = Math.round(196 + n * 44 + (micro - 0.5) * 14);
        const G = Math.round(96 + n * 38 + (micro - 0.5) * 10);
        const B = Math.round(58 + n * 24 + (micro - 0.5) * 8);
        imgC.data[idx] = Math.min(255, Math.max(0, R));
        imgC.data[idx + 1] = Math.min(255, Math.max(0, G));
        imgC.data[idx + 2] = Math.min(255, Math.max(0, B));
        imgC.data[idx + 3] = 255;

        const bv = Math.round(110 + micro * 50 + (n - 0.5) * 30);
        imgB.data[idx] = imgB.data[idx + 1] = imgB.data[idx + 2] = bv;
        imgB.data[idx + 3] = 255;

        const rv = Math.round(188 + (1 - n) * 38 + (micro - 0.5) * 18);
        imgR.data[idx] = imgR.data[idx + 1] = imgR.data[idx + 2] = rv;
        imgR.data[idx + 3] = 255;
      }
    }
    ctxC.putImageData(imgC, 0, 0);
    ctxB.putImageData(imgB, 0, 0);
    ctxR.putImageData(imgR, 0, 0);
  } else if (kind === 'slate') {
    ctxC.fillStyle = '#3c444f';
    ctxC.fillRect(0, 0, size, size);
    ctxB.fillStyle = '#808080';
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = '#7e7e7e';
    ctxR.fillRect(0, 0, size, size);
    const rows = 8;
    const cols = 6;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (size / cols / 2);
      for (let c = -1; c <= cols; c++) {
        const v = ((r * 11 + c * 17) % 18) - 9;
        ctxC.fillStyle = `rgb(${60 + v},${70 + v},${82 + v})`;
        ctxC.fillRect(c * (size / cols) + offset, r * (size / rows), size / cols - 2, size / rows - 2);
        ctxC.fillStyle = 'rgba(18, 22, 28, 0.45)';
        ctxC.fillRect(c * (size / cols) + offset, (r + 1) * (size / rows) - 3, size / cols - 2, 3);
        ctxB.fillStyle = `rgb(${128 + v * 3},${128 + v * 3},${128 + v * 3})`;
        ctxB.fillRect(c * (size / cols) + offset, r * (size / rows), size / cols - 2, size / rows - 2);
      }
    }
  } else if (kind === 'metal') {
    ctxC.fillStyle = '#7b8794';
    ctxC.fillRect(0, 0, size, size);
    ctxB.fillStyle = '#787878';
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = '#525252';
    ctxR.fillRect(0, 0, size, size);
    for (let c = 0; c < 8; c++) {
      const x = c * (size / 8);
      ctxC.fillStyle = '#505c68';
      ctxC.fillRect(x, 0, 5, size);
      ctxC.fillStyle = '#adb8c4';
      ctxC.fillRect(x + 5, 0, 3, size);
      ctxB.fillStyle = '#f2f2f2';
      ctxB.fillRect(x, 0, 6, size);
    }
    for (let i = 0; i < 1600; i++) {
      const gx = Math.floor(rng() * size);
      const gy = Math.floor(rng() * size);
      ctxC.fillStyle = 'rgba(255,255,255,0.04)';
      ctxC.fillRect(gx, gy, 2, 14);
    }
  } else if (kind === 'stone_paver') {
    ctxC.fillStyle = '#c4beb2';
    ctxC.fillRect(0, 0, size, size);
    ctxB.fillStyle = '#606060';
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = '#a2a2a2';
    ctxR.fillRect(0, 0, size, size);
    const grid = 4;
    const step = size / grid;
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const d = ((r * 5 + c * 9) % 14) - 7;
        ctxC.fillStyle = `rgb(${212 + d},${206 + d},${196 + d})`;
        ctxC.fillRect(c * step + 3, r * step + 3, step - 6, step - 6);
        ctxB.fillStyle = '#c2c2c2';
        ctxB.fillRect(c * step + 3, r * step + 3, step - 6, step - 6);
      }
    }
    for (let i = 0; i < 3200; i++) {
      const gx = Math.floor(rng() * size);
      const gy = Math.floor(rng() * size);
      ctxC.fillStyle = i % 2 === 0 ? 'rgba(95,90,82,0.08)' : 'rgba(255,252,246,0.08)';
      ctxC.fillRect(gx, gy, 3, 2);
    }
  } else if (kind === 'stucco') {
    // Architectural mineral mortar render (subtle realistic plaster grain)
    const imgC = ctxC.createImageData(size, size);
    const imgB = ctxB.createImageData(size, size);
    const imgR = ctxR.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const macro = fbmPeriodic(u, v, 5, 401);
        const sand = valueNoisePeriodic(u, v, 64, 433);
        const lum = Math.round(234 + (macro - 0.5) * 14 + (sand - 0.5) * 12);
        imgC.data[idx] = Math.min(255, lum + 3);
        imgC.data[idx + 1] = Math.min(255, lum + 1);
        imgC.data[idx + 2] = Math.min(255, Math.max(0, lum - 6));
        imgC.data[idx + 3] = 255;

        const bv = Math.round(120 + (sand - 0.5) * 70);
        imgB.data[idx] = imgB.data[idx + 1] = imgB.data[idx + 2] = bv;
        imgB.data[idx + 3] = 255;

        const rv = Math.round(208 + (1 - sand) * 28);
        imgR.data[idx] = imgR.data[idx + 1] = imgR.data[idx + 2] = rv;
        imgR.data[idx + 3] = 255;
      }
    }
    ctxC.putImageData(imgC, 0, 0);
    ctxB.putImageData(imgB, 0, 0);
    ctxR.putImageData(imgR, 0, 0);
  } else if (kind === 'wood') {
    // Architectural cedar/pine timber for exposed rafter tails & eave soffits
    const imgC = ctxC.createImageData(size, size);
    const imgB = ctxB.createImageData(size, size);
    const imgR = ctxR.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const warp = fbmPeriodic(u, v, 4, 509) * 2.2;
        const ring = Math.sin((u * 16 + warp) * Math.PI * 2) * 0.5 + 0.5;
        const fiber = valueNoisePeriodic(u, v, 32, 577);
        const R = Math.round(112 + ring * 44 + fiber * 16);
        const G = Math.round(68 + ring * 29 + fiber * 10);
        const B = Math.round(38 + ring * 18 + fiber * 6);
        imgC.data[idx] = R;
        imgC.data[idx + 1] = G;
        imgC.data[idx + 2] = B;
        imgC.data[idx + 3] = 255;

        const bv = Math.round(110 + ring * 55 + (fiber - 0.5) * 26);
        imgB.data[idx] = imgB.data[idx + 1] = imgB.data[idx + 2] = bv;
        imgB.data[idx + 3] = 255;

        const rv = Math.round(150 + (1 - ring) * 35);
        imgR.data[idx] = imgR.data[idx + 1] = imgR.data[idx + 2] = rv;
        imgR.data[idx + 3] = 255;
      }
    }
    ctxC.putImageData(imgC, 0, 0);
    ctxB.putImageData(imgB, 0, 0);
    ctxR.putImageData(imgR, 0, 0);
  } else if (kind === 'gravel') {
    // Seamless river-stone drainage gravel border (encachado de grava)
    ctxC.fillStyle = '#47433c';
    ctxC.fillRect(0, 0, size, size);
    ctxB.fillStyle = '#262626';
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = '#d4d4d4';
    ctxR.fillRect(0, 0, size, size);

    const drawWrappedPebble = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      rot: number,
      rgb: [number, number, number]
    ) => {
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          const px = cx + ox;
          const py = cy + oy;
          if (px < -30 || px > size + 30 || py < -30 || py > size + 30) continue;
          ctxC.save();
          ctxC.translate(px, py);
          ctxC.rotate(rot);
          ctxC.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
          ctxC.beginPath();
          ctxC.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctxC.fill();
          ctxC.strokeStyle = 'rgba(28,26,22,0.38)';
          ctxC.lineWidth = 1;
          ctxC.stroke();
          ctxC.restore();

          ctxB.save();
          ctxB.translate(px, py);
          ctxB.rotate(rot);
          const bg = ctxB.createRadialGradient(-rx * 0.25, -ry * 0.25, 1, 0, 0, Math.max(rx, ry));
          bg.addColorStop(0, '#ededed');
          bg.addColorStop(1, '#585858');
          ctxB.fillStyle = bg;
          ctxB.beginPath();
          ctxB.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctxB.fill();
          ctxB.restore();
        }
      }
    };

    const palette: Array<[number, number, number]> = [
      [186, 179, 168],
      [152, 146, 138],
      [124, 120, 114],
      [204, 196, 182],
      [168, 154, 136],
    ];
    for (let i = 0; i < 2200; i++) {
      const cx = rng() * size;
      const cy = rng() * size;
      const rx = 4 + rng() * 6.5;
      const ry = 3 + rng() * 4.5;
      const rot = rng() * Math.PI;
      const base = palette[Math.floor(rng() * palette.length)];
      const jitter = Math.round((rng() - 0.5) * 20);
      drawWrappedPebble(cx, cy, rx, ry, rot, [
        Math.min(255, Math.max(0, base[0] + jitter)),
        Math.min(255, Math.max(0, base[1] + jitter)),
        Math.min(255, Math.max(0, base[2] + jitter)),
      ]);
    }
  } else {
    // Seamless photorealistic natural turf lawn with fBm organic variation & fine grass blades
    const imgC = ctxC.createImageData(size, size);
    const imgB = ctxB.createImageData(size, size);
    const imgR = ctxR.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const patch = fbmPeriodic(u, v, 5, 701);
        const micro = valueNoisePeriodic(u, v, 40, 743);
        const dry = Math.max(0, patch - 0.62) * 2.2;
        const R = Math.round(52 + patch * 36 + dry * 32 + (micro - 0.5) * 14);
        const G = Math.round(82 + patch * 44 + (micro - 0.5) * 18);
        const B = Math.round(36 + patch * 22 + dry * 12);
        imgC.data[idx] = Math.min(255, Math.max(0, R));
        imgC.data[idx + 1] = Math.min(255, Math.max(0, G));
        imgC.data[idx + 2] = Math.min(255, Math.max(0, B));
        imgC.data[idx + 3] = 255;

        const bv = Math.round(108 + (micro - 0.5) * 60);
        imgB.data[idx] = imgB.data[idx + 1] = imgB.data[idx + 2] = bv;
        imgB.data[idx + 3] = 255;

        const rv = Math.round(212 + (1 - micro) * 28);
        imgR.data[idx] = imgR.data[idx + 1] = imgR.data[idx + 2] = rv;
        imgR.data[idx + 3] = 255;
      }
    }
    ctxC.putImageData(imgC, 0, 0);
    ctxB.putImageData(imgB, 0, 0);
    ctxR.putImageData(imgR, 0, 0);

    // Draw tens of thousands of fine wrapping grass blades for close-up photographic crispness
    ctxC.lineWidth = 1.25;
    ctxB.lineWidth = 1.25;
    const bladeColors = [
      'rgba(104, 146, 62, 0.55)',
      'rgba(78, 118, 44, 0.6)',
      'rgba(130, 162, 76, 0.45)',
      'rgba(52, 82, 29, 0.58)',
    ];
    for (let i = 0; i < 28000; i++) {
      const bx = rng() * size;
      const by = rng() * size;
      const len = 3 + rng() * 7;
      const tilt = (rng() - 0.5) * 4.5;
      const col = bladeColors[i % bladeColors.length];
      const bCol = i % 2 === 0 ? 'rgba(225,225,225,0.45)' : 'rgba(65,65,65,0.4)';

      for (const ox of bx < 12 ? [0, size] : bx > size - 12 ? [0, -size] : [0]) {
        for (const oy of by < 12 ? [0, size] : by > size - 12 ? [0, -size] : [0]) {
          ctxC.strokeStyle = col;
          ctxC.beginPath();
          ctxC.moveTo(bx + ox, by + oy);
          ctxC.quadraticCurveTo(bx + ox + tilt * 0.5, by + oy - len * 0.55, bx + ox + tilt, by + oy - len);
          ctxC.stroke();

          ctxB.strokeStyle = bCol;
          ctxB.beginPath();
          ctxB.moveTo(bx + ox, by + oy);
          ctxB.lineTo(bx + ox + tilt, by + oy - len);
          ctxB.stroke();
        }
      }
    }
  }

  const repeat =
    kind === 'grass'
      ? 14
      : kind === 'gravel'
        ? 8
        : kind === 'stone_paver'
          ? 4
          : kind === 'terracotta'
            ? 2
            : kind === 'terracotta_tile'
              ? 1
              : kind === 'stucco'
                ? 3
                : 3;

  const bundle: TextureBundle = {
    map: finalizeTexture(cCol, repeat, repeat, true),
    bumpMap: finalizeTexture(cBump, repeat, repeat, false),
    roughnessMap: finalizeTexture(cRough, repeat, repeat, false),
  };
  cache.set(kind, bundle);
  return bundle;
}
