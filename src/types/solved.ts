import type { Point2D, Point3D } from './roof';

/** Exact 3D plane equation: z = a*x + b*y + c */
export interface PlaneEquation {
  a: number;
  b: number;
  c: number;
}

export interface SolvedFace {
  id: string;
  label: string;
  bodyId: string;
  sourceEdgeId?: string;
  polygon2D: Point2D[];
  vertices3D: Point3D[];
  plane: PlaneEquation;
  slopeRatio: number; // e.g. 0.30
  slopePct: number; // e.g. 30.0
  angleDeg: number; // arctan(slopeRatio) * 180 / PI -> e.g. 16.70
  azimuthDeg: number; // compass direction of descent: 0=N, 90=E, 180=S, 270=W
  orientationLabel: string; // 'Norte' | 'Noreste' | 'Este' | ... | 'Horizontal'
  runoffDir2D: Point2D; // unit 2D vector pointing DOWNHILL (-a, -b) normalized
  centroid2D: Point2D;
  centroid3D: Point3D;
  minZ: number;
  maxZ: number;
  projectedAreaM2: number;
  inclinedAreaM2: number;
  planarityMaxResidual: number; // max |z - (ax + by + c)| across vertices3D
}

export type SolvedEdgeType =
  | 'cumbrera'
  | 'limatesa'
  | 'limahoya'
  | 'alero'
  | 'borde_lateral'
  | 'encuentro_paramento'
  | 'junta_cuerpo'
  | 'pretil';

export interface SolvedEdge {
  id: string;
  type: SolvedEdgeType;
  bodyId: string;
  p1: Point3D;
  p2: Point3D;
  length2D: number;
  length3D: number;
  slopePct: number;
  faceIds: string[];
  sourceEdgeId?: string;
  hasGutter?: boolean;
  gutterDiameterMm?: number;
  gutterSlopePct?: number;
}

export interface SolvedWallPatch {
  id: string;
  bodyId: string;
  kind: 'gable' | 'parapet' | 'abutment' | 'step';
  vertices3D: Point3D[]; // 3 or 4 vertices forming vertical wall face
  length2D: number;
  maxHeight: number;
}

export interface WavefrontSnapshot {
  stepIndex: number;
  z: number;
  description: string;
  loops: Point2D[][];
  completedEdges: Array<{ p1: Point2D; p2: Point2D; type: SolvedEdgeType }>;
}

export interface SolverIssue {
  id: string;
  severity: 'error' | 'warning';
  bodyId?: string;
  location?: Point2D;
  message: string;
  technicalReason: string;
}

export interface WaterStreamline {
  id: string;
  faceId?: string;
  points3D: Point3D[];
  points2D: Point2D[];
  terminatesAt: 'drain' | 'gutter' | 'eave' | 'trap' | 'parapet';
  targetId?: string;
}

export interface DrainEvaluation {
  drainId: string;
  label: string;
  kind: string;
  tributaryProjectedAreaM2: number;
  correctedAreaM2: number; // A_horiz * (i / 100)
  assignedFaceIds: string[];
  connectedDownspoutId?: string;
  isActive: boolean;
}

export interface GutterEvaluation {
  edgeId: string;
  bodyId: string;
  lengthM: number;
  diameterMm: number;
  slopePct: number;
  section: 'semicircular' | 'rectangular';
  tributaryProjectedAreaM2: number;
  correctedAreaM2: number;
  maxAllowedAreaM2: number;
  compliesTabla47: boolean;
  compliesMinSlope1Pct: boolean;
  requiredDiameterMm: number;
}

export interface DownspoutEvaluation {
  downspoutId: string;
  label: string;
  diameterMm: number;
  tributaryProjectedAreaM2: number;
  correctedAreaM2: number;
  maxAllowedAreaM2: number; // DB-HS 5 Tabla 4.8
  compliesTabla48: boolean;
  recommendedMinMm: number;
}

