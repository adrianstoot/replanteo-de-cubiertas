import { jsPDF } from 'jspdf';
import type { RoofProject } from '../../types/roof';
import type { SolvedRoofModel } from '../../types/solved';
import { ROOF_SYSTEMS } from '../presets/materials';

export function exportProjectPdf(project: RoofProject, solved: SolvedRoofModel): void {
  // A3 Landscape technical architectural sheet (420 x 297 mm)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const W = 420;
  const H = 297;
  const margin = 10;

  // Outer drawing border
  doc.setDrawColor(20, 30, 48);
  doc.setLineWidth(0.5);
  doc.rect(margin, margin, W - margin * 2, H - margin * 2);

  // Header strip
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`PLANO DE REPLANTEO DE CUBIERTA · ${project.name.toUpperCase()}`, margin + 4, margin + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Sistema: ${ROOF_SYSTEMS[project.systemId].name} | Emplazamiento: ${project.location.municipality} (${project.location.province}) | Escala gráfica ajustada`,
    margin + 4,
    margin + 12
  );

  // Drawing viewport bounds (top half + left area, leaving space for Cajetín at bottom-right)
  const vpX = margin + 12;
  const vpY = margin + 22;
  const vpW = W - margin * 2 - 24;
  const vpH = H - margin * 2 - 70;

  const b = solved.bounds2D;
  const modelW = Math.max(1, b.maxX - b.minX);
  const modelH = Math.max(1, b.maxY - b.minY);
  const scaleMmPerM = Math.min(vpW / (modelW + 2), vpH / (modelH + 2));

  // Round to neat engineering scale or show true drawing scale
  const offsetX = vpX + (vpW - modelW * scaleMmPerM) * 0.5;
  const offsetY = vpY + (vpH - modelH * scaleMmPerM) * 0.5;

  const mapX = (x: number) => offsetX + (x - b.minX) * scaleMmPerM;
  const mapY = (y: number) => offsetY + (b.maxY - y) * scaleMmPerM;

  // Draw faces + slope arrows
  for (const f of solved.faces) {
    const pts = f.polygon2D;
    if (pts.length < 3) continue;
    doc.setFillColor(project.isFlatRoofMode ? 241 : 250, project.isFlatRoofMode ? 245 : 236, project.isFlatRoofMode ? 249 : 228);
    doc.setDrawColor(210, 215, 224);
    doc.setLineWidth(0.15);

    const linesArr: Array<[number, number]> = [];
    for (let i = 1; i < pts.length; i++) {
      linesArr.push([mapX(pts[i].x) - mapX(pts[i - 1].x), mapY(pts[i].y) - mapY(pts[i - 1].y)]);
    }
    doc.lines(linesArr, mapX(pts[0].x), mapY(pts[0].y), [1, 1], 'F', true);

    // Slope arrow
    const cx = f.centroid2D.x;
    const cy = f.centroid2D.y;
    if (f.slopePct > 0.05) {
      const x1 = mapX(cx - f.runoffDir2D.x * 0.35);
      const y1 = mapY(cy - f.runoffDir2D.y * 0.35);
      const x2 = mapX(cx + f.runoffDir2D.x * 0.7);
      const y2 = mapY(cy + f.runoffDir2D.y * 0.7);
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.35);
      doc.line(x1, y1, x2, y2);
      // Arrowhead
      const ang = Math.atan2(y2 - y1, x2 - x1);
      doc.line(x2, y2, x2 - Math.cos(ang - 0.5) * 2.2, y2 - Math.sin(ang - 0.5) * 2.2);
      doc.line(x2, y2, x2 - Math.cos(ang + 0.5) * 2.2, y2 - Math.sin(ang + 0.5) * 2.2);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${f.label} (${f.slopePct.toFixed(1)}%)`, mapX(cx), mapY(cy) - 1.5, {
      align: 'center',
    });
  }

  // Draw topological edges with graphic hierarchy
  for (const e of solved.edges) {
    if (e.type === 'cumbrera') {
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.75);
      doc.setLineDashPattern([], 0);
    } else if (e.type === 'limatesa') {
      doc.setDrawColor(217, 119, 6);
      doc.setLineWidth(0.55);
      doc.setLineDashPattern([], 0);
    } else if (e.type === 'limahoya') {
      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.55);
      doc.setLineDashPattern([2.5, 1.2], 0);
    } else if (e.hasGutter) {
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.65);
      doc.setLineDashPattern([], 0);
    } else {
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.55);
      doc.setLineDashPattern([], 0);
    }
    doc.line(mapX(e.p1.x), mapY(e.p1.y), mapX(e.p2.x), mapY(e.p2.y));
  }
  doc.setLineDashPattern([], 0);

  // Drains & Downspouts
  for (const d of project.drains) {
    doc.setDrawColor(2, 132, 199);
    doc.setFillColor(224, 242, 254);
    doc.setLineWidth(0.35);
    doc.circle(mapX(d.x), mapY(d.y), 1.8, 'FD');
  }
  for (const ds of project.downspouts) {
    doc.setDrawColor(30, 64, 175);
    doc.setFillColor(219, 234, 254);
    doc.circle(mapX(ds.x), mapY(ds.y), 1.4, 'FD');
  }

  // Overall dimensions
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.25);
  const topDimY = mapY(b.maxY) - 6;
  doc.line(mapX(b.minX), topDimY, mapX(b.maxX), topDimY);
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`${modelW.toFixed(2)} m`, (mapX(b.minX) + mapX(b.maxX)) / 2, topDimY - 1.5, {
    align: 'center',
  });

  const leftDimX = mapX(b.minX) - 6;
  doc.line(leftDimX, mapY(b.minY), leftDimX, mapY(b.maxY));
  doc.text(`${modelH.toFixed(2)} m`, leftDimX - 2, (mapY(b.minY) + mapY(b.maxY)) / 2, {
    align: 'center',
    angle: 90,
  });

  // North symbol top-right
  const nx = W - margin - 20;
  const ny = margin + 24;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.circle(nx, ny, 7);
  doc.line(nx, ny + 6, nx, ny - 6);
  doc.line(nx, ny - 6, nx - 2, ny - 2);
  doc.line(nx, ny - 6, nx + 2, ny - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('N', nx, ny - 8.5, { align: 'center' });

  // Graphic scale bar bottom-left
  const sbX = margin + 8;
  const sbY = H - margin - 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('ESCALA GRÁFICA (m)', sbX, sbY - 3);
  const seg5m = 5 * scaleMmPerM;
  const barW = Math.min(80, Math.max(20, seg5m));
  doc.setFillColor(15, 23, 42);
  doc.rect(sbX, sbY, barW / 2, 2.2, 'F');
  doc.setDrawColor(15, 23, 42);
  doc.rect(sbX + barW / 2, sbY, barW / 2, 2.2, 'S');
  doc.setFont('helvetica', 'normal');
  doc.text('0', sbX, sbY + 6);
  doc.text('2.5 m', sbX + barW / 2, sbY + 6, { align: 'center' });
  doc.text('5.0 m', sbX + barW, sbY + 6, { align: 'right' });

  // Legend bottom-left next to scale
  const legX = margin + 8;
  const legY = H - margin - 14;
  const items: Array<{ label: string; rgb: [number, number, number] }> = [
    { label: 'Cumbrera', rgb: [220, 38, 38] },
    { label: 'Limatesa', rgb: [217, 119, 6] },
    { label: 'Limahoya', rgb: [2, 132, 199] },
    { label: 'Alero', rgb: [15, 23, 42] },
    { label: 'Canalón', rgb: [37, 99, 235] },
  ];
  items.forEach((it, idx) => {
    const ix = legX + idx * 36;
    doc.setDrawColor(...it.rgb);
    doc.setLineWidth(0.7);
    doc.line(ix, legY, ix + 8, legY);
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(it.label, ix + 10, legY + 1);
  });

  // Cajetín (Professional Architectural Title Block) bottom-right
  const cx0 = W - margin - 145;
  const cy0 = H - margin - 38;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.45);
  doc.rect(cx0, cy0, 145, 38);
  doc.line(cx0, cy0 + 11, cx0 + 145, cy0 + 11);
  doc.line(cx0, cy0 + 24, cx0 + 145, cy0 + 24);
  doc.line(cx0 + 95, cy0 + 24, cx0 + 95, cy0 + 38);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('REPLANTEO DE CUBIERTAS PRO', cx0 + 4, cy0 + 7);
  doc.setFontSize(8.5);
  doc.text(`PROYECTO: ${project.name}`, cx0 + 4, cy0 + 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Superficie proyectada: ${solved.measurements.totalProjectedAreaM2.toFixed(2)} m² · Inclinada: ${solved.measurements.totalInclinedAreaM2.toFixed(2)} m²`, cx0 + 4, cy0 + 22);
  doc.text(`Autor: ${project.author} | Fecha: ${project.updatedAt}`, cx0 + 4, cy0 + 30);
  doc.text(`CTE: ${solved.normative.overallStatus} | Emplazamiento: ${project.location.municipality}`, cx0 + 4, cy0 + 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`ESCALA 1:${project.scaleDenominator}`, cx0 + 120, cy0 + 30, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text('PLANO 01 / 02', cx0 + 120, cy0 + 35, { align: 'center' });

  // PAGE 2: Measurements & CTE Normative Report
  doc.addPage('a3', 'landscape');
  doc.setDrawColor(20, 30, 48);
  doc.setLineWidth(0.5);
  doc.rect(margin, margin, W - margin * 2, H - margin * 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`MEDICIONES Y AUDITORÍA NORMATIVA CTE · ${project.name.toUpperCase()}`, margin + 6, margin + 10);

  // Measurements Table (left half)
  let ry = margin + 22;
  doc.setFontSize(9.5);
  doc.text('1. CUADRO DE SUPERFICIES POR FALDÓN', margin + 6, ry);
  ry += 5;
  doc.setFontSize(7.5);
  doc.setFillColor(241, 245, 249);
  doc.rect(margin + 6, ry, 185, 6, 'F');
  doc.text('Faldón', margin + 8, ry + 4.2);
  doc.text('Pendiente', margin + 35, ry + 4.2);
  doc.text('Ángulo', margin + 62, ry + 4.2);
  doc.text('Sup. Proy. (m²)', margin + 88, ry + 4.2);
  doc.text('Sup. Incl. (m²)', margin + 122, ry + 4.2);
  doc.text('Cotas (m)', margin + 158, ry + 4.2);
  ry += 7;

  doc.setFont('helvetica', 'normal');
  for (const f of solved.measurements.perFace.slice(0, 22)) {
    doc.text(f.label, margin + 8, ry + 3.5);
    doc.text(`${f.slopePct.toFixed(2)}%`, margin + 35, ry + 3.5);
    doc.text(`${f.angleDeg.toFixed(2)}°`, margin + 62, ry + 3.5);
    doc.text(f.projectedAreaM2.toFixed(2), margin + 88, ry + 3.5);
    doc.text(f.inclinedAreaM2.toFixed(2), margin + 122, ry + 3.5);
    doc.text(`+${f.minZ.toFixed(2)} / +${f.maxZ.toFixed(2)}`, margin + 158, ry + 3.5);
    ry += 5.2;
  }

  ry += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('2. MEDICIONES GENERALES', margin + 6, ry);
  ry += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const m = solved.measurements;
  const summaryLines = [
    `Superficie total proyección horizontal: ${m.totalProjectedAreaM2.toFixed(2)} m²`,
    `Superficie total inclinada de cobertura: ${m.totalInclinedAreaM2.toFixed(2)} m²`,
    `Cumbreras: ${m.ridgeLengthM.toFixed(2)} m | Limatesas: ${m.hipLengthM.toFixed(2)} m | Limahoyas: ${m.valleyLengthM.toFixed(2)} m`,
    `Aleros: ${m.eaveLengthM.toFixed(2)} m | Canalones: ${m.gutterLengthM.toFixed(2)} m | Paramentos: ${m.abutmentLengthM.toFixed(2)} m`,
    `Volumen formación de pendientes: ${m.slopeFormationVolumeM3.toFixed(2)} m³ | Peso propio capas: ${m.totalRoofWeightKgM2.toFixed(1)} kg/m²`,
    m.estimatedTileCount !== null
      ? `Estimación de piezas: ${m.estimatedTileCount} tejas base + ${m.estimatedRidgeTileCount ?? 0} caballetes`
      : 'Sistema continuo / pavimento (sin conteo modular de tejas)',
  ];
  for (const line of summaryLines) {
    doc.text(line, margin + 8, ry);
    ry += 5.5;
  }

  // CTE Audit Table (right half)
  let cy = margin + 22;
  const rx = 205;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`3. COMPROBACIÓN NORMATIVA CTE (Estado global: ${solved.normative.overallStatus})`, rx, cy);
  cy += 6;
  doc.setFontSize(7.5);
  for (const c of solved.normative.checks) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(
      c.status === 'CUMPLE' ? 22 : c.status === 'NO CUMPLE' ? 220 : 180,
      c.status === 'CUMPLE' ? 163 : c.status === 'NO CUMPLE' ? 38 : 110,
      c.status === 'CUMPLE' ? 74 : c.status === 'NO CUMPLE' ? 38 : 15
    );
    doc.text(`[${c.status}]`, rx, cy);
    doc.setTextColor(15, 23, 42);
    doc.text(`${c.code} — ${c.title}`, rx + 28, cy);
    cy += 4.2;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Exigencia: ${c.requiredValue} | Medido: ${c.measuredValue}`, rx + 28, cy, {
      maxWidth: 170,
    });
    cy += 6.5;
    if (cy > H - 25) break;
  }

  doc.save(`${project.name.replace(/\s+/g, '_')}_Replanteo.pdf`);
}
