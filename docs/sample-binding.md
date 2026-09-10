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

### Official TOM preflight and the provisional retry

The shared Desktop preflight exposed a gap that JSON Schema validation cannot
detect: `ref table` declarations in `model.tmdl` must be top-level, not indented
under `model Model`. Capacity had this defect. Official Microsoft TOM
19.117.0 reproduced `InvalidLineType / ReferenceObject` on the original model
and deserialized both corrected tables after removing the indentation.
Capacity already had PBIR `definition\version.json` with version `2.0.0`;
the validator now explicitly requires it and both top-level table references.
Regression tests reject missing/invalid version metadata and indented/missing
table references.

Use an existing official TOM installation, retaining its sibling DLLs:

```powershell
pwsh -NoProfile -File scripts\validate-sample-tom.ps1 `
  -TomAssembly 'C:\path\to\Microsoft.AnalysisServices.Tabular.dll'
```

The command does not install tools, connect to a server, execute M/DAX or operate
Desktop. `-Definition` can point to the generated sample's semantic-model
`definition` directory. `CAPACITY_TOM_ASSEMBLY` can supply the assembly path.
It checks both tables, their seven columns/six measures and single M partitions,
and records the assembly version/hash and PowerShell/.NET versions. Missing TOM
or deserialization/shape errors fail rather than imply native compatibility.

The sealed rendering-evidence bundle at source `fb6631b8c540` is **unchanged**.
The corrected sample is a **distinct provisional native-preflight retry**, using
the same `1.0.1.0` package SHA-256
`0f927e88f501a9351f4f5249dd93186bd768ba36fee8f188147e5fd9ec8e55c0`.
It is not a rebuilt visual, certification submission or replacement of sealed
evidence. The parent preserved the corrected 36-file retry durably and is
preparing native PBIX evidence using an editable copy. The 2026-09-10 owner
decision confirms storefront subscriptions with ungated runtime/free shared
viewing, so this offline renderer needs no licensing integration. Native/final
asset acceptance and the parent's main/certification/merge/submission gate remain
in force. No version or package change accompanies this documentation update.

### Later native date-key retry (1.0.2.0)

The parent subsequently reported that Desktop 2.157.1354.0 opened and refreshed
the corrected model, but the visual rejected valid People Date keys. Local
cross-frame Date tests reproduced the exact rejection in 1.0.1.0. Version
**1.0.2.0** corrects that runtime defect without changing sample rows, `#date`
values, direct Period projections or the approved ungated runtime model.

Use the new **distinct** `dist\capacity-native-retry-20260910-2\sample` and its
binding manifest, not either historical 1.0.1.0 folder. The retry root retains
the exact new package/hash, source and evidence manifest. The earlier 59-file
sealed bundle and 36-file sample-only retry remain unchanged. See
[date-key evidence](quality-evidence.md#native-date-key-correction-1020).
The parent must retry the native grids using an editable copy; prior model
refresh or local cross-frame rendering is not native acceptance of this package.

The parent's subsequent 1.0.2.0 retry still reports the key error. A separate
local-only **1.0.3.0 diagnostic** sample is under
`dist\capacity-native-diagnostic-20260910-3\sample`, with its own package/hash
and evidence. It retains the same rows, model and direct Period projections.
Its error reports the compiled version plus first offending row/role/type only;
it does not broaden accepted data or claim to fix the native failure. Use an
editable copy for parent-owned observation, leaving all earlier artifacts intact.

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

**No complete Desktop acceptance is claimed.** JSON Schema checks, resolvable
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
