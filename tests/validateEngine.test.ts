import { describe, expect, it } from 'vitest';
import { solveRoofProject } from '../src/engine/geometry/roofSolver';
import {
  createCuatroAguasProject,
  createDefaultViviendaProject,
  createDosAguasProject,
  createPatioProject,
  createReferenciaAProject,
  createReferenciaBProject,
} from '../src/engine/presets/projects';
import { polygonArea2D, signedArea2D } from '../src/engine/math/vec';
import { generatePlanSvgString } from '../src/engine/exporters/exportSvg';
import { generateDxfString } from '../src/engine/exporters/exportDxf';
import { polygonToRoofBody } from '../src/engine/importers/dxfSvgImporter';
import { gradeManualReplanteo } from '../src/engine/geometry/manualReplanteo';
import { generateRoofSolutionVariants } from '../src/engine/geometry/solutionVariants';
import { BUILTIN_PROJECTS } from '../src/engine/presets/projects';
import type { ManualReplanteoEdge } from '../src/types/roof';

describe('Motor Geométrico, Hidráulico y Normativo - Validación Obligatoria', () => {
  it('Prueba 1: Cubierta a dos aguas rectangular (2 faldones, 1 cumbrera, 2 aleros, 2 hastiales)', () => {
    const proj = createDosAguasProject();
    const solved = solveRoofProject(proj);

    expect(solved.isValid).toBe(true);
    expect(solved.faces).toHaveLength(2);
    expect(solved.edges.filter((e) => e.type === 'cumbrera')).toHaveLength(1);
    expect(solved.edges.filter((e) => e.type === 'alero')).toHaveLength(2);
    expect(solved.wallPatches.filter((w) => w.kind === 'gable')).toHaveLength(2);

    // 10m x 6m = 60 m² horizontal; at 35%, rise = 0.35 * 3m = 1.05m -> maxZ = 3.2 + 1.05 = 4.25m
    expect(solved.measurements.totalProjectedAreaM2).toBeCloseTo(60, 4);
    expect(solved.bounds3D.maxZ).toBeCloseTo(4.25, 4);
    for (const f of solved.faces) {
      expect(f.slopePct).toBeCloseTo(35, 3);
      expect(f.planarityMaxResidual).toBeLessThan(1e-5);
      expect(signedArea2D(f.polygon2D)).toBeGreaterThan(0); // CCW
    }
  });

  it('Prueba 2: Cubierta a cuatro aguas rectangular (4 faldones, 1 cumbrera, 4 limatesas, 4 aleros)', () => {
    const proj = createCuatroAguasProject();
    const solved = solveRoofProject(proj);

    expect(solved.isValid).toBe(true);
    expect(solved.faces).toHaveLength(4);
    expect(solved.edges.filter((e) => e.type === 'cumbrera')).toHaveLength(1);
    expect(solved.edges.filter((e) => e.type === 'limatesa')).toHaveLength(4);
    expect(solved.edges.filter((e) => e.type === 'alero')).toHaveLength(4);

    // 10m x 7m = 70 m², ridge length = 10 - 7 = 3m, maxZ = 3.2 + 0.30 * 3.5 = 4.25m
    expect(solved.measurements.totalProjectedAreaM2).toBeCloseTo(70, 4);
    expect(solved.measurements.ridgeLengthM).toBeCloseTo(3.0, 4);
    expect(solved.bounds3D.maxZ).toBeCloseTo(4.25, 4);
    for (const f of solved.faces) {
      expect(f.slopePct).toBeCloseTo(30, 3);
      expect(f.angleDeg).toBeCloseTo(16.699, 2);
      expect(f.planarityMaxResidual).toBeLessThan(1e-5);
      expect(signedArea2D(f.polygon2D)).toBeGreaterThan(0);
    }
  });

  it('Prueba 3: Planta en L (resolución de encuentros y limahoyas sin discontinuidades)', () => {
    const proj = createDefaultViviendaProject();
    const solved = solveRoofProject(proj);

    expect(solved.isValid).toBe(true);
    expect(solved.faces).toHaveLength(6);
    expect(solved.edges.filter((e) => e.type === 'limahoya').length).toBeGreaterThanOrEqual(1);
    expect(solved.edges.filter((e) => e.type === 'cumbrera').length).toBeGreaterThanOrEqual(2);
    // Exact area of 12.50x9.20 minus 3.10x5.00 cutout = 115 - 15.5 = 99.50 m²
    expect(solved.measurements.totalProjectedAreaM2).toBeCloseTo(99.5, 3);
    for (const f of solved.faces) {
      expect(f.planarityMaxResidual).toBeLessThan(1e-5);
      expect(signedArea2D(f.polygon2D)).toBeGreaterThan(0);
    }
  });

  it('Prueba 4 y Patio Interior: múltiples vértices, patio interior y diferentes alturas de alero', () => {
    const patioProj = createPatioProject();
    const solvedPatio = solveRoofProject(patioProj);

    expect(solvedPatio.isValid).toBe(true);
    // 14*11 - 5*4 = 154 - 20 = 134 m²
    expect(solvedPatio.measurements.totalProjectedAreaM2).toBeCloseTo(134, 3);
    expect(solvedPatio.edges.filter((e) => e.type === 'limahoya').length).toBeGreaterThanOrEqual(4);

    // Variable eave heights test on a rectangular body
    const varEave = createCuatroAguasProject();
    const edgeKeys = Object.keys(varEave.bodies[0].edgeConfigs);
    varEave.bodies[0].edgeConfigs[edgeKeys[0]].eaveHeight = 4.0; // South edge 0.8m higher than others
    const solvedVar = solveRoofProject(varEave);
    expect(solvedVar.isValid).toBe(true);
    expect(solvedVar.measurements.totalProjectedAreaM2).toBeCloseTo(70, 3);
    expect(solvedVar.wallPatches.some((w) => w.kind === 'step')).toBe(true);
  });

  it('Prueba 5: Pendientes diferentes recalcula intersecciones asimétricas matemáticamente', () => {
    const proj = createDosAguasProject();
    const keys = Object.keys(proj.bodies[0].edgeConfigs);
    // South edge 30%, North edge 60% -> ridge shifts closer to North edge (dS*0.30 = dN*0.60 => dS = 4m, dN = 2m)
    proj.bodies[0].edgeConfigs[keys[0]].slopePct = 30;
    proj.bodies[0].edgeConfigs[keys[2]].slopePct = 60;
    const solved = solveRoofProject(proj);

    expect(solved.isValid).toBe(true);
    const ridge = solved.edges.find((e) => e.type === 'cumbrera')!;
    expect(ridge).toBeDefined();
    expect(ridge.p1.y).toBeCloseTo(4.0, 4);
    expect(ridge.p2.y).toBeCloseTo(4.0, 4);
    expect(ridge.p1.z).toBeCloseTo(3.2 + 0.3 * 4.0, 4); // 4.40 m
  });

  it('Prueba 6: Evacuación de aguas detecta limahoyas/acumulaciones y valida DB-HS 5', () => {
    const proj = createReferenciaBProject();
    const solved = solveRoofProject(proj);

    expect(solved.isValid).toBe(true);
    expect(solved.hydrology.alerts).toHaveLength(0);
    expect(solved.hydrology.streamlines.length).toBeGreaterThanOrEqual(5);
    expect(solved.hydrology.actualSumideros).toBe(5);

    // Now remove one sumidero and confirm engine catches accumulation!
    proj.drains = proj.drains.filter((d) => d.id !== 'rb-s1');
    const broken = solveRoofProject(proj);
    expect(broken.hydrology.alerts.length).toBeGreaterThan(0);
  });

  it('Prueba 7: Normativa detecta pendiente insuficiente según Tabla 2.10 DB-HS 1 y aislamiento DB-HE 1', () => {
    const proj = createDosAguasProject(); // teja_curva requires >= 32% without waterproofing
    const keys = Object.keys(proj.bodies[0].edgeConfigs);
    proj.bodies[0].edgeConfigs[keys[0]].slopePct = 20; // too low!
    proj.bodies[0].edgeConfigs[keys[2]].slopePct = 20;
    const solved = solveRoofProject(proj);

    const slopeCheck = solved.normative.checks.find((c) => c.id === 'cte-hs1-tabla210');
    expect(slopeCheck?.status).toBe('NO CUMPLE');

    // Referencia B with handwritten 2.5cm EPS must trigger DB-HE 1 NO CUMPLE
    const refB = createReferenciaBProject();
    const solvedRefB = solveRoofProject(refB);
    const uCheck = solvedRefB.normative.checks.find((c) => c.id === 'cte-he1-transmitancia');
    expect(uCheck?.status).toBe('NO CUMPLE');

    // Boundary 500 m² check for Tabla 4.6 ambiguity
    const exact500 = createCuatroAguasProject();
    exact500.isFlatRoofMode = true;
    exact500.bodies[0].outerLoop = [
      { id: 'x1', x: 0, y: 0 },
      { id: 'x2', x: 25, y: 0 },
      { id: 'x3', x: 25, y: 20 },
      { id: 'x4', x: 0, y: 20 },
    ];
    exact500.bodies[0].edgeConfigs = {
      'x1->x2': { edgeId: 'x1->x2', type: 'eave', slopePct: 2, eaveHeight: 3, overhang: 0, parapetHeight: 0, flashingHeight: 0.25, hasGutter: false, gutterDiameterMm: 125, gutterSlopePct: 1, gutterSection: 'semicircular' },
      'x2->x3': { edgeId: 'x2->x3', type: 'eave', slopePct: 2, eaveHeight: 3, overhang: 0, parapetHeight: 0, flashingHeight: 0.25, hasGutter: false, gutterDiameterMm: 125, gutterSlopePct: 1, gutterSection: 'semicircular' },
      'x3->x4': { edgeId: 'x3->x4', type: 'eave', slopePct: 2, eaveHeight: 3, overhang: 0, parapetHeight: 0, flashingHeight: 0.25, hasGutter: false, gutterDiameterMm: 125, gutterSlopePct: 1, gutterSection: 'semicircular' },
      'x4->x1': { edgeId: 'x4->x1', type: 'eave', slopePct: 2, eaveHeight: 3, overhang: 0, parapetHeight: 0, flashingHeight: 0.25, hasGutter: false, gutterDiameterMm: 125, gutterSlopePct: 1, gutterSection: 'semicircular' },
    };
    const solved500 = solveRoofProject(exact500);
    const t46Check = solved500.normative.checks.find((c) => c.id === 'cte-hs5-tabla46');
    expect(t46Check?.status).toBe('REVISIÓN TÉCNICA');
  });

  it('Referencia A multicuerpo 30% y Referencia B ETSA Sevilla resuelven limpiamente', () => {
    const refA = solveRoofProject(createReferenciaAProject());
    expect(refA.isValid).toBe(true);
    expect(refA.faces.length).toBeGreaterThanOrEqual(24);
    expect(refA.solverIssues.filter((i) => i.severity === 'error')).toHaveLength(0);

    const refB = solveRoofProject(createReferenciaBProject());
    expect(refB.isValid).toBe(true);
    expect(refB.faces).toHaveLength(20); // 5 rectangular bays x 4 triangular planes
    // 3.7*4.05 + 4.75*4.05 + 8.25*5.75 + 8.45*4.95 + 3.7*2.4 = 14.985 + 19.2375 + 47.4375 + 41.8275 + 8.88 = 132.3675 m²
    expect(refB.measurements.totalProjectedAreaM2).toBeCloseTo(132.3675, 2);
  });

  it('Prueba 8 y Prueba 9: Sincronización 2D/3D, planta irregular en U / trapecio sin caras invertidas ni huecos', () => {
    const base = createCuatroAguasProject();
    // Move 1 vertex -> trapezoid (bases 12 and 10, height 7 => 77 m²)
    base.bodies[0].outerLoop[1].x = 12;
    const sTrap = solveRoofProject(base);
    expect(sTrap.isValid).toBe(true);
    expect(sTrap.measurements.totalProjectedAreaM2).toBeCloseTo(77, 3);

    // Move top-right vertex too -> 12x7 rectangle (84 m², ridge 5m)
    base.bodies[0].outerLoop[2].x = 12;
    const s1 = solveRoofProject(base);
    expect(s1.isValid).toBe(true);
    expect(s1.measurements.totalProjectedAreaM2).toBeCloseTo(12 * 7, 3);
    expect(s1.measurements.ridgeLengthM).toBeCloseTo(12 - 7, 3);

    // U-shaped irregular courtyard polygon
    const uPoly = [
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 9 },
      { x: 10, y: 9 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 9 },
      { x: 0, y: 9 },
    ];
    const uProj = createCuatroAguasProject();
    uProj.bodies = [polygonToRoofBody(uPoly, 'u-body', 'Planta en U', 30, 3.5)];
    const solvedU = solveRoofProject(uProj);
    expect(solvedU.isValid).toBe(true);
    const expectedUArea = polygonArea2D(uPoly); // 14*9 - 6*5 = 96 m²
    expect(solvedU.measurements.totalProjectedAreaM2).toBeCloseTo(expectedUArea, 3);
    for (const f of solvedU.faces) {
      expect(signedArea2D(f.polygon2D)).toBeGreaterThan(0);
      expect(f.planarityMaxResidual).toBeLessThan(1e-5);
    }

    // Non-orthogonal irregular quadrilateral
    const quadPoly = [
      { x: 0, y: 0 },
      { x: 11, y: 1.5 },
      { x: 9.5, y: 8 },
      { x: -1, y: 6.5 },
    ];
    const qProj = createCuatroAguasProject();
    qProj.bodies = [polygonToRoofBody(quadPoly, 'q-body', 'Trapecio irregular', 35, 3.0)];
    const solvedQ = solveRoofProject(qProj);
    expect(solvedQ.isValid).toBe(true);
    expect(solvedQ.measurements.totalProjectedAreaM2).toBeCloseTo(polygonArea2D(quadPoly), 3);
  });

  it('Prueba 10: Exportación vectorial SVG y CAD DXF coincide con geometría y cotas calculadas', () => {
    const proj = createDefaultViviendaProject();
    const solved = solveRoofProject(proj);

    const svg = generatePlanSvgString(proj, solved);
    expect(svg).toContain('<svg');
    expect(svg).toContain('30.0%');
    expect(svg).toContain('12.50 m');
    expect(svg).toContain('9.20 m');

    const dxf = generateDxfString(proj, solved);
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('CUMBRERAS');
    expect(dxf).toContain('LIMATESAS');
    expect(dxf).toContain('LIMAHOYAS');
    expect(dxf).toContain('EOF');
  });

  it('Prueba 11: Corrección matemática de replanteo manual (acierto, tipo erróneo, trazo incorrecto y faltantes)', () => {
    const solved = solveRoofProject(createCuatroAguasProject()); // 10x7: 4 limatesas + 1 cumbrera
    const perfectManual: ManualReplanteoEdge[] = [
      { id: 'm1', kind: 'limatesa', p1: { x: 0, y: 0 }, p2: { x: 3.5, y: 3.5 } },
      { id: 'm2', kind: 'limatesa', p1: { x: 10, y: 0 }, p2: { x: 6.5, y: 3.5 } },
      { id: 'm3', kind: 'limatesa', p1: { x: 10, y: 7 }, p2: { x: 6.5, y: 3.5 } },
      { id: 'm4', kind: 'limatesa', p1: { x: 0, y: 7 }, p2: { x: 3.5, y: 3.5 } },
      { id: 'm5', kind: 'cumbrera', p1: { x: 3.5, y: 3.5 }, p2: { x: 6.5, y: 3.5 } },
    ];
    const rOk = gradeManualReplanteo(perfectManual, solved.edges);
    expect(rOk.totalExpected).toBe(5);
    expect(rOk.correctCount).toBe(5);
    expect(rOk.missingCount).toBe(0);
    expect(rOk.scorePct).toBe(100);

    // Swap type on ridge + wrong position on one hip + omit one hip
    const flawedManual: ManualReplanteoEdge[] = [
      { id: 'f1', kind: 'limatesa', p1: { x: 0, y: 0 }, p2: { x: 3.5, y: 3.5 } }, // ok
      { id: 'f2', kind: 'limahoya', p1: { x: 3.5, y: 3.5 }, p2: { x: 6.5, y: 3.5 } }, // wrong_type (expected cumbrera)
      { id: 'f3', kind: 'limatesa', p1: { x: 10, y: 0 }, p2: { x: 4.5, y: 1.5 } }, // wrong_position
    ];
    const rBad = gradeManualReplanteo(flawedManual, solved.edges);
    expect(rBad.correctCount).toBe(1);
    expect(rBad.edgeGrades['f1'].status).toBe('correct');
    expect(rBad.edgeGrades['f2'].status).toBe('wrong_type');
    expect(rBad.edgeGrades['f2'].expectedType).toBe('cumbrera');
    expect(rBad.edgeGrades['f3'].status).toBe('wrong_position');
    expect(rBad.missingCount).toBeGreaterThanOrEqual(3);
    expect(rBad.scorePct).toBeLessThan(50);

    // Check waterproofing toggle drives Tabla 2.10 rule switch directly
    const pitched = createDosAguasProject();
    pitched.hasWaterproofing = false;
    const sNoWp = solveRoofProject(pitched);
    expect(sNoWp.normative.checks.some((c) => c.id === 'cte-hs1-tabla210')).toBe(true);
    pitched.hasWaterproofing = true;
    const sWithWp = solveRoofProject(pitched);
    expect(sWithWp.normative.checks.some((c) => c.id === 'cte-hs1-tabla210-imp')).toBe(true);
  });

  it('Prueba 12: Los 6 casos de estudio integrados y el generador Multi-Solución (5 alternativas) resuelven sin errores', () => {
    for (const bp of BUILTIN_PROJECTS) {
      const s = solveRoofProject(bp);
      expect(s.isValid).toBe(true);
      expect(s.solverIssues.filter((i) => i.severity === 'error')).toHaveLength(0);
      expect(s.faces.length).toBeGreaterThan(0);
      for (const f of s.faces) {
        expect(f.planarityMaxResidual).toBeLessThan(1e-4);
        expect(f.projectedAreaM2).toBeGreaterThan(0);
      }
    }

    // Generate 5 architectural roof variants from a drawn L-shaped perimeter
    const baseProj = createDefaultViviendaProject();
    const variants = generateRoofSolutionVariants(baseProj);
    expect(variants).toHaveLength(5);
    expect(variants.map((v) => v.id)).toEqual([
      'cuatro_aguas',
      'dos_aguas',
      'asimetrica',
      'un_agua',
      'plana_invertida',
    ]);
    for (const v of variants) {
      expect(v.solved.isValid).toBe(true);
      expect(v.solved.solverIssues.filter((i) => i.severity === 'error')).toHaveLength(0);
      expect(v.solved.faces.length).toBeGreaterThanOrEqual(1);
    }
    expect(variants.find((v) => v.id === 'un_agua')?.solved.faces).toHaveLength(1);
    expect(variants.find((v) => v.id === 'plana_invertida')?.project.isFlatRoofMode).toBe(true);
  });
});
