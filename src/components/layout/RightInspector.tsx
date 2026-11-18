import React, { useState } from 'react';
import { useRoofStore } from '../../store/useRoofStore';
import { ROOF_SYSTEMS } from '../../engine/presets/materials';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Trash2,
  BookOpen,
} from 'lucide-react';
import type { NormativeStatus } from '../../types/solved';

interface RightInspectorProps {
  onOpenNormativaModal: () => void;
}

const StatusBadgeIcon: React.FC<{ status: NormativeStatus }> = ({ status }) => {
  if (status === 'CUMPLE') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (status === 'NO CUMPLE') return <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
  return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
};

export const RightInspector: React.FC<RightInspectorProps> = ({ onOpenNormativaModal }) => {
  const {
    project,
    solved,
    selectedEntity,
    setSelectedEntity,
    updateFaceSlopeByFaceId,
    updateEdgeConfig,
    moveVertex,
    updateDrain,
    removeDrain,
    updateDownspout,
    removeDownspout,
    updateSingular,
    removeSingular,
    updateLayer,
    updateTileSpec,
    autoFixNormativeRule,
  } = useRoofStore();

  const [slopeInputMode, setSlopeInputMode] = useState<'pct' | 'deg' | 'ratio'>('pct');
  const [openAcc, setOpenAcc] = useState({
    water: true,
    assoc: true,
    norm: true,
    math: false,
  });

  const toggleAcc = (key: keyof typeof openAcc) =>
    setOpenAcc((prev) => ({ ...prev, [key]: !prev[key] }));

  const sysMeta = ROOF_SYSTEMS[project.systemId];

  const selectedFace =
    selectedEntity?.kind === 'face'
      ? solved.faces.find((f) => f.id === selectedEntity.faceId) || solved.faces[0]
      : undefined;

  const selectedEdge =
    selectedEntity?.kind === 'edge'
      ? solved.edges.find((e) => e.id === selectedEntity.edgeId)
      : undefined;

  const selectedDrain =
    selectedEntity?.kind === 'drain'
      ? project.drains.find((d) => d.id === selectedEntity.drainId)
      : undefined;

  const selectedDownspout =
    selectedEntity?.kind === 'downspout'
      ? project.downspouts.find((d) => d.id === selectedEntity.downspoutId)
      : undefined;

  const selectedSingular =
    selectedEntity?.kind === 'singular'
      ? project.singularElements.find((s) => s.id === selectedEntity.singularId)
      : undefined;

  const selectedLayer =
    selectedEntity?.kind === 'layer'
      ? project.layers.find((l) => l.id === selectedEntity.layerId)
      : undefined;

  const selectedVertexBody =
    selectedEntity?.kind === 'vertex'
      ? project.bodies.find((b) => b.id === selectedEntity.bodyId)
      : undefined;
  const selectedVertex =
    selectedEntity?.kind === 'vertex' && selectedVertexBody
      ? (selectedEntity.holeId
          ? selectedVertexBody.holes.find((h) => h.id === selectedEntity.holeId)?.vertices
          : selectedVertexBody.outerLoop
        )?.find((v) => v.id === selectedEntity.vertexId)
      : undefined;

  // Helpers for Faldón slope conversion
  const handleSlopeEdit = (faceId: string, rawVal: number) => {
    if (Number.isNaN(rawVal) || rawVal <= 0) return;
    if (slopeInputMode === 'pct') {
      updateFaceSlopeByFaceId(faceId, rawVal);
    } else if (slopeInputMode === 'deg') {
      const clampedDeg = Math.min(68, Math.max(0.2, rawVal));
      updateFaceSlopeByFaceId(faceId, Math.tan((clampedDeg * Math.PI) / 180) * 100);
    } else {
      // ratio 1:N -> % = 100 / N
      updateFaceSlopeByFaceId(faceId, 100 / Math.max(0.5, rawVal));
    }
  };

  return (
    <aside className="w-[272px] bg-[#18202c] border-l border-[#2c3a4f] flex flex-col shrink-0 overflow-hidden select-none">
      {/* Inspector Header */}
      <div className="h-9 px-3 border-b border-[#2c3a4f] flex items-center justify-between text-xs font-semibold text-slate-200">
        <span>Inspector</span>
        <span className="text-[10px] text-slate-400 font-normal">Propiedades técnicas</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {/* CASE 1: FALDÓN SELECTED (Matches diseño software.png strictly!) */}
        {selectedFace && (
          <>
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#2c3a4f]">
              <div
                className="w-10 h-10 rounded border border-[#3a4f6d] shadow-inner shrink-0 flex items-center justify-center relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${sysMeta.primaryColorHex}, ${sysMeta.secondaryColorHex})`,
                }}
              >
                <span className="text-[10px] font-bold text-white/90 drop-shadow">
                  {selectedFace.label}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-white truncate">
                  Faldón {selectedFace.label}
                </div>
                <div className="text-[11px] text-slate-400 truncate">{sysMeta.shortName}</div>
              </div>
            </div>

            {/* Key Properties Form */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-300">Pendiente:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step={slopeInputMode === 'pct' ? 1 : 0.2}
                    value={
                      slopeInputMode === 'pct'
                        ? Number(selectedFace.slopePct.toFixed(2))
                        : slopeInputMode === 'deg'
                          ? Number(selectedFace.angleDeg.toFixed(2))
                          : selectedFace.slopeRatio > 0.001
                            ? Number((1 / selectedFace.slopeRatio).toFixed(2))
                            : 0
                    }
                    onChange={(e) => handleSlopeEdit(selectedFace.id, Number(e.target.value))}
                    className="w-20 bg-[#111720] border border-[#304057] focus:border-blue-500 rounded px-2 py-1 text-right font-mono text-slate-100 outline-none"
                  />
                  <select
                    value={slopeInputMode}
                    onChange={(e) => setSlopeInputMode(e.target.value as 'pct' | 'deg' | 'ratio')}
                    className="bg-[#111720] border border-[#304057] rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none cursor-pointer"
                  >
                    <option value="pct">%</option>
                    <option value="deg">°</option>
                    <option value="ratio">1:n</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Ángulo:</span>
                <span className="font-mono text-slate-100 tabular-nums">
                  {selectedFace.angleDeg.toFixed(2)} °
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Orientación:</span>
                <span className="font-medium text-slate-100">
                  {selectedFace.orientationLabel} ({selectedFace.azimuthDeg.toFixed(0)}°)
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Superficie incl.:</span>
                <span className="font-mono text-slate-100 tabular-nums">
                  {selectedFace.inclinedAreaM2.toFixed(2)} m²
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Sup. horizontal:</span>
                <span className="font-mono text-slate-100 tabular-nums">
                  {selectedFace.projectedAreaM2.toFixed(2)} m²
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Cota superior:</span>
                <span className="font-mono text-slate-100 tabular-nums">
                  +{selectedFace.maxZ.toFixed(2)} m
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Cota inferior:</span>
                <span className="font-mono text-slate-100 tabular-nums">
                  +{selectedFace.minZ.toFixed(2)} m
                </span>
              </div>

              {/* Live Visual Slope Triangle (Anti-collision layout: badges never cross stroke lines) */}
              {(() => {
                const risePx = Math.max(8, Math.min(44, selectedFace.slopeRatio * 90));
                const baseY = 66;
                const x0 = 18;
                const x1 = 152;
                const topY = baseY - risePx;
                return (
                  <div className="bg-[#111722] border border-[#2c3a4f] rounded-md p-2 mt-1">
                    <svg viewBox="0 0 228 86" className="w-full h-[76px]">
                      {/* Subtle shaded triangle fill */}
                      <polygon
                        points={`${x0},${baseY} ${x1},${baseY} ${x1},${topY}`}
                        fill="rgba(245, 158, 11, 0.14)"
                      />
                      {/* Horizontal 1.00 m run */}
                      <line x1={x0} y1={baseY} x2={x1} y2={baseY} stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 2" />
                      {/* Vertical rise */}
                      <line x1={x1} y1={baseY} x2={x1} y2={topY} stroke="#38bdf8" strokeWidth="2.2" />
                      {/* Hypotenuse slope */}
                      <line x1={x0} y1={baseY} x2={x1} y2={topY} stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" />

                      {/* Crisp clean angle badge placed safely OUTSIDE above the hypotenuse */}
                      <rect
                        x={24}
                        y={Math.max(4, topY * 0.52)}
                        width="48"
                        height="15"
                        rx="4"
                        fill="#0f172a"
                        stroke="#f59e0b"
                        strokeWidth="0.9"
                        opacity="0.96"
                      />
                      <text
                        x={48}
                        y={Math.max(4, topY * 0.52) + 10.8}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="700"
                        fill="#fde68a"
                        fontFamily="monospace"
                      >
                        {selectedFace.angleDeg.toFixed(1)}°
                      </text>

                      {/* 1,00 m baseline centered cleanly below axis */}
                      <text x={(x0 + x1) * 0.5} y="80" textAnchor="middle" fontSize="9.5" fill="#94a3b8" fontFamily="monospace">
                        1,00 m
                      </text>

                      {/* Rise value with vertical callout ticks */}
                      <line x1={x1 + 4} y1={baseY} x2={x1 + 9} y2={baseY} stroke="#38bdf8" strokeWidth="1" />
                      <line x1={x1 + 4} y1={topY} x2={x1 + 9} y2={topY} stroke="#38bdf8" strokeWidth="1" />
                      <text x={x1 + 12} y={baseY - risePx * 0.5 + 3.5} fontSize="10" fill="#7dd3fc" fontFamily="monospace" fontWeight="700">
                        {selectedFace.slopeRatio.toFixed(2)} m
                      </text>
                    </svg>
                    <div className="text-[10.5px] text-slate-300 text-center">
                      Sube <strong className="text-sky-300">{(selectedFace.slopeRatio * 100).toFixed(0)} cm</strong> por cada <strong>1 m</strong> horizontal
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Accordion: Recorrido del agua */}
            <div className="border-t border-[#2c3a4f] pt-2">
              <button
                onClick={() => toggleAcc('water')}
                className="w-full flex items-center justify-between text-slate-200 font-semibold py-1"
              >
                <span>Recorrido del agua</span>
                {openAcc.water ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {openAcc.water && (
                <div className="mt-1 space-y-1 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    {solved.hydrology.alerts.length === 0 ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300 font-medium">Correcto (Escorrentía verificada)</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-amber-300 font-medium">
                          {solved.hydrology.alerts.length} incidencia(s) hidráulicas
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-slate-400">
                    Vector descenso: ({selectedFace.runoffDir2D.x.toFixed(2)}, {selectedFace.runoffDir2D.y.toFixed(2)})
                  </div>
                </div>
              )}
            </div>

            {/* Accordion: Elementos asociados */}
            <div className="border-t border-[#2c3a4f] pt-2">
              <button
                onClick={() => toggleAcc('assoc')}
                className="w-full flex items-center justify-between text-slate-200 font-semibold py-1"
              >
                <span>Elementos asociados</span>
                {openAcc.assoc ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {openAcc.assoc && (
                <div className="mt-1 space-y-1 text-[11px] text-slate-300">
                  <div>• Sumideros activos ({solved.hydrology.actualSumideros})</div>
                  <div>• Canalones ({solved.hydrology.gutterEvaluations.length} tramos)</div>
                  {selectedFace.sourceEdgeId && (
                    <button
                      onClick={() => {
                        const ed = solved.edges.find(
                          (e) =>
                            e.faceIds.includes(selectedFace.id) &&
                            e.sourceEdgeId === selectedFace.sourceEdgeId
                        );
                        if (ed) setSelectedEntity({ kind: 'edge', edgeId: ed.id });
                      }}
                      className="text-blue-400 hover:underline text-left mt-1 block"
                    >
                      Editar arista de arranque / alero →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Accordion: Comprobaciones Normativas */}
            <div className="border-t border-[#2c3a4f] pt-2">
              <button
                onClick={() => toggleAcc('norm')}
                className="w-full flex items-center justify-between text-slate-200 font-semibold py-1"
              >
                <span>Comprobaciones Normativas</span>
                {openAcc.norm ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {openAcc.norm && (
                <div className="mt-1.5 space-y-1.5 text-[11px]">
                  {solved.normative.checks.slice(0, 6).map((chk) => {
                    const canFix =
                      chk.status !== 'CUMPLE' &&
                      chk.status !== 'NO APLICABLE' &&
                      [
                        'cte-hs1-tabla210',
                        'cte-hs1-tabla29',
                        'cte-hs5-tabla46',
                        'cte-hs5-tabla47',
                        'cte-hs5-tabla48',
                        'cte-hs5-tabla48-missing',
                        'cte-hs5-escorrentia',
                        'cte-hs1-paramentos',
                        'cte-hs1-aleros',
                        'cte-hs1-limahoyas',
                        'cte-hs1-cumbreras',
                        'cte-hs1-emergentes',
                        'cte-he1-transmitancia',
                        'cte-he1-condensacion',
                        'cte-sua1-peto',
                      ].includes(chk.id);
                    return (
                      <div key={chk.id} className="flex items-center gap-1.5">
                        <StatusBadgeIcon status={chk.status} />
                        <span className="text-slate-200 truncate flex-1" title={chk.title}>
                          {chk.code.replace('CTE ', '')}
                        </span>
                        {canFix && (
                          <button
                            onClick={() => autoFixNormativeRule(chk.id)}
                            className="px-1.5 py-0.5 rounded bg-emerald-700/80 hover:bg-emerald-600 text-[10px] font-semibold text-white shrink-0"
                            title="Corregir automáticamente según CTE"
                          >
                            Corregir
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={onOpenNormativaModal}
                    className="w-full text-center text-blue-400 hover:text-blue-300 pt-1 text-[11px] font-medium"
                  >
                    Ver informe completo →
                  </button>
                </div>
              )}
            </div>

            {/* Accordion: Ecuación matemática y didáctica */}
            <div className="border-t border-[#2c3a4f] pt-2">
              <button
                onClick={() => toggleAcc('math')}
                className="w-full flex items-center justify-between text-slate-200 font-semibold py-1"
              >
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  Ecuación y Concepto
                </span>
                {openAcc.math ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {openAcc.math && (
                <div className="mt-1.5 space-y-1.5 text-[11px] bg-[#121822] p-2 rounded border border-[#2c3a4f]">
                  <div className="font-mono text-blue-300">
                    z = {selectedFace.plane.a.toFixed(3)}x {selectedFace.plane.b >= 0 ? '+' : ''}
                    {selectedFace.plane.b.toFixed(3)}y {selectedFace.plane.c >= 0 ? '+' : ''}
                    {selectedFace.plane.c.toFixed(3)}
                  </div>
                  <div className="text-slate-400">
                    Residuo planaridad: {(selectedFace.planarityMaxResidual * 1000).toFixed(4)} mm
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Un faldón es un plano inclinado cuya máxima pendiente sigue el vector gradiente.
                    Las rectas donde dos faldones se cortan generan cumbreras, limatesas o limahoyas.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* CASE 2: EDGE SELECTED (Cumbrera / Limatesa / Limahoya / Alero / Pretil) */}
        {selectedEdge && (
          <div className="space-y-3">
            <div className="pb-2 border-b border-[#2c3a4f]">
              <div className="text-sm font-bold text-white capitalize">
                {selectedEdge.type.replace('_', ' ')}
              </div>
              <div className="text-[11px] text-slate-400">Arista topológica {selectedEdge.id}</div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Longitud en planta:</span>
                <span className="font-mono text-slate-100">{selectedEdge.length2D.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Longitud real 3D:</span>
                <span className="font-mono text-slate-100">{selectedEdge.length3D.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Pendiente longitudinal:</span>
                <span className="font-mono text-slate-100">{selectedEdge.slopePct.toFixed(2)} %</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cotas extremas:</span>
                <span className="font-mono text-slate-100">
                  +{selectedEdge.p1.z.toFixed(2)} / +{selectedEdge.p2.z.toFixed(2)} m
                </span>
              </div>
            </div>

            {/* Editable perimeter edge properties when sourceEdgeId exists */}
            {selectedEdge.sourceEdgeId && (() => {
              const body = project.bodies.find((b) => b.id === selectedEdge.bodyId);
              const cfg = body?.edgeConfigs[selectedEdge.sourceEdgeId!];
              if (!body || !cfg) return null;
              return (
                <div className="border-t border-[#2c3a4f] pt-2.5 space-y-2">
                  <div className="font-semibold text-slate-200">Configuración de borde</div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tipo borde:</span>
                    <select
                      value={cfg.type}
                      onChange={(e) =>
                        updateEdgeConfig(body.id, cfg.edgeId, {
                          type: e.target.value as typeof cfg.type,
                        })
                      }
                      className="bg-[#111720] border border-[#304057] rounded px-1.5 py-1 text-slate-100"
                    >
                      <option value="eave">Alero vertiente</option>
                      <option value="gable">Hastial / Piñón</option>
                      <option value="parapet">Pretil</option>
                      <option value="wall_abutment">Encuentro paramento</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Cota alero (m):</span>
                    <input
                      type="number"
                      step={0.1}
                      value={cfg.eaveHeight}
                      onChange={(e) =>
                        updateEdgeConfig(body.id, cfg.edgeId, {
                          eaveHeight: Number(e.target.value),
                        })
                      }
                      className="w-20 bg-[#111720] border border-[#304057] rounded px-1.5 py-1 text-right font-mono"
                    />
                  </div>
                  {cfg.type === 'eave' && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Pendiente (%):</span>
                        <input
                          type="number"
                          step={1}
                          min={0.5}
                          value={cfg.slopePct}
                          onChange={(e) =>
                            updateEdgeConfig(body.id, cfg.edgeId, {
                              slopePct: Math.max(0.5, Number(e.target.value)),
                            })
                          }
                          className="w-20 bg-[#111720] border border-[#304057] rounded px-1.5 py-1 text-right font-mono"
                        />
                      </div>
                      <label className="flex items-center justify-between cursor-pointer pt-1">
                        <span className="text-slate-300">Dispone de canalón:</span>
                        <input
                          type="checkbox"
                          checked={cfg.hasGutter}
                          onChange={(e) =>
                            updateEdgeConfig(body.id, cfg.edgeId, { hasGutter: e.target.checked })
                          }
                          className="accent-blue-500"
                        />
                      </label>
                      {cfg.hasGutter && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Diámetro canalón:</span>
                            <select
                              value={cfg.gutterDiameterMm}
                              onChange={(e) =>
                                updateEdgeConfig(body.id, cfg.edgeId, {
                                  gutterDiameterMm: Number(e.target.value) as 100 | 125 | 150 | 200 | 250,
                                })
                              }
                              className="bg-[#111720] border border-[#304057] rounded px-1.5 py-1 font-mono"
                            >
                              <option value={100}>DN 100 mm</option>
                              <option value={125}>DN 125 mm</option>
                              <option value={150}>DN 150 mm</option>
                              <option value={200}>DN 200 mm</option>
                              <option value={250}>DN 250 mm</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Pend. canalón (%):</span>
                            <input
                              type="number"
                              step={0.25}
                              min={0.25}
                              value={cfg.gutterSlopePct}
                              onChange={(e) =>
                                updateEdgeConfig(body.id, cfg.edgeId, {
                                  gutterSlopePct: Number(e.target.value),
                                })
                              }
                              className="w-20 bg-[#111720] border border-[#304057] rounded px-1.5 py-1 text-right font-mono"
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {(cfg.type === 'parapet' || cfg.type === 'wall_abutment') && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Entrega remate (m):</span>
                      <input
                        type="number"
                        step={0.05}
                        min={0.05}
                        value={cfg.flashingHeight}
                        onChange={(e) =>
                          updateEdgeConfig(body.id, cfg.edgeId, {
                            flashingHeight: Number(e.target.value),
                          })
                        }
                        className="w-20 bg-[#111720] border border-[#304057] rounded px-1.5 py-1 text-right font-mono"
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Visual Cross-Section Educational Micro-Card */}
            <div className="bg-[#121822] border border-[#2c3a4f] rounded-md p-2.5 text-[11px] text-slate-300 space-y-2">
              <div className="flex items-center gap-2.5">
                <svg viewBox="0 0 60 32" className="w-14 h-8 shrink-0 bg-[#0d131c] rounded border border-[#253145]">
                  {selectedEdge.type === 'limahoya' ? (
                    <>
                      <polyline points="6,8 30,24 54,8" fill="none" stroke="#0ea5e9" strokeWidth="2.5" />
                      <circle cx="30" cy="24" r="3" fill="#38bdf8" />
                      <path d="M12,8 L24,16 M48,8 L36,16" stroke="#7dd3fc" strokeWidth="1.2" />
                    </>
                  ) : selectedEdge.type === 'cumbrera' || selectedEdge.type === 'limatesa' ? (
                    <>
                      <polyline points="6,24 30,8 54,24" fill="none" stroke={selectedEdge.type === 'cumbrera' ? '#ef4444' : '#f59e0b'} strokeWidth="2.5" />
                      <circle cx="30" cy="8" r="3" fill="#fde047" />
                      <path d="M24,14 L12,22 M36,14 L48,22" stroke="#7dd3fc" strokeWidth="1.2" />
                    </>
                  ) : (
                    <>
                      <polyline points="8,8 42,22 52,22" fill="none" stroke="#e2e8f0" strokeWidth="2.4" />
                      <path d="M46,24 L46,30" stroke="#38bdf8" strokeWidth="2" />
                    </>
                  )}
                </svg>
                <div className="text-[11px] leading-snug">
                  {selectedEdge.type === 'limahoya' &&
                    'Arista cóncava: recoge agua de dos faldones. Mín. 20 cm de canal libre (DB-HS 1).'}
                  {selectedEdge.type === 'cumbrera' &&
                    'Arista horizontal alta: divide el agua hacia dos vertientes opuestas.'}
                  {selectedEdge.type === 'limatesa' &&
                    'Arista inclinada saliente: separa la escorrentía hacia los lados.'}
                  {selectedEdge.type === 'alero' &&
                    'Borde inferior libre: vierte el agua al canalón o al exterior.'}
                  {(selectedEdge.type === 'pretil' || selectedEdge.type === 'encuentro_paramento') &&
                    'Encuentro contra muro vertical: exige entrega impermeable >= 25 cm.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CASE 3: VERTEX SELECTED */}
        {selectedVertex && selectedVertexBody && (
          <div className="space-y-3">
            <div className="pb-2 border-b border-[#2c3a4f]">
              <div className="text-sm font-bold text-white">Vértice {selectedVertex.id}</div>
              <div className="text-[11px] text-slate-400">{selectedVertexBody.name}</div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Coordenada X (m):</span>
                <input
                  type="number"
                  step={0.1}
                  value={selectedVertex.x}
                  onChange={(e) =>
                    moveVertex(
                      selectedVertexBody.id,
                      selectedVertex.id,
                      Number(e.target.value),
                      selectedVertex.y,
                      selectedEntity?.kind === 'vertex' ? selectedEntity.holeId : undefined
                    )
                  }
                  className="w-24 bg-[#111720] border border-[#304057] rounded px-2 py-1 text-right font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Coordenada Y (m):</span>
                <input
                  type="number"
                  step={0.1}
                  value={selectedVertex.y}
                  onChange={(e) =>
                    moveVertex(
                      selectedVertexBody.id,
                      selectedVertex.id,
                      selectedVertex.x,
                      Number(e.target.value),
                      selectedEntity?.kind === 'vertex' ? selectedEntity.holeId : undefined
                    )
                  }
                  className="w-24 bg-[#111720] border border-[#304057] rounded px-2 py-1 text-right font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* CASE 4: DRAIN SELECTED */}
        {selectedDrain && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#2c3a4f]">
              <div>
                <div className="text-sm font-bold text-white">{selectedDrain.label}</div>
                <div className="text-[11px] text-slate-400 capitalize">{selectedDrain.kind}</div>
              </div>
              <button
                onClick={() => removeDrain(selectedDrain.id)}
                className="p-1.5 text-rose-400 hover:bg-rose-950/50 rounded"
                title="Eliminar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Diámetro (mm):</span>
                <input
                  type="number"
                  value={selectedDrain.diameterMm}
                  onChange={(e) =>
                    updateDrain(selectedDrain.id, { diameterMm: Number(e.target.value) })
                  }
                  className="w-20 bg-[#111720] border border-[#304057] rounded px-2 py-1 text-right font-mono"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Conectado a:</span>
                <select
                  value={selectedDrain.connectedDownspoutId || ''}
                  onChange={(e) =>
                    updateDrain(selectedDrain.id, {
                      connectedDownspoutId: e.target.value || undefined,
                    })
                  }
                  className="bg-[#111720] border border-[#304057] rounded px-1.5 py-1 text-slate-100"
                >
                  <option value="">Automático</option>
                  {project.downspouts.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.label}
                    </option>
                  ))}
                </select>
              </div>
              {(() => {
                const ev = solved.hydrology.drainEvaluations.find(
                  (x) => x.drainId === selectedDrain.id
                );
                if (!ev) return null;
                return (
                  <div className="bg-[#121822] p-2 rounded border border-[#2c3a4f] space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Sup. horizontal servida:</span>
                      <span className="font-mono text-cyan-300">
                        {ev.tributaryProjectedAreaM2.toFixed(2)} m²
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Sup. corregida (f={solved.hydrology.intensityFactor.toFixed(2)}):</span>
                      <span className="font-mono text-slate-100">
                        {ev.correctedAreaM2.toFixed(2)} m²
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* CASE 5: DOWNSPOUT SELECTED */}
        {selectedDownspout && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#2c3a4f]">
              <div>
                <div className="text-sm font-bold text-white">{selectedDownspout.label}</div>
                <div className="text-[11px] text-slate-400">Bajante pluvial (DB-HS 5 Tabla 4.8)</div>
              </div>
              <button
                onClick={() => removeDownspout(selectedDownspout.id)}
                className="p-1.5 text-rose-400 hover:bg-rose-950/50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Diámetro nominal:</span>
              <select
                value={selectedDownspout.diameterMm}
                onChange={(e) =>
                  updateDownspout(selectedDownspout.id, {
                    diameterMm: Number(e.target.value) as typeof selectedDownspout.diameterMm,
                  })
                }
                className="bg-[#111720] border border-[#304057] rounded px-2 py-1 font-mono"
              >
                {[50, 63, 75, 90, 110, 125, 160, 200].map((d) => (
                  <option key={d} value={d}>
                    DN {d} mm
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const ev = solved.hydrology.downspoutEvaluations.find(
                (x) => x.downspoutId === selectedDownspout.id
              );
              if (!ev) return null;
              return (
                <div className="bg-[#121822] p-2 rounded border border-[#2c3a4f] space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sup. corregida:</span>
                    <span className="font-mono">{ev.correctedAreaM2.toFixed(2)} m²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Máx. Tabla 4.8:</span>
                    <span className="font-mono">{ev.maxAllowedAreaM2} m²</span>
                  </div>
                  <div className={ev.compliesTabla48 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                    {ev.compliesTabla48
                      ? 'CUMPLE DB-HS 5'
                      : `INSUFICIENTE (Mín. DN ${ev.recommendedMinMm} mm)`}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* CASE 6: SINGULAR ELEMENT SELECTED */}
        {selectedSingular && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#2c3a4f]">
              <div>
                <div className="text-sm font-bold text-white">{selectedSingular.label}</div>
                <div className="text-[11px] text-slate-400 capitalize">{selectedSingular.kind}</div>
              </div>
              <button
                onClick={() => removeSingular(selectedSingular.id)}
                className="p-1.5 text-rose-400 hover:bg-rose-950/50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Ancho (m):</span>
                <input
                  type="number"
                  step={0.05}
                  value={selectedSingular.width}
                  onChange={(e) =>
                    updateSingular(selectedSingular.id, { width: Math.max(0.2, Number(e.target.value)) })
                  }
                  className="w-20 bg-[#111720] border border-[#304057] rounded px-2 py-1 text-right font-mono"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Fondo (m):</span>
                <input
                  type="number"
                  step={0.05}
                  value={selectedSingular.depth}
                  onChange={(e) =>
                    updateSingular(selectedSingular.id, { depth: Math.max(0.2, Number(e.target.value)) })
                  }
                  className="w-20 bg-[#111720] border border-[#304057] rounded px-2 py-1 text-right font-mono"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Altura remate (m):</span>
                <input
                  type="number"
                  step={0.05}
                  value={selectedSingular.flashingHeight}
                  onChange={(e) =>
                    updateSingular(selectedSingular.id, {
                      flashingHeight: Math.max(0.05, Number(e.target.value)),
                    })
                  }
                  className="w-20 bg-[#111720] border border-[#304057] rounded px-2 py-1 text-right font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* CASE 7: CONSTRUCTIVE LAYER SELECTED */}
        {selectedLayer && (
          <div className="space-y-3">
            <div className="pb-2 border-b border-[#2c3a4f]">
              <div className="text-sm font-bold text-white">{selectedLayer.name}</div>
              <div className="text-[11px] text-slate-400">{selectedLayer.material}</div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Espesor (cm):</span>
                <input
                  type="number"
                  step={0.5}
                  min={0.1}
                  value={selectedLayer.thicknessCm}
                  onChange={(e) =>
                    updateLayer(selectedLayer.id, { thicknessCm: Math.max(0.1, Number(e.target.value)) })
                  }
                  className="w-20 bg-[#111720] border border-[#304057] rounded px-2 py-1 text-right font-mono"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Conductividad λ:</span>
                <input
                  type="number"
                  step={0.005}
                  min={0.01}
                  value={selectedLayer.lambdaWMK}
                  onChange={(e) =>
                    updateLayer(selectedLayer.id, { lambdaWMK: Math.max(0.01, Number(e.target.value)) })
                  }
                  className="w-20 bg-[#111720] border border-[#304057] rounded px-2 py-1 text-right font-mono"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Densidad (kg/m³):</span>
                <input
                  type="number"
                  step={50}
                  value={selectedLayer.densityKgM3}
                  onChange={(e) =>
                    updateLayer(selectedLayer.id, { densityKgM3: Math.max(10, Number(e.target.value)) })
                  }
                  className="w-20 bg-[#111720] border border-[#304057] rounded px-2 py-1 text-right font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tile Spec Quick Params & Student From-Zero Guide when project or blank canvas active */}
        {!selectedFace &&
          !selectedEdge &&
          !selectedVertex &&
          !selectedDrain &&
          !selectedDownspout &&
          !selectedSingular &&
          !selectedLayer && (
            <div className="space-y-3">
              <div className="pb-2 border-b border-[#2c3a4f]">
                <div className="text-sm font-bold text-white">{project.name}</div>
                <div className="text-[11px] text-slate-400">{sysMeta.name}</div>
              </div>

              {project.bodies.length === 0 && (
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-lg p-3 space-y-2 text-[11px] text-slate-200 leading-relaxed">
                  <div className="font-bold text-emerald-300">Guía rápida de aprendizaje</div>
                  <p>1. Haz clic en la lámina 2D para iniciar el perímetro del edificio.</p>
                  <p>
                    2. Mueve el cursor (se alinea a 0°/45°/90°) o{' '}
                    <strong>teclea la longitud en metros + Enter</strong>.
                  </p>
                  <p>
                    3. Cierra sobre el punto verde inicial: el motor resolverá automáticamente todos los faldones, cumbreras, limatesas, limahoyas, evacuación y el edificio 3D completo.
                  </p>
                </div>
              )}

              <div className="space-y-1.5 text-[11px]">
                <div className="font-semibold text-slate-200">Parámetros de replanteo de teja</div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Vuelo alero (cm):</span>
                  <input
                    type="number"
                    value={project.tileSpec.eaveOverhangCm}
                    onChange={(e) => updateTileSpec({ eaveOverhangCm: Number(e.target.value) })}
                    className="w-16 bg-[#111720] border border-[#304057] rounded px-1.5 py-0.5 text-right font-mono"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Solape caballete (cm):</span>
                  <input
                    type="number"
                    value={project.tileSpec.ridgeOverlapCm}
                    onChange={(e) => updateTileSpec({ ridgeOverlapCm: Number(e.target.value) })}
                    className="w-16 bg-[#111720] border border-[#304057] rounded px-1.5 py-0.5 text-right font-mono"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Separación limahoya (cm):</span>
                  <input
                    type="number"
                    value={project.tileSpec.valleyGapCm}
                    onChange={(e) => updateTileSpec({ valleyGapCm: Number(e.target.value) })}
                    className="w-16 bg-[#111720] border border-[#304057] rounded px-1.5 py-0.5 text-right font-mono"
                  />
                </div>
              </div>
            </div>
          )}
      </div>
    </aside>
  );
};
