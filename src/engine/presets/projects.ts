import type { EdgeConfig, PolygonVertex, RoofBody, RoofProject } from '../../types/roof';
import { buildLocationFromPreset, MUNICIPALITY_PRESETS } from '../hydrology/pluviometry';
import { ROOF_SYSTEMS } from './materials';

function cloneLayers(id: keyof typeof ROOF_SYSTEMS) {
  return ROOF_SYSTEMS[id].defaultLayers.map((l) => ({ ...l }));
}

function makeEdgeConfigs(
  verts: PolygonVertex[],
  slopePct: number,
  eaveHeight: number,
  overrides: Record<number, Partial<EdgeConfig>> = {}
): Record<string, EdgeConfig> {
  const res: Record<string, EdgeConfig> = {};
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const edgeId = `${a.id}->${b.id}`;
    const ov = overrides[i] || {};
    res[edgeId] = {
      edgeId,
      type: ov.type ?? 'eave',
      slopePct: ov.slopePct ?? slopePct,
      eaveHeight: ov.eaveHeight ?? eaveHeight,
      overhang: ov.overhang ?? 0.35,
      parapetHeight: ov.parapetHeight ?? 0,
      flashingHeight: ov.flashingHeight ?? 0.25,
      hasGutter: ov.hasGutter ?? true,
      gutterDiameterMm: ov.gutterDiameterMm ?? 125,
      gutterSlopePct: ov.gutterSlopePct ?? 1.0,
      gutterSection: ov.gutterSection ?? 'semicircular',
      customFaceLabel: ov.customFaceLabel,
    };
  }
  return res;
}

function rectLoop(prefix: string, x0: number, y0: number, x1: number, y1: number): PolygonVertex[] {
  return [
    { id: `${prefix}-v1`, x: x0, y: y0 },
    { id: `${prefix}-v2`, x: x1, y: y0 },
    { id: `${prefix}-v3`, x: x1, y: y1 },
    { id: `${prefix}-v4`, x: x0, y: y1 },
  ];
}

const SEVILLA = buildLocationFromPreset(MUNICIPALITY_PRESETS[0]);
const MADRID = buildLocationFromPreset(MUNICIPALITY_PRESETS[1]);

