# Exact-package offline PBIP binding

## Generate, verify, then open

After the release owner builds the intended package:

```powershell
npm run sample:bind
node scripts\bind-samples.mjs --verify
```

The generator reads **only the GUID/version selected by `pbiviz.json`**, through
`scripts\package-lib.mjs` `readPackage()`. It does not choose the newest wildcard
match, compile anything, download a visual, invoke Desktop, or publish a report.
A missing, mismatched, or unsupported package fails the command.

The complete generated project is:

```text
dist\sample\
  binding-manifest.json
  README.md
  people-hours-by-week.csv
  machine-hours-by-day.csv
  docs\sample-binding.md
  AtlynResourceCapacity\
    AtlynResourceCapacity.pbip
    AtlynResourceCapacity.SemanticModel\...
    AtlynResourceCapacity.Report\
      definition.pbir
      definition\...
      CustomVisuals\
        AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2\
          package.json
          resources\
            AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2.pbiviz.json
```

`samples\AtlynResourceCapacity` is the **fully bound definition template**, not
the runnable package-bearing deliverable. The generator copies it into ignored
`dist\sample`, then writes the archive entries byte-for-byte. This keeps the
compiled JavaScript, CSS, embedded icon, capabilities, and localization resources
out of source control while making the generated PBIP self-contained. It neither
substitutes a native visual nor requires a developer server. The original ZIP's
SHA-256, GUID, version, byte length, and each generated file's SHA-256 are recorded
in `binding-manifest.json`. Extracted bytes are compared against the same package
again after generation and by `--verify`.

The default generation and verification commands are **offline**. They require
the repository's already-installed Node dependencies, source files, and local
compiled package. They do not invoke a gateway, tenant, cloud semantic model,
GitHub workflow, or Power BI service. Re-running generation replaces only the
generated output. Identical inputs and options produce identical output bytes;
there is no timestamp or absolute-machine path in the manifest.

## Serialization evidence, not an invented format

1. [Microsoft Learn: project report folder](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report)
   explicitly documents `CustomVisuals` as the location for **private** custom
   visuals loaded from `.pbiviz` files. AppSource and organization-store visuals
   use different mechanisms; neither is used here.
2. The official [PBIR report 2.0.0 schema](https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.0.0/schema.json)
   defines `resourcePackages`, `type: "CustomVisual"`, and
   `type: "CustomVisualMetadata"`. The
   [visual-container 2.1.0 schema](https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.1.0/schema.json)
   links the schemas for visual types, query-state projections and formatting
   expressions.
