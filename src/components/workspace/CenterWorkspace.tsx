import React, { useEffect, useState } from 'react';
import { useRoofStore } from '../../store/useRoofStore';
import {
  ViewDespieceIcon,
  ViewDivididaIcon,
  ViewModelo3DIcon,
  ViewPlanta2DIcon,
  ViewSeccionIcon,
} from '../icons/AppIcons';
import { Canvas2D } from './Canvas2D';
import { Scene3D } from './Scene3D';
import { SectionView } from './SectionView';
import { ExplodedView } from './ExplodedView';
import type { ViewMode } from '../../types/roof';
import { Ruler, ChevronLeft, ChevronRight, X, Play, Sparkles } from 'lucide-react';

const GUIDED_STAGES = [
  { step: 1, title: '1. Definir la planta', tip: 'Trace o edite el contorno exterior y los posibles patios interiores en Planta 2D.' },
  { step: 2, title: '2. Identificar cuerpos', tip: 'Separe en varios cuerpos si existen distintas cotas de arranque o terrazas planas.' },
  { step: 3, title: '3. Cotas de referencia', tip: 'Fije la cota de alero (+m) de cada borde perimetral.' },
  { step: 4, title: '4. Establecer pendientes', tip: 'Asigne la pendiente en % o grados (°) según el material de cobertura y DB-HS 1.' },
  { step: 5, title: '5. Resolver faldones', tip: 'El motor calcula la ecuación z = ax + by + c de cada plano inclinado.' },
  { step: 6, title: '6. Cumbreras, limatesas y limahoyas', tip: 'Verifique las intersecciones entre planos y las aristas vivas o cóncavas.' },
  { step: 7, title: '7. Recorridos del agua', tip: 'Compruebe que todas las flechas de escorrentía alcancen salida sin acumularse.' },
  { step: 8, title: '8. Evacuación pluvial', tip: 'Posicione sumideros, canalones y bajantes conforme a DB-HS 5 (Tablas 4.6, 4.7 y 4.8).' },
  { step: 9, title: '9. Comprobar encuentros', tip: 'Verifique entregas contra paramentos (>= 25 cm), vuelos en aleros y pasos.' },
  { step: 10, title: '10. Solución constructiva', tip: 'Configure las capas reales, espesores y conductividades térmicas en Despiece.' },
  { step: 11, title: '11. Revisar normativa CTE', tip: 'Audite DB-HS 1, DB-HS 5, DB-HE 1 y acciones DB-SE-AE.' },
  { step: 12, title: '12. Modelo 3D y Documentación', tip: 'Inspeccione la construcción tridimensional y exporte planos PDF, SVG y DXF.' },
];

interface CenterWorkspaceProps {
  onOpenSolutionsModal?: () => void;
}

