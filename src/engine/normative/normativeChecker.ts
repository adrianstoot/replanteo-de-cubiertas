import type { RoofProject } from '../../types/roof';
import type {
  HydrologyReport,
  NormativeCheckItem,
  NormativeReport,
  NormativeStatus,
  SolvedEdge,
  SolvedFace,
} from '../../types/solved';
import {
  TABLA_210_CUBIERTAS_INCLINADAS,
  TABLA_29_CUBIERTAS_PLANAS,
  TABLA_ULIM_CUBIERTA_HE1,
  WIND_QB_KN_M2,
} from './cteDatabase';

export function evaluateNormative(
  project: RoofProject,
  faces: SolvedFace[],
  edges: SolvedEdge[],
  hydrology: HydrologyReport
): NormativeReport {
  const checks: NormativeCheckItem[] = [];

  // 1. PENDIENTES: DB-HS 1 Tabla 2.9 (Cubiertas planas) vs Tabla 2.10 (Cubiertas inclinadas)
  const isFlatSystem =
    project.isFlatRoofMode ||
    project.systemId === 'plana_transitable' ||
    project.systemId === 'invertida_transitable' ||
    project.systemId === 'ajardinada';

  if (isFlatSystem) {
    const t29 =
      TABLA_29_CUBIERTAS_PLANAS.find((e) => e.usage === project.flatRoofUsage) ||
      TABLA_29_CUBIERTAS_PLANAS[0];
    const activeFaces = faces.filter((f) => f.slopePct > 0.001 || faces.length === 1);
    const minSlope = activeFaces.length > 0 ? Math.min(...activeFaces.map((f) => f.slopePct)) : 0;
    const maxSlope = activeFaces.length > 0 ? Math.max(...activeFaces.map((f) => f.slopePct)) : 0;
    const badFace = activeFaces.find(
      (f) => f.slopePct < t29.minSlopePct - 0.01 || f.slopePct > t29.maxSlopePct + 0.01
    );

    const status: NormativeStatus =
      activeFaces.length === 0
        ? 'PENDIENTE DE DATOS'
        : badFace
          ? 'NO CUMPLE'
          : 'CUMPLE';

    checks.push({
      id: 'cte-hs1-tabla29',
      code: 'CTE DB-HS 1 · Tabla 2.9',
      category: 'pendientes',
      title: `Pendientes de cubierta plana (${t29.label})`,
      character: 'reglamentario',
      status,
      requiredValue: `${t29.minSlopePct}% – ${t29.maxSlopePct}%`,
      measuredValue:
        activeFaces.length > 0
          ? `${minSlope.toFixed(2)}% – ${maxSlope.toFixed(2)}%`
          : 'Sin faldones resueltos',
      targetLocation: badFace?.centroid2D || faces[0]?.centroid2D,
      targetEntityId: badFace?.id || faces[0]?.id,
      targetEntityKind: 'face',
      studentExplanation:
        'En cubiertas planas el CTE DB-HS 1 exige pendientes suaves (generalmente 1% a 5%) para garantizar la evacuación hacia sumideros sin encharcamientos y mantener la seguridad de uso o estabilidad de la protección.',
      remediation: badFace
        ? `Ajuste la pendiente del faldón ${badFace.label} (${badFace.slopePct.toFixed(2)}%) dentro del intervalo ${t29.minSlopePct}%–${t29.maxSlopePct}%.`
        : 'Todas las pendientes de paños están dentro del intervalo reglamentario.',
    });
  } else {
    const t210 = TABLA_210_CUBIERTAS_INCLINADAS.find((e) =>
      e.mappedSystems.includes(project.systemId)
    );
    const minSlope = faces.length > 0 ? Math.min(...faces.map((f) => f.slopePct)) : 0;
    const badFace = t210
      ? faces.find((f) => f.slopePct < t210.minSlopePct - 0.01)
      : undefined;

    if (!project.hasWaterproofing) {
      const status: NormativeStatus =
        faces.length === 0
          ? 'PENDIENTE DE DATOS'
          : !t210
            ? 'REVISIÓN TÉCNICA'
            : badFace
              ? 'NO CUMPLE'
              : 'CUMPLE';
      checks.push({
        id: 'cte-hs1-tabla210',
        code: 'CTE DB-HS 1 · Tabla 2.10',
        category: 'pendientes',
        title: `Pendiente mínima de cubierta inclinada (${t210?.label ?? project.systemId})`,
        character: 'reglamentario',
        status,
        requiredValue: t210 ? `>= ${t210.minSlopePct}% (sin impermeabilización)` : 'Según material',
        measuredValue:
          faces.length > 0
            ? `Mín. ${minSlope.toFixed(2)}% (${((Math.atan(minSlope / 100) * 180) / Math.PI).toFixed(2)}°)`
            : 'Sin resolver',
        targetLocation: badFace?.centroid2D || faces[0]?.centroid2D,
        targetEntityId: badFace?.id || faces[0]?.id,
        targetEntityKind: 'face',
        studentExplanation:
          'La Tabla 2.10 del DB-HS 1 fija la pendiente mínima de los tejados SIN capa de impermeabilización inferior para evitar que la lluvia o el viento remonten entre los solapes de las piezas.',
        remediation: badFace && t210
          ? `Eleve la pendiente de ${badFace.label} al menos al ${t210.minSlopePct}% o incorpore una lámina impermeabilizante bajo teja (verificando ficha técnica del fabricante).`
          : 'La pendiente mínima de todos los faldones supera el umbral de la Tabla 2.10.',
      });
    } else {
      checks.push({
        id: 'cte-hs1-tabla210-imp',
        code: 'CTE DB-HS 1 · Apdo. 2.4.3 / Tabla 2.10',
        category: 'pendientes',
        title: 'Cubierta inclinada con capa de impermeabilización',
        character: 'reglamentario',
        status: 'REVISIÓN TÉCNICA',
        requiredValue: 'Condiciones del sistema impermeable y fabricante (UNE aplicable)',
        measuredValue: `Mín. ${minSlope.toFixed(2)}% (con capa impermeable)`,
        targetLocation: faces[0]?.centroid2D,
        targetEntityId: faces[0]?.id,
        targetEntityKind: 'face',
        studentExplanation:
          'Al existir lámina impermeabilizante bajo la cobertura, la Tabla 2.10 no aplica de forma directa: el diseñador debe verificar las condiciones de fijación, ventilación y pendiente mínima admisible del sistema impermeable elegido según fabricante.',
        remediation:
          'Verifique en la ficha técnica del sistema impermeabilizante la pendiente mínima admitida y el detalle de fijación mecánica de las piezas de cobertura sobre la lámina.',
      });
    }
  }

  // 2. EVACUACIÓN DE AGUAS: DB-HS 5 Tabla 4.6 (Sumideros)
  if (hydrology.isTabla46BoundaryAmbiguous) {
    checks.push({
      id: 'cte-hs5-tabla46',
      code: 'CTE DB-HS 5 · Tabla 4.6',
      category: 'evacuacion',
      title: 'Número mínimo de sumideros (Caso límite exacto 500 m²)',
      character: 'reglamentario',
      status: 'REVISIÓN TÉCNICA',
      requiredValue: 'Ambigüedad literal en S = 500,00 m² ("< 500" vs "> 500")',
      measuredValue: `${hydrology.actualSumideros} sumidero(s) en ${hydrology.totalHorizontalAreaM2.toFixed(2)} m²`,
      targetEntityKind: 'project',
      studentExplanation:
        'La redacción literal de la Tabla 4.6 salta de "Desde 200 hasta menos de 500 m²" a "Más de 500 m²". En el límite exacto de 500,00 m² debe adoptarse el criterio más conservador (al menos 4 sumideros o 1 por cada 150 m²).',
      remediation: 'Adopte al menos 4 sumideros (criterio conservador) y verifique rebosaderos.',
    });
  } else if (hydrology.minimumSumiderosTabla46 !== null) {
    const req = hydrology.minimumSumiderosTabla46;
    const act = hydrology.actualSumideros;
    checks.push({
      id: 'cte-hs5-tabla46',
      code: 'CTE DB-HS 5 · Tabla 4.6',
      category: 'evacuacion',
      title: 'Número mínimo de sumideros por superficie en proyección horizontal',
      character: 'reglamentario',
      status: act >= req ? 'CUMPLE' : 'NO CUMPLE',
      requiredValue: `>= ${req} sumideros (para ${hydrology.totalHorizontalAreaM2.toFixed(2)} m² horiz.)`,
      measuredValue: `${act} sumidero(s) / cazoleta(s)`,
      targetLocation: project.drains[0] ? { x: project.drains[0].x, y: project.drains[0].y } : undefined,
      targetEntityKind: 'drain',
      targetEntityId: project.drains[0]?.id,
      studentExplanation:
        'La Tabla 4.6 del DB-HS 5 exige un número mínimo de sumideros en función de la superficie en proyección horizontal (NUNCA superficie inclinada) para evitar colapsos por obstrucción.',
      remediation:
        act < req
          ? `Añada al menos ${req - act} sumidero(s) adicional(es) distribuidos según las cuencas de escorrentía.`
          : 'El número de sumideros iguala o supera el mínimo exigido por la Tabla 4.6.',
    });
  } else {
    checks.push({
      id: 'cte-hs5-tabla46-na',
      code: 'CTE DB-HS 5 · Tabla 4.6',
      category: 'evacuacion',
      title: 'Número mínimo de sumideros en cubierta plana/interna',
      character: 'reglamentario',
      status: 'NO APLICABLE',
      requiredValue: 'Solo aplicable cuando existen sumideros / recogida interior',
      measuredValue: 'Evacuación libre por alero o canalón perimetral',
      targetEntityKind: 'project',
      studentExplanation:
        'En cubiertas inclinadas con vertido directo al exterior o a canalón visto continuo sin cazoletas interiores, el dimensionado se rige por las Tablas 4.7 y 4.8.',
      remediation: 'No requiere acción salvo que añada limahoyas interiores cerradas.',
    });
  }

  // 3. EVACUACIÓN: Canalones DB-HS 5 Tabla 4.7 & Pendiente DB-HS 1 >= 1%
  if (hydrology.gutterEvaluations.length > 0) {
    const failedGutter = hydrology.gutterEvaluations.find((g) => !g.compliesTabla47);
    const lowSlopeGutter = hydrology.gutterEvaluations.find((g) => !g.compliesMinSlope1Pct);
    const badG = failedGutter || lowSlopeGutter;
    const badSolvedEdge = badG ? edges.find((e) => e.id === badG.edgeId) : undefined;

    checks.push({
      id: 'cte-hs5-tabla47',
      code: 'CTE DB-HS 5 · Tabla 4.7 & DB-HS 1',
      category: 'evacuacion',
      title: `Dimensionado y pendiente de canalones (f = ${hydrology.intensityFactor.toFixed(2)})`,
      character: 'reglamentario',
      status: failedGutter || lowSlopeGutter ? 'NO CUMPLE' : 'CUMPLE',
      requiredValue: `Pendiente >= 1,0% y diámetro según Tabla 4.7 (i = ${hydrology.effectiveIntensityMmH} mm/h)`,
      measuredValue: badG
        ? `DN ${badG.diameterMm} mm al ${badG.slopePct.toFixed(1)}% (${badG.correctedAreaM2.toFixed(1)} m² corr. > ${badG.maxAllowedAreaM2.toFixed(1)} m²)`
        : `${hydrology.gutterEvaluations.length} tramo(s) conformes`,
      targetLocation: badSolvedEdge
        ? {
            x: (badSolvedEdge.p1.x + badSolvedEdge.p2.x) * 0.5,
            y: (badSolvedEdge.p1.y + badSolvedEdge.p2.y) * 0.5,
          }
        : undefined,
      targetEntityId: badSolvedEdge?.id,
      targetEntityKind: 'edge',
      studentExplanation:
        'La Tabla 4.7 determina el diámetro nominal del canalón según su pendiente y la superficie horizontal corregida por la intensidad pluviométrica f = i/100. Además, DB-HS 1 exige pendiente mínima del 1% en canalones vistos.',
      remediation: badG
        ? `Aumente el diámetro del canalón a DN ${badG.requiredDiameterMm} mm o incremente su pendiente hacia la bajante (>= 1,0%).`
        : 'Todos los tramos de canalón verifican capacidad y pendiente mínima.',
    });
  }

  // 4. EVACUACIÓN: Bajantes DB-HS 5 Tabla 4.8
  if (hydrology.downspoutEvaluations.length > 0) {
    const badDs = hydrology.downspoutEvaluations.find((d) => !d.compliesTabla48);
    const badRawDs = badDs ? project.downspouts.find((x) => x.id === badDs.downspoutId) : undefined;
    checks.push({
      id: 'cte-hs5-tabla48',
      code: 'CTE DB-HS 5 · Tabla 4.8',
      category: 'evacuacion',
      title: `Diámetro nominal de bajantes pluviales (i = ${hydrology.effectiveIntensityMmH} mm/h)`,
      character: 'reglamentario',
      status: badDs ? 'NO CUMPLE' : 'CUMPLE',
      requiredValue: badDs
        ? `>= DN ${badDs.recommendedMinMm} mm para ${badDs.correctedAreaM2.toFixed(1)} m² corr.`
        : 'Capacidad >= superficie corregida por bajante',
      measuredValue: badDs
        ? `${badDs.label}: DN ${badDs.diameterMm} mm (máx. ${badDs.maxAllowedAreaM2} m²)`
        : `${hydrology.downspoutEvaluations.length} bajante(s) conformes`,
      targetLocation: badRawDs ? { x: badRawDs.x, y: badRawDs.y } : undefined,
      targetEntityId: badDs?.downspoutId,
      targetEntityKind: 'downspout',
      studentExplanation:
        'La Tabla 4.8 relaciona la superficie en proyección horizontal corregida (S × i/100) con el diámetro nominal mínimo de cada bajante pluvial para no superar el llenado de 1/3 de sección.',
      remediation: badDs
        ? `Sustituya la bajante ${badDs.label} por diámetro nominal mínimo DN ${badDs.recommendedMinMm} mm.`
        : 'Todas las bajantes cumplen la Tabla 4.8.',
    });
  } else if (isFlatSystem || hydrology.gutterEvaluations.length > 0) {
    checks.push({
      id: 'cte-hs5-tabla48-missing',
      code: 'CTE DB-HS 5 · Tabla 4.8',
      category: 'evacuacion',
      title: 'Bajantes de evacuación pluvial',
      character: 'reglamentario',
      status: 'PENDIENTE DE DATOS',
      requiredValue: 'Al menos 1 bajante conectada a canalones o sumideros',
      measuredValue: '0 bajantes definidas',
      studentExplanation:
        'Para verificar la Tabla 4.8 es necesario posicionar las bajantes conectadas a los sumideros o extremos de canalón.',
      remediation: 'Inserte bajantes desde la herramienta "Bajantes" en el panel izquierdo.',
    });
  }

  // 5. EVACUACIÓN: Alertas de recorrido (limahoyas ciegas / acumulaciones)
  if (hydrology.alerts.length > 0) {
    const firstAlert = hydrology.alerts[0];
    checks.push({
      id: 'cte-hs5-escorrentia',
      code: 'CTE DB-HS 5 · Trazado hidráulico',
      category: 'evacuacion',
      title: 'Continuidad de escorrentía y ausencia de acumulaciones',
      character: 'reglamentario',
      status: 'NO CUMPLE',
      requiredValue: 'Toda trayectoria debe alcanzar evacuación válida',
      measuredValue: `${hydrology.alerts.length} incidencia(s): ${firstAlert.title}`,
      targetLocation: firstAlert.location,
      studentExplanation:
        'El agua debe recorrer la cubierta sin quedar atrapada en limahoyas ciegas ni contra pretiles o paramentos sin desagüe.',
      remediation: firstAlert.remediation,
    });
  } else {
    checks.push({
      id: 'cte-hs5-escorrentia',
      code: 'CTE DB-HS 5 · Trazado hidráulico',
      category: 'evacuacion',
      title: 'Continuidad de escorrentía y ausencia de acumulaciones',
      character: 'reglamentario',
      status: 'CUMPLE',
      requiredValue: '100% de trayectorias evacuadas',
      measuredValue: `${hydrology.streamlines.length} líneas de flujo verificadas`,
      studentExplanation:
        'Todas las trayectorias calculadas mediante el vector de máxima pendiente alcanzan limahoyas abiertas, canalones o sumideros activos.',
      remediation: 'Sin incidencias de estancamiento.',
    });
  }

  // 6. PUNTOS SINGULARES: Encuentros con paramentos verticales >= 25 cm
  const abutmentEdges = edges.filter((e) => e.type === 'encuentro_paramento');
  if (abutmentEdges.length > 0 || project.bodies.some((b) => Object.values(b.edgeConfigs).some((c) => c.type === 'wall_abutment' || c.type === 'parapet'))) {
    let minFlashCm = Infinity;
    let badLoc = abutmentEdges[0]
      ? { x: (abutmentEdges[0].p1.x + abutmentEdges[0].p2.x) * 0.5, y: (abutmentEdges[0].p1.y + abutmentEdges[0].p2.y) * 0.5 }
      : undefined;

    for (const b of project.bodies) {
      for (const cfg of Object.values(b.edgeConfigs)) {
        if (cfg.type === 'wall_abutment' || cfg.type === 'parapet') {
          minFlashCm = Math.min(minFlashCm, cfg.flashingHeight * 100);
        }
      }
    }
    if (!Number.isFinite(minFlashCm)) minFlashCm = 25;

    checks.push({
      id: 'cte-hs1-paramentos',
      code: 'CTE DB-HS 1 · Apdo. 2.4.4.1',
      category: 'singulares',
      title: 'Protección en encuentros con paramentos verticales y pretiles',
      character: 'reglamentario',
      status: minFlashCm >= 25 ? 'CUMPLE' : 'NO CUMPLE',
      requiredValue: '>= 25 cm sobre la superficie acabada de la cubierta',
      measuredValue: `${minFlashCm.toFixed(1)} cm de entrega/zaguán impermeable`,
      targetLocation: badLoc,
      targetEntityId: abutmentEdges[0]?.id,
      targetEntityKind: 'edge',
      studentExplanation:
        'En todo encuentro de la cubierta contra un muro o pretil vertical, el remate impermeable debe remontar como mínimo 25 cm por encima de la protección del faldón (rematado con roza o babero).',
      remediation:
        minFlashCm < 25
          ? 'Aumente la altura de entrega del remate impermeable contra paramento a >= 25 cm.'
          : 'Entrega contra paramento conforme (>= 25 cm).',
    });
  }

  // 7. PUNTOS SINGULARES: Aleros (vuelo >= 5 cm y <= 1/2 pieza) en cubiertas de piezas
  const isPieceCladding = [
    'teja_curva',
    'teja_mixta',
    'teja_plana',
    'teja_encaje',
    'pizarra',
  ].includes(project.systemId);
  const eaveEdges = edges.filter((e) => e.type === 'alero');

  if (isPieceCladding && eaveEdges.length > 0) {
    const vCm = project.tileSpec.eaveOverhangCm;
    const maxVuelo = project.tileSpec.lengthCm * 0.5;
    const ok = vCm >= 5 && vCm <= maxVuelo;
    checks.push({
      id: 'cte-hs1-aleros',
      code: 'CTE DB-HS 1 · Apdo. 2.4.4.1.2',
      category: 'singulares',
      title: 'Vuelo de las piezas en aleros',
      character: 'reglamentario',
      status: ok ? 'CUMPLE' : 'NO CUMPLE',
      requiredValue: `5,0 cm <= vuelo <= ${maxVuelo.toFixed(1)} cm (1/2 pieza)`,
      measuredValue: `${vCm.toFixed(1)} cm`,
      targetLocation: {
        x: (eaveEdges[0].p1.x + eaveEdges[0].p2.x) * 0.5,
        y: (eaveEdges[0].p1.y + eaveEdges[0].p2.y) * 0.5,
      },
      targetEntityId: eaveEdges[0].id,
      targetEntityKind: 'edge',
      studentExplanation:
        'Para evitar que el agua retorne por capilaridad mojando el borde del alero sin que la pieza vuelque por viento o peso, el CTE exige un vuelo mínimo de 5 cm y máximo de media longitud de pieza.',
      remediation: ok
        ? 'El vuelo de las piezas en alero es correcto.'
        : `Ajuste el vuelo de la primera hilada entre 5 cm y ${maxVuelo.toFixed(1)} cm en Materiales y Capas.`,
    });
  }

  // 8. PUNTOS SINGULARES: Limahoyas (vuelo >= 5 cm y separación >= 20 cm)
  const valleys = edges.filter((e) => e.type === 'limahoya');
  if (isPieceCladding && valleys.length > 0) {
    const ok =
      project.tileSpec.valleyOverhangCm >= 5 && project.tileSpec.valleyGapCm >= 20;
    checks.push({
      id: 'cte-hs1-limahoyas',
      code: 'CTE DB-HS 1 · Apdo. 2.4.4.1.5',
      category: 'singulares',
      title: 'Protección de limahoyas (separación y vuelo de piezas)',
      character: 'reglamentario',
      status: ok ? 'CUMPLE' : 'NO CUMPLE',
      requiredValue: 'Separación entre faldones >= 20 cm y vuelo de piezas >= 5 cm',
      measuredValue: `Separación ${project.tileSpec.valleyGapCm.toFixed(1)} cm · Vuelo ${project.tileSpec.valleyOverhangCm.toFixed(1)} cm`,
      targetLocation: {
        x: (valleys[0].p1.x + valleys[0].p2.x) * 0.5,
        y: (valleys[0].p1.y + valleys[0].p2.y) * 0.5,
      },
      targetEntityId: valleys[0].id,
      targetEntityKind: 'edge',
      studentExplanation:
        'Las limahoyas recogen un gran caudal de dos faldones convergentes. Dejar al menos 20 cm de canal libre entre las piezas cortadas facilita la limpieza y evita atascos de hojas o reboses.',
      remediation: ok
        ? 'Dimensiones del canal de limahoya conformes.'
        : 'Configure separación >= 20 cm y vuelo >= 5 cm sobre el canal metálico en Materiales y Capas.',
    });
  }

  // 9. PUNTOS SINGULARES: Cumbreras y limatesas (solape >= 5 cm)
  const ridgesAndHips = edges.filter((e) => e.type === 'cumbrera' || e.type === 'limatesa');
  if (isPieceCladding && ridgesAndHips.length > 0) {
    const ok = project.tileSpec.ridgeOverlapCm >= 5;
    checks.push({
      id: 'cte-hs1-cumbreras',
      code: 'CTE DB-HS 1 · Apdo. 2.4.4.1.4',
      category: 'singulares',
      title: 'Solape de piezas especiales en cumbreras y limatesas',
      character: 'reglamentario',
      status: ok ? 'CUMPLE' : 'NO CUMPLE',
      requiredValue: '>= 5,0 cm sobre las piezas de ambos faldones',
      measuredValue: `${project.tileSpec.ridgeOverlapCm.toFixed(1)} cm`,
      targetLocation: {
        x: (ridgesAndHips[0].p1.x + ridgesAndHips[0].p2.x) * 0.5,
        y: (ridgesAndHips[0].p1.y + ridgesAndHips[0].p2.y) * 0.5,
      },
      targetEntityId: ridgesAndHips[0].id,
      targetEntityKind: 'edge',
      studentExplanation:
        'Los caballetes de cumbrera y limatesa deben solapar al menos 5 cm sobre las hiladas superiores de cada faldón para impedir filtraciones por viento rasante.',
      remediation: ok
        ? 'Solape de piezas especiales de caballete correcto.'
        : 'Incremente el solape de caballetes sobre ambos faldones a >= 5 cm.',
    });
  }

  // 10. ELEMENTOS EMERGENTES: Chimeneas, Shunts, Lucernarios (>= 25 cm)
  if (project.singularElements.length > 0) {
    const badSing = project.singularElements.find((s) => s.flashingHeight * 100 < 25);
    checks.push({
      id: 'cte-hs1-emergentes',
      code: 'CTE DB-HS 1 · Apdo. 2.4.4.1.6',
      category: 'singulares',
      title: 'Remate de elementos pasantes, shunts y lucernarios',
      character: 'reglamentario',
      status: badSing ? 'NO CUMPLE' : 'CUMPLE',
      requiredValue: '>= 25 cm de protección perimetral (babero/collarín)',
      measuredValue: badSing
        ? `${badSing.label}: ${(badSing.flashingHeight * 100).toFixed(1)} cm`
        : `Todos >= 25 cm (${project.singularElements.length} elementos)`,
      targetLocation: badSing
        ? { x: badSing.x, y: badSing.y }
        : { x: project.singularElements[0].x, y: project.singularElements[0].y },
      targetEntityId: (badSing || project.singularElements[0]).id,
      targetEntityKind: 'singular',
      studentExplanation:
        'Todo elemento pasante (chimenea, shunt de ventilación, lucernario o conducto) interrumpe la cubierta y exige impermeabilización ascendente >= 25 cm y desviación de aguas en la cara superior (berrocal).',
      remediation: badSing
        ? `Aumente la altura de remate impermeable de "${badSing.label}" a >= 25 cm.`
        : 'Todos los elementos emergentes disponen de remate impermeable conforme.',
    });
  }

  // 11. ENERGÍA: DB-HE 1 Transmitancia térmica U <= U_lim (Tabla 3.1.1.a-HE1)
  const R_si = 0.10; // flujo ascendente en cubiertas
  const R_se = 0.04;
  let rLayers = 0;
  for (const layer of project.layers) {
    if (!layer.visible || layer.thicknessCm <= 0) continue;
    if (layer.lambdaWMK > 0.001) {
      rLayers += (layer.thicknessCm / 100) / layer.lambdaWMK;
    }
  }
  const totalR = R_si + rLayers + R_se;
  const thermalUValue = totalR > 0 ? 1 / totalR : 9.99;
  const thermalULimit = TABLA_ULIM_CUBIERTA_HE1[project.location.climateZoneWinter];
  const hasInsulation = project.layers.some((l) => l.visible && l.role === 'insulation' && l.thicknessCm > 0);

  checks.push({
    id: 'cte-he1-transmitancia',
    code: 'CTE DB-HE 1 · Tabla 3.1.1.a-HE1',
    category: 'energia',
    title: `Transmitancia térmica límite (Zona climática ${project.location.climateZoneWinter})`,
    character: 'reglamentario',
    status: !hasInsulation && project.layers.length === 0 ? 'PENDIENTE DE DATOS' : thermalUValue <= thermalULimit ? 'CUMPLE' : 'NO CUMPLE',
    requiredValue: `U <= ${thermalULimit.toFixed(2)} W/(m²·K)`,
    measuredValue: `U = ${thermalUValue.toFixed(2)} W/(m²·K) (R_T = ${totalR.toFixed(2)} m²·K/W)`,
    targetEntityKind: 'layer',
    targetEntityId: project.layers.find((l) => l.role === 'insulation')?.id,
    studentExplanation:
      'La transmitancia térmica U mide la pérdida de calor a través del paquete constructivo de cubierta. El DB-HE 1 (RD 732/2019) limita U según la zona climática de invierno.',
    remediation:
      thermalUValue > thermalULimit
        ? `Aumente el espesor del aislamiento térmico (actualmente insuficiente para Zona ${project.location.climateZoneWinter}) hasta lograr U <= ${thermalULimit.toFixed(2)} W/(m²·K).`
        : 'El aislamiento térmico seleccionado satisface la transmitancia límite U_lim.',
  });

  // 12. CONDENSACIONES: DB-HE 1 (superficial f_Rsi)
  let condensationCheck: NormativeReport['condensationCheck'];
  if (
    project.location.outdoorTempC !== undefined &&
    project.location.outdoorRhPct !== undefined
  ) {
    // Superficial temperature factor f_Rsi = 1 - R_si * U (R_si = 0.25 for condensation risk check per DA DB-HE/2)
    const R_si_cond = 0.25;
    const fRsi = Math.max(0, 1 - R_si_cond * thermalUValue);
    // Reference f_Rsi,min threshold for 20°C / 55% RH (~0.52-0.68 depending on climate)
    const fRsiMin = project.location.climateZoneWinter === 'E' || project.location.climateZoneWinter === 'D' ? 0.68 : 0.56;
    const condOk = fRsi >= fRsiMin;
    condensationCheck = {
      status: condOk ? 'CUMPLE' : 'NO CUMPLE',
      fRsi,
      fRsiMin,
      note: condOk
        ? `Factor de temperatura superficial f_Rsi = ${fRsi.toFixed(2)} >= ${fRsiMin.toFixed(2)} (sin riesgo de condensación superficial).`
        : `Factor f_Rsi = ${fRsi.toFixed(2)} < ${fRsiMin.toFixed(2)}: riesgo de condensaciones superficiales; aumente el aislamiento.`,
    };
    checks.push({
      id: 'cte-he1-condensacion',
      code: 'CTE DB-HE 1 · DA DB-HE/2',
      category: 'energia',
      title: 'Comprobación de riesgo de condensaciones superficiales (f_Rsi)',
      character: 'orientativo',
      status: condensationCheck.status,
      requiredValue: `f_Rsi >= ${fRsiMin.toFixed(2)} (orientativo para T_int=${project.location.indoorTempC}°C, HR=${project.location.indoorRhPct}%)`,
      measuredValue: `f_Rsi = ${fRsi.toFixed(2)}`,
      studentExplanation:
        'Un aislamiento deficiente enfría la cara interior del techo favoreciendo el moho y la condensación. El Documento de Apoyo DA DB-HE/2 evalúa f_Rsi como método de referencia.',
      remediation: condOk
        ? 'Riesgo de condensación superficial controlado.'
        : 'Incremente la resistencia térmica del aislamiento y verifique barrera de vapor si procede.',
    });
  } else {
    condensationCheck = {
      status: 'PENDIENTE DE DATOS',
      note: 'Introduzca temperatura y humedad exterior de diseño para evaluar condensaciones.',
    };
    checks.push({
      id: 'cte-he1-condensacion',
      code: 'CTE DB-HE 1 · Condensaciones',
      category: 'energia',
      title: 'Comprobación de condensaciones superficiales e intersticiales',
      character: 'reglamentario',
      status: 'PENDIENTE DE DATOS',
      requiredValue: 'Datos higrotérmicos completos (T_ext, HR_ext)',
      measuredValue: 'Faltan condiciones exteriores',
      studentExplanation:
        'La comprobación de condensaciones exige conocer las condiciones higrotérmicas interiores y exteriores del mes más frío.',
      remediation: 'Complete los datos climáticos en el panel de Normativa.',
    });
  }

  // 13. SEGURIDAD ESTRUCTURAL Y ACCIONES: DB-SE-AE (Cargas y advertencia de no validación del forjado)
  let deadLoadKgM2 = 0;
  for (const layer of project.layers) {
    if (!layer.visible || layer.thicknessCm <= 0) continue;
    deadLoadKgM2 += (layer.thicknessCm / 100) * layer.densityKgM3;
  }
  // Average slope formation weight
  const deadLoadLayersKnM2 = (deadLoadKgM2 * 9.81) / 1000;
  const liveLoadKnM2 =
    isFlatSystem && project.flatRoofUsage.startsWith('transitable') ? 2.0 : 1.0; // DB-SE-AE Tabla 3.1 (uso privado transitable 2.0 / conservación 1.0)
  const avgAngle =
    faces.length > 0
      ? faces.reduce((acc, f) => acc + f.angleDeg, 0) / faces.length
      : 0;
  // Snow shape coefficient mu_1 per DB-SE-AE 3.5.3: 0.8 for 0..30°, linear to 0 at 60°
  const mu1 = avgAngle <= 30 ? 0.8 : avgAngle >= 60 ? 0 : (0.8 * (60 - avgAngle)) / 30;
  const snowLoadKnM2 = project.location.snowLoadKnM2 * mu1;
  const windRefKnM2 = WIND_QB_KN_M2[project.location.windZone];
  const totalCharacteristicKnM2 = deadLoadLayersKnM2 + liveLoadKnM2 + snowLoadKnM2;

  checks.push({
    id: 'cte-se-ae-acciones',
    code: 'CTE DB-SE / DB-SE-AE',
    category: 'acciones',
    title: 'Cuantificación de acciones y verificación resistente del soporte',
    character: 'reglamentario',
    status: 'REVISIÓN TÉCNICA',
    requiredValue: 'Cálculo estructural del forjado/estructura soporte frente a acciones características',
    measuredValue: `G=${deadLoadLayersKnM2.toFixed(2)} + Q=${liveLoadKnM2.toFixed(2)} + Nieve=${snowLoadKnM2.toFixed(2)} kN/m² (qb=${windRefKnM2.toFixed(2)} kN/m²)`,
    targetEntityKind: 'project',
    studentExplanation:
      'Conocer el peso propio de las capas (G) y las sobrecargas reglamentarias (Q, nieve y viento del DB-SE-AE) NO demuestra por sí solo que el forjado resista: la seguridad estructural exige verificar flechas y esfuerzos con la luz, armado o escuadría real de la estructura.',
    remediation:
      'Traslade las acciones totales calculadas al proyecto de estructura para dimensionar o comprobar el forjado soporte según DB-SE-C / Código Estructural.',
  });

  // 14. DB-SUA (Protección frente a caídas si la cubierta es transitable)
  if (isFlatSystem && project.flatRoofUsage.startsWith('transitable')) {
    const maxParapet = Math.max(
      0,
      ...project.bodies.map((b) => b.parapetHeight || 0)
    );
    const reqBarandilla = maxParapet >= 0.9; // DB-SUA 1 (0.90 m hasta 6 m caída, 1.10 m > 6 m)
    checks.push({
      id: 'cte-sua1-peto',
      code: 'CTE DB-SUA 1 · Apdo. 3.2',
      category: 'seguridad',
      title: 'Altura mínima de barrera de protección / peto en cubierta transitable',
      character: 'reglamentario',
      status: reqBarandilla ? 'CUMPLE' : 'NO CUMPLE',
      requiredValue: '>= 0,90 m (altura caída <= 6 m) o >= 1,10 m (altura caída > 6 m)',
      measuredValue: `${maxParapet.toFixed(2)} m de peto perimetral`,
      studentExplanation:
        'Toda cubierta transitable accesible a usuarios requiere una barrera de protección (peto o barandilla) de al menos 0,90 m (o 1,10 m si la caída supera 6 m).',
      remediation: reqBarandilla
        ? 'Altura de peto protector conforme.'
        : 'Eleve el peto o añada barandilla hasta al menos 0,90 m – 1,10 m.',
    });
  }

  // Tally counts & overall status
  const counts: Record<NormativeStatus, number> = {
    CUMPLE: 0,
    'NO CUMPLE': 0,
    'PENDIENTE DE DATOS': 0,
    'NO APLICABLE': 0,
    'REVISIÓN TÉCNICA': 0,
  };
  for (const c of checks) {
    counts[c.status]++;
  }

  let overallStatus: NormativeStatus = 'CUMPLE';
  if (counts['NO CUMPLE'] > 0) overallStatus = 'NO CUMPLE';
  else if (counts['PENDIENTE DE DATOS'] > 0) overallStatus = 'PENDIENTE DE DATOS';
  else if (counts['REVISIÓN TÉCNICA'] > 0) overallStatus = 'REVISIÓN TÉCNICA';

  return {
    overallStatus,
    counts,
    checks,
    thermalUValue,
    thermalULimit,
    condensationCheck,
    structuralActions: {
      deadLoadLayersKnM2,
      liveLoadKnM2,
      snowLoadKnM2,
      windRefKnM2,
      totalCharacteristicKnM2,
      note: 'El cálculo de acciones (G + Q + Nieve + Viento) no sustituye a la comprobación resistente de la estructura soporte.',
    },
  };
}
