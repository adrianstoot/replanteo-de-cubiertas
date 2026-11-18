import type { Point2D, Point3D, RoofBody } from '../../types/roof';
import type {
  SolvedEdge,
  SolvedFace,
  SolvedWallPatch,
  SolverIssue,
  WavefrontSnapshot,
} from '../../types/solved';
import {
  centroid2D,
  createPlaneFrom3Points,
  createPlaneFromEdge,
  cross2,
  dist2,
  distancePointToSegment2D,
  ensureCCW,
  evalPlane,
  inclinedAreaFromProjected,
  norm2,
  perpLeft,
  pointInPolygon2D,
  polygonArea2D,
  polygonSelfIntersects,
  slopeFromPlane,
  sub2,
} from '../math/vec';
import { buildClassifiedEdges } from './straightSkeleton';

/**
 * Finds an interior drain point maximizing the minimum positive signed altitude
 * across all polygon boundary edges (keeps inward drainage slopes uniform and avoids thin slivers).
 */
export function findSafeInwardDrainPoint(outerCCW: Point2D[]): Point2D {
  const fallback = centroid2D(outerCCW);
  const evalMinSignedAltitude = (pt: Point2D): number => {
    if (!pointInPolygon2D(pt, outerCCW, false)) return -Infinity;
    let minAlt = Infinity;
    for (let i = 0; i < outerCCW.length; i++) {
      const a = outerCCW[i];
      const b = outerCCW[(i + 1) % outerCCW.length];
      const len = dist2(a, b);
      if (len < 1e-6) continue;
      // Signed distance to half-plane line (positive strictly on left/inward side of CCW edge)
      const signedDist = cross2(sub2(b, a), sub2(pt, a)) / len;
      if (signedDist < minAlt) minAlt = signedDist;
      const segDist = distancePointToSegment2D(pt, a, b);
      if (segDist < minAlt) minAlt = Math.min(minAlt, segDist);
    }
    return minAlt;
  };

  let best = fallback;
  let bestScore = evalMinSignedAltitude(fallback);
  if (bestScore > 1.0) return fallback;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outerCCW) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const steps = 14;
  for (let gx = 1; gx < steps; gx++) {
    for (let gy = 1; gy < steps; gy++) {
      const cand = {
        x: minX + (gx / steps) * (maxX - minX),
        y: minY + (gy / steps) * (maxY - minY),
      };
      const sc = evalMinSignedAltitude(cand);
      if (sc > bestScore) {
        bestScore = sc;
        best = cand;
      }
    }
  }
  return best;
}

export interface FlatOrMonoResult {
  faces: SolvedFace[];
  edges: SolvedEdge[];
  wallPatches: SolvedWallPatch[];
  snapshots: WavefrontSnapshot[];
  issues: SolverIssue[];
}

