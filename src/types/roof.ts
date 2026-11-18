export type UnitSystem = 'm' | 'cm' | 'mm';
export type ViewMode = 'planta2d' | 'modelo3d' | 'dividida' | 'seccion' | 'despiece';
export type RenderStyle3D = 'realista' | 'conceptual' | 'alambrico' | 'flujo';
export type CameraPreset3D = 'perspectiva' | 'axonometrica' | 'superior' | 'alzado_sur' | 'alzado_este';

export type ToolCategoryId =
  | 'geometria'
  | 'faldones'
  | 'cumbreras'
  | 'limahoyas'
  | 'aleros'
  | 'sumideros'
  | 'bajantes'
  | 'singulares'
  | 'materiales'
  | 'normativa'
  | 'mediciones';

export type ActiveSubTool =
  | 'select'
  | 'draw_polygon'
  | 'draw_hole'
  | 'add_body'
  | 'edit_vertices'
  | 'measure_dim'
  | 'edit_slope'
  | 'toggle_gable'
  | 'edit_eave'
  | 'draw_cumbrera'
  | 'draw_limatesa'
  | 'draw_limahoya'
  | 'place_sumidero'
  | 'place_rebosadero'
  | 'toggle_gutter'
  | 'place_downspout'
  | 'place_chimney'
  | 'place_shunt'
  | 'place_skylight'
  | 'place_duct'
  | 'section_cut';

export interface ManualReplanteoEdge {
  id: string;
  kind: 'cumbrera' | 'limatesa' | 'limahoya';
  p1: Point2D;
  p2: Point2D;
}

export type RoofSystemId =
  | 'teja_curva'
  | 'teja_mixta'
  | 'teja_plana'
  | 'teja_encaje'
  | 'pizarra'
  | 'chapa_metalica'
  | 'panel_sandwich'
  | 'zinc'
  | 'plana_transitable'
  | 'invertida_transitable'
  | 'ajardinada';

export type FlatRoofUsage =
  | 'transitable_fijo'
  | 'transitable_flotante'
  | 'transitable_vehiculos'
  | 'no_transitable_grava'
  | 'no_transitable_autoprotegida'
  | 'ajardinada';

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface PolygonVertex {
  id: string;
  x: number;
  y: number;
}

export interface PolygonHole {
  id: string;
  name: string;
  vertices: PolygonVertex[];
}

export type EdgeBoundaryType = 'eave' | 'gable' | 'parapet' | 'wall_abutment';

export interface EdgeConfig {
  edgeId: string;
  type: EdgeBoundaryType;
  slopePct: number; // % e.g. 30 for 30%, or 1.33 for 1.33%
  eaveHeight: number; // m above 0 datum
  overhang: number; // m horizontal overhang beyond wall (vuelo alero)
  parapetHeight: number; // m height of parapet above eave/edge
  flashingHeight: number; // m height of vertical waterproofing turnaround (remate paramento)
  hasGutter: boolean;
  gutterDiameterMm: 100 | 125 | 150 | 200 | 250;
  gutterSlopePct: number;
  gutterSection: 'semicircular' | 'rectangular';
  customFaceLabel?: string;
}

export type BodySolveMode = 'pitched_skeleton' | 'flat_inward_drain' | 'mono_pitch' | 'flat_level';

export interface RoofBody {
  id: string;
  name: string;
  mode: BodySolveMode;
  outerLoop: PolygonVertex[];
  holes: PolygonHole[];
  edgeConfigs: Record<string, EdgeConfig>; // keyed by edgeId (e.g. `${v1.id}->${v2.id}` or index-stable edge key)
  defaultSlopePct: number;
  defaultEaveHeight: number;
  baseWallElevation: number; // ground / floor level below this body (e.g. 0.00 m)
  parapetHeight: number; // used for flat roofs / parapets
  flatDrainTarget?: {
    x: number;
    y: number;
    elevation: number;
    drainId?: string;
  };
  monoPitchBaseEdgeIdx?: number;
  monoPitchSlopePct?: number;
  monoPitchBaseZ?: number;
}

