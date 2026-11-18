import type { Point2D, PolygonVertex, RoofBody } from '../../types/roof';
import { ensureCCW, polygonArea2D } from '../math/vec';

export interface ImportedGeometryResult {
  polygons: Point2D[][];
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  summary: string;
}

/**
 * Parses ASCII DXF entities (LWPOLYLINE, POLYLINE/VERTEX, LINE) into reference segments and closed polygons.
 */
export function parseDxfContent(dxfText: string): ImportedGeometryResult {
  const rawLines = dxfText.replace(/\r\n/g, '\n').split('\n');
  const pairs: Array<{ code: number; val: string }> = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    const code = parseInt(rawLines[i].trim(), 10);
    const val = rawLines[i + 1].trim();
    if (!Number.isNaN(code)) {
      pairs.push({ code, val });
    }
  }

  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const polygons: Point2D[][] = [];

  let i = 0;
  let inEntities = false;
  while (i < pairs.length) {
    const { code, val } = pairs[i];
    if (code === 2 && val.toUpperCase() === 'ENTITIES') {
      inEntities = true;
      i++;
      continue;
    }
    if (inEntities && code === 0 && val.toUpperCase() === 'ENDSEC') {
      break;
    }
    if (!inEntities) {
      i++;
      continue;
    }

    if (code === 0 && val.toUpperCase() === 'LINE') {
      let x1 = 0;
      let y1 = 0;
      let x2 = 0;
      let y2 = 0;
      i++;
      while (i < pairs.length && pairs[i].code !== 0) {
        const c = pairs[i].code;
        const v = parseFloat(pairs[i].val);
        if (c === 10) x1 = v;
        else if (c === 20) y1 = v;
        else if (c === 11) x2 = v;
        else if (c === 21) y2 = v;
        i++;
      }
      if (Math.hypot(x2 - x1, y2 - y1) > 1e-4) {
        segments.push({ x1, y1, x2, y2 });
      }
      continue;
    }

    if (code === 0 && val.toUpperCase() === 'LWPOLYLINE') {
      const pts: Point2D[] = [];
      let flags = 0;
      let curX: number | null = null;
      i++;
      while (i < pairs.length && pairs[i].code !== 0) {
        const c = pairs[i].code;
        const v = parseFloat(pairs[i].val);
        if (c === 70) flags = Math.round(v);
        else if (c === 10) curX = v;
        else if (c === 20 && curX !== null) {
          pts.push({ x: curX, y: v });
          curX = null;
        }
        i++;
      }
      const isClosed = (flags & 1) === 1;
      for (let k = 0; k < pts.length - 1; k++) {
        segments.push({ x1: pts[k].x, y1: pts[k].y, x2: pts[k + 1].x, y2: pts[k + 1].y });
      }
      if (isClosed && pts.length >= 3) {
        segments.push({
          x1: pts[pts.length - 1].x,
          y1: pts[pts.length - 1].y,
          x2: pts[0].x,
          y2: pts[0].y,
        });
        if (polygonArea2D(pts) > 1e-3) polygons.push(pts);
      } else if (
        pts.length >= 4 &&
        Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-3
      ) {
        const clean = pts.slice(0, -1);
        if (polygonArea2D(clean) > 1e-3) polygons.push(clean);
      }
      continue;
    }

    if (code === 0 && val.toUpperCase() === 'POLYLINE') {
      let flags = 0;
      const pts: Point2D[] = [];
      i++;
      while (i < pairs.length) {
        if (pairs[i].code === 70) flags = parseInt(pairs[i].val, 10) || 0;
        if (pairs[i].code === 0 && pairs[i].val.toUpperCase() === 'SEQEND') {
          i++;
          break;
        }
        if (pairs[i].code === 0 && pairs[i].val.toUpperCase() === 'VERTEX') {
          let vx = 0;
          let vy = 0;
          i++;
          while (i < pairs.length && pairs[i].code !== 0) {
            if (pairs[i].code === 10) vx = parseFloat(pairs[i].val);
            if (pairs[i].code === 20) vy = parseFloat(pairs[i].val);
            i++;
          }
          pts.push({ x: vx, y: vy });
          continue;
        }
        i++;
      }
      for (let k = 0; k < pts.length - 1; k++) {
        segments.push({ x1: pts[k].x, y1: pts[k].y, x2: pts[k + 1].x, y2: pts[k + 1].y });
      }
      if ((flags & 1) === 1 && pts.length >= 3) {
        segments.push({
          x1: pts[pts.length - 1].x,
          y1: pts[pts.length - 1].y,
          x2: pts[0].x,
          y2: pts[0].y,
        });
        if (polygonArea2D(pts) > 1e-3) polygons.push(pts);
      }
      continue;
    }

    i++;
  }

  return finalizeImportedGeometry(polygons, segments, 'DXF');
}

