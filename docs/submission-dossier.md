# Atlyn Resource Capacity submission dossier

**Prepared for owner review, not submitted.** The current PR #6 candidate is 1.0.6.0; prior native retry 1.0.4.0 normalizes strictly supported ISO strings for host-declared Date periods. The sealed full-quality baseline remains 1.0.1.0; earlier native retries did not establish native rendering acceptance. No version is Microsoft certified. The parent coordinates native Power BI and Partner Center; this session does not manipulate those shared UIs or invent commercial approvals.

## Approved acquisition and runtime model

The owner approved **storefront subscriptions, ungated visuals** on 2026-09-10.
Acquisition uses existing Atlyn subscriptions outside Power BI. Runtime is
ungated, with free shared viewing and no viewer activation or subscription
check. Do not describe this as paid-author enforcement.

No license keys, new signer, AAD flow, entitlement API, feature gates, WebAccess
or external runtime license calls are to be added. The current offline renderer
is the intended runtime; runtime licensing integration is **not a blocker**.
No repackaging or version bump is needed for this documentation-only decision.
Frozen folders remain historical evidence and must not be rewritten.
The subsequent version bumps are solely for native date-key corrections and
diagnostics, not licensing or a badge. See [separate retry evidence](quality-evidence.md#native-serialized-date-correction-1040).

## Proposed listing copy

**Name:** Atlyn Resource Capacity

**Summary:** Find resource-period overloads using the capacity your Power BI model actually supplies.

**Description:** Compare allocated amounts with available capacity across resources and ordered periods. See overloads, zero capacity, missing data and model-supplied nonworking states without confusing them. Review formatted allocation/capacity values, utilization and full cell details; move directly between overloaded intersections and use native Power BI selection to explore related report visuals.

Use people-hours by week, machine-hours by day, or another explicitly compatible unit. Your semantic model controls granularity and availability. Duplicate delivered intersections are rejected, partial data is disclosed, and row totals require an explicit additive-measure assertion.

The visual is read-only. It does not schedule tasks, infer holidays, spread daily workloads, level resources, calculate critical paths, change assignments or write data back. FTE, rates and snapshots usually require totals to stay off. Large analyses are bounded to 200 resources, 104 periods and 10,000 cells/records; exports may reflect only the visible tile.

Acquire the visual through existing Atlyn storefront subscriptions. The visual
runs without license checks or feature gates, and recipients can view shared
reports for free without an Atlyn viewer subscription. Power BI licensing,
report access and tenant policies still apply.

**Suggested search terms for owner review:** resource capacity, allocation, utilization, overload, capacity exceptions.

Do not add “certified”, “best”, “market-leading”, automatic scheduling, validated Gantt integration, guaranteed export completeness or broader free-use/pricing claims beyond the approved acquisition and free shared viewing model.

## Package identity and source

| Field | Value |
|---|---|
| GUID | `AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2` |
| Visual version | Current PR #6 candidate `1.0.6.0`; not native-accepted or frozen. Prior native retry `1.0.4.0`; historical baseline `1.0.1.0` |
| API declaration | `5.11.0` |
| SDK API package / tools | `5.11.1` / `7.2.1` |
| Runtime permissions | `privileges: []` |
| Runtime | Local bundled rendering; no external requests, telemetry, assets, backend, auth or payment service |
| Acquisition / runtime access | Existing Atlyn storefront subscriptions; ungated runtime and free shared viewing |
| Source license status | No tracked first-party LICENSE/COPYING; package declares `UNLICENSED`; no relicensing |
| Support metadata | FAQ `https://atlynco.github.io/atlyn-powerbi-support/docs/faq/`; Terms `https://atlynco.github.io/atlyn-powerbi-support/legal/terms/`; Privacy `https://atlynco.github.io/atlyn-powerbi-support/legal/privacy/`; `atlyn.help@gmail.com`; author Atlyn. Coordinator reports the public pages load; owner approval and monitored support commitments remain open. |
| Repository | Private `AtlynCo/powerbi-resource-capacity`; coordinator confirmed read-only access for `OSDC1033` and `pbicvsupport` across repositories on 2026-10-04. Do not put credentials or recovery codes in the repository. |
| Current candidate package/sample | `dist\AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2.1.0.6.0.pbiviz`, 134,569 bytes, SHA-256 `8137353a89894449033fdf1fb98d0ee527ec7f18beb7ae7394516dd857aab075`; exact-package PBIP at `dist\sample\AtlynResourceCapacity\AtlynResourceCapacity.pbip`. This is a local handoff candidate, not a release freeze or native acceptance. |
| Historical source/package/assets | Retry manifest for 1.0.4.0; sealed `manifest.json` for historical 1.0.1.0. Do not mix their bytes or evidence with the current candidate. |

The package's runtime source was commit
`c7a3c38cf9f15af1d03e66387a1635cd067182f6`; PR #6 remains a draft, and
documentation-only handoff updates do not alter the package inputs. The remote
lowercase `certification` branch remains at
`d3bb63714794e160c9305fb79586fba9f62be843`, so it does not yet match this
candidate. No protected branch was changed. Read-only repository access was
confirmed as noted above, but Partner Center credentials/recovery codes and
final branch coordination remain owner-handled. Do not move main or the
lowercase `certification` ref, merge another PR or submit an offer without the
parent's final gate.

## Proposed assets

The original icon is supplied at 20x20 (`icon.png`) and 300x300 (`icon-300.png`). The historical 1.0.1.0 bundle has three unaltered 1366x768 package captures under `screenshots\listing`: people-hours overview, people cell details, and machine-hours overview. Each has exact bytes/hash and a provenance statement in its historical `capture.json`; the 1.0.4.0 retry also has separate serialized-Date and cross-realm-Date screenshots with mock-host provenance. The current 1.0.6.0 candidate has five engineering captures and three 1366x768 listing candidates under `dist\screenshots`; `dist\screenshots\capture.json` records the exact current package hash and identifies them as headless Edge/local-mock captures, not Desktop screenshots. Owner approval is still required before listing use.

**The owner requests Microsoft's official "Power BI certified" badge.** This
means selecting **Request Power BI certification** in Partner Center's Product
setup during the parent-authorized submission, followed by Microsoft's review
and grant. It is not the IAP "additional purchase" label. No badge asset or
placement is pending from the parent; do not add an in-visual badge, claim
certification before Microsoft grants it, or change runtime/frozen assets.
See [Microsoft's certification request and badge guidance](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified#submit-a-power-bi-visual-for-certification).

**Recorded status:** preparation only; no certification request receipt or
Microsoft grant is recorded. Submission remains behind the parent's final gate,
and native results are still forthcoming. Selecting the checkbox does not
establish certification or native-host acceptance.

The current 1.0.6.0 images are **actual package renders with sanitized data in a headless Edge local mock-host browser**, not fabricated drawings or Desktop screenshots. The historical images remain version-specific and must not be relabeled as current. Parent/owner must approve listing suitability; replace the mock-host captures with authentic native-host captures if submission review requires native report context. The other five-size engineering captures are not all listing-size assets.

Microsoft's Power-BI-specific instructions specify 1366x768, while general Marketplace planning/policy specifies 1280x720. The discrepancy is unresolved: the parent must confirm the live offer upload requirement or clarify it with Microsoft. The current proposed images follow the Power-BI-specific size and stay within the stated image-size limit.

The sample PBIP has bound people/machine capacity pages, model-authoritative values, native comparison pages and the exact package embedded by the local generator. The current generated PBIP records the same 1.0.6.0 package SHA-256 above and passed official JSON Schema validation. See [sample binding](sample-binding.md). It has not been opened/saved by this session in Desktop, and no `.pbix` exists in this worktree. An actual accepted PBIX must be created by the parent in Desktop, not renamed from generated source.

## Evidence and remaining gates

Read [current Microsoft requirements and comparison](submission-research.md), [local quality evidence](quality-evidence.md), and the [acceptance checklist](submission-checklist.md). Historical command outputs belong to their frozen evidence; current PR #6 results are recorded in the checklist and the local audit JSON is under `dist\local-evidence`. No current release freeze was produced.

| Area | Local preparation | Remaining accountable work |
|---|---|---|
| Accounting/product | Independent oracle, duplicate/zero/missing/nonworking/order/partial/totals rules, exception-first UX | Parent native report behavior and semantic-model acceptance |
| Package/runtime | Current SDK certification-audit build and static package inspection passed; production audit is clean. Full dependency audit has six High entries from one unpatched advisory. | Compatible upstream dependency fix, passing full audit and Microsoft review/native host policy compatibility |
| Interaction/accessibility | 291 unit/host/sample tests and 77 current compiled-package headless Edge mock-host tests passed; current screenshots and performance profiles are recorded under `dist`. | Desktop/service, assistive technology, linguistic and real interaction acceptance |
| Sample/report/export | Bound offline PBIP and exact embedded package; official JSON Schema validation passed. | Refresh/save/reopen in Desktop, genuine PBIX, service and export observations |
| Source/review | Private PR #6 and read-only access confirmed for OSDC1033 and pbicvsupport; candidate is not on the `certification` branch. | Passing release gates, final certification branch and Partner Center reviewer credentials supplied by the owner |
| Commercial/legal | Approved storefront subscriptions, ungated runtime and free shared viewing; first-party terms preserved | Existing checkout/distribution terms, EULA/privacy/support/publisher/artwork/dependency review; no runtime licensing work |
| Publication | Listing copy/assets and evidence dossier | Final assets and parent gate; parent requests Power BI certification through Partner Center, records submission and Microsoft's review decision; no badge asset/placement task |

The acquisition/runtime approval above is an actual owner decision, not a claim
of broader legal or publication approval. No service test, export coverage or
submission receipt is synthesized. Final assets, native PBIX/host acceptance,
existing commercial terms, support commitments, geographic availability, privacy
policy and publication remain parent/owner responsibilities. The absence of
runtime network calls is not a substitute for an approved privacy statement.