export interface HydrologyReport {
  totalHorizontalAreaM2: number;
  effectiveIntensityMmH: number;
  intensityFactor: number; // f = i / 100
  correctedTotalAreaM2: number;
  minimumSumiderosTabla46: number | null; // null if boundary ambiguous or N/A
  actualSumideros: number;
  isTabla46BoundaryAmbiguous: boolean; // true when horizontalArea === 500 m² literally
  drainEvaluations: DrainEvaluation[];
  gutterEvaluations: GutterEvaluation[];
  downspoutEvaluations: DownspoutEvaluation[];
  streamlines: WaterStreamline[];
  alerts: Array<{
    id: string;
    severity: 'error' | 'warning';
    location: Point2D;
    title: string;
    detail: string;
    remediation: string;
  }>;
}

export type NormativeStatus =
  | 'CUMPLE'
  | 'NO CUMPLE'
  | 'PENDIENTE DE DATOS'
  | 'NO APLICABLE'
  | 'REVISIÓN TÉCNICA';

export interface NormativeCheckItem {
  id: string;
  code: string; // e.g. 'CTE DB-HS 1 · Tabla 2.10'
  category: 'pendientes' | 'evacuacion' | 'singulares' | 'energia' | 'acciones' | 'seguridad';
  title: string;
  character: 'reglamentario' | 'orientativo';
  status: NormativeStatus;
  requiredValue: string;
  measuredValue: string;
  targetLocation?: Point2D;
  targetEntityId?: string;
  targetEntityKind?: 'face' | 'edge' | 'drain' | 'downspout' | 'singular' | 'layer' | 'project';
  studentExplanation: string;
  remediation: string;
}

export interface NormativeReport {
  overallStatus: NormativeStatus;
  counts: Record<NormativeStatus, number>;
  checks: NormativeCheckItem[];
  thermalUValue: number; // W/m²K
  thermalULimit: number; // W/m²K
  condensationCheck: {
    status: NormativeStatus;
    fRsi?: number;
    fRsiMin?: number;
    note: string;
  };
  structuralActions: {
    deadLoadLayersKnM2: number;
    liveLoadKnM2: number;
    snowLoadKnM2: number;
    windRefKnM2: number;
    totalCharacteristicKnM2: number;
    note: string;
  };
}

export interface MeasurementsSummary {
  totalProjectedAreaM2: number;
  totalInclinedAreaM2: number;
  ridgeLengthM: number; // cumbreras
  hipLengthM: number; // limatesas
  valleyLengthM: number; // limahoyas
  eaveLengthM: number; // aleros
  gutterLengthM: number; // canalones
  abutmentLengthM: number; // encuentros con paramento
  sumideroCount: number;
  rebosaderoCount: number;
  downspoutCount: number;
  slopeFormationVolumeM3: number; // exact integral over faces above eave/slab datum
  insulationAreaM2: number;
  waterproofingAreaM2: number;
  finishAreaM2: number;
  estimatedTileCount: number | null; // null for continuous/sheet/flat non-tile roofs
  estimatedRidgeTileCount: number | null;
  totalRoofWeightKgM2: number;
  perFace: Array<{
    faceId: string;
    label: string;
    slopePct: number;
    angleDeg: number;
    projectedAreaM2: number;
    inclinedAreaM2: number;
    minZ: number;
    maxZ: number;
  }>;
}

export interface SolvedRoofModel {
  isValid: boolean;
  solverIssues: SolverIssue[];
  faces: SolvedFace[];
  edges: SolvedEdge[];
  wallPatches: SolvedWallPatch[];
  wavefrontSnapshots: WavefrontSnapshot[];
  bounds2D: { minX: number; minY: number; maxX: number; maxY: number };
  bounds3D: { minZ: number; maxZ: number };
  hydrology: HydrologyReport;
  normative: NormativeReport;
  measurements: MeasurementsSummary;
}
