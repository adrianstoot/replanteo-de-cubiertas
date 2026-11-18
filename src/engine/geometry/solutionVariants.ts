import type { Downspout, DrainElement, EdgeConfig, Point2D, PolygonVertex, RoofBody, RoofProject } from '../../types/roof';
import type { SolvedRoofModel } from '../../types/solved';
import { ROOF_SYSTEMS } from '../presets/materials';
import { createBlankProject } from '../presets/projects';
import { solveRoofProject } from './roofSolver';
import { findSafeInwardDrainPoint } from './flatRoofSolver';
import { centroid2D, cross2, dist2, ensureCCW, pointInPolygon2D, sub2 } from '../math/vec';

interface GridRect {
  ix0: number;
  ix1: number;
  iy0: number;
  iy1: number;
}

function isSimpleConvexCCW(pts: Point2D[]): boolean {
  const ccw = ensureCCW(pts);
  if (ccw.length < 3) return false;
  for (let i = 0; i < ccw.length; i++) {
    const a = ccw[i];
    const b = ccw[(i + 1) % ccw.length];
    const c = ccw[(i + 2) % ccw.length];
    if (cross2(sub2(b, a), sub2(c, b)) < -1e-4) return false;
  }
  return true;
}

function dedupeSorted(vals: number[], tol = 1e-3): number[] {
  const sorted = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1] > tol) {
      out.push(Number(v.toFixed(4)));
    }
  }
  return out;
}

function mergeRectsStrip(
  inside: boolean[][],
  nx: number,
  ny: number,
  horizontalFirst: boolean
): GridRect[] {
  const used: boolean[][] = Array.from({ length: nx }, () => Array(ny).fill(false));
  const rects: GridRect[] = [];

  if (horizontalFirst) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        if (!inside[ix][iy] || used[ix][iy]) continue;
        let ix1 = ix + 1;
        while (ix1 < nx && inside[ix1][iy] && !used[ix1][iy]) ix1++;
        let iy1 = iy + 1;
        while (iy1 < ny) {
          let rowOk = true;
          for (let kx = ix; kx < ix1; kx++) {
            if (!inside[kx][iy1] || used[kx][iy1]) {
              rowOk = false;
              break;
            }
          }
          if (!rowOk) break;
          iy1++;
        }
        for (let kx = ix; kx < ix1; kx++) {
          for (let ky = iy; ky < iy1; ky++) used[kx][ky] = true;
        }
        rects.push({ ix0: ix, ix1, iy0: iy, iy1 });
      }
    }
  } else {
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        if (!inside[ix][iy] || used[ix][iy]) continue;
        let iy1 = iy + 1;
        while (iy1 < ny && inside[ix][iy1] && !used[ix][iy1]) iy1++;
        let ix1 = ix + 1;
        while (ix1 < nx) {
          let colOk = true;
          for (let ky = iy; ky < iy1; ky++) {
            if (!inside[ix1][ky] || used[ix1][ky]) {
              colOk = false;
              break;
            }
          }
          if (!colOk) break;
          ix1++;
        }
        for (let kx = ix; kx < ix1; kx++) {
          for (let ky = iy; ky < iy1; ky++) used[kx][ky] = true;
        }
        rects.push({ ix0: ix, ix1, iy0: iy, iy1 });
      }
    }
  }
  return rects;
}

/**
 * Splits concave rectilinear footprints (L, U, courtyard shapes) into clean convex rectangular
 * drainage bays ("cuartelillos") with corner-aligned shared seam vertices.
 */
