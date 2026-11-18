import React, { useState } from 'react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useRoofStore } from '../../store/useRoofStore';
import {
  BUILTIN_PROJECTS,
  createBlankProject,
} from '../../engine/presets/projects';
import { ROOF_SYSTEM_LIST } from '../../engine/presets/materials';
import type { RoofSystemId } from '../../types/roof';
import { X, PlusSquare, Layers, PenTool } from 'lucide-react';

interface NewProjectModalProps {
  onClose: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ onClose }) => {
  useEscapeClose(onClose);
  const { loadProject, createNewProject, clearToBlankCanvas, setViewMode } = useRoofStore();
  const [name, setName] = useState('Mi Cubierta Universitaria');
  const [width, setWidth] = useState(12);
  const [depth, setDepth] = useState(8);
  const [slope, setSlope] = useState(30);
  const [systemId, setSystemId] = useState<RoofSystemId>('teja_mixta');

  const handleCreateCustom = () => {
    const base = createBlankProject(name);
    const w = Math.max(2, width);
    const d = Math.max(2, depth);
    const b = base.bodies[0];
    b.outerLoop = [
      { id: 'n-v1', x: 0, y: 0 },
      { id: 'n-v2', x: w, y: 0 },
      { id: 'n-v3', x: w, y: d },
      { id: 'n-v4', x: 0, y: d },
    ];
    b.defaultSlopePct = slope;
    b.edgeConfigs = {
      'n-v1->n-v2': { edgeId: 'n-v1->n-v2', type: 'eave', slopePct: slope, eaveHeight: 3.5, overhang: 0.35, parapetHeight: 0, flashingHeight: 0.25, hasGutter: true, gutterDiameterMm: 125, gutterSlopePct: 1, gutterSection: 'semicircular' },
      'n-v2->n-v3': { edgeId: 'n-v2->n-v3', type: 'eave', slopePct: slope, eaveHeight: 3.5, overhang: 0.35, parapetHeight: 0, flashingHeight: 0.25, hasGutter: true, gutterDiameterMm: 125, gutterSlopePct: 1, gutterSection: 'semicircular' },
      'n-v3->n-v4': { edgeId: 'n-v3->n-v4', type: 'eave', slopePct: slope, eaveHeight: 3.5, overhang: 0.35, parapetHeight: 0, flashingHeight: 0.25, hasGutter: true, gutterDiameterMm: 125, gutterSlopePct: 1, gutterSection: 'semicircular' },
      'n-v4->n-v1': { edgeId: 'n-v4->n-v1', type: 'eave', slopePct: slope, eaveHeight: 3.5, overhang: 0.35, parapetHeight: 0, flashingHeight: 0.25, hasGutter: true, gutterDiameterMm: 125, gutterSlopePct: 1, gutterSection: 'semicircular' },
    };
    base.systemId = systemId;
    base.sectionLine = { p1: { x: w * 0.5, y: -0.6 }, p2: { x: w * 0.5, y: d + 0.6 } };
    createNewProject(base);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#161e2b] border border-[#304057] rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        <div className="px-5 py-3.5 bg-[#1b2434] border-b border-[#2c3a4f] flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Nuevo Proyecto o Caso de Estudio Universitario</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded hover:bg-[#2a384c]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Blank Canvas Start from Zero */}
          <button
            onClick={() => {
              clearToBlankCanvas();
              setViewMode('dividida');
              onClose();
            }}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-emerald-950/70 to-[#1b2434] hover:from-emerald-900/70 border border-emerald-500/50 text-left transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/25 border border-emerald-400/50 flex items-center justify-center text-emerald-300">
                <PenTool className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-white">Empezar desde Cero (Lienzo en Blanco · Práctica 2D + 3D)</div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  Dibuja el perímetro en planta paso a paso, traza manualmente las limatesas y cumbreras para practicar el replanteo o revela la solución matemática completa en 2D y 3D.
                </div>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded bg-emerald-600 text-white font-semibold shrink-0 ml-3">
              Dibujar
            </span>
          </button>

          {/* Custom generator */}
          <div className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <PlusSquare className="w-4 h-4 text-blue-400" />
              <span>Crear Cubierta Paramétrica desde Cero</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">Nombre del proyecto</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Ancho (m)</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="w-full bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Fondo (m)</label>
                <input
                  type="number"
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  className="w-full bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Pendiente (%)</label>
                <input
                  type="number"
                  value={slope}
                  onChange={(e) => setSlope(Number(e.target.value))}
                  className="w-full bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 font-mono text-white"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <select
                value={systemId}
                onChange={(e) => setSystemId(e.target.value as RoofSystemId)}
                className="bg-[#121822] border border-[#304057] rounded px-2.5 py-1.5 text-slate-100"
              >
                {ROOF_SYSTEM_LIST.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreateCustom}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded"
              >
                Generar Planta Editable
              </button>
            </div>
          </div>

          {/* Built-in University Case Studies & Verification Tests */}
          <div>
            <div className="flex items-center gap-2 font-bold text-sm text-white mb-2.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Casos de Estudio y Prácticas de Referencia (Editables)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BUILTIN_PROJECTS.map((bp) => (
                <button
                  key={bp.id}
                  onClick={() => {
                    loadProject(bp);
                    onClose();
                  }}
                  className="p-3 rounded-lg bg-[#1b2434] hover:bg-[#243247] border border-[#2c3a4f] hover:border-blue-500/60 text-left transition space-y-1"
                >
                  <div className="font-bold text-white">{bp.name}</div>
                  <div className="text-[11px] text-slate-400 line-clamp-2">{bp.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