3. A pinned, publicly inspectable imported-visual example is
   [ProdataSQL/FinancialModelling at ec738ceb6a801f416b88b93c1dcfddbbe89426b7](https://github.com/ProdataSQL/FinancialModelling/tree/ec738ceb6a801f416b88b93c1dcfddbbe89426b7/Workspace/Finance-GL.Report/CustomVisuals).
   Its [package manifest](https://github.com/ProdataSQL/FinancialModelling/blob/ec738ceb6a801f416b88b93c1dcfddbbe89426b7/Workspace/Finance-GL.Report/CustomVisuals/powerKPIMatrixEB2381CC88A8425FBEB1B07FF57784E6/package.json)
   points to `resources/<GUID>.pbiviz.json`; its
   [report definition](https://github.com/ProdataSQL/FinancialModelling/blob/ec738ceb6a801f416b88b93c1dcfddbbe89426b7/Workspace/Finance-GL.Report/definition/report.json)
   registers the metadata item's **basename**, not `resources/...`:

   ```json
   {
     "name": "<GUID>",
     "type": "CustomVisual",
     "items": [{
       "name": "<GUID>.pbiviz.json",
       "path": "<GUID>.pbiviz.json",
       "type": "CustomVisualMetadata"
     }]
   }
   ```

This is the exact registration/extraction pattern implemented here. The example
is evidence of the file structure, **not** a runtime dependency or a copied
third-party visual. Only this repository's compiled visual is embedded. The
generator deliberately rejects a different package-resource layout rather than
guessing how an unverified resource type should be serialized.

## Bound pages and field contract

All four pages are 1280 × 720, with a 1216 × 640 visual inset 32 pixels.
The custom visuals use a 160-pixel cell width, 12-pixel font, left-to-right layout,
`analysis.unit = 'hours'`, and `analysis.additiveTotals = true`. Additive totals
are an explicit assertion justified by these nonoverlapping weekly/daily source
amounts, not by arbitrary production data. Missing capacity still suppresses a
resource total; individual overloaded periods remain visible.

| Page | Visual | Data |
|---|---|---|
| People · capacity grid (initial page) | Actual package GUID | 3 resources × 4 weeks |
| People · weekly hours | Retained native `tableEx` comparison | The same 12 People rows |
| Machines · capacity grid | Actual package GUID | 3 machines × 5 days |
| Machines · daily hours | Retained native `tableEx` comparison | The same 15 Machines rows |

Both grids project all seven capability roles:

| Role | People | Machines |
|---|---|---|
| `resource` | `People[Resource]` | `Machines[Resource]` |
| `period` | `People[Period]` | `Machines[Period]` |
| `allocated` | `[Allocated hours]` | `[Machine allocated hours]` |
| `capacity` | `[Available hours]` | `[Machine available hours]` |
| `periodOrder` | `[Period order]` | `[Machine period order]` |
| `nonworking` | `[Nonworking flag]` | `[Machine nonworking flag]` |
| `tooltips` | `[Assignment count]`, `[Source rows]` | `[Machine assignment count]`, `[Machine source rows]` |

Dates are direct columns, not date hierarchies. Query sort expressions use
ascending period-order measure, then resource. Measures remain globally unique,
numeric leaf amounts remain guarded by `COUNTROWS(table) = 1`, and source numeric
columns stay hidden. Literal-M import partitions match the accompanying CSVs;
refresh does not read those CSV files. See the sample README's expected cases.

## Local evidence and remaining native gates

```powershell
npx vitest run tests\bound-samples.test.ts tests\samples.test.ts
node scripts\bind-samples.mjs --validate-schemas
node scripts\bind-samples.mjs --verify
```

`--validate-schemas` is the **optional online** validation step. It downloads only
public, versioned Microsoft JSON schemas, validates every project/report JSON
document using the existing Ajv dependency, and records schema URL/hash pairs.
It sends no report, model, package, or other private content to those URLs.
Schema download/validation failure is a command failure, never a silently
successful check. A default offline regeneration correctly records this check as
`not-run` rather than inheriting an earlier success.

Always rebind after the final package build, then verify against that package
before freezing the whole `dist\sample` directory with immutable release evidence.
The unit tests use explicitly labeled synthetic archive fixtures to exercise the
generator without requiring a build; those fixtures are not deliverables.

**No actual Desktop validation is claimed.** JSON Schema checks, resolvable
references, literal data inspection, and byte identity cannot prove Desktop
compatibility or host behavior. The release owner must still:

1. Copy the generated sample to a writable short path and open its `.pbip` in a
   supported Desktop version (enable PBIP/TMDL/PBIR support if required).
2. Refresh the literal-M model; confirm 12 People rows and 15 Machines rows with
   no external credentials or source prompts.
3. Confirm both grids render the embedded release version without importing
   another package; compare key cases and tooltip values with the native tables.
4. Check sizing, selection, keyboard access, tooltips, filtering, and intended
   totals/missing/nonworking behavior.
5. Save, close, reopen, and confirm package and bindings survive. Record the
   Desktop version and results. Save a real `.pbix` only through Desktop if needed.
6. Complete service/export/accessibility and submission checks separately.

If Desktop rejects the generated private-visual serialization, report that as a
native gate failure, retain the failing generated project and manifest, and
compare a Desktop-imported save against the documented structure. Do not replace
the grid with a placeholder or describe static checks as native acceptance.