function decomposeBodyToFlatBays(body: RoofBody): { body: RoofBody; sharedEdgeKeys: Set<string> }[] {
  const outer = ensureCCW(body.outerLoop);
  const allLoops = [outer, ...body.holes.map((h) => h.vertices)];
  const isOrtho = allLoops.every((loop) =>
    loop.every((p, i) => {
      const q = loop[(i + 1) % loop.length];
      return Math.abs(q.x - p.x) < 1e-3 || Math.abs(q.y - p.y) < 1e-3;
    })
  );

  if (!isOrtho || (isSimpleConvexCCW(outer) && body.holes.length === 0)) {
    return [{ body: { ...body, outerLoop: outer }, sharedEdgeKeys: new Set<string>() }];
  }

  const xs = dedupeSorted(allLoops.flatMap((l) => l.map((p) => p.x)));
  const ys = dedupeSorted(allLoops.flatMap((l) => l.map((p) => p.y)));
  if (xs.length < 2 || ys.length < 2 || xs.length > 16 || ys.length > 16) {
    return [{ body: { ...body, outerLoop: outer }, sharedEdgeKeys: new Set<string>() }];
  }

  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const inside: boolean[][] = Array.from({ length: nx }, () => Array(ny).fill(false));
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const mc = { x: (xs[ix] + xs[ix + 1]) * 0.5, y: (ys[iy] + ys[iy + 1]) * 0.5 };
      inside[ix][iy] =
        pointInPolygon2D(mc, outer, false) &&
        !body.holes.some((h) => pointInPolygon2D(mc, h.vertices, false));
    }
  }

  const rectsH = mergeRectsStrip(inside, nx, ny, true);
  const rectsV = mergeRectsStrip(inside, nx, ny, false);
  const scoreRects = (rs: GridRect[]) =>
    rs.reduce((acc, r) => {
      const w = xs[r.ix1] - xs[r.ix0];
      const h = ys[r.iy1] - ys[r.iy0];
      return acc + Math.max(w / Math.max(0.2, h), h / Math.max(0.2, w));
    }, 0);

  const rects =
    rectsH.length < rectsV.length
      ? rectsH
      : rectsV.length < rectsH.length
        ? rectsV
        : scoreRects(rectsH) <= scoreRects(rectsV)
          ? rectsH
          : rectsV;

  if (rects.length <= 1) {
    return [{ body: { ...body, outerLoop: outer }, sharedEdgeKeys: new Set<string>() }];
  }

  const owner: number[][] = Array.from({ length: nx }, () => Array(ny).fill(-1));
  rects.forEach((r, idx) => {
    for (let ix = r.ix0; ix < r.ix1; ix++) {
      for (let iy = r.iy0; iy < r.iy1; iy++) owner[ix][iy] = idx;
    }
  });
  const getOwner = (ix: number, iy: number) =>
    ix >= 0 && ix < nx && iy >= 0 && iy < ny ? owner[ix][iy] : -1;

  return rects.map((r, rIdx) => {
    const verts: PolygonVertex[] = [];
    const segShared: boolean[] = [];
    let vCounter = 1;
    const pushV = (x: number, y: number, adjacentCellOwner: number) => {
      verts.push({ id: `${body.id}-fb${rIdx}-v${vCounter++}`, x, y });
      segShared.push(adjacentCellOwner >= 0);
    };

    // Bottom edge (ix0 -> ix1 along iy0), outside cell is iy0 - 1
    pushV(xs[r.ix0], ys[r.iy0], getOwner(r.ix0, r.iy0 - 1));
    for (let ix = r.ix0 + 1; ix < r.ix1; ix++) {
      const prev = getOwner(ix - 1, r.iy0 - 1);
      const next = getOwner(ix, r.iy0 - 1);
      if ((prev >= 0) !== (next >= 0) || prev !== next) {
        pushV(xs[ix], ys[r.iy0], next);
      }
    }
    // Right edge (iy0 -> iy1 along ix1), outside cell is ix1
    pushV(xs[r.ix1], ys[r.iy0], getOwner(r.ix1, r.iy0));
    for (let iy = r.iy0 + 1; iy < r.iy1; iy++) {
      const prev = getOwner(r.ix1, iy - 1);
      const next = getOwner(r.ix1, iy);
      if ((prev >= 0) !== (next >= 0) || prev !== next) {
        pushV(xs[r.ix1], ys[iy], next);
      }
    }
    // Top edge (ix1 -> ix0 along iy1), outside cell is iy1
    pushV(xs[r.ix1], ys[r.iy1], getOwner(r.ix1 - 1, r.iy1));
    for (let ix = r.ix1 - 1; ix > r.ix0; ix--) {
      const prev = getOwner(ix, r.iy1);
      const next = getOwner(ix - 1, r.iy1);
      if ((prev >= 0) !== (next >= 0) || prev !== next) {
        pushV(xs[ix], ys[r.iy1], next);
      }
    }
    // Left edge (iy1 -> iy0 along ix0), outside cell is ix0 - 1
    pushV(xs[r.ix0], ys[r.iy1], getOwner(r.ix0 - 1, r.iy1 - 1));
    for (let iy = r.iy1 - 1; iy > r.iy0; iy--) {
      const prev = getOwner(r.ix0 - 1, iy);
      const next = getOwner(r.ix0 - 1, iy - 1);
      if ((prev >= 0) !== (next >= 0) || prev !== next) {
        pushV(xs[r.ix0], ys[iy], next);
      }
    }

    const sharedEdgeKeys = new Set<string>();
    for (let i = 0; i < verts.length; i++) {
      if (segShared[i]) {
        const va = verts[i];
        const vb = verts[(i + 1) % verts.length];
        sharedEdgeKeys.add(`${va.id}->${vb.id}`);
      }
    }

    const subBody: RoofBody = {
      ...body,
      id: `${body.id}-cuartel-${rIdx + 1}`,
      name: `${body.name} · Paño ${rIdx + 1}`,
      outerLoop: verts,
      holes: [],
      edgeConfigs: {},
    };
    return { body: subBody, sharedEdgeKeys };
  });
}

