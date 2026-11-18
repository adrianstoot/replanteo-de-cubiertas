import React from 'react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useRoofStore } from '../../store/useRoofStore';
import {
  createDosAguasProject,
  createReferenciaBProject,
} from '../../engine/presets/projects';
import { X, GraduationCap, Compass, Calculator, Droplets, Sparkles } from 'lucide-react';

interface GuidedTutorModalProps {
  onClose: () => void;
}

export const GuidedTutorModal: React.FC<GuidedTutorModalProps> = ({ onClose }) => {
  useEscapeClose(onClose);
  const {
    loadProject,
    setLearningMode,
    setGuidedStage,
    setWavefrontStep,
    setShowWaterFlow,
    clearToBlankCanvas,
    setViewMode,
  } = useRoofStore();

  const launchAsymmetricChallenge = () => {
    const p = createDosAguasProject();
    const keys = Object.keys(p.bodies[0].edgeConfigs);
    p.bodies[0].edgeConfigs[keys[0]].slopePct = 25;
    p.bodies[0].edgeConfigs[keys[2]].slopePct = 60;
    p.name = 'Reto · Cubierta Asimétrica (25% vs 60%)';
    loadProject(p);
    setViewMode('dividida');
    setShowWaterFlow(true);
    onClose();
  };

  const launchEtsaChallenge = () => {
    loadProject(createReferenciaBProject());
    setViewMode('dividida');
    setShowWaterFlow(true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#161e2b] border border-[#304057] rounded-xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        <div className="px-5 py-3.5 bg-[#1b2434] border-b border-[#2c3a4f] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">
              Guía Visual para Estudiantes · Replanteo de Cubiertas
            </h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded hover:bg-[#2a384c]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Quick Interactive Practice Buttons */}
          <div className="bg-gradient-to-r from-emerald-950/60 to-[#1b2434] border border-emerald-500/40 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-emerald-300 text-sm">
                Aprende practicando en vivo (2D + 3D + Lluvia Real)
              </div>
              <div className="text-slate-300 mt-0.5">
                Dibuja desde cero, activa las 12 etapas guiadas o observa el frente de cálculo paso a paso.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  clearToBlankCanvas();
                  setViewMode('dividida');
                  onClose();
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold"
              >
                Dibujar desde Cero
              </button>
              <button
                onClick={() => {
                  setLearningMode('guiado');
                  setGuidedStage(1);
                  onClose();
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold"
              >
                Modo Guiado (12 etapas)
              </button>
              <button
                onClick={() => {
                  setWavefrontStep(0);
                  onClose();
                }}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded font-semibold"
              >
                Paso a Paso Geométrico
              </button>
            </div>
          </div>

          {/* Visual 4-card concise concepts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-3.5 flex items-center gap-3">
              <svg viewBox="0 0 96 64" className="w-24 h-16 shrink-0 bg-[#101722] rounded border border-[#2c3a4f]">
                <line x1="8" y1="48" x2="60" y2="48" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 2" />
                <line x1="60" y1="48" x2="60" y2="18" stroke="#38bdf8" strokeWidth="2" />
                <line x1="8" y1="48" x2="60" y2="18" stroke="#f59e0b" strokeWidth="2.5" />
                <text x="34" y="59" textAnchor="middle" fontSize="8" fill="#94a3b8">1,00 m</text>
                <text x="64" y="36" textAnchor="start" fontSize="8" fill="#7dd3fc">0,30 m</text>
              </svg>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <Calculator className="w-3.5 h-3.5" />
                  <span>Pendiente (%) ≠ Ángulo (°)</span>
                </div>
                <p className="text-slate-300">
                  <code className="text-cyan-200">30% = arctan(0,30) = 16,70°</code>. A mayor pendiente, la cumbrera se desplaza hacia el alero más inclinado.
                </p>
              </div>
            </div>

            <div className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-3.5 flex items-center gap-3">
              <svg viewBox="0 0 80 60" className="w-20 h-16 shrink-0 bg-[#101722] rounded border border-[#2c3a4f]">
                <polyline points="8,45 40,16 72,45" fill="none" stroke="#ef4444" strokeWidth="2.5" />
                <path d="M32,26 L16,40 M48,26 L64,40" stroke="#38bdf8" strokeWidth="1.5" />
              </svg>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-300">
                  <Compass className="w-3.5 h-3.5" />
                  <span>Cumbrera / Limatesa vs Limahoya</span>
                </div>
                <p className="text-slate-300">
                  <strong className="text-red-400">Cumbrera</strong> y <strong className="text-amber-400">Limatesa</strong> separan el agua; <strong className="text-sky-400">Limahoya</strong> la recoge en un canal cóncavo.
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Student Challenges */}
          <div className="bg-[#1b2434] border border-[#2c3a4f] rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-white">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Ejercicios Interactivos Recomendados (con Lluvia Real)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={launchAsymmetricChallenge}
                className="p-2.5 rounded bg-[#121822] hover:bg-[#1e293b] border border-[#2c3a4f] text-left transition"
              >
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  <span>1. Cubierta Asimétrica (25% vs 60%)</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Observa cómo se desplaza la cumbrera y cómo varía la velocidad de escorrentía bajo lluvia.
                </div>
              </button>

              <button
                onClick={launchEtsaChallenge}
                className="p-2.5 rounded bg-[#121822] hover:bg-[#1e293b] border border-[#2c3a4f] text-left transition"
              >
                <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  <span>2. Práctica ETSA · Cubierta Invertida</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Comprueba los 5 sumideros y detecta el fallo térmico DB-HE 1 de los apuntes (e = 2,5 cm).
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
