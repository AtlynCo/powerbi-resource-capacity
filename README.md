# Atlyn Resource Capacity

**See where demand exceeds availability—without pretending to be a scheduler.**

Atlyn Resource Capacity is a read-only Power BI custom visual for comparing allocated amounts with available capacity across resources and periods. Use it for people-hours by week, machine-hours by day, or another explicitly compatible unit. A bounded matrix keeps overloads, genuine zeroes, missing data, and supplied nonworking periods distinct.

**First-release source · private distribution · certification-oriented, not Microsoft certified.**
There is no claim of AppSource publication, completed Desktop/service acceptance, or legal approval. See the [submission checklist](docs/submission-checklist.md) before distributing a release.

## Acquisition and shared viewing

**Owner-approved model: storefront subscriptions, ungated visuals.** Acquisition
uses existing Atlyn subscriptions outside Power BI. The visual itself has no
license checks or feature gates; recipients can view shared reports for free
without an Atlyn viewer subscription or runtime activation.

This is not paid-author enforcement inside Power BI. No license keys, signer,
AAD flow, entitlement API, WebAccess or external runtime licensing calls are
required. The existing offline renderer is the intended runtime, so licensing
integration is not a release blocker. This access model does not relicense the
source or override Power BI licensing, access permissions, tenant policies or report sharing.

## What it does

- Presents resource-period allocation, availability, utilization, and overload exceptions.
- Requires an explicit compatible unit before analysis; does not infer or convert units.
- Retains model-defined periods, with chronological dates or deterministic label ordering.
- Uses Power BI selection identities, report interactions, multiselect, native tooltips, and context menus.
- Provides a keyboard-navigable grid, high-contrast rendering, RTL layout, reduced-motion support, and sticky headers inside the visual tile.
- Discloses incomplete host data and offers bounded, user-initiated **Load more**.
- Shows setup guidance with no bound fields or an empty data view, and respects host-disabled interactions.
- Summarizes delivered overload/unknown intersections; **Next !** visits exceptions without selecting or changing report filters.
- Offers full cell details, including unformatted model values, and a touch multi-select toggle and long-press native context menu.

It does **not** create assignments, optimize schedules, infer working calendars or holidays, calculate a critical path, edit the model, call a backend, or write data back. Your semantic model supplies the allocation and availability rules.

## Start with a local package

Use a trusted `.pbiviz` artifact built from this private repository. No public download or marketplace installation is implied.

1. Obtain the approved private build, or build locally using the commands below. The package is written under `dist\`.
2. In Power BI Desktop, open **Visualizations → … → Import a visual from a file** and select that `.pbiviz`. Organizational tenant policies may block unapproved visuals; ask your administrator to review deployment, rather than bypassing policy.
3. Add the visual and bind the fields below. Use the actual **Period** column, not Power BI's automatic date hierarchy.
4. In **Format visual → Analysis contract → Compatible unit**, enter a unit such as `hours` (1–80 characters after trimming). The default is empty: analysis is blocked until you provide a valid entry.
5. Leave **Measures additive across periods** off unless you have verified the [totals contract](docs/data-contract.md#totals-are-an-explicit-assertion).
6. Check all warnings before using the result. A loaded subset is not the complete planning horizon.

For an offline walkthrough, see [samples](samples/README.md) and [sample binding](docs/sample-binding.md). `npm run sample:bind` produces the fully bound people/machine PBIP with the exact current package embedded. It is **generated source, not opened or saved by Desktop**. The comparison pages remain available. No fake `.pbix` is supplied; a real PBIX requires Desktop acceptance and saving.

## Field contract

Each categorical row must describe **one unique resource-period intersection**.

| Field well | Role name | Required | Bind |
|---|---|---:|---|
| Resource (stable key) | `resource` | Yes | One grouping column with a stable, unique key or unique label; use `P01 · Planner A`, not an ambiguous name |
| Period | `period` | Yes | One Date column or period-label column |
| Allocated amount | `allocated` | Yes | One numeric measure in the declared unit |
| Available capacity | `capacity` | Yes | One numeric measure in that same unit |
| Period order (optional) | `periodOrder` | No | One numeric **measure**; consistent per label and unique across labels |
| Nonworking (0/1, optional) | `nonworking` | No | One numeric **measure**: `1` explicitly marks nonworking; `0` does not |
| Tooltip measures | `tooltips` | No | Up to five measures; additional context, not extra grouping columns |

Power BI may aggregate model rows before this visual sees them. Duplicate delivered resource-period rows are **invalid and never summed**, even when their values match. Conversely, the visual cannot detect capacity that Power BI has already multiplied upstream. Use the [safe-model examples](docs/modeling.md), not a task table with repeated capacity summed alongside task hours.

### Compatible units and formats

`analysis.unit` is an author assertion, not a validation of your physical units. `hours` is safe only if both bound measures really represent comparable hours for the same resource and exact period. Separate people-hours and machine-hours into different visuals. Convert minutes to hours in the model before binding.

Use numeric model formats such as `#,0.0` for amounts, `0.0%` for percentage tooltip measures, and a clear date format for periods. Formatting does not convert minutes, normalize FTE, or make a rate additive. Do not bind measures created with DAX `FORMAT()` to numeric roles: it returns text.

