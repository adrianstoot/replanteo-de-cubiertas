import React, { useMemo } from 'react';
import { useRoofStore } from '../../store/useRoofStore';
import { dist2, evalPlane, segmentIntersection2D, sub2 } from '../../engine/math/vec';
import { Scene3D } from './Scene3D';
import { ROOF_SYSTEMS } from '../../engine/presets/materials';
import { ConstructiveCutawayCanvas } from './ConstructiveCutawayCanvas';

interface ProfileSegment {
  faceLabel: string;
  s1: number;
  z1: number;
  s2: number;
  z2: number;
  slopePct: number;
  trueSlopePct: number;
}

export const SectionView: React.FC = () => {
  const { project, solved, updateSectionLine, setSelectedEntity } = useRoofStore();

  const p1 = project.sectionLine.p1;
  const p2 = project.sectionLine.p2;
  const totalLen = Math.max(0.5, dist2(p1, p2));

  // Intersect cutting segment [p1 -> p2] with every SolvedFace polygon
  const profileSegments = useMemo<ProfileSegment[]>(() => {
    const out: ProfileSegment[] = [];
    for (const face of solved.faces) {
      const ts: number[] = [];
      const poly = face.polygon2D;
      for (let i = 0; i < poly.length; i++) {
        const hit = segmentIntersection2D(p1, p2, poly[i], poly[(i + 1) % poly.length], false);
        if (hit) ts.push(hit.tA);
      }
      // Deduplicate sorted parameters along section line
      ts.sort((a, b) => a - b);
      const uniqueTs: number[] = [];
      for (const t of ts) {
        if (uniqueTs.length === 0 || t - uniqueTs[uniqueTs.length - 1] > 1e-4) {
          uniqueTs.push(t);
        }
      }
      for (let k = 0; k + 1 < uniqueTs.length; k += 2) {
        const tA = uniqueTs[k];
        const tB = uniqueTs[k + 1];
        const xA = p1.x + (p2.x - p1.x) * tA;
        const yA = p1.y + (p2.y - p1.y) * tA;
        const xB = p1.x + (p2.x - p1.x) * tB;
        const yB = p1.y + (p2.y - p1.y) * tB;
        const zA = evalPlane(face.plane, xA, yA);
        const zB = evalPlane(face.plane, xB, yB);
        const s1 = tA * totalLen;
        const s2 = tB * totalLen;
        const apparentSlope = Math.abs(s2 - s1) > 1e-4 ? (Math.abs(zB - zA) / Math.abs(s2 - s1)) * 100 : 0;
        out.push({
          faceLabel: face.label,
          s1,
          z1: zA,
          s2,
          z2: zB,
          slopePct: apparentSlope,
          trueSlopePct: face.slopePct,
        });
      }
    }
    return out.sort((a, b) => a.s1 - b.s1);
  }, [p1, p2, solved.faces, totalLen]);

  const b = solved.bounds2D;
  const maxZ = Math.max(solved.bounds3D.maxZ + 1.2, 6.0);
  const visibleLayers = project.layers.filter((l) => l.visible);
  const totalPackCm = visibleLayers.reduce((acc, l) => acc + l.thicknessCm, 0);

  return (
    <div className="w-full h-full grid grid-cols-1 lg:grid-cols-2 bg-[#141b25] divide-y lg:divide-y-0 lg:divide-x divide-[#2c3a4f]">
      {/* Left: Scaled 2D Constructive Architectural Section A-A' */}
      <div className="flex flex-col h-full bg-[#ffffff] text-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[#1a2331] text-slate-100 text-xs border-b border-[#2c3a4f]">
          <div>
            <span className="font-bold text-blue-300">SECCIÓN CONSTRUCTIVA A–A&apos;</span>
            <span className="text-slate-400 ml-2">
              {ROOF_SYSTEMS[project.systemId].shortName} · Espesor paquete {totalPackCm.toFixed(1)} cm
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-300 flex items-center gap-1">
              Posición corte Y:
              <input
                type="range"
                min={b.minY + 0.3}
                max={b.maxY - 0.3}
                step={0.1}
                value={((p1.y + p2.y) * 0.5).toFixed(2)}
                onChange={(e) => {
                  const ny = Number(e.target.value);
                  updateSectionLine({
                    p1: { x: b.minX - 0.8, y: ny },
                    p2: { x: b.maxX + 0.8, y: ny },
                  });
                }}
                className="w-24 accent-violet-500"
              />
            </label>
          </div>
        </div>

        <div className="flex-1 grid grid-rows-[1.2fr_1fr] overflow-hidden">
          {/* Top SVG: True Scaled Profile Cut */}
          <div className="relative p-3 border-b border-slate-200 flex items-center justify-center bg-white">
            <svg
              viewBox={`-1 ${-(maxZ + 0.6)} ${totalLen + 2} ${maxZ + 1.4}`}
              className="w-full h-full max-h-64"
            >
              {/* Datum ground line 0.00m */}
              <line x1={-0.5} y1={0} x2={totalLen + 0.5} y2={0} stroke="#0f172a" strokeWidth={0.07} />
              <text x={-0.3} y={0.35} fontSize={0.32} fill="#475569" fontFamily="monospace">
                +0.00 m
              </text>

              {/* Profile roof segments + underlying walls */}
              {(() => {
                const placedElevs: Array<{ s: number; z: number }> = [];
                const canPlaceElev = (s: number, z: number) => {
                  const clash = placedElevs.some(
                    (e) => Math.abs(e.s - s) < 0.7 && Math.abs(e.z - z) < 0.45
                  );
                  if (clash) return false;
                  placedElevs.push({ s, z });
                  return true;
                };
                return profileSegments.map((seg, idx) => {
                  const thick = Math.max(0.18, totalPackCm / 100);
                  const segW = Math.abs(seg.s2 - seg.s1);
                  const showS1 = canPlaceElev(seg.s1, seg.z1);
                  const showS2 = canPlaceElev(seg.s2, seg.z2);
                  return (
                    <g key={`sec-${idx}`}>
                      {/* Facade/interior volume */}
                      <polygon
                        points={`${seg.s1},0 ${seg.s2},0 ${seg.s2},${-seg.z2} ${seg.s1},${-seg.z1}`}
                        fill="#f8fafc"
                        stroke="#94a3b8"
                        strokeWidth={0.03}
                      />
                      {/* Structural + constructive roof thickness */}
                      <polygon
                        points={`${seg.s1},${-seg.z1} ${seg.s2},${-seg.z2} ${seg.s2},${-(seg.z2 - thick)} ${seg.s1},${-(seg.z1 - thick)}`}
                        fill="#cbd5e1"
                        stroke="#1e293b"
                        strokeWidth={0.045}
                      />
                      {/* Finish line */}
                      <line
                        x1={seg.s1}
                        y1={-seg.z1}
                        x2={seg.s2}
                        y2={-seg.z2}
                        stroke={project.isFlatRoofMode ? '#475569' : '#b95835'}
                        strokeWidth={0.09}
                      />
                      {/* Face label + slope neatly inside cutaway cavity below slab so it NEVER collides with top elevation tags! */}
                      {segW > 0.9 && (
                        <text
                          x={(seg.s1 + seg.s2) * 0.5}
                          y={-(Math.max(0.6, (seg.z1 + seg.z2) * 0.5 - thick - 0.45))}
                          fontSize={0.28}
                          fontWeight="bold"
                          fill="#1e293b"
                          stroke="#f8fafc"
                          strokeWidth={0.07}
                          paintOrder="stroke"
                          textAnchor="middle"
                        >
                          {seg.faceLabel} · {seg.trueSlopePct.toFixed(0)}%
                          {Math.abs(seg.slopePct - seg.trueSlopePct) > 2.5 ? ' (corte obl.)' : ''}
                        </text>
                      )}
                      {/* Deduplicated elevation tags cleanly above roof line with vertical leader ticks */}
                      {showS1 && (
                        <g>
                          <line x1={seg.s1} y1={-seg.z1} x2={seg.s1} y2={-(seg.z1 + 0.38)} stroke="#0284c7" strokeWidth={0.03} strokeDasharray="0.06 0.06" />
                          <circle cx={seg.s1} cy={-seg.z1} r={0.06} fill="#0284c7" />
                          <text x={seg.s1} y={-(seg.z1 + 0.48)} fontSize={0.27} fill="#0284c7" stroke="#ffffff" strokeWidth={0.07} paintOrder="stroke" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                            +{seg.z1.toFixed(2)}
                          </text>
                        </g>
                      )}
                      {showS2 && (
                        <g>
                          <line x1={seg.s2} y1={-seg.z2} x2={seg.s2} y2={-(seg.z2 + 0.38)} stroke="#0284c7" strokeWidth={0.03} strokeDasharray="0.06 0.06" />
                          <circle cx={seg.s2} cy={-seg.z2} r={0.06} fill="#0284c7" />
                          <text x={seg.s2} y={-(seg.z2 + 0.48)} fontSize={0.27} fill="#0284c7" stroke="#ffffff" strokeWidth={0.07} paintOrder="stroke" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                            +{seg.z2.toFixed(2)}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                });
              })()}

              {profileSegments.length === 0 && (
                <text x={totalLen * 0.5} y={-2} textAnchor="middle" fontSize={0.42} fill="#64748b">
                  Desplace la línea A–A&apos; sobre la cubierta para obtener el corte
                </text>
              )}
            </svg>
          </div>

          {/* Bottom: Detailed Constructive Layer Callout Stack + 3D Isometric Cutaway */}
          <div className="p-3 overflow-y-auto bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Detalle Constructivo de Capas ({ROOF_SYSTEMS[project.systemId].shortName})
              </h4>
              <span className="text-[11px] font-mono text-slate-600">
                U = {solved.normative.thermalUValue.toFixed(2)} W/m²K (lím. {solved.normative.thermalULimit.toFixed(2)})
              </span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[190px_1fr] gap-3 items-start">
              <div className="bg-[#151e2c] rounded-lg p-1.5 border border-slate-300 shadow-inner shrink-0">
                <ConstructiveCutawayCanvas
                  layers={project.layers}
                  systemId={project.systemId}
                  width={176}
                  height={140}
                />
              </div>
              <div className="space-y-1 min-w-0">
                {visibleLayers.map((layer, idx) => (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedEntity({ kind: 'layer', layerId: layer.id })}
                    className="flex items-center gap-2 p-1.5 rounded border border-slate-200 bg-white hover:border-blue-400 cursor-pointer transition text-xs"
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div
                      className="w-6 h-3.5 rounded-sm border border-slate-400 shrink-0"
                      style={{ backgroundColor: layer.colorHex }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 leading-tight">{layer.name}</div>
                      <div className="text-[10px] text-slate-500 leading-snug">{layer.material} · {layer.functionDesc}</div>
                    </div>
                    <div className="text-right font-mono text-[10.5px] text-slate-700 shrink-0">
                      <div>{layer.thicknessCm} cm</div>
                      <div className="text-[9.5px] text-slate-400">λ={layer.lambdaWMK}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Live 3D Section Cut View */}
      <div className="relative h-full">
        <div className="absolute bottom-3 left-3 z-20 bg-[#141c28]/90 border border-violet-500/50 rounded px-2.5 py-1 text-[11px] text-violet-200 pointer-events-none">
          Corte 3D en tiempo real por línea A–A&apos; ({sub2(p2, p1).x.toFixed(1)}, {sub2(p2, p1).y.toFixed(1)})
        </div>
        <Scene3D />
      </div>
    </div>
  );
};
