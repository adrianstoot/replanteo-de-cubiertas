import type { Point2D, RoofBody } from '../../types/roof';
import type {
  SolvedEdge,
  SolvedFace,
  SolvedWallPatch,
  SolverIssue,
  WavefrontSnapshot,
} from '../../types/solved';
import {
  centroid2D,
  cross2,
  dist2,
  distancePointToSegment2D,
  dot2,
  norm2,
  pointInPolygon2D,
  scale2,
  sub2,
} from '../math/vec';
import {
  solveFlatInwardDrainBody,
  solveFlatLevelBody,
  solveMonoPitchBody,
} from './flatRoofSolver';
import { solveWeightedStraightSkeleton } from './straightSkeleton';

export interface CombinedGeometryResult {
  faces: SolvedFace[];
  edges: SolvedEdge[];
  wallPatches: SolvedWallPatch[];
  snapshots: WavefrontSnapshot[];
  issues: SolverIssue[];
  bounds2D: { minX: number; minY: number; maxX: number; maxY: number };
  bounds3D: { minZ: number; maxZ: number };
}

function overlapCollinear2D(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D
): { start: Point2D; end: Point2D; len: number } | null {
  const dirA = norm2(sub2(a2, a1));
  const dirB = norm2(sub2(b2, b1));
  if (Math.abs(cross2(dirA, dirB)) > 1e-3) return null;
  if (distancePointToSegment2D(b1, a1, a2) > 0.03 && distancePointToSegment2D(a1, b1, b2) > 0.03) {
    // Check collinear line distance
    const dLine = Math.abs(cross2(dirA, sub2(b1, a1)));
    if (dLine > 0.03) return null;
  }
  const lenA = dist2(a1, a2);
  const tB1 = dot2(sub2(b1, a1), dirA);
  const tB2 = dot2(sub2(b2, a1), dirA);
  const lo = Math.max(0, Math.min(tB1, tB2));
  const hi = Math.min(lenA, Math.max(tB1, tB2));
  if (hi - lo <= 0.05) return null;
  const start = { x: a1.x + dirA.x * lo, y: a1.y + dirA.y * lo };
  const end = { x: a1.x + dirA.x * hi, y: a1.y + dirA.y * hi };
  return { start, end, len: hi - lo };
}