FTE can be compared within a period if both measures share the same FTE basis, but summing FTE snapshots or averages across periods is not a defensible total. Likewise, percentages, ratios, and overlapping rolling periods require totals to remain off.

### How to read a cell

| Input | Meaning |
|---|---|
| Allocation from zero through positive capacity | Normal; utilization is allocation divided by capacity |
| Allocation greater than positive capacity | Overload |
| Positive allocation with zero capacity | Overload; utilization ratio is undefined, not infinity or 100% |
| Zero allocation and zero capacity | Nonworking if explicitly marked; otherwise unavailable; ratio is undefined |
| Missing allocation, capacity, or intersection | Missing, not zero |
| Negative, nonfinite, or otherwise invalid values | Invalid, not usable evidence of available capacity |

A supplied nonworking flag stays visible alongside any supplied allocation or capacity; it does not erase values or suppress an overload. The visual never guesses holidays or weekends.

### Ordering, limits, and completeness

- Dates are chronological and are not rebucketed into days/weeks/months.
- Label periods use a valid numeric period-order measure if supplied; otherwise first-seen host/model order is preserved. This is not alphabetical or natural-language date sorting.
- Inconsistent order for a label, or the same explicit order for different labels, invalidates ordering for the analysis.
- Bounds: **200 resources**, **104 periods**, **10,000 Cartesian cells**, and **10,000 source rows consumed**. Limits apply together: 200 × 104 is too large.
- Categorical delivery requests a **1,000-row window**. **Load more** asks the host for an aggregated continuation (`aggregateSegments: true`) only within the visual's bounds. A host can reject or stop a request.
- A missing, sparse or invalid period suppresses that resource's total; host-level partial/reduced/truncated data suppresses all totals. Totals are opt-in (`analysis.additiveTotals`, default `false`), not an automatic sum of whatever happened to load.

Full rules: [data contract](docs/data-contract.md).

### Formatting settings

| Card / setting | Property | Default | Effective behavior |
|---|---|---|---|
| Analysis contract / Compatible unit | `analysis.unit` | Empty | Required text, 1–80 characters after trimming; no unit conversion |
| Analysis contract / Measures additive across periods | `analysis.additiveTotals` | `false` | Author assertion; completeness, validity, and host nonadditivity metadata still gate totals |
| Layout / Cell width | `layout.cellWidth` | 132 px | Rendered width clamped to 100–260 px |
| Layout / Font size | `layout.fontSize` | 12 px | Rendered size clamped to 10–22 px |
| Layout / Right-to-left layout | `layout.rtl` | `false` | Enables RTL explicitly; Arabic, Persian, Hebrew, and Urdu host locales also enable RTL automatically |

An off RTL toggle does not force LTR in an automatically detected RTL locale. English source strings provide the fallback; a full `fr-FR` resource bundle is included. Measure/date formatting uses the host locale and model formats. Real-host localization and linguistic review remain release gates.

## Interactions and accessibility

Select a cell to pass its resource-period identity to Power BI; use Ctrl/Command/Shift or the **+** toggle for multiselect. Touch long-press opens the native context menu; dragging cancels that request and scrolls normally. **Next !** / Alt+ArrowDown moves through overloaded cells without selecting. **i** shows full details and raw values; **?** opens the guide and legend. Report authors control filtering and highlighting through **Edit interactions**. A selection does not modify an assignment.

When the host sets `hostCapabilities.allowInteractions` to `false`, a visible notice explains the disabled state. Selection, clearing, context-menu requests, and **Load more** are suppressed; this does not turn partial data into a complete result. Keyboard grid navigation remains available.

