import type {
  Point2D,
  Point3D,
  RoofProject,
} from '../../types/roof';
import type {
  DownspoutEvaluation,
  DrainEvaluation,
  GutterEvaluation,
  HydrologyReport,
  SolvedEdge,
  SolvedFace,
  WaterStreamline,
} from '../../types/solved';
import {
  add2,
  cross2,
  dist2,
  distancePointToSegment2D,
  dot2,
  evalPlane,
  norm2,
  pointInPolygon2D,
  scale2,
  sub2,
} from '../math/vec';

/**
 * CTE DB-HS 5 · Tabla 4.7: Diámetro nominal de canalón semicircular (mm)
 * Valores máximos de superficie en proyección horizontal (m²) para i = 100 mm/h.
 */
export const TABLA_47_CANALONES: Record<
  100 | 125 | 150 | 200 | 250,
  Record<'0.5' | '1' | '2' | '4', number>
> = {
  100: { '0.5': 35, '1': 45, '2': 65, '4': 95 },
  125: { '0.5': 60, '1': 80, '2': 115, '4': 165 },
  150: { '0.5': 90, '1': 125, '2': 175, '4': 255 },
  200: { '0.5': 185, '1': 260, '2': 370, '4': 520 },
  250: { '0.5': 335, '1': 475, '2': 670, '4': 930 },
};

/**
 * CTE DB-HS 5 · Tabla 4.8: Diámetro de bajantes de aguas pluviales (mm)
 * Valores máximos de superficie en proyección horizontal (m²) para i = 100 mm/h.
 */
export const TABLA_48_BAJANTES: Array<{ diameterMm: 50 | 63 | 75 | 90 | 110 | 125 | 160 | 200; maxAreaM2: number }> = [
  { diameterMm: 50, maxAreaM2: 65 },
  { diameterMm: 63, maxAreaM2: 113 },
  { diameterMm: 75, maxAreaM2: 177 },
  { diameterMm: 90, maxAreaM2: 318 },
  { diameterMm: 110, maxAreaM2: 580 },
  { diameterMm: 125, maxAreaM2: 805 },
  { diameterMm: 160, maxAreaM2: 1544 },
  { diameterMm: 200, maxAreaM2: 2700 },
];

export function lookupTabla47MaxArea(
  diameterMm: number,
  slopePct: number,
  section: 'semicircular' | 'rectangular'
): number {
  const row =
    TABLA_47_CANALONES[diameterMm as 100 | 125 | 150 | 200 | 250] ||
    TABLA_47_CANALONES[125];
  let base: number;
  if (slopePct >= 4) base = row['4'];
  else if (slopePct >= 2) {
    const t = (slopePct - 2) / 2;
    base = row['2'] + t * (row['4'] - row['2']);
  } else if (slopePct >= 1) {
    const t = slopePct - 1;
    base = row['1'] + t * (row['2'] - row['1']);
  } else if (slopePct >= 0.5) {
    const t = (slopePct - 0.5) / 0.5;
    base = row['0.5'] + t * (row['1'] - row['0.5']);
  } else {
    base = row['0.5'] * Math.max(0, slopePct / 0.5);
  }
  // DB-HS 5: secciones no semicirculares requieren +10% sección (capacidad equivalente 1/1.10)
  return section === 'rectangular' ? base / 1.1 : base;
}

export function requiredGutterDiameterTabla47(
  correctedAreaM2: number,
  slopePct: number,
  section: 'semicircular' | 'rectangular'
): 100 | 125 | 150 | 200 | 250 {
  const diameters: Array<100 | 125 | 150 | 200 | 250> = [100, 125, 150, 200, 250];
  for (const d of diameters) {
    if (lookupTabla47MaxArea(d, Math.max(0.5, slopePct), section) >= correctedAreaM2) {
      return d;
    }
  }
  return 250;
}

export function lookupTabla48MaxArea(diameterMm: number): number {
  const hit = TABLA_48_BAJANTES.find((r) => r.diameterMm === diameterMm);
  if (hit) return hit.maxAreaM2;
  const ge = TABLA_48_BAJANTES.find((r) => r.diameterMm >= diameterMm);
  return ge ? ge.maxAreaM2 : 65;
}