export function combineRoofBodies(bodies: RoofBody[]): CombinedGeometryResult {
  const allFaces: SolvedFace[] = [];
  const allEdges: SolvedEdge[] = [];
  const allWalls: SolvedWallPatch[] = [];
  const allSnapshots: WavefrontSnapshot[] = [];
  const allIssues: SolverIssue[] = [];

  let faceCounter = 1;

  for (const body of bodies) {
    let res;
    if (body.mode === 'flat_inward_drain') {
      res = solveFlatInwardDrainBody(body, faceCounter);
    } else if (body.mode === 'mono_pitch') {
      res = solveMonoPitchBody(body, faceCounter);
    } else if (body.mode === 'flat_level') {
      res = solveFlatLevelBody(body, faceCounter);
    } else {
      res = solveWeightedStraightSkeleton(body, faceCounter);
    }

    faceCounter += res.faces.length;
    allFaces.push(...res.faces);
    allEdges.push(...res.edges);
    allWalls.push(...res.wallPatches);
    allIssues.push(...res.issues);
    if (res.snapshots.length > 0 && allSnapshots.length === 0) {
      allSnapshots.push(...res.snapshots);
    }
  }

  // Detect inter-body junctions (valleys between adjacent bodies or abutment against higher walls)
  const faceMap = new Map(allFaces.map((f) => [f.id, f]));
  const bodyBoundaryEdges = allEdges.filter((e) => e.faceIds.length === 1);

  for (let i = 0; i < bodyBoundaryEdges.length; i++) {
    const eA = bodyBoundaryEdges[i];
    for (let j = i + 1; j < bodyBoundaryEdges.length; j++) {
      const eB = bodyBoundaryEdges[j];
      if (eA.bodyId === eB.bodyId) continue;
      const ov = overlapCollinear2D(eA.p1, eA.p2, eB.p1, eB.p2);
      if (!ov) continue;

      const avgZA = (eA.p1.z + eA.p2.z) * 0.5;
      const avgZB = (eB.p1.z + eB.p2.z) * 0.5;
      const dz = Math.abs(avgZA - avgZB);

      if (dz > 0.08) {
        // Height step: lower body meets vertical facade/parapet wall of higher body!
        if (avgZA < avgZB) {
          eA.type = 'encuentro_paramento';
          eA.hasGutter = false;
        } else {
          eB.type = 'encuentro_paramento';
          eB.hasGutter = false;
        }
      } else {
        // Same height junction: check if faces drain into the shared seam -> limahoya!
        const fA = faceMap.get(eA.faceIds[0]);
        const fB = faceMap.get(eB.faceIds[0]);
        if (fA && fB && fA.slopePct > 0.1 && fB.slopePct > 0.1) {
          const mid = scale2({ x: ov.start.x + ov.end.x, y: ov.start.y + ov.end.y }, 0.5);
          const toSeamA = norm2(sub2(mid, fA.centroid2D));
          const toSeamB = norm2(sub2(mid, fB.centroid2D));
          const drainsIntoA = dot2(fA.runoffDir2D, toSeamA) > 0.25;
          const drainsIntoB = dot2(fB.runoffDir2D, toSeamB) > 0.25;
          if (drainsIntoA && drainsIntoB) {
            eA.type = 'limahoya';
            eA.faceIds = [fA.id, fB.id];
            eA.hasGutter = false;
            eB.type = 'junta_cuerpo';
            eB.hasGutter = false;
          } else if (
            eA.type === 'pretil' ||
            eB.type === 'pretil' ||
            (fA.slopePct <= 5.5 && fB.slopePct <= 5.5)
          ) {
            // Equal-height flat/screed bays share an interior ridge crest or seam, never an exterior parapet
            eA.type = 'junta_cuerpo';
            eA.hasGutter = false;
            eB.type = 'junta_cuerpo';
            eB.hasGutter = false;
          }
        }
      }
    }
  }

  // Ensure parapet wallPatches stay 1:1 with edges that are still classified as exterior 'pretil'
  const filteredWalls = allWalls.filter((wp) => {
    if (wp.kind !== 'parapet' || wp.vertices3D.length < 2) return true;
    const pA = wp.vertices3D[0];
    const pB = wp.vertices3D[1];
    const wpMid = { x: (pA.x + pB.x) * 0.5, y: (pA.y + pB.y) * 0.5 };
    const matchingEdge = allEdges.find(
      (e) =>
        e.bodyId === wp.bodyId &&
        e.faceIds.length === 1 &&
        overlapCollinear2D(pA, pB, e.p1, e.p2) !== null &&
        distancePointToSegment2D(wpMid, e.p1, e.p2) < 0.05
    );
    return !matchingEdge || matchingEdge.type === 'pretil';
  });

  // Detect overlapping faces across different bodies (2D intersection check)
  for (let i = 0; i < allFaces.length; i++) {
    const f1 = allFaces[i];
    for (let j = i + 1; j < allFaces.length; j++) {
      const f2 = allFaces[j];
      if (f1.bodyId === f2.bodyId) continue;
      // Check if centroid or interior sample of one lies strictly inside the other
      const c1InF2 = pointInPolygon2D(f1.centroid2D, f2.polygon2D, false);
      const c2InF1 = pointInPolygon2D(f2.centroid2D, f1.polygon2D, false);
      if (c1InF2 || c2InF1) {
        const pt = c1InF2 ? f1.centroid2D : f2.centroid2D;
        allIssues.push({
          id: `warn-overlap-${f1.id}-${f2.id}`,
          severity: 'warning',
          location: pt,
          message: `Superposición geométrica detectada entre ${f1.label} y ${f2.label}.`,
          technicalReason:
            'Dos cuerpos de cubierta se solapan en proyección horizontal. Si no corresponden a plantas superpuestas independientes, recorte el contorno.',
        });
      }
    }
  }

  // Check face planarity residuals
  for (const f of allFaces) {
    if (f.planarityMaxResidual > 1e-3) {
      allIssues.push({
        id: `warn-planar-${f.id}`,
        severity: 'warning',
        bodyId: f.bodyId,
        location: centroid2D(f.polygon2D),
        message: `Residuo de planaridad (${(f.planarityMaxResidual * 1000).toFixed(2)} mm) en faldón ${f.label}.`,
        technicalReason: 'Desviación numérica en intersección de planos.',
      });
    }
  }

  // Compute bounding boxes
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const f of allFaces) {
    for (const v of f.vertices3D) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
  }

  if (!Number.isFinite(minX)) {
    for (const b of bodies) {
      for (const v of b.outerLoop) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
      }
      minZ = Math.min(minZ, b.baseWallElevation, b.defaultEaveHeight);
      maxZ = Math.max(maxZ, b.defaultEaveHeight + 1);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 10;
    maxY = 10;
    minZ = 0;
    maxZ = 5;
  }

  return {
    faces: allFaces,
    edges: allEdges,
    wallPatches: filteredWalls,
    snapshots: allSnapshots,
    issues: allIssues,
    bounds2D: { minX, minY, maxX, maxY },
    bounds3D: { minZ, maxZ },
  };
}
