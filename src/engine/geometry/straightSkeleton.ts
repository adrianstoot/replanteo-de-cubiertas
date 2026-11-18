import type { Point2D, Point3D, RoofBody } from '../../types/roof';
import type {
  PlaneEquation,
  SolvedEdge,
  SolvedEdgeType,
  SolvedFace,
  SolvedWallPatch,
  SolverIssue,
  WavefrontSnapshot,
} from '../../types/solved';
import {
  add2,
  centroid2D,
  constraintFromPlane,
  constraintFromVerticalLine,
  createPlaneFromEdge,
  cross2,
  dist2,
  dist3,
  dot2,
  ensureCCW,
  ensureCW,
  evalPlane,
  inclinedAreaFromProjected,
  intersectRayWithConstraint,
  intersectTwoConstraints,
  LinearConstraint3D,
  norm2,
  perpLeft,
  pointInPolygon2D,
  polygonArea2D,
  polygonSelfIntersects,
  scale2,
  signedArea2D,
  slopeFromPlane,
  sub2,
} from '../math/vec';

interface FaceBlueprint {
  id: string;
  label: string;
  sourceEdgeId: string;
  plane: PlaneEquation;
  eaveHeight: number;
  isGable: boolean;
  hasActivated: boolean;
  inwardNormal: Point2D;
  initialP1: Point2D;
  initialP2: Point2D;
  hasGutter: boolean;
  gutterDiameterMm: number;
  gutterSlopePct: number;
  segments: Array<{ p1: Point3D; p2: Point3D }>;
  wallInitP1?: Point2D;
  wallInitP2?: Point2D;
  wallStartZ?: number;
}

interface WaveVertex {
  id: number;
  pos: Point2D;
  z: number;
  rayP0: Point2D;
  rayV: Point2D;
  prev: WaveVertex;
  next: WaveVertex;
  leftFaceId: string;
  rightFaceId: string;
  isReflex: boolean;
  alive: boolean;
}

export interface SkeletonResult {
  faces: SolvedFace[];
  edges: SolvedEdge[];
  wallPatches: SolvedWallPatch[];
  snapshots: WavefrontSnapshot[];
  issues: SolverIssue[];
}

function quantKey(p: Point2D): string {
  const qx = Math.round(p.x * 1e4);
  const qy = Math.round(p.y * 1e4);
  return `${qx},${qy}`;
}

