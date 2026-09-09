# Atlyn Resource Capacity submission dossier

**Prepared for owner review, not submitted.** Candidate 1.0.1.0 is certification-oriented, not Microsoft certified. The parent coordinates native Power BI and Partner Center; this session does not manipulate those shared UIs or invent commercial approvals.

## Proposed listing copy

**Name:** Atlyn Resource Capacity

**Summary:** Find resource-period overloads using the capacity your Power BI model actually supplies.

**Description:** Compare allocated amounts with available capacity across resources and ordered periods. See overloads, zero capacity, missing data and model-supplied nonworking states without confusing them. Review formatted allocation/capacity values, utilization and full cell details; move directly between overloaded intersections and use native Power BI selection to explore related report visuals.

Use people-hours by week, machine-hours by day, or another explicitly compatible unit. Your semantic model controls granularity and availability. Duplicate delivered intersections are rejected, partial data is disclosed, and row totals require an explicit additive-measure assertion.

The visual is read-only. It does not schedule tasks, infer holidays, spread daily workloads, level resources, calculate critical paths, change assignments or write data back. FTE, rates and snapshots usually require totals to stay off. Large analyses are bounded to 200 resources, 104 periods and 10,000 cells/records; exports may reflect only the visible tile.

**Suggested search terms for owner review:** resource capacity, allocation, utilization, overload, capacity exceptions.

Do not add “certified”, “best”, “market-leading”, automatic scheduling, validated Gantt integration, guaranteed export completeness, or free-use/pricing claims unless independently approved and substantiated.

## Package identity and source

| Field | Value |
|---|---|
| GUID | `AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2` |
| Visual version | `1.0.1.0` |
| API declaration | `5.11.0` |
| SDK API package / tools | `5.11.1` / `7.2.1` |
| Runtime permissions | `privileges: []` |
| Runtime | Local bundled rendering; no external requests, telemetry, assets, backend, auth or payment service |
| Source license status | Proprietary / `UNLICENSED`; not an approved end-user license |
| Support metadata | `https://www.atlynco.com/docs/faq`; `atlyn.help@gmail.com`; author Atlyn |
| Repository | Private `AtlynCo/powerbi-resource-capacity` |
| Exact source/package/assets | Frozen `manifest.json`: commit, tools, files, bytes and SHA-256 |

The quality PR is reviewed before merge. The final lowercase `certification` branch must be coordinated with the parent and point at final reviewed source. Reviewer access to the private repository and ownership of that branch are not silently assumed.

## Proposed assets

The original icon is supplied at 20x20 (`icon.png`) and 300x300 (`icon-300.png`). Three unaltered 1366x768 package captures are generated under `screenshots\listing`: people-hours overview, people cell details, and machine-hours overview. Each has exact bytes/hash and a provenance statement in `capture.json`.

These are **actual final-package renders with sanitized data in a local mock-host browser**, not fabricated drawings or Desktop screenshots. Parent/owner must approve their listing suitability; replace them with authentic native-host captures if submission review requires native report context. The other five-size engineering captures are not all listing-size assets.

Microsoft's Power-BI-specific instructions specify 1366x768, while general Marketplace planning/policy specifies 1280x720. The discrepancy is unresolved: the parent must confirm the live offer upload requirement or clarify it with Microsoft. The current proposed images follow the Power-BI-specific size and stay within the stated image-size limit.

The sample PBIP has bound people/machine capacity pages, model-authoritative values, native comparison pages and the exact package embedded by the local generator. See [sample binding](sample-binding.md). It has not been opened/saved by this session in Desktop. An actual accepted PBIX must be created by the parent in Desktop, not renamed from generated source.

## Evidence and remaining gates

Read [current Microsoft requirements and comparison](submission-research.md), [local quality evidence](quality-evidence.md), and the [acceptance checklist](submission-checklist.md). The exact local command outputs are retained with the frozen artifact, not in a hosted workflow.

| Area | Local preparation | Remaining accountable work |
|---|---|---|
| Accounting/product | Independent oracle, duplicate/zero/missing/nonworking/order/partial/totals rules, exception-first UX | Parent native report behavior and semantic-model acceptance |
| Package/runtime | Supported SDK build, static audit, OSS notices, bounded DOM/data and no-network browser harness | Microsoft review and native host policy compatibility |
| Interaction/accessibility | Actual compiled-package tests with mocked host; keyboard/touch/HC/RTL/resize/scroll/lifecycle | Desktop/service, assistive technology, linguistic and real interaction acceptance |
| Sample/report/export | Bound offline PBIP and exact embedded package | Refresh/save/reopen, genuine PBIX, service and export observations |
| Source/review | Private quality PR and immutable source archive | Review/merge decision, final certification branch and reviewer permissions |
| Commercial/legal | Existing metadata and explicit unresolved decisions | Price/license/EULA/privacy/support/publisher/artwork/dependency approvals |
| Publication | Listing copy/assets and evidence dossier | Parent/authorized publisher performs Partner Center validation/submission |

No approval, service test, export coverage or submission receipt is synthesized. Legal terms, commercial price, license model, support commitments, geographic availability and privacy policy are owner decisions. The repository's technical absence of runtime network calls is not a substitute for an approved privacy statement.
