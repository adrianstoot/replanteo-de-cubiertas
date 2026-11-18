import React from 'react';
import { useRoofStore } from '../../store/useRoofStore';
import { BrandLogoIcon } from '../icons/AppIcons';
import type { UnitSystem } from '../../types/roof';
import {
  FilePlus2,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  BookOpen,
  Download,
  HelpCircle,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

interface TopBarProps {
  onOpenNewModal: () => void;
  onOpenImportModal: () => void;
  onOpenNormativaModal: () => void;
  onOpenExportModal: () => void;
  onOpenHelpModal: () => void;
  onOpenSolutionsModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenNewModal,
  onOpenImportModal,
  onOpenNormativaModal,
  onOpenExportModal,
  onOpenHelpModal,
  onOpenSolutionsModal,
}) => {
  const {
    project,
    savedProjects,
    loadProject,
    saveCurrentProject,
    undo,
    redo,
    canUndo,
    canRedo,
    updateProjectMeta,
    learningMode,
    setLearningMode,
  } = useRoofStore();

  const [savedToast, setSavedToast] = React.useState(false);

  const handleSave = () => {
    saveCurrentProject();
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1800);
  };

  return (
    <header className="h-[54px] bg-gradient-to-b from-[#1d2736] to-[#151d29] border-b border-[#2c3a4f] px-3 flex items-center justify-between gap-2 shrink-0 select-none z-30">
      {/* Left: Brand Logo + Title + Project Dropdown */}
      <div className="flex items-center gap-2 min-w-0 shrink">
        <div className="flex items-center gap-2 shrink-0">
          <BrandLogoIcon className="w-8 h-8 xl:w-9 xl:h-9" />
          <div className="leading-tight">
            <div className="text-[14px] xl:text-[15px] font-bold tracking-tight text-slate-100 whitespace-nowrap">
              Replanteo de Cubiertas <span className="text-blue-400">Pro</span>
            </div>
            <div className="text-[10px] text-slate-400 tracking-wide whitespace-nowrap">
              Diseño · Cálculo · Normativa · 3D
            </div>
          </div>
        </div>

        {/* Project Selector Dropdown */}
        <div className="hidden md:flex items-center bg-[#121822] border border-[#2c3a4f] rounded-md px-2 py-1 text-xs ml-1 min-w-0 shrink overflow-hidden">
          <span className="text-slate-400 mr-1.5 shrink-0">Proyecto:</span>
          <select
            value={project.id}
            onChange={(e) => {
              const hit = savedProjects.find((p) => p.id === e.target.value);
              if (hit) loadProject(hit);
            }}
            className="bg-transparent text-slate-100 font-medium outline-none cursor-pointer w-[160px] xl:w-[215px] text-ellipsis overflow-hidden"
            title={project.name}
          >
            {savedProjects.map((p) => (
              <option key={p.id} value={p.id} className="bg-[#18202c] text-slate-100">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center: Ribbon File & History Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onOpenNewModal}
          className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-[#253245] text-slate-200 transition"
          title="Crear nuevo proyecto o cargar ejercicio"
        >
          <FilePlus2 className="w-4 h-4 text-slate-300" />
          <span className="text-[10px] mt-0.5 text-slate-300">Nuevo</span>
        </button>

        <button
          onClick={onOpenImportModal}
          className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-[#253245] text-slate-200 transition"
          title="Abrir proyecto JSON o importar DXF / SVG / Imagen"
        >
          <FolderOpen className="w-4 h-4 text-slate-300" />
          <span className="text-[10px] mt-0.5 text-slate-300">Abrir</span>
        </button>

        <button
          onClick={handleSave}
          className="relative flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-[#253245] text-slate-200 transition"
          title="Guardar proyecto en biblioteca local"
        >
          <Save className="w-4 h-4 text-slate-300" />
          <span className="text-[10px] mt-0.5 text-slate-300">
            {savedToast ? 'Guardado' : 'Guardar'}
          </span>
        </button>

        <div className="w-px h-7 bg-[#2c3a4f] mx-1" />

        <button
          onClick={undo}
          disabled={!canUndo}
          title="Deshacer"
          className="p-1.5 rounded hover:bg-[#253245] disabled:opacity-35 text-slate-200 transition"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Rehacer"
          className="p-1.5 rounded hover:bg-[#253245] disabled:opacity-35 text-slate-200 transition"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-7 bg-[#2c3a4f] mx-1 hidden sm:block" />

        {/* Scale & Units Selectors */}
        <div className="hidden sm:flex items-center gap-1.5">
          <div className="flex items-center bg-[#121822] border border-[#2c3a4f] rounded px-2 py-1 text-xs">
            <span className="text-slate-400 mr-1">Escala:</span>
            <select
              value={project.scaleDenominator}
              onChange={(e) =>
                updateProjectMeta({
                  scaleDenominator: Number(e.target.value) as 50 | 100 | 200 | 500,
                })
              }
              className="bg-transparent text-slate-100 font-mono outline-none cursor-pointer"
            >
              <option value={50} className="bg-[#18202c]">1:50</option>
              <option value={100} className="bg-[#18202c]">1:100</option>
              <option value={200} className="bg-[#18202c]">1:200</option>
              <option value={500} className="bg-[#18202c]">1:500</option>
            </select>
          </div>

          <div className="flex items-center bg-[#121822] border border-[#2c3a4f] rounded px-2 py-1 text-xs">
            <span className="text-slate-400 mr-1">Unidades:</span>
            <select
              value={project.units}
              onChange={(e) => updateProjectMeta({ units: e.target.value as UnitSystem })}
              className="bg-transparent text-slate-100 font-mono outline-none cursor-pointer"
            >
              <option value="m" className="bg-[#18202c]">m</option>
              <option value="cm" className="bg-[#18202c]">cm</option>
              <option value="mm" className="bg-[#18202c]">mm</option>
            </select>
          </div>
        </div>
      </div>

      {/* Right: Normativa, Exportar, Guided Learning & Ayuda */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setLearningMode(learningMode === 'guiado' ? 'libre' : 'guiado')}
          title="Alternar Modo Aprendizaje Universitario (12 etapas) / Modo Libre"
          className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition mr-1 ${
            learningMode === 'guiado'
              ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-300'
              : 'bg-[#121822] border-[#2c3a4f] text-slate-300 hover:bg-[#253245]'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>{learningMode === 'guiado' ? 'Modo Guiado' : 'Modo Libre'}</span>
        </button>

        <button
          onClick={onOpenSolutionsModal}
          className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-[#253245] text-amber-200 transition"
          title="Plantear y comparar 5 soluciones constructivas distintas para tu planta"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-[10px] mt-0.5 text-amber-200 font-medium">Soluciones</span>
        </button>

        <button
          onClick={onOpenNormativaModal}
          className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-[#253245] text-slate-200 transition"
          title="Acceso a normativa CTE DB-HS, DB-HE y DB-SE"
        >
          <BookOpen className="w-4 h-4 text-blue-300" />
          <span className="text-[10px] mt-0.5 text-slate-300">Normativa</span>
        </button>

        <button
          onClick={onOpenExportModal}
          className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-[#253245] text-slate-200 transition"
          title="Exportar planos PDF, SVG, DXF y memorias"
        >
          <Download className="w-4 h-4 text-emerald-300" />
          <span className="text-[10px] mt-0.5 text-slate-300">Exportar</span>
        </button>

        <button
          onClick={onOpenHelpModal}
          className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-[#253245] text-slate-200 transition"
          title="Guía universitaria paso a paso y ayuda"
        >
          <HelpCircle className="w-4 h-4 text-slate-300" />
          <span className="text-[10px] mt-0.5 text-slate-300">Ayuda</span>
        </button>
      </div>
    </header>
  );
};