Tab into the grid, navigate with arrow keys, select with Enter/Space, and clear with Escape (the first Escape closes an open details/guide panel). Home/End move across a row; Ctrl+Home/End move to grid extremes; Page Up/Down move through the tile. Shift+F10 opens the host context menu. Headers remain in the tile while its contents scroll. Below 200 px wide or 140 px high, an accessible, scrollable summary replaces an unusable grid and asks the reader to enlarge the tile; partial/error states remain disclosed. See [accessibility and host behavior](docs/accessibility.md).

Atlyn Gantt and Calendar Slicer can be report companions through shared model keys and Power BI interactions. **Real Gantt interoperability is a manual release gate, not a verified integration claim.**

## Build and verify

For maintainers: use Windows, Node.js 24 LTS, npm, and PowerShell 7. **All validation is local. GitHub Actions and other hosted CI/CD are prohibited for this repository.** No workflow or hosted status check is needed to build, review, or distribute source. Desktop is needed for real report acceptance, not for TypeScript tests.

```powershell
npm ci
node .\scripts\generate-icon.mjs
npm run install:browser
npm run package
npm run audit:sdk
```

`npm run package` is the full local gate: type checking, lint, unit tests, package build, browser tests, and repository package inspection. It needs either Chromium installed by the command above or an explicitly selected installed browser channel. `npm run audit:sdk` is the separate official Power BI SDK certification check, not part of `npm run package` and not a Microsoft certification decision. Inspect the scripts in `package.json` for the authoritative commands.

**Installed Microsoft Edge alternative:** if the optional Chromium download stalls, use an existing Edge Chromium installation rather than treating the download as a product failure. Set the channel in the same PowerShell session as the command:

```powershell
$env:CAPACITY_BROWSER_CHANNEL = 'msedge'
npm run package
Remove-Item Env:CAPACITY_BROWSER_CHANNEL
```

For only the compiled-package browser checks, replace `npm run package` with `npm run test:browser`. The channel option reuses installed Edge; it does not install Edge or change the default browser. Remove the environment variable to return to the wrapper-managed Chromium default.

### Worktree-local build setup

- On Windows, `npm run build` and `npm run audit:sdk` route through PowerShell 7's `pwsh` and `scripts\package.ps1`.
- The wrapper redirects the SDK's home to `.tmp\tool-home` within the worktree. It generates an RSA key and self-signed certificate in memory, then exports a **public-only PFX with no private key** for the SDK's package-time certificate lookup. It does not persist the private key, install a certificate, or modify certificate stores or trust.
- Packaging uses `--all-locales` and `--no-stats`. Keeping all locales avoids the confirmed Power BI SDK 7.2.1 locale-pruning ESM failure; `--no-stats` avoids the SDK's statistics-output path outside the worktree. Retain both flags in this toolchain. No Power BI SDK development server is started.
- `npm run install:browser` installs Chromium through the repository wrapper into `.tmp\browsers`, with browser scratch files under `.tmp\browser-tmp`. `npm run test:browser` uses the same wrapper and defaults to that browser location; `CAPACITY_BROWSER_CHANNEL=msedge` selects installed Edge instead. Do not replace Chromium installation with a bare `npx playwright install`: it can use a different cache and leave the test executable missing.
- If browser validation reports a missing Chromium executable, run `npm run install:browser` and retry the gate, or select an available installed channel as above. Installation can download build/test dependencies; the packaged visual and literal sample refresh do not acquire a runtime network dependency.

| Release review command | Scope |
|---|---|
| `npm run audit:dependencies` | npm production-dependency audit (`--omit=dev`, moderate threshold) |
| `npm run audit:all-dependencies` | npm audit including development dependencies (moderate threshold) |
| `npm run audit:sdk` | Power BI SDK packaging with `--certification-audit` |
| `npm run audit:certification` | Repository package inspection; distinct from the SDK audit |

