import React, { useState } from 'react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useRoofStore } from '../../store/useRoofStore';
import {
  parseDxfContent,
  parseSvgContent,
  polygonToRoofBody,
} from '../../engine/importers/dxfSvgImporter';
import type { Point2D, RoofProject } from '../../types/roof';
import { Upload, Image as ImageIcon, Ruler, X } from 'lucide-react';

interface ImportCalibrateModalProps {
  onClose: () => void;
}

export const ImportCalibrateModal: React.FC<ImportCalibrateModalProps> = ({ onClose }) => {
  useEscapeClose(onClose);
  const { loadProject, addBody, setUnderlay, setActiveSubTool, setViewMode } = useRoofStore();

  const [tab, setTab] = useState<'dxf_svg' | 'imagen' | 'json'>('dxf_svg');
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Image calibration state
  const [imgDataUrl, setImgDataUrl] = useState<string>('');
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [calPt1, setCalPt1] = useState<Point2D | null>(null);
  const [calPt2, setCalPt2] = useState<Point2D | null>(null);
  const [knownDistM, setKnownDistM] = useState<string>('10.0');

  const handleJsonUpload = async (file: File) => {
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt) as RoofProject;
      if (!parsed.bodies || !Array.isArray(parsed.bodies)) {
        setStatusMsg('Archivo JSON inválido: no contiene cuerpos de cubierta.');
        return;
      }
      loadProject(parsed);
      onClose();
    } catch {
      setStatusMsg('No se pudo leer el archivo JSON.');
    }
  };

  const handleDxfSvgUpload = async (file: File, importAsEditableBody: boolean) => {
    try {
      const txt = await file.text();
      const isDxf = file.name.toLowerCase().endsWith('.dxf');
      const res = isDxf ? parseDxfContent(txt) : parseSvgContent(txt);
      setStatusMsg(res.summary);

      if (importAsEditableBody && res.polygons.length > 0) {
        res.polygons.slice(0, 4).forEach((poly, idx) => {
          addBody(
            polygonToRoofBody(
              poly,
              `imp-${Date.now()}-${idx}`,
              `Cuerpo importado ${idx + 1}`
            )
          );
        });
        onClose();
      } else {
        setUnderlay({
          id: `ul-${Date.now()}`,
          name: file.name,
          kind: isDxf ? 'dxf' : 'svg',
          calibrated: true,
          metersPerPixel: 1,
          offsetX: 0,
          offsetY: 0,
          opacity: 0.55,
          dxfSegments: res.segments,
        });
        setViewMode('dividida');
        onClose();
      }
    } catch {
      setStatusMsg('Error al procesar el archivo DXF/SVG.');
    }
  };

  const handleImageSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const im = new Image();
      im.onload = () => {
        setImgDataUrl(dataUrl);
        setImgSize({ w: im.naturalWidth, h: im.naturalHeight });
        setCalPt1(null);
        setCalPt2(null);
      };
      im.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * imgSize.w;
    const py = ((e.clientY - rect.top) / rect.height) * imgSize.h;
    if (!calPt1) setCalPt1({ x: px, y: py });
    else if (!calPt2) setCalPt2({ x: px, y: py });
    else {
      setCalPt1({ x: px, y: py });
      setCalPt2(null);
    }
  };

  const applyCalibratedUnderlay = () => {
    if (!imgDataUrl || !calPt1 || !calPt2) return;
    const pxDist = Math.hypot(calPt2.x - calPt1.x, calPt2.y - calPt1.y);
    const meters = parseFloat(knownDistM);
    if (pxDist < 5 || Number.isNaN(meters) || meters <= 0) {
      setStatusMsg('Marque dos puntos distintos e introduzca una distancia conocida positiva.');
      return;
    }
    setUnderlay({
      id: `ul-img-${Date.now()}`,
      name: 'Plano calibrado',
      kind: 'image',
      dataUrl: imgDataUrl,
      calibrated: true,
      metersPerPixel: meters / pxDist,
      offsetX: 0,
      offsetY: 0,
      opacity: 0.45,
      naturalWidthPx: imgSize.w,
      naturalHeightPx: imgSize.h,
    });
    setActiveSubTool('draw_polygon');
    setViewMode('planta2d');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#161e2b] border border-[#304057] rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        <div className="px-5 py-3.5 bg-[#1b2434] border-b border-[#2c3a4f] flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Abrir Proyecto / Importar DXF, SVG o Calibrar Imagen</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded hover:bg-[#2a384c]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-2 bg-[#141b26] border-b border-[#2c3a4f] flex gap-2 text-xs">
          <button
            onClick={() => setTab('dxf_svg')}
            className={`px-3.5 py-2 rounded-t font-medium border-b-2 ${
              tab === 'dxf_svg'
                ? 'text-blue-300 border-blue-500 bg-[#1a2434]'
                : 'text-slate-400 border-transparent'
            }`}
          >
            Importar DXF / SVG
          </button>
          <button
            onClick={() => setTab('imagen')}
            className={`px-3.5 py-2 rounded-t font-medium border-b-2 ${
              tab === 'imagen'
                ? 'text-blue-300 border-blue-500 bg-[#1a2434]'
                : 'text-slate-400 border-transparent'
            }`}
          >
            Imagen de Plano y Calibración
          </button>
          <button
            onClick={() => setTab('json')}
            className={`px-3.5 py-2 rounded-t font-medium border-b-2 ${
              tab === 'json'
                ? 'text-blue-300 border-blue-500 bg-[#1a2434]'
                : 'text-slate-400 border-transparent'
            }`}
          >
            Abrir Archivo .rcub.json
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {tab === 'dxf_svg' && (
            <div className="space-y-4">
              <p className="text-slate-300">
                Cargue un archivo <strong>DXF</strong> o <strong>SVG</strong> como referencia vectorial de fondo o convierta sus polilíneas cerradas directamente en faldones editables.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-[#364863] hover:border-blue-500 rounded-lg cursor-pointer bg-[#121822]">
                  <Upload className="w-6 h-6 text-blue-400 mb-2" />
                  <span className="font-semibold text-white">Cargar como geometría editable</span>
                  <span className="text-[11px] text-slate-400 mt-1">DXF (LWPOLYLINE) o SVG</span>
                  <input
                    type="file"
                    accept=".dxf,.svg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleDxfSvgUpload(f, true);
                    }}
                  />
                </label>

                <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-[#364863] hover:border-cyan-500 rounded-lg cursor-pointer bg-[#121822]">
                  <Upload className="w-6 h-6 text-cyan-400 mb-2" />
                  <span className="font-semibold text-white">Cargar como calco de referencia</span>
                  <span className="text-[11px] text-slate-400 mt-1">Fondo vectorial para trazado manual</span>
                  <input
                    type="file"
                    accept=".dxf,.svg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleDxfSvgUpload(f, false);
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {tab === 'imagen' && (
            <div className="space-y-3">
              <div className="bg-amber-950/40 border border-amber-500/40 rounded p-2.5 text-amber-100 text-[11px]">
                <strong>Calibración métrica obligatoria:</strong> nunca se deducen dimensiones reales de una imagen sin calibración. Marque dos puntos sobre una cota conocida e introduzca su longitud real en metros.
              </div>

              <label className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded font-medium text-white cursor-pointer">
                <ImageIcon className="w-4 h-4" />
                <span>Seleccionar imagen de plano (PNG / JPG)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageSelected(f);
                  }}
                />
              </label>

              {imgDataUrl && (
                <div className="space-y-3">
                  <div className="relative border border-[#304057] rounded overflow-hidden bg-white max-h-72 flex items-center justify-center">
                    <img
                      src={imgDataUrl}
                      alt="Calibración"
                      onClick={handleImageClick}
                      className="max-h-72 w-auto cursor-crosshair select-none"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[#121822] p-3 rounded border border-[#2c3a4f]">
                    <div className="text-[11px] text-slate-300">
                      {!calPt1
                        ? 'Paso 1: Haga clic en el inicio de una cota conocida.'
                        : !calPt2
                          ? 'Paso 2: Haga clic en el extremo final de la cota.'
                          : `Distancia en píxeles: ${Math.hypot(calPt2.x - calPt1.x, calPt2.y - calPt1.y).toFixed(1)} px`}
                    </div>
                    <div className="flex items-center gap-2">
                      <Ruler className="w-4 h-4 text-blue-400" />
                      <span>Distancia real:</span>
                      <input
                        type="number"
                        step={0.1}
                        value={knownDistM}
                        onChange={(e) => setKnownDistM(e.target.value)}
                        className="w-20 bg-[#1a2434] border border-[#304057] rounded px-2 py-1 font-mono text-white"
                      />
                      <span>m</span>
                      <button
                        disabled={!calPt1 || !calPt2}
                        onClick={applyCalibratedUnderlay}
                        className="px-3 py-1 bg-emerald-600 disabled:bg-slate-700 hover:bg-emerald-500 rounded text-white font-semibold"
                      >
                        Calibrar y Trazar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'json' && (
            <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[#364863] hover:border-blue-500 rounded-lg cursor-pointer bg-[#121822]">
              <Upload className="w-7 h-7 text-blue-400 mb-2" />
              <span className="font-semibold text-white">Cargar archivo de proyecto (.rcub.json)</span>
              <input
                type="file"
                accept=".json,.rcub.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleJsonUpload(f);
                }}
              />
            </label>
          )}

          {statusMsg && (
            <div className="p-2.5 rounded bg-[#121822] border border-blue-500/40 text-blue-200">
              {statusMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
