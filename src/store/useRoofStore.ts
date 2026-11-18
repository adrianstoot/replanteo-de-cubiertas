import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  ActiveSubTool,
  CameraPreset3D,
  Downspout,
  DrainElement,
  EdgeConfig,
  FlatRoofUsage,
  LayerSpec,
  ManualReplanteoEdge,
  Point2D,
  ProjectLocation,
  ReferenceUnderlay,
  RenderStyle3D,
  RoofBody,
  RoofProject,
  RoofSystemId,
  SectionLine,
  SelectedEntity,
  SingularElement,
  TileSpec,
  ToolCategoryId,
  UnitSystem,
  ViewMode,
} from '../types/roof';
import type { SolvedRoofModel } from '../types/solved';
import { solveRoofProject } from '../engine/geometry/roofSolver';
import { gradeManualReplanteo, type ManualGradingReport } from '../engine/geometry/manualReplanteo';
import {
  TABLA_210_CUBIERTAS_INCLINADAS,
  TABLA_29_CUBIERTAS_PLANAS,
  TABLA_ULIM_CUBIERTA_HE1,
} from '../engine/normative/cteDatabase';
import { BUILTIN_PROJECTS, createBlankProject } from '../engine/presets/projects';
import { ROOF_SYSTEMS } from '../engine/presets/materials';
import { ensureCCW } from '../engine/math/vec';

const STORAGE_KEY = 'replanteo_cubiertas_saved_v1';

interface RoofContextValue {
  project: RoofProject;
  solved: SolvedRoofModel;
  savedProjects: RoofProject[];
  canUndo: boolean;
  canRedo: boolean;
  viewMode: ViewMode;
  activeCategory: ToolCategoryId;
  activeSubTool: ActiveSubTool;
  selectedEntity: SelectedEntity;
  highlightedPoint: Point2D | null;
  learningMode: 'libre' | 'guiado';
  guidedStage: number;
  wavefrontStep: number | null;
  showWaterFlow: boolean;
  showRealisticFill2D: boolean;
  snapToGrid: boolean;
  gridStepM: number;
  renderStyle3D: RenderStyle3D;
  cameraPreset3D: CameraPreset3D;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  explodeFactor: number;

  // Manual Replanteo practice mode
  replanteoMode: 'auto' | 'manual';
  manualEdges: ManualReplanteoEdge[];
  manualCheckActive: boolean;
  revealedHintCount: number;
  gradingReport: ManualGradingReport | null;

  // View & UI setters
  setViewMode: (m: ViewMode) => void;
  setReplanteoMode: (m: 'auto' | 'manual') => void;
  addManualEdge: (kind: 'cumbrera' | 'limatesa' | 'limahoya', p1: Point2D, p2: Point2D) => void;
  removeManualEdge: (id: string) => void;
  clearManualEdges: () => void;
  runManualCheck: () => void;
  revealNextHint: () => void;
  autoSolveReplanteo: () => void;
  autoFixNormativeRule: (checkId: string) => void;
  setActiveCategory: (c: ToolCategoryId) => void;
  setActiveSubTool: (t: ActiveSubTool) => void;
  setSelectedEntity: (e: SelectedEntity) => void;
  setHighlightedPoint: (p: Point2D | null) => void;
  setLearningMode: (m: 'libre' | 'guiado') => void;
  setGuidedStage: (s: number) => void;
  setWavefrontStep: (s: number | null) => void;
  setShowWaterFlow: (v: boolean) => void;
  setShowRealisticFill2D: (v: boolean) => void;
  setSnapToGrid: (v: boolean) => void;
  setGridStepM: (g: number) => void;
  setRenderStyle3D: (r: RenderStyle3D) => void;
  setCameraPreset3D: (p: CameraPreset3D) => void;
  setSunAzimuthDeg: (a: number) => void;
  setSunElevationDeg: (e: number) => void;
  setExplodeFactor: (f: number) => void;

  // Project lifecycle & history
  undo: () => void;
  redo: () => void;
  loadProject: (proj: RoofProject) => void;
  createNewProject: (proj?: RoofProject) => void;
  saveCurrentProject: () => void;
  updateProjectMeta: (patch: Partial<Pick<RoofProject, 'name' | 'author' | 'scaleDenominator' | 'units' | 'northAngleDeg' | 'description' | 'needsScaleConfirmation'>>) => void;
  rescaleEntireProject: (scaleFactor: number) => void;

  // Geometry mutations
  clearToBlankCanvas: () => void;
  insertVertexOnEdge: (bodyId: string, edgeIndex: number, pt: Point2D, holeId?: string) => void;
  setPerimeterEdgeLength: (bodyId: string, edgeIndex: number, newLengthM: number) => void;
  moveVertex: (bodyId: string, vertexId: string, x: number, y: number, holeId?: string, pushHistory?: boolean) => void;
  addBody: (body: RoofBody) => void;
  replacePrimaryBody: (body: RoofBody) => void;
  addHoleToBody: (bodyId: string, holeVerts: Point2D[], name?: string) => void;
  updateEdgeConfig: (bodyId: string, edgeId: string, patch: Partial<EdgeConfig>) => void;
  updateFaceSlopeByFaceId: (faceId: string, newSlopePct: number) => void;
  updateBodyDrainElevation: (bodyId: string, elevation: number) => void;
  updateSectionLine: (line: SectionLine) => void;
  setUnderlay: (underlay: ReferenceUnderlay | undefined) => void;

  // Materials & layers
  setRoofSystem: (systemId: RoofSystemId) => void;
  setHasWaterproofing: (val: boolean) => void;
  setFlatRoofUsage: (usage: FlatRoofUsage) => void;
  setParapetHeight: (heightM: number) => void;
  updateTileSpec: (patch: Partial<TileSpec>) => void;
  updateLayer: (layerId: string, patch: Partial<LayerSpec>) => void;
  addLayer: (layer: LayerSpec) => void;
  removeLayer: (layerId: string) => void;

  // Evacuation & singular elements
  addDrain: (drain: DrainElement) => void;
  moveDrain: (drainId: string, x: number, y: number) => void;
  updateDrain: (drainId: string, patch: Partial<DrainElement>) => void;
  removeDrain: (drainId: string) => void;

  addDownspout: (ds: Downspout) => void;
  moveDownspout: (dsId: string, x: number, y: number) => void;
  updateDownspout: (dsId: string, patch: Partial<Downspout>) => void;
  removeDownspout: (dsId: string) => void;