export interface DrainElement {
  id: string;
  kind: 'sumidero' | 'cazoleta' | 'rebosadero' | 'canaleta';
  x: number;
  y: number;
  z?: number;
  bodyId?: string;
  diameterMm: number;
  connectedDownspoutId?: string;
  label: string;
}

export interface Downspout {
  id: string;
  x: number;
  y: number;
  diameterMm: 50 | 63 | 75 | 90 | 110 | 125 | 160 | 200;
  kind: 'exterior' | 'interior';
  label: string;
}

export interface SingularElement {
  id: string;
  kind: 'chimenea' | 'shunt' | 'lucernario' | 'conducto' | 'anclaje';
  x: number;
  y: number;
  width: number; // m along local X
  depth: number; // m along local Y
  heightAboveRoof: number; // m
  flashingHeight: number; // m (remate vertical >= 0.25 m per CTE)
  rotationDeg: number;
  label: string;
}

export interface LayerSpec {
  id: string;
  order: number;
  name: string;
  material: string;
  thicknessCm: number;
  densityKgM3: number;
  lambdaWMK: number; // W/(m·K), 0 if negligible air/membrane
  functionDesc: string;
  colorHex: string;
  visible: boolean;
  role:
    | 'finish'
    | 'protection_mortar'
    | 'insulation'
    | 'waterproofing'
    | 'regulation_mortar'
    | 'slope_formation'
    | 'support_slab'
    | 'substrate';
}

export interface TileSpec {
  lengthCm: number;
  widthCm: number;
  overlapLengthCm: number;
  overlapWidthCm: number;
  eaveOverhangCm: number; // vuelo sobre alero (DB-HS 1: >= 5 cm, <= 1/2 pieza)
  ridgeOverlapCm: number; // solape piezas especiales en cumbrera/limatesa (>= 5 cm)
  valleyOverhangCm: number; // vuelo sobre limahoya (>= 5 cm)
  valleyGapCm: number; // separación mínima entre faldones en limahoya (>= 20 cm)
}

export interface ProjectLocation {
  municipality: string;
  province: string;
  pluviometricZone: 'A' | 'B';
  isohyet: number;
  rainIntensityMmH: number;
  manualIntensityOverride?: number;
  manualJustification?: string;
  climateZoneWinter: 'alpha' | 'A' | 'B' | 'C' | 'D' | 'E';
  altitudeM: number;
  snowLoadKnM2: number;
  windZone: 'A' | 'B' | 'C';
  indoorTempC: number;
  indoorRhPct: number;
  outdoorTempC?: number;
  outdoorRhPct?: number;
}

export interface ReferenceUnderlay {
  id: string;
  name: string;
  kind: 'image' | 'svg' | 'dxf';
  dataUrl?: string;
  calibrated: boolean;
  metersPerPixel: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
  naturalWidthPx?: number;
  naturalHeightPx?: number;
  dxfSegments?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

export interface SectionLine {
  p1: Point2D;
  p2: Point2D;
}

export interface RoofProject {
  id: string;
  name: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  description: string;
  scaleDenominator: 50 | 100 | 200 | 500;
  units: UnitSystem;
  northAngleDeg: number; // 0 = +Y is North
  isFlatRoofMode: boolean;
  flatRoofUsage: FlatRoofUsage;
  systemId: RoofSystemId;
  hasWaterproofing: boolean;
  tileSpec: TileSpec;
  layers: LayerSpec[];
  bodies: RoofBody[];
  drains: DrainElement[];
  downspouts: Downspout[];
  singularElements: SingularElement[];
  location: ProjectLocation;
  sectionLine: SectionLine;
  underlay?: ReferenceUnderlay;
  needsScaleConfirmation?: boolean;
  scalePromptNote?: string;
}

export type SelectedEntity =
  | { kind: 'project' }
  | { kind: 'body'; bodyId: string }
  | { kind: 'face'; faceId: string }
  | { kind: 'edge'; edgeId: string }
  | { kind: 'perimeter_edge'; bodyId: string; edgeId: string }
  | { kind: 'vertex'; bodyId: string; vertexId: string; holeId?: string }
  | { kind: 'drain'; drainId: string }
  | { kind: 'downspout'; downspoutId: string }
  | { kind: 'singular'; singularId: string }
  | { kind: 'layer'; layerId: string }
  | null;
