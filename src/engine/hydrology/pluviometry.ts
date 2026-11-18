import type { ProjectLocation } from '../../types/roof';

export interface MunicipalityPreset {
  municipality: string;
  province: string;
  pluviometricZone: 'A' | 'B';
  isohyet: number;
  climateZoneWinter: 'alpha' | 'A' | 'B' | 'C' | 'D' | 'E';
  altitudeM: number;
  snowLoadKnM2: number; // DB-SE-AE Anejo E capital ref
  windZone: 'A' | 'B' | 'C';
}

/**
 * CTE DB-HS 5 · Apéndice B · Tabla B.1: Intensidad pluviométrica i (mm/h)
 */
export const TABLA_B1_INTENSIDAD: Record<'A' | 'B', Record<number, number>> = {
  A: {
    10: 30,
    20: 65,
    30: 90,
    40: 125,
    50: 155,
    60: 180,
    70: 210,
    80: 240,
    90: 275,
    100: 300,
    110: 330,
    120: 365,
  },
  B: {
    10: 30,
    20: 50,
    30: 70,
    40: 90,
    50: 110,
    60: 135,
    70: 150,
    80: 170,
    90: 195,
    100: 220,
    110: 240,
    120: 265,
  },
};

export function lookupTablaB1(zone: 'A' | 'B', isohyet: number): number {
  const row = TABLA_B1_INTENSIDAD[zone];
  const keys = Object.keys(row)
    .map(Number)
    .sort((a, b) => a - b);
  if (row[isohyet] !== undefined) return row[isohyet];
  if (isohyet <= keys[0]) return row[keys[0]];
  if (isohyet >= keys[keys.length - 1]) return row[keys[keys.length - 1]];
  // Linear interpolation between adjacent official isohyets
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (isohyet >= k0 && isohyet <= k1) {
      const t = (isohyet - k0) / (k1 - k0);
      return Math.round(row[k0] + t * (row[k1] - row[k0]));
    }
  }
  return 100;
}

/**
 * Representative Spanish municipalities & provincial capitals with CTE DB-HS Apéndice B,
 * DB-HE Anejo B and DB-SE-AE reference parameters.
 */