export interface RoofSolutionVariant {
  id: 'cuatro_aguas' | 'dos_aguas' | 'asimetrica' | 'un_agua' | 'plana_invertida';
  title: string;
  subtitle: string;
  advantage: string;
  recommendedUse: string;
  badgeColor: string;
  project: RoofProject;
  solved: SolvedRoofModel;
}

function cloneProject(proj: RoofProject): RoofProject {
  return JSON.parse(JSON.stringify(proj)) as RoofProject;
}

function getEdgeKey(body: RoofBody, i: number): string {
  const va = body.outerLoop[i];
  const vb = body.outerLoop[(i + 1) % body.outerLoop.length];
  return `${va.id}->${vb.id}`;
}

/**
 * Finds the two opposite extreme boundary edges along the major principal axis of a polygon
 * (e.g., short gable ends on a rectangle, or wing caps on an L/U plan).
 */
function findPrincipalGableEdgeIndices(pts: Point2D[]): [number, number] {
  if (pts.length < 4) return [0, Math.min(1, pts.length - 1)];
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;

  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  // Major eigenvector angle
  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  const axis = { x: Math.cos(theta), y: Math.sin(theta) };

  let bestMinIdx = 0;
  let bestMaxIdx = 1;
  let minScore = Infinity;
  let maxScore = -Infinity;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const mx = (a.x + b.x) * 0.5 - cx;
    const my = (a.y + b.y) * 0.5 - cy;
    const dirX = b.x - a.x;
    const dirY = b.y - a.y;
    const len = Math.hypot(dirX, dirY) || 1;
    // Perpendicularity to major axis -> good candidate for a gable end cap
    const perpAlign = Math.abs((dirX / len) * axis.y - (dirY / len) * axis.x);
    const proj = mx * axis.x + my * axis.y;
    if (perpAlign > 0.45) {
      if (proj < minScore) {
        minScore = proj;
        bestMinIdx = i;
      }
      if (proj > maxScore) {
        maxScore = proj;
        bestMaxIdx = i;
      }
    }
  }
  if (bestMinIdx === bestMaxIdx) {
    bestMaxIdx = (bestMinIdx + Math.floor(pts.length / 2)) % pts.length;
  }
  return [bestMinIdx, bestMaxIdx];
}

