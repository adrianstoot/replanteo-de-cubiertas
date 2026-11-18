import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useRoofStore } from '../../store/useRoofStore';
import { ROOF_SYSTEMS } from '../../engine/presets/materials';
import { getMaterialTextures } from '../../engine/three/proceduralTextures';
import { evalPlane, pointInPolygon2D, dist2, distancePointToSegment2D } from '../../engine/math/vec';
import type { Point2D, CameraPreset3D, RenderStyle3D, RoofBody } from '../../types/roof';
import type { SolvedEdge, SolvedFace } from '../../types/solved';
import { Sun, Maximize, Eye, Camera, Droplets } from 'lucide-react';

/** Convert Architectural (x=East, y=North, z=Up) -> Three.js (X=East, Y=Up, Z=-North) */
function toThree(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y);
}

/** Triangulates an arbitrary simple 2D polygon face cleanly onto its exact 3D plane */
function buildFaceSlabGeometry(face: SolvedFace, thicknessM: number): THREE.BufferGeometry {
  const contour = face.polygon2D.map((p) => new THREE.Vector2(p.x, p.y));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];

  const nx = -face.plane.a;
  const ny = 1;
  const nz = face.plane.b;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  const nUnit = new THREE.Vector3(nx / nLen, ny / nLen, nz / nLen);

  // Top surface (CCW upward)
  for (const [ia, ib, ic] of tris) {
    const pts = [face.polygon2D[ia], face.polygon2D[ib], face.polygon2D[ic]];
    for (const p of pts) {
      const z = evalPlane(face.plane, p.x, p.y);
      positions.push(p.x, z, -p.y);
      uvs.push(p.x * 0.35, p.y * 0.35);
      normals.push(nUnit.x, nUnit.y, nUnit.z);
    }
  }

  // Bottom soffit surface
  const dz = thicknessM / Math.max(0.4, nUnit.y);
  for (const [ia, ib, ic] of tris) {
    const pts = [face.polygon2D[ia], face.polygon2D[ic], face.polygon2D[ib]];
    for (const p of pts) {
      const z = evalPlane(face.plane, p.x, p.y) - dz;
      positions.push(p.x, z, -p.y);
      uvs.push(p.x * 0.35, p.y * 0.35);
      normals.push(-nUnit.x, -nUnit.y, -nUnit.z);
    }
  }

  // Fascia rim quads
  const n = face.polygon2D.length;
  for (let i = 0; i < n; i++) {
    const a = face.polygon2D[i];
    const b = face.polygon2D[(i + 1) % n];
    const za = evalPlane(face.plane, a.x, a.y);
    const zb = evalPlane(face.plane, b.x, b.y);
    const p1 = new THREE.Vector3(a.x, za, -a.y);
    const p2 = new THREE.Vector3(b.x, zb, -b.y);
    const p3 = new THREE.Vector3(b.x, zb - dz, -b.y);
    const p4 = new THREE.Vector3(a.x, za - dz, -a.y);

    const edgeDir = new THREE.Vector3().subVectors(p2, p1);
    const sideN = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(0, 1, 0)).normalize();

    const addTri = (u: THREE.Vector3, v: THREE.Vector3, w: THREE.Vector3) => {
      positions.push(u.x, u.y, u.z, v.x, v.y, v.z, w.x, w.y, w.z);
      uvs.push(0, 0, 1, 0, 1, 1);
      normals.push(sideN.x, sideN.y, sideN.z, sideN.x, sideN.y, sideN.z, sideN.x, sideN.y, sideN.z);
    };
    addTri(p1, p3, p2);
    addTri(p1, p4, p3);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.computeBoundingSphere();
  return geom;
}

/**
 * True 3D architectural mixed/curved Spanish clay roof tile profile:
 * - Local +X: across tile width
 * - Local +Y: thickness / upward normal
 * - Local +Z: upslope (tilts slightly up at -Z eave end to overlap row below cleanly!)
 */
function createRealisticTileGeometry(w: number, l: number, isCurved = true): THREE.BufferGeometry {
  if (!isCurved) {
    const g = new THREE.BoxGeometry(w * 0.96, 0.02, l * 0.99);
    g.translate(0, 0.012, 0);
    return g;
  }
  const segsX = 10;
  const segsZ = 4;
  const geom = new THREE.BoxGeometry(w * 0.99, 0.018, l * 0.99, segsX, 1, segsZ);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = x / (w * 0.495); // -1..1
    // Authentic S-profile (teja mixta: recessed water channel + bold semicircular cobija arch)
    const arch =
      nx >= -0.18
        ? Math.cos(((nx - 0.41) / 0.59) * Math.PI * 0.5) * 0.044
        : Math.sin(((nx + 1) / 0.82) * Math.PI) * -0.004 + 0.005;
    // Slight upslope tilt so lower nose (-Z) rests visibly over the row below casting sharp shadow lines
    const overlapTilt = (-z / l) * 0.022;
    pos.setY(i, y + Math.max(0.002, arch) + overlapTilt + 0.014);
  }
  geom.computeVertexNormals();
  return geom;
}

