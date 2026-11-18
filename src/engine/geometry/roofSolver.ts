import type { RoofProject } from '../../types/roof';
import type { SolvedRoofModel } from '../../types/solved';
import { combineRoofBodies } from './bodyCombiner';
import { evaluateHydrology } from '../hydrology/waterEngine';
import { evaluateNormative } from '../normative/normativeChecker';
import { computeMeasurements } from '../measurements/quantitySurvey';

/**
 * Unified central geometric, hydrological, normative & measurement solver.
 * Used identically by 2D canvas, 3D scene, section cut, exploded view, inspector and exports.
 */
export function solveRoofProject(project: RoofProject): SolvedRoofModel {
  const geo = combineRoofBodies(project.bodies);
  const hydrology = evaluateHydrology(project, geo.faces, geo.edges);
  const normative = evaluateNormative(project, geo.faces, geo.edges, hydrology);
  const measurements = computeMeasurements(project, geo.faces, geo.edges);

  const hasFatalError =
    geo.issues.some((i) => i.severity === 'error') || geo.faces.length === 0;

  return {
    isValid: !hasFatalError,
    solverIssues: geo.issues,
    faces: geo.faces,
    edges: geo.edges,
    wallPatches: geo.wallPatches,
    wavefrontSnapshots: geo.snapshots,
    bounds2D: geo.bounds2D,
    bounds3D: geo.bounds3D,
    hydrology,
    normative,
    measurements,
  };
}