function findLongestEdgeIdx(pts: Point2D[]): number {
  let bestIdx = 0;
  let bestLen = -1;
  for (let i = 0; i < pts.length; i++) {
    const len = dist2(pts[i], pts[(i + 1) % pts.length]);
    if (len > bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function buildAutoDownspoutsForBody(body: RoofBody, prefix: string): Downspout[] {
  const ds: Downspout[] = [];
  const eavePts: Point2D[] = [];
  for (let i = 0; i < body.outerLoop.length; i++) {
    const k = getEdgeKey(body, i);
    const cfg = body.edgeConfigs[k];
    if (!cfg || (cfg.type === 'eave' && cfg.hasGutter)) {
      const va = body.outerLoop[i];
      const vb = body.outerLoop[(i + 1) % body.outerLoop.length];
      eavePts.push({ x: Number(((va.x + vb.x) * 0.5).toFixed(3)), y: Number(((va.y + vb.y) * 0.5).toFixed(3)) });
      if (dist2(va, vb) > 5.0) {
        eavePts.push({ x: Number(va.x.toFixed(3)), y: Number(va.y.toFixed(3)) });
      }
    }
  }
  // Deduplicate close downspouts
  const unique: Point2D[] = [];
  for (const pt of eavePts) {
    if (!unique.some((u) => dist2(u, pt) < 2.2)) {
      unique.push(pt);
    }
  }
  unique.slice(0, 6).forEach((pt, idx) => {
    ds.push({
      id: `${prefix}-ds-${idx + 1}`,
      x: pt.x,
      y: pt.y,
      diameterMm: 90,
      kind: 'exterior',
      label: `B${idx + 1} Ø90`,
    });
  });
  return ds;
}

function applySystemMetadata(p: RoofProject, sysId: keyof typeof ROOF_SYSTEMS) {
  const meta = ROOF_SYSTEMS[sysId];
  p.systemId = sysId;
  p.isFlatRoofMode = meta.isFlat;
  p.flatRoofUsage = meta.defaultFlatUsage;
  p.hasWaterproofing = meta.defaultHasWaterproofing;
  p.tileSpec = { ...meta.defaultTileSpec };
  p.layers = meta.defaultLayers.map((l) => ({ ...l }));
}

function makeDefaultBodyIfEmpty(baseProject: RoofProject): RoofProject {
  if (baseProject.bodies.length > 0 && baseProject.bodies[0].outerLoop.length >= 3) {
    return cloneProject(baseProject);
  }
  const blank = createBlankProject('Cubierta Planteada');
  blank.location = { ...baseProject.location };
  blank.units = baseProject.units;
  blank.scaleDenominator = baseProject.scaleDenominator;
  return blank;
}

/**
 * Generates 5 mathematically resolved, distinct constructive roof variants
 * directly from any footprint (rectangular, L, U, patio or arbitrary polygon).
 */
export function generateRoofSolutionVariants(inputProject: RoofProject): RoofSolutionVariant[] {
  const seed = makeDefaultBodyIfEmpty(inputProject);
  const variants: RoofSolutionVariant[] = [];

  // 1. SOLUCIÓN A: Cuatro Aguas Perimetral Clásica (30%)
  {
    const p = cloneProject(seed);
    applySystemMetadata(p, 'teja_mixta');
    p.name = `${seed.name} · Cuatro Aguas`;
    p.drains = [];
    p.bodies = p.bodies.map((b) => {
      const nextCfg: Record<string, EdgeConfig> = {};
      for (let i = 0; i < b.outerLoop.length; i++) {
        const eid = getEdgeKey(b, i);
        const cur = b.edgeConfigs[eid];
        nextCfg[eid] = {
          ...(cur || {
            edgeId: eid,
            eaveHeight: b.defaultEaveHeight,
            overhang: 0.35,
            parapetHeight: 0,
            flashingHeight: 0.25,
            gutterDiameterMm: 125,
            gutterSlopePct: 1.0,
            gutterSection: 'semicircular',
          }),
          edgeId: eid,
          type: 'eave',
          slopePct: 30,
          hasGutter: true,
        };
      }
      return {
        ...b,
        mode: 'pitched_skeleton',
        defaultSlopePct: 30,
        parapetHeight: 0,
        edgeConfigs: nextCfg,
      };
    });
    p.downspouts = buildAutoDownspoutsForBody(p.bodies[0], 'v4a');
    variants.push({
      id: 'cuatro_aguas',
      title: 'Solución 1 · A Cuatro Aguas Perimetral (30%)',
      subtitle: 'Pendiente uniforme en todo el contorno con limatesas y cumbrera',
      advantage: 'Reparte el agua equitativamente hacia todas las fachadas y ofrece gran resistencia aerodinámica.',
      recommendedUse: 'Edificación aislada o plantas en L/U con aleros vistos perimetrales.',
      badgeColor: '#d97706',
      project: p,
      solved: solveRoofProject(p),
    });
  }

  // 2. SOLUCIÓN B: Cubierta a Dos Aguas con Hastiales en Testeros (35%)
  {
    const p = cloneProject(seed);
    applySystemMetadata(p, 'teja_curva');
    p.name = `${seed.name} · Dos Aguas`;
    p.drains = [];
    p.bodies = p.bodies.map((b) => {
      const ccw = ensureCCW(b.outerLoop);
      const [g1, g2] = findPrincipalGableEdgeIndices(ccw);
      const nextCfg: Record<string, EdgeConfig> = {};
      for (let i = 0; i < b.outerLoop.length; i++) {
        const eid = getEdgeKey(b, i);
        const isGable = i === g1 || i === g2;
        const cur = b.edgeConfigs[eid];
        nextCfg[eid] = {
          ...(cur || {
            edgeId: eid,
            eaveHeight: b.defaultEaveHeight,
            overhang: 0.35,
            parapetHeight: 0,
            flashingHeight: 0.25,
            gutterDiameterMm: 125,
            gutterSlopePct: 1.0,
            gutterSection: 'semicircular',
          }),
          edgeId: eid,
          type: isGable ? 'gable' : 'eave',
          slopePct: 35,
          hasGutter: !isGable,
        };
      }
      return {
        ...b,
        mode: 'pitched_skeleton',
        defaultSlopePct: 35,
        parapetHeight: 0,
        edgeConfigs: nextCfg,
      };
    });
    p.downspouts = buildAutoDownspoutsForBody(p.bodies[0], 'v2a');
    variants.push({
      id: 'dos_aguas',
      title: 'Solución 2 · A Dos Aguas con Hastiales (35%)',
      subtitle: 'Faldones principales longitudinales rematados en muros piñón triangulares',
      advantage: 'Elimina limatesas y cortes diagonales de teja, facilitando la ejecución y ventilación bajo cubierta.',
      recommendedUse: 'Naves, viviendas adosadas o cubiertas rectangulares tradicionales.',
      badgeColor: '#dc2626',
      project: p,
      solved: solveRoofProject(p),
    });
  }

  // 3. SOLUCIÓN C: Cubierta Asimétrica de Pendientes Diferenciadas (26% vs 44%)
  {
    const p = cloneProject(seed);
    applySystemMetadata(p, 'teja_mixta');
    p.hasWaterproofing = true;
    const wp = p.layers.find((l) => l.role === 'waterproofing');
    if (wp) wp.visible = true;
    p.name = `${seed.name} · Asimétrica`;
    p.drains = [];
    p.bodies = p.bodies.map((b) => {
      const nextCfg: Record<string, EdgeConfig> = {};
      for (let i = 0; i < b.outerLoop.length; i++) {
        const eid = getEdgeKey(b, i);
        const va = b.outerLoop[i];
        const vb = b.outerLoop[(i + 1) % b.outerLoop.length];
        // South/East edges steeper (44%), North/West shallower (26%) -> shifts ridges mathematically!
        const midY = (va.y + vb.y) * 0.5;
        const avgY = b.outerLoop.reduce((a, v) => a + v.y, 0) / b.outerLoop.length;
        const steeper = midY <= avgY;
        const cur = b.edgeConfigs[eid];
        nextCfg[eid] = {
          ...(cur || {
            edgeId: eid,
            eaveHeight: b.defaultEaveHeight,
            overhang: 0.35,
            parapetHeight: 0,
            flashingHeight: 0.25,
            gutterDiameterMm: 125,
            gutterSlopePct: 1.0,
            gutterSection: 'semicircular',
          }),
          edgeId: eid,
          type: 'eave',
          slopePct: steeper ? 44 : 26,
          hasGutter: true,
        };
      }
      return {
        ...b,
        mode: 'pitched_skeleton',
        defaultSlopePct: 30,
        parapetHeight: 0,
        edgeConfigs: nextCfg,
      };
    });
    p.downspouts = buildAutoDownspoutsForBody(p.bodies[0], 'vasim');
    variants.push({
      id: 'asimetrica',
      title: 'Solución 3 · Asimétrica (26% / 44% con Lámina)',
      subtitle: 'Faldones de distinta inclinación que desplazan cumbreras fuera de la bisectriz',
      advantage: 'Permite mayor captación solar al Sur o ganancia de altura bajo cubierta en una crujía.',
      recommendedUse: 'Optimización bioclimática o adaptación a distinta luz estructural entre fachadas.',
      badgeColor: '#0284c7',
      project: p,
      solved: solveRoofProject(p),
    });
  }

  // 4. SOLUCIÓN D: Cubierta a Un Agua / Monopitch (22% en Zinc o Panel)
  {
    const p = cloneProject(seed);
    applySystemMetadata(p, 'zinc');
    p.name = `${seed.name} · A Un Agua`;
    p.drains = [];
    p.bodies = p.bodies.map((b) => {
      const baseIdx = findLongestEdgeIdx(b.outerLoop);
      const nextCfg: Record<string, EdgeConfig> = {};
      for (let i = 0; i < b.outerLoop.length; i++) {
        const eid = getEdgeKey(b, i);
        const cur = b.edgeConfigs[eid];
        nextCfg[eid] = {
          ...(cur || {
            edgeId: eid,
            eaveHeight: b.defaultEaveHeight,
            overhang: 0.3,
            parapetHeight: 0,
            flashingHeight: 0.25,
            gutterDiameterMm: 150,
            gutterSlopePct: 1.2,
            gutterSection: 'semicircular',
          }),
          edgeId: eid,
          type: i === baseIdx ? 'eave' : 'gable',
          slopePct: 22,
          hasGutter: i === baseIdx,
          gutterDiameterMm: 150,
        };
      }
      return {
        ...b,
        mode: 'mono_pitch',
        monoPitchBaseEdgeIdx: baseIdx,
        monoPitchSlopePct: 22,
        monoPitchBaseZ: b.defaultEaveHeight,
        defaultSlopePct: 22,
        parapetHeight: 0,
        edgeConfigs: nextCfg,
      };
    });
    p.downspouts = buildAutoDownspoutsForBody(p.bodies[0], 'v1a');
    variants.push({
      id: 'un_agua',
      title: 'Solución 4 · A Un Agua en Zinc (22%)',
      subtitle: 'Plano único continuo vertiente hacia el alero principal sin cumbreras',
      advantage: 'Cero intersecciones interiores ni limahoyas: estanqueidad máxima y recogida en un solo canalón.',
      recommendedUse: 'Arquitectura contemporánea, pabellones y climas lluviosos con junta alzada.',
      badgeColor: '#64748b',
      project: p,
      solved: solveRoofProject(p),
    });
  }

  // 5. SOLUCIÓN E: Cubierta Plana Invertida Transitable (2,0% hacia sumidero)
  {
    const p = cloneProject(seed);
    applySystemMetadata(p, 'invertida_transitable');
    p.name = `${seed.name} · Plana Invertida`;
    const newDrains: DrainElement[] = [];
    const newDownspouts: Downspout[] = [];

    const subdividedBays = p.bodies.flatMap((b) => decomposeBodyToFlatBays(b));

    p.bodies = subdividedBays.map(({ body: b, sharedEdgeKeys }, bIdx) => {
      const outerCCW = ensureCCW(b.outerLoop);
      const c2 = findSafeInwardDrainPoint(outerCCW);
      const drainPt = pointInPolygon2D(c2, outerCCW, false) ? c2 : centroid2D(outerCCW);
      const maxSpan = Math.max(
        2,
        ...outerCCW.map((v) => Math.hypot(v.x - drainPt.x, v.y - drainPt.y))
      );
      const drainElev = Number((b.defaultEaveHeight - Math.max(0.04, 0.02 * maxSpan * 0.72)).toFixed(3));
      const did = `vflat-s-${bIdx + 1}`;
      const dsid = `vflat-ds-${bIdx + 1}`;

      newDrains.push({
        id: did,
        kind: 'sumidero',
        x: Number(drainPt.x.toFixed(3)),
        y: Number(drainPt.y.toFixed(3)),
        z: drainElev,
        bodyId: b.id,
        diameterMm: 110,
        connectedDownspoutId: dsid,
        label: `S${bIdx + 1}`,
      });
      newDownspouts.push({
        id: dsid,
        x: Number(drainPt.x.toFixed(3)),
        y: Number(drainPt.y.toFixed(3)),
        diameterMm: 90,
        kind: 'interior',
        label: `B${bIdx + 1} Int`,
      });

      const nextCfg: Record<string, EdgeConfig> = {};
      for (let i = 0; i < b.outerLoop.length; i++) {
        const eid = getEdgeKey(b, i);
        const cur = b.edgeConfigs[eid];
        const isSharedSeam = sharedEdgeKeys.has(eid);
        nextCfg[eid] = {
          ...(cur || {
            edgeId: eid,
            eaveHeight: b.defaultEaveHeight,
            overhang: 0,
            flashingHeight: 0.3,
            gutterDiameterMm: 125,
            gutterSlopePct: 1,
            gutterSection: 'semicircular',
          }),
          edgeId: eid,
          type: isSharedSeam ? 'eave' : 'parapet',
          slopePct: 2.0,
          overhang: 0,
          parapetHeight: isSharedSeam ? 0 : 1.05,
          flashingHeight: 0.3,
          hasGutter: false,
        };
      }
      return {
        ...b,
        mode: 'flat_inward_drain',
        defaultSlopePct: 2.0,
        parapetHeight: 1.05,
        flatDrainTarget: { x: Number(drainPt.x.toFixed(3)), y: Number(drainPt.y.toFixed(3)), elevation: drainElev, drainId: did },
        edgeConfigs: nextCfg,
      };
    });
    // Ensure Tabla 4.6 minimum >= 2 sumideros if area >= 100 m²
    const preSolved = solveRoofProject({ ...p, drains: newDrains, downspouts: newDownspouts });
    if (
      preSolved.hydrology.minimumSumiderosTabla46 !== null &&
      newDrains.length < preSolved.hydrology.minimumSumiderosTabla46 &&
      newDrains.length > 0
    ) {
      const b0 = p.bodies[0];
      const baseD = newDrains[0];
      newDrains.push({
        id: 'vflat-s-extra',
        kind: 'sumidero',
        x: Number((baseD.x + 1.2).toFixed(3)),
        y: Number(baseD.y.toFixed(3)),
        z: baseD.z,
        bodyId: b0.id,
        diameterMm: 110,
        connectedDownspoutId: newDownspouts[0].id,
        label: 'S2',
      });
    }
    p.drains = newDrains;
    p.downspouts = newDownspouts;

    variants.push({
      id: 'plana_invertida',
      title: 'Solución 5 · Plana Invertida Transitable (2%)',
      subtitle: 'Azotea con pretil de 1,05 m, pendientes interiores a sumideros y 8 capas CTE',
      advantage: 'Aprovecha la cubierta como terraza vividera con mínimo impacto de viento y alta inercia térmica.',
      recommendedUse: 'Cubiertas urbanas transitables o edificios de vivienda colectiva.',
      badgeColor: '#0f766e',
      project: p,
      solved: solveRoofProject(p),
    });
  }

  return variants;
}