/**
 * Parses SVG polygon/polyline/rect/path elements into 2D geometry (normalized so +Y is North).
 */
export function parseSvgContent(svgText: string, metersPerSvgUnit = 0.02): ImportedGeometryResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const polygons: Point2D[][] = [];
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  const parsePointsAttr = (raw: string): Point2D[] => {
    const nums = raw
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    const pts: Point2D[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push({ x: nums[i] * metersPerSvgUnit, y: -nums[i + 1] * metersPerSvgUnit });
    }
    return pts;
  };

  doc.querySelectorAll('polygon').forEach((el) => {
    const pts = parsePointsAttr(el.getAttribute('points') || '');
    if (pts.length >= 3) {
      polygons.push(pts);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
  });

  doc.querySelectorAll('polyline').forEach((el) => {
    const pts = parsePointsAttr(el.getAttribute('points') || '');
    for (let i = 0; i + 1 < pts.length; i++) {
      segments.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
    }
    if (
      pts.length >= 4 &&
      Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-2
    ) {
      polygons.push(pts.slice(0, -1));
    }
  });

  doc.querySelectorAll('rect').forEach((el) => {
    const x = parseFloat(el.getAttribute('x') || '0') * metersPerSvgUnit;
    const y = -parseFloat(el.getAttribute('y') || '0') * metersPerSvgUnit;
    const w = parseFloat(el.getAttribute('width') || '0') * metersPerSvgUnit;
    const h = parseFloat(el.getAttribute('height') || '0') * metersPerSvgUnit;
    if (w > 0.1 && h > 0.1) {
      const pts: Point2D[] = [
        { x, y: y - h },
        { x: x + w, y: y - h },
        { x: x + w, y },
        { x, y },
      ];
      polygons.push(pts);
      for (let i = 0; i < 4; i++) {
        segments.push({
          x1: pts[i].x,
          y1: pts[i].y,
          x2: pts[(i + 1) % 4].x,
          y2: pts[(i + 1) % 4].y,
        });
      }
    }
  });

  doc.querySelectorAll('line').forEach((el) => {
    const x1 = parseFloat(el.getAttribute('x1') || '0') * metersPerSvgUnit;
    const y1 = -parseFloat(el.getAttribute('y1') || '0') * metersPerSvgUnit;
    const x2 = parseFloat(el.getAttribute('x2') || '0') * metersPerSvgUnit;
    const y2 = -parseFloat(el.getAttribute('y2') || '0') * metersPerSvgUnit;
    segments.push({ x1, y1, x2, y2 });
  });

  doc.querySelectorAll('path').forEach((el) => {
    const d = el.getAttribute('d') || '';
    const tokens = d.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
    if (!tokens) return;
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    let cmd = '';
    const pts: Point2D[] = [];
    let idx = 0;
    while (idx < tokens.length) {
      const tk = tokens[idx];
      if (/^[a-zA-Z]$/.test(tk)) {
        cmd = tk;
        idx++;
        if (cmd === 'Z' || cmd === 'z') {
          if (pts.length >= 3) {
            polygons.push([...pts]);
            for (let k = 0; k < pts.length; k++) {
              const a = pts[k];
              const b = pts[(k + 1) % pts.length];
              segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
            }
          }
          cx = sx;
          cy = sy;
          pts.length = 0;
        }
        continue;
      }
      const num = parseFloat(tk);
      if (cmd === 'M' || cmd === 'L') {
        const nx = num * metersPerSvgUnit;
        const ny = -parseFloat(tokens[idx + 1] || '0') * metersPerSvgUnit;
        idx += 2;
        if (cmd === 'M') {
          sx = nx;
          sy = ny;
        }
        cx = nx;
        cy = ny;
        pts.push({ x: cx, y: cy });
        if (cmd === 'M') cmd = 'L';
      } else if (cmd === 'm' || cmd === 'l') {
        cx += num * metersPerSvgUnit;
        cy += -parseFloat(tokens[idx + 1] || '0') * metersPerSvgUnit;
        idx += 2;
        if (cmd === 'm') {
          sx = cx;
          sy = cy;
          cmd = 'l';
        }
        pts.push({ x: cx, y: cy });
      } else if (cmd === 'H') {
        cx = num * metersPerSvgUnit;
        idx += 1;
        pts.push({ x: cx, y: cy });
      } else if (cmd === 'h') {
        cx += num * metersPerSvgUnit;
        idx += 1;
        pts.push({ x: cx, y: cy });
      } else if (cmd === 'V') {
        cy = -num * metersPerSvgUnit;
        idx += 1;
        pts.push({ x: cx, y: cy });
      } else if (cmd === 'v') {
        cy += -num * metersPerSvgUnit;
        idx += 1;
        pts.push({ x: cx, y: cy });
      } else {
        idx++;
      }
    }
    if (pts.length >= 2) {
      for (let k = 0; k + 1 < pts.length; k++) {
        segments.push({ x1: pts[k].x, y1: pts[k].y, x2: pts[k + 1].x, y2: pts[k + 1].y });
      }
    }
  });

  return finalizeImportedGeometry(polygons, segments, 'SVG');
}