export function createDefaultViviendaProject(): RoofProject {
  // Exact 12.50 m x 9.20 m L-shaped residence inspired by diseño software.png
  // Main L-footprint:
  // Top wing spans X: 0..12.50, Y: 5.00..9.20; South wing spans X: 3.10..12.50, Y: 0..5.00
  const verts: PolygonVertex[] = [
    { id: 'v1', x: 3.1, y: 0.0 },
    { id: 'v2', x: 12.5, y: 0.0 },
    { id: 'v3', x: 12.5, y: 9.2 },
    { id: 'v4', x: 0.0, y: 9.2 },
    { id: 'v5', x: 0.0, y: 5.0 },
    { id: 'v6', x: 3.1, y: 5.0 },
  ];

  const edgeConfigs = makeEdgeConfigs(verts, 30, 3.8, {
    0: { customFaceLabel: 'F1' },
    1: { customFaceLabel: 'F2' },
    2: { customFaceLabel: 'F3' },
    3: { customFaceLabel: 'F4' },
    4: { customFaceLabel: 'F5' },
    5: { customFaceLabel: 'F6' },
  });

  const body: RoofBody = {
    id: 'body-1',
    name: 'Cuerpo Principal Vivienda',
    mode: 'pitched_skeleton',
    outerLoop: verts,
    holes: [],
    edgeConfigs,
    defaultSlopePct: 30,
    defaultEaveHeight: 3.8,
    baseWallElevation: 0,
    parapetHeight: 0,
  };

  return {
    id: 'proj-vivienda',
    name: 'Vivienda Unifamiliar',
    author: 'Estudiante ETSA',
    createdAt: '2026-11-18',
    updatedAt: '2026-11-18',
    description:
      'Cubierta inclinada en L de 12,50 × 9,20 m con teja cerámica mixta al 30% (16,70°), cumbreras, limatesas, limahoya interior y red completa de evacuación.',
    scaleDenominator: 100,
    units: 'm',
    northAngleDeg: 0,
    isFlatRoofMode: false,
    flatRoofUsage: 'no_transitable_autoprotegida',
    systemId: 'teja_mixta',
    hasWaterproofing: false,
    tileSpec: { ...ROOF_SYSTEMS.teja_mixta.defaultTileSpec },
    layers: cloneLayers('teja_mixta'),
    bodies: [body],
    drains: [
      {
        id: 'dr-1',
        kind: 'sumidero',
        x: 3.1,
        y: 5.0,
        bodyId: 'body-1',
        diameterMm: 110,
        connectedDownspoutId: 'ds-1',
        label: 'S1 (Cazoleta encuentro)',
      },
      {
        id: 'dr-2',
        kind: 'cazoleta',
        x: 12.5,
        y: 0.0,
        bodyId: 'body-1',
        diameterMm: 110,
        connectedDownspoutId: 'ds-2',
        label: 'S2 (Cazoleta canalón)',
      },
    ],
    downspouts: [
      { id: 'ds-1', x: 3.1, y: 0.0, diameterMm: 90, kind: 'exterior', label: 'B1 Ø90' },
      { id: 'ds-2', x: 12.5, y: 0.0, diameterMm: 90, kind: 'exterior', label: 'B2 Ø90' },
      { id: 'ds-3', x: 12.5, y: 9.2, diameterMm: 90, kind: 'exterior', label: 'B3 Ø90' },
      { id: 'ds-4', x: 0.0, y: 5.0, diameterMm: 90, kind: 'exterior', label: 'B4 Ø90' },
    ],
    singularElements: [
      {
        id: 'sg-1',
        kind: 'chimenea',
        x: 8.6,
        y: 6.8,
        width: 0.65,
        depth: 0.65,
        heightAboveRoof: 1.05,
        flashingHeight: 0.28,
        rotationDeg: 0,
        label: 'Chimenea CH-1',
      },
      {
        id: 'sg-2',
        kind: 'lucernario',
        x: 10.5,
        y: 5.2,
        width: 1.1,
        depth: 1.25,
        heightAboveRoof: 0.32,
        flashingHeight: 0.26,
        rotationDeg: 0,
        label: 'Lucernario L-1',
      },
    ],
    location: { ...SEVILLA },
    sectionLine: { p1: { x: -0.8, y: 6.8 }, p2: { x: 13.4, y: 6.8 } },
  };
}

