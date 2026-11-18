import React, { useState } from 'react';
import { useRoofStore } from '../../store/useRoofStore';
import { CteBadgeIcon } from '../icons/AppIcons';
import { ROOF_SYSTEMS } from '../../engine/presets/materials';
import { ConstructiveCutawayCanvas } from '../workspace/ConstructiveCutawayCanvas';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  FileCheck2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface BottomDockProps {
  onOpenNormativaModal: () => void;
  onOpenExportModal: () => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  onOpenNormativaModal,
  onOpenExportModal,
}) => {
  const {
    project,
    solved,
    selectedEntity,
    setSelectedEntity,
    setHighlightedPoint,
    setViewMode,
    autoFixNormativeRule,
  } = useRoofStore();

  const [activeTab, setActiveTab] = useState<'superficies' | 'evacuacion' | 'capas'>('superficies');
  const [minimized, setMinimized] = useState(false);

  const visibleLayers = project.layers.filter((l) => l.visible);
  const sysMeta = ROOF_SYSTEMS[project.systemId];

  const fixableIds = new Set([
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
  ]);

  const diagnosticItems = [
    ...solved.solverIssues.map((si) => ({
      id: si.id,
      fixId: undefined as string | undefined,
      severity: si.severity,
      text: si.message,
      location: si.location,
    })),
    ...solved.hydrology.alerts.map((al) => ({
      id: al.id,
      fixId: 'cte-hs5-escorrentia',
      severity: al.severity,
      text: al.title,
      location: al.location,
    })),
    ...solved.normative.checks
      .filter((c) => c.status !== 'CUMPLE' && c.status !== 'NO APLICABLE')
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        fixId: fixableIds.has(c.id) ? c.id : undefined,
        severity: c.status === 'NO CUMPLE' ? ('error' as const) : ('info' as const),
        text: `${c.status === 'REVISIÓN TÉCNICA' ? 'Pendiente de revisión' : c.status}: ${c.title}`,
        location: c.targetLocation,
      })),
  ];

  return (
    <section
      className={`bg-[#161e2b] border-t border-[#2c3a4f] shrink-0 transition-all duration-150 ${
        minimized ? 'h-8' : 'h-[192px]'
      } flex flex-col select-none`}
    >
      {minimized ? (
        <div className="h-8 px-3 flex items-center justify-between text-xs text-slate-300">
          <span>Panel Técnico Inferior (Mediciones · Capas · Normativa · Avisos)</span>
          <button onClick={() => setMinimized(false)} className="p-1 hover:text-white">
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.25fr_1.45fr_0.95fr_1.15fr] divide-y lg:divide-y-0 lg:divide-x divide-[#2c3a4f] overflow-hidden">
          {/* PANEL 1: Cuadro de superficies / Evacuación de aguas / Capas constructivas */}
          <div className="flex flex-col overflow-hidden bg-[#17202d]">
            <div className="flex items-center border-b border-[#2c3a4f] bg-[#141b26] px-1.5 pt-1 gap-1 shrink-0">
              {(
                [
                  { id: 'superficies', label: 'Cuadro de superficies' },
                  { id: 'evacuacion', label: 'Evacuación de aguas' },
                  { id: 'capas', label: 'Capas constructivas' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-t transition ${
                    activeTab === t.id
                      ? 'bg-[#1f2c3e] text-blue-300 border-t-2 border-blue-500'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-2.5 py-1.5 text-[11px]">
              {activeTab === 'superficies' && (
                <table className="w-full text-left border-collapse">
                  <thead className="text-slate-400 border-b border-[#2c3a4f]">
                    <tr>
                      <th className="py-1 font-medium">Elemento</th>
                      <th className="py-1 font-medium text-right">Proy. (m²)</th>
                      <th className="py-1 font-medium text-right">Incl. (m²)</th>
                      <th className="py-1 font-medium text-right">Pend.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232f42] tabular-nums">
                    {solved.measurements.perFace.map((f) => {
                      const isSel =
                        selectedEntity?.kind === 'face' && selectedEntity.faceId === f.faceId;
                      return (
                        <tr
                          key={f.faceId}
                          onClick={() => setSelectedEntity({ kind: 'face', faceId: f.faceId })}
                          className={`cursor-pointer ${
                            isSel ? 'bg-blue-600/20 text-white' : 'hover:bg-[#1e293a] text-slate-200'
                          }`}
                        >
                          <td className="py-1 font-medium">Faldón {f.label}</td>
                          <td className="py-1 text-right font-mono">{f.projectedAreaM2.toFixed(2)}</td>
                          <td className="py-1 text-right font-mono">{f.inclinedAreaM2.toFixed(2)}</td>
                          <td className="py-1 text-right font-mono">{f.slopePct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-[#364761] font-bold text-white tabular-nums">
                    <tr>
                      <td className="py-1">Total cubierta</td>
                      <td className="py-1 text-right font-mono">
                        {solved.measurements.totalProjectedAreaM2.toFixed(2)} m²
                      </td>
                      <td className="py-1 text-right font-mono">
                        {solved.measurements.totalInclinedAreaM2.toFixed(2)} m²
                      </td>
                      <td className="py-1 text-right font-mono text-slate-400">
                        {solved.measurements.estimatedTileCount
                          ? `${solved.measurements.estimatedTileCount} tejas`
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {activeTab === 'evacuacion' && (
                <div className="space-y-1.5 text-slate-200">
                  <div className="flex justify-between border-b border-[#232f42] pb-1">
                    <span className="text-slate-400">Pluviometría ({project.location.municipality}):</span>
                    <span className="font-mono">
                      i = {solved.hydrology.effectiveIntensityMmH} mm/h (f={solved.hydrology.intensityFactor.toFixed(2)})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sumideros (Tabla 4.6):</span>
                    <span className="font-mono">
                      {solved.hydrology.actualSumideros} ud{' '}
                      {solved.hydrology.minimumSumiderosTabla46 !== null
                        ? `(mín. ${solved.hydrology.minimumSumiderosTabla46})`
                        : ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Canalones (Tabla 4.7):</span>
                    <span className="font-mono">
                      {solved.hydrology.gutterEvaluations.length} tramos ({solved.measurements.gutterLengthM.toFixed(1)} m)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bajantes (Tabla 4.8):</span>
                    <span className="font-mono">{solved.hydrology.downspoutEvaluations.length} ud</span>
                  </div>
                </div>
              )}

              {activeTab === 'capas' && (
                <div className="space-y-1">
                  {visibleLayers.map((l, idx) => (
                    <div
                      key={l.id}
                      onClick={() => setSelectedEntity({ kind: 'layer', layerId: l.id })}
                      className="flex items-center justify-between py-0.5 px-1 rounded hover:bg-[#1e293a] cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: l.colorHex }}
                        />
                        <span className="truncate text-slate-200">
                          {idx + 1}. {l.name}
                        </span>
                      </div>
                      <span className="font-mono text-slate-400 shrink-0 ml-2">
                        {l.thicknessCm} cm
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PANEL 2: Sección constructiva visual + lista numerada */}
          <div className="flex flex-col overflow-hidden bg-[#17202d] p-2.5">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <h4 className="text-xs font-semibold text-slate-100 truncate">
                Sección constructiva ({sysMeta.shortName})
              </h4>
              <button
                onClick={() => setViewMode('despiece')}
                className="text-[10px] text-blue-400 hover:underline shrink-0"
              >
                Ver despiece →
              </button>
            </div>

            <div className="flex-1 grid grid-cols-[152px_1fr] gap-2 overflow-hidden items-center">
              {/* Photorealistic 3D Isometric Cutaway Block */}
              <div
                onClick={() => setViewMode('seccion')}
                className="h-full bg-gradient-to-b from-[#111927] to-[#0c121c] border border-[#2c3a4f] rounded overflow-hidden cursor-pointer flex items-center justify-center hover:border-blue-500 transition"
                title="Abrir vista de Sección Constructiva"
              >
                <ConstructiveCutawayCanvas
                  layers={project.layers}
                  systemId={project.systemId}
                  selectedLayerId={
                    selectedEntity?.kind === 'layer' ? selectedEntity.layerId : undefined
                  }
                  width={148}
                  height={128}
                />
              </div>

              {/* Numbered Layers List */}
              <div className="h-full overflow-y-auto space-y-0.5 text-[11px] pr-1">
                {visibleLayers.map((l, idx) => (
                  <div
                    key={l.id}
                    onClick={() => setSelectedEntity({ kind: 'layer', layerId: l.id })}
                    className="flex items-center gap-1.5 cursor-pointer hover:text-white text-slate-300"
                  >
                    <span className="w-4 h-4 rounded-full bg-[#2a394e] text-[9.5px] font-bold text-amber-200 flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="truncate flex-1">{l.name.replace(/^\d+\.\s*/, '')}</span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      ({l.thicknessCm} cm)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PANEL 3: Normativa aplicable (CTE Badge + DB List) */}
          <div className="flex flex-col overflow-hidden bg-[#17202d] p-2.5">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h4 className="text-xs font-semibold text-slate-100">Normativa aplicable</h4>
            </div>
            <div
              onClick={onOpenNormativaModal}
              className="flex items-center gap-2.5 cursor-pointer hover:bg-[#1f2b3d] p-1.5 rounded transition"
            >
              <CteBadgeIcon className="w-11 h-11 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white leading-tight">
                  Código Técnico de la Edificación
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">RD 314/2006 y mod. vigentes</div>
              </div>
            </div>
            <div className="mt-1.5 space-y-0.5 text-[11px] overflow-y-auto">
              {[
                { code: 'DB-HS 1', desc: 'Protección frente a la humedad' },
                { code: 'DB-HS 5', desc: 'Evacuación de aguas' },
                { code: 'DB-HE', desc: `Ahorro de energía (U=${solved.normative.thermalUValue.toFixed(2)})` },
                { code: 'DB-SE', desc: 'Seguridad estructural y acciones' },
              ].map((item) => (
                <button
                  key={item.code}
                  onClick={onOpenNormativaModal}
                  className="w-full flex items-center gap-2 text-left hover:text-blue-300 text-slate-300 py-0.5"
                >
                  <span className="font-bold text-slate-100 w-14 shrink-0">{item.code}</span>
                  <span className="truncate text-slate-400">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* PANEL 4: Mensajes y avisos + Green "Generar Informe y Planos" CTA */}
          <div className="flex flex-col justify-between overflow-hidden bg-[#17202d] p-2.5 gap-2">
            <div className="flex items-center justify-between shrink-0">
              <h4 className="text-xs font-semibold text-slate-100">Mensajes y avisos</h4>
              <button
                onClick={() => setMinimized(true)}
                className="text-slate-400 hover:text-white"
                title="Minimizar panel inferior"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5">
                {solved.isValid && solved.hydrology.alerts.length === 0 ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-slate-100 font-medium">Geometría y escorrentía válidas</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="text-rose-300 font-medium">Incidencias detectadas</span>
                  </>
                )}
              </div>

              {solved.hydrology.minimumSumiderosTabla46 !== null && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">
                    {solved.hydrology.actualSumideros} sumideros (mín. {solved.hydrology.minimumSumiderosTabla46} según tabla 4.6 DB-HS 5)
                  </span>
                </div>
              )}

              {diagnosticItems.slice(0, 2).map((d) => (
                <div key={d.id} className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (d.location) setHighlightedPoint(d.location);
                      else onOpenNormativaModal();
                    }}
                    className="flex-1 min-w-0 flex items-center gap-1.5 text-left text-slate-300 hover:text-white"
                    title="Pulse para localizar en el plano"
                  >
                    {d.severity === 'error' ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    )}
                    <span className="truncate">{d.text}</span>
                  </button>
                  {d.fixId && (
                    <button
                      onClick={() => autoFixNormativeRule(d.fixId!)}
                      className="px-1.5 py-0.5 rounded bg-emerald-700/80 hover:bg-emerald-600 text-[10px] font-semibold text-white shrink-0"
                      title="Corregir automáticamente según CTE"
                    >
                      Corregir
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={onOpenExportModal}
              className="w-full py-2 px-3 rounded-md bg-gradient-to-b from-[#55b858] to-[#3f9142] hover:from-[#5ec761] hover:to-[#47a14a] text-white font-semibold text-xs shadow-lg flex items-center justify-center gap-2 border border-emerald-400/30 transition shrink-0"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Generar Informe y Planos</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