The sealed quality baseline is **1.0.1.0**. The **1.0.4.0 native retry** supports strictly validated ISO strings for host-declared Date periods, retaining cross-realm Date handling and the original stable GUID; its native acceptance remains separate. The current PR candidate is **1.0.6.0**, not a Desktop/service-accepted release. See the [serialized-date correction](docs/quality-evidence.md#native-serialized-date-correction-1040). For an exact-byte full release run, use the command below. It performs source gates, builds once using the SDK certification audit, then runs package browser checks, static/dependency audits, real-package captures at five tile sizes, a 30-sample benchmark with DevTools profiles, and bound-sample generation with official JSON Schema validation. Dependency audits and schema validation access public metadata; private source/model/package content is not uploaded. `dist\local-evidence\gates.json` records command exits and the exact package hash; a failed run does not produce a successful gate record.

```powershell
$env:CAPACITY_BROWSER_CHANNEL = 'msedge'
npm run validate:local
# After reviewed source is committed and the worktree is clean:
npm run release:freeze
```

The freeze command refuses stale build inputs/evidence or an existing release directory. It archives source, package, checksum, icons, screenshots, raw performance samples, bound PBIP, and logs under `artifacts\release-<version>-<package hash>-<commit>\`, with a byte/hash inventory in `manifest.json`. These ignored files are intentionally not GitHub release assets. Copy the complete frozen directory to approved durable storage before removing a worktree. See [quality evidence](docs/quality-evidence.md) and the [submission dossier](docs/submission-dossier.md). Browser captures and benchmarks execute the compiled package with **mock host services, not inside Power BI Desktop or the service**.

Build-only dependency overrides pin `webpack-dev-server`'s `qs` to `6.16.0` and `sockjs`'s `uuid` to `11.1.1`, addressing those focused transitive findings without changing the visual API. They do **not** clear every current dependency audit finding. On PR #6's 2026-10-04 lockfile, the full npm audit reports six High affected-package entries from one unpatched `braces` advisory, GHSA-vfj7-8cjw-p6xm; npm's only proposed fix downgrades `powerbi-visuals-tools` to 1.7.2 as a major change. Do not suppress the advisory, force an override/downgrade, or treat the production-only zero-finding audit as the full certification audit. The full-audit result blocks release freeze until a compatible upstream fix is available. These overrides are not runtime services or additions to the visual's API. The packaging workflow does not start or require the Power BI SDK development server. See [dependency review](docs/ownership-and-dependencies.md) for the current audit evidence and remaining gate.

The original [capacity icon](assets/icon.svg) has a deterministic 20×20 package icon and 300×300 listing icon generator using only Node's built-in APIs. It does not use downloaded imagery.

## Documentation and samples

| Guide | Purpose |
|---|---|
| [Data contract](docs/data-contract.md) | Cell semantics, order, limits, missing data, and totals |
| [Modeling safely](docs/modeling.md) | Grain, calendar preparation, DAX safeguards, and repeated-capacity pitfalls |
| [Offline samples](samples/README.md) | Sanitized CSVs and self-contained PBIP/TMDL/PBIR source |
| [Accessibility and host behavior](docs/accessibility.md) | Selection, keyboard, contrast, RTL, reduced motion, and exports |
| [Submission checklist](docs/submission-checklist.md) | Desktop/service/Gantt/export evidence, metadata, and release blockers |
| [Ownership and dependencies](docs/ownership-and-dependencies.md) | Proprietary source, third-party notices, and legal review gate |

## Support, privacy, and ownership

The visual is a read-only renderer of data supplied by Power BI and requests no external-service privileges. Power BI's own service, refresh, sharing, telemetry, and tenant policies remain Microsoft's and your organization's responsibility; this statement is not a blanket privacy policy for Power BI.

The confirmed existing Atlyn metadata uses author **Atlyn**, support URL <https://atlynco.github.io/atlyn-powerbi-support/docs/faq/>, terms <https://atlynco.github.io/atlyn-powerbi-support/legal/terms/>, privacy <https://atlynco.github.io/atlyn-powerbi-support/legal/privacy/>, contact <atlyn.help@gmail.com>, and this project's own private GitHub repository. These are not placeholder metadata blockers. Support responsiveness, publication-ready privacy terms, and support commitments still require manual review before release. When reporting an issue, share the visual version, host version, reproduction steps, and sanitized data—not confidential assignments or employee records.

This private source remains **proprietary / `UNLICENSED`**. There is no tracked first-party `LICENSE` or `COPYING` file; `package.json` declares `UNLICENSED`. The approved ungated runtime/free shared viewing model does not grant an open-source license or change source redistribution rights. Existing subscription/distribution terms, EULA and publication approvals remain the owner's responsibility. Third-party components retain their own licenses; see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).