export function createReferenciaAProject(): RoofProject {
  // Exact reconstruction of Referencia A (1466082464.jpg) multi-body CAD plan ("CUBIERTA" 30%)
  // Scaled proportionally (0.03 m/px) with editable user-confirmable dimensions banner!
  const b1Verts = rectLoop('ra-b1', 0.6, 6.57, 6.42, 10.23); // Top-left wing (5.82 x 3.66 m)
  const b2Verts = rectLoop('ra-b2', 3.12, 0.63, 6.42, 6.57); // Bottom-left wing (3.30 x 5.94 m)
  const b3Verts = rectLoop('ra-b3', 6.42, 0.63, 11.19, 10.23); // Central main wing (4.77 x 9.60 m)
  const b4Verts = rectLoop('ra-b4', 11.19, 7.41, 12.6, 10.23); // Top-right wing (1.41 x 2.82 m)
  const b5Verts = rectLoop('ra-b5', 11.19, 6.33, 13.05, 7.41); // Mid-right dormer wing (1.86 x 1.08 m)
  const b6Verts = rectLoop('ra-b6', 11.19, 0.63, 13.05, 6.33); // Bottom-right flat terrace zone (1.86 x 5.70 m)

  return {
    id: 'proj-ref-a',
    name: 'Referencia A · Multicuerpo 30%',
    author: 'Práctica CAD Referencia A',
    createdAt: '2026-11-18',
    updatedAt: '2026-11-18',
    description:
      'Reconstrucción paramétrica del plano CAD de referencia ("CUBIERTA"): 5 cuerpos inclinados al 30% + terraza lateral. Confirme o ajuste las dimensiones reales en el inspector.',
    scaleDenominator: 100,
    units: 'm',
    northAngleDeg: 0,
    isFlatRoofMode: false,
    flatRoofUsage: 'no_transitable_autoprotegida',
    systemId: 'teja_mixta',
    hasWaterproofing: false,
    tileSpec: { ...ROOF_SYSTEMS.teja_mixta.defaultTileSpec },
    layers: cloneLayers('teja_mixta'),
    needsScaleConfirmation: true,
    scalePromptNote:
      'El plano de referencia original (Referencia A) no incluye cotas numéricas. Se ha generado a escala proporcional (ancho total 13,05 m). Introduzca o confirme la medida real de referencia si desea reescalar toda la planta.',
    bodies: [
      {
        id: 'ra-body-1',
        name: 'Cuerpo 1 (Noroeste)',
        mode: 'pitched_skeleton',
        outerLoop: b1Verts,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b1Verts, 30, 3.6, { 1: { hasGutter: false }, 0: { hasGutter: false } }),
        defaultSlopePct: 30,
        defaultEaveHeight: 3.6,
        baseWallElevation: 0,
        parapetHeight: 0,
      },
      {
        id: 'ra-body-2',
        name: 'Cuerpo 2 (Suroeste)',
        mode: 'pitched_skeleton',
        outerLoop: b2Verts,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b2Verts, 30, 3.6, { 1: { hasGutter: false }, 2: { hasGutter: false } }),
        defaultSlopePct: 30,
        defaultEaveHeight: 3.6,
        baseWallElevation: 0,
        parapetHeight: 0,
      },
      {
        id: 'ra-body-3',
        name: 'Cuerpo 3 (Nave Central)',
        mode: 'pitched_skeleton',
        outerLoop: b3Verts,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b3Verts, 30, 3.6, { 1: { hasGutter: false }, 3: { hasGutter: false } }),
        defaultSlopePct: 30,
        defaultEaveHeight: 3.6,
        baseWallElevation: 0,
        parapetHeight: 0,
      },
      {
        id: 'ra-body-4',
        name: 'Cuerpo 4 (Noreste)',
        mode: 'pitched_skeleton',
        outerLoop: b4Verts,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b4Verts, 30, 3.6, { 0: { hasGutter: false }, 3: { hasGutter: false } }),
        defaultSlopePct: 30,
        defaultEaveHeight: 3.6,
        baseWallElevation: 0,
        parapetHeight: 0,
      },
      {
        id: 'ra-body-5',
        name: 'Cuerpo 5 (Lucernario Este)',
        mode: 'pitched_skeleton',
        outerLoop: b5Verts,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b5Verts, 30, 3.6, { 2: { hasGutter: false }, 3: { hasGutter: false } }),
        defaultSlopePct: 30,
        defaultEaveHeight: 3.6,
        baseWallElevation: 0,
        parapetHeight: 0,
      },
      {
        id: 'ra-body-6',
        name: 'Cuerpo 6 (Terraza Plana Lateral)',
        mode: 'flat_inward_drain',
        outerLoop: b6Verts,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b6Verts, 1.5, 3.55, {
          0: { type: 'parapet', parapetHeight: 0.95, hasGutter: false },
          1: { type: 'parapet', parapetHeight: 0.95, hasGutter: false },
          2: { type: 'parapet', parapetHeight: 0.95, hasGutter: false },
          3: { type: 'parapet', parapetHeight: 0.95, hasGutter: false },
        }),
        defaultSlopePct: 1.5,
        defaultEaveHeight: 3.55,
        baseWallElevation: 0,
        parapetHeight: 0.95,
        flatDrainTarget: { x: 12.12, y: 3.48, elevation: 3.51 },
      },
    ],
    drains: [
      { id: 'ra-dr-1', kind: 'cazoleta', x: 6.42, y: 6.57, diameterMm: 110, connectedDownspoutId: 'ra-ds-2', label: 'C1 Limahoya' },
      { id: 'ra-dr-2', kind: 'sumidero', x: 12.12, y: 3.48, bodyId: 'ra-body-6', diameterMm: 100, connectedDownspoutId: 'ra-ds-3', label: 'S1 Terraza' },
    ],
    downspouts: [
      { id: 'ra-ds-1', x: 0.6, y: 6.57, diameterMm: 90, kind: 'exterior', label: 'B1 Ø90' },
      { id: 'ra-ds-2', x: 6.42, y: 0.63, diameterMm: 110, kind: 'exterior', label: 'B2 Ø110' },
      { id: 'ra-ds-3', x: 13.05, y: 0.63, diameterMm: 90, kind: 'exterior', label: 'B3 Ø90' },
      { id: 'ra-ds-4', x: 11.19, y: 10.23, diameterMm: 90, kind: 'exterior', label: 'B4 Ø90' },
    ],
    singularElements: [],
    location: { ...MADRID },
    sectionLine: { p1: { x: 0, y: 8.4 }, p2: { x: 13.6, y: 8.4 } },
  };
}

