import type { RoofProject } from '../../types/roof';
import type { SolvedRoofModel } from '../../types/solved';

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateMeasurementsCsv(
  project: RoofProject,
  solved: SolvedRoofModel
): string {
  const rows: string[] = [
    'Proyecto;Elemento;Tipo;Pendiente (%);Angulo (deg);Sup. Proy. (m2);Sup. Incl. (m2);Cota Min (m);Cota Max (m)',
  ];
  for (const f of solved.measurements.perFace) {
    rows.push(
      `${project.name};${f.label};Faldón;${f.slopePct.toFixed(2)};${f.angleDeg.toFixed(2)};${f.projectedAreaM2.toFixed(3)};${f.inclinedAreaM2.toFixed(3)};${f.minZ.toFixed(3)};${f.maxZ.toFixed(3)}`
    );
  }
  rows.push('');
  rows.push('Resumen;Valor;Unidad');
  const m = solved.measurements;
  rows.push(`Superficie proyectada total;${m.totalProjectedAreaM2.toFixed(3)};m2`);
  rows.push(`Superficie inclinada total;${m.totalInclinedAreaM2.toFixed(3)};m2`);
  rows.push(`Longitud de cumbreras;${m.ridgeLengthM.toFixed(3)};m`);
  rows.push(`Longitud de limatesas;${m.hipLengthM.toFixed(3)};m`);
  rows.push(`Longitud de limahoyas;${m.valleyLengthM.toFixed(3)};m`);
  rows.push(`Longitud de aleros;${m.eaveLengthM.toFixed(3)};m`);
  rows.push(`Longitud de canalones;${m.gutterLengthM.toFixed(3)};m`);
  rows.push(`Sumideros;${m.sumideroCount};ud`);
  rows.push(`Bajantes;${m.downspoutCount};ud`);
  rows.push(`Volumen formacion pendientes;${m.slopeFormationVolumeM3.toFixed(3)};m3`);
  rows.push(`Peso propio capas;${m.totalRoofWeightKgM2.toFixed(2)};kg/m2`);
  if (m.estimatedTileCount !== null) {
    rows.push(`Tejas base estimadas;${m.estimatedTileCount};ud`);
    rows.push(`Piezas especiales cumbrera/limatesa;${m.estimatedRidgeTileCount ?? 0};ud`);
  }
  return rows.join('\n');
}
