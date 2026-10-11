# SimForge truss project format

SimForge saves truss models as JSON files with the extension `.simforge.json`
(**File → Save project** or ⌘/Ctrl+S). The same format is used for the copy kept
in the browser's local storage.

## Example

```json
{
  "format": "simforge.truss",
  "version": 1,
  "name": "3-4-5 triangle",
  "createdWith": "SimForge 0.1.0-dev",
  "units": { "length": "m", "force": "N", "modulus": "Pa", "area": "m^2", "stress": "Pa" },
  "model": {
    "nodes": [
      { "id": "N1", "x": 0, "y": 0 },
      { "id": "N2", "x": 4, "y": 0 },
      { "id": "N3", "x": 4, "y": 3 }
    ],
    "members": [
      { "id": "M1", "nodeI": "N1", "nodeJ": "N2", "E": 200000000000, "A": 0.001,
        "material": "steel-a36", "yieldStrength": 250000000 }
    ],
    "supports": [
      { "nodeId": "N1", "restrainX": true, "restrainY": true },
      { "nodeId": "N2", "restrainX": false, "restrainY": true, "settlementY": -0.001 }
    ],
    "loads": [{ "nodeId": "N3", "fx": 10000, "fy": 0 }]
  }
}
```

## Fields

All values are **SI**: m, N, Pa, m². The interface shows kN, GPa, mm² and MPa, but
files always store SI.

| Field | Type | Notes |
| --- | --- | --- |
| `format` | `"simforge.truss"` | Required. |
| `version` | integer | Required. Currently `1`. Files from a newer version are rejected with a message rather than misread. |
| `name` | string | Optional. Defaults to "Untitled truss". |
| `units` | object | Optional. If present it must declare SI. |
| `model.nodes[]` | `{ id, x, y }` | Unique text ids. |
| `model.members[]` | `{ id, nodeI, nodeJ, E, A, material?, yieldStrength? }` | `E` and `A` positive. `yieldStrength` (Pa) is optional and used only for the factor of safety. `material` is a preset id (see `materials.ts`). |
| `model.supports[]` | `{ nodeId, restrainX, restrainY, settlementX?, settlementY? }` | At most one per node. A settlement (m) requires its direction to be restrained. |
| `model.loads[]` | `{ nodeId, fx, fy }` | N, at most one per node, positive in +x / +y. |

## Validation on import

A file is either loaded completely or rejected with a list of problems. Partial
models are never loaded. The importer rejects:

- malformed values
- duplicate ids
- references to missing nodes
- members connecting a node to itself
- two members between the same pair of nodes
- more than one support or load on a node

Unknown extra fields are ignored. Engineering checks, such as stability, happen
when the model is analysed, not on import.

## Independent cross-check

[`scripts/crosscheck_truss.py`](../scripts/crosscheck_truss.py) (Python standard
library only) solves a project file with a separate implementation. It optionally
compares the result with a member-forces CSV exported from SimForge:

```bash
python3 scripts/crosscheck_truss.py my-truss.simforge.json my-truss-member-forces.csv
```