export function createReferenciaBProject(): RoofProject {
  // Exact reconstruction of PDF "Replanteo-de-cubiertas.pdf" (Laura Delgado · ETSA Sevilla)
  // Total bounding box: 16.70 m x 11.40 m (left: 4.05 + 4.95 + 2.40 = 11.40; top: 3.70 + 4.75 + 8.25 = 16.70; right wing: 8.25 x 5.75)
  const b1 = rectLoop('rb-b1', 0, 7.35, 3.7, 11.4); // 3.70 x 4.05, +4.74 m
  const b2 = rectLoop('rb-b2', 3.7, 7.35, 8.45, 11.4); // 4.75 x 4.05, +7.24 m
  const b3 = rectLoop('rb-b3', 8.45, 5.65, 16.7, 11.4); // 8.25 x 5.75, +4.74 m
  const b4 = rectLoop('rb-b4', 0, 2.4, 8.45, 7.35); // 8.45 x 4.95, +7.24 m
  const b5 = rectLoop('rb-b5', 0, 0, 3.7, 2.4); // 3.70 x 2.40, +4.74 m

  // Handwritten layer thicknesses from PDF page 3 (with EPS e=2.5 cm!)
  // So DB-HE 1 will realistically evaluate U and teach the student why 2.5 cm doesn't comply today!
  const layers = cloneLayers('invertida_transitable');
  const insLayer = layers.find((l) => l.role === 'insulation');
  if (insLayer) {
    insLayer.thicknessCm = 2.5;
    insLayer.name = '3. Aislamiento poliestireno expandido (apuntes e=2,5 cm)';
    insLayer.material = 'Poliestireno expandido (EPS)';
    insLayer.lambdaWMK = 0.038;
  }

  return {
    id: 'proj-ref-b',
    name: 'Referencia B · Cubierta Invertida ETSA',
    author: 'Laura Delgado / ETSA Sevilla',
    createdAt: '2026-11-18',
    updatedAt: '2026-11-18',
    description:
      'Práctica ETSA Sevilla (E 1:50): Cubierta invertida transitable en 5 cuerpos a dos cotas (+4,74 m y +7,24 m), sumideros, rebosaderos, shunts y detalle constructivo de 8 capas.',
    scaleDenominator: 50,
    units: 'm',
    northAngleDeg: 0,
    isFlatRoofMode: true,
    flatRoofUsage: 'transitable_fijo',
    systemId: 'invertida_transitable',
    hasWaterproofing: true,
    tileSpec: { ...ROOF_SYSTEMS.invertida_transitable.defaultTileSpec },
    layers,
    bodies: [
      {
        id: 'rb-body-1',
        name: 'Paño 1 (Noroeste +4,74m)',
        mode: 'flat_inward_drain',
        outerLoop: b1,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b1, 1.22, 4.74, {
          0: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          1: { type: 'wall_abutment', parapetHeight: 1.0, hasGutter: false },
          2: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          3: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
        }),
        defaultSlopePct: 1.22,
        defaultEaveHeight: 4.74,
        baseWallElevation: 0,
        parapetHeight: 1.0,
        flatDrainTarget: { x: 1.85, y: 9.35, elevation: 4.68, drainId: 'rb-s1' },
      },
      {
        id: 'rb-body-2',
        name: 'Paño 2 (Norte Central +7,24m)',
        mode: 'flat_inward_drain',
        outerLoop: b2,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b2, 1.05, 7.24, {
          0: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          1: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          2: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          3: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
        }),
        defaultSlopePct: 1.05,
        defaultEaveHeight: 7.24,
        baseWallElevation: 0,
        parapetHeight: 1.0,
        flatDrainTarget: { x: 6.08, y: 9.35, elevation: 7.18, drainId: 'rb-s2' },
      },
      {
        id: 'rb-body-3',
        name: 'Paño 3 (Ala Este +4,74m)',
        mode: 'flat_inward_drain',
        outerLoop: b3,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b3, 1.33, 4.74, {
          0: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          1: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          2: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          3: { type: 'wall_abutment', parapetHeight: 1.0, hasGutter: false },
        }),
        defaultSlopePct: 1.33,
        defaultEaveHeight: 4.74,
        baseWallElevation: 0,
        parapetHeight: 1.0,
        flatDrainTarget: { x: 12.55, y: 8.5, elevation: 4.68, drainId: 'rb-s3' },
      },
      {
        id: 'rb-body-4',
        name: 'Paño 4 (Central Alto +7,24m)',
        mode: 'flat_inward_drain',
        outerLoop: b4,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b4, 1.42, 7.24, {
          0: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          1: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          2: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          3: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
        }),
        defaultSlopePct: 1.42,
        defaultEaveHeight: 7.24,
        baseWallElevation: 0,
        parapetHeight: 1.0,
        flatDrainTarget: { x: 4.2, y: 4.85, elevation: 7.18, drainId: 'rb-s4' },
      },
      {
        id: 'rb-body-5',
        name: 'Paño 5 (Terraza Sur +4,74m)',
        mode: 'flat_inward_drain',
        outerLoop: b5,
        holes: [],
        edgeConfigs: makeEdgeConfigs(b5, 1.5, 4.74, {
          0: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          1: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
          2: { type: 'wall_abutment', parapetHeight: 1.0, hasGutter: false },
          3: { type: 'parapet', parapetHeight: 1.0, hasGutter: false },
        }),
        defaultSlopePct: 1.5,
        defaultEaveHeight: 4.74,
        baseWallElevation: 0,
        parapetHeight: 1.0,
        flatDrainTarget: { x: 1.85, y: 1.2, elevation: 4.68, drainId: 'rb-s5' },
      },
    ],
    drains: [
      { id: 'rb-s1', kind: 'sumidero', x: 1.85, y: 9.35, z: 4.68, bodyId: 'rb-body-1', diameterMm: 110, connectedDownspoutId: 'rb-b1', label: 'S1 (+4,68m)' },
      { id: 'rb-s2', kind: 'sumidero', x: 6.08, y: 9.35, z: 7.18, bodyId: 'rb-body-2', diameterMm: 110, connectedDownspoutId: 'rb-b2', label: 'S2 (+7,18m)' },
      { id: 'rb-s3', kind: 'sumidero', x: 12.55, y: 8.5, z: 4.68, bodyId: 'rb-body-3', diameterMm: 110, connectedDownspoutId: 'rb-b3', label: 'S3 (+4,68m)' },
      { id: 'rb-s4', kind: 'sumidero', x: 4.2, y: 4.85, z: 7.18, bodyId: 'rb-body-4', diameterMm: 110, connectedDownspoutId: 'rb-b4', label: 'S4 (+7,18m)' },
      { id: 'rb-s5', kind: 'sumidero', x: 1.85, y: 1.2, z: 4.68, bodyId: 'rb-body-5', diameterMm: 110, connectedDownspoutId: 'rb-b5', label: 'S5 (+4,68m)' },
      { id: 'rb-reb-1', kind: 'rebosadero', x: 5.2, y: 11.4, z: 4.79, bodyId: 'rb-body-2', diameterMm: 75, label: 'R1' },
      { id: 'rb-reb-2', kind: 'rebosadero', x: 10.6, y: 5.65, z: 4.79, bodyId: 'rb-body-3', diameterMm: 75, label: 'R2' },
      { id: 'rb-reb-3', kind: 'rebosadero', x: 14.8, y: 5.65, z: 4.79, bodyId: 'rb-body-3', diameterMm: 75, label: 'R3' },
      { id: 'rb-reb-4', kind: 'rebosadero', x: 5.8, y: 2.4, z: 7.29, bodyId: 'rb-body-4', diameterMm: 75, label: 'R4' },
    ],
    downspouts: [
      { id: 'rb-b1', x: 0.0, y: 9.35, diameterMm: 90, kind: 'interior', label: 'B1' },
      { id: 'rb-b2', x: 6.08, y: 11.4, diameterMm: 90, kind: 'interior', label: 'B2' },
      { id: 'rb-b3', x: 12.55, y: 11.4, diameterMm: 90, kind: 'interior', label: 'B3' },
      { id: 'rb-b4', x: 0.0, y: 4.85, diameterMm: 90, kind: 'interior', label: 'B4' },
      { id: 'rb-b5', x: 0.0, y: 1.2, diameterMm: 90, kind: 'interior', label: 'B5' },
    ],
    singularElements: [
      { id: 'rb-sh-1', kind: 'shunt', x: 14.3, y: 11.0, width: 0.45, depth: 0.45, heightAboveRoof: 0.9, flashingHeight: 0.25, rotationDeg: 0, label: 'Shunt 1' },
      { id: 'rb-sh-2', kind: 'shunt', x: 0.45, y: 6.95, width: 0.45, depth: 0.45, heightAboveRoof: 0.9, flashingHeight: 0.25, rotationDeg: 0, label: 'Shunt 2' },
      { id: 'rb-sh-3', kind: 'shunt', x: 1.0, y: 6.95, width: 0.45, depth: 0.45, heightAboveRoof: 0.9, flashingHeight: 0.25, rotationDeg: 0, label: 'Shunt 3' },
    ],
    location: { ...SEVILLA },
    sectionLine: { p1: { x: -0.5, y: 9.35 }, p2: { x: 17.2, y: 9.35 } },
  };
}