export function solveFlatInwardDrainBody(
  body: RoofBody,
  faceStartIndex = 1
): FlatOrMonoResult {
  const issues: SolverIssue[] = [];
  const wallPatches: SolvedWallPatch[] = [];
  const snapshots: WavefrontSnapshot[] = [];

  if (body.outerLoop.length < 3 || polygonArea2D(body.outerLoop) < 1e-4) {
    issues.push({
      id: `err-flat-poly-${body.id}`,
      severity: 'error',
      bodyId: body.id,
      message: `El cuerpo plano "${body.name}" tiene contorno inválido.`,
      technicalReason: 'Se requieren al menos 3 vértices no colineales.',
    });
    return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
  }

  if (polygonSelfIntersects(body.outerLoop)) {
    issues.push({
      id: `err-flat-self-${body.id}`,
      severity: 'error',
      bodyId: body.id,
      message: `El perímetro de "${body.name}" se autointerseca.`,
      technicalReason: 'Contorno poligonal no simple.',
    });
    return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
  }

  const outerCCW = ensureCCW(body.outerLoop);
  const c2 = findSafeInwardDrainPoint(outerCCW);
  const drainPt: Point2D = body.flatDrainTarget
    ? { x: body.flatDrainTarget.x, y: body.flatDrainTarget.y }
    : c2;
  const drainZ = body.flatDrainTarget ? body.flatDrainTarget.elevation : body.defaultEaveHeight - 0.06;

  if (!pointInPolygon2D(drainPt, outerCCW, true)) {
    issues.push({
      id: `warn-drain-out-${body.id}`,
      severity: 'warning',
      bodyId: body.id,
      location: drainPt,
      message: `El punto de desagüe de "${body.name}" queda fuera del contorno del faldón.`,
      technicalReason: 'La formación de pendientes hacia sumidero requiere que el punto bajo esté contenido en el paño.',
    });
  }

  const faces: SolvedFace[] = [];
  let fIdx = faceStartIndex;
  const n = outerCCW.length;

  for (let i = 0; i < n; i++) {
    const vA = outerCCW[i];
    const vB = outerCCW[(i + 1) % n];
    const cfg =
      body.edgeConfigs[`${vA.id}->${vB.id}`] ||
      body.edgeConfigs[`${vB.id}->${vA.id}`] ||
      body.edgeConfigs[vA.id];
    const edgeId = cfg?.edgeId || `${vA.id}->${vB.id}`;
    const perimZ = cfg ? cfg.eaveHeight : body.defaultEaveHeight;

    const p1: Point3D = { x: vA.x, y: vA.y, z: perimZ };
    const p2: Point3D = { x: vB.x, y: vB.y, z: perimZ };
    const p3: Point3D = { x: drainPt.x, y: drainPt.y, z: drainZ };

    const poly2D: Point2D[] = [
      { x: vA.x, y: vA.y },
      { x: vB.x, y: vB.y },
      { x: drainPt.x, y: drainPt.y },
    ];
    const area2D = polygonArea2D(poly2D);
    if (area2D < 1e-5) continue;

    const plane = createPlaneFrom3Points(p1, p2, p3);
    const slopeInfo = slopeFromPlane(plane);
    const faceCentroid2D = centroid2D(poly2D);
    const faceCentroid3D: Point3D = {
      x: faceCentroid2D.x,
      y: faceCentroid2D.y,
      z: evalPlane(plane, faceCentroid2D.x, faceCentroid2D.y),
    };
    const label = cfg?.customFaceLabel || `F${fIdx}`;
    const fid = `${body.id}-F${fIdx}`;
    fIdx++;

    faces.push({
      id: fid,
      label,
      bodyId: body.id,
      sourceEdgeId: edgeId,
      polygon2D: poly2D,
      vertices3D: [p1, p2, p3],
      plane,
      slopeRatio: slopeInfo.slopeRatio,
      slopePct: slopeInfo.slopePct,
      angleDeg: slopeInfo.angleDeg,
      azimuthDeg: slopeInfo.azimuthDeg,
      orientationLabel: slopeInfo.orientationLabel,
      runoffDir2D: slopeInfo.runoffDir2D,
      centroid2D: faceCentroid2D,
      centroid3D: faceCentroid3D,
      minZ: Math.min(p1.z, p2.z, p3.z),
      maxZ: Math.max(p1.z, p2.z, p3.z),
      projectedAreaM2: area2D,
      inclinedAreaM2: inclinedAreaFromProjected(area2D, plane),
      planarityMaxResidual: 0,
    });

    // Parapet wall patch along outer perimeter edge if parapetHeight > 0
    const pHeight = cfg?.parapetHeight ?? body.parapetHeight;
    if (pHeight > 0.02) {
      wallPatches.push({
        id: `parapet-${body.id}-${i}`,
        bodyId: body.id,
        kind: 'parapet',
        vertices3D: [
          p1,
          p2,
          { x: p2.x, y: p2.y, z: perimZ + pHeight },
          { x: p1.x, y: p1.y, z: perimZ + pHeight },
        ],
        length2D: dist2(vA, vB),
        maxHeight: pHeight,
      });
    }
  }

  const edges = buildClassifiedEdges(body, faces);
  // Perimeter edges of a flat inward roof are pretiles / aleros
  for (const e of edges) {
    if (e.faceIds.length === 1 && body.parapetHeight > 0.02) {
      e.type = 'pretil';
    }
  }

  snapshots.push({
    stepIndex: 0,
    z: drainZ,
    description: `Replanteo de paños hacia sumidero en cota +${drainZ.toFixed(2)} m`,
    loops: [outerCCW.map((p) => ({ x: p.x, y: p.y }))],
    completedEdges: edges
      .filter((e) => e.faceIds.length === 2)
      .map((e) => ({ p1: e.p1, p2: e.p2, type: e.type })),
  });

  return { faces, edges, wallPatches, snapshots, issues };
}

