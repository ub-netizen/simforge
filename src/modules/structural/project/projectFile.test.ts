import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../examples/examples';
import { PROJECT_VERSION, parseProject, parseProjectText, serializeProject, slugify } from './projectFile';

const example = EXAMPLES.find((e) => e.id === 'warren')!;
const valid = () => JSON.parse(serializeProject({ name: example.title, model: example.model }));

const errorsOf = (data: unknown) => {
  const r = parseProject(data);
  if (r.ok) throw new Error('expected failure');
  return r.errors.join('\n');
};

describe('project files', () => {
  it('round-trips every example exactly', () => {
    for (const e of EXAMPLES) {
      const r = parseProjectText(serializeProject({ name: e.title, model: e.model }));
      expect(r).toEqual({ ok: true, project: { name: e.title, model: e.model } });
    }
  });

  it('round-trips settlements and custom materials', () => {
    const model = {
      nodes: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: 1.5, y: -2 },
      ],
      members: [{ id: 'm', nodeI: 'A', nodeJ: 'B', E: 70e9, A: 3e-4, yieldStrength: 1.2e8 }],
      supports: [{ nodeId: 'A', restrainX: true, restrainY: true, settlementY: -0.002 }],
      loads: [{ nodeId: 'B', fx: 1, fy: -2 }],
    };
    expect(parseProjectText(serializeProject({ name: 'x', model }))).toEqual({ ok: true, project: { name: 'x', model } });
  });

  it('writes format, version and SI units', () => {
    const d = valid();
    expect(d).toMatchObject({ format: 'simforge.truss', version: PROJECT_VERSION, units: { force: 'N', length: 'm' } });
  });

  it('rejects text that is not JSON or not a project', () => {
    expect(parseProjectText('{nope')).toMatchObject({ ok: false });
    expect(errorsOf([])).toMatch(/project object/);
    expect(errorsOf({ format: 'other' })).toMatch(/Not a SimForge truss project/);
  });

  it('rejects newer file versions with a clear message', () => {
    expect(errorsOf({ ...valid(), version: PROJECT_VERSION + 1 })).toMatch(/version 2.*supports up to version 1/);
    expect(errorsOf({ ...valid(), version: 'one' })).toMatch(/version/);
  });

  it('rejects non-SI units', () => {
    expect(errorsOf({ ...valid(), units: { force: 'kN' } })).toMatch(/units other than SI/);
  });

  it('reports malformed items', () => {
    const d = valid();
    d.model.nodes[0].x = 'zero';
    d.model.members[1].E = -5;
    d.model.loads[0].fy = null;
    const msg = errorsOf(d);
    expect(msg).toMatch(/Node 1/);
    expect(msg).toMatch(/Member "M2".*positive/);
    expect(msg).toMatch(/Load 1/);
  });

  it('rejects dangling references, duplicates and self-loops', () => {
    const d = valid();
    d.model.members.push({ id: 'M1', nodeI: 'N1', nodeJ: 'N99', E: 1, A: 1 });
    d.model.members.push({ id: 'Mx', nodeI: 'N2', nodeJ: 'N2', E: 1, A: 1 });
    d.model.members.push({ id: 'My', nodeI: 'N2', nodeJ: 'N1', E: 1, A: 1 }); // same pair as M1
    d.model.supports.push({ nodeId: 'N1', restrainX: true, restrainY: false });
    d.model.loads.push({ nodeId: 'N42', fx: 0, fy: 0 });
    const msg = errorsOf(d);
    for (const re of [/Duplicate member id "M1"/, /missing node "N99"/, /to itself/, /More than one member/, /more than one support/, /missing node "N42"/])
      expect(msg).toMatch(re);
  });

  it('rejects settlements on unrestrained directions', () => {
    const d = valid();
    d.model.supports[1] = { nodeId: d.model.supports[1].nodeId, restrainX: false, restrainY: true, settlementX: 0.01 };
    expect(errorsOf(d)).toMatch(/settlementX/);
  });

  it('ignores unknown fields and defaults the name', () => {
    const d = { ...valid(), name: '  ', extra: true };
    d.model.nodes[0].colour = 'red';
    const r = parseProject(d);
    expect(r.ok && r.project.name).toBe('Untitled truss');
    expect(r.ok && r.project.model.nodes[0]).toEqual({ id: 'N1', x: 0, y: 0 });
  });

  it('caps long error lists', () => {
    const d = valid();
    d.model.nodes = Array.from({ length: 20 }, () => ({}));
    const r = parseProject(d);
    expect(!r.ok && r.errors).toHaveLength(9);
  });
});

describe('slugify', () => {
  it('makes safe file names', () => {
    expect(slugify('Warren bridge truss')).toBe('warren-bridge-truss');
    expect(slugify('  Ünïcode / test #2 ')).toBe('unicode-test-2');
    expect(slugify('***')).toBe('truss');
  });
});