export function createDosAguasProject(): RoofProject {
  const verts = rectLoop('da', 0, 0, 10, 6);
  const edgeConfigs = makeEdgeConfigs(verts, 35, 3.2, {
    1: { type: 'gable', hasGutter: false },
    3: { type: 'gable', hasGutter: false },
  });
  return {
    id: 'proj-2aguas',
    name: 'Prueba 1 · Dos Aguas Rectangular',
    author: 'Validación Geométrica',
    createdAt: '2026-11-18',
    updatedAt: '2026-11-18',
    description: 'Cubierta simétrica a dos aguas de 10,00 × 6,00 m con hastiales en testeros y aleros longitudinales al 35%.',
    scaleDenominator: 100,
    units: 'm',
    northAngleDeg: 0,
    isFlatRoofMode: false,
    flatRoofUsage: 'no_transitable_autoprotegida',
    systemId: 'teja_curva',
    hasWaterproofing: false,
    tileSpec: { ...ROOF_SYSTEMS.teja_curva.defaultTileSpec },
    layers: cloneLayers('teja_curva'),
    bodies: [
      {
        id: 'body-da',
        name: 'Nave Dos Aguas',
        mode: 'pitched_skeleton',
        outerLoop: verts,
        holes: [],
        edgeConfigs,
        defaultSlopePct: 35,
        defaultEaveHeight: 3.2,
        baseWallElevation: 0,
        parapetHeight: 0,
      },
    ],
    drains: [],
    downspouts: [
      { id: 'da-b1', x: 0, y: 0, diameterMm: 90, kind: 'exterior', label: 'B1' },
      { id: 'da-b2', x: 10, y: 6, diameterMm: 90, kind: 'exterior', label: 'B2' },
    ],
    singularElements: [],
    location: { ...SEVILLA },
    sectionLine: { p1: { x: 5, y: -0.6 }, p2: { x: 5, y: 6.6 } },
  };
}