export function solveMonoPitchBody(body: RoofBody, faceStartIndex = 1): FlatOrMonoResult {
  const issues: SolverIssue[] = [];
  const wallPatches: SolvedWallPatch[] = [];
  const snapshots: WavefrontSnapshot[] = [];

  if (body.outerLoop.length < 3 || polygonArea2D(body.outerLoop) < 1e-4) {
    issues.push({
      id: `err-mono-poly-${body.id}`,
      severity: 'error',
      bodyId: body.id,
      message: `El cuerpo "${body.name}" tiene contorno inválido.`,
      technicalReason: 'Se requieren al menos 3 vértices.',
    });
    return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
  }

  const outerCCW = ensureCCW(body.outerLoop);
  const n = outerCCW.length;
  const baseIdx = Math.max(0, Math.min(n - 1, body.monoPitchBaseEdgeIdx ?? 0));
  const vA = outerCCW[baseIdx];
  const vB = outerCCW[(baseIdx + 1) % n];
  const slopePct = body.monoPitchSlopePct ?? body.defaultSlopePct;
  const baseZ = body.monoPitchBaseZ ?? body.defaultEaveHeight;

  const dir = norm2(sub2(vB, vA));
  const inward = perpLeft(dir);
  const plane = createPlaneFromEdge(vA, inward, baseZ, slopePct / 100);
  const slopeInfo = slopeFromPlane(plane);

  const vertices3D: Point3D[] = outerCCW.map((p) => ({
    x: p.x,
    y: p.y,
    z: evalPlane(plane, p.x, p.y),
  }));
  const poly2D = outerCCW.map((p) => ({ x: p.x, y: p.y }));
  const area2D = polygonArea2D(poly2D);
  const c2 = centroid2D(poly2D);
  const c3: Point3D = { x: c2.x, y: c2.y, z: evalPlane(plane, c2.x, c2.y) };
  const zVals = vertices3D.map((v) => v.z);

  const face: SolvedFace = {
    id: `${body.id}-F${faceStartIndex}`,
    label: `F${faceStartIndex}`,
    bodyId: body.id,
    sourceEdgeId: `${vA.id}->${vB.id}`,
    polygon2D: poly2D,
    vertices3D,
    plane,
    slopeRatio: slopeInfo.slopeRatio,
    slopePct: slopeInfo.slopePct,
    angleDeg: slopeInfo.angleDeg,
    azimuthDeg: slopeInfo.azimuthDeg,
    orientationLabel: slopeInfo.orientationLabel,
    runoffDir2D: slopeInfo.runoffDir2D,
    centroid2D: c2,
    centroid3D: c3,
    minZ: Math.min(...zVals),
    maxZ: Math.max(...zVals),
    projectedAreaM2: area2D,
    inclinedAreaM2: inclinedAreaFromProjected(area2D, plane),
    planarityMaxResidual: 0,
  };

  // Vertical side/back walls under the mono-pitch slope
  for (let i = 0; i < n; i++) {
    const p1 = vertices3D[i];
    const p2 = vertices3D[(i + 1) % n];
    if (i !== baseIdx) {
      wallPatches.push({
        id: `mono-wall-${body.id}-${i}`,
        bodyId: body.id,
        kind: 'gable',
        vertices3D: [
          { x: p1.x, y: p1.y, z: body.baseWallElevation },
          { x: p2.x, y: p2.y, z: body.baseWallElevation },
          p2,
          p1,
        ],
        length2D: dist2(p1, p2),
        maxHeight: Math.max(p1.z, p2.z) - body.baseWallElevation,
      });
    }
  }

  const edges = buildClassifiedEdges(body, [face]);
  const cfgBase = body.edgeConfigs[`${vA.id}->${vB.id}`] || body.edgeConfigs[vA.id];
  if (edges[baseIdx]) {
    edges[baseIdx].type = 'alero';
    edges[baseIdx].hasGutter = cfgBase?.hasGutter ?? true;
    edges[baseIdx].gutterDiameterMm = cfgBase?.gutterDiameterMm ?? 125;
    edges[baseIdx].gutterSlopePct = cfgBase?.gutterSlopePct ?? 1.0;
  }

  snapshots.push({
    stepIndex: 0,
    z: baseZ,
    description: `Cubierta a un agua desde cota +${baseZ.toFixed(2)} m con pendiente ${slopePct.toFixed(1)}%`,
    loops: [poly2D],
    completedEdges: [],
  });

  return { faces: [face], edges, wallPatches, snapshots, issues };
}

export function solveFlatLevelBody(body: RoofBody, faceStartIndex = 1): FlatOrMonoResult {
  const monoLike: RoofBody = {
    ...body,
    monoPitchBaseEdgeIdx: 0,
    monoPitchSlopePct: 0,
    monoPitchBaseZ: body.defaultEaveHeight,
  };
  const res = solveMonoPitchBody(monoLike, faceStartIndex);
  for (const e of res.edges) {
    e.type = body.parapetHeight > 0.02 ? 'pretil' : 'alero';
  }
  return res;
}
