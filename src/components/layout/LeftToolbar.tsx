import React, { useState } from 'react';
import { useRoofStore } from '../../store/useRoofStore';
import type { RoofSystemId, ToolCategoryId } from '../../types/roof';
import { ROOF_SYSTEM_LIST } from '../../engine/presets/materials';
import {
  ToolAlerosIcon,
  ToolBajantesIcon,
  ToolCumbrerasIcon,
  ToolFaldonesIcon,
  ToolGeometriaIcon,
  ToolLimahoyasIcon,
  ToolMaterialesIcon,
  ToolMedicionesIcon,
  ToolNormativaIcon,
  ToolSingularesIcon,
  ToolSumiderosIcon,
} from '../icons/AppIcons';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface LeftToolbarProps {
  onOpenImportModal: () => void;
  onOpenNormativaModal: () => void;
  onOpenExportModal: () => void;
}

export const LeftToolbar: React.FC<LeftToolbarProps> = ({
  onOpenImportModal,
  onOpenNormativaModal,
  onOpenExportModal,
}) => {
  const {
    project,
    solved,
    activeCategory,
    setActiveCategory,
    activeSubTool,
    setActiveSubTool,
    setRoofSystem,
    setHasWaterproofing,
    setSelectedEntity,
    setHighlightedPoint,
    wavefrontStep,
    setWavefrontStep,
    setViewMode,
    clearToBlankCanvas,
    replanteoMode,
    setReplanteoMode,
  } = useRoofStore();

  const [collapsedPanel, setCollapsedPanel] = useState(false);
  const [expandedCat, setExpandedCat] = useState<ToolCategoryId | null>('geometria');

  const categories: Array<{
    id: ToolCategoryId;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'geometria', label: 'Geometría de la cubierta', icon: <ToolGeometriaIcon className="w-5 h-5" /> },
    { id: 'faldones', label: 'Faldones y pendientes', icon: <ToolFaldonesIcon className="w-5 h-5" /> },
    { id: 'cumbreras', label: 'Cumbreras y limatesas', icon: <ToolCumbrerasIcon className="w-5 h-5" /> },
    { id: 'limahoyas', label: 'Limahoyas', icon: <ToolLimahoyasIcon className="w-5 h-5" /> },
    { id: 'aleros', label: 'Aleros y encuentros', icon: <ToolAlerosIcon className="w-5 h-5" /> },
    { id: 'sumideros', label: 'Sumideros y canalones', icon: <ToolSumiderosIcon className="w-5 h-5" /> },
    { id: 'bajantes', label: 'Bajantes', icon: <ToolBajantesIcon className="w-5 h-5" /> },
    { id: 'singulares', label: 'Elementos singulares', icon: <ToolSingularesIcon className="w-5 h-5" /> },
    { id: 'materiales', label: 'Materiales y capas', icon: <ToolMaterialesIcon className="w-5 h-5" /> },
    { id: 'normativa', label: 'Comprobación normativa', icon: <ToolNormativaIcon className="w-5 h-5" /> },
    { id: 'mediciones', label: 'Mediciones', icon: <ToolMedicionesIcon className="w-5 h-5" /> },
  ];

  const handleSelectCat = (id: ToolCategoryId) => {
    setActiveCategory(id);
    setExpandedCat((prev) => (prev === id ? null : id));
  };

  const ridges = solved.edges.filter((e) => e.type === 'cumbrera' || e.type === 'limatesa');
  const valleys = solved.edges.filter((e) => e.type === 'limahoya');
  const eaves = solved.edges.filter((e) => e.type === 'alero' || e.type === 'encuentro_paramento' || e.type === 'pretil');

  const subBtnClass = (active: boolean) =>
    `w-full text-left px-2.5 py-1.5 rounded text-[11px] transition flex items-center justify-between ${
      active
        ? 'bg-blue-600/30 text-blue-200 border border-blue-500/50 font-medium'
        : 'text-slate-300 hover:bg-[#263448] border border-transparent'
    }`;

  return (
    <aside
      className={`${
        collapsedPanel ? 'w-12' : 'w-[228px]'
      } bg-[#18202c] border-r border-[#2c3a4f] flex flex-col shrink-0 transition-all duration-150 select-none overflow-hidden`}
    >
      {/* Panel Header */}
      <button
        onClick={() => setCollapsedPanel(!collapsedPanel)}
        className="h-9 px-3 border-b border-[#2c3a4f] flex items-center justify-between text-xs font-semibold text-slate-200 hover:bg-[#1f2938]"
      >
        {!collapsedPanel && <span>Herramientas</span>}
        {collapsedPanel ? <ChevronDown className="w-4 h-4 mx-auto" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </button>

      {/* Tool Categories List */}
      <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.id;
          const isOpen = !collapsedPanel && expandedCat === cat.id;
          return (
            <div key={cat.id} className="rounded-md overflow-hidden">
              <button
                onClick={() => handleSelectCat(cat.id)}
                title={cat.label}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-[12.5px] transition ${
                  isActive
                    ? 'bg-[#263449] text-white font-semibold shadow-inner border border-[#3a4f6d]'
                    : 'text-slate-300 hover:bg-[#202b3b] border border-transparent'
                }`}
              >
                <span className={isActive ? 'text-blue-400 shrink-0' : 'text-slate-400 shrink-0'}>
                  {cat.icon}
                </span>
                {!collapsedPanel && <span className="truncate flex-1">{cat.label}</span>}
              </button>

              {/* Contextual Expandable Sub-tools */}
              {isOpen && (
                <div className="mt-1 ml-2 pl-2 border-l border-[#2c3a4f] space-y-1 pb-1.5">
                  {cat.id === 'geometria' && (
                    <>
                      <button
                        onClick={() => clearToBlankCanvas()}
                        className="w-full text-left px-2.5 py-1.5 rounded text-[11px] bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-200 border border-emerald-500/40 font-semibold transition"
                      >
                        ✦ Empezar desde cero (Dibujar)
                      </button>
                      <button
                        onClick={() => setActiveSubTool('select')}
                        className={subBtnClass(activeSubTool === 'select')}
                      >
                        Seleccionar / Mover vértices
                      </button>
                      <button
                        onClick={() => setActiveSubTool('edit_vertices')}
                        className={subBtnClass(activeSubTool === 'edit_vertices')}
                      >
                        Añadir esquinas (+) en muros
                      </button>
                      <button
                        onClick={() => setActiveSubTool('draw_polygon')}
                        className={subBtnClass(activeSubTool === 'draw_polygon')}
                      >
                        Añadir nuevo cuerpo
                      </button>
                      <button
                        onClick={() => setActiveSubTool('draw_hole')}
                        className={subBtnClass(activeSubTool === 'draw_hole')}
                      >
                        Añadir patio / hueco interior
                      </button>
                      <button
                        onClick={() => setActiveSubTool('measure_dim')}
                        className={subBtnClass(activeSubTool === 'measure_dim')}
                      >
                        Acotar / Medir distancia
                      </button>
                      <button onClick={onOpenImportModal} className={subBtnClass(false)}>
                        Importar DXF / SVG / Imagen
                      </button>
                    </>
                  )}

                  {cat.id === 'faldones' && (
                    <>
                      <button
                        onClick={() => setActiveSubTool('edit_slope')}
                        className={subBtnClass(activeSubTool === 'edit_slope')}
                      >
                        Seleccionar faldón y pendiente
                      </button>
                      <button
                        onClick={() => setActiveSubTool('toggle_gable')}
                        className={subBtnClass(activeSubTool === 'toggle_gable')}
                      >
                        Alternar Alero / Hastial / Pretil
                      </button>
                      <button
                        onClick={() =>
                          setWavefrontStep(wavefrontStep === null ? 0 : null)
                        }
                        className={subBtnClass(wavefrontStep !== null)}
                      >
                        {wavefrontStep === null ? 'Ver cálculo paso a paso' : 'Ocultar paso a paso'}
                      </button>
                    </>
                  )}

                  {cat.id === 'cumbreras' && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <button
                        onClick={() => {
                          setReplanteoMode('manual');
                          setActiveSubTool('draw_cumbrera');
                        }}
                        className={subBtnClass(activeSubTool === 'draw_cumbrera')}
                      >
                        ✦ Trazar Cumbrera manual
                      </button>
                      <button
                        onClick={() => {
                          setReplanteoMode('manual');
                          setActiveSubTool('draw_limatesa');
                        }}
                        className={subBtnClass(activeSubTool === 'draw_limatesa')}
                      >
                        ✦ Trazar Limatesa manual
                      </button>
                      {replanteoMode === 'manual' ? (
                        <div className="text-[10.5px] text-amber-200/90 px-2 py-1 bg-amber-950/30 rounded border border-amber-500/30">
                          Modo práctica activo: traza sobre el plano y pulsa Comprobar.
                        </div>
                      ) : ridges.length === 0 ? (
                        <div className="text-[11px] text-slate-400 px-2 py-1">
                          Sin cumbreras ni limatesas activas.
                        </div>
                      ) : (
                        ridges.slice(0, 10).map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              setSelectedEntity({ kind: 'edge', edgeId: r.id });
                              setHighlightedPoint({
                                x: (r.p1.x + r.p2.x) * 0.5,
                                y: (r.p1.y + r.p2.y) * 0.5,
                              });
                            }}
                            className={subBtnClass(false)}
                          >
                            <span className="capitalize">{r.type}</span>
                            <span className="font-mono text-slate-400">{r.length3D.toFixed(2)}m</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {cat.id === 'limahoyas' && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <button
                        onClick={() => {
                          setReplanteoMode('manual');
                          setActiveSubTool('draw_limahoya');
                        }}
                        className={subBtnClass(activeSubTool === 'draw_limahoya')}
                      >
                        ✦ Trazar Limahoya manual
                      </button>
                      {replanteoMode === 'manual' ? (
                        <div className="text-[10.5px] text-sky-200/90 px-2 py-1 bg-sky-950/30 rounded border border-sky-500/30">
                          Usa las limahoyas en encuentros cóncavos entre faldones.
                        </div>
                      ) : valleys.length === 0 ? (
                        <div className="text-[11px] text-slate-400 px-2 py-1">
                          No hay limahoyas en esta geometría.
                        </div>
                      ) : (
                        valleys.slice(0, 10).map((v) => (
                          <button
                            key={v.id}
                            onClick={() => {
                              setSelectedEntity({ kind: 'edge', edgeId: v.id });
                              setHighlightedPoint({
                                x: (v.p1.x + v.p2.x) * 0.5,
                                y: (v.p1.y + v.p2.y) * 0.5,
                              });
                            }}
                            className={subBtnClass(false)}
                          >
                            <span>Limahoya</span>
                            <span className="font-mono text-cyan-300">{v.length3D.toFixed(2)}m</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {cat.id === 'aleros' && (
                    <>
                      <button
                        onClick={() => setActiveSubTool('toggle_gable')}
                        className={subBtnClass(activeSubTool === 'toggle_gable')}
                      >
                        Editar tipo de borde en planta
                      </button>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {eaves.slice(0, 6).map((e) => (
                          <button
                            key={e.id}
                            onClick={() => setSelectedEntity({ kind: 'edge', edgeId: e.id })}
                            className={subBtnClass(false)}
                          >
                            <span className="capitalize truncate">{e.type.replace('_', ' ')}</span>
                            <span className="font-mono text-slate-400">{e.length2D.toFixed(2)}m</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {cat.id === 'sumideros' && (
                    <>
                      <button
                        onClick={() => setActiveSubTool('place_sumidero')}
                        className={subBtnClass(activeSubTool === 'place_sumidero')}
                      >
                        + Colocar sumidero / cazoleta
                      </button>
                      <button
                        onClick={() => setActiveSubTool('place_rebosadero')}
                        className={subBtnClass(activeSubTool === 'place_rebosadero')}
                      >
                        + Colocar rebosadero
                      </button>
                      <button
                        onClick={() => setActiveSubTool('toggle_gutter')}
                        className={subBtnClass(activeSubTool === 'toggle_gutter')}
                      >
                        Activar / Quitar canalón en alero
                      </button>
                    </>
                  )}

                  {cat.id === 'bajantes' && (
                    <>
                      <button
                        onClick={() => setActiveSubTool('place_downspout')}
                        className={subBtnClass(activeSubTool === 'place_downspout')}
                      >
                        + Colocar bajante pluvial
                      </button>
                      <div className="px-2 py-1 text-[10px] text-slate-400">
                        Bajantes actuales: {project.downspouts.length} ud
                      </div>
                    </>
                  )}

                  {cat.id === 'singulares' && (
                    <>
                      <button
                        onClick={() => setActiveSubTool('place_chimney')}
                        className={subBtnClass(activeSubTool === 'place_chimney')}
                      >
                        + Chimenea
                      </button>
                      <button
                        onClick={() => setActiveSubTool('place_shunt')}
                        className={subBtnClass(activeSubTool === 'place_shunt')}
                      >
                        + Shunt ventilación
                      </button>
                      <button
                        onClick={() => setActiveSubTool('place_skylight')}
                        className={subBtnClass(activeSubTool === 'place_skylight')}
                      >
                        + Lucernario
                      </button>
                      <button
                        onClick={() => setActiveSubTool('place_duct')}
                        className={subBtnClass(activeSubTool === 'place_duct')}
                      >
                        + Conducto emergente
                      </button>
                    </>
                  )}

                  {cat.id === 'materiales' && (
                    <div className="space-y-1.5 px-1">
                      <select
                        value={project.systemId}
                        onChange={(e) => setRoofSystem(e.target.value as RoofSystemId)}
                        className="w-full bg-[#121822] border border-[#2c3a4f] rounded px-2 py-1 text-[11px] text-slate-100 outline-none"
                      >
                        {ROOF_SYSTEM_LIST.map((s) => (
                          <option key={s.id} value={s.id} className="bg-[#18202c]">
                            {s.shortName}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={project.hasWaterproofing}
                          onChange={(e) => setHasWaterproofing(e.target.checked)}
                          className="accent-blue-500"
                        />
                        <span>Con capa de impermeabilización</span>
                      </label>
                      <button
                        onClick={() => setViewMode('despiece')}
                        className={subBtnClass(false)}
                      >
                        Abrir Despiece 3D de capas
                      </button>
                    </div>
                  )}

                  {cat.id === 'normativa' && (
                    <button onClick={onOpenNormativaModal} className={subBtnClass(false)}>
                      Abrir Auditoría CTE completa
                    </button>
                  )}

                  {cat.id === 'mediciones' && (
                    <button onClick={onOpenExportModal} className={subBtnClass(false)}>
                      Ver cuadro y exportar PDF/CSV
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