export function createCuatroAguasProject(): RoofProject {
  const verts = rectLoop('ca', 0, 0, 10, 7);
  return {
    id: 'proj-4aguas',
    name: 'Prueba 2 · Cuatro Aguas Rectangular',
    author: 'Validación Geométrica',
    createdAt: '2026-11-18',
    updatedAt: '2026-11-18',
    description: 'Cubierta a cuatro aguas de 10,00 × 7,00 m con cuatro faldones al 30%, cumbrera central y cuatro limatesas a 45°.',
    scaleDenominator: 100,
    units: 'm',
    northAngleDeg: 0,
    isFlatRoofMode: false,
    flatRoofUsage: 'no_transitable_autoprotegida',
    systemId: 'teja_mixta',
    hasWaterproofing: false,
    tileSpec: { ...ROOF_SYSTEMS.teja_mixta.defaultTileSpec },
    layers: cloneLayers('teja_mixta'),
    bodies: [
      {
        id: 'body-ca',
        name: 'Cubierta Cuatro Aguas',
        mode: 'pitched_skeleton',
        outerLoop: verts,
        holes: [],
        edgeConfigs: makeEdgeConfigs(verts, 30, 3.2),
        defaultSlopePct: 30,
        defaultEaveHeight: 3.2,
        baseWallElevation: 0,
        parapetHeight: 0,
      },
    ],
    drains: [],
    downspouts: [
      { id: 'ca-b1', x: 0, y: 0, diameterMm: 90, kind: 'exterior', label: 'B1' },
      { id: 'ca-b2', x: 10, y: 0, diameterMm: 90, kind: 'exterior', label: 'B2' },
      { id: 'ca-b3', x: 10, y: 7, diameterMm: 90, kind: 'exterior', label: 'B3' },
      { id: 'ca-b4', x: 0, y: 7, diameterMm: 90, kind: 'exterior', label: 'B4' },
    ],
    singularElements: [],
    location: { ...SEVILLA },
    sectionLine: { p1: { x: 5, y: -0.6 }, p2: { x: 5, y: 7.6 } },
  };
}

