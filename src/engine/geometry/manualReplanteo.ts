import type { Point2D, ManualReplanteoEdge } from '../../types/roof';
import type { SolvedEdge, SolvedEdgeType } from '../../types/solved';
import { dist2, distancePointToSegment2D } from '../math/vec';

export interface ManualEdgeGrade {
  manualId: string;
  status: 'correct' | 'wrong_type' | 'wrong_position';
  expectedType?: SolvedEdgeType;
  message: string;
}

export interface ManualGradingReport {
  totalExpected: number;
  correctCount: number;
  wrongTypeCount: number;
  wrongPosCount: number;
  missingCount: number;
  scorePct: number;
  edgeGrades: Record<string, ManualEdgeGrade>;
  missingExpectedEdges: SolvedEdge[];
  summaryMessage: string;
}

function segmentToSegmentProximity(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D
): { maxEndpointDist: number; angleDiffDeg: number; lenRatio: number } {
  const d1 = Math.min(dist2(a1, b1), dist2(a1, b2));
  const d2 = Math.min(dist2(a2, b1), dist2(a2, b2));
  const distToSeg1 = distancePointToSegment2D(a1, b1, b2);
  const distToSeg2 = distancePointToSegment2D(a2, b1, b2);
  const maxEndpointDist = Math.max(Math.min(d1, distToSeg1 + 0.15), Math.min(d2, distToSeg2 + 0.15));

  const dirA = { x: a2.x - a1.x, y: a2.y - a1.y };
  const dirB = { x: b2.x - b1.x, y: b2.y - b1.y };
  const la = Math.hypot(dirA.x, dirA.y) || 1;
  const lb = Math.hypot(dirB.x, dirB.y) || 1;
  const cos = Math.min(1, Math.abs((dirA.x * dirB.x + dirA.y * dirB.y) / (la * lb)));
  const angleDiffDeg = (Math.acos(cos) * 180) / Math.PI;
  const lenRatio = Math.min(la, lb) / Math.max(la, lb);

  return { maxEndpointDist, angleDiffDeg, lenRatio };
}

/**
 * Evaluates student-drawn manual replanteo lines (cumbreras, limatesas, limahoyas)
 * against the exact mathematical Straight Skeleton solution.
 */
export function gradeManualReplanteo(
  manualEdges: ManualReplanteoEdge[],
  solvedEdges: SolvedEdge[]
): ManualGradingReport {
  const expectedInterior = solvedEdges.filter(
    (e) => e.type === 'cumbrera' || e.type === 'limatesa' || e.type === 'limahoya'
  );

  const edgeGrades: Record<string, ManualEdgeGrade> = {};
  const matchedExpectedIds = new Set<string>();

  let correctCount = 0;
  let wrongTypeCount = 0;
  let wrongPosCount = 0;

  for (const me of manualEdges) {
    let bestExp: SolvedEdge | null = null;
    let bestScore = Infinity;

    for (const exp of expectedInterior) {
      if (matchedExpectedIds.has(exp.id)) continue;
      const prox = segmentToSegmentProximity(me.p1, me.p2, exp.p1, exp.p2);
      const dMid =
        distancePointToSegment2D(
          { x: (me.p1.x + me.p2.x) * 0.5, y: (me.p1.y + me.p2.y) * 0.5 },
          exp.p1,
          exp.p2
        ) +
        dist2(me.p1, exp.p1.x < exp.p2.x ? exp.p1 : exp.p2) * 0.1;
      const score = prox.maxEndpointDist + prox.angleDiffDeg * 0.04 + (1 - prox.lenRatio) * 1.5 + dMid * 0.2;
      if (score < bestScore) {
        bestScore = score;
        bestExp = exp;
      }
    }

    if (bestExp) {
      const prox = segmentToSegmentProximity(me.p1, me.p2, bestExp.p1, bestExp.p2);
      const geomMatches =
        prox.maxEndpointDist <= 0.45 && prox.angleDiffDeg <= 12 && prox.lenRatio >= 0.68;

      if (geomMatches) {
        matchedExpectedIds.add(bestExp.id);
        if (me.kind === bestExp.type) {
          correctCount++;
          edgeGrades[me.id] = {
            manualId: me.id,
            status: 'correct',
            expectedType: bestExp.type,
            message: `✓ ${me.kind.toUpperCase()} correcta`,
          };
        } else {
          wrongTypeCount++;
          const tip =
            bestExp.type === 'limahoya'
              ? 'Aquí convergen dos faldones (rincón cóncavo): es una Limahoya.'
              : bestExp.type === 'limatesa'
                ? 'Es una arista saliente inclinada que separa aguas: es una Limatesa.'
                : 'Es la arista horizontal superior de encuentro: es una Cumbrera.';
          edgeGrades[me.id] = {
            manualId: me.id,
            status: 'wrong_type',
            expectedType: bestExp.type,
            message: `⚠ Trazado geométrico válido, pero el tipo correcto es ${bestExp.type.toUpperCase()}. ${tip}`,
          };
        }
      } else {
        wrongPosCount++;
        edgeGrades[me.id] = {
          manualId: me.id,
          status: 'wrong_position',
          expectedType: bestExp.type,
          message:
            '✗ Dirección o longitud incorrecta respecto a la intersección matemática de planos (bisectriz).',
        };
      }
    } else {
      wrongPosCount++;
      edgeGrades[me.id] = {
        manualId: me.id,
        status: 'wrong_position',
        message: '✗ Esta línea no coincide con ninguna intersección real de la cubierta.',
      };
    }
  }

  const missingExpectedEdges = expectedInterior.filter((e) => !matchedExpectedIds.has(e.id));
  const missingCount = missingExpectedEdges.length;
  const totalExpected = expectedInterior.length;

  const rawScore =
    totalExpected === 0
      ? 100
      : Math.max(
          0,
          Math.round(((correctCount + wrongTypeCount * 0.4 - wrongPosCount * 0.25) / totalExpected) * 100)
        );

  let summaryMessage = '';
  if (totalExpected === 0) {
    summaryMessage = 'Cubierta sin aristas interiores.';
  } else if (correctCount === totalExpected && wrongPosCount === 0 && wrongTypeCount === 0) {
    summaryMessage = `¡Excelente! Replanteo 100% correcto (${correctCount}/${totalExpected} aristas exactas).`;
  } else {
    const parts: string[] = [];
    if (correctCount > 0) parts.push(`${correctCount} correctas`);
    if (wrongTypeCount > 0) parts.push(`${wrongTypeCount} con tipo equivocado`);
    if (wrongPosCount > 0) parts.push(`${wrongPosCount} fuera de bisectriz`);
    if (missingCount > 0) parts.push(`faltan ${missingCount}`);
    summaryMessage = `Resultado: ${parts.join(' · ')}.`;
  }

  return {
    totalExpected,
    correctCount,
    wrongTypeCount,
    wrongPosCount,
    missingCount,
    scorePct: rawScore,
    edgeGrades,
    missingExpectedEdges,
    summaryMessage,
  };
}