export function requiredDownspoutDiameterTabla48(
  correctedAreaM2: number
): 50 | 63 | 75 | 90 | 110 | 125 | 160 | 200 {
  for (const row of TABLA_48_BAJANTES) {
    if (row.maxAreaM2 >= correctedAreaM2) return row.diameterMm;
  }
  return 200;
}

/**
 * CTE DB-HS 5 · Tabla 4.6 literal intervals:
 * < 100 m² -> 2
 * 100 <= A < 200 -> 3
 * 200 <= A < 500 -> 4
 * > 500 -> ceil(A / 150)  (or 1 per 150 m²)
 * Exact A === 500 m² is not unambiguously covered by "< 500" vs "> 500" -> flagged for technical review!
 */
export function calculateTabla46MinSumideros(horizontalAreaM2: number): {
  minCount: number | null;
  isAmbiguous500: boolean;
} {
  if (Math.abs(horizontalAreaM2 - 500) < 0.01) {
    return { minCount: null, isAmbiguous500: true };
  }
  if (horizontalAreaM2 < 100) return { minCount: 2, isAmbiguous500: false };
  if (horizontalAreaM2 < 200) return { minCount: 3, isAmbiguous500: false };
  if (horizontalAreaM2 < 500) return { minCount: 4, isAmbiguous500: false };
  return { minCount: Math.max(4, Math.ceil(horizontalAreaM2 / 150)), isAmbiguous500: false };
}

function rayExitOnPolygon(
  origin: Point2D,
  dir: Point2D,
  poly: Point2D[]
): { point: Point2D; edgeIndex: number; t: number } | null {
  let bestT = Infinity;
  let bestPt: Point2D | null = null;
  let bestIdx = -1;

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const seg = sub2(b, a);
    const denom = cross2(dir, seg);
    if (Math.abs(denom) < 1e-8) continue;
    const ao = sub2(a, origin);
    const t = cross2(ao, seg) / denom;
    const u = cross2(ao, dir) / denom;
    if (t > 1e-4 && u >= -1e-4 && u <= 1 + 1e-4 && t < bestT) {
      bestT = t;
      bestPt = add2(origin, scale2(dir, t));
      bestIdx = i;
    }
  }
  if (!bestPt) return null;
  return { point: bestPt, edgeIndex: bestIdx, t: bestT };
}

