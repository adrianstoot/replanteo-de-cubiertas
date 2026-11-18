import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatRawLength, useRoofStore } from '../../store/useRoofStore';
import type { Point2D, RoofBody } from '../../types/roof';
import { polygonToRoofBody } from '../../engine/importers/dxfSvgImporter';
import { dist2, distancePointToSegment2D, norm2, perpLeft, pointInPolygon2D, polygonArea2D, sub2 } from '../../engine/math/vec';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3x3,
  Droplets,
  Layers,
  PenTool,
  Eraser,
  Undo2,
  Check,
  Compass,
  Sparkles,
  CheckCircle2,
  Lightbulb,
  Trash2,
} from 'lucide-react';

export const Canvas2D: React.FC = () => {
  const {
    project,
    solved,
    activeSubTool,
    setActiveSubTool,
    viewMode,
    selectedEntity,
    setSelectedEntity,
    highlightedPoint,
    wavefrontStep,
    showWaterFlow,
    setShowWaterFlow,
    showRealisticFill2D,
    setShowRealisticFill2D,
    snapToGrid,
    setSnapToGrid,
    gridStepM,
    clearToBlankCanvas,
    insertVertexOnEdge,
    setPerimeterEdgeLength,
    moveVertex,
    moveDrain,
    moveDownspout,
    moveSingular,
    addDrain,
    addDownspout,
    addSingular,
    addBody,
    addHoleToBody,
    updateEdgeConfig,
    updateSectionLine,
    replanteoMode,
    setReplanteoMode,
    manualEdges,
    addManualEdge,
    removeManualEdge,
    clearManualEdges,
    runManualCheck,
    revealedHintCount,
    revealNextHint,
    autoSolveReplanteo,
    gradingReport,
  } = useRoofStore();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState(40);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 6, y: 4.5 });
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  const [drawingPts, setDrawingPts] = useState<Point2D[]>([]);
  const [manualLineStart, setManualLineStart] = useState<Point2D | null>(null);
  const [typedLengthBuf, setTypedLengthBuf] = useState<string>('');
  const [measurePts, setMeasurePts] = useState<Point2D[]>([]);
  const [editingDimEdge, setEditingDimEdge] = useState<null | {
    bodyId: string;
    edgeIndex: number;
    val: string;
  }>(null);
  const [hoverTip, setHoverTip] = useState<string | null>(null);
  const [alignGuide, setAlignGuide] = useState<{ x?: number; y?: number }>({});

  const [dragState, setDragState] = useState<
    | null
    | { kind: 'pan'; startClientX: number; startClientY: number; startPanX: number; startPanY: number }
    | { kind: 'vertex'; bodyId: string; vertexId: string; holeId?: string }
    | { kind: 'drain'; drainId: string }
    | { kind: 'downspout'; downspoutId: string }
    | { kind: 'singular'; singularId: string }
    | { kind: 'section_p1' }
    | { kind: 'section_p2' }
  >(null);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    if (project.bodies.length === 0) {
      setZoom(42);
      setPan({ x: 6, y: 4.5 });
      return;
    }
    const b = solved.bounds2D;
    const wM = Math.max(4, b.maxX - b.minX);
    const hM = Math.max(4, b.maxY - b.minY);
    const padFactor = 0.64;
    const z = Math.min((rect.width * padFactor) / wM, (rect.height * padFactor) / hM);
    setZoom(Math.max(12, Math.min(120, z)));
    setPan({ x: (b.minX + b.maxX) * 0.5, y: (b.minY + b.maxY) * 0.5 });
  }, [project.bodies.length, solved.bounds2D]);

  useEffect(() => {
    fitView();
  }, [project.id, fitView]);

  const isDrawingMode =
    activeSubTool === 'draw_polygon' ||
    activeSubTool === 'add_body' ||
    activeSubTool === 'draw_hole';

  const isManualLineTool =
    activeSubTool === 'draw_cumbrera' ||
    activeSubTool === 'draw_limatesa' ||
    activeSubTool === 'draw_limahoya';

  const expectedInteriorEdges = useMemo(
    () =>
      solved.edges.filter(
        (e) => e.type === 'cumbrera' || e.type === 'limatesa' || e.type === 'limahoya'
      ),
    [solved.edges]
  );

  // Pairwise intersection points between existing student manual lines (for exact bisectrix junctions!)
  const manualIntersections = useMemo(() => {
    const pts: Point2D[] = [];
    for (let i = 0; i < manualEdges.length; i++) {
      for (let j = i + 1; j < manualEdges.length; j++) {
        const a = manualEdges[i];
        const b = manualEdges[j];
        const x1 = a.p1.x, y1 = a.p1.y, x2 = a.p2.x, y2 = a.p2.y;
        const x3 = b.p1.x, y3 = b.p1.y, x4 = b.p2.x, y4 = b.p2.y;
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(den) < 1e-6) continue;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
        if (t >= -0.2 && t <= 1.2 && u >= -0.2 && u <= 1.2) {
          pts.push({
            x: Number((x1 + t * (x2 - x1)).toFixed(3)),
            y: Number((y1 + t * (y2 - y1)).toFixed(3)),
          });
        }
      }
    }
    return pts;
  }, [manualEdges]);

  const snapDrawingPoint = useCallback(
    (raw: Point2D): Point2D => {
      let best = { ...raw };
      const guides: { x?: number; y?: number } = {};
      const snapR = 14 / zoom;

      // 1. Snap to first point to close polygon cleanly
      if (drawingPts.length >= 3 && dist2(raw, drawingPts[0]) < snapR) {
        setAlignGuide({});
        return { ...drawingPts[0] };
      }

      // 2. Snap to existing body vertices & hole vertices
      for (const b of project.bodies) {
        for (const v of b.outerLoop) {
          if (dist2(raw, v) < snapR) {
            setAlignGuide({});
            return { x: v.x, y: v.y };
          }
        }
        for (const h of b.holes) {
          for (const v of h.vertices) {
            if (dist2(raw, v) < snapR) {
              setAlignGuide({});
              return { x: v.x, y: v.y };
            }
          }
        }
      }

      // 3. Snap to existing manual edge endpoints & pairwise intersections when tracing replanteo
      if (isManualLineTool) {
        for (const me of manualEdges) {
          if (dist2(raw, me.p1) < snapR) {
            setAlignGuide({});
            return { ...me.p1 };
          }
          if (dist2(raw, me.p2) < snapR) {
            setAlignGuide({});
            return { ...me.p2 };
          }
        }
        for (const ip of manualIntersections) {
          if (dist2(raw, ip) < snapR) {
            setAlignGuide({});
            return { ...ip };
          }
        }
      }

      // 4. Smart 45° / 90° bisectrix lock when drawing polygon OR manual replanteo line
      const anchor = isDrawingMode && drawingPts.length > 0
        ? drawingPts[drawingPts.length - 1]
        : isManualLineTool && manualLineStart
          ? manualLineStart
          : null;

      if (anchor) {
        const dx = raw.x - anchor.x;
        const dy = raw.y - anchor.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.12) {
          const angDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
          const nearest45 = Math.round(angDeg / 45) * 45;
          if (Math.abs(angDeg - nearest45) < 8) {
            const rad = (nearest45 * Math.PI) / 180;
            best = {
              x: anchor.x + Math.cos(rad) * len,
              y: anchor.y + Math.sin(rad) * len,
            };
          }
        }
        // When drawing a manual bisectrix ray, snap onto exact intersection with another drawn line!
        if (isManualLineTool && manualLineStart) {
          for (const me of manualEdges) {
            const x1 = manualLineStart.x, y1 = manualLineStart.y, x2 = best.x, y2 = best.y;
            const x3 = me.p1.x, y3 = me.p1.y, x4 = me.p2.x, y4 = me.p2.y;
            const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
            if (Math.abs(den) < 1e-6) continue;
            const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
            if (t > 0.05) {
              const ix = x1 + t * (x2 - x1);
              const iy = y1 + t * (y2 - y1);
              if (Math.hypot(ix - raw.x, iy - raw.y) < 18 / zoom) {
                setAlignGuide({});
                return { x: Number(ix.toFixed(3)), y: Number(iy.toFixed(3)) };
              }
            }
          }
        }
      }

      // 5. Alignment guides to X or Y of any placed drawing point (great for closing exact rectangles/Ls!)
      for (const dp of drawingPts) {
        if (Math.abs(best.x - dp.x) < 10 / zoom) {
          best.x = dp.x;
          guides.x = dp.x;
        }
        if (Math.abs(best.y - dp.y) < 10 / zoom) {
          best.y = dp.y;
          guides.y = dp.y;
        }
      }

      // 6. Grid snap
      if (snapToGrid) {
        if (guides.x === undefined) best.x = Math.round(best.x / gridStepM) * gridStepM;
        if (guides.y === undefined) best.y = Math.round(best.y / gridStepM) * gridStepM;
      }

      setAlignGuide(guides);
      return { x: Number(best.x.toFixed(3)), y: Number(best.y.toFixed(3)) };
    },
    [
      drawingPts,
      gridStepM,
      isDrawingMode,
      isManualLineTool,
      manualEdges,
      manualIntersections,
      manualLineStart,
      project.bodies,
      snapToGrid,
      zoom,
    ]
  );

  const finishPolygonDrawing = useCallback(
    (pts: Point2D[]) => {
      if (pts.length < 3) return;
      const wasHole = activeSubTool === 'draw_hole';
      if (wasHole) {
        const targetBody =
          project.bodies.find((b) => pointInPolygon2D(pts[0], b.outerLoop, false)) ||
          project.bodies[0];
        if (targetBody) {
          addHoleToBody(targetBody.id, pts, `Patio ${targetBody.holes.length + 1}`);
        }
      } else {
        const newBody: RoofBody = polygonToRoofBody(
          pts,
          `body-${Date.now()}`,
          `Cuerpo ${project.bodies.length + 1}`,
          project.isFlatRoofMode ? 2 : 30,
          project.bodies[0]?.defaultEaveHeight ?? 3.5
        );
        addBody(newBody);
        setSelectedEntity({ kind: 'body', bodyId: newBody.id });
      }
      setDrawingPts([]);
      setTypedLengthBuf('');
      setAlignGuide({});
      setManualLineStart(null);
      if (replanteoMode === 'manual' && !wasHole) {
        setActiveSubTool('draw_limatesa');
      } else {
        setActiveSubTool('select');
      }
    },
    [
      activeSubTool,
      addBody,
      addHoleToBody,
      project.bodies,
      project.isFlatRoofMode,
      replanteoMode,
      setActiveSubTool,
      setSelectedEntity,
    ]
  );

  // Direct CAD keyboard distance typing while drawing!
  useEffect(() => {
    if (!isDrawingMode && !isManualLineTool) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'Escape') {
        setDrawingPts([]);
        setManualLineStart(null);
        setTypedLengthBuf('');
        setActiveSubTool('select');
        return;
      }
      if (!isDrawingMode) return;
      if (/^[0-9.,]$/.test(e.key)) {
        e.preventDefault();
        setTypedLengthBuf((prev) => prev + (e.key === ',' ? '.' : e.key));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (typedLengthBuf.length > 0) {
          setTypedLengthBuf((prev) => prev.slice(0, -1));
        } else {
          setDrawingPts((prev) => prev.slice(0, -1));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const distVal = parseFloat(typedLengthBuf);
        if (!Number.isNaN(distVal) && distVal > 0 && drawingPts.length > 0 && cursorWorld) {
          const prev = drawingPts[drawingPts.length - 1];
          const dx = cursorWorld.x - prev.x;
          const dy = cursorWorld.y - prev.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = len > 1e-4 ? dx / len : 1;
          const uy = len > 1e-4 ? dy / len : 0;
          const nextPt = {
            x: Number((prev.x + ux * distVal).toFixed(3)),
            y: Number((prev.y + uy * distVal).toFixed(3)),
          };
          if (drawingPts.length >= 3 && dist2(nextPt, drawingPts[0]) < 0.2) {
            finishPolygonDrawing(drawingPts);
          } else {
            setDrawingPts((p) => [...p, nextPt]);
          }
          setTypedLengthBuf('');
        } else if (drawingPts.length >= 3) {
          finishPolygonDrawing(drawingPts);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    cursorWorld,
    drawingPts,
    finishPolygonDrawing,
    isDrawingMode,
    isManualLineTool,
    setActiveSubTool,
    typedLengthBuf,
  ]);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point2D => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const sx = clientX - rect.left - rect.width * 0.5;
      const sy = clientY - rect.top - rect.height * 0.5;
      return {
        x: pan.x + sx / zoom,
        y: pan.y - sy / zoom,
      };
    },
    [pan, zoom]
  );

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(8, Math.min(220, z * factor)));
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      setDragState({
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      });
      return;
    }

    if (e.button !== 0) return;
    const rawW = clientToWorld(e.clientX, e.clientY);
    const w = snapDrawingPoint(rawW);

    if (isDrawingMode) {
      if (drawingPts.length >= 3 && dist2(w, drawingPts[0]) < 16 / zoom) {
        finishPolygonDrawing(drawingPts);
        return;
      }
      setDrawingPts((prev) => [...prev, w]);
      setTypedLengthBuf('');
      return;
    }

    if (isManualLineTool) {
      const kind =
        activeSubTool === 'draw_cumbrera'
          ? 'cumbrera'
          : activeSubTool === 'draw_limahoya'
            ? 'limahoya'
            : 'limatesa';
      if (!manualLineStart) {
        setManualLineStart(w);
      } else {
        if (dist2(manualLineStart, w) >= 0.15) {
          addManualEdge(kind, manualLineStart, w);
        }
        setManualLineStart(null);
      }
      return;
    }

    if (activeSubTool === 'measure_dim') {
      setMeasurePts((prev) => (prev.length >= 2 ? [w] : [...prev, w]));
      return;
    }

    if (activeSubTool === 'place_sumidero' || activeSubTool === 'place_rebosadero') {
      const kind = activeSubTool === 'place_rebosadero' ? 'rebosadero' : 'sumidero';
      const targetBody = project.bodies.find((b) => pointInPolygon2D(w, b.outerLoop, true));
      addDrain({
        id: `dr-${Date.now()}`,
        kind,
        x: w.x,
        y: w.y,
        bodyId: targetBody?.id,
        diameterMm: kind === 'rebosadero' ? 75 : 110,
        label: `${kind === 'rebosadero' ? 'R' : 'S'}${project.drains.length + 1}`,
      });
      setActiveSubTool('select');
      return;
    }

    if (activeSubTool === 'place_downspout') {
      addDownspout({
        id: `ds-${Date.now()}`,
        x: w.x,
        y: w.y,
        diameterMm: 90,
        kind: 'exterior',
        label: `B${project.downspouts.length + 1} Ø90`,
      });
      setActiveSubTool('select');
      return;
    }

    if (
      activeSubTool === 'place_chimney' ||
      activeSubTool === 'place_shunt' ||
      activeSubTool === 'place_skylight' ||
      activeSubTool === 'place_duct'
    ) {
      const kindMap = {
        place_chimney: 'chimenea',
        place_shunt: 'shunt',
        place_skylight: 'lucernario',
        place_duct: 'conducto',
      } as const;
      const k = kindMap[activeSubTool];
      addSingular({
        id: `sg-${Date.now()}`,
        kind: k,
        x: w.x,
        y: w.y,
        width: k === 'lucernario' ? 1.2 : k === 'shunt' ? 0.45 : 0.65,
        depth: k === 'lucernario' ? 1.4 : k === 'shunt' ? 0.45 : 0.65,
        heightAboveRoof: k === 'lucernario' ? 0.3 : 1.0,
        flashingHeight: 0.28,
        rotationDeg: 0,
        label: `${k.charAt(0).toUpperCase() + k.slice(1)} ${project.singularElements.length + 1}`,
      });
      setActiveSubTool('select');
      return;
    }

    setDragState({
      kind: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    });
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rawW = clientToWorld(e.clientX, e.clientY);
    const w = snapDrawingPoint(rawW);
    setCursorWorld(w);

    if (!dragState) return;
    if (dragState.kind === 'pan') {
      const dx = (e.clientX - dragState.startClientX) / zoom;
      const dy = (e.clientY - dragState.startClientY) / zoom;
      setPan({ x: dragState.startPanX - dx, y: dragState.startPanY + dy });
    } else if (dragState.kind === 'vertex') {
      moveVertex(dragState.bodyId, dragState.vertexId, w.x, w.y, dragState.holeId, false);
    } else if (dragState.kind === 'drain') {
      moveDrain(dragState.drainId, w.x, w.y);
    } else if (dragState.kind === 'downspout') {
      moveDownspout(dragState.downspoutId, w.x, w.y);
    } else if (dragState.kind === 'singular') {
      moveSingular(dragState.singularId, w.x, w.y);
    } else if (dragState.kind === 'section_p1') {
      updateSectionLine({ ...project.sectionLine, p1: w });
    } else if (dragState.kind === 'section_p2') {
      updateSectionLine({ ...project.sectionLine, p2: w });
    }
  };

  const [svgDims, setSvgDims] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const ent of entries) {
        setSvgDims({
          width: Math.max(100, ent.contentRect.width),
          height: Math.max(100, ent.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const viewBox = useMemo(() => {
    const halfW = svgDims.width / (2 * zoom);
    const halfH = svgDims.height / (2 * zoom);
    return `${(pan.x - halfW).toFixed(4)} ${(-pan.y - halfH).toFixed(4)} ${(halfW * 2).toFixed(4)} ${(halfH * 2).toFixed(4)}`;
  }, [pan, svgDims, zoom]);

  const b = solved.bounds2D;
  const px = (pixels: number) => pixels / zoom;

  const activeWaveSnapshot =
    wavefrontStep !== null && solved.wavefrontSnapshots[wavefrontStep]
      ? solved.wavefrontSnapshots[wavefrontStep]
      : null;

  const gridLines = useMemo(() => {
    const halfW = svgDims.width / (2 * zoom);
    const halfH = svgDims.height / (2 * zoom);
    const step = zoom < 22 ? 2 : zoom < 45 ? 1 : 0.5;
    const minX = Math.floor((pan.x - halfW) / step) * step;
    const maxX = Math.ceil((pan.x + halfW) / step) * step;
    const minY = Math.floor((pan.y - halfH) / step) * step;
    const maxY = Math.ceil((pan.y + halfH) / step) * step;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = minX; x <= maxX && xs.length < 150; x += step) xs.push(Number(x.toFixed(3)));
    for (let y = minY; y <= maxY && ys.length < 150; y += step) ys.push(Number(y.toFixed(3)));
    return { xs, ys, minX, maxX, minY, maxY };
  }, [pan, svgDims, zoom]);

  const patternId = `roof-pat-${project.systemId}`;
  const isSlate = project.systemId === 'pizarra';
  const isMetal = ['zinc', 'chapa_metalica', 'panel_sandwich'].includes(project.systemId);
  const isFlatTile = ['invertida_transitable', 'plana_transitable'].includes(project.systemId);
  const isGarden = project.systemId === 'ajardinada';

  // Live rubberband length & angle while drawing
  const liveDrawMetrics = useMemo(() => {
    if (!isDrawingMode || drawingPts.length === 0 || !cursorWorld) return null;
    const prev = drawingPts[drawingPts.length - 1];
    const len = dist2(prev, cursorWorld);
    let deg = (Math.atan2(cursorWorld.y - prev.y, cursorWorld.x - prev.x) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const previewArea =
      drawingPts.length >= 2 ? polygonArea2D([...drawingPts, cursorWorld]) : 0;
    return { len, deg, previewArea, prev };
  }, [cursorWorld, drawingPts, isDrawingMode]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#ffffff] overflow-hidden select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Floating CAD Toolbar (Single crisp compact row) */}
      <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-0.5 bg-[#161e2b]/95 backdrop-blur border border-[#2c3a4f] rounded-md px-1.5 py-1 text-[11px] text-slate-200 shadow-lg max-w-[calc(100%-20px)] overflow-x-auto whitespace-nowrap">
        <button
          onClick={() => {
            setDrawingPts([]);
            setManualLineStart(null);
            clearToBlankCanvas();
          }}
          title="Borrar plano actual y empezar a dibujar desde cero en modo práctica manual"
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm shrink-0"
        >
          <Eraser className="w-3 h-3" />
          <span>Desde cero</span>
        </button>

        <button
          onClick={() => {
            setDrawingPts([]);
            setManualLineStart(null);
            setActiveSubTool(isDrawingMode ? 'select' : 'draw_polygon');
          }}
          title="Dibujar perímetro o añadir nuevo cuerpo en planta"
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition shrink-0 ${
            isDrawingMode
              ? 'bg-blue-600 text-white font-semibold'
              : 'hover:bg-[#273549] text-slate-200'
          }`}
        >
          <PenTool className="w-3 h-3" />
          <span>Dibujar</span>
        </button>

        <button
          onClick={() => {
            setManualLineStart(null);
            if (replanteoMode === 'manual') {
              autoSolveReplanteo();
            } else {
              setReplanteoMode('manual');
              setActiveSubTool('draw_limatesa');
            }
          }}
          title="Alternar entre práctica manual de replanteo y resolución matemática automática"
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition shrink-0 ${
            replanteoMode === 'manual'
              ? 'bg-amber-600 text-white font-semibold'
              : 'bg-[#212c3d] hover:bg-[#2a3950] text-slate-200'
          }`}
        >
          {replanteoMode === 'manual' ? (
            <>
              <Compass className="w-3 h-3" />
              <span>Práctica Manual</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 text-blue-300" />
              <span>Automático</span>
            </>
          )}
        </button>

        <div className="w-px h-3.5 bg-slate-700 mx-0.5 shrink-0" />

        <button onClick={() => setZoom((z) => Math.min(220, z * 1.2))} title="Acercar" className="p-1 hover:bg-[#273549] rounded shrink-0">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(8, z * 0.82))} title="Alejar" className="p-1 hover:bg-[#273549] rounded shrink-0">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={fitView} title="Encuadrar planta" className="p-1 hover:bg-[#273549] rounded shrink-0">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-3.5 bg-slate-700 mx-0.5 shrink-0" />

        <button
          onClick={() => setSnapToGrid(!snapToGrid)}
          title="Ajuste a cuadrícula (Snap)"
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0 ${
            snapToGrid ? 'bg-blue-600/30 text-blue-300' : 'text-slate-400 hover:bg-[#273549]'
          }`}
        >
          <Grid3x3 className="w-3.5 h-3.5" />
          <span className="hidden 2xl:inline">Snap</span>
        </button>
        <button
          onClick={() => setShowRealisticFill2D(!showRealisticFill2D)}
          title="Alternar tramado material realista"
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0 ${
            showRealisticFill2D ? 'bg-amber-600/30 text-amber-200' : 'text-slate-400 hover:bg-[#273549]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden 2xl:inline">Textura</span>
        </button>
        <button
          onClick={() => setShowWaterFlow(!showWaterFlow)}
          title="Animación de flujo y escorrentía"
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0 ${
            showWaterFlow ? 'bg-cyan-600/30 text-cyan-200' : 'text-slate-400 hover:bg-[#273549]'
          }`}
        >
          <Droplets className="w-3.5 h-3.5" />
          <span className="hidden 2xl:inline">Flujo</span>
        </button>
      </div>

      {/* Empty Canvas Student Onboarding Card */}
      {project.bodies.length === 0 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-[#151e2c]/95 border border-emerald-500/60 rounded-xl px-4 py-3 text-xs text-slate-100 shadow-2xl max-w-md pointer-events-none text-center space-y-1">
          <div className="font-bold text-emerald-300 text-sm">
            Lienzo en Blanco · Dibuja el Perímetro para Practicar
          </div>
          <p className="text-slate-300">
            1. Clic para situar vértices (o escribe <strong className="text-white">metros + Enter</strong>). · 2. Cierra el contorno en el punto verde. · 3. <strong className="text-amber-300">Traza tú mismo las limatesas y cumbrera</strong> y comprueba tu resultado.
          </p>
        </div>
      )}

      {/* Manual Replanteo Practice Dock (Crisp 1-row floating strip clear of N compass and Leyenda) */}
      {replanteoMode === 'manual' && project.bodies.length > 0 && !isDrawingMode && (
        <div className="absolute top-11 left-2.5 z-20 bg-[#151e2c]/95 backdrop-blur border border-amber-500/50 rounded-md px-1.5 py-0.5 text-[10px] text-slate-100 shadow-xl flex flex-nowrap items-center gap-0.5 max-w-[calc(100%-20px)] overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => {
              setManualLineStart(null);
              setActiveSubTool('draw_limatesa');
            }}
            className={`px-1.5 py-0.5 rounded font-semibold transition shrink-0 ${
              activeSubTool === 'draw_limatesa'
                ? 'bg-amber-600 text-white'
                : 'bg-[#222e40] hover:bg-[#2c3b52] text-amber-200'
            }`}
          >
            Limatesa
          </button>
          <button
            onClick={() => {
              setManualLineStart(null);
              setActiveSubTool('draw_cumbrera');
            }}
            className={`px-1.5 py-0.5 rounded font-semibold transition shrink-0 ${
              activeSubTool === 'draw_cumbrera'
                ? 'bg-red-600 text-white'
                : 'bg-[#222e40] hover:bg-[#2c3b52] text-red-200'
            }`}
          >
            Cumbrera
          </button>
          <button
            onClick={() => {
              setManualLineStart(null);
              setActiveSubTool('draw_limahoya');
            }}
            className={`px-1.5 py-0.5 rounded font-semibold transition shrink-0 ${
              activeSubTool === 'draw_limahoya'
                ? 'bg-sky-600 text-white'
                : 'bg-[#222e40] hover:bg-[#2c3b52] text-sky-200'
            }`}
          >
            Limahoya
          </button>

          <div className="w-px h-3.5 bg-slate-700 mx-0.5 shrink-0" />

          <button
            onClick={runManualCheck}
            className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shrink-0"
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Comprobar</span>
          </button>

          <button
            onClick={revealNextHint}
            disabled={revealedHintCount >= expectedInteriorEdges.length}
            title="Revelar una línea guía del esqueleto recto"
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium shrink-0"
          >
            <Lightbulb className="w-3 h-3" />
            <span>{Math.min(revealedHintCount, expectedInteriorEdges.length)}/{expectedInteriorEdges.length}</span>
          </button>

          {manualEdges.length > 0 && (
            <button
              onClick={() => {
                setManualLineStart(null);
                clearManualEdges();
              }}
              title="Borrar líneas manuales trazadas"
              className="p-0.5 rounded bg-slate-800 hover:bg-rose-900/70 text-slate-300 shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={autoSolveReplanteo}
            className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            <span>Solución</span>
          </button>

          {gradingReport && (
            <span
              className={`ml-0.5 px-1.5 py-0.5 rounded font-bold shrink-0 ${
                gradingReport.scorePct >= 99 && gradingReport.missingCount === 0
                  ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/50'
                  : 'bg-amber-950/90 text-amber-200 border border-amber-500/50'
              }`}
              title={gradingReport.summaryMessage}
            >
              {gradingReport.scorePct}% ({gradingReport.correctCount}/{gradingReport.totalExpected})
            </span>
          )}
        </div>
      )}

      {/* Active Drawing Mode Floating Controls */}
      {isDrawingMode && (
        <div className="absolute bottom-14 left-3 z-20 bg-[#151e2c]/95 border border-blue-500/60 rounded-lg px-3 py-2 text-xs text-slate-100 shadow-xl flex items-center gap-2.5">
          <div>
            <span className="font-bold text-blue-300">
              {activeSubTool === 'draw_hole' ? 'Trazando Patio Interior' : 'Trazando Contorno'}
            </span>
            <span className="text-slate-400 ml-2">({drawingPts.length} vértices)</span>
            {typedLengthBuf && (
              <span className="ml-2 px-1.5 py-0.5 bg-amber-600 text-white rounded font-mono font-bold">
                L = {typedLengthBuf} m (Enter)
              </span>
            )}
          </div>
          {drawingPts.length > 0 && (
            <button
              onClick={() => setDrawingPts((p) => p.slice(0, -1))}
              className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
              title="Deshacer último vértice"
            >
              <Undo2 className="w-3 h-3" />
            </button>
          )}
          <button
            disabled={drawingPts.length < 3}
            onClick={() => finishPolygonDrawing(drawingPts)}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 disabled:bg-slate-700 hover:bg-emerald-500 text-white rounded font-semibold"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Cerrar y Calcular</span>
          </button>
          <button
            onClick={() => {
              setDrawingPts([]);
              setTypedLengthBuf('');
              setActiveSubTool('select');
            }}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Inline Dimension Length Editor Popover */}
      {editingDimEdge && (
        <div className="absolute top-14 right-14 z-30 bg-[#161e2b] border border-blue-500 rounded-lg p-2.5 shadow-xl text-xs flex items-center gap-2">
          <span className="text-slate-300">Longitud tramo (m):</span>
          <input
            autoFocus
            type="number"
            step={0.1}
            value={editingDimEdge.val}
            onChange={(e) => setEditingDimEdge({ ...editingDimEdge, val: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPerimeterEdgeLength(
                  editingDimEdge.bodyId,
                  editingDimEdge.edgeIndex,
                  parseFloat(editingDimEdge.val)
                );
                setEditingDimEdge(null);
              } else if (e.key === 'Escape') {
                setEditingDimEdge(null);
              }
            }}
            className="w-20 bg-[#0e141d] border border-slate-600 rounded px-2 py-1 font-mono text-white"
          />
          <button
            onClick={() => {
              setPerimeterEdgeLength(
                editingDimEdge.bodyId,
                editingDimEdge.edgeIndex,
                parseFloat(editingDimEdge.val)
              );
              setEditingDimEdge(null);
            }}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold"
          >
            OK
          </button>
        </div>
      )}

      {/* Contextual Student Micro-Tooltip (Bottom-center sleek pill, never covering top dimension lines) */}
      {hoverTip && !isDrawingMode && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 pointer-events-none bg-[#141c28]/92 backdrop-blur border border-slate-500/60 rounded-full px-3.5 py-1 text-[11px] text-slate-100 shadow-lg max-w-[90%] truncate">
          {hoverTip}
        </div>
      )}

      {/* Main Architectural Vector SVG Canvas */}
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full cursor-crosshair"
        onWheel={handleWheel}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={() => setDragState(null)}
        onMouseLeave={() => {
          setDragState(null);
          setHoverTip(null);
        }}
      >
        <defs>
          {/* Refined Warm Architectural Terracotta Tile Courses */}
          <pattern id="roof-pat-teja_mixta" width="0.26" height="0.36" patternUnits="userSpaceOnUse">
            <rect width="0.26" height="0.36" fill="#d98057" />
            <path d="M0 0.36 H0.26" stroke="#9e4827" strokeWidth="0.018" />
            <path d="M0.13 0 V0.36" stroke="#b95d36" strokeWidth="0.014" />
            <rect x="0.02" y="0.02" width="0.09" height="0.32" fill="#e5936d" opacity="0.45" />
          </pattern>
          <pattern id="roof-pat-teja_curva" width="0.22" height="0.38" patternUnits="userSpaceOnUse">
            <rect width="0.22" height="0.38" fill="#d2764c" />
            <path d="M0 0.38 H0.22" stroke="#964220" strokeWidth="0.02" />
            <path d="M0.11 0 V0.38" stroke="#ab4f29" strokeWidth="0.02" />
            <rect x="0.02" y="0" width="0.06" height="0.38" fill="#e6946e" opacity="0.38" />
          </pattern>
          <pattern id="roof-pat-teja_plana" width="0.26" height="0.36" patternUnits="userSpaceOnUse">
            <rect width="0.26" height="0.36" fill="#c76d49" />
            <path d="M0 0.36 H0.26 M0.13 0 V0.36" stroke="#8c3f21" strokeWidth="0.016" />
          </pattern>
          <pattern id="roof-pat-teja_encaje" width="0.24" height="0.34" patternUnits="userSpaceOnUse">
            <rect width="0.24" height="0.34" fill="#b35f46" />
            <path d="M0 0.34 H0.24 M0.12 0 V0.34" stroke="#7d3824" strokeWidth="0.016" />
          </pattern>
          <pattern id="roof-pat-pizarra" width="0.24" height="0.24" patternUnits="userSpaceOnUse">
            <rect width="0.24" height="0.24" fill="#46505c" />
            <path d="M0 0.12 H0.24 M0 0.24 H0.24 M0.12 0 V0.12 M0 0.12 V0.24" stroke="#252c34" strokeWidth="0.015" />
          </pattern>
          <pattern id="roof-pat-metal" width="0.45" height="0.45" patternUnits="userSpaceOnUse">
            <rect width="0.45" height="0.45" fill="#d4dde7" />
            <path d="M0.225 0 V0.45" stroke="#78889a" strokeWidth="0.02" />
          </pattern>
          <pattern id="roof-pat-flat" width="0.55" height="0.55" patternUnits="userSpaceOnUse">
            <rect width="0.55" height="0.55" fill="#eeebe4" />
            <path d="M0 0.55 H0.55 M0.55 0 V0.55" stroke="#ccc6ba" strokeWidth="0.014" />
          </pattern>
          <pattern id="roof-pat-ajardinada" width="0.42" height="0.42" patternUnits="userSpaceOnUse">
            <rect width="0.42" height="0.42" fill="#d9ead3" />
            <circle cx="0.14" cy="0.16" r="0.022" fill="#6aa84f" opacity="0.6" />
            <circle cx="0.31" cy="0.30" r="0.018" fill="#38761d" opacity="0.5" />
          </pattern>

          {/* Per-face Slope-Aligned Tile/Seam Patterns (perpendicular to water flow!) */}
          {solved.faces.map((face) => {
            const basePat = isMetal
              ? 'roof-pat-metal'
              : isFlatTile
                ? 'roof-pat-flat'
                : isGarden
                  ? 'roof-pat-ajardinada'
                  : isSlate
                    ? 'roof-pat-pizarra'
                    : patternId;
            if (face.slopePct <= 0.1 || isFlatTile || isGarden) return null;
            const rotDeg =
              (Math.atan2(-face.runoffDir2D.x, -face.runoffDir2D.y) * 180) / Math.PI;
            return (
              <pattern
                key={`pat-def-${face.id}`}
                id={`face-pat-${face.id}`}
                href={`#${basePat}`}
                patternUnits="userSpaceOnUse"
                patternTransform={`rotate(${rotDeg.toFixed(2)})`}
              />
            );
          })}

          <marker id="slope-arrow-clean" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0.5,0.8 L7.2,4 L0.5,7.2 L2.1,4 Z" fill="#0f172a" stroke="#ffffff" strokeWidth="0.65" strokeLinejoin="round" />
          </marker>
        </defs>

        {/* Subtle Architectural Drafting Grid */}
        <g opacity="0.22">
          {gridLines.xs.map((x) => (
            <line
              key={`gx-${x}`}
              x1={x}
              y1={-gridLines.maxY}
              x2={x}
              y2={-gridLines.minY}
              stroke={Math.abs(x % 5) < 0.01 ? '#cbd5e1' : '#e2e8f0'}
              strokeWidth={px(Math.abs(x % 5) < 0.01 ? 1.0 : 0.6)}
            />
          ))}
          {gridLines.ys.map((y) => (
            <line
              key={`gy-${y}`}
              x1={gridLines.minX}
              y1={-y}
              x2={gridLines.maxX}
              y2={-y}
              stroke={Math.abs(y % 5) < 0.01 ? '#cbd5e1' : '#e2e8f0'}
              strokeWidth={px(Math.abs(y % 5) < 0.01 ? 1.0 : 0.6)}
            />
          ))}
        </g>

        {/* Smart Alignment Guides when drawing */}
        {alignGuide.x !== undefined && (
          <line
            x1={alignGuide.x}
            y1={-gridLines.maxY}
            x2={alignGuide.x}
            y2={-gridLines.minY}
            stroke="#3b82f6"
            strokeWidth={px(1)}
            strokeDasharray={`${px(4)} ${px(4)}`}
          />
        )}
        {alignGuide.y !== undefined && (
          <line
            x1={gridLines.minX}
            y1={-alignGuide.y}
            x2={gridLines.maxX}
            y2={-alignGuide.y}
            stroke="#3b82f6"
            strokeWidth={px(1)}
            strokeDasharray={`${px(4)} ${px(4)}`}
          />
        )}

        {/* Underlay Reference */}
        {project.underlay && (
          <g opacity={project.underlay.opacity}>
            {project.underlay.kind === 'image' &&
              project.underlay.dataUrl &&
              project.underlay.naturalWidthPx &&
              project.underlay.naturalHeightPx && (
                <image
                  href={project.underlay.dataUrl}
                  x={project.underlay.offsetX}
                  y={-(project.underlay.offsetY + project.underlay.naturalHeightPx * project.underlay.metersPerPixel)}
                  width={project.underlay.naturalWidthPx * project.underlay.metersPerPixel}
                  height={project.underlay.naturalHeightPx * project.underlay.metersPerPixel}
                />
              )}
            {project.underlay.dxfSegments?.map((s, idx) => (
              <line
                key={`refseg-${idx}`}
                x1={s.x1 + project.underlay!.offsetX}
                y1={-(s.y1 + project.underlay!.offsetY)}
                x2={s.x2 + project.underlay!.offsetX}
                y2={-(s.y2 + project.underlay!.offsetY)}
                stroke="#64748b"
                strokeWidth={px(1.2)}
                strokeDasharray={`${px(4)} ${px(3)}`}
              />
            ))}
          </g>
        )}

        {/* Solved Faces (hidden in Manual Practice Mode so the student solves the roof themselves!) */}
        {replanteoMode === 'auto' &&
          (() => {
            const placedBoxes: { x: number; y: number; r: number }[] = [];
            return solved.faces.map((face) => {
              const pts = face.polygon2D.map((p) => `${p.x},${-p.y}`).join(' ');
              const isSelected = selectedEntity?.kind === 'face' && selectedEntity.faceId === face.id;

              let fillValue = '#f8ebe3';
              if (showRealisticFill2D) {
                if (face.slopePct > 0.1 && !isFlatTile && !isGarden) {
                  fillValue = `url(#face-pat-${face.id})`;
                } else if (isFlatTile) fillValue = 'url(#roof-pat-flat)';
                else if (isGarden) fillValue = 'url(#roof-pat-ajardinada)';
                else if (isMetal) fillValue = 'url(#roof-pat-metal)';
                else if (isSlate) fillValue = 'url(#roof-pat-pizarra)';
                else fillValue = `url(#${patternId})`;
              } else {
                fillValue = project.isFlatRoofMode ? '#f1f5f9' : '#faeee6';
              }

              // Compute High-Resolution Pole of Inaccessibility avoiding edges, skylights, chimneys, drains, and neighbor labels
              const poly = face.polygon2D;
              let minFX = Infinity;
              let maxFX = -Infinity;
              let minFY = Infinity;
              let maxFY = -Infinity;
              for (const p of poly) {
                if (p.x < minFX) minFX = p.x;
                if (p.x > maxFX) maxFX = p.x;
                if (p.y < minFY) minFY = p.y;
                if (p.y > maxFY) maxFY = p.y;
              }
              const evalEdgeClearance = (pt: Point2D) => {
                if (!pointInPolygon2D(pt, poly, false)) return -1;
                let md = Infinity;
                for (let k = 0; k < poly.length; k++) {
                  const d = distancePointToSegment2D(pt, poly[k], poly[(k + 1) % poly.length]);
                  if (d < md) md = d;
                }
                return md;
              };
              const evalObstacleClearance = (pt: Point2D) => {
                let md = Infinity;
                for (const sg of project.singularElements) {
                  const sgRad = Math.max(sg.width, sg.depth) * 0.56 + px(8);
                  const dSg = Math.hypot(pt.x - sg.x, pt.y - sg.y) - sgRad;
                  if (dSg < md) md = dSg;
                }
                for (const dr of project.drains) {
                  const dDr = Math.hypot(pt.x - dr.x, pt.y - dr.y) - px(10);
                  if (dDr < md) md = dDr;
                }
                for (const pb of placedBoxes) {
                  const dPb = Math.hypot(pt.x - pb.x, pt.y - pb.y) - pb.r;
                  if (dPb < md) md = dPb;
                }
                return md;
              };
              const evalPoleScore = (pt: Point2D) => {
                const de = evalEdgeClearance(pt);
                if (de < 0) return -1;
                const dobs = evalObstacleClearance(pt);
                return Math.min(de, dobs * 0.85);
              };

              let bestPt = face.centroid2D;
              let bestScore = evalPoleScore(bestPt);
              const steps = 8;
              for (let gx = 1; gx < steps; gx++) {
                for (let gy = 1; gy < steps; gy++) {
                  const cand = {
                    x: minFX + (gx / steps) * (maxFX - minFX),
                    y: minFY + (gy / steps) * (maxFY - minFY),
                  };
                  const sc = evalPoleScore(cand);
                  if (sc > bestScore) {
                    bestScore = sc;
                    bestPt = cand;
                  }
                }
              }
              // Fine local polish around bestPt
              const cellW = (maxFX - minFX) / steps;
              const cellH = (maxFY - minFY) / steps;
              for (let rx = -2; rx <= 2; rx++) {
                for (let ry = -2; ry <= 2; ry++) {
                  const cand = {
                    x: bestPt.x + (rx / 2) * cellW * 0.45,
                    y: bestPt.y + (ry / 2) * cellH * 0.45,
                  };
                  const sc = evalPoleScore(cand);
                  if (sc > bestScore) {
                    bestScore = sc;
                    bestPt = cand;
                  }
                }
              }

              const cx = bestPt.x;
              const cy = bestPt.y;
              const edgeRad = Math.max(0.18, evalEdgeClearance(bestPt));
              const safeRad = bestScore > 0 ? Math.min(edgeRad, bestScore) : edgeRad * 0.6;
              const isCompactFace = edgeRad < px(20) || face.projectedAreaM2 < 4.5;

              // In compact triangular bays, keep arrow shorter and pull center gently downslope so text sits cleanly upslope inside inscribed core
              const arrowLen = isCompactFace
                ? Math.min(0.65, Math.max(0.14, edgeRad * 0.46))
                : Math.min(1.22, Math.max(0.18, Math.min(edgeRad * 0.8, safeRad * 0.9)));
              const arrowCenterShift = isCompactFace ? edgeRad * 0.24 : 0;
              const axC = cx + face.runoffDir2D.x * arrowCenterShift;
              const ayC = cy + face.runoffDir2D.y * arrowCenterShift;
              const x1 = axC - face.runoffDir2D.x * (arrowLen * 0.42);
              const y1 = ayC - face.runoffDir2D.y * (arrowLen * 0.42);
              const x2 = axC + face.runoffDir2D.x * (arrowLen * 0.58);
              const y2 = ayC + face.runoffDir2D.y * (arrowLen * 0.58);

              // 2.5D solar shading (NW light source)
              const sunDot = face.runoffDir2D.x * -0.7 + face.runoffDir2D.y * 0.7;
              const shadeOverlay =
                face.slopePct < 0.1
                  ? 'transparent'
                  : sunDot > 0.25
                    ? 'rgba(255, 252, 240, 0.14)'
                    : sunDot < -0.25
                      ? 'rgba(15, 23, 42, 0.10)'
                      : 'transparent';

              // Scale font size strictly proportionally to clear inscribed radius
              const maxFontForRadius = (edgeRad * zoom) / (isCompactFace ? 1.55 : 1.15);
              const fontPx = Math.max(4.4, Math.min(10.5, maxFontForRadius));
              const slopeText =
                face.slopePct % 1 === 0
                  ? `${face.slopePct.toFixed(0)}%`
                  : isCompactFace
                    ? `${face.slopePct.toFixed(1)}%`
                    : `${face.slopePct.toFixed(2)}%`;

              const textHalfW = px(fontPx * slopeText.length * 0.34);
              const textHalfH = px(fontPx * 0.65);

              // Bound candidate shift distances inside edgeRad so small bay labels NEVER touch boundary lines
              const perp = { x: -face.runoffDir2D.y, y: face.runoffDir2D.x };
              const maxAllowedShift = edgeRad * 0.55;
              const offSide = Math.min(maxAllowedShift, Math.max(px(11), arrowLen * 0.42 + textHalfH));
              const offTail = Math.min(maxAllowedShift, Math.max(px(11), arrowLen * 0.56 + textHalfH));
              const compactShift = edgeRad * 0.28;
              const candidates: Point2D[] = isCompactFace
                ? [
                    { x: cx - face.runoffDir2D.x * compactShift, y: cy - face.runoffDir2D.y * compactShift },
                    { x: cx + perp.x * compactShift, y: cy + perp.y * compactShift },
                    { x: cx - perp.x * compactShift, y: cy - perp.y * compactShift },
                    { x: cx, y: cy },
                  ]
                : [
                    { x: cx + perp.x * offSide, y: cy + perp.y * offSide },
                    { x: cx - perp.x * offSide, y: cy - perp.y * offSide },
                    { x: cx - face.runoffDir2D.x * offTail, y: cy - face.runoffDir2D.y * offTail },
                    { x: cx + face.runoffDir2D.x * offTail, y: cy + face.runoffDir2D.y * offTail },
                    { x: cx + perp.x * Math.min(maxAllowedShift, px(18)), y: cy + perp.y * Math.min(maxAllowedShift, px(18)) },
                    { x: cx - perp.x * Math.min(maxAllowedShift, px(18)), y: cy - perp.y * Math.min(maxAllowedShift, px(18)) },
                  ];
              let labelPt = candidates[0];
              let bestLabelScore = -Infinity;
              const arrowA = { x: x1, y: y1 };
              const arrowB = { x: x2, y: y2 };
              for (const cand of candidates) {
                const dEdge = evalEdgeClearance(cand);
                if (dEdge < 0) continue;
                const dArr = face.slopePct > 0.05 ? distancePointToSegment2D(cand, arrowA, arrowB) : Infinity;
                const dObs = evalObstacleClearance(cand);
                const arrClear = dArr - (textHalfH + px(2));
                const score = Math.min(dEdge - textHalfH * 0.4, dObs, arrClear * 1.4);
                if (score > bestLabelScore) {
                  bestLabelScore = score;
                  labelPt = cand;
                }
              }

              // Record placed footprints so next nearby bay avoids landing on this arrow or text
              placedBoxes.push({ x: labelPt.x, y: labelPt.y, r: Math.max(textHalfW, px(10)) });
              if (face.slopePct > 0.05) {
                placedBoxes.push({ x: axC, y: ayC, r: arrowLen * 0.45 });
              }

              const arrowStrokePx = isCompactFace ? 1.2 : 1.85;
              const arrowHaloPx = isCompactFace ? 2.8 : 4.2;

              return (
                <g
                  key={face.id}
                  onClick={(e) => {
                    if (activeSubTool !== 'select' && activeSubTool !== 'edit_slope') return;
                    e.stopPropagation();
                    setSelectedEntity({ kind: 'face', faceId: face.id });
                  }}
                  onMouseEnter={() =>
                    setHoverTip(
                      `Faldón ${face.label} · Pendiente ${face.slopePct.toFixed(1)}% (${face.angleDeg.toFixed(1)}°) · Escorrentía hacia ${face.orientationLabel}`
                    )
                  }
                  className="cursor-pointer"
                >
                  <polygon
                    points={pts}
                    fill={fillValue}
                    stroke={isSelected ? '#0284c7' : 'rgba(15,23,42,0.18)'}
                    strokeWidth={isSelected ? px(2.6) : px(0.75)}
                  />
                  {shadeOverlay !== 'transparent' && (
                    <polygon points={pts} fill={shadeOverlay} pointerEvents="none" />
                  )}
                  {isSelected && (
                    <polygon
                      points={pts}
                      fill="rgba(56, 189, 248, 0.15)"
                      stroke="#0284c7"
                      strokeWidth={px(2.4)}
                      pointerEvents="none"
                    />
                  )}

                  {/* Master Architectural Slope Vector Arrow */}
                  {face.slopePct > 0.05 && (
                    <g pointerEvents="none">
                      <line
                        x1={x1}
                        y1={-y1}
                        x2={x2}
                        y2={-y2}
                        stroke="#ffffff"
                        strokeWidth={px(arrowHaloPx)}
                        strokeLinecap="round"
                      />
                      <line
                        x1={x1}
                        y1={-y1}
                        x2={x2}
                        y2={-y2}
                        stroke="#0f172a"
                        strokeWidth={px(arrowStrokePx)}
                        strokeLinecap="round"
                        markerEnd="url(#slope-arrow-clean)"
                      />
                    </g>
                  )}

                  {/* Crisp Haloed Slope Percentage Tag */}
                  <text
                    x={labelPt.x}
                    y={-labelPt.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={px(fontPx)}
                    fontWeight="800"
                    fontFamily="Inter, sans-serif"
                    fill="#0f172a"
                    stroke="#ffffff"
                    strokeWidth={px(3.2)}
                    paintOrder="stroke"
                    pointerEvents="none"
                  >
                    {slopeText}
                  </text>
                </g>
              );
            });
          })()}

        {/* Manual Replanteo Mode Footprint Base Polygons (unspoiled empty interior) */}
        {replanteoMode === 'manual' &&
          project.bodies.map((body) => (
            <g key={`man-body-${body.id}`}>
              <polygon
                points={body.outerLoop.map((p) => `${p.x},${-p.y}`).join(' ')}
                fill="#fafbfc"
                stroke="#0f172a"
                strokeWidth={px(2.4)}
              />
              {body.holes.map((h) => (
                <polygon
                  key={`man-hole-${h.id}`}
                  points={h.vertices.map((p) => `${p.x},${-p.y}`).join(' ')}
                  fill="#ffffff"
                  stroke="#334155"
                  strokeWidth={px(1.8)}
                />
              ))}
            </g>
          ))}

        {/* Manual Practice Revealed Hints */}
        {replanteoMode === 'manual' &&
          revealedHintCount > 0 &&
          expectedInteriorEdges.slice(0, revealedHintCount).map((he, hIdx) => (
            <g key={`hint-${he.id}`} pointerEvents="none">
              <line
                x1={he.p1.x}
                y1={-he.p1.y}
                x2={he.p2.x}
                y2={-he.p2.y}
                stroke="#8b5cf6"
                strokeWidth={px(2.8)}
                strokeDasharray={`${px(6)} ${px(4)}`}
                opacity="0.82"
              />
              <text
                x={(he.p1.x + he.p2.x) * 0.5}
                y={-((he.p1.y + he.p2.y) * 0.5 + px(7))}
                textAnchor="middle"
                fontSize={px(8.5)}
                fontWeight="700"
                fill="#6d28d9"
                stroke="#ffffff"
                strokeWidth={px(2.5)}
                paintOrder="stroke"
              >
                Pista {hIdx + 1} ({he.type})
              </text>
            </g>
          ))}

        {/* Student-Drawn Manual Replanteo Lines + Live Grading Badges */}
        {replanteoMode === 'manual' &&
          manualEdges.map((me) => {
            const grade = gradingReport?.edgeGrades[me.id];
            const color = grade
              ? grade.status === 'correct'
                ? '#16a34a'
                : grade.status === 'wrong_type'
                  ? '#f59e0b'
                  : '#ef4444'
              : me.kind === 'cumbrera'
                ? '#dc2626'
                : me.kind === 'limatesa'
                  ? '#d97706'
                  : '#0284c7';
            const dash =
              me.kind === 'limahoya' || grade?.status === 'wrong_position'
                ? `${px(6)} ${px(4)}`
                : undefined;
            const mx = (me.p1.x + me.p2.x) * 0.5;
            const my = (me.p1.y + me.p2.y) * 0.5;
            return (
              <g
                key={me.id}
                onMouseEnter={() =>
                  setHoverTip(
                    grade
                      ? `${grade.message} (clic derecho o pulsar en Selección para eliminar)`
                      : `Línea manual: ${me.kind.toUpperCase()} (${dist2(me.p1, me.p2).toFixed(2)} m) — Clic para borrar en modo selección`
                  )
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isManualLineTool) {
                    removeManualEdge(me.id);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeManualEdge(me.id);
                }}
                className="cursor-pointer"
              >
                <line
                  x1={me.p1.x}
                  y1={-me.p1.y}
                  x2={me.p2.x}
                  y2={-me.p2.y}
                  stroke={color}
                  strokeWidth={px(3.0)}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                />
                <circle cx={me.p1.x} cy={-me.p1.y} r={px(3.2)} fill={color} stroke="#ffffff" strokeWidth={px(1)} />
                <circle cx={me.p2.x} cy={-me.p2.y} r={px(3.2)} fill={color} stroke="#ffffff" strokeWidth={px(1)} />
                {grade && (
                  <g transform={`translate(${mx}, ${-my})`}>
                    <circle r={px(7.5)} fill={color} stroke="#ffffff" strokeWidth={px(1.2)} />
                    <text y={px(3)} textAnchor="middle" fontSize={px(9)} fontWeight="bold" fill="#ffffff">
                      {grade.status === 'correct' ? '✓' : grade.status === 'wrong_type' ? '!' : '✗'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        {/* Active Rubberband Preview when Drawing Manual Cumbrera / Limatesa / Limahoya */}
        {isManualLineTool && manualLineStart && cursorWorld && (
          <g pointerEvents="none">
            <line
              x1={manualLineStart.x}
              y1={-manualLineStart.y}
              x2={cursorWorld.x}
              y2={-cursorWorld.y}
              stroke={
                activeSubTool === 'draw_cumbrera'
                  ? '#dc2626'
                  : activeSubTool === 'draw_limahoya'
                    ? '#0284c7'
                    : '#d97706'
              }
              strokeWidth={px(2.6)}
              strokeDasharray={`${px(5)} ${px(3)}`}
            />
            <circle cx={manualLineStart.x} cy={-manualLineStart.y} r={px(4.5)} fill="#2563eb" stroke="#ffffff" strokeWidth={px(1.4)} />
            <g
              transform={`translate(${(manualLineStart.x + cursorWorld.x) * 0.5}, ${-((manualLineStart.y + cursorWorld.y) * 0.5 + px(14))})`}
            >
              <rect x={-px(44)} y={-px(10)} width={px(88)} height={px(17)} rx={px(3)} fill="#0f172a" opacity="0.9" />
              <text y={px(2)} textAnchor="middle" fontSize={px(10)} fontWeight="700" fontFamily="JetBrains Mono, monospace" fill="#fde047">
                {dist2(manualLineStart, cursorWorld).toFixed(2)}m · {(((Math.atan2(cursorWorld.y - manualLineStart.y, cursorWorld.x - manualLineStart.x) * 180) / Math.PI + 360) % 360).toFixed(0)}°
              </text>
            </g>
          </g>
        )}

        {/* Premium 2D Rain & Runoff Simulation (multi-strand streams + droplets + falling rain + puddle alerts) */}
        {replanteoMode === 'auto' && showWaterFlow && (
          <g pointerEvents="none">
            {solved.hydrology.streamlines.map((sl) => {
              if (sl.points2D.length < 2) return null;
              const isValley = sl.id.startsWith('flow-valley');
              const d = sl.points2D
                .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${-p.y}`)
                .join(' ');
              return (
                <g key={sl.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isValley ? '#0369a1' : '#38bdf8'}
                    strokeWidth={px(isValley ? 3.4 : 1.7)}
                    strokeLinecap="round"
                    opacity={isValley ? 0.5 : 0.38}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={isValley ? '#0284c7' : '#0ea5e9'}
                    strokeWidth={px(isValley ? 2.4 : 1.5)}
                    strokeDasharray={`${px(4)} ${px(8)}`}
                    strokeLinecap="round"
                    className="water-flow-line"
                    opacity="0.95"
                  />
                </g>
              );
            })}

            {/* Subtle 2D Falling Rain Streaks over the building bounds */}
            {Array.from({ length: 24 }).map((_, idx) => {
              const rx = ((Math.sin(idx * 23.1) * 43758.5) % 1 + 1) % 1;
              const ry = ((Math.sin(idx * 59.7) * 19341.2) % 1 + 1) % 1;
              const x0 = b.minX - 1 + rx * (b.maxX - b.minX + 2);
              const y0 = b.minY - 1 + ry * (b.maxY - b.minY + 2);
              return (
                <line
                  key={`rain2d-${idx}`}
                  x1={x0}
                  y1={-y0}
                  x2={x0 - 0.16}
                  y2={-(y0 - 0.42)}
                  stroke="#0284c7"
                  strokeWidth={px(1.1)}
                  strokeDasharray={`${px(5)} ${px(14)}`}
                  className="water-flow-line"
                  opacity="0.45"
                />
              );
            })}

            {/* Water Accumulation / Trap Puddles */}
            {solved.hydrology.alerts.map((al) => (
              <g key={`puddle2d-${al.id}`} transform={`translate(${al.location.x}, ${-al.location.y})`}>
                <circle r={px(14)} fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" strokeWidth={px(2)} className="incident-pulse" />
                <circle r={px(5)} fill="#ef4444" />
              </g>
            ))}
          </g>
        )}

        {/* Topological Edges (In Manual Practice Mode, hide interior ridges/hips/valleys so student draws them!) */}
        {solved.edges
          .filter(
            (edge) =>
              replanteoMode === 'auto' ||
              (edge.type !== 'cumbrera' && edge.type !== 'limatesa' && edge.type !== 'limahoya')
          )
          .map((edge) => {
          const isSelected = selectedEntity?.kind === 'edge' && selectedEntity.edgeId === edge.id;
          let stroke = '#0f172a';
          let widthPx = 2.4;
          let dashArray: string | undefined;
          let tipText = 'Alero: borde inferior libre de descarga del faldón.';

          if (edge.type === 'cumbrera') {
            stroke = '#dc2626';
            widthPx = 3.2;
            tipText = 'Cumbrera: arista horizontal superior donde nacen y se separan dos faldones opuestos.';
          } else if (edge.type === 'limatesa') {
            stroke = '#d97706';
            widthPx = 2.6;
            tipText = 'Limatesa: arista convexa inclinada que reparte el agua hacia ambos lados.';
          } else if (edge.type === 'limahoya') {
            stroke = '#0284c7';
            widthPx = 2.8;
            dashArray = `${px(7)} ${px(4)}`;
            tipText = 'Limahoya: arista cóncava donde converge el agua de dos faldones contiguos.';
          } else if (edge.type === 'encuentro_paramento' || edge.type === 'pretil') {
            stroke = '#1e293b';
            widthPx = 3.4;
            tipText = 'Encuentro contra paramento/pretil: requiere entrega impermeable >= 25 cm (DB-HS 1).';
          } else if (edge.hasGutter) {
            stroke = '#2563eb';
            widthPx = 3.0;
            tipText = `Canalón (DN ${edge.gutterDiameterMm ?? 125} mm, pend. ${(edge.gutterSlopePct ?? 1).toFixed(1)}%)`;
          }

          return (
            <g key={edge.id}>
              {isSelected && (
                <line
                  x1={edge.p1.x}
                  y1={-edge.p1.y}
                  x2={edge.p2.x}
                  y2={-edge.p2.y}
                  stroke="#38bdf8"
                  strokeWidth={px(6.5)}
                  strokeLinecap="round"
                  opacity="0.6"
                />
              )}
              <line
                x1={edge.p1.x}
                y1={-edge.p1.y}
                x2={edge.p2.x}
                y2={-edge.p2.y}
                stroke={stroke}
                strokeWidth={px(widthPx)}
                strokeDasharray={dashArray}
                strokeLinecap="round"
                pointerEvents="none"
              />
              <line
                x1={edge.p1.x}
                y1={-edge.p1.y}
                x2={edge.p2.x}
                y2={-edge.p2.y}
                stroke="transparent"
                strokeWidth={px(12)}
                className="cursor-pointer"
                onMouseEnter={() => setHoverTip(tipText)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (activeSubTool === 'toggle_gable' && edge.sourceEdgeId) {
                    const bObj = project.bodies.find((bb) => bb.id === edge.bodyId);
                    const cur = bObj?.edgeConfigs[edge.sourceEdgeId]?.type || 'eave';
                    const order = ['eave', 'gable', 'parapet', 'wall_abutment'] as const;
                    const nextType = order[(order.indexOf(cur) + 1) % order.length];
                    updateEdgeConfig(edge.bodyId, edge.sourceEdgeId, { type: nextType });
                  } else if (activeSubTool === 'toggle_gutter' && edge.sourceEdgeId) {
                    const bObj = project.bodies.find((bb) => bb.id === edge.bodyId);
                    const cur = bObj?.edgeConfigs[edge.sourceEdgeId]?.hasGutter ?? true;
                    updateEdgeConfig(edge.bodyId, edge.sourceEdgeId, { hasGutter: !cur });
                  } else {
                    setSelectedEntity({ kind: 'edge', edgeId: edge.id });
                  }
                }}
              />
            </g>
          );
        })}

        {/* Wavefront Step-by-Step Preview */}
        {activeWaveSnapshot && (
          <g pointerEvents="none">
            {activeWaveSnapshot.loops.map((loop, idx) => (
              <polygon
                key={`wf-loop-${idx}`}
                points={loop.map((p) => `${p.x},${-p.y}`).join(' ')}
                fill="rgba(59, 130, 246, 0.14)"
                stroke="#2563eb"
                strokeWidth={px(2.2)}
                strokeDasharray={`${px(5)} ${px(3)}`}
              />
            ))}
          </g>
        )}

        {/* Section Cut A-A' (only in Sección view or section_cut tool) */}
        {(viewMode === 'seccion' || activeSubTool === 'section_cut') && (
          <g>
            <line
              x1={project.sectionLine.p1.x}
              y1={-project.sectionLine.p1.y}
              x2={project.sectionLine.p2.x}
              y2={-project.sectionLine.p2.y}
              stroke="#7c3aed"
              strokeWidth={px(1.8)}
              strokeDasharray={`${px(10)} ${px(4)} ${px(2)} ${px(4)}`}
            />
            {[
              { pt: project.sectionLine.p1, kind: 'section_p1' as const, label: 'A' },
              { pt: project.sectionLine.p2, kind: 'section_p2' as const, label: "A'" },
            ].map((end) => (
              <g
                key={end.label}
                transform={`translate(${end.pt.x}, ${-end.pt.y})`}
                className="cursor-move"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragState({ kind: end.kind });
                }}
              >
                <circle r={px(9)} fill="#7c3aed" stroke="#ffffff" strokeWidth={px(1.5)} />
                <text y={px(3.5)} textAnchor="middle" fontSize={px(10)} fontWeight="bold" fill="#ffffff">
                  {end.label}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* Singular Elements */}
        {project.singularElements.map((sg) => {
          const isSel = selectedEntity?.kind === 'singular' && selectedEntity.singularId === sg.id;
          return (
            <g
              key={sg.id}
              transform={`translate(${sg.x}, ${-sg.y}) rotate(${-sg.rotationDeg})`}
              className="cursor-move"
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelectedEntity({ kind: 'singular', singularId: sg.id });
                setDragState({ kind: 'singular', singularId: sg.id });
              }}
            >
              <rect
                x={-sg.width * 0.5}
                y={-sg.depth * 0.5}
                width={sg.width}
                height={sg.depth}
                fill={sg.kind === 'lucernario' ? '#e0f2fe' : '#e2e8f0'}
                stroke={isSel ? '#2563eb' : '#0f172a'}
                strokeWidth={px(isSel ? 2.4 : 1.5)}
              />
              {sg.kind === 'shunt' ? (
                <polygon
                  points={`${-sg.width * 0.5},${-sg.depth * 0.5} ${sg.width * 0.5},${-sg.depth * 0.5} ${-sg.width * 0.5},${sg.depth * 0.5}`}
                  fill="#0f172a"
                />
              ) : (
                <>
                  <line x1={-sg.width * 0.5} y1={-sg.depth * 0.5} x2={sg.width * 0.5} y2={sg.depth * 0.5} stroke="#334155" strokeWidth={px(0.9)} />
                  <line x1={sg.width * 0.5} y1={-sg.depth * 0.5} x2={-sg.width * 0.5} y2={sg.depth * 0.5} stroke="#334155" strokeWidth={px(0.9)} />
                </>
              )}
            </g>
          );
        })}

        {/* Drains */}
        {project.drains.map((dr) => {
          const isSel = selectedEntity?.kind === 'drain' && selectedEntity.drainId === dr.id;
          return (
            <g
              key={dr.id}
              transform={`translate(${dr.x}, ${-dr.y})`}
              className="cursor-move"
              onMouseEnter={() => setHoverTip(`${dr.label}: punto de recogida de aguas pluviales (DB-HS 5).`)}
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelectedEntity({ kind: 'drain', drainId: dr.id });
                setDragState({ kind: 'drain', drainId: dr.id });
              }}
            >
              {dr.kind === 'rebosadero' ? (
                <rect x={-px(6)} y={-px(3.5)} width={px(12)} height={px(7)} fill="#ffffff" stroke={isSel ? '#ef4444' : '#0369a1'} strokeWidth={px(1.6)} />
              ) : (
                <>
                  <circle r={px(6)} fill="#ffffff" stroke={isSel ? '#ef4444' : '#0284c7'} strokeWidth={px(1.8)} />
                  <path d={`M 0,${-px(6)} A ${px(6)},${px(6)} 0 0,1 0,${px(6)} Z`} fill="#0284c7" />
                </>
              )}
            </g>
          );
        })}

        {/* Downspouts */}
        {project.downspouts.map((ds) => {
          const isSel = selectedEntity?.kind === 'downspout' && selectedEntity.downspoutId === ds.id;
          return (
            <g
              key={ds.id}
              transform={`translate(${ds.x}, ${-ds.y})`}
              className="cursor-move"
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelectedEntity({ kind: 'downspout', downspoutId: ds.id });
                setDragState({ kind: 'downspout', downspoutId: ds.id });
              }}
            >
              <circle r={px(4.8)} fill="#dbeafe" stroke={isSel ? '#ef4444' : '#1d4ed8'} strokeWidth={px(1.6)} />
              <line x1={-px(3)} y1={-px(3)} x2={px(3)} y2={px(3)} stroke="#1d4ed8" strokeWidth={px(1.2)} />
              <line x1={px(3)} y1={-px(3)} x2={-px(3)} y2={px(3)} stroke="#1d4ed8" strokeWidth={px(1.2)} />
            </g>
          );
        })}

        {/* Midpoint '+' Vertex Split Handles & Subtle Corner Handles */}
        {(activeSubTool === 'select' || activeSubTool === 'edit_vertices') &&
          project.bodies.map((body) => (
            <g key={`verts-${body.id}`}>
              {body.outerLoop.map((va, idx) => {
                const vb = body.outerLoop[(idx + 1) % body.outerLoop.length];
                const midX = (va.x + vb.x) * 0.5;
                const midY = (va.y + vb.y) * 0.5;
                const segLen = dist2(va, vb);
                const isSel =
                  selectedEntity?.kind === 'vertex' &&
                  selectedEntity.bodyId === body.id &&
                  selectedEntity.vertexId === va.id;
                return (
                  <React.Fragment key={va.id}>
                    {/* Clickable Partial Dimension Chain (skip redundant full-width top/left edge already shown by outer CAD dimensions) */}
                    {(() => {
                      const spanW = b.maxX - b.minX;
                      const spanH = b.maxY - b.minY;
                      const isRedundantFullTop =
                        Math.abs(va.y - vb.y) < 0.05 &&
                        Math.abs(va.y - b.maxY) < 0.05 &&
                        Math.abs(segLen - spanW) < 0.05;
                      const isRedundantFullLeft =
                        Math.abs(va.x - vb.x) < 0.05 &&
                        Math.abs(va.x - b.minX) < 0.05 &&
                        Math.abs(segLen - spanH) < 0.05;
                      const isSharedInternalSeam = project.bodies.some((ob) => {
                        if (ob.id === body.id) return false;
                        return ob.outerLoop.some((oa, oi) => {
                          const o2 = ob.outerLoop[(oi + 1) % ob.outerLoop.length];
                          return distancePointToSegment2D({ x: midX, y: midY }, oa, o2) < 0.16;
                        });
                      });
                      const showBadge =
                        activeSubTool === 'edit_vertices' ||
                        (!isSharedInternalSeam &&
                          project.bodies.length <= 2 &&
                          segLen > 2.2 &&
                          !isRedundantFullTop &&
                          !isRedundantFullLeft);
                      if (!showBadge) return null;
                      const edgeDir = norm2(sub2(vb, va));
                      const outN = { x: edgeDir.y, y: -edgeDir.x }; // outward normal for CCW loop
                      const offsetM = px(18);
                      const dimX = midX + outN.x * offsetM;
                      const dimY = midY + outN.y * offsetM;
                      return (
                        <g
                          transform={`translate(${dimX}, ${-dimY})`}
                          className="cursor-pointer opacity-80 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDimEdge({
                              bodyId: body.id,
                              edgeIndex: idx,
                              val: segLen.toFixed(2),
                            });
                          }}
                          onMouseEnter={() =>
                            setHoverTip(`Tramo exterior: ${segLen.toFixed(2)} m (clic para editar longitud exacta)`)
                          }
                        >
                          <rect
                            x={-px(17)}
                            y={-px(6.5)}
                            width={px(34)}
                            height={px(13)}
                            rx={px(2.5)}
                            fill="#ffffff"
                            stroke="#94a3b8"
                            strokeWidth={px(0.75)}
                          />
                          <text
                            y={px(2.8)}
                            textAnchor="middle"
                            fontSize={px(8.5)}
                            fontWeight="600"
                            fontFamily="JetBrains Mono, monospace"
                            fill="#1e293b"
                          >
                            {segLen.toFixed(2)}
                          </text>
                        </g>
                      );
                    })()}

                    {/* Midpoint '+' handle to bend wall / insert corner */}
                    {activeSubTool === 'edit_vertices' && segLen > 1.0 && (
                      <g
                        transform={`translate(${midX}, ${-(midY - px(14))})`}
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          insertVertexOnEdge(body.id, idx, { x: midX, y: midY });
                        }}
                        onMouseEnter={() => setHoverTip('Pulsa + para añadir un nuevo vértice en este muro')}
                      >
                        <circle r={px(6)} fill="#2563eb" stroke="#ffffff" strokeWidth={px(1.2)} />
                        <text y={px(3)} textAnchor="middle" fontSize={px(10)} fontWeight="bold" fill="#ffffff">
                          +
                        </text>
                      </g>
                    )}

                    {/* Subtle Corner Vertex Handle */}
                    <circle
                      cx={va.x}
                      cy={-va.y}
                      r={px(isSel ? 5.2 : 3.2)}
                      fill={isSel ? '#2563eb' : '#ffffff'}
                      stroke="#0f172a"
                      strokeWidth={px(1.3)}
                      className="cursor-move hover:fill-blue-400"
                      onMouseEnter={() =>
                        setHoverTip(`Vértice (${va.x.toFixed(2)}, ${va.y.toFixed(2)}) — Arrastra para mover`)
                      }
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedEntity({ kind: 'vertex', bodyId: body.id, vertexId: va.id });
                        setDragState({ kind: 'vertex', bodyId: body.id, vertexId: va.id });
                      }}
                    />
                  </React.Fragment>
                );
              })}
            </g>
          ))}

        {/* Overall Dimension Lines (Clean outer framing at 44px offset so partial dimensions never overlap) */}
        {project.bodies.length > 0 && (
          <g pointerEvents="none">
            <line
              x1={b.minX}
              y1={-(b.maxY + px(42))}
              x2={b.maxX}
              y2={-(b.maxY + px(42))}
              stroke="#1e293b"
              strokeWidth={px(1.1)}
            />
            <line x1={b.minX} y1={-(b.maxY + px(6))} x2={b.minX} y2={-(b.maxY + px(48))} stroke="#64748b" strokeWidth={px(0.8)} />
            <line x1={b.maxX} y1={-(b.maxY + px(6))} x2={b.maxX} y2={-(b.maxY + px(48))} stroke="#64748b" strokeWidth={px(0.8)} />
            <rect x={(b.minX + b.maxX) * 0.5 - px(24)} y={-(b.maxY + px(51))} width={px(48)} height={px(16)} fill="#ffffff" />
            <text
              x={(b.minX + b.maxX) * 0.5}
              y={-(b.maxY + px(39))}
              textAnchor="middle"
              fontSize={px(11.5)}
              fontWeight="700"
              fontFamily="JetBrains Mono, monospace"
              fill="#0f172a"
            >
              {formatRawLength(b.maxX - b.minX, project.units)}
            </text>

            <line x1={b.minX - px(42)} y1={-b.minY} x2={b.minX - px(42)} y2={-b.maxY} stroke="#1e293b" strokeWidth={px(1.1)} />
            <line x1={b.minX - px(6)} y1={-b.minY} x2={b.minX - px(48)} y2={-b.minY} stroke="#64748b" strokeWidth={px(0.8)} />
            <line x1={b.minX - px(6)} y1={-b.maxY} x2={b.minX - px(48)} y2={-b.maxY} stroke="#64748b" strokeWidth={px(0.8)} />
            <text
              x={b.minX - px(48)}
              y={-((b.minY + b.maxY) * 0.5)}
              textAnchor="middle"
              fontSize={px(11.5)}
              fontWeight="700"
              fontFamily="JetBrains Mono, monospace"
              fill="#0f172a"
              transform={`rotate(-90 ${b.minX - px(48)} ${-((b.minY + b.maxY) * 0.5)})`}
            >
              {formatRawLength(b.maxY - b.minY, project.units)}
            </text>
          </g>
        )}

        {/* Active Polygon Drawing Preview with Live Rubberband Length & Area */}
        {drawingPts.length > 0 && (
          <g pointerEvents="none">
            {drawingPts.length >= 2 && cursorWorld && (
              <polygon
                points={[...drawingPts, cursorWorld].map((p) => `${p.x},${-p.y}`).join(' ')}
                fill="rgba(59, 130, 246, 0.10)"
                stroke="#93c5fd"
                strokeWidth={px(1)}
                strokeDasharray={`${px(4)} ${px(4)}`}
              />
            )}
            <polyline
              points={drawingPts.map((p) => `${p.x},${-p.y}`).join(' ')}
              fill="none"
              stroke="#2563eb"
              strokeWidth={px(2.4)}
            />
            {liveDrawMetrics && cursorWorld && (
              <>
                <line
                  x1={liveDrawMetrics.prev.x}
                  y1={-liveDrawMetrics.prev.y}
                  x2={cursorWorld.x}
                  y2={-cursorWorld.y}
                  stroke="#3b82f6"
                  strokeWidth={px(2.0)}
                  strokeDasharray={`${px(5)} ${px(3)}`}
                />
                <g
                  transform={`translate(${(liveDrawMetrics.prev.x + cursorWorld.x) * 0.5}, ${-((liveDrawMetrics.prev.y + cursorWorld.y) * 0.5 + px(14))})`}
                >
                  <rect x={-px(44)} y={-px(10)} width={px(88)} height={px(17)} rx={px(3)} fill="#0f172a" opacity="0.9" />
                  <text y={px(2)} textAnchor="middle" fontSize={px(10)} fontWeight="700" fontFamily="JetBrains Mono, monospace" fill="#fef08a">
                    {liveDrawMetrics.len.toFixed(2)}m · {liveDrawMetrics.deg.toFixed(0)}°
                  </text>
                </g>
              </>
            )}
            {drawingPts.map((p, idx) => (
              <circle
                key={`dp-${idx}`}
                cx={p.x}
                cy={-p.y}
                r={px(idx === 0 ? 6.5 : 4)}
                fill={idx === 0 ? '#10b981' : '#2563eb'}
                stroke="#ffffff"
                strokeWidth={px(1.5)}
              />
            ))}
          </g>
        )}

        {/* Active Distance Measurement */}
        {measurePts.length > 0 && (
          <g pointerEvents="none">
            {measurePts.map((p, idx) => (
              <circle key={`mp-${idx}`} cx={p.x} cy={-p.y} r={px(4.5)} fill="#9333ea" />
            ))}
            {measurePts.length === 2 && (
              <>
                <line
                  x1={measurePts[0].x}
                  y1={-measurePts[0].y}
                  x2={measurePts[1].x}
                  y2={-measurePts[1].y}
                  stroke="#9333ea"
                  strokeWidth={px(2.2)}
                />
                <text
                  x={(measurePts[0].x + measurePts[1].x) * 0.5}
                  y={-((measurePts[0].y + measurePts[1].y) * 0.5 + px(8))}
                  textAnchor="middle"
                  fontSize={px(11)}
                  fontWeight="700"
                  fill="#7e22ce"
                  stroke="#ffffff"
                  strokeWidth={px(3)}
                  paintOrder="stroke"
                >
                  {dist2(measurePts[0], measurePts[1]).toFixed(3)} m
                </text>
              </>
            )}
          </g>
        )}

        {/* Incident Highlight Ring */}
        {highlightedPoint && (
          <g transform={`translate(${highlightedPoint.x}, ${-highlightedPoint.y})`} pointerEvents="none">
            <circle r={px(18)} fill="rgba(239, 68, 68, 0.16)" stroke="#ef4444" strokeWidth={px(3)} className="incident-pulse" />
            <circle r={px(5)} fill="#ef4444" />
          </g>
        )}
      </svg>

      {/* North Compass Rose (positioned cleanly below the floating toolbars) */}
      <div className="absolute top-20 right-3 z-10 pointer-events-none flex flex-col items-center bg-white/85 rounded-full p-1.5 shadow-sm border border-slate-300/70">
        <span className="text-[11px] font-extrabold text-slate-900 leading-none">N</span>
        <svg viewBox="0 0 36 36" className="w-8 h-8">
          <circle cx="18" cy="18" r="14" fill="none" stroke="#334155" strokeWidth="1.2" />
          <polygon points="18,3 22,18 18,15 14,18" fill="#0f172a" />
          <polygon points="18,33 22,18 18,21 14,18" fill="none" stroke="#0f172a" strokeWidth="1" />
          <line x1="4" y1="18" x2="32" y2="18" stroke="#64748b" strokeWidth="0.9" />
        </svg>
      </div>

      {/* Graphic Scale Bar */}
      <div className="absolute bottom-2.5 left-3 z-10 pointer-events-none bg-white/92 border border-slate-300 rounded px-2.5 py-1.5 shadow-sm">
        <div className="flex items-end gap-2">
          <div>
            <div className="flex text-[9.5px] font-mono font-semibold text-slate-800 justify-between mb-0.5">
              <span>0</span>
              <span>1</span>
              <span>2</span>
              <span>5</span>
              <span>10 m</span>
            </div>
            <div className="flex h-1.5 border border-slate-900" style={{ width: `${Math.min(180, Math.max(70, zoom * 3.2))}px` }}>
              <div className="w-1/5 bg-slate-900" />
              <div className="w-1/5 bg-white" />
              <div className="w-1/5 bg-slate-900" />
              <div className="w-2/5 bg-white border-l border-slate-900" />
            </div>
          </div>
          {cursorWorld && (
            <div className="text-[10px] font-mono text-slate-600 pl-2 border-l border-slate-300">
              X:{cursorWorld.x.toFixed(2)} Y:{cursorWorld.y.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2.5 right-3 z-10 pointer-events-none bg-white/95 border border-slate-400 rounded px-2.5 py-1.5 shadow-sm text-[10px] text-slate-900">
        <div className="font-bold text-center border-b border-slate-300 pb-0.5 mb-1">Leyenda</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-red-600 inline-block" /><span>Cumbrera</span></div>
          <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-slate-900 inline-block" /><span>Alero</span></div>
          <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-amber-600 inline-block" /><span>Limatesa</span></div>
          <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-blue-600 inline-block" /><span>Canalón</span></div>
          <div className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-sky-600 inline-block" /><span>Limahoya</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-sky-600 bg-sky-100 inline-block" /><span>Sumidero</span></div>
        </div>
      </div>
    </div>
  );
};
