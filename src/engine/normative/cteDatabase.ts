import type { FlatRoofUsage, RoofSystemId } from '../../types/roof';

export interface CteVersionInfo {
  document: string;
  title: string;
  baseDecree: string;
  latestRevision: string;
  status: string;
}

export const CTE_VERSIONS: CteVersionInfo[] = [
  {
    document: 'DB-HS 1',
    title: 'Protección frente a la humedad',
    baseDecree: 'RD 314/2006',
    latestRevision: 'Orden FOM/588/2017 y modificaciones vigentes',
    status: 'Vigente (Articulado reglamentario)',
  },
  {
    document: 'DB-HS 5',
    title: 'Evacuación de aguas',
    baseDecree: 'RD 314/2006',
    latestRevision: 'Texto consolidado CTE vigente',
    status: 'Vigente (Articulado reglamentario)',
  },
  {
    document: 'DB-HE 1',
    title: 'Condiciones para el control de la demanda energética',
    baseDecree: 'RD 314/2006',
    latestRevision: 'RD 732/2019 (Tabla 3.1.1.a-HE1)',
    status: 'Vigente (Articulado reglamentario)',
  },
  {
    document: 'DB-SE / DB-SE-AE',
    title: 'Seguridad estructural · Acciones en la edificación',
    baseDecree: 'RD 314/2006',
    latestRevision: 'Texto consolidado CTE vigente',
    status: 'Vigente (Articulado reglamentario)',
  },
  {
    document: 'DB-SI / DB-SUA',
    title: 'Seguridad en caso de incendio y utilización',
    baseDecree: 'RD 314/2006',
    latestRevision: 'Texto consolidado CTE vigente',
    status: 'Aplicable según uso y accesibilidad',
  },
];

export interface Tabla210Entry {
  id: string;
  label: string;
  minSlopePct: number;
  mappedSystems: RoofSystemId[];
}

/**
 * CTE DB-HS 1 · Tabla 2.10: Pendiente mínima de cubiertas inclinadas (sin capa de impermeabilización)
 */
export const TABLA_210_CUBIERTAS_INCLINADAS: Tabla210Entry[] = [
  { id: 'teja_curva', label: 'Teja curva', minSlopePct: 32, mappedSystems: ['teja_curva'] },
  { id: 'teja_mixta_monocanal', label: 'Teja mixta y plana monocanal', minSlopePct: 30, mappedSystems: ['teja_mixta'] },
  { id: 'teja_plana_marsellesa', label: 'Teja plana marsellesa o alicantina', minSlopePct: 40, mappedSystems: ['teja_plana'] },
  { id: 'teja_plana_encaje', label: 'Teja plana con encaje', minSlopePct: 50, mappedSystems: ['teja_encaje'] },
  { id: 'pizarra', label: 'Pizarra', minSlopePct: 60, mappedSystems: ['pizarra'] },
  { id: 'cinc', label: 'Cinc', minSlopePct: 10, mappedSystems: ['zinc'] },
  { id: 'fibrocemento_onda_grande', label: 'Placa simétrica de fibrocemento, onda grande', minSlopePct: 10, mappedSystems: [] },
  { id: 'asimetrica_nerv_grande', label: 'Placa asimétrica, nervadura grande', minSlopePct: 10, mappedSystems: ['chapa_metalica', 'panel_sandwich'] },
  { id: 'asimetrica_nerv_media', label: 'Placa asimétrica, nervadura media', minSlopePct: 25, mappedSystems: [] },
  { id: 'sintetico_ond_grande', label: 'Perfil sintético, ondulado grande', minSlopePct: 10, mappedSystems: [] },
  { id: 'sintetico_ond_peq', label: 'Perfil sintético, ondulado pequeño', minSlopePct: 15, mappedSystems: [] },
  { id: 'sintetico_grec_grande', label: 'Perfil sintético, grecado grande', minSlopePct: 5, mappedSystems: [] },
  { id: 'sintetico_grec_medio', label: 'Perfil sintético, grecado medio', minSlopePct: 8, mappedSystems: [] },
];

export interface Tabla29Entry {
  usage: FlatRoofUsage;
  label: string;
  minSlopePct: number;
  maxSlopePct: number;
  note: string;
}

/**
 * CTE DB-HS 1 · Tabla 2.9: Pendientes de cubiertas planas
 */
export const TABLA_29_CUBIERTAS_PLANAS: Tabla29Entry[] = [
  {
    usage: 'transitable_fijo',
    label: 'Transitable · Peatones (solado fijo)',
    minSlopePct: 1,
    maxSlopePct: 5,
    note: '(1) Para rampas no se aplica el límite máximo del 5%.',
  },
  {
    usage: 'transitable_flotante',
    label: 'Transitable · Peatones (solado flotante)',
    minSlopePct: 1,
    maxSlopePct: 5,
    note: 'Formación de pendientes bajo pavimento sobre soportes regulables.',
  },
  {
    usage: 'transitable_vehiculos',
    label: 'Transitable · Vehículos (capa de rodadura)',
    minSlopePct: 1,
    maxSlopePct: 5,
    note: '(1) Para rampas no se aplica el límite máximo del 5%.',
  },
  {
    usage: 'no_transitable_grava',
    label: 'No transitable · Protección con grava',
    minSlopePct: 1,
    maxSlopePct: 5,
    note: 'Capa de grava limpia Ø 16-32 mm (e >= 5 cm).',
  },
  {
    usage: 'no_transitable_autoprotegida',
    label: 'No transitable · Lámina autoprotegida',
    minSlopePct: 1,
    maxSlopePct: 15,
    note: 'Admite mayor pendiente según adhesión y fijación de la lámina.',
  },
  {
    usage: 'ajardinada',
    label: 'Ajardinada · Tierra vegetal',
    minSlopePct: 1,
    maxSlopePct: 5,
    note: 'Requiere lámina antirraíces y capa drenante/filtrante.',
  },
];

/**
 * CTE DB-HE 1 · Tabla 3.1.1.a-HE1: Valores límite de transmitancia térmica de cubiertas U_lim (W/m²·K)
 */
export const TABLA_ULIM_CUBIERTA_HE1: Record<'alpha' | 'A' | 'B' | 'C' | 'D' | 'E', number> = {
  alpha: 0.55,
  A: 0.50,
  B: 0.44,
  C: 0.40,
  D: 0.35,
  E: 0.33,
};

/**
 * CTE DB-SE-AE · Presión dinámica básica del viento qb (kN/m²) por zona eólica
 */
export const WIND_QB_KN_M2: Record<'A' | 'B' | 'C', number> = {
  A: 0.42, // 26 m/s
  B: 0.45, // 27 m/s
  C: 0.52, // 29 m/s
};
