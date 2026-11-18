import type { RoofProject } from '../../types/roof';
import type {
  MeasurementsSummary,
  SolvedEdge,
  SolvedFace,
} from '../../types/solved';

export function computeMeasurements(
  project: RoofProject,
  faces: SolvedFace[],
  edges: SolvedEdge[]
): MeasurementsSummary {
  const totalProjectedAreaM2 = faces.reduce((acc, f) => acc + f.projectedAreaM2, 0);
  const totalInclinedAreaM2 = faces.reduce((acc, f) => acc + f.inclinedAreaM2, 0);

  let ridgeLengthM = 0;
  let hipLengthM = 0;
  let valleyLengthM = 0;
  let eaveLengthM = 0;
  let gutterLengthM = 0;
  let abutmentLengthM = 0;

  for (const e of edges) {
    if (e.type === 'cumbrera') ridgeLengthM += e.length3D;
    else if (e.type === 'limatesa') hipLengthM += e.length3D;
    else if (e.type === 'limahoya') valleyLengthM += e.length3D;
    else if (e.type === 'alero') {
      eaveLengthM += e.length2D;
      if (e.hasGutter) gutterLengthM += e.length2D;
    } else if (e.type === 'encuentro_paramento' || e.type === 'pretil') {
      abutmentLengthM += e.length2D;
    }
  }

  const sumideroCount = project.drains.filter(
    (d) => d.kind === 'sumidero' || d.kind === 'cazoleta' || d.kind === 'canaleta'
  ).length;
  const rebosaderoCount = project.drains.filter((d) => d.kind === 'rebosadero').length;
  const downspoutCount = project.downspouts.length;

  // Exact geometric wedge volume of slope formation per body (fan-triangulated over each face)
  const slopeLayer = project.layers.find((l) => l.visible && l.role === 'slope_formation');
  const minSlopeThickM = slopeLayer ? slopeLayer.thicknessCm / 100 : 0.03;
  let slopeFormationVolumeM3 = 0;

  if (slopeLayer) {
    // Group faces by body to find each body's lowest datum z
    const bodyMinZ = new Map<string, number>();
    for (const f of faces) {
      const prev = bodyMinZ.get(f.bodyId);
      bodyMinZ.set(f.bodyId, prev === undefined ? f.minZ : Math.min(prev, f.minZ));
    }
    for (const f of faces) {
      const zDatum = bodyMinZ.get(f.bodyId) ?? f.minZ;
      const pts = f.vertices3D;
      if (pts.length >= 3) {
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[0];
          const b = pts[i];
          const c = pts[i + 1];
          const triArea2D = Math.abs(
            0.5 * ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y))
          );
          const avgHeightAboveDatum = Math.max(
            0,
            (a.z + b.z + c.z) / 3 - zDatum
          );
          slopeFormationVolumeM3 += triArea2D * (minSlopeThickM + avgHeightAboveDatum);
        }
      }
    }
  }

  const hasInsulation = project.layers.some(
    (l) => l.visible && l.role === 'insulation' && l.thicknessCm > 0
  );
  const hasWaterproofing =
    project.hasWaterproofing ||
    project.layers.some((l) => l.visible && l.role === 'waterproofing');

  const isPieceCladding = [
    'teja_curva',
    'teja_mixta',
    'teja_plana',
    'teja_encaje',
    'pizarra',
  ].includes(project.systemId);

  let estimatedTileCount: number | null = null;
  let estimatedRidgeTileCount: number | null = null;

  if (isPieceCladding && totalInclinedAreaM2 > 0) {
    const usefulLenM = Math.max(
      0.08,
      (project.tileSpec.lengthCm - project.tileSpec.overlapLengthCm) / 100
    );
    const usefulWidM = Math.max(
      0.06,
      (project.tileSpec.widthCm - project.tileSpec.overlapWidthCm) / 100
    );
    const tilesPerM2 = 1 / (usefulLenM * usefulWidM);
    estimatedTileCount = Math.ceil(totalInclinedAreaM2 * tilesPerM2);

    const usefulRidgeLenM = Math.max(
      0.1,
      (project.tileSpec.lengthCm - project.tileSpec.ridgeOverlapCm) / 100
    );
    estimatedRidgeTileCount = Math.ceil((ridgeLengthM + hipLengthM) / usefulRidgeLenM);
  }

  const totalRoofWeightKgM2 = project.layers
    .filter((l) => l.visible)
    .reduce((acc, l) => acc + (l.thicknessCm / 100) * l.densityKgM3, 0);

  return {
    totalProjectedAreaM2,
    totalInclinedAreaM2,
    ridgeLengthM,
    hipLengthM,
    valleyLengthM,
    eaveLengthM,
    gutterLengthM,
    abutmentLengthM,
    sumideroCount,
    rebosaderoCount,
    downspoutCount,
    slopeFormationVolumeM3,
    insulationAreaM2: hasInsulation ? totalInclinedAreaM2 : 0,
    waterproofingAreaM2: hasWaterproofing ? totalInclinedAreaM2 : 0,
    finishAreaM2: totalInclinedAreaM2,
    estimatedTileCount,
    estimatedRidgeTileCount,
    totalRoofWeightKgM2,
    perFace: faces.map((f) => ({
      faceId: f.id,
      label: f.label,
      slopePct: f.slopePct,
      angleDeg: f.angleDeg,
      projectedAreaM2: f.projectedAreaM2,
      inclinedAreaM2: f.inclinedAreaM2,
      minZ: f.minZ,
      maxZ: f.maxZ,
    })),
  };
}