  addSingular: (el: SingularElement) => void;
  moveSingular: (id: string, x: number, y: number) => void;
  updateSingular: (id: string, patch: Partial<SingularElement>) => void;
  removeSingular: (id: string) => void;

  // Location & climate
  setLocation: (loc: ProjectLocation) => void;
}

const RoofContext = createContext<RoofContextValue | null>(null);

function loadStoredProjects(): RoofProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return BUILTIN_PROJECTS;
    const parsed = JSON.parse(raw) as RoofProject[];
    const ids = new Set(parsed.map((p) => p.id));
    const merged = [...parsed];
    for (const bp of BUILTIN_PROJECTS) {
      if (!ids.has(bp.id)) merged.push(bp);
    }
    return merged;
  } catch {
    return BUILTIN_PROJECTS;
  }
}

export const RoofProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedProjects, setSavedProjects] = useState<RoofProject[]>(() => loadStoredProjects());
  const [project, setProject] = useState<RoofProject>(() => BUILTIN_PROJECTS[0]);
  const [past, setPast] = useState<RoofProject[]>([]);
  const [future, setFuture] = useState<RoofProject[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('dividida');
  const [activeCategory, setActiveCategory] = useState<ToolCategoryId>('geometria');
  const [activeSubTool, setActiveSubTool] = useState<ActiveSubTool>('select');
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>({
    kind: 'face',
    faceId: 'body-1-F3',
  });
  const [highlightedPoint, setHighlightedPoint] = useState<Point2D | null>(null);
  const [learningMode, setLearningMode] = useState<'libre' | 'guiado'>('libre');
  const [guidedStage, setGuidedStage] = useState<number>(1);
  const [wavefrontStep, setWavefrontStep] = useState<number | null>(null);
  const [showWaterFlow, setShowWaterFlow] = useState<boolean>(false);
  const [showRealisticFill2D, setShowRealisticFill2D] = useState<boolean>(true);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [gridStepM, setGridStepM] = useState<number>(0.25);
  const [renderStyle3D, setRenderStyle3D] = useState<RenderStyle3D>('realista');
  const [cameraPreset3D, setCameraPreset3D] = useState<CameraPreset3D>('perspectiva');
  const [sunAzimuthDeg, setSunAzimuthDeg] = useState<number>(145);
  const [sunElevationDeg, setSunElevationDeg] = useState<number>(48);
  const [explodeFactor, setExplodeFactor] = useState<number>(0.65);

  const [replanteoMode, setReplanteoModeState] = useState<'auto' | 'manual'>('auto');
  const [manualEdges, setManualEdges] = useState<ManualReplanteoEdge[]>([]);
  const [manualCheckActive, setManualCheckActive] = useState<boolean>(false);
  const [revealedHintCount, setRevealedHintCount] = useState<number>(0);

  const solved = useMemo(() => solveRoofProject(project), [project]);

  const gradingReport = useMemo<ManualGradingReport | null>(() => {
    if (replanteoMode !== 'manual' || !manualCheckActive) return null;
    return gradeManualReplanteo(manualEdges, solved.edges);
  }, [replanteoMode, manualCheckActive, manualEdges, solved.edges]);

  useEffect(() => {
    if (!highlightedPoint) return;
    const t = setTimeout(() => setHighlightedPoint(null), 5000);
    return () => clearTimeout(t);
  }, [highlightedPoint]);

  const commitProject = useCallback((updater: (prev: RoofProject) => RoofProject, recordHistory = true) => {
    setProject((prev) => {
      const next = updater(prev);
      if (recordHistory) {
        setPast((p) => [...p.slice(-39), prev]);
        setFuture([]);
      }
      return {
        ...next,
        updatedAt: new Date().toISOString().slice(0, 10),
      };
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [project, ...f]);
      setProject(prev);
      return p.slice(0, -1);
    });
  }, [project]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, project]);
      setProject(next);
      return f.slice(1);
    });
  }, [project]);

  const loadProject = useCallback((proj: RoofProject) => {
    const cloned = JSON.parse(JSON.stringify(proj)) as RoofProject;
    setPast([]);
    setFuture([]);
    setWavefrontStep(null);
    setHighlightedPoint(null);
    setReplanteoModeState('auto');
    setManualEdges([]);
    setManualCheckActive(false);
    setRevealedHintCount(0);
    setProject(cloned);
    const s = solveRoofProject(cloned);
    if (s.faces.length > 0) {
      const f3 = s.faces.find((f) => f.label === 'F3') || s.faces[0];
      setSelectedEntity({ kind: 'face', faceId: f3.id });
    } else {
      setSelectedEntity({ kind: 'project' });
    }
  }, []);

  const createNewProject = useCallback(
    (proj?: RoofProject) => {
      loadProject(proj || createBlankProject());
    },
    [loadProject]
  );

  const saveCurrentProject = useCallback(() => {
    setSavedProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === project.id);
      const next = idx >= 0 ? prev.map((p, i) => (i === idx ? project : p)) : [project, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors cleanly
      }
      return next;
    });
  }, [project]);

  const updateProjectMeta = useCallback(
    (
      patch: Partial<
        Pick<
          RoofProject,
          | 'name'
          | 'author'
          | 'scaleDenominator'
          | 'units'
          | 'northAngleDeg'
          | 'description'
          | 'needsScaleConfirmation'
        >
      >
    ) => {
      commitProject((prev) => ({ ...prev, ...patch }));
    },
    [commitProject]
  );

  const rescaleEntireProject = useCallback(
    (scaleFactor: number) => {
      if (scaleFactor <= 0.05 || scaleFactor > 20) return;
      commitProject((prev) => ({
        ...prev,
        needsScaleConfirmation: false,
        bodies: prev.bodies.map((b) => ({
          ...b,
          outerLoop: b.outerLoop.map((v) => ({
            ...v,
            x: Number((v.x * scaleFactor).toFixed(3)),
            y: Number((v.y * scaleFactor).toFixed(3)),
          })),
          holes: b.holes.map((h) => ({
            ...h,
            vertices: h.vertices.map((v) => ({
              ...v,
              x: Number((v.x * scaleFactor).toFixed(3)),
              y: Number((v.y * scaleFactor).toFixed(3)),
            })),
          })),
          flatDrainTarget: b.flatDrainTarget
            ? {
                ...b.flatDrainTarget,
                x: Number((b.flatDrainTarget.x * scaleFactor).toFixed(3)),
                y: Number((b.flatDrainTarget.y * scaleFactor).toFixed(3)),
              }
            : undefined,
        })),
        drains: prev.drains.map((d) => ({
          ...d,
          x: Number((d.x * scaleFactor).toFixed(3)),
          y: Number((d.y * scaleFactor).toFixed(3)),
        })),
        downspouts: prev.downspouts.map((ds) => ({
          ...ds,
          x: Number((ds.x * scaleFactor).toFixed(3)),
          y: Number((ds.y * scaleFactor).toFixed(3)),
        })),
        singularElements: prev.singularElements.map((s) => ({
          ...s,
          x: Number((s.x * scaleFactor).toFixed(3)),
          y: Number((s.y * scaleFactor).toFixed(3)),
        })),
        sectionLine: {
          p1: {
            x: prev.sectionLine.p1.x * scaleFactor,
            y: prev.sectionLine.p1.y * scaleFactor,
          },
          p2: {
            x: prev.sectionLine.p2.x * scaleFactor,
            y: prev.sectionLine.p2.y * scaleFactor,
          },
        },
      }));
    },
    [commitProject]
  );

  const clearToBlankCanvas = useCallback(() => {
    commitProject((prev) => ({
      ...prev,
      name: 'Nuevo Proyecto desde Cero',
      description: 'Trazado libre desde cero: dibuje el perímetro en planta 2D y practique manualmente el trazado de cumbreras, limatesas y limahoyas.',
      needsScaleConfirmation: false,
      bodies: [],
      drains: [],
      downspouts: [],
      singularElements: [],
    }));
    setSelectedEntity(null);
    setActiveSubTool('draw_polygon');
    setWavefrontStep(null);
    setReplanteoModeState('manual');
    setManualEdges([]);
    setManualCheckActive(false);
    setRevealedHintCount(0);
  }, [commitProject]);

  const insertVertexOnEdge = useCallback(
    (bodyId: string, edgeIndex: number, pt: Point2D, holeId?: string) => {
      commitProject((prev) => ({
        ...prev,
        bodies: prev.bodies.map((b) => {
          if (b.id !== bodyId) return b;
          const newV = {
            id: `v-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            x: Number(pt.x.toFixed(3)),
            y: Number(pt.y.toFixed(3)),
          };
          if (!holeId) {
            const loop = [...b.outerLoop];
            const vA = loop[edgeIndex];
            const vB = loop[(edgeIndex + 1) % loop.length];
            const oldCfg = b.edgeConfigs[`${vA.id}->${vB.id}`];
            loop.splice(edgeIndex + 1, 0, newV);
            const nextCfg = { ...b.edgeConfigs };
            if (oldCfg) {
              delete nextCfg[`${vA.id}->${vB.id}`];
              nextCfg[`${vA.id}->${newV.id}`] = { ...oldCfg, edgeId: `${vA.id}->${newV.id}` };
              nextCfg[`${newV.id}->${vB.id}`] = { ...oldCfg, edgeId: `${newV.id}->${vB.id}` };
            }
            return { ...b, outerLoop: loop, edgeConfigs: nextCfg };
          }
          return {
            ...b,
            holes: b.holes.map((h) => {
              if (h.id !== holeId) return h;
              const verts = [...h.vertices];
              verts.splice(edgeIndex + 1, 0, newV);
              return { ...h, vertices: verts };
            }),
          };
        }),
      }));
    },
    [commitProject]
  );

  const setPerimeterEdgeLength = useCallback(
    (bodyId: string, edgeIndex: number, newLengthM: number) => {
      if (newLengthM <= 0.3) return;
      commitProject((prev) => ({
        ...prev,
        bodies: prev.bodies.map((b) => {
          if (b.id !== bodyId || b.outerLoop.length < 3) return b;
          const loop = b.outerLoop.map((v) => ({ ...v }));
          const vA = loop[edgeIndex];
          const vBIdx = (edgeIndex + 1) % loop.length;
          const vB = loop[vBIdx];
          const dx = vB.x - vA.x;
          const dy = vB.y - vA.y;
          const curLen = Math.hypot(dx, dy);
          if (curLen < 1e-4) return b;
          const scale = newLengthM / curLen;
          loop[vBIdx] = {
            ...vB,
            x: Number((vA.x + dx * scale).toFixed(3)),
            y: Number((vA.y + dy * scale).toFixed(3)),
          };
          return { ...b, outerLoop: loop };
        }),
      }));
    },
    [commitProject]
  );

  const moveVertex = useCallback(
    (bodyId: string, vertexId: string, x: number, y: number, holeId?: string, pushHistory = true) => {
      commitProject((prev) => ({
        ...prev,
        bodies: prev.bodies.map((b) => {
          if (b.id !== bodyId) return b;
          if (!holeId) {
            return {
              ...b,
              outerLoop: b.outerLoop.map((v) =>
                v.id === vertexId ? { ...v, x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) } : v
              ),
            };
          }
          return {
            ...b,
            holes: b.holes.map((h) =>
              h.id === holeId
                ? {
                    ...h,
                    vertices: h.vertices.map((v) =>
                      v.id === vertexId
                        ? { ...v, x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) }
                        : v
                    ),
                  }
                : h
            ),
          };
        }),
      }), pushHistory);
    },
    [commitProject]
  );

  const addBody = useCallback(
    (body: RoofBody) => {
      commitProject((prev) => ({
        ...prev,
        bodies: [...prev.bodies, body],
      }));
      setSelectedEntity({ kind: 'body', bodyId: body.id });
    },
    [commitProject]
  );

  const replacePrimaryBody = useCallback(
    (body: RoofBody) => {
      commitProject((prev) => ({
        ...prev,
        bodies: [body],
      }));
      setManualEdges([]);
      setManualCheckActive(false);
      setRevealedHintCount(0);
      setSelectedEntity({ kind: 'body', bodyId: body.id });
    },
    [commitProject]
  );

  const addHoleToBody = useCallback(
    (bodyId: string, holeVerts: Point2D[], name = 'Patio interior') => {
      commitProject((prev) => ({
        ...prev,
        bodies: prev.bodies.map((b) => {
          if (b.id !== bodyId) return b;
          const hid = `hole-${Date.now()}`;
          // Interior holes must be Clockwise (opposite to CCW outer perimeter)
          const cwVerts = ensureCCW(holeVerts).reverse();
          const verts = cwVerts.map((p, idx) => ({
            id: `${hid}-v${idx + 1}`,
            x: Number(p.x.toFixed(3)),
            y: Number(p.y.toFixed(3)),
          }));
          const newEdgeConfigs = { ...b.edgeConfigs };
          for (let i = 0; i < verts.length; i++) {
            const va = verts[i];
            const vb = verts[(i + 1) % verts.length];
            const eid = `${va.id}->${vb.id}`;
            newEdgeConfigs[eid] = {
              edgeId: eid,
              type: 'eave',
              slopePct: b.defaultSlopePct,
              eaveHeight: b.defaultEaveHeight,
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
            ...b,
            holes: [...b.holes, { id: hid, name, vertices: verts }],
            edgeConfigs: newEdgeConfigs,
          };
        }),
      }));
    },
    [commitProject]
  );

  const updateEdgeConfig = useCallback(
    (bodyId: string, edgeId: string, patch: Partial<EdgeConfig>) => {
      commitProject((prev) => ({
        ...prev,
        bodies: prev.bodies.map((b) => {
          if (b.id !== bodyId) return b;
          const cur = b.edgeConfigs[edgeId] || {
            edgeId,
            type: 'eave',
            slopePct: b.defaultSlopePct,
            eaveHeight: b.defaultEaveHeight,
            overhang: 0.35,
            parapetHeight: b.parapetHeight,
            flashingHeight: 0.25,
            hasGutter: true,
            gutterDiameterMm: 125,
            gutterSlopePct: 1.0,
            gutterSection: 'semicircular',
          };
          return {
            ...b,
            edgeConfigs: {
              ...b.edgeConfigs,
              [edgeId]: { ...cur, ...patch },
            },
          };
        }),
      }));
    },
    [commitProject]
  );

  const updateFaceSlopeByFaceId = useCallback(
    (faceId: string, newSlopePct: number) => {
      const targetFace = solved.faces.find((f) => f.id === faceId);
      if (!targetFace) return;
      const clamped = Math.max(0.2, Math.min(200, newSlopePct));
      commitProject((prev) => ({
        ...prev,
        bodies: prev.bodies.map((b) => {
          if (b.id !== targetFace.bodyId) return b;
          if (b.mode === 'mono_pitch') {
            return { ...b, monoPitchSlopePct: clamped };
          }
          if (b.mode === 'flat_inward_drain' && b.flatDrainTarget) {
            // Adjust drain elevation proportionally from face distance so exact slope equals clamped!
            const edgeCfg = targetFace.sourceEdgeId ? b.edgeConfigs[targetFace.sourceEdgeId] : undefined;
            const perimZ = edgeCfg ? edgeCfg.eaveHeight : b.defaultEaveHeight;
            const vA = targetFace.polygon2D[0];
            const vB = targetFace.polygon2D[1];
            const ex = vB.x - vA.x;
            const ey = vB.y - vA.y;
            const len = Math.hypot(ex, ey) || 1;
            const dx = b.flatDrainTarget.x - vA.x;
            const dy = b.flatDrainTarget.y - vA.y;
            const distPerp = Math.abs(ex * dy - ey * dx) / len;
            const newZ = Number((perimZ - (clamped / 100) * distPerp).toFixed(3));
            return {
              ...b,
              flatDrainTarget: { ...b.flatDrainTarget, elevation: newZ },
            };
          }
          if (targetFace.sourceEdgeId && b.edgeConfigs[targetFace.sourceEdgeId]) {
            return {
              ...b,
              edgeConfigs: {
                ...b.edgeConfigs,
                [targetFace.sourceEdgeId]: {
                  ...b.edgeConfigs[targetFace.sourceEdgeId],
                  slopePct: clamped,
                },
              },
            };
          }
          return b;
        }),
      }));
    },
    [commitProject, solved.faces]
  );

  const updateBodyDrainElevation = useCallback(
    (bodyId: string, elevation: number) => {
      commitProject((prev) => ({
        ...prev,
        bodies: prev.bodies.map((b) =>
          b.id === bodyId && b.flatDrainTarget
            ? { ...b, flatDrainTarget: { ...b.flatDrainTarget, elevation } }
            : b
        ),
      }));
    },
    [commitProject]
  );

  const updateSectionLine = useCallback(
    (line: SectionLine) => {
      commitProject((prev) => ({ ...prev, sectionLine: line }), false);
    },
    [commitProject]
  );

  const setUnderlay = useCallback(
    (underlay: ReferenceUnderlay | undefined) => {
      commitProject((prev) => ({ ...prev, underlay }));
    },
    [commitProject]
  );

  const setRoofSystem = useCallback(
    (systemId: RoofSystemId) => {
      const meta = ROOF_SYSTEMS[systemId];
      commitProject((prev) => ({
        ...prev,
        systemId,
        isFlatRoofMode: meta.isFlat,
        flatRoofUsage: meta.defaultFlatUsage,
        hasWaterproofing: meta.defaultHasWaterproofing,
        tileSpec: { ...meta.defaultTileSpec },
        layers: meta.defaultLayers.map((l) => ({ ...l })),
      }));
    },
    [commitProject]
  );

  const setHasWaterproofing = useCallback(
    (val: boolean) => {
      commitProject((prev) => {
        const hasWpLayer = prev.layers.some((l) => l.role === 'waterproofing');
        let nextLayers = prev.layers.map((l) =>
          l.role === 'waterproofing' ? { ...l, visible: val } : l
        );
        if (val && !hasWpLayer) {
          const newLayer: LayerSpec = {
            id: `layer-wp-${Date.now()}`,
            order: prev.layers.length + 1,
            name: 'Lámina impermeabilizante bajo teja (transpirable/bituminosa)',
            material: 'Lámina sintética / bituminosa adherida o clavada',
            thicknessCm: 0.4,
            densityKgM3: 1100,
            lambdaWMK: 0.23,
            functionDesc: 'Barrera secundaria impermeable bajo cobertura (DB-HS 1 Apdo. 2.4.3).',
            colorHex: '#3b82f6',
            visible: true,
            role: 'waterproofing',
          };
          nextLayers = [...nextLayers, newLayer];
        }
        return {
          ...prev,
          hasWaterproofing: val,
          layers: nextLayers,
        };
      });
    },
    [commitProject]
  );

  const setFlatRoofUsage = useCallback(
    (usage: FlatRoofUsage) => {
      commitProject((prev) => ({ ...prev, flatRoofUsage: usage }));
    },
    [commitProject]
  );

  const setParapetHeight = useCallback(
    (heightM: number) => {
      commitProject((prev) => ({
        ...prev,
        bodies: prev.bodies.map((b) => ({ ...b, parapetHeight: heightM })),
      }));
    },
    [commitProject]
  );

  const updateTileSpec = useCallback(
    (patch: Partial<TileSpec>) => {
      commitProject((prev) => ({
        ...prev,
        tileSpec: { ...prev.tileSpec, ...patch },
      }));
    },
    [commitProject]
  );

  const updateLayer = useCallback(
    (layerId: string, patch: Partial<LayerSpec>) => {
      commitProject((prev) => {
        const nextLayers = prev.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l));
        const hasWp = nextLayers.some((l) => l.visible && l.role === 'waterproofing');
        return {
          ...prev,
          layers: nextLayers,
          hasWaterproofing: hasWp,
        };
      });
    },
    [commitProject]
  );

  const addLayer = useCallback(
    (layer: LayerSpec) => {
      commitProject((prev) => {
        const nextLayers = [...prev.layers, layer];
        const hasWp = nextLayers.some((l) => l.visible && l.role === 'waterproofing');
        return {
          ...prev,
          layers: nextLayers,
          hasWaterproofing: hasWp,
        };
      });
    },
    [commitProject]
  );

  const removeLayer = useCallback(
    (layerId: string) => {
      commitProject((prev) => {
        const nextLayers = prev.layers.filter((l) => l.id !== layerId);
        const hasWp = nextLayers.some((l) => l.visible && l.role === 'waterproofing');
        return {
          ...prev,
          layers: nextLayers,
          hasWaterproofing: hasWp,
        };
      });
    },
    [commitProject]
  );

  const addDrain = useCallback(
    (drain: DrainElement) => {
      commitProject((prev) => ({
        ...prev,
        drains: [...prev.drains, drain],
      }));
      setSelectedEntity({ kind: 'drain', drainId: drain.id });
    },
    [commitProject]
  );

  const moveDrain = useCallback(
    (drainId: string, x: number, y: number) => {
      commitProject((prev) => ({
        ...prev,
        drains: prev.drains.map((d) =>
          d.id === drainId ? { ...d, x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) } : d
        ),
        bodies: prev.bodies.map((b) =>
          b.flatDrainTarget?.drainId === drainId
            ? {
                ...b,
                flatDrainTarget: {
                  ...b.flatDrainTarget,
                  x: Number(x.toFixed(3)),
                  y: Number(y.toFixed(3)),
                },
              }
            : b
        ),
      }));
    },
    [commitProject]
  );

  const updateDrain = useCallback(
    (drainId: string, patch: Partial<DrainElement>) => {
      commitProject((prev) => ({
        ...prev,
        drains: prev.drains.map((d) => (d.id === drainId ? { ...d, ...patch } : d)),
      }));
    },
    [commitProject]
  );

  const removeDrain = useCallback(
    (drainId: string) => {
      commitProject((prev) => ({
        ...prev,
        drains: prev.drains.filter((d) => d.id !== drainId),
      }));
      setSelectedEntity(null);
    },
    [commitProject]
  );

  const addDownspout = useCallback(
    (ds: Downspout) => {
      commitProject((prev) => ({
        ...prev,
        downspouts: [...prev.downspouts, ds],
      }));
      setSelectedEntity({ kind: 'downspout', downspoutId: ds.id });
    },
    [commitProject]
  );

  const moveDownspout = useCallback(
    (dsId: string, x: number, y: number) => {
      commitProject((prev) => ({
        ...prev,
        downspouts: prev.downspouts.map((d) =>
          d.id === dsId ? { ...d, x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) } : d
        ),
      }));
    },
    [commitProject]
  );

  const updateDownspout = useCallback(
    (dsId: string, patch: Partial<Downspout>) => {
      commitProject((prev) => ({
        ...prev,
        downspouts: prev.downspouts.map((d) => (d.id === dsId ? { ...d, ...patch } : d)),
      }));
    },
    [commitProject]
  );

  const removeDownspout = useCallback(
    (dsId: string) => {
      commitProject((prev) => ({
        ...prev,
        downspouts: prev.downspouts.filter((d) => d.id !== dsId),
      }));
      setSelectedEntity(null);
    },
    [commitProject]
  );

  const addSingular = useCallback(
    (el: SingularElement) => {
      commitProject((prev) => ({
        ...prev,
        singularElements: [...prev.singularElements, el],
      }));
      setSelectedEntity({ kind: 'singular', singularId: el.id });
    },
    [commitProject]
  );

  const moveSingular = useCallback(
    (id: string, x: number, y: number) => {
      commitProject((prev) => ({
        ...prev,
        singularElements: prev.singularElements.map((s) =>
          s.id === id ? { ...s, x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) } : s
        ),
      }));
    },
    [commitProject]
  );

  const updateSingular = useCallback(
    (id: string, patch: Partial<SingularElement>) => {
      commitProject((prev) => ({
        ...prev,
        singularElements: prev.singularElements.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
    },
    [commitProject]
  );

  const removeSingular = useCallback(
    (id: string) => {
      commitProject((prev) => ({
        ...prev,
        singularElements: prev.singularElements.filter((s) => s.id !== id),
      }));
      setSelectedEntity(null);
    },
    [commitProject]
  );

  const setLocation = useCallback(
    (loc: ProjectLocation) => {
      commitProject((prev) => ({ ...prev, location: loc }));
    },
    [commitProject]
  );

  const setReplanteoMode = useCallback((m: 'auto' | 'manual') => {
    setReplanteoModeState(m);
    if (m === 'auto') {
      setManualCheckActive(false);
    }
  }, []);

  const addManualEdge = useCallback(
    (kind: 'cumbrera' | 'limatesa' | 'limahoya', p1: Point2D, p2: Point2D) => {
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.15) return;
      const newEdge: ManualReplanteoEdge = {
        id: `man-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        kind,
        p1: { x: Number(p1.x.toFixed(3)), y: Number(p1.y.toFixed(3)) },
        p2: { x: Number(p2.x.toFixed(3)), y: Number(p2.y.toFixed(3)) },
      };
      setManualEdges((prev) => [...prev, newEdge]);
    },
    []
  );

  const removeManualEdge = useCallback((id: string) => {
    setManualEdges((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearManualEdges = useCallback(() => {
    setManualEdges([]);
    setManualCheckActive(false);
    setRevealedHintCount(0);
  }, []);

  const runManualCheck = useCallback(() => {
    setReplanteoModeState('manual');
    setManualCheckActive(true);
  }, []);

  const revealNextHint = useCallback(() => {
    setReplanteoModeState('manual');
    setRevealedHintCount((c) => c + 1);
  }, []);

  const autoSolveReplanteo = useCallback(() => {
    setReplanteoModeState('auto');
    setManualCheckActive(false);
    setActiveSubTool('select');
  }, []);

  const autoFixNormativeRule = useCallback(
    (checkId: string) => {
      commitProject((prev) => {
        if (checkId === 'cte-he1-transmitancia' || checkId === 'cte-he1-condensacion') {
          const targetU = TABLA_ULIM_CUBIERTA_HE1[prev.location.climateZoneWinter];
          const fRsiMin =
            prev.location.climateZoneWinter === 'E' || prev.location.climateZoneWinter === 'D'
              ? 0.68
              : 0.56;
          const condU = (1 - fRsiMin) / 0.25;
          const desiredU = checkId === 'cte-he1-condensacion' ? Math.min(targetU, condU) : targetU;
          let rCurrent = 0.14;
          for (const l of prev.layers) {
            if (l.visible && l.thicknessCm > 0 && l.lambdaWMK > 0.001) {
              rCurrent += l.thicknessCm / 100 / l.lambdaWMK;
            }
          }
          const rNeeded = 1 / desiredU + 0.05;
          const deltaR = Math.max(0, rNeeded - rCurrent);
          const hasIns = prev.layers.some((l) => l.role === 'insulation');
          if (!hasIns) {
            const extraCm = Math.max(8, Math.ceil(deltaR * 0.034 * 100));
            const insLayer: LayerSpec = {
              id: `layer-ins-${Date.now()}`,
              order: prev.layers.length + 1,
              name: 'Aislamiento térmico XPS de alta densidad',
              material: 'Poliestireno extruido XPS',
              thicknessCm: extraCm,
              densityKgM3: 32,
              lambdaWMK: 0.034,
              functionDesc: 'Control térmico según CTE DB-HE 1.',
              colorHex: '#eab308',
              visible: true,
              role: 'insulation',
            };
            return { ...prev, layers: [...prev.layers, insLayer] };
          }
          return {
            ...prev,
            layers: prev.layers.map((l) => {
              if (l.role !== 'insulation') return l;
              const lam = l.lambdaWMK > 0.001 ? l.lambdaWMK : 0.034;
              const addedCm = Math.ceil(deltaR * lam * 100);
              return {
                ...l,
                visible: true,
                thicknessCm: Math.max(l.thicknessCm, l.thicknessCm + addedCm),
              };
            }),
          };
        }

        if (checkId === 'cte-hs1-tabla210') {
          const t210 = TABLA_210_CUBIERTAS_INCLINADAS.find((e) =>
            e.mappedSystems.includes(prev.systemId)
          );
          if (!t210) return prev;
          const minS = t210.minSlopePct;
          return {
            ...prev,
            bodies: prev.bodies.map((b) => {
              const nextEdgeConfigs: Record<string, EdgeConfig> = {};
              for (const [k, cfg] of Object.entries(b.edgeConfigs)) {
                nextEdgeConfigs[k] = {
                  ...cfg,
                  slopePct: Math.max(minS, cfg.slopePct),
                };
              }
              return {
                ...b,
                defaultSlopePct: Math.max(minS, b.defaultSlopePct),
                monoPitchSlopePct:
                  b.monoPitchSlopePct !== undefined
                    ? Math.max(minS, b.monoPitchSlopePct)
                    : undefined,
                edgeConfigs: nextEdgeConfigs,
              };
            }),
          };
        }

        if (checkId === 'cte-hs1-tabla29') {
          const t29 =
            TABLA_29_CUBIERTAS_PLANAS.find((e) => e.usage === prev.flatRoofUsage) ||
            TABLA_29_CUBIERTAS_PLANAS[0];
          const midSlope = Number(((t29.minSlopePct + Math.min(3.5, t29.maxSlopePct)) * 0.5).toFixed(2));
          return {
            ...prev,
            bodies: prev.bodies.map((b) => {
              const nextEdgeConfigs: Record<string, EdgeConfig> = {};
              for (const [k, cfg] of Object.entries(b.edgeConfigs)) {
                nextEdgeConfigs[k] = {
                  ...cfg,
                  slopePct: Math.min(t29.maxSlopePct, Math.max(t29.minSlopePct, cfg.slopePct)),
                };
              }
              let nextDrainTarget = b.flatDrainTarget;
              if (b.mode === 'flat_inward_drain' && b.flatDrainTarget && b.outerLoop.length >= 3) {
                const dists: number[] = [];
                for (let i = 0; i < b.outerLoop.length; i++) {
                  const a = b.outerLoop[i];
                  const c = b.outerLoop[(i + 1) % b.outerLoop.length];
                  const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
                  const d =
                    Math.abs(
                      (c.x - a.x) * (b.flatDrainTarget.y - a.y) -
                        (c.y - a.y) * (b.flatDrainTarget.x - a.x)
                    ) / len;
                  dists.push(d);
                }
                const minDist = Math.max(0.5, Math.min(...dists));
                const maxDist = Math.max(minDist, Math.max(...dists));
                const minDz = ((t29.minSlopePct + 0.15) / 100) * maxDist;
                const maxDz = ((t29.maxSlopePct - 0.15) / 100) * minDist;
                const dz =
                  minDz <= maxDz
                    ? (minDz + maxDz) * 0.5
                    : (midSlope / 100) * ((minDist + maxDist) * 0.5);
                nextDrainTarget = {
                  ...b.flatDrainTarget,
                  elevation: Number((b.defaultEaveHeight - dz).toFixed(3)),
                };
              }
              return {
                ...b,
                defaultSlopePct: Math.min(
                  t29.maxSlopePct,
                  Math.max(t29.minSlopePct, b.defaultSlopePct)
                ),
                monoPitchSlopePct:
                  b.monoPitchSlopePct !== undefined
                    ? Math.min(t29.maxSlopePct, Math.max(t29.minSlopePct, b.monoPitchSlopePct))
                    : undefined,
                flatDrainTarget: nextDrainTarget,
                edgeConfigs: nextEdgeConfigs,
              };
            }),
          };
        }

        if (checkId === 'cte-hs5-tabla46') {
          const req = solved.hydrology.isTabla46BoundaryAmbiguous
            ? 4
            : solved.hydrology.minimumSumiderosTabla46 ?? 2;
          const nonRebosaderos = prev.drains.filter((d) => d.kind !== 'rebosadero');
          if (nonRebosaderos.length >= req) return prev;
          const needed = req - nonRebosaderos.length;
          const added: DrainElement[] = [];
          const candidatePoints: Point2D[] = [];
          for (const f of solved.faces) {
            candidatePoints.push(f.centroid2D);
          }
          if (candidatePoints.length === 0 && prev.bodies[0]?.outerLoop.length) {
            const loop = prev.bodies[0].outerLoop;
            const cx = loop.reduce((a, v) => a + v.x, 0) / loop.length;
            const cy = loop.reduce((a, v) => a + v.y, 0) / loop.length;
            candidatePoints.push({ x: cx - 0.8, y: cy }, { x: cx + 0.8, y: cy }, { x: cx, y: cy });
          }
          for (let i = 0; i < needed; i++) {
            const existingAll = [...prev.drains, ...added];
            let bestPt = candidatePoints[i % candidatePoints.length] || { x: 2 + i * 2, y: 2 };
            let bestMinDist = -1;
            for (const cand of candidatePoints) {
              const md =
                existingAll.length === 0
                  ? 999
                  : Math.min(...existingAll.map((d) => Math.hypot(d.x - cand.x, d.y - cand.y)));
              if (md > bestMinDist) {
                bestMinDist = md;
                bestPt = cand;
              }
            }
            if (bestMinDist < 0.6) {
              bestPt = { x: Number((bestPt.x + 0.9 * (i + 1)).toFixed(2)), y: bestPt.y };
            }
            added.push({
              id: `drain-fix-${Date.now()}-${i}`,
              kind: 'sumidero',
              x: Number(bestPt.x.toFixed(3)),
              y: Number(bestPt.y.toFixed(3)),
              diameterMm: 110,
              bodyId: prev.bodies[0]?.id,
              label: `S${prev.drains.length + i + 1}`,
            });
          }
          return { ...prev, drains: [...prev.drains, ...added] };
        }

        if (checkId === 'cte-hs5-tabla47') {
          const evals = solved.hydrology.gutterEvaluations;
          return {
            ...prev,
            bodies: prev.bodies.map((b) => {
              const nextCfgs = { ...b.edgeConfigs };
              for (const ev of evals) {
                if (ev.compliesTabla47 && ev.compliesMinSlope1Pct) continue;
                const sEdge = solved.edges.find((se) => se.id === ev.edgeId);
                if (sEdge && sEdge.bodyId === b.id && sEdge.sourceEdgeId && nextCfgs[sEdge.sourceEdgeId]) {
                  const allowedDias: Array<100 | 125 | 150 | 200 | 250> = [100, 125, 150, 200, 250];
                  const targetDia =
                    allowedDias.find((d) => d >= ev.requiredDiameterMm) ?? 250;
                  nextCfgs[sEdge.sourceEdgeId] = {
                    ...nextCfgs[sEdge.sourceEdgeId],
                    gutterDiameterMm: Math.max(nextCfgs[sEdge.sourceEdgeId].gutterDiameterMm, targetDia) as 100 | 125 | 150 | 200 | 250,
                    gutterSlopePct: Math.max(1.0, nextCfgs[sEdge.sourceEdgeId].gutterSlopePct),
                  };
                }
              }
              return { ...b, edgeConfigs: nextCfgs };
            }),
          };
        }

        if (checkId === 'cte-hs5-tabla48') {
          const allowedDs: Array<Downspout['diameterMm']> = [50, 63, 75, 90, 110, 125, 160, 200];
          return {
            ...prev,
            downspouts: prev.downspouts.map((ds) => {
              const ev = solved.hydrology.downspoutEvaluations.find((e) => e.downspoutId === ds.id);
              if (!ev || ev.compliesTabla48) return ds;
              const targetDia = allowedDs.find((d) => d >= ev.recommendedMinMm) ?? 200;
              return { ...ds, diameterMm: targetDia };
            }),
          };
        }

        if (checkId === 'cte-hs5-tabla48-missing') {
          const eaveEdge = solved.edges.find((e) => e.type === 'alero') || solved.edges[0];
          const px = eaveEdge ? (eaveEdge.p1.x + eaveEdge.p2.x) * 0.5 : prev.drains[0]?.x ?? 2;
          const py = eaveEdge ? (eaveEdge.p1.y + eaveEdge.p2.y) * 0.5 : prev.drains[0]?.y ?? 2;
          const newDs: Downspout = {
            id: `ds-fix-${Date.now()}`,
            x: Number(px.toFixed(3)),
            y: Number(py.toFixed(3)),
            diameterMm: 110,
            kind: 'exterior',
            label: `B${prev.downspouts.length + 1}`,
          };
          return { ...prev, downspouts: [...prev.downspouts, newDs] };
        }

        if (checkId === 'cte-hs5-escorrentia') {
          const addedDrains: DrainElement[] = [];
          const addedDownspouts: Downspout[] = [];
          let fixGutterSlope = false;
          solved.hydrology.alerts.forEach((al, idx) => {
            if (!al.location) return;
            if (al.id.startsWith('alert-gutter-nods-')) {
              const allDs = [...prev.downspouts, ...addedDownspouts];
              const nearbyDs = allDs.some(
                (ds) => Math.hypot(ds.x - al.location!.x, ds.y - al.location!.y) < 1.5
              );
              if (!nearbyDs) {
                addedDownspouts.push({
                  id: `ds-alert-${Date.now()}-${idx}`,
                  x: Number(al.location.x.toFixed(3)),
                  y: Number(al.location.y.toFixed(3)),
                  diameterMm: 90,
                  kind: 'exterior',
                  label: `B${allDs.length + 1}`,
                });
              }
            } else if (al.id.startsWith('alert-gutter-slope-')) {
              fixGutterSlope = true;
            } else {
              const allDr = [...prev.drains, ...addedDrains];
              const nearby = allDr.some(
                (d) => Math.hypot(d.x - al.location!.x, d.y - al.location!.y) < 0.7
              );
              if (!nearby) {
                addedDrains.push({
                  id: `drain-alert-${Date.now()}-${idx}`,
                  kind: 'cazoleta',
                  x: Number(al.location.x.toFixed(3)),
                  y: Number(al.location.y.toFixed(3)),
                  diameterMm: 110,
                  bodyId: prev.bodies[0]?.id,
                  label: `S${allDr.length + 1}`,
                });
              }
            }
          });
          return {
            ...prev,
            drains: addedDrains.length > 0 ? [...prev.drains, ...addedDrains] : prev.drains,
            downspouts:
              addedDownspouts.length > 0
                ? [...prev.downspouts, ...addedDownspouts]
                : prev.downspouts,
            bodies: fixGutterSlope
              ? prev.bodies.map((b) => {
                  const nextCfgs: Record<string, EdgeConfig> = {};
                  for (const [k, cfg] of Object.entries(b.edgeConfigs)) {
                    nextCfgs[k] = { ...cfg, gutterSlopePct: Math.max(1.0, cfg.gutterSlopePct) };
                  }
                  return { ...b, edgeConfigs: nextCfgs };
                })
              : prev.bodies,
          };
        }

        if (checkId === 'cte-hs1-paramentos') {
          return {
            ...prev,
            bodies: prev.bodies.map((b) => {
              const nextCfgs: Record<string, EdgeConfig> = {};
              for (const [k, cfg] of Object.entries(b.edgeConfigs)) {
                nextCfgs[k] =
                  cfg.type === 'wall_abutment' || cfg.type === 'parapet'
                    ? { ...cfg, flashingHeight: Math.max(0.25, cfg.flashingHeight) }
                    : cfg;
              }
              return { ...b, edgeConfigs: nextCfgs };
            }),
          };
        }

        if (checkId === 'cte-hs1-aleros') {
          const maxVuelo = prev.tileSpec.lengthCm * 0.5;
          return {
            ...prev,
            tileSpec: {
              ...prev.tileSpec,
              eaveOverhangCm: Math.min(maxVuelo, Math.max(5, prev.tileSpec.eaveOverhangCm)),
            },
          };
        }

        if (checkId === 'cte-hs1-limahoyas') {
          return {
            ...prev,
            tileSpec: {
              ...prev.tileSpec,
              valleyGapCm: Math.max(20, prev.tileSpec.valleyGapCm),
              valleyOverhangCm: Math.max(5, prev.tileSpec.valleyOverhangCm),
            },
          };
        }

        if (checkId === 'cte-hs1-cumbreras') {
          return {
            ...prev,
            tileSpec: {
              ...prev.tileSpec,
              ridgeOverlapCm: Math.max(5, prev.tileSpec.ridgeOverlapCm),
            },
          };
        }

        if (checkId === 'cte-hs1-emergentes') {
          return {
            ...prev,
            singularElements: prev.singularElements.map((s) => ({
              ...s,
              flashingHeight: Math.max(0.25, s.flashingHeight),
            })),
          };
        }

        if (checkId === 'cte-sua1-peto') {
          return {
            ...prev,
            bodies: prev.bodies.map((b) => ({
              ...b,
              parapetHeight: Math.max(1.1, b.parapetHeight),
            })),
          };
        }

        return prev;
      });
    },
    [commitProject, solved]
  );

  const value: RoofContextValue = {
    project,
    solved,
    savedProjects,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    viewMode,
    activeCategory,
    activeSubTool,
    selectedEntity,
    highlightedPoint,
    learningMode,
    guidedStage,
    wavefrontStep,
    showWaterFlow,
    showRealisticFill2D,
    snapToGrid,
    gridStepM,
    renderStyle3D,
    cameraPreset3D,
    sunAzimuthDeg,
    sunElevationDeg,
    explodeFactor,
    replanteoMode,
    manualEdges,
    manualCheckActive,
    revealedHintCount,
    gradingReport,
    setViewMode,
    setReplanteoMode,
    addManualEdge,
    removeManualEdge,
    clearManualEdges,
    runManualCheck,
    revealNextHint,
    autoSolveReplanteo,
    autoFixNormativeRule,
    setActiveCategory,
    setActiveSubTool,
    setSelectedEntity,
    setHighlightedPoint,
    setLearningMode,
    setGuidedStage,
    setWavefrontStep,
    setShowWaterFlow,
    setShowRealisticFill2D,
    setSnapToGrid,
    setGridStepM,
    setRenderStyle3D,
    setCameraPreset3D,
    setSunAzimuthDeg,
    setSunElevationDeg,
    setExplodeFactor,
    undo,
    redo,
    loadProject,
    createNewProject,
    saveCurrentProject,
    updateProjectMeta,
    rescaleEntireProject,
    clearToBlankCanvas,
    insertVertexOnEdge,
    setPerimeterEdgeLength,
    moveVertex,
    addBody,
    replacePrimaryBody,
    addHoleToBody,
    updateEdgeConfig,
    updateFaceSlopeByFaceId,
    updateBodyDrainElevation,
    updateSectionLine,
    setUnderlay,
    setRoofSystem,
    setHasWaterproofing,
    setFlatRoofUsage,
    setParapetHeight,
    updateTileSpec,
    updateLayer,
    addLayer,
    removeLayer,
    addDrain,
    moveDrain,
    updateDrain,
    removeDrain,
    addDownspout,
    moveDownspout,
    updateDownspout,
    removeDownspout,
    addSingular,
    moveSingular,
    updateSingular,
    removeSingular,
    setLocation,
  };

  return React.createElement(RoofContext.Provider, { value }, children);
};

export function useRoofStore(): RoofContextValue {
  const ctx = useContext(RoofContext);
  if (!ctx) throw new Error('useRoofStore must be used inside RoofProvider');
  return ctx;
}

export function formatLength(meters: number, units: UnitSystem, decimals = 2): string {
  if (units === 'cm') return `${(meters * 100).toFixed(Math.max(0, decimals - 1))} cm`;
  if (units === 'mm') return `${Math.round(meters * 1000)} mm`;
  return `${meters.toFixed(decimals)} m`;
}

export function formatRawLength(meters: number, units: UnitSystem): string {
  if (units === 'cm') return (meters * 100).toFixed(1);
  if (units === 'mm') return String(Math.round(meters * 1000));
  return meters.toFixed(2);
}
