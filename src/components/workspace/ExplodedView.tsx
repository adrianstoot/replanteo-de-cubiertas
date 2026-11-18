import React from 'react';
import { useRoofStore } from '../../store/useRoofStore';
import { Scene3D } from './Scene3D';
import { Eye, EyeOff, Layers } from 'lucide-react';

export const ExplodedView: React.FC = () => {
  const {
    project,
    solved,
    explodeFactor,
    setExplodeFactor,
    updateLayer,
    selectedEntity,
    setSelectedEntity,
  } = useRoofStore();

  return (
    <div className="w-full h-full grid grid-cols-1 lg:grid-cols-[320px_1fr] bg-[#141b25] divide-y lg:divide-y-0 lg:divide-x divide-[#2c3a4f]">
      {/* Left: Interactive Layer Stack Controls */}
      <div className="flex flex-col h-full bg-[#18202c] p-3 overflow-y-auto">
        <div className="flex items-center gap-2 pb-2.5 border-b border-[#2c3a4f]">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Despiece de Capas Constructivas
          </h3>
        </div>

        <div className="py-3 border-b border-[#2c3a4f] space-y-1.5">
          <div className="flex justify-between text-xs text-slate-300">
            <span>Separación vertical (Explosión)</span>
            <span className="font-mono text-blue-300">{Math.round(explodeFactor * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.05}
            max={1.5}
            step={0.05}
            value={explodeFactor}
            onChange={(e) => setExplodeFactor(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        <div className="mt-3 space-y-2 flex-1">
          {project.layers.map((layer, idx) => {
            const isSel = selectedEntity?.kind === 'layer' && selectedEntity.layerId === layer.id;
            return (
              <div
                key={layer.id}
                onClick={() => setSelectedEntity({ kind: 'layer', layerId: layer.id })}
                className={`p-2 rounded-md border text-xs cursor-pointer transition ${
                  isSel
                    ? 'bg-[#253449] border-blue-500'
                    : 'bg-[#1d2736] border-[#2c3a4f] hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-slate-200 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span
                    className="w-3.5 h-3.5 rounded-sm border border-white/25 shrink-0"
                    style={{ backgroundColor: layer.colorHex }}
                  />
                  <span className="font-semibold text-slate-100 flex-1 truncate">{layer.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { visible: !layer.visible });
                    }}
                    className="p-1 text-slate-400 hover:text-white"
                    title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
                  >
                    {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="truncate pr-2">{layer.material}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span>e:</span>
                    <input
                      type="number"
                      min={0.1}
                      max={60}
                      step={0.5}
                      value={layer.thicknessCm}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateLayer(layer.id, { thicknessCm: Math.max(0.1, Number(e.target.value)) })
                      }
                      className="w-12 bg-[#121821] border border-[#2c3a4f] rounded px-1 py-0.5 text-right font-mono text-slate-100"
                    />
                    <span>cm</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 pt-2.5 border-t border-[#2c3a4f] text-[11px] space-y-1 text-slate-300">
          <div className="flex justify-between">
            <span>Transmitancia U calculada:</span>
            <span
              className={`font-mono font-bold ${
                solved.normative.thermalUValue <= solved.normative.thermalULimit
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {solved.normative.thermalUValue.toFixed(2)} W/m²K
            </span>
          </div>
          <div className="flex justify-between">
            <span>Límite DB-HE 1 (Zona {project.location.climateZoneWinter}):</span>
            <span className="font-mono text-slate-200">{solved.normative.thermalULimit.toFixed(2)} W/m²K</span>
          </div>
          <div className="flex justify-between">
            <span>Peso propio paquete:</span>
            <span className="font-mono text-slate-200">
              {solved.measurements.totalRoofWeightKgM2.toFixed(1)} kg/m²
            </span>
          </div>
        </div>
      </div>

      {/* Right: Interactive 3D Exploded Layer Assembly */}
      <div className="relative h-full">
        <Scene3D />
      </div>
    </div>
  );
};
