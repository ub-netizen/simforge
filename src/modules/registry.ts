/**
 * Catalogue of SimForge simulators. The homepage library and routing read
 * from this list, so adding a simulator starts here.
 *
 * `status` must stay honest:
 *   - 'available'      the simulator is functional and validated
 *   - 'in-development' the workspace exists but the solver is not finished
 *   - 'planned'        on the roadmap; nothing is implemented yet
 */

export type ModuleStatus = 'available' | 'in-development' | 'planned';

export type Discipline = 'Structural' | 'Fluids' | 'Mechanisms' | 'Aerodynamics';

export type ModuleIcon = 'truss' | 'beam' | 'flow' | 'linkage' | 'airfoil';

export interface SimulatorModule {
  id: string;
  name: string;
  discipline: Discipline;
  summary: string;
  method: string;
  status: ModuleStatus;
  icon: ModuleIcon;
  /** App route for modules that have a workspace. */
  path?: string;
}

export const MODULES: readonly SimulatorModule[] = [
  {
    id: 'truss-2d',
    name: '2D Truss Analysis',
    discipline: 'Structural',
    summary:
      'Pin-jointed plane trusses: nodal displacements, member forces, axial stresses and support reactions.',
    method: 'Direct stiffness method, linear elastic',
    status: 'available',
    icon: 'truss',
    path: '/structural/truss',
  },
  {
    id: 'beam',
    name: 'Beam Analysis',
    discipline: 'Structural',
    summary: 'Shear force, bending moment and deflection for statically determinate and indeterminate beams.',
    method: 'Euler–Bernoulli beam elements',
    status: 'planned',
    icon: 'beam',
  },
  {
    id: 'fluid-2d',
    name: 'Interactive Fluid Flow',
    discipline: 'Fluids',
    summary: 'Place obstacles in a 2D channel and visualise velocity and vorticity fields.',
    method: 'Lattice Boltzmann (planned)',
    status: 'planned',
    icon: 'flow',
  },
  {
    id: 'mechanisms',
    name: 'Mechanism Kinematics',
    discipline: 'Mechanisms',
    summary: 'Four-bar linkages, slider-cranks and gear trains with position, velocity and acceleration.',
    method: 'Loop-closure kinematics',
    status: 'planned',
    icon: 'linkage',
  },
  {
    id: 'airfoil',
    name: 'Airfoil Aerodynamics',
    discipline: 'Aerodynamics',
    summary: 'NACA airfoil generation, pressure coefficient distribution and lift estimation.',
    method: 'Panel method (planned)',
    status: 'planned',
    icon: 'airfoil',
  },
];

export function getModule(id: string): SimulatorModule | undefined {
  return MODULES.find((m) => m.id === id);
}