export const CenterWorkspace: React.FC<CenterWorkspaceProps> = ({ onOpenSolutionsModal }) => {
  const {
    project,
    solved,
    viewMode,
    setViewMode,
    learningMode,
    guidedStage,
    setGuidedStage,
    wavefrontStep,
    setWavefrontStep,
    rescaleEntireProject,
    updateProjectMeta,
  } = useRoofStore();

  const currentWidthM = Math.max(0.1, solved.bounds2D.maxX - solved.bounds2D.minX);
  const [confirmWidthInput, setConfirmWidthInput] = useState<string>(currentWidthM.toFixed(2));

  useEffect(() => {
    setConfirmWidthInput(currentWidthM.toFixed(2));
  }, [project.id, currentWidthM]);

  const tabs: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
    { id: 'planta2d', label: 'Planta 2D', icon: <ViewPlanta2DIcon className="w-4 h-4" /> },
    { id: 'modelo3d', label: 'Modelo 3D', icon: <ViewModelo3DIcon className="w-4 h-4" /> },
    { id: 'dividida', label: 'Vista Dividida', icon: <ViewDivididaIcon className="w-4 h-4" /> },
    { id: 'seccion', label: 'Sección', icon: <ViewSeccionIcon className="w-4 h-4" /> },
    { id: 'despiece', label: 'Despiece', icon: <ViewDespieceIcon className="w-4 h-4" /> },
  ];

  const activeStage = GUIDED_STAGES[guidedStage - 1] || GUIDED_STAGES[0];
  const maxSnap = Math.max(0, solved.wavefrontSnapshots.length - 1);

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[#141b25] overflow-hidden">
      {/* Workspace View Selector Bar */}
      <div className="h-9 bg-[#17202d] border-b border-[#2c3a4f] px-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => {
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                  active
                    ? 'bg-[#2a3950] text-white border border-[#425a7c] shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#1f2b3d] border border-transparent'
                }`}
              >
                <span className={active ? 'text-blue-400' : 'text-slate-400'}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right quick indicator */}
        <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-400">
          {solved.solverIssues.some((i) => i.severity === 'error') && (
            <span className="text-rose-400 font-medium">
              Error geométrico: {solved.solverIssues.find((i) => i.severity === 'error')?.message}
            </span>
          )}
          {onOpenSolutionsModal && (
            <button
              onClick={onOpenSolutionsModal}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/50 bg-amber-600/20 hover:bg-amber-600/35 text-amber-200 text-[11px] font-medium transition"
              title="Plantear 5 soluciones constructivas distintas para la planta actual"
            >
              <Sparkles className="w-3 h-3" />
              <span>5 Soluciones</span>
            </button>
          )}
          <button
            onClick={() => setWavefrontStep(wavefrontStep === null ? 0 : null)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] transition ${
              wavefrontStep !== null
                ? 'bg-blue-600/25 border-blue-500 text-blue-200'
                : 'border-[#2c3a4f] hover:bg-[#1f2b3d] text-slate-300'
            }`}
            title="Mostrar proceso paso a paso del algoritmo de esqueleto recto"
          >
            <Play className="w-3 h-3" />
            <span>Paso a paso</span>
          </button>
        </div>
      </div>

      {/* Reference A Un-dimensioned Plan Scale Confirmation Banner */}
      {project.needsScaleConfirmation && (
        <div className="bg-amber-950/75 border-b border-amber-500/50 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-100 shrink-0">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Calibración Referencia A:</strong> el plano original no incluye cotas. Confirme el ancho total real (actual: {currentWidthM.toFixed(2)} m):
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step={0.5}
              value={confirmWidthInput}
              onChange={(e) => setConfirmWidthInput(e.target.value)}
              className="w-20 bg-[#121822] border border-amber-500/60 rounded px-2 py-0.5 font-mono text-white"
            />
            <span className="text-amber-300">m</span>
            <button
              onClick={() => {
                const targetW = parseFloat(confirmWidthInput);
                if (targetW > 1) rescaleEntireProject(targetW / currentWidthM);
                else updateProjectMeta({ needsScaleConfirmation: false });
              }}
              className="px-2.5 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium"
            >
              Aplicar escala
            </button>
            <button
              onClick={() => updateProjectMeta({ needsScaleConfirmation: false })}
              className="p-0.5 text-amber-300 hover:text-white"
              title="Mantener escala proporcional"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Guided University Mode Banner (12 Stages) */}
      {learningMode === 'guiado' && (
        <div className="bg-emerald-950/60 border-b border-emerald-500/40 px-3 py-1.5 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="min-w-0">
            <span className="font-bold text-emerald-300">{activeStage.title}: </span>
            <span className="text-slate-200">{activeStage.tip}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              disabled={guidedStage <= 1}
              onClick={() => setGuidedStage(Math.max(1, guidedStage - 1))}
              className="p-1 bg-[#182433] border border-[#2c3a4f] rounded disabled:opacity-35"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] text-emerald-200 px-1.5">
              {guidedStage} / 12
            </span>
            <button
              disabled={guidedStage >= 12}
              onClick={() => setGuidedStage(Math.min(12, guidedStage + 1))}
              className="p-1 bg-[#182433] border border-[#2c3a4f] rounded disabled:opacity-35"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step-by-Step Wavefront Calculation Playback Bar */}
      {wavefrontStep !== null && solved.wavefrontSnapshots.length > 0 && (
        <div className="bg-[#182436] border-b border-blue-500/40 px-3 py-1.5 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-1.5 py-0.5 bg-blue-600/30 border border-blue-500/50 rounded text-blue-200 font-mono text-[11px]">
              Paso {wavefrontStep + 1}/{solved.wavefrontSnapshots.length}
            </span>
            <span className="text-slate-200 truncate">
              {solved.wavefrontSnapshots[Math.min(wavefrontStep, maxSnap)]?.description}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="range"
              min={0}
              max={maxSnap}
              value={Math.min(wavefrontStep, maxSnap)}
              onChange={(e) => setWavefrontStep(Number(e.target.value))}
              className="w-36 accent-blue-500"
            />
            <button
              onClick={() => setWavefrontStep(null)}
              className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-[11px]"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'planta2d' && <Canvas2D />}
        {viewMode === 'modelo3d' && <Scene3D />}
        {viewMode === 'dividida' && (
          <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#2c3a4f]">
            <div className="min-h-0 h-full overflow-hidden">
              <Canvas2D />
            </div>
            <div className="min-h-0 h-full overflow-hidden">
              <Scene3D />
            </div>
          </div>
        )}
        {viewMode === 'seccion' && <SectionView />}
        {viewMode === 'despiece' && <ExplodedView />}
      </div>
    </main>
  );
};