export function evaluateHydrology(
  project: RoofProject,
  faces: SolvedFace[],
  edges: SolvedEdge[]
): HydrologyReport {
  const effectiveIntensityMmH =
    project.location.manualIntensityOverride && project.location.manualIntensityOverride > 0
      ? project.location.manualIntensityOverride
      : project.location.rainIntensityMmH;
  const intensityFactor = effectiveIntensityMmH / 100;
  const totalHorizontalAreaM2 = faces.reduce((acc, f) => acc + f.projectedAreaM2, 0);
  const correctedTotalAreaM2 = totalHorizontalAreaM2 * intensityFactor;

  const alerts: HydrologyReport['alerts'] = [];
  const streamlines: WaterStreamline[] = [];

  const sumideros = project.drains.filter(
    (d) => d.kind === 'sumidero' || d.kind === 'cazoleta' || d.kind === 'canaleta'
  );
  const drainAreaMap = new Map<string, { area: number; faces: string[] }>();
  for (const d of sumideros) {
    drainAreaMap.set(d.id, { area: 0, faces: [] });
  }

  const gutterEdges = edges.filter((e) => e.hasGutter && e.type === 'alero');
  const gutterAreaMap = new Map<string, number>();
  for (const ge of gutterEdges) {
    gutterAreaMap.set(ge.id, 0);
  }

  const valleyEdges = edges.filter((e) => e.type === 'limahoya');
  const valleyAreaMap = new Map<string, number>();
  for (const ve of valleyEdges) {
    valleyAreaMap.set(ve.id, 0);
  }

  const matchEdge = (pA: Point2D, pB: Point2D, faceId: string): SolvedEdge | undefined => {
    const mid = scale2(add2(pA, pB), 0.5);
    return edges.find(
      (e) =>
        e.faceIds.includes(faceId) &&
        distancePointToSegment2D(mid, e.p1, e.p2) < 0.05
    );
  };

  // Trace each face runoff
  for (const face of faces) {
    // Check if flat horizontal face with near-zero slope
    if (face.slopePct < 0.05) {
      const interiorDrain = sumideros.find((d) =>
        pointInPolygon2D({ x: d.x, y: d.y }, face.polygon2D, true)
      );
      if (interiorDrain) {
        const entry = drainAreaMap.get(interiorDrain.id)!;
        entry.area += face.projectedAreaM2;
        entry.faces.push(face.id);
      } else {
        alerts.push({
          id: `alert-flat-nodrain-${face.id}`,
          severity: 'warning',
          location: face.centroid2D,
          title: `Superficie horizontal sin pendiente ni sumidero (${face.label})`,
          detail: `El paño ${face.label} presenta pendiente ${face.slopePct.toFixed(2)}% sin un punto de evacuación asignado.`,
          remediation: 'Asigne una pendiente mínima (>= 1% según DB-HS 1 Tabla 2.9) hacia un sumidero o rebosadero.',
        });
      }
      continue;
    }

    // Check if face converges directly to an interior/vertex sumidero (e.g. flat_inward_drain bay)
    const lowestVertex = face.vertices3D.reduce((acc, v) => (v.z < acc.z ? v : acc), face.vertices3D[0]);
    const drainAtLowest = sumideros.find(
      (d) => dist2(d, lowestVertex) < 0.45 || pointInPolygon2D(d, face.polygon2D, true)
    );

    const exit = rayExitOnPolygon(face.centroid2D, face.runoffDir2D, face.polygon2D);

    if (drainAtLowest && (!exit || dist2(face.centroid2D, drainAtLowest) <= exit.t + 0.35)) {
      const entry = drainAreaMap.get(drainAtLowest.id)!;
      entry.area += face.projectedAreaM2;
      entry.faces.push(face.id);

      const d3: Point3D = {
        x: drainAtLowest.x,
        y: drainAtLowest.y,
        z: evalPlane(face.plane, drainAtLowest.x, drainAtLowest.y),
      };
      streamlines.push({
        id: `flow-${face.id}`,
        faceId: face.id,
        points2D: [face.centroid2D, { x: d3.x, y: d3.y }],
        points3D: [face.centroid3D, d3],
        terminatesAt: 'drain',
        targetId: drainAtLowest.id,
      });
      continue;
    }

    if (exit) {
      const pA = face.polygon2D[exit.edgeIndex];
      const pB = face.polygon2D[(exit.edgeIndex + 1) % face.polygon2D.length];
      const exitEdge = matchEdge(pA, pB, face.id);
      const exit3D: Point3D = {
        x: exit.point.x,
        y: exit.point.y,
        z: evalPlane(face.plane, exit.point.x, exit.point.y),
      };

      // Generate well-distributed hydrodynamic sample rays across the face interior
      const startPts: Point2D[] = [];
      const minX = Math.min(...face.polygon2D.map((p) => p.x));
      const maxX = Math.max(...face.polygon2D.map((p) => p.x));
      const minY = Math.min(...face.polygon2D.map((p) => p.y));
      const maxY = Math.max(...face.polygon2D.map((p) => p.y));
      const span = Math.max(maxX - minX, maxY - minY);
      const gridN = face.projectedAreaM2 > 18 ? 4 : face.projectedAreaM2 > 6 ? 3 : 2;
      for (let gx = 0; gx < gridN; gx++) {
        for (let gy = 0; gy < gridN; gy++) {
          const sx = minX + ((gx + 0.5) / gridN) * (maxX - minX);
          const sy = minY + ((gy + 0.5) / gridN) * (maxY - minY);
          const pt = { x: sx, y: sy };
          if (pointInPolygon2D(pt, face.polygon2D, false)) {
            startPts.push(pt);
          }
        }
      }
      if (startPts.length === 0) startPts.push(face.centroid2D);

      startPts.forEach((sp, idx) => {
        const spExit = rayExitOnPolygon(sp, face.runoffDir2D, face.polygon2D);
        if (spExit && spExit.t > Math.min(0.28, span * 0.12)) {
          const sp3: Point3D = { x: sp.x, y: sp.y, z: evalPlane(face.plane, sp.x, sp.y) };
          const ex3: Point3D = {
            x: spExit.point.x,
            y: spExit.point.y,
            z: evalPlane(face.plane, spExit.point.x, spExit.point.y),
          };
          streamlines.push({
            id: `flow-${face.id}-${idx}`,
            faceId: face.id,
            points2D: [sp, spExit.point],
            points3D: [sp3, ex3],
            terminatesAt:
              exitEdge?.type === 'alero'
                ? exitEdge.hasGutter
                  ? 'gutter'
                  : 'eave'
                : exitEdge?.type === 'pretil' || exitEdge?.type === 'encuentro_paramento'
                  ? 'parapet'
                  : 'eave',
          });
        }
      });

      if (exitEdge) {
        if (exitEdge.type === 'limahoya') {
          valleyAreaMap.set(exitEdge.id, (valleyAreaMap.get(exitEdge.id) || 0) + face.projectedAreaM2);
        } else if (exitEdge.type === 'alero') {
          if (exitEdge.hasGutter) {
            gutterAreaMap.set(exitEdge.id, (gutterAreaMap.get(exitEdge.id) || 0) + face.projectedAreaM2);
          } else {
            // Check if a drain catches water along eave
            const nearDrain = sumideros.find(
              (d) => distancePointToSegment2D(d, exitEdge.p1, exitEdge.p2) < 0.6
            );
            if (nearDrain) {
              const entry = drainAreaMap.get(nearDrain.id)!;
              entry.area += face.projectedAreaM2;
              entry.faces.push(face.id);
            }
          }
        } else if (exitEdge.type === 'pretil' || exitEdge.type === 'encuentro_paramento') {
          // Water blocked against a parapet / vertical wall! Must find a drain nearby!
          const nearDrain = sumideros.find(
            (d) => distancePointToSegment2D(d, exitEdge.p1, exitEdge.p2) < 0.85
          );
          if (nearDrain) {
            const entry = drainAreaMap.get(nearDrain.id)!;
            entry.area += face.projectedAreaM2;
            entry.faces.push(face.id);
          } else {
            alerts.push({
              id: `alert-parapet-trap-${face.id}`,
              severity: 'error',
              location: exit.point,
              title: `Acumulación contra paramento/pretil en ${face.label}`,
              detail: `La escorrentía de ${face.label} vierte hacia el borde cerrado (${exitEdge.type}) sin sumidero ni canaleta de recogida.`,
              remediation: 'Incorpore un sumidero/cazoleta o canaleta en el encuentro, o modifique la dirección de pendiente.',
            });
          }
        }
      } else {
        // Exit point on edge 3D check
        const _dummy = exit3D;
        void _dummy;
      }
    }
  }

  // Trace downhill along every limahoya!
  const exteriorEaveEdges = edges.filter((e) => e.type === 'alero');
  for (const ve of valleyEdges) {
    const pHigh = ve.p1.z >= ve.p2.z ? ve.p1 : ve.p2;
    const pLow = ve.p1.z >= ve.p2.z ? ve.p2 : ve.p1;
    const valleyArea = valleyAreaMap.get(ve.id) || 0;

    streamlines.push({
      id: `flow-valley-${ve.id}`,
      points2D: [
        { x: pHigh.x, y: pHigh.y },
        { x: pLow.x, y: pLow.y },
      ],
      points3D: [pHigh, pLow],
      terminatesAt: 'eave',
      targetId: ve.id,
    });

    // Check where pLow discharges:
    const nearDrain = sumideros.find((d) => dist2(d, pLow) < 0.55);
    if (nearDrain) {
      const entry = drainAreaMap.get(nearDrain.id)!;
      entry.area += valleyArea;
      continue;
    }

    const onExteriorEave = exteriorEaveEdges.find(
      (ae) => distancePointToSegment2D(pLow, ae.p1, ae.p2) < 0.15
    );
    if (onExteriorEave) {
      if (onExteriorEave.hasGutter) {
        gutterAreaMap.set(
          onExteriorEave.id,
          (gutterAreaMap.get(onExteriorEave.id) || 0) + valleyArea
        );
      }
      continue;
    }

    const connectingLowerValley = valleyEdges.find(
      (other) =>
        other.id !== ve.id &&
        (dist2(other.p1, pLow) < 0.12 || dist2(other.p2, pLow) < 0.12) &&
        Math.min(other.p1.z, other.p2.z) < pLow.z - 1e-3
    );
    if (connectingLowerValley) {
      valleyAreaMap.set(
        connectingLowerValley.id,
        (valleyAreaMap.get(connectingLowerValley.id) || 0) + valleyArea
      );
      continue;
    }

    // Dead-end valley inside roof!
    alerts.push({
      id: `alert-blind-valley-${ve.id}`,
      severity: 'error',
      location: { x: pLow.x, y: pLow.y },
      title: `Limahoya sin salida ni sumidero (${ve.id})`,
      detail: `La limahoya converge en cota +${pLow.z.toFixed(2)} m sin alcanzar un alero exterior ni contar con un sumidero/cazoleta en su punto bajo.`,
      remediation: 'Coloque un sumidero o cazoleta de recogida en el extremo inferior de la limahoya, o abra la salida al exterior.',
    });
  }

  // Check flat_inward_drain bodies explicitly have at least one sumidero
  for (const body of project.bodies) {
    if (body.mode === 'flat_inward_drain') {
      const bodyDrains = sumideros.filter(
        (d) => d.bodyId === body.id || pointInPolygon2D(d, body.outerLoop, true)
      );
      if (bodyDrains.length === 0) {
        const pt = body.flatDrainTarget || body.outerLoop[0];
        alerts.push({
          id: `alert-missing-sumidero-${body.id}`,
          severity: 'error',
          location: { x: pt.x, y: pt.y },
          title: `Paño plano "${body.name}" sin sumidero`,
          detail: 'Los faldones convergen hacia un punto interior donde no se ha colocado ningún sumidero.',
          remediation: 'Añada un sumidero en el punto de cota mínima del paño.',
        });
      }
    }
  }

  // Evaluate gutters (Tabla 4.7)
  const gutterEvaluations: GutterEvaluation[] = [];
  const downspoutAreaMap = new Map<string, number>();
  for (const ds of project.downspouts) {
    downspoutAreaMap.set(ds.id, 0);
  }

  for (const ge of gutterEdges) {
    const body = project.bodies.find((b) => b.id === ge.bodyId);
    const cfg = body && ge.sourceEdgeId ? body.edgeConfigs[ge.sourceEdgeId] : undefined;
    const diameterMm = cfg?.gutterDiameterMm ?? ge.gutterDiameterMm ?? 125;
    const slopePct = cfg?.gutterSlopePct ?? ge.gutterSlopePct ?? 1.0;
    const section = cfg?.gutterSection ?? 'semicircular';
    const servedArea = gutterAreaMap.get(ge.id) || 0;
    const correctedArea = servedArea * intensityFactor;
    const maxAllowed = lookupTabla47MaxArea(diameterMm, slopePct, section);
    const reqDiam = requiredGutterDiameterTabla47(correctedArea, slopePct, section);

    gutterEvaluations.push({
      edgeId: ge.id,
      bodyId: ge.bodyId,
      lengthM: ge.length2D,
      diameterMm,
      slopePct,
      section,
      tributaryProjectedAreaM2: servedArea,
      correctedAreaM2: correctedArea,
      maxAllowedAreaM2: maxAllowed,
      compliesTabla47: correctedArea <= maxAllowed + 1e-3 && slopePct >= 0.5,
      compliesMinSlope1Pct: slopePct >= 1.0,
      requiredDiameterMm: reqDiam,
    });

    if (slopePct < 0.5) {
      alerts.push({
        id: `alert-gutter-slope-${ge.id}`,
        severity: 'error',
        location: { x: (ge.p1.x + ge.p2.x) / 2, y: (ge.p1.y + ge.p2.y) / 2 },
        title: `Canalón con pendiente insuficiente (${slopePct.toFixed(1)}%)`,
        detail: 'El DB-HS 5 exige pendiente mínima del 0,5% (y el DB-HS 1 recomienda/exige >= 1% en canalones vistos).',
        remediation: 'Incremente la pendiente del canalón al 1,0% o superior.',
      });
    }

    // Route gutter water to nearest downspout along the gutter edge
    let nearestDs = project.downspouts[0];
    let bestDist = Infinity;
    for (const ds of project.downspouts) {
      const d = distancePointToSegment2D(ds, ge.p1, ge.p2);
      if (d < bestDist) {
        bestDist = d;
        nearestDs = ds;
      }
    }
    if (nearestDs && bestDist < 2.5) {
      downspoutAreaMap.set(
        nearestDs.id,
        (downspoutAreaMap.get(nearestDs.id) || 0) + servedArea
      );
    } else if (servedArea > 0.1) {
      alerts.push({
        id: `alert-gutter-nods-${ge.id}`,
        severity: 'warning',
        location: { x: (ge.p1.x + ge.p2.x) / 2, y: (ge.p1.y + ge.p2.y) / 2 },
        title: `Canalón sin bajante conectada en extremo`,
        detail: `El canalón recoge ${servedArea.toFixed(1)} m² sin una bajante próxima (< 2.5 m).`,
        remediation: 'Coloque una bajante en uno de los extremos del canalón.',
      });
    }
  }

  // Evaluate drains & connect to downspouts
  const drainEvaluations: DrainEvaluation[] = [];
  for (const d of sumideros) {
    const rec = drainAreaMap.get(d.id) || { area: 0, faces: [] };
    const corrected = rec.area * intensityFactor;
    let dsId = d.connectedDownspoutId;
    if (!dsId && project.downspouts.length > 0) {
      let best = project.downspouts[0];
      let bestD = Infinity;
      for (const ds of project.downspouts) {
        const dist = dist2(d, ds);
        if (dist < bestD) {
          bestD = dist;
          best = ds;
        }
      }
      if (bestD < 10) dsId = best.id;
    }
    if (dsId && downspoutAreaMap.has(dsId)) {
      downspoutAreaMap.set(dsId, (downspoutAreaMap.get(dsId) || 0) + rec.area);
    }
    drainEvaluations.push({
      drainId: d.id,
      label: d.label,
      kind: d.kind,
      tributaryProjectedAreaM2: rec.area,
      correctedAreaM2: corrected,
      assignedFaceIds: rec.faces,
      connectedDownspoutId: dsId,
      isActive: rec.area > 0,
    });
  }

  // Evaluate downspouts (Tabla 4.8)
  const downspoutEvaluations: DownspoutEvaluation[] = project.downspouts.map((ds) => {
    const area = downspoutAreaMap.get(ds.id) || 0;
    const corrected = area * intensityFactor;
    const maxAllowed = lookupTabla48MaxArea(ds.diameterMm);
    const recMin = requiredDownspoutDiameterTabla48(corrected);
    return {
      downspoutId: ds.id,
      label: ds.label,
      diameterMm: ds.diameterMm,
      tributaryProjectedAreaM2: area,
      correctedAreaM2: corrected,
      maxAllowedAreaM2: maxAllowed,
      compliesTabla48: corrected <= maxAllowed + 1e-3,
      recommendedMinMm: recMin,
    };
  });

  // Tabla 4.6 applicability: flat roofs / sumidero-drained roofs (or any sumidero network)
  const usesSumideros =
    project.isFlatRoofMode ||
    project.bodies.some((b) => b.mode === 'flat_inward_drain') ||
    sumideros.length > 0;
  const t46 = usesSumideros
    ? calculateTabla46MinSumideros(totalHorizontalAreaM2)
    : { minCount: null, isAmbiguous500: false };

  return {
    totalHorizontalAreaM2,
    effectiveIntensityMmH,
    intensityFactor,
    correctedTotalAreaM2,
    minimumSumiderosTabla46: t46.minCount,
    actualSumideros: sumideros.length,
    isTabla46BoundaryAmbiguous: t46.isAmbiguous500,
    drainEvaluations,
    gutterEvaluations,
    downspoutEvaluations,
    streamlines,
    alerts,
  };
}