export function createPatioProject(): RoofProject {
  const outer = rectLoop('pt', 0, 0, 14, 11);
  const holeVerts: PolygonVertex[] = [
    { id: 'pt-h1', x: 4.5, y: 3.5 },
    { id: 'pt-h2', x: 4.5, y: 7.5 },
    { id: 'pt-h3', x: 9.5, y: 7.5 },
    { id: 'pt-h4', x: 9.5, y: 3.5 },
  ];
  const edgeConfigs = makeEdgeConfigs(outer, 32, 3.5);
  // Add hole edge configs too
  for (let i = 0; i < holeVerts.length; i++) {
    const a = holeVerts[i];
    const b = holeVerts[(i + 1) % holeVerts.length];
    const eid = `${a.id}->${b.id}`;
    edgeConfigs[eid] = {
      edgeId: eid,
      type: 'eave',
      slopePct: 32,
      eaveHeight: 3.5,
      overhang: 0.25,
      parapetHeight: 0,
      flashingHeight: 0.25,
      hasGutter: true,
      gutterDiameterMm: 125,
      gutterSlopePct: 1.0,
      gutterSection: 'semicircular',
    };
  }
  return {
    id: 'proj-patio',
    name: 'Cubierta con Patio Interior',
    author: 'Validación Topológica',
    createdAt: '2026-11-18',
    updatedAt: '2026-11-18',
    description: 'Planta rectangular de 14,00 × 11,00 m con patio interior de 5,00 × 4,00 m resuelta automáticamente por esqueleto recto.',
    scaleDenominator: 100,
    units: 'm',
    northAngleDeg: 0,
    isFlatRoofMode: false,
    flatRoofUsage: 'no_transitable_autoprotegida',
    systemId: 'teja_curva',
    hasWaterproofing: false,
    tileSpec: { ...ROOF_SYSTEMS.teja_curva.defaultTileSpec },
    layers: cloneLayers('teja_curva'),
    bodies: [
      {
        id: 'body-patio',
        name: 'Claustro Perimetral',
        mode: 'pitched_skeleton',
        outerLoop: outer,
        holes: [{ id: 'hole-1', name: 'Patio Central', vertices: holeVerts }],
        edgeConfigs,
        defaultSlopePct: 32,
        defaultEaveHeight: 3.5,
        baseWallElevation: 0,
        parapetHeight: 0,
      },
    ],
    drains: [],
    downspouts: [
      { id: 'pt-b1', x: 0, y: 0, diameterMm: 90, kind: 'exterior', label: 'B1' },
      { id: 'pt-b2', x: 14, y: 11, diameterMm: 90, kind: 'exterior', label: 'B2' },
      { id: 'pt-b3', x: 4.5, y: 3.5, diameterMm: 90, kind: 'exterior', label: 'B3 Patio' },
    ],
    singularElements: [],
    location: { ...SEVILLA },
    sectionLine: { p1: { x: -0.6, y: 5.5 }, p2: { x: 14.6, y: 5.5 } },
  };
}