function edgePairKey(a: Point3D, b: Point3D): string {
  const ka = `${Math.round(a.x * 1e4)},${Math.round(a.y * 1e4)},${Math.round(a.z * 1e4)}`;
  const kb = `${Math.round(b.x * 1e4)},${Math.round(b.y * 1e4)},${Math.round(b.z * 1e4)}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function solveWeightedStraightSkeleton(
  body: RoofBody,
  faceStartIndex = 1
): SkeletonResult {
  const issues: SolverIssue[] = [];
  const snapshots: WavefrontSnapshot[] = [];
  const wallPatches: SolvedWallPatch[] = [];

  if (body.outerLoop.length < 3) {
    issues.push({
      id: `err-verts-${body.id}`,
      severity: 'error',
      bodyId: body.id,
      message: `El cuerpo "${body.name}" necesita al menos 3 vértices.`,
      technicalReason: 'Polígono degenerado con menos de 3 vértices.',
    });
    return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
  }

  const rawPts = body.outerLoop.map((v) => ({ ...v }));
  if (polygonArea2D(rawPts) < 1e-4) {
    issues.push({
      id: `err-area-${body.id}`,
      severity: 'error',
      bodyId: body.id,
      message: `El polígono del cuerpo "${body.name}" tiene área nula.`,
      technicalReason: 'Los vértices son colineales o coincidentes.',
    });
    return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
  }

  if (polygonSelfIntersects(rawPts)) {
    issues.push({
      id: `err-self-${body.id}`,
      severity: 'error',
      bodyId: body.id,
      message: `El perímetro de "${body.name}" se autointerseca.`,
      technicalReason: 'Dos aristas del contorno se cruzan; no define una región cerrada simple.',
    });
    return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
  }

  // Ensure CCW orientation while mapping edge configs accurately
  const isAlreadyCCW = signedArea2D(rawPts) >= 0;
  const outerCCW = isAlreadyCCW ? rawPts : [...rawPts].reverse();

  // Build ordered loops: [outerCCW, ...holesCW]
  const loopsInput: Array<{
    verts: Array<{ id: string; x: number; y: number }>;
    isHole: boolean;
    holeId?: string;
  }> = [{ verts: outerCCW, isHole: false }];

  for (const hole of body.holes) {
    if (hole.vertices.length < 3 || polygonArea2D(hole.vertices) < 1e-4) {
      issues.push({
        id: `warn-hole-${hole.id}`,
        severity: 'warning',
        bodyId: body.id,
        message: `Hueco/patio "${hole.name}" degenerado o demasiado pequeño.`,
        technicalReason: 'Un patio interior debe tener al menos 3 vértices y área positiva.',
      });
      continue;
    }
    if (polygonSelfIntersects(hole.vertices)) {
      issues.push({
        id: `err-hole-self-${hole.id}`,
        severity: 'error',
        bodyId: body.id,
        message: `El patio interior "${hole.name}" se autointerseca.`,
        technicalReason: 'Contorno de patio inválido.',
      });
      return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
    }
    // Check hole lies inside outer boundary
    const allInside = hole.vertices.every((hv) => pointInPolygon2D(hv, outerCCW, false));
    if (!allInside) {
      issues.push({
        id: `err-hole-out-${hole.id}`,
        severity: 'error',
        bodyId: body.id,
        message: `El patio interior "${hole.name}" sobresale o toca el perímetro exterior.`,
        technicalReason: 'Los huecos interiores deben estar contenidos estrictamente dentro del contorno.',
      });
      return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
    }
    const holeCW = ensureCW(hole.vertices);
    loopsInput.push({ verts: holeCW, isHole: true, holeId: hole.id });
  }

  const faceMap = new Map<string, FaceBlueprint>();
  let faceCounter = faceStartIndex;
  let allGables = true;

  // Initialize blueprints for every edge in every loop
  const getEdgeConfig = (vAId: string, vBId: string) => {
    return (
      body.edgeConfigs[`${vAId}->${vBId}`] ||
      body.edgeConfigs[`${vBId}->${vAId}`] ||
      body.edgeConfigs[vAId]
    );
  };

  let minEaveZ = Infinity;

  interface LoopInit {
    vertices: Array<{ x: number; y: number }>;
    edgeFaceIds: string[];
  }
  const initializedLoops: LoopInit[] = [];

  for (const loopDef of loopsInput) {
    const n = loopDef.verts.length;
    const edgeFaceIds: string[] = [];
    for (let i = 0; i < n; i++) {
      const vA = loopDef.verts[i];
      const vB = loopDef.verts[(i + 1) % n];
      const cfg = getEdgeConfig(vA.id, vB.id);
      const edgeId = cfg?.edgeId || `${vA.id}->${vB.id}`;
      const isGable = cfg?.type === 'gable' || cfg?.type === 'wall_abutment';
      const slopePct = cfg ? cfg.slopePct : body.defaultSlopePct;
      const eaveHeight = cfg ? cfg.eaveHeight : body.defaultEaveHeight;

      if (!isGable && slopePct <= 0) {
        issues.push({
          id: `err-slope-${edgeId}`,
          severity: 'error',
          bodyId: body.id,
          location: { x: (vA.x + vB.x) / 2, y: (vA.y + vB.y) / 2 },
          message: `La arista ${edgeId} tiene pendiente <= 0% en una cubierta inclinada.`,
          technicalReason: 'En el algoritmo de faldones inclinados, toda arista vertiente debe tener pendiente positiva (> 0%).',
        });
        return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
      }

      if (!isGable) allGables = false;
      if (eaveHeight < minEaveZ) minEaveZ = eaveHeight;

      const edgeDir = norm2(sub2(vB, vA));
      const inward = perpLeft(edgeDir);
      const slopeRatio = isGable ? 0 : slopePct / 100;
      const plane = createPlaneFromEdge(vA, inward, eaveHeight, slopeRatio);

      const fid = `${body.id}-F${faceCounter}`;
      const label = cfg?.customFaceLabel || `F${faceCounter}`;
      faceCounter++;

      faceMap.set(fid, {
        id: fid,
        label,
        sourceEdgeId: edgeId,
        plane,
        eaveHeight,
        isGable,
        hasActivated: false,
        inwardNormal: inward,
        initialP1: { x: vA.x, y: vA.y },
        initialP2: { x: vB.x, y: vB.y },
        hasGutter: Boolean(cfg?.hasGutter && !isGable),
        gutterDiameterMm: cfg?.gutterDiameterMm ?? 125,
        gutterSlopePct: cfg?.gutterSlopePct ?? 1.0,
        segments: [],
      });
      edgeFaceIds.push(fid);
    }
    initializedLoops.push({
      vertices: loopDef.verts.map((v) => ({ x: v.x, y: v.y })),
      edgeFaceIds,
    });
  }

  if (allGables) {
    issues.push({
      id: `err-all-gables-${body.id}`,
      severity: 'error',
      bodyId: body.id,
      message: `No existe solución: todos los bordes de "${body.name}" son hastiales verticales.`,
      technicalReason: 'Se requiere al menos un borde con faldón inclinado para cerrar geométricamente la cubierta.',
    });
    return { faces: [], edges: [], wallPatches: [], snapshots: [], issues };
  }

  // Activate edges starting at minEaveZ
  let currentZ = minEaveZ;
  for (const bp of faceMap.values()) {
    if (!bp.isGable && bp.eaveHeight <= currentZ + 1e-6) {
      bp.hasActivated = true;
      bp.segments.push({
        p1: { x: bp.initialP1.x, y: bp.initialP1.y, z: bp.eaveHeight },
        p2: { x: bp.initialP2.x, y: bp.initialP2.y, z: bp.eaveHeight },
      });
    } else {
      bp.wallInitP1 = bp.initialP1;
      bp.wallInitP2 = bp.initialP2;
      bp.wallStartZ = currentZ;
    }
  }

  const activeConstraintForFace = (fid: string): LinearConstraint3D => {
    const bp = faceMap.get(fid)!;
    if (bp.hasActivated && !bp.isGable) {
      return constraintFromPlane(bp.plane);
    }
    return constraintFromVerticalLine(bp.initialP1, bp.inwardNormal);
  };

  let nextVertexId = 1;
  const allVertices: WaveVertex[] = [];

  const updateVertexKinematics = (v: WaveVertex) => {
    const dPrev = norm2(sub2(v.pos, v.prev.pos));
    const dNext = norm2(sub2(v.next.pos, v.pos));
    v.isReflex = cross2(dPrev, dNext) < -1e-6;

    const cIn = activeConstraintForFace(v.leftFaceId);
    const cOut = activeConstraintForFace(v.rightFaceId);
    const res = intersectTwoConstraints(cIn, cOut);

    if (res) {
      v.rayP0 = res.p0;
      v.rayV = res.v;
    } else {
      // Parallel / collinear edges
      const bpIn = faceMap.get(v.leftFaceId)!;
      const bpOut = faceMap.get(v.rightFaceId)!;
      if (dot2(dPrev, dNext) >= 0) {
        if (bpIn.hasActivated && !bpIn.isGable) {
          const denom = cIn.A * cIn.A + cIn.B * cIn.B;
          const factor = denom > 1e-12 ? -cIn.D / denom : 0;
          v.rayV = { x: cIn.A * factor, y: cIn.B * factor };
        } else if (bpOut.hasActivated && !bpOut.isGable) {
          const denom = cOut.A * cOut.A + cOut.B * cOut.B;
          const factor = denom > 1e-12 ? -cOut.D / denom : 0;
          v.rayV = { x: cOut.A * factor, y: cOut.B * factor };
        } else {
          v.rayV = { x: 0, y: 0 };
        }
        v.rayP0 = sub2(v.pos, scale2(v.rayV, v.z));
      } else {
        v.rayV = { x: 0, y: 0 };
        v.rayP0 = { ...v.pos };
      }
    }
  };

  const loopHeads: WaveVertex[] = [];

  for (const initLoop of initializedLoops) {
    const n = initLoop.vertices.length;
    const verts: WaveVertex[] = [];
    for (let i = 0; i < n; i++) {
      const prevIdx = (i - 1 + n) % n;
      const wv: WaveVertex = {
        id: nextVertexId++,
        pos: { ...initLoop.vertices[i] },
        z: currentZ,
        rayP0: { x: 0, y: 0 },
        rayV: { x: 0, y: 0 },
        prev: null as unknown as WaveVertex,
        next: null as unknown as WaveVertex,
        leftFaceId: initLoop.edgeFaceIds[prevIdx],
        rightFaceId: initLoop.edgeFaceIds[i],
        isReflex: false,
        alive: true,
      };
      verts.push(wv);
      allVertices.push(wv);
    }
    for (let i = 0; i < n; i++) {
      verts[i].prev = verts[(i - 1 + n) % n];
      verts[i].next = verts[(i + 1) % n];
    }
    for (const wv of verts) {
      updateVertexKinematics(wv);
    }
    loopHeads.push(verts[0]);
  }

  const collectActiveLoops = (): WaveVertex[][] => {
    const visited = new Set<number>();
    const loops: WaveVertex[][] = [];
    for (const v of allVertices) {
      if (!v.alive || visited.has(v.id)) continue;
      const ring: WaveVertex[] = [];
      let curr = v;
      let guard = 0;
      while (curr.alive && !visited.has(curr.id) && guard < 10000) {
        visited.add(curr.id);
        ring.push(curr);
        curr = curr.next;
        guard++;
      }
      if (ring.length >= 2) loops.push(ring);
    }
    return loops;
  };

  const pushSnapshot = (desc: string) => {
    const activeLoops = collectActiveLoops();
    const loops2D = activeLoops.map((ring) => ring.map((v) => ({ ...v.pos })));
    const completedEdges: Array<{ p1: Point2D; p2: Point2D; type: SolvedEdgeType }> = [];
    for (const bp of faceMap.values()) {
      for (const seg of bp.segments) {
        completedEdges.push({
          p1: { x: seg.p1.x, y: seg.p1.y },
          p2: { x: seg.p2.x, y: seg.p2.y },
          type: 'limatesa',
        });
      }
    }
    snapshots.push({
      stepIndex: snapshots.length,
      z: currentZ,
      description: desc,
      loops: loops2D,
      completedEdges,
    });
  };

  pushSnapshot(`Inicio del replanteo en cota base +${currentZ.toFixed(2)} m`);

  const MAX_ITERATIONS = 500;
  let iter = 0;

  while (iter < MAX_ITERATIONS) {
    iter++;
    const activeLoops = collectActiveLoops();
    if (activeLoops.length === 0) break;

    // 1. Immediately close any 2-vertex degenerate needles
    let closedNeedle = false;
    for (const ring of activeLoops) {
      if (ring.length === 2) {
        const u = ring[0];
        const v = ring[1];
        const pU: Point3D = { x: u.pos.x, y: u.pos.y, z: u.z };
        const pV: Point3D = { x: v.pos.x, y: v.pos.y, z: v.z };
        if (dist3(pU, pV) > 1e-6) {
          faceMap.get(u.rightFaceId)?.segments.push({ p1: pV, p2: pU });
          faceMap.get(v.rightFaceId)?.segments.push({ p1: pU, p2: pV });
        }
        u.alive = false;
        v.alive = false;
        closedNeedle = true;
      }
    }
    if (closedNeedle) continue;

    // 2. Find earliest event >= currentZ
    let bestZ = Infinity;
    let bestKind: 'activation' | 'edge' | 'split' | null = null;
    let bestActivationFaceId: string | null = null;
    let bestSplitVertex: WaveVertex | null = null;
    let bestSplitTargetStart: WaveVertex | null = null;

    // (a) Height-activation events
    for (const bp of faceMap.values()) {
      if (!bp.isGable && !bp.hasActivated && bp.eaveHeight > currentZ - 1e-7) {
        if (bp.eaveHeight < bestZ) {
          bestZ = bp.eaveHeight;
          bestKind = 'activation';
          bestActivationFaceId = bp.id;
        }
      }
    }

    // (b) Edge events
    const activeEdges: Array<{ u: WaveVertex; v: WaveVertex }> = [];
    for (const ring of activeLoops) {
      for (const u of ring) {
        activeEdges.push({ u, v: u.next });
      }
    }

    for (const { u, v } of activeEdges) {
      const segVec = sub2(v.pos, u.pos);
      const len = Math.hypot(segVec.x, segVec.y);
      if (len < 1e-6) {
        bestZ = currentZ;
        bestKind = 'edge';
        break;
      }
      const dir = scale2(segVec, 1 / len);
      const relVel = sub2(v.rayV, u.rayV);
      const rate = dot2(relVel, dir);
      if (rate < -1e-8) {
        const zCol = currentZ - len / rate;
        if (zCol >= currentZ - 1e-6 && zCol < bestZ) {
          bestZ = Math.max(currentZ, zCol);
          bestKind = 'edge';
        }
      }
    }

    // (c) Split events (reflex vertices colliding into opposite active edges)
    for (const ring of activeLoops) {
      for (const rv of ring) {
        if (!rv.isReflex) continue;
        for (const { u: eStart, v: eEnd } of activeEdges) {
          if (eStart === rv || eEnd === rv || eStart === rv.next || eEnd === rv.prev) {
            continue;
          }
          if (
            rv.leftFaceId === eStart.rightFaceId ||
            rv.rightFaceId === eStart.rightFaceId
          ) {
            continue;
          }
          const cTarget = activeConstraintForFace(eStart.rightFaceId);
          const hit = intersectRayWithConstraint(rv.rayP0, rv.rayV, cTarget);
          if (!hit) continue;
          if (hit.z < currentZ - 1e-5 || hit.z > bestZ + 1e-5) continue;

          // Verify rv approaches edge E from the roof interior side
          const edgeNormal = perpLeft(norm2(sub2(eEnd.pos, eStart.pos)));
          const relApproach = dot2(sub2(rv.rayV, eStart.rayV), edgeNormal);
          if (relApproach >= -1e-7) continue;

          if (Math.abs(hit.z - bestZ) <= 1e-5 && bestKind === 'split') continue;

          // Verify hit.point lies on moving segment [eStart(hit.z) -> eEnd(hit.z)]
          const aAtZ = add2(eStart.rayP0, scale2(eStart.rayV, hit.z));
          const bAtZ = add2(eEnd.rayP0, scale2(eEnd.rayV, hit.z));
          const ab = sub2(bAtZ, aAtZ);
          const abLenSq = dot2(ab, ab);
          if (abLenSq < 1e-8) continue;
          const t = dot2(sub2(hit.point, aAtZ), ab) / abLenSq;
          if (t < -1e-4 || t > 1 + 1e-4) continue;
          const perpDist = dist2(hit.point, add2(aAtZ, scale2(ab, t)));
          if (perpDist > 1e-3) continue;

          bestZ = Math.max(currentZ, hit.z);
          bestKind = 'split';
          bestSplitVertex = rv;
          bestSplitTargetStart = eStart;
        }
      }
    }

    if (bestKind === null || !Number.isFinite(bestZ)) {
      issues.push({
        id: `err-unbounded-${body.id}`,
        severity: 'error',
        bodyId: body.id,
        message: `La geometría de "${body.name}" no converge hacia una cumbrera cerrada.`,
        technicalReason:
          'Algún frente de onda diverge o existen pendientes/hastiales incompatibles que impiden cerrar el volumen de cubierta.',
      });
      return { faces: [], edges: [], wallPatches: [], snapshots, issues };
    }

    if (bestZ - currentZ > 150) {
      issues.push({
        id: `err-height-${body.id}`,
        severity: 'error',
        bodyId: body.id,
        message: `Altura de cumbrera excesiva (> 150 m) en "${body.name}".`,
        technicalReason: 'Pendientes incompatibles o borde abierto sin intersección válida.',
      });
      return { faces: [], edges: [], wallPatches: [], snapshots, issues };
    }

    // 3. Advance all active vertices to bestZ
    const dz = bestZ - currentZ;
    if (dz > 1e-8) {
      for (const ring of activeLoops) {
        for (const v of ring) {
          const newPos = add2(v.rayP0, scale2(v.rayV, bestZ));
          const pOld: Point3D = { x: v.pos.x, y: v.pos.y, z: currentZ };
          const pNew: Point3D = { x: newPos.x, y: newPos.y, z: bestZ };
          if (dist3(pOld, pNew) > 1e-7) {
            const leftBp = faceMap.get(v.leftFaceId);
            const rightBp = faceMap.get(v.rightFaceId);
            if (leftBp && leftBp.hasActivated && !leftBp.isGable) {
              leftBp.segments.push({ p1: pOld, p2: pNew });
            }
            if (rightBp && rightBp.hasActivated && !rightBp.isGable) {
              rightBp.segments.push({ p1: pNew, p2: pOld });
            }
          }
          v.pos = newPos;
          v.z = bestZ;
        }
      }
      currentZ = bestZ;
    }

    // 4. Execute topological event(s) at currentZ
    if (bestKind === 'activation' && bestActivationFaceId) {
      for (const bp of faceMap.values()) {
        if (!bp.isGable && !bp.hasActivated && bp.eaveHeight <= currentZ + 1e-6) {
          bp.hasActivated = true;
          // Find current active edge segment(s) belonging to bp
          for (const ring of collectActiveLoops()) {
            for (const u of ring) {
              if (u.rightFaceId === bp.id) {
                const p1: Point3D = { x: u.pos.x, y: u.pos.y, z: currentZ };
                const p2: Point3D = { x: u.next.pos.x, y: u.next.pos.y, z: currentZ };
                bp.segments.push({ p1, p2 });
                if (bp.wallStartZ !== undefined && currentZ - bp.wallStartZ > 1e-4) {
                  wallPatches.push({
                    id: `wall-step-${bp.id}-${wallPatches.length}`,
                    bodyId: body.id,
                    kind: 'step',
                    vertices3D: [
                      { x: bp.initialP1.x, y: bp.initialP1.y, z: bp.wallStartZ },
                      { x: bp.initialP2.x, y: bp.initialP2.y, z: bp.wallStartZ },
                      p2,
                      p1,
                    ],
                    length2D: dist2(p1, p2),
                    maxHeight: currentZ - bp.wallStartZ,
                  });
                }
              }
            }
          }
        }
      }
      for (const v of allVertices) {
        if (v.alive) updateVertexKinematics(v);
      }
      pushSnapshot(`Activación de alero en cota +${currentZ.toFixed(2)} m`);
      continue;
    }

    if (bestKind === 'split' && bestSplitVertex && bestSplitTargetStart) {
      const rv = bestSplitVertex;
      const a = bestSplitTargetStart;
      const b = a.next;
      const splitPos = { ...rv.pos };

      // Check if split hits near A or B directly (collapse vertex-vertex)
      if (dist2(splitPos, a.pos) < 1e-4) {
        // Connect rv.prev -> vA_new -> a.next? Wait: split at vertex A:
        // Loop 1: rv.prev -> A1 -> b ...; Loop 2: a.prev -> A2 -> rv.next ...
        const aPrev = a.prev;
        const rvPrev = rv.prev;
        const rvNext = rv.next;
        const v1: WaveVertex = {
          id: nextVertexId++,
          pos: { ...a.pos },
          z: currentZ,
          rayP0: { x: 0, y: 0 },
          rayV: { x: 0, y: 0 },
          prev: rvPrev,
          next: b,
          leftFaceId: rv.leftFaceId,
          rightFaceId: a.rightFaceId,
          isReflex: false,
          alive: true,
        };
        const v2: WaveVertex = {
          id: nextVertexId++,
          pos: { ...a.pos },
          z: currentZ,
          rayP0: { x: 0, y: 0 },
          rayV: { x: 0, y: 0 },
          prev: aPrev,
          next: rvNext,
          leftFaceId: a.leftFaceId,
          rightFaceId: rv.rightFaceId,
          isReflex: false,
          alive: true,
        };
        rvPrev.next = v1;
        b.prev = v1;
        aPrev.next = v2;
        rvNext.prev = v2;
        rv.alive = false;
        a.alive = false;
        allVertices.push(v1, v2);
        updateVertexKinematics(v1);
        updateVertexKinematics(v2);
        updateVertexKinematics(rvPrev);
        updateVertexKinematics(b);
        updateVertexKinematics(aPrev);
        updateVertexKinematics(rvNext);
      } else if (dist2(splitPos, b.pos) < 1e-4) {
        const bNext = b.next;
        const rvPrev = rv.prev;
        const rvNext = rv.next;
        const v1: WaveVertex = {
          id: nextVertexId++,
          pos: { ...b.pos },
          z: currentZ,
          rayP0: { x: 0, y: 0 },
          rayV: { x: 0, y: 0 },
          prev: rvPrev,
          next: bNext,
          leftFaceId: rv.leftFaceId,
          rightFaceId: b.rightFaceId,
          isReflex: false,
          alive: true,
        };
        const v2: WaveVertex = {
          id: nextVertexId++,
          pos: { ...b.pos },
          z: currentZ,
          rayP0: { x: 0, y: 0 },
          rayV: { x: 0, y: 0 },
          prev: a,
          next: rvNext,
          leftFaceId: a.rightFaceId,
          rightFaceId: rv.rightFaceId,
          isReflex: false,
          alive: true,
        };
        rvPrev.next = v1;
        bNext.prev = v1;
        a.next = v2;
        rvNext.prev = v2;
        rv.alive = false;
        b.alive = false;
        allVertices.push(v1, v2);
        updateVertexKinematics(v1);
        updateVertexKinematics(v2);
        updateVertexKinematics(rvPrev);
        updateVertexKinematics(bNext);
        updateVertexKinematics(a);
        updateVertexKinematics(rvNext);
      } else {
        const rvPrev = rv.prev;
        const rvNext = rv.next;
        const oppFaceId = a.rightFaceId;
        const v1: WaveVertex = {
          id: nextVertexId++,
          pos: { ...splitPos },
          z: currentZ,
          rayP0: { x: 0, y: 0 },
          rayV: { x: 0, y: 0 },
          prev: rvPrev,
          next: b,
          leftFaceId: rv.leftFaceId,
          rightFaceId: oppFaceId,
          isReflex: false,
          alive: true,
        };
        const v2: WaveVertex = {
          id: nextVertexId++,
          pos: { ...splitPos },
          z: currentZ,
          rayP0: { x: 0, y: 0 },
          rayV: { x: 0, y: 0 },
          prev: a,
          next: rvNext,
          leftFaceId: oppFaceId,
          rightFaceId: rv.rightFaceId,
          isReflex: false,
          alive: true,
        };
        rvPrev.next = v1;
        b.prev = v1;
        a.next = v2;
        rvNext.prev = v2;
        rv.alive = false;
        allVertices.push(v1, v2);
        updateVertexKinematics(v1);
        updateVertexKinematics(v2);
        updateVertexKinematics(rvPrev);
        updateVertexKinematics(b);
        updateVertexKinematics(a);
        updateVertexKinematics(rvNext);
      }
      pushSnapshot(`Evento Split (división por limahoya) en +${currentZ.toFixed(2)} m`);
      // Also collapse any immediate 0-length edges or 180-deg antiparallel fold-backs created by parallel splits
      let postSplitPass = 0;
      while (postSplitPass < 50) {
        postSplitPass++;
        let didZip = false;
        for (const ring of collectActiveLoops()) {
          if (ring.length === 2) {
            const u = ring[0];
            const v = ring[1];
            const pU: Point3D = { x: u.pos.x, y: u.pos.y, z: currentZ };
            const pV: Point3D = { x: v.pos.x, y: v.pos.y, z: currentZ };
            if (dist3(pU, pV) > 1e-6) {
              faceMap.get(u.rightFaceId)?.segments.push({ p1: pV, p2: pU });
              faceMap.get(v.rightFaceId)?.segments.push({ p1: pU, p2: pV });
            }
            u.alive = false;
            v.alive = false;
            didZip = true;
            break;
          }
          for (const v of ring) {
            const u = v.prev;
            const w = v.next;
            const len1 = dist2(u.pos, v.pos);
            const len2 = dist2(v.pos, w.pos);
            if (len1 < 1e-5 || len2 < 1e-5) continue;
            const d1 = scale2(sub2(v.pos, u.pos), 1 / len1);
            const d2 = scale2(sub2(w.pos, v.pos), 1 / len2);
            if (dot2(d1, d2) < -0.999) {
              const pU: Point3D = { x: u.pos.x, y: u.pos.y, z: currentZ };
              const pV: Point3D = { x: v.pos.x, y: v.pos.y, z: currentZ };
              const pW: Point3D = { x: w.pos.x, y: w.pos.y, z: currentZ };
              if (Math.abs(len1 - len2) < 1e-4) {
                faceMap.get(v.leftFaceId)?.segments.push({ p1: pV, p2: pU });
                faceMap.get(v.rightFaceId)?.segments.push({ p1: pU, p2: pV });
                if (u.prev === w) {
                  u.alive = false;
                  v.alive = false;
                  w.alive = false;
                } else {
                  const m: WaveVertex = {
                    id: nextVertexId++,
                    pos: { ...u.pos },
                    z: currentZ,
                    rayP0: { x: 0, y: 0 },
                    rayV: { x: 0, y: 0 },
                    prev: u.prev,
                    next: w.next,
                    leftFaceId: u.leftFaceId,
                    rightFaceId: w.rightFaceId,
                    isReflex: false,
                    alive: true,
                  };
                  u.prev.next = m;
                  w.next.prev = m;
                  u.alive = false;
                  v.alive = false;
                  w.alive = false;
                  allVertices.push(m);
                  updateVertexKinematics(m);
                }
              } else if (len1 < len2) {
                faceMap.get(v.leftFaceId)?.segments.push({ p1: pV, p2: pU });
                faceMap.get(v.rightFaceId)?.segments.push({ p1: pU, p2: pV });
                u.next = w;
                w.prev = u;
                u.rightFaceId = v.rightFaceId;
                v.alive = false;
                updateVertexKinematics(u);
                updateVertexKinematics(w);
              } else {
                faceMap.get(v.leftFaceId)?.segments.push({ p1: pV, p2: pW });
                faceMap.get(v.rightFaceId)?.segments.push({ p1: pW, p2: pV });
                u.next = w;
                w.prev = u;
                w.leftFaceId = v.leftFaceId;
                v.alive = false;
                updateVertexKinematics(u);
                updateVertexKinematics(w);
              }
              didZip = true;
              break;
            }
          }
          if (didZip) break;
        }
        if (!didZip) break;
      }
      continue;
    }

    // Edge collapse(s) at currentZ (process all zero-length edges in this round)
    let collapsedAny = false;
    let collapsePass = 0;
    while (collapsePass < 50) {
      collapsePass++;
      let foundZeroEdge: { u: WaveVertex; v: WaveVertex } | null = null;
      const curLoops = collectActiveLoops();
      for (const ring of curLoops) {
        if (ring.length === 2) {
          const u = ring[0];
          const v = ring[1];
          const pU: Point3D = { x: u.pos.x, y: u.pos.y, z: currentZ };
          const pV: Point3D = { x: v.pos.x, y: v.pos.y, z: currentZ };
          if (dist3(pU, pV) > 1e-6) {
            faceMap.get(u.rightFaceId)?.segments.push({ p1: pV, p2: pU });
            faceMap.get(v.rightFaceId)?.segments.push({ p1: pU, p2: pV });
          }
          u.alive = false;
          v.alive = false;
          collapsedAny = true;
          break;
        }
        for (const u of ring) {
          const v = u.next;
          if (dist2(u.pos, v.pos) < 1e-4) {
            foundZeroEdge = { u, v };
            break;
          }
        }
        if (foundZeroEdge) break;
      }

      if (!foundZeroEdge) break;

      collapsedAny = true;
      const { u, v } = foundZeroEdge;
      // Record gable wall patch if collapsed edge was a gable face!
      const collapsedFace = faceMap.get(u.rightFaceId);
      if (collapsedFace && collapsedFace.isGable) {
        const apex: Point3D = { x: u.pos.x, y: u.pos.y, z: currentZ };
        const p1Base: Point3D = {
          x: collapsedFace.initialP1.x,
          y: collapsedFace.initialP1.y,
          z: body.baseWallElevation,
        };
        const p2Base: Point3D = {
          x: collapsedFace.initialP2.x,
          y: collapsedFace.initialP2.y,
          z: body.baseWallElevation,
        };
        const p1Eave: Point3D = {
          x: collapsedFace.initialP1.x,
          y: collapsedFace.initialP1.y,
          z: collapsedFace.eaveHeight,
        };
        const p2Eave: Point3D = {
          x: collapsedFace.initialP2.x,
          y: collapsedFace.initialP2.y,
          z: collapsedFace.eaveHeight,
        };
        wallPatches.push({
          id: `gable-${collapsedFace.id}`,
          bodyId: body.id,
          kind: 'gable',
          vertices3D:
            Math.abs(collapsedFace.eaveHeight - body.baseWallElevation) < 1e-3
              ? [p1Base, p2Base, apex]
              : [p1Base, p2Base, p2Eave, apex, p1Eave],
          length2D: dist2(collapsedFace.initialP1, collapsedFace.initialP2),
          maxHeight: currentZ - body.baseWallElevation,
        });
      }

      if (u.next === v && v.next === u) {
        u.alive = false;
        v.alive = false;
        continue;
      }

      const w: WaveVertex = {
        id: nextVertexId++,
        pos: { x: (u.pos.x + v.pos.x) * 0.5, y: (u.pos.y + v.pos.y) * 0.5 },
        z: currentZ,
        rayP0: { x: 0, y: 0 },
        rayV: { x: 0, y: 0 },
        prev: u.prev,
        next: v.next,
        leftFaceId: u.leftFaceId,
        rightFaceId: v.rightFaceId,
        isReflex: false,
        alive: true,
      };
      u.prev.next = w;
      v.next.prev = w;
      u.alive = false;
      v.alive = false;
      allVertices.push(w);
      updateVertexKinematics(w);
      updateVertexKinematics(w.prev);
      updateVertexKinematics(w.next);
    }

    if (collapsedAny) {
      pushSnapshot(`Encuentro de faldones en cota +${currentZ.toFixed(2)} m`);
    }
  }

  // Extract clean closed CCW polygons for each active face
  const solvedFaces: SolvedFace[] = [];
  for (const bp of faceMap.values()) {
    if (bp.isGable || bp.segments.length < 3) continue;
    const loops = extractClosedFaceCycles(bp.segments);
    loops.forEach((loop3D, idx) => {
      const poly2D = loop3D.map((p) => ({ x: p.x, y: p.y }));
      const area2D = polygonArea2D(poly2D);
      if (area2D < 1e-4) return;
      const oriented2D = ensureCCW(poly2D);
      // Re-evaluate exact 3D Z on the plane to compute planarity residual against raw skeleton nodes
      let maxRes = 0;
      const oriented3D: Point3D[] = oriented2D.map((pt) => {
        const match = loop3D.find((q) => dist2(q, pt) < 1e-4);
        const exactZ = evalPlane(bp.plane, pt.x, pt.y);
        if (match) {
          maxRes = Math.max(maxRes, Math.abs(match.z - exactZ));
        }
        return { x: pt.x, y: pt.y, z: exactZ };
      });
      const zVals = oriented3D.map((p) => p.z);
      const minZ = Math.min(...zVals);
      const maxZ = Math.max(...zVals);
      const c2 = centroid2D(oriented2D);
      const c3 = { x: c2.x, y: c2.y, z: evalPlane(bp.plane, c2.x, c2.y) };
      const slopeInfo = slopeFromPlane(bp.plane);

      solvedFaces.push({
        id: loops.length === 1 ? bp.id : `${bp.id}-${idx + 1}`,
        label: loops.length === 1 ? bp.label : `${bp.label}.${idx + 1}`,
        bodyId: body.id,
        sourceEdgeId: bp.sourceEdgeId,
        polygon2D: oriented2D,
        vertices3D: oriented3D,
        plane: bp.plane,
        slopeRatio: slopeInfo.slopeRatio,
        slopePct: slopeInfo.slopePct,
        angleDeg: slopeInfo.angleDeg,
        azimuthDeg: slopeInfo.azimuthDeg,
        orientationLabel: slopeInfo.orientationLabel,
        runoffDir2D: slopeInfo.runoffDir2D,
        centroid2D: c2,
        centroid3D: c3,
        minZ,
        maxZ,
        projectedAreaM2: area2D,
        inclinedAreaM2: inclinedAreaFromProjected(area2D, bp.plane),
        planarityMaxResidual: maxRes,
      });
    });
  }

  // Classify edges topologically across solved faces
  const edges = buildClassifiedEdges(body, solvedFaces, faceMap);
  return { faces: solvedFaces, edges, wallPatches, snapshots, issues };
}

/**
 * Traces closed simple cycles from directed 3D boundary segments of a roof face.
 */
function extractClosedFaceCycles(
  rawSegments: Array<{ p1: Point3D; p2: Point3D }>
): Point3D[][] {
  // Remove zero-length segments
  const segs = rawSegments.filter((s) => dist2(s.p1, s.p2) > 1e-5);
  if (segs.length < 3) return [];

  interface DirectedEdge {
    p1: Point3D;
    p2: Point3D;
    k1: string;
    k2: string;
    used: boolean;
    angle: number;
  }

  const outMap = new Map<string, DirectedEdge[]>();
  const allEdges: DirectedEdge[] = [];

  for (const s of segs) {
    const k1 = quantKey(s.p1);
    const k2 = quantKey(s.p2);
    if (k1 === k2) continue;
    const angle = Math.atan2(s.p2.y - s.p1.y, s.p2.x - s.p1.x);
    const de: DirectedEdge = { p1: s.p1, p2: s.p2, k1, k2, used: false, angle };
    allEdges.push(de);
    const arr = outMap.get(k1) || [];
    arr.push(de);
    outMap.set(k1, arr);
  }

  const cycles: Point3D[][] = [];

  for (const startEdge of allEdges) {
    if (startEdge.used) continue;
    const cycle: Point3D[] = [];
    let curr: DirectedEdge | null = startEdge;
    let guard = 0;

    while (curr && !curr.used && guard < 1000) {
      guard++;
      curr.used = true;
      cycle.push(curr.p1);
      if (curr.k2 === startEdge.k1) {
        // Closed cycle!
        break;
      }
      const candidates: DirectedEdge[] = (outMap.get(curr.k2) || []).filter((c) => !c.used);
      if (candidates.length === 0) {
        curr = null;
        break;
      }
      if (candidates.length === 1) {
        curr = candidates[0];
      } else {
        // Pick sharpest CCW turn (smallest positive interior angle)
        const inBackAngle = curr.angle + Math.PI;
        let best = candidates[0];
        let bestDelta = Infinity;
        for (const c of candidates) {
          let delta = c.angle - inBackAngle;
          while (delta <= 0) delta += Math.PI * 2;
          while (delta > Math.PI * 2) delta -= Math.PI * 2;
          if (delta < bestDelta) {
            bestDelta = delta;
            best = c;
          }
        }
        curr = best;
      }
    }

    if (cycle.length >= 3 && curr && curr.k2 === startEdge.k1) {
      cycles.push(cycle);
    }
  }

  return cycles;
}

export function buildClassifiedEdges(
  body: RoofBody,
  faces: SolvedFace[],
  faceMap?: Map<string, FaceBlueprint>
): SolvedEdge[] {
  interface HalfEdgeRecord {
    p1: Point3D;
    p2: Point3D;
    face: SolvedFace;
  }

  const buckets = new Map<string, HalfEdgeRecord[]>();

  for (const face of faces) {
    const n = face.vertices3D.length;
    for (let i = 0; i < n; i++) {
      const p1 = face.vertices3D[i];
      const p2 = face.vertices3D[(i + 1) % n];
      if (dist2(p1, p2) < 1e-5) continue;
      const key = edgePairKey(p1, p2);
      const list = buckets.get(key) || [];
      list.push({ p1, p2, face });
      buckets.set(key, list);
    }
  }

  const solvedEdges: SolvedEdge[] = [];
  let edgeCounter = 1;

  for (const list of buckets.values()) {
    const first = list[0];
    const p1 = first.p1;
    const p2 = first.p2;
    const len2D = dist2(p1, p2);
    const len3D = dist3(p1, p2);
    const slopePct = len2D > 1e-6 ? (Math.abs(p2.z - p1.z) / len2D) * 100 : 0;

    if (list.length >= 2) {
      const f1 = list[0].face;
      const f2 = list[1].face;
      if (f1.id === f2.id) continue;

      const midX = (p1.x + p2.x) * 0.5;
      const midY = (p1.y + p2.y) * 0.5;
      const midZ = (p1.z + p2.z) * 0.5;
      const dir = norm2(sub2(p2, p1));
      const leftN = perpLeft(dir);
      const eps = 0.05;
      // list[0] is CCW around f1 -> leftN points INSIDE f1; -leftN points INSIDE f2
      const zInsideF1 = evalPlane(f1.plane, midX + leftN.x * eps, midY + leftN.y * eps);
      const zInsideF2 = evalPlane(f2.plane, midX - leftN.x * eps, midY - leftN.y * eps);

      const d1 = zInsideF1 - midZ;
      const d2 = zInsideF2 - midZ;

      let type: SolvedEdgeType;
      if (d1 < -1e-5 && d2 < -1e-5) {
        // Both faces descend away from edge -> Ridge (cumbrera if horizontal, limatesa if sloped)
        type = Math.abs(p2.z - p1.z) < 5e-3 ? 'cumbrera' : 'limatesa';
      } else if (d1 > 1e-5 && d2 > 1e-5) {
        // Both faces ascend away from edge -> Valley (limahoya)
        type = 'limahoya';
      } else {
        // Same-side fold: compare gradient cross/dihedral
        type = d1 + d2 > 0 ? 'limahoya' : 'limatesa';
      }

      solvedEdges.push({
        id: `${body.id}-E${edgeCounter++}`,
        type,
        bodyId: body.id,
        p1,
        p2,
        length2D: len2D,
        length3D: len3D,
        slopePct,
        faceIds: [f1.id, f2.id],
      });
    } else {
      // Boundary edge of 1 face
      const f = first.face;
      const isHorizontal = Math.abs(p2.z - p1.z) < 5e-3;
      const bp = faceMap?.get(f.id);
      const type: SolvedEdgeType = isHorizontal ? 'alero' : 'borde_lateral';
      solvedEdges.push({
        id: `${body.id}-E${edgeCounter++}`,
        type,
        bodyId: body.id,
        p1,
        p2,
        length2D: len2D,
        length3D: len3D,
        slopePct,
        faceIds: [f.id],
        sourceEdgeId: bp?.sourceEdgeId ?? f.sourceEdgeId,
        hasGutter: type === 'alero' ? bp?.hasGutter : false,
        gutterDiameterMm: bp?.gutterDiameterMm,
        gutterSlopePct: bp?.gutterSlopePct,
      });
    }
  }

  return solvedEdges;
}
