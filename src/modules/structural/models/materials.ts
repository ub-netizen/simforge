/**
 * Material presets for truss members: elastic modulus and yield strength.
 *
 * These are standard nominal values for preliminary analysis and teaching.
 * Real design must use the values (and partial safety factors) of the
 * governing specification, which can depend on product form and thickness.
 */

export interface MaterialPreset {
  id: string;
  name: string;
  /** Young's modulus, Pa. */
  E: number;
  /** Yield (or 0.2% proof) strength, Pa. */
  yieldStrength: number;
  source: string;
}

export const MATERIALS: readonly MaterialPreset[] = [
  {
    id: 'steel-a36',
    name: 'Steel ASTM A36',
    E: 200e9,
    yieldStrength: 250e6,
    source: 'ASTM A36: minimum yield 36 ksi (250 MPa); E ≈ 200 GPa',
  },
  {
    id: 'steel-s355',
    name: 'Steel EN S355',
    E: 210e9,
    yieldStrength: 355e6,
    source: 'EN 1993-1-1 Table 3.1: f_y = 355 MPa for t ≤ 40 mm; E = 210 GPa',
  },
  {
    id: 'stainless-304',
    name: 'Stainless 304 (annealed)',
    E: 193e9,
    yieldStrength: 215e6,
    source: 'ASM data for annealed 304: yield ≈ 215 MPa; E ≈ 193 GPa',
  },
  {
    id: 'al-6061-t6',
    name: 'Aluminium 6061-T6',
    E: 68.9e9,
    yieldStrength: 276e6,
    source: 'ASM data for 6061-T6: yield 276 MPa; E 68.9 GPa',
  },
  {
    id: 'ti-6al-4v',
    name: 'Ti-6Al-4V (annealed)',
    E: 113.8e9,
    yieldStrength: 880e6,
    source: 'ASM data for Ti-6Al-4V (grade 5, annealed): yield 880 MPa; E 113.8 GPa',
  },
];

export function getMaterial(id: string | undefined): MaterialPreset | undefined {
  return id === undefined ? undefined : MATERIALS.find((m) => m.id === id);
}