/** Open half-round semicircular gutter trough oriented along local +Z, opening skyward (+Y) */
function createHalfRoundGutterGeometry(radius: number, length: number): THREE.BufferGeometry {
  const segsU = 14;
  const thick = 0.008;
  const halfLen = length * 0.5;
  const positions: number[] = [];
  const uvs: number[] = [];

  const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };

  for (let i = 0; i < segsU; i++) {
    const a0 = Math.PI + (i / segsU) * Math.PI; // PI..2*PI -> bottom arc (-Y), open UP (+Y)
    const a1 = Math.PI + ((i + 1) / segsU) * Math.PI;
    const x0 = Math.cos(a0) * radius;
    const y0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const y1 = Math.sin(a1) * radius;

    const xo0 = Math.cos(a0) * (radius + thick);
    const yo0 = Math.sin(a0) * (radius + thick);
    const xo1 = Math.cos(a1) * (radius + thick);
    const yo1 = Math.sin(a1) * (radius + thick);

    pushQuad(
      new THREE.Vector3(xo0, yo0, -halfLen),
      new THREE.Vector3(xo1, yo1, -halfLen),
      new THREE.Vector3(xo1, yo1, halfLen),
      new THREE.Vector3(xo0, yo0, halfLen)
    );
    pushQuad(
      new THREE.Vector3(x1, y1, -halfLen),
      new THREE.Vector3(x0, y0, -halfLen),
      new THREE.Vector3(x0, y0, halfLen),
      new THREE.Vector3(x1, y1, halfLen)
    );
  }
  // End caps
  for (const endZ of [-halfLen, halfLen]) {
    for (let i = 0; i < segsU; i++) {
      const a0 = Math.PI + (i / segsU) * Math.PI;
      const a1 = Math.PI + ((i + 1) / segsU) * Math.PI;
      const x0 = Math.cos(a0) * radius;
      const y0 = Math.sin(a0) * radius;
      const x1 = Math.cos(a1) * radius;
      const y1 = Math.sin(a1) * radius;
      positions.push(0, 0, endZ, x0, y0, endZ, x1, y1, endZ);
      uvs.push(0.5, 0.5, 0, 0, 1, 0);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Folded V-trough metallic valley flashing (limahoya) oriented along local +Z, upright +Y */
function createValleyChannelGeometry(width: number, length: number): THREE.BufferGeometry {
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  const depth = 0.032;
  const lip = 0.025;
  const pts: Array<[number, number]> = [
    [-halfW - lip, 0.018],
    [-halfW, 0.014],
    [0, -depth],
    [halfW, 0.014],
    [halfW + lip, 0.018],
  ];
  const positions: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    positions.push(
      x0, y0, -halfL,
      x1, y1, -halfL,
      x1, y1, halfL,
      x0, y0, -halfL,
      x1, y1, halfL,
      x0, y0, halfL
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * True upright arched ceramic ridge cap tile ("Caballete"):
 * Oriented with arch opening DOWN (-Y) and length along +Z!
 */
function createRidgeCapGeometry(radius = 0.095, len = 0.38): THREE.BufferGeometry {
  const segsU = 10;
  const halfLen = len * 0.5;
  const thick = 0.022;
  const positions: number[] = [];
  const uvs: number[] = [];

  const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };

  for (let i = 0; i < segsU; i++) {
    const a0 = (i / segsU) * Math.PI; // 0 (right) -> PI (left)
    const a1 = ((i + 1) / segsU) * Math.PI;
    const x0 = Math.cos(a0) * radius;
    const y0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const y1 = Math.sin(a1) * radius;

    const xo0 = Math.cos(a0) * (radius + thick);
    const yo0 = Math.sin(a0) * (radius + thick);
    const xo1 = Math.cos(a1) * (radius + thick);
    const yo1 = Math.sin(a1) * (radius + thick);

    // Outer arch surface (facing UP)
    pushQuad(
      new THREE.Vector3(xo0, yo0, -halfLen),
      new THREE.Vector3(xo1, yo1, -halfLen),
      new THREE.Vector3(xo1, yo1, halfLen),
      new THREE.Vector3(xo0, yo0, halfLen)
    );
    // Front & back thickness caps
    pushQuad(
      new THREE.Vector3(x0, y0, halfLen),
      new THREE.Vector3(x1, y1, halfLen),
      new THREE.Vector3(xo1, yo1, halfLen),
      new THREE.Vector3(xo0, yo0, halfLen)
    );
    pushQuad(
      new THREE.Vector3(xo0, yo0, -halfLen),
      new THREE.Vector3(xo1, yo1, -halfLen),
      new THREE.Vector3(x1, y1, -halfLen),
      new THREE.Vector3(x0, y0, -halfLen)
    );
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

const CameraRig: React.FC<{
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  bounds3D: { minZ: number; maxZ: number };
  preset: CameraPreset3D;
}> = ({ bounds, bounds3D, preset }) => {
  const { camera } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const cz = (bounds3D.minZ + bounds3D.maxZ) * 0.5;
  const span = Math.max(10, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const target = useMemo(() => toThree(cx, cy, cz * 0.55), [cx, cy, cz]);

  useLayoutEffect(() => {
    let pos: THREE.Vector3;
    if (preset === 'superior') {
      pos = toThree(cx, cy - 0.01, cz + span * 1.55);
    } else if (preset === 'axonometrica') {
      pos = toThree(cx + span * 1.15, cy - span * 1.15, cz + span * 1.05);
    } else if (preset === 'alzado_sur') {
      pos = toThree(cx, cy - span * 1.48, cz + span * 0.18);
    } else if (preset === 'alzado_este') {
      pos = toThree(cx + span * 1.48, cy, cz + span * 0.18);
    } else {
      pos = toThree(cx + span * 0.92, cy - span * 1.32, cz + span * 1.08);
    }
    camera.position.copy(pos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.copy(target);
      controlsRef.current.update();
    }
  }, [camera, cx, cy, cz, preset, span, target]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      maxPolarAngle={Math.PI * 0.49}
      minDistance={3}
      maxDistance={span * 6}
    />
  );
};

const RealRainSimulation3D: React.FC = () => {
  const { project, solved, showWaterFlow, renderStyle3D } = useRoofStore();
  const active = showWaterFlow || renderStyle3D === 'flujo';

  const rainRef = useRef<THREE.InstancedMesh>(null);
  const splashRef = useRef<THREE.InstancedMesh>(null);
  const runoffRef = useRef<THREE.InstancedMesh>(null);

  const b = solved.bounds2D;
  const cx = (b.minX + b.maxX) * 0.5;
  const cy = (b.minY + b.maxY) * 0.5;
  const spanX = Math.max(16, b.maxX - b.minX + 10);
  const spanY = Math.max(16, b.maxY - b.minY + 10);
  const ceilY = solved.bounds3D.maxZ + 12;

  const RAIN_COUNT = 950;
  const SPLASH_COUNT = 90;

  // Deterministic falling rain streaks + exact roof hit heights
  const rainSeeds = useMemo(() => {
    const arr: Array<{ x: number; yStart: number; z: number; hitY: number; speed: number; len: number }> = [];
    for (let i = 0; i < RAIN_COUNT; i++) {
      const rx = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      const rz = ((Math.sin(i * 78.233) * 19341.123) % 1 + 1) % 1;
      const rt = ((Math.sin(i * 39.425) * 91823.71) % 1 + 1) % 1;
      const wx = cx + (rx - 0.5) * spanX;
      const wy = cy + (rz - 0.5) * spanY;
      // Compute exact roof surface height at (wx, wy)
      let hitY = 0.06;
      for (const f of solved.faces) {
        if (pointInPolygon2D({ x: wx, y: wy }, f.polygon2D, true)) {
          hitY = Math.max(hitY, evalPlane(f.plane, wx, wy) + 0.04);
        }
      }
      arr.push({
        x: wx,
        yStart: rt,
        z: -wy,
        hitY,
        speed: 13.5 + (i % 7) * 0.7,
        len: 0.45 + (i % 4) * 0.14,
      });
    }
    return arr;
  }, [cx, cy, solved.faces, spanX, spanY]);

  // Splash positions strictly on roof faces oriented to face normal!
  const splashSeeds = useMemo(() => {
    const out: Array<{ pos: THREE.Vector3; quat: THREE.Quaternion; phase: number }> = [];
    if (solved.faces.length === 0) return out;
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const f = solved.faces[i % solved.faces.length];
      const minX = Math.min(...f.polygon2D.map((p) => p.x));
      const maxX = Math.max(...f.polygon2D.map((p) => p.x));
      const minY = Math.min(...f.polygon2D.map((p) => p.y));
      const maxY = Math.max(...f.polygon2D.map((p) => p.y));
      let px = f.centroid2D.x;
      let py = f.centroid2D.y;
      for (let attempt = 0; attempt < 5; attempt++) {
        const rx = ((Math.sin((i * 11 + attempt) * 43.17) * 12345.67) % 1 + 1) % 1;
        const ry = ((Math.sin((i * 17 + attempt) * 91.23) * 54321.12) % 1 + 1) % 1;
        const cand = { x: minX + rx * (maxX - minX), y: minY + ry * (maxY - minY) };
        if (pointInPolygon2D(cand, f.polygon2D, false)) {
          px = cand.x;
          py = cand.y;
          break;
        }
      }
      const z = evalPlane(f.plane, px, py) + 0.036;
      const N = new THREE.Vector3(-f.plane.a, 1, f.plane.b).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), N);
      out.push({ pos: new THREE.Vector3(px, z, -py), quat, phase: (i * 0.37) % 1 });
    }
    return out;
  }, [solved.faces]);

  // Build dense runoff paths (face streamlines + valley streamlines + gutter + downspout cascades!)
  const runoffPaths = useMemo(() => {
    const list: Array<{ a: THREE.Vector3; b: THREE.Vector3; isValley: boolean }> = [];
    for (const sl of solved.hydrology.streamlines) {
      if (sl.points3D.length < 2) continue;
      const isValley = sl.id.startsWith('flow-valley');
      list.push({
        a: toThree(sl.points3D[0].x, sl.points3D[0].y, sl.points3D[0].z + 0.042),
        b: toThree(
          sl.points3D[sl.points3D.length - 1].x,
          sl.points3D[sl.points3D.length - 1].y,
          sl.points3D[sl.points3D.length - 1].z + 0.042
        ),
        isValley,
      });
    }
    // Downspout vertical cascades
    for (const ds of project.downspouts) {
      const topZ = project.bodies[0]?.defaultEaveHeight ?? 3.5;
      list.push({
        a: toThree(ds.x, ds.y, topZ),
        b: toThree(ds.x, ds.y, 0.15),
        isValley: true,
      });
    }
    return list;
  }, [project.bodies, project.downspouts, solved.hydrology.streamlines]);

  // 4 droplets per runoff path for smooth continuous flow streams
  const DROPLETS_PER_PATH = 4;
  const totalDroplets = runoffPaths.length * DROPLETS_PER_PATH;

  const rainGeom = useMemo(() => new THREE.CylinderGeometry(0.006, 0.008, 1, 4), []);
  const splashGeom = useMemo(() => new THREE.RingGeometry(0.05, 0.085, 16), []);
  const dropletGeom = useMemo(() => new THREE.SphereGeometry(0.036, 8, 8), []);

  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const rainTiltQuat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 0.1)),
    []
  );
  const flatRingRot = useMemo(() => new THREE.Euler(-Math.PI / 2, 0, 0), []);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.getElapsedTime();

    // 1. Update falling rain streaks
    if (rainRef.current) {
      for (let i = 0; i < rainSeeds.length; i++) {
        const s = rainSeeds[i];
        const fallH = ceilY - s.hitY;
        const frac = ((t * s.speed) / fallH + s.yStart) % 1;
        const y = ceilY - frac * fallH;
        dummyObj.position.set(s.x - frac * 1.1, y, s.z + frac * 0.9);
        dummyObj.quaternion.copy(rainTiltQuat);
        dummyObj.scale.set(1, s.len, 1);
        dummyObj.updateMatrix();
        rainRef.current.setMatrixAt(i, dummyObj.matrix);
      }
      rainRef.current.instanceMatrix.needsUpdate = true;
    }

    // 2. Update micro splash rings on exact roof slopes
    if (splashRef.current && splashSeeds.length > 0) {
      for (let i = 0; i < splashSeeds.length; i++) {
        const sp = splashSeeds[i];
        const age = (t * 1.9 + sp.phase) % 1;
        const sc = 0.25 + age * 1.45;
        dummyObj.position.copy(sp.pos);
        dummyObj.quaternion.copy(sp.quat);
        const qFlat = new THREE.Quaternion().setFromEuler(flatRingRot);
        dummyObj.quaternion.multiply(qFlat);
        dummyObj.scale.set(sc, sc, 1);
        dummyObj.updateMatrix();
        splashRef.current.setMatrixAt(i, dummyObj.matrix);
      }
      splashRef.current.instanceMatrix.needsUpdate = true;
    }

    // 3. Update multi-droplet surface runoff streams
    if (runoffRef.current && runoffPaths.length > 0) {
      let idx = 0;
      for (let pIdx = 0; pIdx < runoffPaths.length; pIdx++) {
        const path = runoffPaths[pIdx];
        const dir = new THREE.Vector3().subVectors(path.b, path.a);
        const speed = path.isValley ? 0.95 : 0.65;
        for (let d = 0; d < DROPLETS_PER_PATH; d++) {
          const u = (t * speed + d / DROPLETS_PER_PATH + pIdx * 0.13) % 1;
          dummyObj.position.copy(path.a).addScaledVector(dir, u);
          dummyObj.quaternion.set(0, 0, 0, 1);
          const sc = path.isValley ? 1.35 : 0.95;
          dummyObj.scale.set(sc, sc * 0.55, sc);
          dummyObj.updateMatrix();
          runoffRef.current.setMatrixAt(idx++, dummyObj.matrix);
        }
      }
      runoffRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (!active) return null;

  return (
    <group>
      {/* Falling Rain Streaks */}
      <instancedMesh ref={rainRef} args={[rainGeom, undefined, RAIN_COUNT]} frustumCulled={false}>
        <meshBasicMaterial color="#e0f2fe" transparent opacity={0.45} depthWrite={false} />
      </instancedMesh>

      {/* Surface Raindrop Splash Rings */}
      {splashSeeds.length > 0 && (
        <instancedMesh
          ref={splashRef}
          args={[splashGeom, undefined, splashSeeds.length]}
          frustumCulled={false}
        >
          <meshBasicMaterial
            color="#bae6fd"
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </instancedMesh>
      )}

      {/* Sleek Hydrodynamic Surface Flow Streamlines */}
      {runoffPaths.map((p, idx) => {
        const dir = new THREE.Vector3().subVectors(p.b, p.a);
        const len = dir.length();
        if (len < 0.05) return null;
        const mid = new THREE.Vector3().addVectors(p.a, p.b).multiplyScalar(0.5);
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize()
        );
        return (
          <mesh key={`stream-${idx}`} position={mid} quaternion={quat}>
            <cylinderGeometry args={[p.isValley ? 0.022 : 0.008, p.isValley ? 0.028 : 0.011, len, 6]} />
            <meshBasicMaterial
              color={p.isValley ? '#0284c7' : '#38bdf8'}
              transparent
              opacity={p.isValley ? 0.72 : 0.42}
              depthWrite={false}
            />
          </mesh>
        );
      })}

      {/* Flowing Water Droplets */}
      {totalDroplets > 0 && (
        <instancedMesh
          ref={runoffRef}
          args={[dropletGeom, undefined, totalDroplets]}
          frustumCulled={false}
        >
          <meshStandardMaterial
            color="#e0f2fe"
            emissive="#0ea5e9"
            emissiveIntensity={0.95}
            roughness={0.1}
          />
        </instancedMesh>
      )}

      {/* Standing Water Accumulation / Alert Puddle Rings */}
      {solved.hydrology.alerts.map((al) => {
        const hitZ = solved.faces.reduce(
          (best, f) =>
            pointInPolygon2D(al.location, f.polygon2D, true)
              ? Math.max(best, evalPlane(f.plane, al.location.x, al.location.y))
              : best,
          project.bodies[0]?.defaultEaveHeight ?? 3.5
        );
        return (
          <mesh
            key={`puddle-${al.id}`}
            position={[al.location.x, hitZ + 0.05, -al.location.y]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[0.55, 24]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.45} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
};

const InstancedRoofTiles: React.FC<{
  faces: SolvedFace[];
  edges: SolvedEdge[];
  wireframe: boolean;
}> = ({ faces, edges, wireframe }) => {
  const { project, showWaterFlow, renderStyle3D } = useRoofStore();
  const isWet = showWaterFlow || renderStyle3D === 'flujo';
  const isPieceCladding = [
    'teja_curva',
    'teja_mixta',
    'teja_plana',
    'teja_encaje',
    'pizarra',
  ].includes(project.systemId);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const sysMeta = ROOF_SYSTEMS[project.systemId];

  const tileGeom = useMemo(() => {
    // Use full overlapping tile width so courses imbricate cleanly with zero dark gap stripes
    const w = Math.max(0.16, (project.tileSpec.widthCm + 1.5) / 100);
    const l = Math.max(0.22, project.tileSpec.lengthCm / 100);
    return createRealisticTileGeometry(
      w,
      l,
      project.systemId === 'teja_curva' || project.systemId === 'teja_mixta'
    );
  }, [project.systemId, project.tileSpec.lengthCm, project.tileSpec.widthCm]);

  const tileTex = useMemo(
    () => getMaterialTextures(project.systemId === 'pizarra' ? 'slate' : 'terracotta_tile'),
    [project.systemId]
  );

  const eaveAndValleyEdges = useMemo(
    () => ({
      eaves: edges.filter((e) => e.type === 'alero'),
      valleys: edges.filter((e) => e.type === 'limahoya'),
    }),
    [edges]
  );

  const placements = useMemo(() => {
    if (!isPieceCladding) return [];
    const stepU = Math.max(
      0.14,
      (project.tileSpec.widthCm - project.tileSpec.overlapWidthCm) / 100
    );
    const stepV = Math.max(
      0.18,
      (project.tileSpec.lengthCm - project.tileSpec.overlapLengthCm) / 100
    );
    const valleyHalfGap = Math.max(0.08, project.tileSpec.valleyGapCm / 200);
    const out: Array<{ matrix: THREE.Matrix4; shade: number }> = [];
    const MAX_TILES = 8500;

    const ptToSegDist = (pt: Point2D, a: Point2D, b: Point2D) => {
      const segX = b.x - a.x;
      const segY = b.y - a.y;
      const l2 = segX * segX + segY * segY;
      const t = l2 > 1e-8 ? Math.max(0, Math.min(1, ((pt.x - a.x) * segX + (pt.y - a.y) * segY) / l2)) : 0;
      return dist2(pt, { x: a.x + t * segX, y: a.y + t * segY });
    };

    for (const face of faces) {
      if (face.slopePct < 2) continue;
      const nx = -face.plane.a;
      const ny = 1;
      const nz = face.plane.b;
      const N = new THREE.Vector3(nx, ny, nz).normalize();
      const gradLen = Math.hypot(face.plane.a, face.plane.b);
      if (gradLen < 1e-5) continue;

      const Vup = new THREE.Vector3(
        face.plane.a,
        face.plane.a * face.plane.a + face.plane.b * face.plane.b,
        -face.plane.b
      ).normalize();
      const U = new THREE.Vector3().crossVectors(Vup, N).normalize();

      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      const origin = toThree(face.centroid2D.x, face.centroid2D.y, face.centroid3D.z);

      for (const p of face.polygon2D) {
        const p3 = toThree(p.x, p.y, evalPlane(face.plane, p.x, p.y));
        const rel = p3.clone().sub(origin);
        const u = rel.dot(U);
        const v = rel.dot(Vup);
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }

      const rotMat = new THREE.Matrix4().makeBasis(U, N, Vup);

      for (let v = minV + 0.04; v <= maxV - stepV * 0.1; v += stepV) {
        for (let u = minU + stepU * 0.2; u <= maxU - stepU * 0.12; u += stepU) {
          if (out.length >= MAX_TILES) break;
          const world3 = origin
            .clone()
            .addScaledVector(U, u)
            .addScaledVector(Vup, v)
            .addScaledVector(N, 0.02);
          const archPt: Point2D = { x: world3.x, y: -world3.z };
          if (!pointInPolygon2D(archPt, face.polygon2D, true)) continue;

          // Punch clean roof opening around skylights, chimneys and shunts so zero tiles clip inside them!
          let hitsSingular = false;
          for (const sg of project.singularElements) {
            const dxS = archPt.x - sg.x;
            const dyS = archPt.y - sg.y;
            const rRad = (-sg.rotationDeg * Math.PI) / 180;
            const lx = dxS * Math.cos(rRad) - dyS * Math.sin(rRad);
            const ly = dxS * Math.sin(rRad) + dyS * Math.cos(rRad);
            if (Math.abs(lx) <= sg.width * 0.5 + 0.08 && Math.abs(ly) <= sg.depth * 0.5 + 0.08) {
              hitsSingular = true;
              break;
            }
          }
          if (hitsSingular) continue;

          // Pull back cleanly at valley troughs so the metal flashing channel stays clearly visible,
          // while letting eave starter tiles reach ALL the way to the eave overhang edge!
          const nearValley = eaveAndValleyEdges.valleys.some(
            (ve) => ptToSegDist(archPt, ve.p1, ve.p2) < valleyHalfGap
          );
          if (nearValley) continue;

          let tooCloseNonEave = false;
          for (let k = 0; k < face.polygon2D.length; k++) {
            const a = face.polygon2D[k];
            const b = face.polygon2D[(k + 1) % face.polygon2D.length];
            const dEdge = ptToSegDist(archPt, a, b);
            if (dEdge < 0.025) {
              const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
              const isAlongEave = eaveAndValleyEdges.eaves.some(
                (ee) => ptToSegDist(mid, ee.p1, ee.p2) < 0.12
              );
              if (!isAlongEave) {
                tooCloseNonEave = true;
                break;
              }
            }
          }
          if (tooCloseNonEave) continue;

          const m = rotMat.clone();
          m.setPosition(world3);
          const hash = Math.abs(Math.sin(u * 12.9898 + v * 78.233) * 43758.5453) % 1;
          out.push({ matrix: m, shade: hash });
        }
        if (out.length >= MAX_TILES) break;
      }
      if (out.length >= MAX_TILES) break;
    }
    return out;
  }, [eaveAndValleyEdges, faces, isPieceCladding, project.singularElements, project.tileSpec]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || placements.length === 0) return;
    const baseCol =
      project.systemId === 'pizarra' ? new THREE.Color('#cbd5e1') : new THREE.Color('#fae6dc');
    const tmpCol = new THREE.Color();
    placements.forEach((pl, i) => {
      mesh.setMatrixAt(i, pl.matrix);
      tmpCol.copy(baseCol).offsetHSL((pl.shade - 0.5) * 0.036, (pl.shade - 0.5) * 0.09, (pl.shade - 0.5) * 0.12);
      mesh.setColorAt(i, tmpCol);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [placements, project.systemId]);

  if (!isPieceCladding || placements.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[tileGeom, undefined, placements.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        map={tileTex.map}
        bumpMap={tileTex.bumpMap}
        bumpScale={0.015}
        roughnessMap={tileTex.roughnessMap}
        roughness={isWet ? 0.22 : 0.78}
        metalness={sysMeta.metalness}
        wireframe={wireframe}
      />
    </instancedMesh>
  );
};

/** Renders true upright overlapping ceramic ridge & hip cap tiles ("Caballetes") */
const RidgeCapTiles3D: React.FC<{
  edges: SolvedEdge[];
  wireframe: boolean;
  clippingPlanes: THREE.Plane[];
}> = ({ edges, wireframe, clippingPlanes }) => {
  const { project, selectedEntity, setSelectedEntity } = useRoofStore();
  const sysMeta = ROOF_SYSTEMS[project.systemId];
  const ridgeCapGeom = useMemo(() => createRidgeCapGeometry(0.088, 0.38), []);
  const tileTex = useMemo(
    () => getMaterialTextures(project.systemId === 'pizarra' ? 'slate' : 'terracotta_tile'),
    [project.systemId]
  );

  const ridgeEdges = useMemo(() => {
    if (project.isFlatRoofMode || project.systemId === 'zinc') return [];
    return edges.filter((e) => e.type === 'cumbrera' || e.type === 'limatesa');
  }, [edges, project.isFlatRoofMode, project.systemId]);

  return (
    <group>
      {ridgeEdges.map((edge) => {
        const p1 = toThree(edge.p1.x, edge.p1.y, edge.p1.z);
        const p2 = toThree(edge.p2.x, edge.p2.y, edge.p2.z);
        // Orient uphill from lower endpoint to higher endpoint so overlapping caps shingle cleanly!
        const start = p1.y <= p2.y ? p1 : p2;
        const end = p1.y <= p2.y ? p2 : p1;
        const dir = new THREE.Vector3().subVectors(end, start);
        const len = dir.length();
        if (len < 0.08) return null;
        const forward = dir.clone().normalize();
        // Construct orthonormal basis where +Z = forward along ridge, +Y = upright skyward normal!
        const worldUp = new THREE.Vector3(0, 1, 0);
        let right = new THREE.Vector3().crossVectors(worldUp, forward);
        if (right.lengthSq() < 1e-6) right = new THREE.Vector3(1, 0, 0);
        else right.normalize();
        const up = new THREE.Vector3().crossVectors(forward, right).normalize();
        const rotMat = new THREE.Matrix4().makeBasis(right, up, forward);
        const quat = new THREE.Quaternion().setFromRotationMatrix(rotMat);

        const count = Math.max(1, Math.ceil(len / 0.31));
        const step = len / count;
        const isSel = selectedEntity?.kind === 'edge' && selectedEntity.edgeId === edge.id;

        return (
          <group
            key={`ridgecaps-${edge.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedEntity({ kind: 'edge', edgeId: edge.id });
            }}
          >
            {/* Mortar/bed strip right under ridge cap */}
            <mesh
              position={new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)}
              quaternion={quat}
            >
              <boxGeometry args={[0.14, 0.05, len]} />
              <meshStandardMaterial color="#b8afa2" roughness={0.9} clippingPlanes={clippingPlanes} />
            </mesh>
            {Array.from({ length: count }).map((_, idx) => {
              const t = (idx + 0.5) / count;
              const pos = new THREE.Vector3().lerpVectors(start, end, t);
              pos.addScaledVector(up, 0.02);
              return (
                <mesh
                  key={`cap-${idx}`}
                  geometry={ridgeCapGeom}
                  position={pos}
                  quaternion={quat}
                  castShadow
                  receiveShadow
                >
                  <meshStandardMaterial
                    map={isSel ? null : tileTex.map}
                    color={isSel ? '#38bdf8' : project.systemId === 'pizarra' ? '#475569' : '#f4e0d5'}
                    roughness={0.78}
                    metalness={sysMeta.metalness}
                    wireframe={wireframe}
                    clippingPlanes={clippingPlanes}
                  />
                </mesh>
              );
            })}
            {/* Slight invisible scale check unused warning guard */}
            <mesh visible={false} scale={[step, 1, 1]} />
          </group>
        );
      })}
    </group>
  );
};

/** Seamless photorealistic natural lawn, river-gravel perimeter drainage bed, courtyard paving & sculpted floor slabs */
const ArchitecturalSiteContext: React.FC<{
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  bodies: RoofBody[];
  doorEntryAnchor: { cx: number; cy: number; nx: number; ny: number } | null;
}> = ({ bounds, bodies, doorEntryAnchor }) => {
  const grassTex = useMemo(() => getMaterialTextures('grass'), []);
  const gravelTex = useMemo(() => getMaterialTextures('gravel'), []);
  const paverTex = useMemo(() => getMaterialTextures('stone_paver'), []);

  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const w = Math.max(8, bounds.maxX - bounds.minX);
  const d = Math.max(8, bounds.maxY - bounds.minY);
  const span = Math.max(w, d);

  const gravelW = w + 2.4;
  const gravelD = d + 2.4;

  // Extrude exact ground slab per body (preserving L/U notches AND leaving interior courtyard holes open!)
  const bodyFloorGeometries = useMemo(() => {
    return bodies.map((body) => {
      if (body.outerLoop.length < 3) return null;
      const shape = new THREE.Shape();
      body.outerLoop.forEach((v, i) => {
        if (i === 0) shape.moveTo(v.x, v.y);
        else shape.lineTo(v.x, v.y);
      });
      shape.closePath();
      for (const h of body.holes) {
        if (h.vertices.length < 3) continue;
        const hp = new THREE.Path();
        h.vertices.forEach((v, i) => {
          if (i === 0) hp.moveTo(v.x, v.y);
          else hp.lineTo(v.x, v.y);
        });
        hp.closePath();
        shape.holes.push(hp);
      }
      const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
      geom.rotateX(-Math.PI / 2);
      return { id: body.id, geom, baseZ: body.baseWallElevation };
    });
  }, [bodies]);

  // Sculpted stone courtyard paving specifically inside any body holes ("patios")
  const courtyardGeometries = useMemo(() => {
    const out: Array<{ id: string; geom: THREE.BufferGeometry }> = [];
    for (const body of bodies) {
      for (const h of body.holes) {
        if (h.vertices.length < 3) continue;
        const shape = new THREE.Shape();
        h.vertices.forEach((v, i) => {
          if (i === 0) shape.moveTo(v.x, v.y);
          else shape.lineTo(v.x, v.y);
        });
        shape.closePath();
        const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false });
        geom.rotateX(-Math.PI / 2);
        out.push({ id: h.id, geom });
      }
    }
    return out;
  }, [bodies]);

  const entryAnchor = doorEntryAnchor ?? { cx, cy: bounds.minY, nx: 0, ny: -1 };
  const entryAng = Math.atan2(-entryAnchor.ny, entryAnchor.nx);

  return (
    <group>
      {/* Seamless Natural Turf Lawn */}
      <mesh position={[cx, -0.025, -cy]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[span * 8, span * 8]} />
        <meshStandardMaterial
          map={grassTex.map}
          bumpMap={grassTex.bumpMap}
          bumpScale={0.028}
          roughnessMap={grassTex.roughnessMap}
          roughness={0.94}
          metalness={0.0}
        />
      </mesh>

      {/* Washed River-Gravel Perimeter Drainage Trench (Encachado de grava perimetral) */}
      <mesh position={[cx, -0.006, -cy]} receiveShadow>
        <boxGeometry args={[gravelW, 0.038, gravelD]} />
        <meshStandardMaterial
          map={gravelTex.map}
          bumpMap={gravelTex.bumpMap}
          bumpScale={0.032}
          roughnessMap={gravelTex.roughnessMap}
          roughness={0.92}
        />
      </mesh>

      {/* Dark Anthracite Corten/Steel Landscape Edging Curb around gravel bed */}
      <group position={[cx, 0.02, -cy]}>
        <mesh position={[0, 0, gravelD * 0.5 + 0.03]} castShadow receiveShadow>
          <boxGeometry args={[gravelW + 0.12, 0.075, 0.06]} />
          <meshStandardMaterial color="#3b424c" roughness={0.55} metalness={0.45} />
        </mesh>
        <mesh position={[0, 0, -(gravelD * 0.5 + 0.03)]} castShadow receiveShadow>
          <boxGeometry args={[gravelW + 0.12, 0.075, 0.06]} />
          <meshStandardMaterial color="#3b424c" roughness={0.55} metalness={0.45} />
        </mesh>
        <mesh position={[-(gravelW * 0.5 + 0.03), 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.06, 0.075, gravelD]} />
          <meshStandardMaterial color="#3b424c" roughness={0.55} metalness={0.45} />
        </mesh>
        <mesh position={[gravelW * 0.5 + 0.03, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.06, 0.075, gravelD]} />
          <meshStandardMaterial color="#3b424c" roughness={0.55} metalness={0.45} />
        </mesh>
      </group>

      {/* Exact Polygon Interior Concrete Base Slabs */}
      {bodyFloorGeometries.map(
        (bf) =>
          bf && (
            <mesh key={`floor-${bf.id}`} geometry={bf.geom} position={[0, bf.baseZ, 0]} receiveShadow>
              <meshStandardMaterial
                map={paverTex.map}
                bumpMap={paverTex.bumpMap}
                bumpScale={0.012}
                color="#e4dfd4"
                roughness={0.82}
              />
            </mesh>
          )
      )}

      {/* Paved Architectural Interior Courtyard Stones (only inside holes) */}
      {courtyardGeometries.map((cg) => (
        <mesh key={`patio-floor-${cg.id}`} geometry={cg.geom} position={[0, 0.005, 0]} receiveShadow>
          <meshStandardMaterial
            map={paverTex.map}
            bumpMap={paverTex.bumpMap}
            bumpScale={0.015}
            color="#d8d1c3"
            roughness={0.78}
          />
        </mesh>
      ))}

      {/* Front Architectural Stepping Stone Paver Walkway aligned right in front of Main Entry Door */}
      {[0, 1, 2].map((stepIdx) => {
        const dist = 0.72 + stepIdx * 0.85;
        return (
          <mesh
            key={`walk-step-${stepIdx}`}
            position={[
              entryAnchor.cx + entryAnchor.nx * dist,
              0.014,
              -(entryAnchor.cy + entryAnchor.ny * dist),
            ]}
            rotation={[0, -entryAng - Math.PI * 0.5, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[2.1, 0.052, 0.72]} />
            <meshStandardMaterial
              map={paverTex.map}
              bumpMap={paverTex.bumpMap}
              bumpScale={0.012}
              color="#dcd6ca"
              roughness={0.82}
            />
          </mesh>
        );
      })}
    </group>
  );
};

interface OpeningSpec {
  cx: number;
  cy: number;
  w: number;
  h: number;
  kind: 'window' | 'door';
}

/** Genuine 0.28m thick punched architectural stucco facade with deep recessed openings, stone sills & warm interior room backing */
const ArchitecturalFacadeWall: React.FC<{
  len: number;
  wallH: number;
  allowDoor: boolean;
  allowWindows: boolean;
  stuccoTex: ReturnType<typeof getMaterialTextures>;
  woodTex: ReturnType<typeof getMaterialTextures>;
  isConceptual: boolean;
  isWireframe: boolean;
  clippingPlanes: THREE.Plane[];
}> = ({ len, wallH, allowDoor, allowWindows, stuccoTex, woodTex, isConceptual, isWireframe, clippingPlanes }) => {
  const wallDepth = 0.28;

  const openings = useMemo<OpeningSpec[]>(() => {
    if (isConceptual || isWireframe || (!allowWindows && !allowDoor) || len < 2.4 || wallH < 2.2) return [];
    const list: OpeningSpec[] = [];
    const topLim = wallH * 0.5 - 0.36;
    const sillBase = -wallH * 0.5 + 0.85;
    const winH = Math.min(1.42, Math.max(0.75, topLim - sillBase));
    const winCy = sillBase + winH * 0.5;

    if (allowDoor && len >= 2.8 && wallH >= 2.4) {
      const doorH = Math.min(2.15, wallH - 0.52);
      const doorCy = -wallH * 0.5 + 0.08 + doorH * 0.5;
      if (len >= 4.4) {
        list.push({ cx: -len * 0.22, cy: doorCy, w: 1.15, h: doorH, kind: 'door' });
        if (allowWindows) {
          list.push({ cx: len * 0.22, cy: winCy, w: Math.min(2.1, len * 0.32), h: winH, kind: 'window' });
        }
      } else {
        list.push({ cx: 0, cy: doorCy, w: 1.12, h: doorH, kind: 'door' });
      }
    } else if (len >= 6.4) {
      const wWin = Math.min(1.85, len * 0.24);
      list.push({ cx: -len * 0.24, cy: winCy, w: wWin, h: winH, kind: 'window' });
      list.push({ cx: len * 0.24, cy: winCy, w: wWin, h: winH, kind: 'window' });
    } else {
      const wWin = Math.min(1.85, len * 0.44);
      list.push({ cx: 0, cy: winCy, w: wWin, h: winH, kind: 'window' });
    }
    return list;
  }, [allowDoor, allowWindows, isConceptual, isWireframe, len, wallH]);

  const wallGeom = useMemo(() => {
    const shape = new THREE.Shape();
    const hw = len * 0.5;
    const hh = wallH * 0.5;
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();

    for (const op of openings) {
      const hole = new THREE.Path();
      const ox0 = op.cx - op.w * 0.5;
      const ox1 = op.cx + op.w * 0.5;
      const oy0 = op.cy - op.h * 0.5;
      const oy1 = op.cy + op.h * 0.5;
      hole.moveTo(ox0, oy0);
      hole.lineTo(ox1, oy0);
      hole.lineTo(ox1, oy1);
      hole.lineTo(ox0, oy1);
      hole.closePath();
      shape.holes.push(hole);
    }

    const extrude = new THREE.ExtrudeGeometry(shape, {
      depth: wallDepth,
      bevelEnabled: false,
      curveSegments: 1,
    });
    extrude.translate(0, 0, -wallDepth * 0.5);
    return extrude;
  }, [len, openings, wallH]);

  return (
    <group>
      {/* Solid 28cm Exterior Facade Masonry Wall with punched openings */}
      <mesh geometry={wallGeom} castShadow receiveShadow>
        <meshStandardMaterial
          map={isConceptual ? null : stuccoTex.map}
          bumpMap={isConceptual ? null : stuccoTex.bumpMap}
          bumpScale={0.009}
          roughnessMap={isConceptual ? null : stuccoTex.roughnessMap}
          color={isConceptual ? '#cbd5e1' : '#f7f4ec'}
          roughness={0.86}
          wireframe={isWireframe}
          clippingPlanes={clippingPlanes}
          clipShadows
        />
      </mesh>

      {/* Natural Granite / Slate Base Plinth (Zócalo inferior hidrófugo) */}
      {!isConceptual && (
        <mesh position={[0, -wallH * 0.5 + 0.19, 0]} castShadow receiveShadow>
          <boxGeometry args={[len + 0.02, 0.38, wallDepth + 0.035]} />
          <meshStandardMaterial color="#6e6a63" roughness={0.88} clippingPlanes={clippingPlanes} />
        </mesh>
      )}

      {/* Recessed Architectural Doors & Windows inside the punched openings */}
      {openings.map((op, i) =>
        op.kind === 'door' ? (
          <group key={`op-door-${i}`} position={[op.cx, op.cy, 0]}>
            {/* Three-sided Recessed Anthracite Jamb & Lintel Frame (open front so oak door leaf shows!) */}
            <mesh position={[-op.w * 0.5 + 0.035, 0, -0.01]} castShadow>
              <boxGeometry args={[0.07, op.h, 0.14]} />
              <meshStandardMaterial color="#1f252d" roughness={0.42} metalness={0.65} />
            </mesh>
            <mesh position={[op.w * 0.5 - 0.035, 0, -0.01]} castShadow>
              <boxGeometry args={[0.07, op.h, 0.14]} />
              <meshStandardMaterial color="#1f252d" roughness={0.42} metalness={0.65} />
            </mesh>
            <mesh position={[0, op.h * 0.5 - 0.035, -0.01]} castShadow>
              <boxGeometry args={[op.w, 0.07, 0.14]} />
              <meshStandardMaterial color="#1f252d" roughness={0.42} metalness={0.65} />
            </mesh>
            {/* Architectural Oak/Cedar Entry Leaf cleanly visible in recess */}
            <mesh position={[0, -0.02, -0.005]} castShadow receiveShadow>
              <boxGeometry args={[op.w - 0.11, op.h - 0.07, 0.06]} />
              <meshStandardMaterial
                map={woodTex.map}
                bumpMap={woodTex.bumpMap}
                bumpScale={0.01}
                color="#f5dbc0"
                roughness={0.56}
              />
            </mesh>
            {/* Subtle glazed vertical sidelight glass strip on entrance door */}
            <mesh position={[-op.w * 0.24, 0.04, 0.027]}>
              <planeGeometry args={[0.16, op.h * 0.68]} />
              <meshPhysicalMaterial
                color="#8cb8d6"
                roughness={0.06}
                metalness={0.12}
                reflectivity={0.92}
                clearcoat={1}
              />
            </mesh>
            {/* Brushed Steel Vertical Pull Handle */}
            <mesh position={[op.w * 0.31, 0, 0.042]} castShadow>
              <cylinderGeometry args={[0.016, 0.016, 1.15, 10]} />
              <meshStandardMaterial color="#d4dce6" roughness={0.22} metalness={0.9} />
            </mesh>
            {/* Limestone Entry Threshold */}
            <mesh position={[0, -op.h * 0.5 - 0.02, 0.18]} receiveShadow>
              <boxGeometry args={[op.w + 0.35, 0.07, 0.44]} />
              <meshStandardMaterial color="#c9c2b6" roughness={0.78} />
            </mesh>
            {/* Cantilevered Architectural Steel & Cedar Door Visor Canopy (Marquesina de entrada) */}
            <group position={[0, op.h * 0.5 + 0.14, 0.44]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[op.w + 0.58, 0.065, 0.62]} />
                <meshStandardMaterial color="#2c3542" roughness={0.38} metalness={0.75} />
              </mesh>
              <mesh position={[0, -0.028, 0]}>
                <boxGeometry args={[op.w + 0.48, 0.02, 0.54]} />
                <meshStandardMaterial map={woodTex.map} color="#e5c19c" roughness={0.62} />
              </mesh>
            </group>
            {/* Flanking Architectural Exterior LED Wall Sconces */}
            {[-op.w * 0.5 - 0.24, op.w * 0.5 + 0.24].map((sx, sIdx) => (
              <group key={`sconce-${sIdx}`} position={[sx, 0.28, 0.17]}>
                <mesh castShadow>
                  <boxGeometry args={[0.09, 0.22, 0.09]} />
                  <meshStandardMaterial color="#27313f" roughness={0.35} metalness={0.7} />
                </mesh>
                <mesh position={[0, -0.1, 0.01]}>
                  <planeGeometry args={[0.06, 0.06]} />
                  <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={1.1} />
                </mesh>
              </group>
            ))}
          </group>
        ) : (
          <group key={`op-win-${i}`} position={[op.cx, op.cy, 0]}>
            {/* Warm Interior Room Backing behind window opening (prevents hollow black void) */}
            <mesh position={[0, 0, -0.15]}>
              <planeGeometry args={[op.w - 0.04, op.h - 0.04]} />
              <meshStandardMaterial color="#dfd6c5" roughness={0.9} side={THREE.DoubleSide} />
            </mesh>
            {/* Exterior Aluminum Perimeter Subframe recessed 6cm inside wall */}
            <mesh position={[0, op.h * 0.5 - 0.028, 0.02]}>
              <boxGeometry args={[op.w, 0.055, 0.09]} />
              <meshStandardMaterial color="#1f2733" roughness={0.35} metalness={0.72} />
            </mesh>
            <mesh position={[0, -op.h * 0.5 + 0.028, 0.02]}>
              <boxGeometry args={[op.w, 0.055, 0.09]} />
              <meshStandardMaterial color="#1f2733" roughness={0.35} metalness={0.72} />
            </mesh>
            <mesh position={[-op.w * 0.5 + 0.028, 0, 0.02]}>
              <boxGeometry args={[0.055, op.h, 0.09]} />
              <meshStandardMaterial color="#1f2733" roughness={0.35} metalness={0.72} />
            </mesh>
            <mesh position={[op.w * 0.5 - 0.028, 0, 0.02]}>
              <boxGeometry args={[0.055, op.h, 0.09]} />
              <meshStandardMaterial color="#1f2733" roughness={0.35} metalness={0.72} />
            </mesh>
            {/* Central Mullion */}
            <mesh position={[0, 0, 0.02]} castShadow>
              <boxGeometry args={[0.045, op.h - 0.08, 0.085]} />
              <meshStandardMaterial color="#1b222c" roughness={0.35} metalness={0.72} />
            </mesh>
            {/* Low-E Reflective Architectural Double Glazing recessed inside opening */}
            <mesh position={[0, 0, 0.015]}>
              <planeGeometry args={[op.w - 0.08, op.h - 0.08]} />
              <meshPhysicalMaterial
                color="#2c4e68"
                roughness={0.05}
                metalness={0.18}
                reflectivity={0.96}
                clearcoat={1}
                clearcoatRoughness={0.04}
                transparent
                opacity={0.72}
              />
            </mesh>
            {/* Projecting Limestone Drip Window Sill (Vierteaguas exterior +3cm overhang) */}
            <mesh position={[0, -op.h * 0.5 - 0.015, 0.06]} castShadow receiveShadow>
              <boxGeometry args={[op.w + 0.14, 0.05, wallDepth + 0.09]} />
              <meshStandardMaterial color="#dfd8cb" roughness={0.72} />
            </mesh>
          </group>
        )
      )}
    </group>
  );
};

const RoofSceneContents: React.FC = () => {
  const {
    project,
    solved,
    selectedEntity,
    setSelectedEntity,
    highlightedPoint,
    renderStyle3D,
    cameraPreset3D,
    sunAzimuthDeg,
    sunElevationDeg,
    viewMode,
    explodeFactor,
    showWaterFlow,
    replanteoMode,
  } = useRoofStore();

  const sysMeta = ROOF_SYSTEMS[project.systemId];
  const isWireframe = renderStyle3D === 'alambrico';
  const isConceptual = renderStyle3D === 'conceptual';
  const isFlowMode = renderStyle3D === 'flujo';
  const isRainWeather = showWaterFlow || isFlowMode;
  const isExploded = viewMode === 'despiece';
  const isSection = viewMode === 'seccion';
  const hideSolvedRoofInManual = replanteoMode === 'manual' && !isExploded;

  const { gl } = useThree();

  const clippingPlanes = useMemo(() => {
    if (!isSection) return [];
    const p1 = project.sectionLine.p1;
    const p2 = project.sectionLine.p2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nThree = new THREE.Vector3(-dy / len, 0, -dx / len).normalize();
    const anchor = toThree(p1.x, p1.y, 0);
    return [new THREE.Plane().setFromNormalAndCoplanarPoint(nThree, anchor)];
  }, [isSection, project.sectionLine]);

  useEffect(() => {
    gl.localClippingEnabled = isSection;
  }, [gl, isSection]);

  const isPieceCladding = [
    'teja_curva',
    'teja_mixta',
    'teja_plana',
    'teja_encaje',
    'pizarra',
  ].includes(project.systemId);

  const deckTexture = useMemo(() => {
    if (['teja_curva', 'teja_mixta', 'teja_plana', 'teja_encaje'].includes(project.systemId)) {
      return getMaterialTextures('terracotta');
    }
    if (project.systemId === 'pizarra') return getMaterialTextures('slate');
    if (['zinc', 'chapa_metalica', 'panel_sandwich'].includes(project.systemId)) {
      return getMaterialTextures('metal');
    }
    if (project.systemId === 'ajardinada') return getMaterialTextures('grass');
    return getMaterialTextures('stone_paver');
  }, [project.systemId]);

  const stuccoTex = useMemo(() => getMaterialTextures('stucco'), []);
  const woodTex = useMemo(() => getMaterialTextures('wood'), []);
  const stoneTex = useMemo(() => getMaterialTextures('stone_paver'), []);

  const sunPos = useMemo(() => {
    const az = (sunAzimuthDeg * Math.PI) / 180;
    const el = (sunElevationDeg * Math.PI) / 180;
    const dist = 46;
    return [
      Math.cos(el) * Math.sin(az) * dist,
      Math.sin(el) * dist,
      Math.cos(el) * Math.cos(az) * dist,
    ] as [number, number, number];
  }, [sunAzimuthDeg, sunElevationDeg]);

  const b = solved.bounds2D;
  const cx = (b.minX + b.maxX) * 0.5;
  const cy = (b.minY + b.maxY) * 0.5;
  const span = Math.max(12, b.maxX - b.minX, b.maxY - b.minY);
  const deckThicknessM = 0.16;
  const visibleLayers = useMemo(() => project.layers.filter((l) => l.visible), [project.layers]);

  // Compute facade visibility, detect shared multi-body party walls, and pick ONE ground-floor main entrance door
  const facadeAnalysis = useMemo(() => {
    const internalKeys = new Set<string>();
    const abuttingStepKeys = new Set<string>();
    const overlapKeys = new Set<string>();
    let bestDoorKey: string | null = null;
    let bestDoorScore = -Infinity;
    let doorEntryAnchor: { cx: number; cy: number; nx: number; ny: number } | null = null;

    for (let bi = 0; bi < project.bodies.length; bi++) {
      const body = project.bodies[bi];
      const verts = body.outerLoop;
      for (let idx = 0; idx < verts.length; idx++) {
        const va = verts[idx];
        const vb = verts[(idx + 1) % verts.length];
        const midX = (va.x + vb.x) * 0.5;
        const midY = (va.y + vb.y) * 0.5;
        const len = dist2(va, vb);
        if (len < 0.05) continue;
        const dirAx = (vb.x - va.x) / len;
        const dirAy = (vb.y - va.y) / len;
        const cfgA =
          body.edgeConfigs[`${va.id}->${vb.id}`] ||
          body.edgeConfigs[`${vb.id}->${va.id}`] ||
          body.edgeConfigs[va.id];
        const topZA = cfgA ? cfgA.eaveHeight : body.defaultEaveHeight;
        const wallH = Math.max(0.2, topZA - body.baseWallElevation);
        const key = `${body.id}:${idx}`;

        let isInternal = false;
        let abutsTaller = false;
        let hasAnyOverlap = false;
        for (let bj = 0; bj < project.bodies.length; bj++) {
          if (bi === bj) continue;
          const other = project.bodies[bj];
          const oVerts = other.outerLoop;
          for (let oi = 0; oi < oVerts.length; oi++) {
            const oa = oVerts[oi];
            const ob = oVerts[(oi + 1) % oVerts.length];
            const olen = dist2(oa, ob);
            if (olen < 0.05) continue;
            // Perpendicular distance of oa, ob to infinite line of (va, vb)
            const perpA = Math.abs((oa.x - va.x) * dirAy - (oa.y - va.y) * dirAx);
            const perpB = Math.abs((ob.x - va.x) * dirAy - (ob.y - va.y) * dirAx);
            if (perpA > 0.16 || perpB > 0.16) continue;
            const t1 = (oa.x - va.x) * dirAx + (oa.y - va.y) * dirAy;
            const t2 = (ob.x - va.x) * dirAx + (ob.y - va.y) * dirAy;
            const lo = Math.max(0, Math.min(t1, t2));
            const hi = Math.min(len, Math.max(t1, t2));
            const overlapLen = hi - lo;
            if (overlapLen > 0.25) {
              hasAnyOverlap = true;
              if (overlapLen >= len * 0.85) {
                const cfgB =
                  other.edgeConfigs[`${oa.id}->${ob.id}`] ||
                  other.edgeConfigs[`${ob.id}->${oa.id}`] ||
                  other.edgeConfigs[oa.id];
                const topZB = cfgB ? cfgB.eaveHeight : other.defaultEaveHeight;
                if (topZB >= topZA - 0.15) {
                  if (Math.abs(topZB - topZA) <= 0.15) isInternal = true;
                  else abutsTaller = true;
                }
              }
            }
          }
        }
        if (hasAnyOverlap) overlapKeys.add(key);
        if (isInternal || abutsTaller) {
          internalKeys.add(key);
          if (abutsTaller) abuttingStepKeys.add(key);
          continue;
        }

        // Candidate for single main exterior entrance door on ground floor (both sloped and flat roofs)
        if ((body.baseWallElevation ?? 0) <= 0.45 && !hasAnyOverlap && len >= 2.8 && wallH >= 2.4) {
          const ex = dirAx;
          const ey = dirAy;
          // Outward normal for CCW outerLoop is (ey, -ex)
          const outNy = -ex;
          const score =
            (outNy < -0.4 ? 80 : 0) +
            (bi === 0 ? 30 : 0) +
            len -
            midY * 0.9;
          if (score > bestDoorScore) {
            bestDoorScore = score;
            bestDoorKey = key;
            const doorOffset = len >= 4.4 ? len * 0.22 : 0;
            doorEntryAnchor = { cx: midX - ex * doorOffset, cy: midY - ey * doorOffset, nx: ey, ny: -ex };
          }
        }
      }
    }
    return { internalKeys, abuttingStepKeys, overlapKeys, bestDoorKey, doorEntryAnchor };
  }, [project.bodies]);

  // Flat concrete deck geometries used only while practicing in Manual Mode before solving roof ridges
  const manualDeckGeometries = useMemo(() => {
    if (!hideSolvedRoofInManual) return [];
    return project.bodies.map((body) => {
      if (body.outerLoop.length < 3) return null;
      const shape = new THREE.Shape();
      body.outerLoop.forEach((v, idx) => {
        if (idx === 0) shape.moveTo(v.x, v.y);
        else shape.lineTo(v.x, v.y);
      });
      shape.closePath();
      for (const h of body.holes) {
        if (h.vertices.length < 3) continue;
        const hp = new THREE.Path();
        h.vertices.forEach((v, idx) => {
          if (idx === 0) hp.moveTo(v.x, v.y);
          else hp.lineTo(v.x, v.y);
        });
        hp.closePath();
        shape.holes.push(hp);
      }
      const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
      geom.rotateX(-Math.PI / 2);
      geom.translate(0, body.defaultEaveHeight - 0.18, 0);
      return { id: body.id, geom };
    });
  }, [hideSolvedRoofInManual, project.bodies]);

  return (
    <>
      <color attach="background" args={[isConceptual ? '#1b2432' : isRainWeather ? '#8299b0' : '#c6e2f7']} />
      {!isConceptual && !isRainWeather && (
        <Sky
          sunPosition={sunPos}
          turbidity={2.2}
          rayleigh={0.85}
          mieCoefficient={0.003}
          mieDirectionalG={0.82}
        />
      )}
      {!isConceptual && (
        <fog
          attach="fog"
          args={[isRainWeather ? '#8299b0' : '#d5e6f4', span * 2.1, span * 5.6]}
        />
      )}
      {/* Crisp photographic contrast: controlled ambient + strong directional sunlight */}
      <ambientLight intensity={isConceptual ? 0.55 : isRainWeather ? 0.36 : 0.24} />
      <hemisphereLight
        args={[
          isRainWeather ? '#cbd5e1' : '#e4f0ff',
          '#696256',
          isConceptual ? 0.45 : isRainWeather ? 0.65 : 0.52,
        ]}
      />
      <directionalLight
        position={[cx + sunPos[0], sunPos[1], -cy + sunPos[2]]}
        intensity={isConceptual ? 1.25 : isRainWeather ? 1.15 : 2.65}
        color={isRainWeather ? '#e2e8f0' : '#fff3dc'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.015}
        shadow-camera-left={-span * 1.18}
        shadow-camera-right={span * 1.18}
        shadow-camera-top={span * 1.18}
        shadow-camera-bottom={-span * 1.18}
        shadow-camera-near={1}
        shadow-camera-far={135}
      />
      <directionalLight
        position={[cx - sunPos[0] * 0.75, sunPos[1] * 0.55, -cy - sunPos[2] * 0.75]}
        intensity={0.42}
        color="#d8e9ff"
      />
      {!isConceptual && (
        <Environment resolution={128} frames={1} environmentIntensity={0.34}>
          <Lightformer
            form="rect"
            intensity={2.1}
            color="#ffffff"
            position={[0, 16, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[34, 34, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.1}
            color="#fef3c7"
            position={[18, 7, 14]}
            rotation={[0, Math.PI / 4, 0]}
            scale={[16, 12, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.75}
            color="#bae6fd"
            position={[-18, 6, -14]}
            rotation={[0, -Math.PI / 4, 0]}
            scale={[20, 12, 1]}
          />
        </Environment>
      )}

      <CameraRig bounds={solved.bounds2D} bounds3D={solved.bounds3D} preset={cameraPreset3D} />

      {!isConceptual && !isExploded && (
        <ArchitecturalSiteContext
          bounds={solved.bounds2D}
          bodies={project.bodies}
          doorEntryAnchor={facadeAnalysis.doorEntryAnchor}
        />
      )}

      {/* Punched 28cm Exterior Facades + Interior Courtyard Walls (omitting shared multi-body party seams!) */}
      {!isExploded &&
        project.bodies.map((body) => {
          const verts = body.outerLoop;
          const baseZ = body.baseWallElevation;
          return (
            <group key={`walls-${body.id}`}>
              {verts.map((va, idx) => {
                const key = `${body.id}:${idx}`;
                if (facadeAnalysis.internalKeys.has(key)) return null;
                const vb = verts[(idx + 1) % verts.length];
                const cfg =
                  body.edgeConfigs[`${va.id}->${vb.id}`] ||
                  body.edgeConfigs[`${vb.id}->${va.id}`] ||
                  body.edgeConfigs[va.id];
                const topZ = cfg ? cfg.eaveHeight : body.defaultEaveHeight;
                const wallH = Math.max(0.2, topZ - baseZ);
                const len = dist2(va, vb);
                if (len < 0.05) return null;
                const midX = (va.x + vb.x) * 0.5;
                const midY = (va.y + vb.y) * 0.5;
                const ang = Math.atan2(-(vb.y - va.y), vb.x - va.x);

                // Also suppress windows along the lower half if this wall backs onto a lower adjacent roof body
                const hasLowerNeighbor = project.bodies.some((ob) => {
                  if (ob.id === body.id) return false;
                  return ob.outerLoop.some((oa, oi) => {
                    const o2 = ob.outerLoop[(oi + 1) % ob.outerLoop.length];
                    return distancePointToSegment2D({ x: midX, y: midY }, oa, o2) < 0.25;
                  });
                });

                return (
                  <group
                    key={`wall-${body.id}-${idx}`}
                    position={[midX, baseZ + wallH * 0.5, -midY]}
                    rotation={[0, -ang, 0]}
                  >
                    <ArchitecturalFacadeWall
                      len={len}
                      wallH={wallH}
                      allowDoor={facadeAnalysis.bestDoorKey === key}
                      allowWindows={!hasLowerNeighbor && !facadeAnalysis.overlapKeys.has(key)}
                      stuccoTex={stuccoTex}
                      woodTex={woodTex}
                      isConceptual={isConceptual}
                      isWireframe={isWireframe}
                      clippingPlanes={clippingPlanes}
                    />
                  </group>
                );
              })}

              {/* Courtyard Interior Perimeter Walls around body.holes */}
              {body.holes.map((hole) => {
                const hVerts = hole.vertices;
                if (hVerts.length < 3) return null;
                const hCx = hVerts.reduce((a, v) => a + v.x, 0) / hVerts.length;
                const hCy = hVerts.reduce((a, v) => a + v.y, 0) / hVerts.length;
                return hVerts.map((ha, hIdx) => {
                  const hb = hVerts[(hIdx + 1) % hVerts.length];
                  const len = dist2(ha, hb);
                  if (len < 0.05) return null;
                  const midX = (ha.x + hb.x) * 0.5;
                  const midY = (ha.y + hb.y) * 0.5;
                  const cfg =
                    body.edgeConfigs[`${ha.id}->${hb.id}`] ||
                    body.edgeConfigs[`${hb.id}->${ha.id}`];
                  const topZ = cfg ? cfg.eaveHeight : body.defaultEaveHeight;
                  const wallH = Math.max(0.2, topZ - baseZ);
                  let ang = Math.atan2(-(hb.y - ha.y), hb.x - ha.x);
                  // Ensure local +Z faces inward toward courtyard center (hCx, hCy)
                  const outX = -Math.sin(ang);
                  const outZ = Math.cos(ang);
                  if (outX * (hCx - midX) + outZ * (-(hCy - midY)) < 0) {
                    ang += Math.PI;
                  }
                  return (
                    <group
                      key={`hole-wall-${hole.id}-${hIdx}`}
                      position={[midX, baseZ + wallH * 0.5, -midY]}
                      rotation={[0, -ang, 0]}
                    >
                      <ArchitecturalFacadeWall
                        len={len}
                        wallH={wallH}
                        allowDoor={false}
                        allowWindows={true}
                        stuccoTex={stuccoTex}
                        woodTex={woodTex}
                        isConceptual={isConceptual}
                        isWireframe={isWireframe}
                        clippingPlanes={clippingPlanes}
                      />
                    </group>
                  );
                });
              })}
            </group>
          );
        })}

      {/* Temporary Structural Flat Slab Deck while student practices manual replanteo in 2D */}
      {hideSolvedRoofInManual &&
        manualDeckGeometries.map(
          (entry) =>
            entry && (
              <mesh key={`manual-slab-${entry.id}`} geometry={entry.geom} castShadow receiveShadow>
                <meshStandardMaterial
                  map={stoneTex.map}
                  bumpMap={stoneTex.bumpMap}
                  bumpScale={0.012}
                  color="#9ea4ad"
                  roughness={0.85}
                  wireframe={isWireframe}
                />
              </mesh>
            )
        )}

      {/* Gable, Step, and Parapet Wall Patches */}
      {!isExploded &&
        !hideSolvedRoofInManual &&
        solved.wallPatches.map((wp) => {
          if (wp.vertices3D.length < 3) return null;
          const geom = new THREE.BufferGeometry();
          const pts = wp.vertices3D.map((v) => toThree(v.x, v.y, v.z));
          const pos: number[] = [];
          for (let i = 1; i < pts.length - 1; i++) {
            pos.push(
              pts[0].x, pts[0].y, pts[0].z,
              pts[i].x, pts[i].y, pts[i].z,
              pts[i + 1].x, pts[i + 1].y, pts[i + 1].z
            );
          }
          geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          geom.computeVertexNormals();
          return (
            <mesh key={wp.id} geometry={geom} castShadow receiveShadow>
              <meshStandardMaterial
                map={isConceptual ? null : stuccoTex.map}
                bumpMap={isConceptual ? null : stuccoTex.bumpMap}
                bumpScale={0.008}
                color={wp.kind === 'parapet' ? '#e7e1d6' : '#f4f0e8'}
                roughness={0.85}
                side={THREE.DoubleSide}
                wireframe={isWireframe}
                clippingPlanes={clippingPlanes}
              />
            </mesh>
          );
        })}

      {/* Solved Roof Slabs (or Multi-Layer Exploded Stack) */}
      {isExploded
        ? visibleLayers.map((layer, lIdx) => {
            const reverseOrder = visibleLayers.length - 1 - lIdx;
            const liftY = reverseOrder * (0.28 + explodeFactor * 0.55);
            const thick = Math.max(0.015, layer.thicknessCm / 100);
            return (
              <group key={`exp-layer-${layer.id}`} position={[0, liftY, 0]}>
                {solved.faces.map((face) => {
                  const geom = buildFaceSlabGeometry(face, thick);
                  return (
                    <mesh
                      key={`exp-${layer.id}-${face.id}`}
                      geometry={geom}
                      castShadow
                      receiveShadow
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntity({ kind: 'layer', layerId: layer.id });
                      }}
                    >
                      <meshStandardMaterial
                        color={layer.colorHex}
                        roughness={layer.role === 'waterproofing' ? 0.3 : 0.76}
                        metalness={layer.role === 'finish' && sysMeta.metalness > 0.3 ? 0.65 : 0.05}
                        transparent={
                          selectedEntity?.kind === 'layer' && selectedEntity.layerId !== layer.id
                        }
                        opacity={
                          selectedEntity?.kind === 'layer' && selectedEntity.layerId !== layer.id
                            ? 0.52
                            : 1
                        }
                      />
                    </mesh>
                  );
                })}
              </group>
            );
          })
        : !hideSolvedRoofInManual &&
          solved.faces.map((face) => {
            const geom = buildFaceSlabGeometry(face, deckThicknessM);
            const isSelected =
              selectedEntity?.kind === 'face' && selectedEntity.faceId === face.id;
            // Under piece cladding (tiles/slate), render dark bitumen/timber underlay rather than fake painted tiles!
            const useUnderlayOnly = isPieceCladding && !isConceptual && !isFlowMode;
            return (
              <mesh
                key={face.id}
                geometry={geom}
                castShadow
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEntity({ kind: 'face', faceId: face.id });
                }}
              >
                <meshStandardMaterial
                  map={isConceptual || isFlowMode || useUnderlayOnly ? null : deckTexture.map}
                  bumpMap={isConceptual || isFlowMode ? null : useUnderlayOnly ? woodTex.bumpMap : deckTexture.bumpMap}
                  bumpScale={0.015}
                  roughnessMap={isConceptual || isFlowMode || useUnderlayOnly ? null : deckTexture.roughnessMap}
                  color={
                    isSelected
                      ? '#93c5fd'
                      : isFlowMode
                        ? '#94a3b8'
                        : isConceptual
                          ? '#e2e8f0'
                          : useUnderlayOnly
                            ? '#9a5233'
                            : '#ffffff'
                  }
                  roughness={
                    isRainWeather
                      ? Math.min(0.28, sysMeta.roughness * 0.42)
                      : useUnderlayOnly
                        ? 0.9
                        : sysMeta.roughness
                  }
                  metalness={useUnderlayOnly ? 0.05 : sysMeta.metalness}
                  wireframe={isWireframe}
                  transparent={isFlowMode}
                  opacity={isFlowMode ? 0.45 : 1}
                  clippingPlanes={clippingPlanes}
                  clipShadows
                />
              </mesh>
            );
          })}

      {/* Real 3D Instanced Clay/Slate Tiles */}
      {!isExploded && !hideSolvedRoofInManual && !isFlowMode && !isConceptual && (
        <InstancedRoofTiles faces={solved.faces} edges={solved.edges} wireframe={isWireframe} />
      )}

      {/* Upright Overlapping Ceramic Ridge & Hip Cap Tiles (Caballetes) */}
      {!isExploded && !hideSolvedRoofInManual && !isConceptual && (
        <RidgeCapTiles3D
          edges={solved.edges}
          wireframe={isWireframe}
          clippingPlanes={clippingPlanes}
        />
      )}

      {/* Folded V-Channel Valleys, Timber Rafter Tails (Canecillos), Fascia, Open Half-Round Gutters & Parapet Coping */}
      {!isExploded &&
        !hideSolvedRoofInManual &&
        solved.edges.map((edge) => {
          const p1 = toThree(edge.p1.x, edge.p1.y, edge.p1.z);
          const p2 = toThree(edge.p2.x, edge.p2.y, edge.p2.z);
          const dir = new THREE.Vector3().subVectors(p2, p1);
          const len = dir.length();
          if (len < 0.05) return null;
          const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

          // Upright twist-free orthonormal basis: Z = along edge, Y = upright skyward, X = across
          const forward = dir.clone().normalize();
          const worldUp = new THREE.Vector3(0, 1, 0);
          let right = new THREE.Vector3().crossVectors(worldUp, forward);
          if (right.lengthSq() < 1e-6) right = new THREE.Vector3(1, 0, 0);
          else right.normalize();
          const up = new THREE.Vector3().crossVectors(forward, right).normalize();
          const quatZ = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(right, up, forward)
          );
          const isSel = selectedEntity?.kind === 'edge' && selectedEntity.edgeId === edge.id;

          if (edge.type === 'limahoya') {
            const vGeom = createValleyChannelGeometry(0.24, len);
            return (
              <mesh
                key={`valley-${edge.id}`}
                geometry={vGeom}
                position={[mid.x, mid.y + 0.028, mid.z]}
                quaternion={quatZ}
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEntity({ kind: 'edge', edgeId: edge.id });
                }}
              >
                <meshStandardMaterial
                  color={isSel ? '#38bdf8' : '#6f7c8a'}
                  roughness={0.32}
                  metalness={0.82}
                  side={THREE.DoubleSide}
                  clippingPlanes={clippingPlanes}
                />
              </mesh>
            );
          }

          if (edge.type === 'pretil') {
            const body = project.bodies.find((b) => b.id === edge.bodyId);
            const pH = body?.parapetHeight ?? 0.9;
            return (
              <group key={`coping-${edge.id}`}>
                {/* Limestone Parapet Coping Stone (Albardilla superior) */}
                <mesh
                  position={[mid.x, mid.y + pH + 0.03, mid.z]}
                  quaternion={quatZ}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[0.34, 0.06, len + 0.06]} />
                  <meshStandardMaterial color="#dfd8ca" roughness={0.74} clippingPlanes={clippingPlanes} />
                </mesh>
                {/* Waterproofing turnaround flashing skirt at base of parapet */}
                <mesh
                  position={[mid.x, mid.y + 0.14, mid.z]}
                  quaternion={quatZ}
                >
                  <boxGeometry args={[0.26, 0.25, len]} />
                  <meshStandardMaterial color="#3c444f" roughness={0.42} metalness={0.65} clippingPlanes={clippingPlanes} />
                </mesh>
              </group>
            );
          }

          if (edge.type === 'alero') {
            const horizDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
            const outward = new THREE.Vector3(horizDir.z, 0, -horizDir.x);
            const face = solved.faces.find((f) => f.id === edge.faceIds[0]);
            if (face) {
              const fc = toThree(face.centroid2D.x, face.centroid2D.y, mid.y);
              if (outward.dot(fc.clone().sub(mid)) > 0) outward.negate();
            }
            const rafterCount = Math.max(2, Math.floor(len / 0.62));
            const bracketCount = Math.max(2, Math.floor(len / 0.78));
            const gPos = mid.clone().addScaledVector(outward, 0.13);
            const gRadius = Math.max(0.052, (edge.gutterDiameterMm ?? 125) / 2000);
            const gutterGeom = edge.hasGutter ? createHalfRoundGutterGeometry(gRadius, len) : null;

            return (
              <group key={`eave-${edge.id}`}>
                {/* Sculpted Cedar Fascia Board (Tablón frontal de alero) */}
                <mesh
                  position={[mid.x + outward.x * 0.035, mid.y - 0.075, mid.z + outward.z * 0.035]}
                  quaternion={quatZ}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[0.042, 0.15, len]} />
                  <meshStandardMaterial
                    map={woodTex.map}
                    bumpMap={woodTex.bumpMap}
                    bumpScale={0.008}
                    color="#9e6d47"
                    roughness={0.76}
                    clippingPlanes={clippingPlanes}
                  />
                </mesh>

                {/* Exposed Cedar Timber Rafter Tails (Canecillos cada ~62 cm) */}
                {!isConceptual &&
                  Array.from({ length: rafterCount }).map((_, ri) => {
                    const t = (ri + 0.5) / rafterCount;
                    const rBase = new THREE.Vector3().lerpVectors(p1, p2, t);
                    const rPos = rBase.clone().addScaledVector(outward, -0.14);
                    rPos.y -= 0.16;
                    return (
                      <mesh
                        key={`canecillo-${edge.id}-${ri}`}
                        position={rPos}
                        quaternion={quatZ}
                        castShadow
                        receiveShadow
                      >
                        <boxGeometry args={[0.36, 0.11, 0.075]} />
                        <meshStandardMaterial
                          map={woodTex.map}
                          color="#8f5f3b"
                          roughness={0.8}
                          clippingPlanes={clippingPlanes}
                        />
                      </mesh>
                    );
                  })}

                {/* Open Semicircular Zinc Gutter + Galvanized Mounting Brackets */}
                {gutterGeom && (
                  <>
                    <mesh
                      geometry={gutterGeom}
                      position={[gPos.x, gPos.y - 0.02, gPos.z]}
                      quaternion={quatZ}
                      castShadow
                      receiveShadow
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntity({ kind: 'edge', edgeId: edge.id });
                      }}
                    >
                      <meshStandardMaterial
                        color={isSel ? '#38bdf8' : '#6c7987'}
                        roughness={0.28}
                        metalness={0.84}
                        side={THREE.DoubleSide}
                        clippingPlanes={clippingPlanes}
                      />
                    </mesh>
                    {!isConceptual &&
                      Array.from({ length: bracketCount }).map((_, bi) => {
                        const t = (bi + 0.5) / bracketCount;
                        const bPos = new THREE.Vector3()
                          .lerpVectors(p1, p2, t)
                          .addScaledVector(outward, 0.08);
                        bPos.y -= 0.045;
                        return (
                          <mesh key={`gbracket-${edge.id}-${bi}`} position={bPos} quaternion={quatZ} castShadow>
                            <boxGeometry args={[0.14, 0.025, 0.022]} />
                            <meshStandardMaterial color="#3b444f" roughness={0.35} metalness={0.8} />
                          </mesh>
                        );
                      })}
                  </>
                )}
              </group>
            );
          }
          return null;
        })}

      {/* Downspouts (Bajantes): render full external column for exterior pipes, rooftop collar for interior structural shafts */}
      {!isExploded &&
        !hideSolvedRoofInManual &&
        project.downspouts.map((ds) => {
          const nearFace = solved.faces.find((f) => pointInPolygon2D(ds, f.polygon2D, true));
          const topZ = nearFace
            ? evalPlane(nearFace.plane, ds.x, ds.y)
            : project.bodies[0]?.defaultEaveHeight ?? 3.5;
          const r = Math.max(0.042, ds.diameterMm / 2000);
          if (ds.kind === 'interior') {
            return (
              <mesh
                key={ds.id}
                position={[ds.x, topZ + 0.012, -ds.y]}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEntity({ kind: 'downspout', downspoutId: ds.id });
                }}
              >
                <cylinderGeometry args={[r * 1.4, r * 1.4, 0.025, 14]} />
                <meshStandardMaterial color="#3b444f" roughness={0.35} metalness={0.8} />
              </mesh>
            );
          }
          const h = Math.max(1.0, topZ - 0.08);
          const clampLevels = [0.65, 1.85, h - 0.55].filter((z) => z > 0.25 && z < h - 0.2);
          return (
            <group key={ds.id}>
              {/* Vertical pipe */}
              <mesh
                position={[ds.x, h * 0.5, -ds.y]}
                castShadow
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEntity({ kind: 'downspout', downspoutId: ds.id });
                }}
              >
                <cylinderGeometry args={[r, r, h, 14]} />
                <meshStandardMaterial color="#586675" roughness={0.28} metalness={0.82} />
              </mesh>
              {/* Top funnel collector hopper (Cazoleta exterior de descarga) */}
              <mesh position={[ds.x, h + 0.04, -ds.y]} castShadow>
                <cylinderGeometry args={[r * 1.65, r * 1.05, 0.14, 14]} />
                <meshStandardMaterial color="#4a5664" roughness={0.3} metalness={0.82} />
              </mesh>
              {/* Wall Clamps (Abrazaderas metálicas) */}
              {clampLevels.map((clY, ci) => (
                <mesh key={`clamp-${ds.id}-${ci}`} position={[ds.x, clY, -ds.y]} castShadow>
                  <cylinderGeometry args={[r * 1.24, r * 1.24, 0.032, 12]} />
                  <meshStandardMaterial color="#2f3742" roughness={0.38} metalness={0.85} />
                </mesh>
              ))}
              {/* Ground storm shoe / catch grate (Arqueta a pie de bajante) */}
              <mesh position={[ds.x, 0.025, -ds.y]} receiveShadow>
                <boxGeometry args={[0.26, 0.04, 0.26]} />
                <meshStandardMaterial color="#38414d" roughness={0.45} metalness={0.65} />
              </mesh>
            </group>
          );
        })}

      {/* Drains (Sumideros / Rebosaderos) */}
      {!isExploded &&
        !hideSolvedRoofInManual &&
        project.drains.map((dr) => {
          const face = solved.faces.find((f) => pointInPolygon2D(dr, f.polygon2D, true));
          const z = dr.z ?? (face ? evalPlane(face.plane, dr.x, dr.y) : 3.5);
          return (
            <group
              key={dr.id}
              position={[dr.x, z + 0.018, -dr.y]}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEntity({ kind: 'drain', drainId: dr.id });
              }}
            >
              <mesh receiveShadow>
                <cylinderGeometry args={[0.16, 0.16, 0.028, 16]} />
                <meshStandardMaterial color="#64748b" metalness={0.78} roughness={0.28} />
              </mesh>
              <mesh position={[0, 0.018, 0]}>
                <cylinderGeometry args={[0.11, 0.11, 0.016, 16]} />
                <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.35} />
              </mesh>
            </group>
          );
        })}

      {/* Singular Emerging Elements (Chimneys with Zinc Flashing & Rain Cowl, Shunts, Skylights) */}
      {!isExploded &&
        !hideSolvedRoofInManual &&
        project.singularElements.map((sg) => {
          const face = solved.faces.find((f) => pointInPolygon2D(sg, f.polygon2D, true));
          const roofZ = face ? evalPlane(face.plane, sg.x, sg.y) : 3.8;
          const isSkylight = sg.kind === 'lucernario';
          const pos = toThree(
            sg.x,
            sg.y,
            isSkylight ? roofZ + 0.045 : roofZ + sg.heightAboveRoof * 0.5 - 0.12
          );
          const slopeQuat = (() => {
            const yawQ = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              (sg.rotationDeg * Math.PI) / 180
            );
            if (!isSkylight || !face) return yawQ;
            const nVec = new THREE.Vector3(-face.plane.a, 1, face.plane.b).normalize();
            const tiltQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nVec);
            return tiltQ.multiply(yawQ);
          })();
          return (
            <group
              key={sg.id}
              position={pos}
              quaternion={slopeQuat}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEntity({ kind: 'singular', singularId: sg.id });
              }}
            >
              {isSkylight ? (
                <group>
                  {/* Wide Zinc Perimeter Step-Flashing Collar (Tapajuntas perimetral estanco) */}
                  <mesh position={[0, -0.025, 0]} receiveShadow>
                    <boxGeometry args={[sg.width + 0.24, 0.03, sg.depth + 0.24]} />
                    <meshStandardMaterial color="#505c6a" roughness={0.32} metalness={0.82} />
                  </mesh>
                  {/* Recessed Dark Attic Light-Well Interior */}
                  <mesh position={[0, -0.005, 0]}>
                    <boxGeometry args={[sg.width * 0.86, 0.05, sg.depth * 0.86]} />
                    <meshStandardMaterial color="#1b2430" roughness={0.88} />
                  </mesh>
                  {/* 4-Piece Hollow Anthracite Aluminum Insulated Curb Frame */}
                  <mesh position={[0, 0.035, -sg.depth * 0.5 + 0.04]} castShadow>
                    <boxGeometry args={[sg.width, 0.11, 0.08]} />
                    <meshStandardMaterial color="#252e3a" roughness={0.32} metalness={0.78} />
                  </mesh>
                  <mesh position={[0, 0.035, sg.depth * 0.5 - 0.04]} castShadow>
                    <boxGeometry args={[sg.width, 0.11, 0.08]} />
                    <meshStandardMaterial color="#252e3a" roughness={0.32} metalness={0.78} />
                  </mesh>
                  <mesh position={[-sg.width * 0.5 + 0.04, 0.035, 0]} castShadow>
                    <boxGeometry args={[0.08, 0.11, sg.depth - 0.16]} />
                    <meshStandardMaterial color="#252e3a" roughness={0.32} metalness={0.78} />
                  </mesh>
                  <mesh position={[sg.width * 0.5 - 0.04, 0.035, 0]} castShadow>
                    <boxGeometry args={[0.08, 0.11, sg.depth - 0.16]} />
                    <meshStandardMaterial color="#252e3a" roughness={0.32} metalness={0.78} />
                  </mesh>
                  {/* Center Sash Cross Bar */}
                  <mesh position={[0, 0.068, 0]} castShadow>
                    <boxGeometry args={[sg.width - 0.12, 0.032, 0.045]} />
                    <meshStandardMaterial color="#1f2732" roughness={0.35} metalness={0.78} />
                  </mesh>
                  {/* Double-Glazed Low-E Crystal Roof Window Pane */}
                  <mesh position={[0, 0.055, 0]}>
                    <boxGeometry args={[sg.width * 0.86, 0.025, sg.depth * 0.86]} />
                    <meshPhysicalMaterial
                      color="#5b9ac4"
                      roughness={0.04}
                      metalness={0.18}
                      reflectivity={0.97}
                      clearcoat={1}
                      clearcoatRoughness={0.03}
                      transparent
                      opacity={0.76}
                    />
                  </mesh>
                </group>
              ) : (
                <group>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[sg.width, sg.heightAboveRoof + 0.25, sg.depth]} />
                    <meshStandardMaterial
                      map={isConceptual ? null : stuccoTex.map}
                      color={sg.kind === 'shunt' ? '#8c97a4' : '#eae4d8'}
                      roughness={0.82}
                      metalness={sg.kind === 'shunt' ? 0.52 : 0.05}
                    />
                  </mesh>
                  {/* Dark Zinc Stepped Flashing Collar >= 25cm (Babero/collarín perimetral) */}
                  <mesh position={[0, -sg.heightAboveRoof * 0.34, 0]} castShadow>
                    <boxGeometry args={[sg.width + 0.13, 0.28, sg.depth + 0.13]} />
                    <meshStandardMaterial color="#46515e" roughness={0.3} metalness={0.82} />
                  </mesh>
                  {sg.kind === 'chimenea' && (
                    <>
                      {/* Overhanging Stone Chimney Cap (Remate superior) */}
                      <mesh position={[0, sg.heightAboveRoof * 0.5 + 0.14, 0]} castShadow>
                        <boxGeometry args={[sg.width + 0.16, 0.075, sg.depth + 0.16]} />
                        <meshStandardMaterial color="#6e7782" roughness={0.62} />
                      </mesh>
                      {/* Elevated Stainless Steel Rain Cowl (Sombrerete metálico) */}
                      <mesh position={[0, sg.heightAboveRoof * 0.5 + 0.31, 0]} castShadow>
                        <boxGeometry args={[sg.width * 0.85, 0.035, sg.depth * 0.85]} />
                        <meshStandardMaterial color="#94a3b8" roughness={0.28} metalness={0.86} />
                      </mesh>
                      <mesh position={[0, sg.heightAboveRoof * 0.5 + 0.24, 0]}>
                        <boxGeometry args={[sg.width * 0.45, 0.14, sg.depth * 0.45]} />
                        <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.7} />
                      </mesh>
                    </>
                  )}
                </group>
              )}
            </group>
          );
        })}

      {!isExploded && !hideSolvedRoofInManual && <RealRainSimulation3D />}

      {highlightedPoint && (
        <mesh position={[highlightedPoint.x, solved.bounds3D.maxZ + 0.5, -highlightedPoint.y]}>
          <sphereGeometry args={[0.28, 16, 16]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.2} />
        </mesh>
      )}

      {!isConceptual && (
        <ContactShadows
          position={[cx, 0.045, -cy]}
          opacity={0.42}
          scale={span * 3.0}
          blur={1.8}
          far={16}
        />
      )}
    </>
  );
};

export const Scene3D: React.FC = () => {
  const {
    renderStyle3D,
    setRenderStyle3D,
    cameraPreset3D,
    setCameraPreset3D,
    sunAzimuthDeg,
    setSunAzimuthDeg,
    showWaterFlow,
    setShowWaterFlow,
    replanteoMode,
    autoSolveReplanteo,
  } = useRoofStore();

  const [showSunPopover, setShowSunPopover] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full h-full bg-[#1a2433] overflow-hidden">
      <div className="absolute top-2.5 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1.5 bg-[#1b2432]/90 backdrop-blur border border-[#304057] rounded-md px-2.5 py-1 text-xs text-slate-100 shadow-lg">
          <Camera className="w-3.5 h-3.5 text-slate-300" />
          <select
            value={cameraPreset3D}
            onChange={(e) => setCameraPreset3D(e.target.value as CameraPreset3D)}
            className="bg-transparent outline-none font-medium cursor-pointer"
          >
            <option value="perspectiva" className="bg-[#18202c]">Vista 3D · Perspectiva</option>
            <option value="axonometrica" className="bg-[#18202c]">Vista 3D · Axonométrica</option>
            <option value="superior" className="bg-[#18202c]">Planta Superior</option>
            <option value="alzado_sur" className="bg-[#18202c]">Alzado Sur</option>
            <option value="alzado_este" className="bg-[#18202c]">Alzado Este</option>
          </select>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <div className="relative flex items-center bg-[#1b2432]/90 backdrop-blur border border-[#304057] rounded-md px-1.5 py-1 text-xs text-slate-200 shadow-lg gap-1">
            <button
              onClick={() => setShowSunPopover(!showSunPopover)}
              title="Posición solar e iluminación"
              className="p-1 hover:bg-[#2a384c] rounded"
            >
              <Sun className="w-3.5 h-3.5 text-amber-300" />
            </button>
            <button
              onClick={() => setShowWaterFlow(!showWaterFlow)}
              title="Simular lluvia real y escorrentía en 2D/3D"
              className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium ${
                showWaterFlow || renderStyle3D === 'flujo'
                  ? 'bg-cyan-600/40 text-cyan-200 border border-cyan-400/50'
                  : 'hover:bg-[#2a384c] text-slate-200'
              }`}
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>Lluvia</span>
            </button>
            <button
              onClick={toggleFullscreen}
              title="Pantalla completa 3D"
              className="p-1 hover:bg-[#2a384c] rounded"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>

            {showSunPopover && (
              <div className="absolute right-0 top-9 w-52 bg-[#161e2b] border border-[#304057] rounded-md p-2.5 shadow-xl space-y-2 z-30">
                <div className="text-[11px] font-semibold text-slate-300">
                  Acimut Solar ({sunAzimuthDeg}°)
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={sunAzimuthDeg}
                  onChange={(e) => setSunAzimuthDeg(Number(e.target.value))}
                  className="w-full accent-amber-400"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 bg-[#1b2432]/90 backdrop-blur border border-[#304057] rounded-md px-2.5 py-1 text-xs text-slate-100 shadow-lg">
            <Eye className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={renderStyle3D}
              onChange={(e) => setRenderStyle3D(e.target.value as RenderStyle3D)}
              className="bg-transparent outline-none font-medium cursor-pointer"
            >
              <option value="realista" className="bg-[#18202c]">Realista</option>
              <option value="conceptual" className="bg-[#18202c]">Maqueta Conceptual</option>
              <option value="alambrico" className="bg-[#18202c]">Alámbrico</option>
              <option value="flujo" className="bg-[#18202c]">Flujo de Agua</option>
            </select>
          </div>
        </div>
      </div>

      {replanteoMode === 'manual' && (
        <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between gap-2 bg-[#161e2b]/90 backdrop-blur border border-amber-500/45 rounded-lg px-3 py-2 text-[11px] text-amber-100 shadow-lg">
          <span>
            <strong>Modo Práctica Manual:</strong> traza las cumbreras, limatesas y limahoyas en el plano 2D sin spoilers.
          </span>
          <button
            onClick={autoSolveReplanteo}
            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shrink-0 transition"
          >
            Construir Cubierta 3D (Ver Solución)
          </button>
        </div>
      )}

      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 42, near: 0.2, far: 300, position: [16, 13, 18] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.04 }}
      >
        <Suspense fallback={null}>
          <RoofSceneContents />
        </Suspense>
      </Canvas>
    </div>
  );
};