export const MUNICIPALITY_PRESETS: MunicipalityPreset[] = [
  { municipality: 'Sevilla', province: 'Sevilla', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'B', altitudeM: 11, snowLoadKnM2: 0.2, windZone: 'B' },
  { municipality: 'Madrid', province: 'Madrid', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 657, snowLoadKnM2: 0.6, windZone: 'A' },
  { municipality: 'Barcelona', province: 'Barcelona', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'C', altitudeM: 12, snowLoadKnM2: 0.4, windZone: 'C' },
  { municipality: 'Valencia', province: 'Valencia', pluviometricZone: 'B', isohyet: 50, climateZoneWinter: 'B', altitudeM: 15, snowLoadKnM2: 0.2, windZone: 'B' },
  { municipality: 'Málaga', province: 'Málaga', pluviometricZone: 'B', isohyet: 50, climateZoneWinter: 'A', altitudeM: 11, snowLoadKnM2: 0.2, windZone: 'B' },
  { municipality: 'Bilbao', province: 'Bizkaia', pluviometricZone: 'A', isohyet: 50, climateZoneWinter: 'C', altitudeM: 19, snowLoadKnM2: 0.3, windZone: 'C' },
  { municipality: 'Zaragoza', province: 'Zaragoza', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 208, snowLoadKnM2: 0.5, windZone: 'B' },
  { municipality: 'A Coruña', province: 'A Coruña', pluviometricZone: 'A', isohyet: 50, climateZoneWinter: 'C', altitudeM: 26, snowLoadKnM2: 0.3, windZone: 'C' },
  { municipality: 'Vigo', province: 'Pontevedra', pluviometricZone: 'A', isohyet: 60, climateZoneWinter: 'C', altitudeM: 28, snowLoadKnM2: 0.3, windZone: 'C' },
  { municipality: 'Santiago de Compostela', province: 'A Coruña', pluviometricZone: 'A', isohyet: 70, climateZoneWinter: 'D', altitudeM: 260, snowLoadKnM2: 0.4, windZone: 'C' },
  { municipality: 'Córdoba', province: 'Córdoba', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'B', altitudeM: 106, snowLoadKnM2: 0.2, windZone: 'A' },
  { municipality: 'Granada', province: 'Granada', pluviometricZone: 'B', isohyet: 30, climateZoneWinter: 'C', altitudeM: 685, snowLoadKnM2: 0.5, windZone: 'A' },
  { municipality: 'Cádiz', province: 'Cádiz', pluviometricZone: 'B', isohyet: 50, climateZoneWinter: 'A', altitudeM: 11, snowLoadKnM2: 0.2, windZone: 'C' },
  { municipality: 'Huelva', province: 'Huelva', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'A', altitudeM: 24, snowLoadKnM2: 0.2, windZone: 'B' },
  { municipality: 'Almería', province: 'Almería', pluviometricZone: 'B', isohyet: 30, climateZoneWinter: 'A', altitudeM: 23, snowLoadKnM2: 0.2, windZone: 'B' },
  { municipality: 'Jaén', province: 'Jaén', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'C', altitudeM: 573, snowLoadKnM2: 0.4, windZone: 'A' },
  { municipality: 'Murcia', province: 'Murcia', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'B', altitudeM: 43, snowLoadKnM2: 0.2, windZone: 'B' },
  { municipality: 'Alicante', province: 'Alicante', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'B', altitudeM: 8, snowLoadKnM2: 0.2, windZone: 'B' },
  { municipality: 'Castellón de la Plana', province: 'Castellón', pluviometricZone: 'B', isohyet: 50, climateZoneWinter: 'B', altitudeM: 30, snowLoadKnM2: 0.2, windZone: 'B' },
  { municipality: 'Palma', province: 'Illes Balears', pluviometricZone: 'B', isohyet: 50, climateZoneWinter: 'B', altitudeM: 13, snowLoadKnM2: 0.2, windZone: 'C' },
  { municipality: 'Las Palmas de Gran Canaria', province: 'Las Palmas', pluviometricZone: 'B', isohyet: 30, climateZoneWinter: 'alpha', altitudeM: 8, snowLoadKnM2: 0.0, windZone: 'C' },
  { municipality: 'Santa Cruz de Tenerife', province: 'S. C. Tenerife', pluviometricZone: 'B', isohyet: 30, climateZoneWinter: 'alpha', altitudeM: 10, snowLoadKnM2: 0.0, windZone: 'C' },
  { municipality: 'Valladolid', province: 'Valladolid', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 698, snowLoadKnM2: 0.4, windZone: 'A' },
  { municipality: 'Burgos', province: 'Burgos', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'E', altitudeM: 859, snowLoadKnM2: 0.6, windZone: 'B' },
  { municipality: 'León', province: 'León', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'E', altitudeM: 838, snowLoadKnM2: 1.0, windZone: 'B' },
  { municipality: 'Salamanca', province: 'Salamanca', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 802, snowLoadKnM2: 0.5, windZone: 'A' },
  { municipality: 'Ávila', province: 'Ávila', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'E', altitudeM: 1131, snowLoadKnM2: 1.0, windZone: 'A' },
  { municipality: 'Segovia', province: 'Segovia', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 1002, snowLoadKnM2: 0.7, windZone: 'A' },
  { municipality: 'Soria', province: 'Soria', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'E', altitudeM: 1063, snowLoadKnM2: 0.7, windZone: 'B' },
  { municipality: 'Palencia', province: 'Palencia', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 749, snowLoadKnM2: 0.4, windZone: 'A' },
  { municipality: 'Zamora', province: 'Zamora', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 652, snowLoadKnM2: 0.4, windZone: 'A' },
  { municipality: 'Toledo', province: 'Toledo', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'C', altitudeM: 529, snowLoadKnM2: 0.5, windZone: 'A' },
  { municipality: 'Ciudad Real', province: 'Ciudad Real', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'C', altitudeM: 628, snowLoadKnM2: 0.6, windZone: 'A' },
  { municipality: 'Albacete', province: 'Albacete', pluviometricZone: 'B', isohyet: 30, climateZoneWinter: 'D', altitudeM: 686, snowLoadKnM2: 0.6, windZone: 'A' },
  { municipality: 'Cuenca', province: 'Cuenca', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 946, snowLoadKnM2: 0.7, windZone: 'A' },
  { municipality: 'Guadalajara', province: 'Guadalajara', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 708, snowLoadKnM2: 0.6, windZone: 'A' },
  { municipality: 'Badajoz', province: 'Badajoz', pluviometricZone: 'B', isohyet: 30, climateZoneWinter: 'C', altitudeM: 185, snowLoadKnM2: 0.2, windZone: 'A' },
  { municipality: 'Cáceres', province: 'Cáceres', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'C', altitudeM: 459, snowLoadKnM2: 0.4, windZone: 'A' },
  { municipality: 'Oviedo', province: 'Asturias', pluviometricZone: 'A', isohyet: 50, climateZoneWinter: 'C', altitudeM: 232, snowLoadKnM2: 0.5, windZone: 'C' },
  { municipality: 'Santander', province: 'Cantabria', pluviometricZone: 'A', isohyet: 50, climateZoneWinter: 'C', altitudeM: 15, snowLoadKnM2: 0.3, windZone: 'C' },
  { municipality: 'San Sebastián', province: 'Gipuzkoa', pluviometricZone: 'A', isohyet: 60, climateZoneWinter: 'D', altitudeM: 6, snowLoadKnM2: 0.3, windZone: 'C' },
  { municipality: 'Vitoria-Gasteiz', province: 'Álava', pluviometricZone: 'A', isohyet: 40, climateZoneWinter: 'D', altitudeM: 525, snowLoadKnM2: 0.7, windZone: 'B' },
  { municipality: 'Pamplona', province: 'Navarra', pluviometricZone: 'A', isohyet: 40, climateZoneWinter: 'D', altitudeM: 449, snowLoadKnM2: 0.7, windZone: 'B' },
  { municipality: 'Logroño', province: 'La Rioja', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 384, snowLoadKnM2: 0.5, windZone: 'B' },
  { municipality: 'Huesca', province: 'Huesca', pluviometricZone: 'A', isohyet: 40, climateZoneWinter: 'D', altitudeM: 488, snowLoadKnM2: 0.7, windZone: 'B' },
  { municipality: 'Teruel', province: 'Teruel', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 915, snowLoadKnM2: 0.7, windZone: 'A' },
  { municipality: 'Girona', province: 'Girona', pluviometricZone: 'B', isohyet: 50, climateZoneWinter: 'D', altitudeM: 70, snowLoadKnM2: 0.4, windZone: 'C' },
  { municipality: 'Lleida', province: 'Lleida', pluviometricZone: 'A', isohyet: 30, climateZoneWinter: 'D', altitudeM: 155, snowLoadKnM2: 0.4, windZone: 'B' },
  { municipality: 'Tarragona', province: 'Tarragona', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'B', altitudeM: 69, snowLoadKnM2: 0.2, windZone: 'C' },
  { municipality: 'Lugo', province: 'Lugo', pluviometricZone: 'A', isohyet: 50, climateZoneWinter: 'D', altitudeM: 465, snowLoadKnM2: 0.5, windZone: 'B' },
  { municipality: 'Ourense', province: 'Ourense', pluviometricZone: 'A', isohyet: 50, climateZoneWinter: 'C', altitudeM: 139, snowLoadKnM2: 0.4, windZone: 'B' },
  { municipality: 'Pontevedra', province: 'Pontevedra', pluviometricZone: 'A', isohyet: 60, climateZoneWinter: 'C', altitudeM: 20, snowLoadKnM2: 0.3, windZone: 'C' },
  { municipality: 'Ceuta', province: 'Ceuta', pluviometricZone: 'B', isohyet: 50, climateZoneWinter: 'A', altitudeM: 10, snowLoadKnM2: 0.0, windZone: 'C' },
  { municipality: 'Melilla', province: 'Melilla', pluviometricZone: 'B', isohyet: 40, climateZoneWinter: 'A', altitudeM: 30, snowLoadKnM2: 0.0, windZone: 'C' },
];

export function buildLocationFromPreset(preset: MunicipalityPreset): ProjectLocation {
  return {
    municipality: preset.municipality,
    province: preset.province,
    pluviometricZone: preset.pluviometricZone,
    isohyet: preset.isohyet,
    rainIntensityMmH: lookupTablaB1(preset.pluviometricZone, preset.isohyet),
    climateZoneWinter: preset.climateZoneWinter,
    altitudeM: preset.altitudeM,
    snowLoadKnM2: preset.snowLoadKnM2,
    windZone: preset.windZone,
    indoorTempC: 20,
    indoorRhPct: 55,
    outdoorTempC: preset.climateZoneWinter === 'E' ? 0 : preset.climateZoneWinter === 'D' ? 3 : 7,
    outdoorRhPct: 80,
  };
}
