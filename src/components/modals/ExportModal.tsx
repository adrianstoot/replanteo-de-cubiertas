import React from 'react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useRoofStore } from '../../store/useRoofStore';
import { exportProjectPdf } from '../../engine/exporters/exportPdf';
import { generatePlanSvgString } from '../../engine/exporters/exportSvg';
import { generateDxfString } from '../../engine/exporters/exportDxf';
import { downloadTextFile, generateMeasurementsCsv } from '../../engine/exporters/exportReport';
import { FileText, Code2, Box, Table, FileJson, X } from 'lucide-react';

interface ExportModalProps {
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  useEscapeClose(onClose);
  const { project, solved } = useRoofStore();
  const slug = project.name.replace(/\s+/g, '_');

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#161e2b] border border-[#304057] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden text-slate-100">
        <div className="px-5 py-3.5 bg-[#1b2434] border-b border-[#2c3a4f] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Exportar Documentación Técnica y Planos</h2>
            <p className="text-xs text-slate-400">
              Toda la documentación procede en tiempo real del modelo geométrico central calculado
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded hover:bg-[#2a384c]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Measurements Preview Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#121822] border border-[#2c3a4f] rounded-lg p-3">
            <div>
              <div className="text-slate-400">Proy. horizontal</div>
              <div className="text-sm font-bold font-mono text-white">
                {solved.measurements.totalProjectedAreaM2.toFixed(2)} m²
              </div>
            </div>
            <div>
              <div className="text-slate-400">Sup. inclinada</div>
              <div className="text-sm font-bold font-mono text-white">
                {solved.measurements.totalInclinedAreaM2.toFixed(2)} m²
              </div>
            </div>
            <div>
              <div className="text-slate-400">Cumbreras / Limatesas</div>
              <div className="text-sm font-bold font-mono text-amber-300">
                {(solved.measurements.ridgeLengthM + solved.measurements.hipLengthM).toFixed(2)} m
              </div>
            </div>
            <div>
              <div className="text-slate-400">Limahoyas / Canalones</div>
              <div className="text-sm font-bold font-mono text-cyan-300">
                {solved.measurements.valleyLengthM.toFixed(2)} / {solved.measurements.gutterLengthM.toFixed(2)} m
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => exportProjectPdf(project, solved)}
              className="flex items-start gap-3 p-3.5 rounded-lg bg-[#1c2839] hover:bg-[#24344a] border border-emerald-500/40 text-left transition"
            >
              <FileText className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-white text-sm">Plano PDF A3 + Informe CTE</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Lámina 1: Plano acotado con cajetín, norte, escala gráfica y leyenda. Lámina 2: Mediciones y auditoría CTE.
                </div>
              </div>
            </button>

            <button
              onClick={() =>
                downloadTextFile(`${slug}_Replanteo.svg`, generatePlanSvgString(project, solved), 'image/svg+xml')
              }
              className="flex items-start gap-3 p-3.5 rounded-lg bg-[#1c2839] hover:bg-[#24344a] border border-[#304057] text-left transition"
            >
              <Code2 className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-white text-sm">Plano Vectorial SVG</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Gráfico vectorial escalable de alta precisión con flechas de pendiente y cotas.
                </div>
              </div>
            </button>

            <button
              onClick={() =>
                downloadTextFile(`${slug}_Replanteo.dxf`, generateDxfString(project, solved), 'application/dxf')
              }
              className="flex items-start gap-3 p-3.5 rounded-lg bg-[#1c2839] hover:bg-[#24344a] border border-[#304057] text-left transition"
            >
              <Box className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-white text-sm">Archivo CAD DXF (3D)</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Capas organizadas (CUMBRERAS, LIMATESAS, LIMAHOYAS, ALEROS, CANALONES, EVACUACION).
                </div>
              </div>
            </button>

            <button
              onClick={() =>
                downloadTextFile(`${slug}_Mediciones.csv`, generateMeasurementsCsv(project, solved), 'text/csv;charset=utf-8')
              }
              className="flex items-start gap-3 p-3.5 rounded-lg bg-[#1c2839] hover:bg-[#24344a] border border-[#304057] text-left transition"
            >
              <Table className="w-6 h-6 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-white text-sm">Cuadro de Mediciones CSV</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Superficies por faldón, longitudes, volumen de pendientes y conteo de tejas.
                </div>
              </div>
            </button>
          </div>

          <button
            onClick={() =>
              downloadTextFile(`${slug}.rcub.json`, JSON.stringify(project, null, 2), 'application/json')
            }
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#121822] hover:bg-[#1a2230] border border-[#2c3a4f] text-slate-200 font-medium"
          >
            <FileJson className="w-4 h-4 text-slate-400" />
            <span>Descargar Proyecto Paramétrico (.rcub.json)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
