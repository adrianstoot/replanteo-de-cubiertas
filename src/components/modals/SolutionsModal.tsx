import React, { useMemo } from 'react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useRoofStore } from '../../store/useRoofStore';
import { generateRoofSolutionVariants } from '../../engine/geometry/solutionVariants';
import { X, Sparkles, Compass, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface SolutionsModalProps {
  onClose: () => void;
}

export const SolutionsModal: React.FC<SolutionsModalProps> = ({ onClose }) => {
  useEscapeClose(onClose);
  const { project, loadProject, setReplanteoMode, setActiveSubTool, setViewMode } = useRoofStore();

  const variants = useMemo(() => generateRoofSolutionVariants(project), [project]);

  const applyVariant = (vProject: typeof project, manualPractice: boolean) => {
    loadProject(vProject);
    setViewMode('dividida');
    if (manualPractice) {
      setReplanteoMode('manual');
      setActiveSubTool('draw_limatesa');
    } else {
      setReplanteoMode('auto');
      setActiveSubTool('select');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#161e2b] border border-[#304057] rounded-xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        <div className="px-5 py-3 bg-[#1b2434] border-b border-[#2c3a4f] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Planteamiento Multi-Solución desde la Planta Actual (5 Alternativas Reales)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              A partir de tu perímetro ({project.bodies.length > 0 ? project.name : 'Planta base 10×8 m'}), el motor genera y calcula 5 tipologías constructivas reales con normativa y mediciones comparadas.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded hover:bg-[#2a384c] text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 text-xs">
          {variants.map((v) => {
            const b = v.solved.bounds2D;
            const pad = 0.8;
            const vbW = Math.max(2, b.maxX - b.minX + pad * 2);
            const vbH = Math.max(2, b.maxY - b.minY + pad * 2);
            const vb = `${(b.minX - pad).toFixed(2)} ${(-(b.maxY + pad)).toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}`;
            const st = v.solved.normative.overallStatus;
            const faceFill = v.project.isFlatRoofMode
              ? '#dbe3eb'
              : v.project.systemId === 'zinc'
                ? '#c7d3e0'
                : '#df8c66';

            return (
              <div
                key={v.id}
                className="bg-[#1b2434] border border-[#2c3a4f] hover:border-blue-500/60 rounded-xl p-2.5 flex flex-col justify-between gap-2 transition shadow-lg"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-[13px] text-white leading-tight">{v.title}</div>
                      <div className="text-[10.5px] text-slate-400 mt-0.5 line-clamp-1" title={v.subtitle}>{v.subtitle}</div>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[9.5px] font-bold shrink-0 flex items-center gap-1 ${
                        st === 'CUMPLE'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                          : st === 'NO CUMPLE'
                            ? 'bg-rose-950 text-rose-300 border-rose-500/50'
                            : 'bg-amber-950 text-amber-300 border-amber-500/50'
                      }`}
                    >
                      {st === 'CUMPLE' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : st === 'NO CUMPLE' ? (
                        <XCircle className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {st}
                    </span>
                  </div>

                  {/* Mini Real Vector Roof Plan Preview */}
                  <div className="bg-white rounded-lg border border-slate-300/80 h-24 p-1 flex items-center justify-center">
                    <svg viewBox={vb} className="w-full h-full">
                      {v.solved.faces.map((f) => (
                        <polygon
                          key={f.id}
                          points={f.polygon2D.map((p) => `${p.x},${-p.y}`).join(' ')}
                          fill={faceFill}
                          stroke="rgba(15,23,42,0.22)"
                          strokeWidth={0.04}
                        />
                      ))}
                      {v.solved.edges.map((e) => {
                        const stroke =
                          e.type === 'cumbrera'
                            ? '#dc2626'
                            : e.type === 'limatesa'
                              ? '#d97706'
                              : e.type === 'limahoya'
                                ? '#0284c7'
                                : '#0f172a';
                        const sw =
                          e.type === 'cumbrera' || e.type === 'limahoya' ? 0.11 : 0.08;
                        return (
                          <line
                            key={e.id}
                            x1={e.p1.x}
                            y1={-e.p1.y}
                            x2={e.p2.x}
                            y2={-e.p2.y}
                            stroke={stroke}
                            strokeWidth={sw}
                            strokeDasharray={e.type === 'limahoya' ? '0.18 0.1' : undefined}
                            strokeLinecap="round"
                          />
                        );
                      })}
                      {v.project.drains.map((d) => (
                        <circle key={d.id} cx={d.x} cy={-d.y} r={0.18} fill="#0284c7" stroke="#ffffff" strokeWidth={0.06} />
                      ))}
                    </svg>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-3 gap-1.5 bg-[#121822] p-2 rounded border border-[#253145] text-[10.5px]">
                    <div>
                      <div className="text-slate-400">Sup. incl.</div>
                      <div className="font-mono font-bold text-white">
                        {v.solved.measurements.totalInclinedAreaM2.toFixed(1)} m²
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Faldones</div>
                      <div className="font-mono font-bold text-amber-300">
                        {v.solved.faces.length} paños
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Caballetes</div>
                      <div className="font-mono font-bold text-cyan-300">
                        {(v.solved.measurements.ridgeLengthM + v.solved.measurements.hipLengthM).toFixed(1)} m
                      </div>
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-300 space-y-0.5">
                    <div className="line-clamp-1" title={v.advantage}>
                      <strong className="text-emerald-300">Ventaja: </strong>
                      {v.advantage}
                    </div>
                    <div className="text-slate-400 line-clamp-1" title={v.recommendedUse}>
                      <strong>Uso: </strong>
                      {v.recommendedUse}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1 border-t border-[#2c3a4f]">
                  <button
                    onClick={() => applyVariant(v.project, false)}
                    className="flex-1 px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition text-center"
                  >
                    Aplicar Solución (2D + 3D)
                  </button>
                  {!v.project.isFlatRoofMode && v.id !== 'un_agua' && (
                    <button
                      onClick={() => applyVariant(v.project, true)}
                      title="Cargar esta configuración ocultando sus aristas para trazarla tú mismo en práctica manual"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-600/25 hover:bg-amber-600/45 border border-amber-500/50 text-amber-200 font-semibold transition"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Practicar</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