function finalizeImportedGeometry(
  polygons: Point2D[][],
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  kind: string
): ImportedGeometryResult {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of segments) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 10;
    maxY = 10;
  }

  // Translate near origin (0, 0) for convenient architectural editing
  const shiftX = -minX;
  const shiftY = -minY;
  const shiftedPolys = polygons.map((poly) =>
    ensureCCW(poly.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY })))
  );
  const shiftedSegs = segments.map((s) => ({
    x1: s.x1 + shiftX,
    y1: s.y1 + shiftY,
    x2: s.x2 + shiftX,
    y2: s.y2 + shiftY,
  }));

  return {
    polygons: shiftedPolys,
    segments: shiftedSegs,
    bounds: { minX: 0, minY: 0, maxX: maxX - minX, maxY: maxY - minY },
    summary: `Archivo ${kind}: ${shiftedSegs.length} segmentos, ${shiftedPolys.length} contorno(s) cerrado(s).`,
  };
}

export function polygonToRoofBody(
  poly: Point2D[],
  bodyId: string,
  name: string,
  slopePct = 30,
  eaveHeight = 3.5
): RoofBody {
  const ccw = ensureCCW(poly);
  const verts: PolygonVertex[] = ccw.map((p, idx) => ({
    id: `${bodyId}-v${idx + 1}`,
    x: Number(p.x.toFixed(3)),
    y: Number(p.y.toFixed(3)),
  }));
  const edgeConfigs: RoofBody['edgeConfigs'] = {};
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const eid = `${a.id}->${b.id}`;
    edgeConfigs[eid] = {
      edgeId: eid,
      type: 'eave',
      slopePct,
      eaveHeight,
      overhang: 0.35,
      parapetHeight: 0,
      flashingHeight: 0.25,
      hasGutter: true,
      gutterDiameterMm: 125,
      gutterSlopePct: 1.0,
      gutterSection: 'semicircular',
    };
  }
  return {
    id: bodyId,
    name,
    mode: 'pitched_skeleton',
    outerLoop: verts,
    holes: [],
    edgeConfigs,
    defaultSlopePct: slopePct,
    defaultEaveHeight: eaveHeight,
    baseWallElevation: 0,
    parapetHeight: 0,
  };
}
