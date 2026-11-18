import type { RoofProject } from '../../types/roof';
import type { SolvedRoofModel } from '../../types/solved';

export function generatePlanSvgString(
  project: RoofProject,
  solved: SolvedRoofModel
): string {
  const b = solved.bounds2D;
  const pad = 2.4;
  const w = Math.max(4, b.maxX - b.minX + pad * 2);
  const h = Math.max(4, b.maxY - b.minY + pad * 2);
  const vbX = b.minX - pad;
  const vbY = -(b.maxY + pad);

  const tx = (x: number) => x.toFixed(4);
  const ty = (y: number) => (-y).toFixed(4);

  const facePolys = solved.faces
    .map((f) => {
      const pts = f.polygon2D.map((p) => `${tx(p.x)},${ty(p.y)}`).join(' ');
      const cx = f.centroid2D.x;
      const cy = f.centroid2D.y;
      const ax = cx + f.runoffDir2D.x * 0.75;
      const ay = cy + f.runoffDir2D.y * 0.75;
      const bx = cx - f.runoffDir2D.x * 0.35;
      const by = cy - f.runoffDir2D.y * 0.35;
      return `
      <polygon points="${pts}" fill="${project.isFlatRoofMode ? '#f1f5f9' : '#f9ece4'}" stroke="none" />
      <line x1="${tx(bx)}" y1="${ty(by)}" x2="${tx(ax)}" y2="${ty(ay)}" stroke="#1e293b" stroke-width="0.045" marker-end="url(#arrow)" />
      <text x="${tx(cx)}" y="${ty(cy + 0.28)}" font-size="0.32" font-family="Arial, sans-serif" font-weight="bold" fill="#0f172a" text-anchor="middle">${f.label} · ${f.slopePct.toFixed(1)}%</text>
      `;
    })
    .join('\n');

  const edgeLines = solved.edges
    .map((e) => {
      let stroke = '#0f172a';
      let width = '0.07';
      let dash = '';
      if (e.type === 'cumbrera') {
        stroke = '#dc2626';
        width = '0.09';
      } else if (e.type === 'limatesa') {
        stroke = '#d97706';
        width = '0.075';
      } else if (e.type === 'limahoya') {
        stroke = '#0284c7';
        width = '0.075';
        dash = 'stroke-dasharray="0.22 0.1"';
      } else if (e.type === 'encuentro_paramento' || e.type === 'pretil') {
        stroke = '#334155';
        width = '0.09';
      } else if (e.hasGutter) {
        stroke = '#2563eb';
        width = '0.08';
      }
      return `<line x1="${tx(e.p1.x)}" y1="${ty(e.p1.y)}" x2="${tx(e.p2.x)}" y2="${ty(e.p2.y)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" ${dash} />`;
    })
    .join('\n');

  const drainsSvg = project.drains
    .map((d) =>
      d.kind === 'rebosadero'
        ? `<rect x="${tx(d.x - 0.14)}" y="${ty(d.y + 0.09)}" width="0.28" height="0.18" fill="none" stroke="#0369a1" stroke-width="0.04" />`
        : `<circle cx="${tx(d.x)}" cy="${ty(d.y)}" r="0.16" fill="#e0f2fe" stroke="#0284c7" stroke-width="0.045" /><circle cx="${tx(d.x)}" cy="${ty(d.y)}" r="0.07" fill="#0284c7" />`
    )
    .join('\n');

  const dimW = b.maxX - b.minX;
  const dimH = b.maxY - b.minY;
  const dimSvg = `
    <line x1="${tx(b.minX)}" y1="${ty(b.maxY + 0.8)}" x2="${tx(b.maxX)}" y2="${ty(b.maxY + 0.8)}" stroke="#334155" stroke-width="0.03" />
    <text x="${tx((b.minX + b.maxX) / 2)}" y="${ty(b.maxY + 1.0)}" font-size="0.38" font-family="Arial, sans-serif" text-anchor="middle" fill="#0f172a">${dimW.toFixed(2)} m</text>
    <line x1="${tx(b.minX - 0.8)}" y1="${ty(b.minY)}" x2="${tx(b.minX - 0.8)}" y2="${ty(b.maxY)}" stroke="#334155" stroke-width="0.03" />
    <text x="${tx(b.minX - 1.15)}" y="${ty((b.minY + b.maxY) / 2)}" font-size="0.38" font-family="Arial, sans-serif" text-anchor="middle" fill="#0f172a" transform="rotate(-90 ${tx(b.minX - 1.15)} ${ty((b.minY + b.maxY) / 2)})">${dimH.toFixed(2)} m</text>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX.toFixed(3)} ${vbY.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}" width="1200" height="${Math.round((1200 * h) / w)}">
  <defs>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#1e293b" />
    </marker>
  </defs>
  <rect x="${vbX.toFixed(3)}" y="${vbY.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" fill="#ffffff" />
  <text x="${tx(b.minX)}" y="${ty(b.maxY + 1.65)}" font-size="0.45" font-family="Arial, sans-serif" font-weight="bold" fill="#0f172a">${escapeXml(project.name)} · Plano de Replanteo (E 1:${project.scaleDenominator})</text>
  ${facePolys}
  ${edgeLines}
  ${drainsSvg}
  ${dimSvg}
</svg>`;
}

function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
