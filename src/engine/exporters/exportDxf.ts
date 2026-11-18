import type { RoofProject } from '../../types/roof';
import type { SolvedRoofModel } from '../../types/solved';

function layerForEdgeType(type: string, hasGutter?: boolean): string {
  if (type === 'cumbrera') return 'CUMBRERAS';
  if (type === 'limatesa') return 'LIMATESAS';
  if (type === 'limahoya') return 'LIMAHOYAS';
  if (hasGutter) return 'CANALONES';
  if (type === 'alero') return 'ALEROS';
  return 'ENCUENTROS';
}

function colorForLayer(layer: string): number {
  switch (layer) {
    case 'CUMBRERAS': return 1; // Red
    case 'LIMATESAS': return 30; // Amber/Orange
    case 'LIMAHOYAS': return 5; // Blue
    case 'CANALONES': return 4; // Cyan
    case 'EVACUACION': return 5;
    case 'PENDIENTES': return 3; // Green
    default: return 7; // White/Black
  }
}

export function generateDxfString(
  project: RoofProject,
  solved: SolvedRoofModel
): string {
  const lines: string[] = [];
  const push = (code: number, val: string | number) => {
    lines.push(String(code), String(val));
  };

  push(0, 'SECTION');
  push(2, 'HEADER');
  push(9, '$ACADVER');
  push(1, 'AC1009');
  push(0, 'ENDSEC');

  const layerNames = [
    'PERIMETRO',
    'CUMBRERAS',
    'LIMATESAS',
    'LIMAHOYAS',
    'ALEROS',
    'CANALONES',
    'ENCUENTROS',
    'PENDIENTES',
    'EVACUACION',
    'TEXTOS',
  ];

  push(0, 'SECTION');
  push(2, 'TABLES');
  push(0, 'TABLE');
  push(2, 'LAYER');
  push(70, layerNames.length);
  for (const name of layerNames) {
    push(0, 'LAYER');
    push(2, name);
    push(70, 0);
    push(62, colorForLayer(name));
    push(6, name === 'LIMAHOYAS' ? 'DASHED' : 'CONTINUOUS');
  }
  push(0, 'ENDTAB');
  push(0, 'ENDSEC');

  push(0, 'SECTION');
  push(2, 'ENTITIES');

  for (const e of solved.edges) {
    const layer = layerForEdgeType(e.type, e.hasGutter);
    push(0, 'LINE');
    push(8, layer);
    push(10, e.p1.x.toFixed(4));
    push(20, e.p1.y.toFixed(4));
    push(30, e.p1.z.toFixed(4));
    push(11, e.p2.x.toFixed(4));
    push(21, e.p2.y.toFixed(4));
    push(31, e.p2.z.toFixed(4));
  }

  for (const f of solved.faces) {
    const cx = f.centroid2D.x;
    const cy = f.centroid2D.y;
    const tx = cx + f.runoffDir2D.x * 0.7;
    const ty = cy + f.runoffDir2D.y * 0.7;
    push(0, 'LINE');
    push(8, 'PENDIENTES');
    push(10, cx.toFixed(4));
    push(20, cy.toFixed(4));
    push(30, f.centroid3D.z.toFixed(4));
    push(11, tx.toFixed(4));
    push(21, ty.toFixed(4));
    push(31, f.centroid3D.z.toFixed(4));

    push(0, 'TEXT');
    push(8, 'TEXTOS');
    push(10, cx.toFixed(4));
    push(20, (cy + 0.15).toFixed(4));
    push(40, '0.28');
    push(1, `${f.label} ${f.slopePct.toFixed(1)}%`);
  }

  for (const d of project.drains) {
    push(0, 'CIRCLE');
    push(8, 'EVACUACION');
    push(10, d.x.toFixed(4));
    push(20, d.y.toFixed(4));
    push(40, '0.15');
  }

  push(0, 'ENDSEC');
  push(0, 'EOF');
  return lines.join('\n');
}