export const BUILTIN_PROJECTS: RoofProject[] = [
  createDefaultViviendaProject(),
  createReferenciaAProject(),
  createReferenciaBProject(),
  createDosAguasProject(),
  createCuatroAguasProject(),
  createPatioProject(),
];

export function createBlankProject(name = 'Nuevo Proyecto'): RoofProject {
  const verts = rectLoop('new', 0, 0, 10, 8);
  return {
    id: `proj-${Date.now()}`,
    name,
    author: 'Estudiante',
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
    description: 'Proyecto personalizado editable en planta 2D y modelo 3D.',
    scaleDenominator: 100,
    units: 'm',
    northAngleDeg: 0,
    isFlatRoofMode: false,
    flatRoofUsage: 'no_transitable_autoprotegida',
    systemId: 'teja_mixta',
    hasWaterproofing: false,
    tileSpec: { ...ROOF_SYSTEMS.teja_mixta.defaultTileSpec },
    layers: cloneLayers('teja_mixta'),
    bodies: [
      {
        id: 'body-1',
        name: 'Cuerpo 1',
        mode: 'pitched_skeleton',
        outerLoop: verts,
        holes: [],
        edgeConfigs: makeEdgeConfigs(verts, 30, 3.5),
        defaultSlopePct: 30,
        defaultEaveHeight: 3.5,
        baseWallElevation: 0,
        parapetHeight: 0,
      },
    ],
    drains: [],
    downspouts: [
      { id: 'ds-1', x: 0, y: 0, diameterMm: 90, kind: 'exterior', label: 'B1' },
      { id: 'ds-2', x: 10, y: 8, diameterMm: 90, kind: 'exterior', label: 'B2' },
    ],
    singularElements: [],
    location: { ...SEVILLA },
    sectionLine: { p1: { x: 5, y: -0.6 }, p2: { x: 5, y: 8.6 } },
  };
}
