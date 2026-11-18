import React, { useState } from 'react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useRoofStore } from '../../store/useRoofStore';
import {
  buildLocationFromPreset,
  MUNICIPALITY_PRESETS,
} from '../../engine/hydrology/pluviometry';
import {
  CTE_VERSIONS,
  TABLA_210_CUBIERTAS_INCLINADAS,
  TABLA_29_CUBIERTAS_PLANAS,
} from '../../engine/normative/cteDatabase';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  MinusCircle,
  X,
  MapPin,
  Crosshair,
  Wrench,
} from 'lucide-react';
import type { NormativeStatus } from '../../types/solved';

const FIXABLE_CTE_CHECKS = new Set([
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

interface NormativaModalProps {
  onClose: () => void;
}

const StatusPill: React.FC<{ status: NormativeStatus }> = ({ status }) => {
  const styles: Record<NormativeStatus, string> = {
    CUMPLE: 'bg-emerald-950 text-emerald-300 border-emerald-500/50',
    'NO CUMPLE': 'bg-rose-950 text-rose-300 border-rose-500/50',
    'PENDIENTE DE DATOS': 'bg-sky-950 text-sky-300 border-sky-500/50',
    'NO APLICABLE': 'bg-slate-800 text-slate-400 border-slate-600/50',
    'REVISIÓN TÉCNICA': 'bg-amber-950 text-amber-300 border-amber-500/50',
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
};

export const NormativaModal: React.FC<NormativaModalProps> = ({ onClose }) => {
  useEscapeClose(onClose);
  const {
    project,
    solved,
    setLocation,
    setHighlightedPoint,
    setSelectedEntity,
    setHasWaterproofing,
    autoFixNormativeRule,
  } = useRoofStore();

  const [tab, setTab] = useState<'auditoria' | 'ubicacion' | 'tablas'>('auditoria');

  const handleLocSelect = (municipality: string) => {
    const preset = MUNICIPALITY_PRESETS.find((m) => m.municipality === municipality);
    if (!preset) return;
    setLocation(buildLocationFromPreset(preset));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#161e2b] border border-[#304057] rounded-xl w-full max-w-5xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#1b2434] border-b border-[#2c3a4f] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Comprobación Normativa · Código Técnico de la Edificación (CTE)
              <StatusPill status={solved.normative.overallStatus} />
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Base de reglas versionada (RD 314/2006 y modificaciones vigentes) · Distingue exigencias reglamentarias de criterios orientativos
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded hover:bg-[#2a384c] text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="px-5 pt-2 bg-[#141b26] border-b border-[#2c3a4f] flex gap-2 text-xs">
          {[
            { id: 'auditoria', label: `Informe de Comprobación (${solved.normative.checks.length})` },
            { id: 'ubicacion', label: 'Emplazamiento, Pluviometría (Apéndice B) y Clima' },
            { id: 'tablas', label: 'Tablas Oficiales DB-HS 1 y Versionado CTE' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3.5 py-2 rounded-t font-medium border-b-2 transition ${
                tab === t.id
                  ? 'text-blue-300 border-blue-500 bg-[#1a2434]'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {tab === 'auditoria' && (
            <>
              {/* Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {(
                  [
                    { k: 'CUMPLE', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
                    { k: 'NO CUMPLE', icon: <XCircle className="w-4 h-4 text-rose-400" /> },
                    { k: 'REVISIÓN TÉCNICA', icon: <AlertTriangle className="w-4 h-4 text-amber-400" /> },
                    { k: 'PENDIENTE DE DATOS', icon: <HelpCircle className="w-4 h-4 text-sky-400" /> },
                    { k: 'NO APLICABLE', icon: <MinusCircle className="w-4 h-4 text-slate-400" /> },
                  ] as const
                ).map((item) => (
                  <div
                    key={item.k}
                    className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-2.5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span className="text-[11px] font-medium text-slate-300">{item.k}</span>
                    </div>
                    <span className="text-base font-bold font-mono text-white">
                      {solved.normative.counts[item.k]}
                    </span>
                  </div>
                ))}
              </div>

              {/* Waterproofing toggle quick note */}
              <div className="bg-[#1a2333] border border-[#2c3a4f] rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-200">
                    Condición de ámbito Tabla 2.10 (DB-HS 1): Capa de impermeabilización bajo cobertura
                  </div>
                  <div className="text-[11px] text-slate-400">
                    La Tabla 2.10 solo obliga directamente cuando la cubierta inclinada carece de impermeabilización inferior.
                  </div>
                </div>
                <label className="flex items-center gap-2 bg-[#121822] px-3 py-1.5 rounded border border-[#304057] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={project.hasWaterproofing}
                    onChange={(e) => setHasWaterproofing(e.target.checked)}
                    className="accent-blue-500"
                  />
                  <span className="font-medium text-slate-100">Incluye lámina impermeabilizante</span>
                </label>
              </div>

              {/* Checks list */}
              <div className="space-y-2.5">
                {solved.normative.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-3.5 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusPill status={chk.status} />
                        <span className="font-mono text-blue-300 font-semibold">{chk.code}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#121822] border border-[#2c3a4f] text-[10px] uppercase text-slate-300">
                          {chk.character === 'reglamentario'
                            ? 'Articulado obligatorio'
                            : 'Orientativo / DA'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {chk.status !== 'CUMPLE' &&
                          chk.status !== 'NO APLICABLE' &&
                          FIXABLE_CTE_CHECKS.has(chk.id) && (
                            <button
                              onClick={() => autoFixNormativeRule(chk.id)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold shadow-sm"
                              title="Aplicar corrección paramétrica automática conforme al CTE"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              <span>Corregir según CTE</span>
                            </button>
                          )}
                        {chk.targetLocation && (
                          <button
                            onClick={() => {
                              setHighlightedPoint(chk.targetLocation!);
                              if (chk.targetEntityKind === 'face' && chk.targetEntityId) {
                                setSelectedEntity({ kind: 'face', faceId: chk.targetEntityId });
                              }
                              onClose();
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/25 hover:bg-blue-600/40 border border-blue-500/50 text-blue-200 text-[11px]"
                          >
                            <Crosshair className="w-3.5 h-3.5" />
                            <span>Señalar en plano 2D/3D</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-sm font-bold text-white">{chk.title}</div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-[#121822] p-2.5 rounded border border-[#253145]">
                      <div>
                        <span className="text-slate-400">Valor exigible: </span>
                        <span className="text-slate-100 font-medium">{chk.requiredValue}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Medición del proyecto: </span>
                        <span className="text-cyan-200 font-mono font-medium">{chk.measuredValue}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-300 leading-relaxed">
                      <strong className="text-slate-200">Qué se comprueba y por qué: </strong>
                      {chk.studentExplanation}
                    </div>
                    <div className="text-[11px] text-emerald-300/90">
                      <strong>Acción técnica: </strong>
                      {chk.remediation}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'ubicacion' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <MapPin className="w-4 h-4 text-blue-400" />
                  <span>Emplazamiento del proyecto (Apéndice B DB-HS)</span>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Municipio / Capital de provincia:</label>
                  <select
                    value={project.location.municipality}
                    onChange={(e) => handleLocSelect(e.target.value)}
                    className="w-full bg-[#121822] border border-[#304057] rounded px-3 py-2 text-slate-100"
                  >
                    {MUNICIPALITY_PRESETS.map((m) => (
                      <option key={m.municipality} value={m.municipality}>
                        {m.municipality} ({m.province}) — Zona Pluv. {m.pluviometricZone}, Isoyeta {m.isohyet}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] bg-[#121822] p-3 rounded border border-[#2c3a4f]">
                  <div>
                    <span className="text-slate-400">Zona Pluviométrica:</span>
                    <div className="font-mono text-white font-bold">Zona {project.location.pluviometricZone}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Isoyeta Apéndice B:</span>
                    <div className="font-mono text-white font-bold">{project.location.isohyet}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Intensidad Tabla B.1:</span>
                    <div className="font-mono text-cyan-300 font-bold">{project.location.rainIntensityMmH} mm/h</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Factor f = i / 100:</span>
                    <div className="font-mono text-cyan-300 font-bold">
                      {solved.hydrology.intensityFactor.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-[#2c3a4f] pt-3">
                  <label className="block text-slate-300 font-medium">
                    Intensidad manual justificada (opcional, mm/h):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Ej. 140 (0 = usar Tabla B.1)"
                      value={project.location.manualIntensityOverride ?? ''}
                      onChange={(e) =>
                        setLocation({
                          ...project.location,
                          manualIntensityOverride: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      className="w-40 bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 font-mono text-white"
                    />
                    <input
                      type="text"
                      placeholder="Justificación técnica / AEMET..."
                      value={project.location.manualJustification ?? ''}
                      onChange={(e) =>
                        setLocation({
                          ...project.location,
                          manualJustification: e.target.value,
                        })
                      }
                      className="flex-1 bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 text-slate-100"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-4 space-y-3">
                <div className="text-sm font-bold text-white">
                  Condiciones Climáticas, Higrotérmicas y Acciones (DB-HE / DB-SE-AE)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Zona climática invierno:</label>
                    <select
                      value={project.location.climateZoneWinter}
                      onChange={(e) =>
                        setLocation({
                          ...project.location,
                          climateZoneWinter: e.target.value as typeof project.location.climateZoneWinter,
                        })
                      }
                      className="w-full bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 font-mono"
                    >
                      {['alpha', 'A', 'B', 'C', 'D', 'E'].map((z) => (
                        <option key={z} value={z}>
                          Zona {z}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Zona eólica (DB-SE-AE):</label>
                    <select
                      value={project.location.windZone}
                      onChange={(e) =>
                        setLocation({
                          ...project.location,
                          windZone: e.target.value as 'A' | 'B' | 'C',
                        })
                      }
                      className="w-full bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 font-mono"
                    >
                      <option value="A">Zona A (qb=0.42 kN/m²)</option>
                      <option value="B">Zona B (qb=0.45 kN/m²)</option>
                      <option value="C">Zona C (qb=0.52 kN/m²)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Carga nieve base Sk (kN/m²):</label>
                    <input
                      type="number"
                      step={0.1}
                      value={project.location.snowLoadKnM2}
                      onChange={(e) =>
                        setLocation({ ...project.location, snowLoadKnM2: Number(e.target.value) })
                      }
                      className="w-full bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Tª exterior diseño (°C):</label>
                    <input
                      type="number"
                      step={1}
                      value={project.location.outdoorTempC ?? ''}
                      onChange={(e) =>
                        setLocation({
                          ...project.location,
                          outdoorTempC: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>

                <div className="bg-[#121822] p-3 rounded border border-[#2c3a4f] text-[11px] space-y-1">
                  <div className="font-semibold text-amber-300">Resumen de Acciones DB-SE-AE</div>
                  <div>Peso propio capas (G): {solved.normative.structuralActions.deadLoadLayersKnM2.toFixed(2)} kN/m²</div>
                  <div>Sobrecarga uso (Q): {solved.normative.structuralActions.liveLoadKnM2.toFixed(2)} kN/m²</div>
                  <div>Nieve reducida por pendiente: {solved.normative.structuralActions.snowLoadKnM2.toFixed(2)} kN/m²</div>
                  <div className="text-slate-400 italic pt-1">{solved.normative.structuralActions.note}</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'tablas' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-3">
                  <h4 className="font-bold text-white mb-2">DB-HS 1 · Tabla 2.10 (Cubiertas inclinadas sin impermeabilización)</h4>
                  <table className="w-full text-[11px]">
                    <thead className="text-slate-400 border-b border-[#2c3a4f]">
                      <tr>
                        <th className="py-1 text-left">Tipo de tejado</th>
                        <th className="py-1 text-right">Pendiente mín.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#253145]">
                      {TABLA_210_CUBIERTAS_INCLINADAS.map((r) => (
                        <tr key={r.id}>
                          <td className="py-1 text-slate-200">{r.label}</td>
                          <td className="py-1 text-right font-mono text-blue-300">{r.minSlopePct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-4">
                  <div className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-3">
                    <h4 className="font-bold text-white mb-2">DB-HS 1 · Tabla 2.9 (Cubiertas planas)</h4>
                    <table className="w-full text-[11px]">
                      <thead className="text-slate-400 border-b border-[#2c3a4f]">
                        <tr>
                          <th className="py-1 text-left">Uso / Protección</th>
                          <th className="py-1 text-right">Intervalo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#253145]">
                        {TABLA_29_CUBIERTAS_PLANAS.map((r) => (
                          <tr key={r.usage}>
                            <td className="py-1 text-slate-200">{r.label}</td>
                            <td className="py-1 text-right font-mono text-blue-300">
                              {r.minSlopePct}% – {r.maxSlopePct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-3">
                    <h4 className="font-bold text-white mb-2">Versionado Reglamentario Aplicado</h4>
                    <div className="space-y-1.5 text-[11px]">
                      {CTE_VERSIONS.map((v) => (
                        <div key={v.document} className="border-b border-[#253145] pb-1">
                          <div className="font-semibold text-blue-300">
                            {v.document} — {v.title}
                          </div>
                          <div className="text-slate-400">
                            {v.baseDecree} · {v.latestRevision}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
