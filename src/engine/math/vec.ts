import type { Point2D, Point3D } from '../../types/roof';
import type { PlaneEquation } from '../../types/solved';

export const EPS = 1e-6;

export function add2(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub2(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale2(a: Point2D, s: number): Point2D {
  return { x: a.x * s, y: a.y * s };
}

export function dot2(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

export function cross2(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

export function len2(a: Point2D): number {
  return Math.hypot(a.x, a.y);
}

export function dist2(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function norm2(a: Point2D): Point2D {
  const l = Math.hypot(a.x, a.y);
  if (l < 1e-12) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}

/** Rotate 90 deg CCW: for a CCW polygon edge (p1 -> p2), this is the INWARD unit normal */
export function perpLeft(v: Point2D): Point2D {
  return { x: -v.y, y: v.x };
}

export function dist3(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function sub3(a: Point3D, b: Point3D): Point3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function cross3(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function dot3(a: Point3D, b: Point3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Signed area of polygon in 2D. Positive = CCW, Negative = CW */
export function signedArea2D(pts: Point2D[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

export function polygonArea2D(pts: Point2D[]): number {
  return Math.abs(signedArea2D(pts));
}

export function ensureCCW<T extends Point2D>(pts: T[]): T[] {
  return signedArea2D(pts) >= 0 ? pts : [...pts].reverse();
}

export function ensureCW<T extends Point2D>(pts: T[]): T[] {
  return signedArea2D(pts) <= 0 ? pts : [...pts].reverse();
}

export function centroid2D(pts: Point2D[]): Point2D {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  let a2 = 0;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % n];
    const f = p0.x * p1.y - p1.x * p0.y;
    sx += (p0.x + p1.x) * f;
    sy += (p0.y + p1.y) * f;
    a2 += f;
  }
  if (Math.abs(a2) < 1e-9) {
    return {
      x: pts.reduce((acc, p) => acc + p.x, 0) / n,
      y: pts.reduce((acc, p) => acc + p.y, 0) / n,
    };
  }
  return { x: sx / (3 * a2), y: sy / (3 * a2) };
}

export function pointInPolygon2D(pt: Point2D, poly: Point2D[], inclusive = true): boolean {
  const n = poly.length;
  if (n < 3) return false;
  if (inclusive) {
    for (let i = 0; i < n; i++) {
      if (distancePointToSegment2D(pt, poly[i], poly[(i + 1) % n]) < 1e-6) {
        return true;
      }
    }
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distancePointToSegment2D(p: Point2D, a: Point2D, b: Point2D): number {
  const ab = sub2(b, a);
  const lenSq = dot2(ab, ab);
  if (lenSq < 1e-12) return dist2(p, a);
  const t = Math.max(0, Math.min(1, dot2(sub2(p, a), ab) / lenSq));
  const proj = add2(a, scale2(ab, t));
  return dist2(p, proj);
}

export function projectPointOnSegment2D(
  p: Point2D,
  a: Point2D,
  b: Point2D
): { proj: Point2D; t: number; dist: number } {
  const ab = sub2(b, a);
  const lenSq = dot2(ab, ab);
  if (lenSq < 1e-12) return { proj: a, t: 0, dist: dist2(p, a) };
  const t = dot2(sub2(p, a), ab) / lenSq;
  const clamped = Math.max(0, Math.min(1, t));
  const proj = add2(a, scale2(ab, clamped));
  return { proj, t: clamped, dist: dist2(p, proj) };
}

export function segmentIntersection2D(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
  strictInterior = false
): { point: Point2D; tA: number; tB: number } | null {
  const r = sub2(a2, a1);
  const s = sub2(b2, b1);
  const denom = cross2(r, s);
  if (Math.abs(denom) < 1e-9) return null;
  const qp = sub2(b1, a1);
  const tA = cross2(qp, s) / denom;
  const tB = cross2(qp, r) / denom;
  const margin = strictInterior ? 1e-5 : -1e-6;
  if (tA >= margin && tA <= 1 - margin && tB >= margin && tB <= 1 - margin) {
    return { point: add2(a1, scale2(r, tA)), tA, tB };
  }
  return null;
}

export function polygonSelfIntersects(pts: Point2D[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];
      if (segmentIntersection2D(a1, a2, b1, b2, false)) {
        return true;
      }
    }
  }
  return false;
}

/** Exact plane z = a*x + b*y + c from boundary segment (p1->p2), unit inward normal, eave height z0, and slope ratio */
export function createPlaneFromEdge(
  p1: Point2D,
  inwardNormal: Point2D,
  eaveHeight: number,
  slopeRatio: number
): PlaneEquation {
  const a = slopeRatio * inwardNormal.x;
  const b = slopeRatio * inwardNormal.y;
  const c = eaveHeight - a * p1.x - b * p1.y;
  return { a, b, c };
}

/** Exact plane z = a*x + b*y + c from 3 non-collinear 3D points */
export function createPlaneFrom3Points(p1: Point3D, p2: Point3D, p3: Point3D): PlaneEquation {
  const u = sub3(p2, p1);
  const v = sub3(p3, p1);
  const n = cross3(u, v);
  if (Math.abs(n.z) < 1e-10) {
    return { a: 0, b: 0, c: (p1.z + p2.z + p3.z) / 3 };
  }
  const a = -n.x / n.z;
  const b = -n.y / n.z;
  const c = p1.z - a * p1.x - b * p1.y;
  return { a, b, c };
}

export function evalPlane(plane: PlaneEquation, x: number, y: number): number {
  return plane.a * x + plane.b * y + plane.c;
}

export function slopeFromPlane(plane: PlaneEquation): {
  slopeRatio: number;
  slopePct: number;
  angleDeg: number;
  runoffDir2D: Point2D;
  azimuthDeg: number;
  orientationLabel: string;
} {
  const slopeRatio = Math.hypot(plane.a, plane.b);
  const slopePct = slopeRatio * 100;
  const angleDeg = (Math.atan(slopeRatio) * 180) / Math.PI;
  if (slopeRatio < 1e-7) {
    return {
      slopeRatio: 0,
      slopePct: 0,
      angleDeg: 0,
      runoffDir2D: { x: 0, y: 0 },
      azimuthDeg: 0,
      orientationLabel: 'Horizontal',
    };
  }
  // Steepest descent vector: -grad(z) = (-a, -b)
  const runoffDir2D = { x: -plane.a / slopeRatio, y: -plane.b / slopeRatio };
  // Azimuth: 0 = North (+Y), 90 = East (+X), 180 = South (-Y), 270 = West (-X)
  let azimuthDeg = (Math.atan2(runoffDir2D.x, runoffDir2D.y) * 180) / Math.PI;
  if (azimuthDeg < 0) azimuthDeg += 360;
  const dirs = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
  const idx = Math.round(azimuthDeg / 45) % 8;
  return {
    slopeRatio,
    slopePct,
    angleDeg,
    runoffDir2D,
    azimuthDeg,
    orientationLabel: dirs[idx],
  };
}

/**
 * 3D surface area of a planar polygon given its plane z = a*x + b*y + c
 * Exact identity: Area_3D = Area_2D * sqrt(1 + a^2 + b^2)
 */
export function inclinedAreaFromProjected(projectedArea: number, plane: PlaneEquation): number {
  return projectedArea * Math.sqrt(1 + plane.a * plane.a + plane.b * plane.b);
}

/**
 * Homogeneous linear constraint: A*x + B*y + D*z + C = 0
 */
export interface LinearConstraint3D {
  A: number;
  B: number;
  D: number;
  C: number;
}

export function constraintFromPlane(p: PlaneEquation): LinearConstraint3D {
  return { A: p.a, B: p.b, D: -1, C: p.c };
}

export function constraintFromVerticalLine(p1: Point2D, inwardNormal: Point2D): LinearConstraint3D {
  return {
    A: inwardNormal.x,
    B: inwardNormal.y,
    D: 0,
    C: -(inwardNormal.x * p1.x + inwardNormal.y * p1.y),
  };
}

/**
 * Computes parametric ray p(z) = p0 + v * z along intersection of two constraints.
 * Returns null if parallel (det ~ 0).
 */
export function intersectTwoConstraints(
  c1: LinearConstraint3D,
  c2: LinearConstraint3D
): { p0: Point2D; v: Point2D } | null {
  const det = c1.A * c2.B - c2.A * c1.B;
  if (Math.abs(det) < 1e-9) return null;
  const p0: Point2D = {
    x: (-c1.C * c2.B + c2.C * c1.B) / det,
    y: (-c1.A * c2.C + c2.A * c1.C) / det,
  };
  const v: Point2D = {
    x: (-c1.D * c2.B + c2.D * c1.B) / det,
    y: (-c1.A * c2.D + c2.A * c1.D) / det,
  };
  return { p0, v };
}

/**
 * Intersects ray p(z) = p0 + v * z with a 3rd constraint c3.
 * Returns exact z* and point (x*, y*) or null if parallel.
 */
export function intersectRayWithConstraint(
  p0: Point2D,
  v: Point2D,
  c3: LinearConstraint3D
): { z: number; point: Point2D } | null {
  const denom = c3.A * v.x + c3.B * v.y + c3.D;
  if (Math.abs(denom) < 1e-9) return null;
  const num = -(c3.A * p0.x + c3.B * p0.y + c3.C);
  const z = num / denom;
  return {
    z,
    point: { x: p0.x + v.x * z, y: p0.y + v.y * z },
  };
}
