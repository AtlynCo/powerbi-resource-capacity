# First-release submission checklist

**Status: automated code gates passed; manual publication gates remain.** This source is certification-oriented, **not Microsoft certified**. No AppSource approval, Desktop/service acceptance, export validation, real Gantt integration, or legal approval is claimed.

Check a box only after recording evidence for the exact release artifact. Keep internal evidence with the release review; publish only sanitized, approved material. Record artifact version and SHA-256, source revision, date, tester, Desktop/service/browser versions, and tenant policy.

## Current engineering evidence

Recorded code-gate snapshot, **September 9, 2026**, with retained `dist\validation.log`, `dist\sdk-audit.log`, dependency-audit logs and tool versions. The package includes the final Microsoft/Globalize license notice and read-only accessibility updates. Its exact SHA-256 is recorded in the adjacent `.sha256` file and static-audit output. Keep those files together; local engineering evidence is not manual publication sign-off.

| Check | Result |
|---|---|
| Unit, host-lifecycle and offline sample tests | **195 passed** |
| Source/test type checking and source lint | Passed, including strict test type checking |
| Runtime and full npm dependency audits | **Zero vulnerabilities** in both, after the focused build-only overrides |
| Combined `npm run package` gate | Passed; retained in `dist\validation.log` |
| SDK package build | Passed using `scripts\package.ps1` with `--all-locales --no-stats` |
| Package-time certificate lookup | SDK reported “Certificate is valid” for the isolated public-only PFX; no certificate-store edits |
| Static repository package audit | Passed against the final compiled package, including embedded language resources and retained license text |
| Original icon | Found and successfully packaged |
| Compiled-package browser checks | **9/9 passed in installed Edge Chromium**, selected with `CAPACITY_BROWSER_CHANNEL=msedge` |
| Separate `npm run audit:sdk` check | Passed; `dist\sdk-audit.log` reports no external requests found and a successful build |
| Desktop/service/export/real Gantt acceptance | Still manual, not verified by these checks |

Final artifact handling:

- File: `dist\AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2.1.0.0.0.pbiviz`
- Checksum sidecar: the same file name with `.sha256` appended.
- Obtain the final byte count and SHA-256 from the regenerated package and its static-audit output; verify they agree with the newly generated sidecar.

The Globalize/culture-data notice carries Software Freedom Conservancy, Inc. attribution and the explicit MIT choice from its MIT/GPL Version 2 dual license. Rebuilding can change package bytes; regenerate the checksum for every new artifact and never reuse an intermediate package's identity.

The supported `--all-locales` flag avoids the confirmed SDK 7.2.1 locale-pruning ESM failure and retains the shipped locale resources. The optional stalled Chromium download was **cancelled**; it supplies no browser evidence. All browser evidence is actual compiled-package execution in installed Edge's test harness, **not the Power BI Desktop or service host**. Successful code gates or certificate lookup are not Microsoft certification.

## 1. Reproducible package and automated evidence

- [ ] Restore the pinned dependency lockfile and record Node/npm/PowerShell versions.
- [x] Generate the original icon; confirm it is a valid 20×20 PNG and the package references it.
- [x] Use the installed Edge Chromium channel with `$env:CAPACITY_BROWSER_CHANNEL = 'msedge'` in the test-command session; the optional Chromium download was cancelled.
- [x] Run `npm run package`: type checking, lint, unit tests, package build, browser tests, and repository package inspection. Retained log inspected.
- [x] Run `npm run audit:sdk` separately and inspect the official SDK certification-audit results. Retained log inspected; a successful tool check is not Microsoft approval.
- [x] Verify the Windows package wrapper isolates SDK home, exports a public-only PFX without a private key, makes no certificate-store/trust changes, and uses `--no-stats`; no development-server workflow was substituted.
- [x] Run production and full dependency audits: the coordinator reported zero vulnerabilities in both on September 9, 2026, for the final code gates.
- [x] Regenerate the final package and checksum after the final notice update; verify the retained root/CSS attribution and MIT choice, then associate the final audit output with that artifact.
- [ ] Archive the final package, checksum, validation logs, dependency-audit output, exact tool/browser versions, and source revision with the publication review.
- [x] Review the build-only `qs` 6.16.0 and `uuid` 11.1.1 overrides against the exact lockfile and SockJS's CommonJS `v4()` usage; confirm packaging does not require starting the SDK development server.
- [x] Inspect the packaged metadata, permissions, styles, all-locale resources, notices, and runtime bundle; confirm the full Microsoft/Globalize MIT notice survives in packaged CSS and the root notice accompanies source.
- [x] Verify no network resources, backend/writeback, unsafe dynamic execution, or bundled test/demo code is required at visual runtime.
- [x] Confirm all limits and defaults match [the data contract](data-contract.md), including the blank required unit and opt-in per-resource totals.

## 2. Actual Power BI Desktop — required manual work

- [ ] Import the private `.pbiviz` into a supported Desktop version under a policy that permits it.
- [ ] Open `samples\AtlynResourceCapacity\AtlynResourceCapacity.pbip`, refresh its literal M partitions, and verify both native sample pages.
- [ ] Import the custom visual, bind the fields from [samples](../samples/README.md), set the appropriate unit, save, close, and reopen.
- [ ] Confirm date fields use the Date column rather than an automatic hierarchy; validate date and label ordering separately.
- [ ] Verify valid allocation, full capacity, overload, positive/zero, zero/zero, missing, negative, nonfinite, duplicate, order-conflict, and supplied nonworking cases.
- [ ] Demonstrate that a blank unit blocks analysis; demonstrate that a unit label does not repair incompatible measurements.
- [ ] Demonstrate model safeguards against repeated task-row capacity, including identical duplicated source rows hidden by host aggregation.
- [ ] Test sparse grids, incomplete host segments, each size bound, a rejected fetch, user-triggered **Load more**, and totals suppression.
- [ ] Test legal additive totals and prohibited rate/FTE/overlapping-window totals with reviewed model semantics.
- [ ] Verify resize, scrolling, sticky headers, empty bindings, filter changes, and reopening with persisted settings.
- [ ] Verify the landing page and empty-data-view setup guidance, including a report with no fields bound.
- [ ] Verify `hostCapabilities.allowInteractions = false`: visible disabled notice, no selection/clear/context-menu/fetch host calls, and continued grid keyboard navigation.

The supplied PBIP is generated/unopened source, not a Desktop-exported or Desktop-validated deliverable. Create an actual `.pbix` only by opening and saving in Desktop after verification; never rename a ZIP or text file to `.pbix`.

## 3. Actual Power BI service — required manual work

- [ ] Publish an approved test report into an authorized test workspace; verify applicable custom-visual/organizational-visual tenant policies.
- [ ] Refresh the offline sample semantic model and confirm it needs no source credentials, gateway, filesystem path, or external data endpoint.
- [ ] Test reading/editing modes, host tooltips, selection, multiselect, context menus, incoming filters/highlights, and clear selection.
- [ ] Verify the relevant browsers, authentication/session scenarios, organizational deployment flow, and supported host versions.
- [ ] Confirm behavior when the visual is blocked by tenant policy and document the supported administrator-reviewed installation route.
- [ ] Record known environment limitations, including Report Server or embedded scenarios if offered; do not claim them without testing.

## 4. Accessibility and localization — required manual work

- [ ] Keyboard-only pass: focus entry/exit, arrow keys, Home/End, Ctrl+Home/End, Page Up/Down, selection, multiselect, clear, context, and **Load more**.
- [ ] Screen-reader pass: resource/period context, value/unit, state, missing versus zero, undefined ratios, and nonworking metadata.
- [ ] Windows/host high-contrast pass: labels, cells, controls, focus, selection, and overloads are distinguishable without color.
- [ ] RTL pass: column order, sticky labels, scrolling, key directions, numeric text, and native menu/tooltip placement.
- [ ] Reduced-motion pass and small-tile/zoom/text-scaling pass.
- [ ] Check English fallback and the full `fr-FR` resource bundle in a real host, including model measure formats and localized dates; complete linguistic review.
- [ ] Verify automatic RTL for `ar`, `fa`, `he`, and `ur` locales, explicit RTL in other locales, and the documented off-toggle behavior.

## 5. Exports — required manual work

- [ ] Test actual Desktop and service PDF/PowerPoint/image outputs where the intended host supports them.
- [ ] Record loaded rows, tile dimensions, scroll position, filters, and whether output covers only the viewport.
- [ ] Confirm export does not hang on rendering lifecycle events or imply complete data when partial.
- [ ] Test native data export under tenant/report policy if it is part of the proposed offer.
- [ ] Document limitations explicitly; provide a native table or paginated-report alternative for complete printouts.

## 6. Real Atlyn Gantt interoperability — required manual work

- [ ] Use an actual approved Atlyn Gantt artifact, not a browser mock or a native table labeled as Gantt.
- [ ] Build a reviewed model with stable shared resource/period keys and task-period allocation semantics for spanning tasks.
- [ ] Demonstrate capacity-cell selection filters the expected task set; verify reverse interactions where supported.
- [ ] Test multiselect, clearing, incoming slicers, task spans crossing periods, and resource key collisions.
- [ ] Confirm no scheduling, critical-path, writeback, or dependency behavior is implied by selection.
- [ ] Record actual versions and outcomes before using “works with Gantt” in public material.

The current offline sample intentionally does not bundle or prewire a Gantt visual. A Calendar Slicer companion requires the same relationship and real-host discipline.

## 7. Support, legal, and offer metadata — owner review required

- [ ] Verify ownership and contribution rights for the proprietary `UNLICENSED` source and original artwork.
- [ ] Review actual direct/transitive licenses, bundled code, redistribution requirements, and [third-party notices](../THIRD-PARTY-NOTICES.txt).
- [ ] Approve commercial terms, EULA, privacy statement, support policy, and any intended licensing model. No runtime licensing service is implied.
- [x] Confirm existing Atlyn metadata: author `Atlyn`, email `atlyn.help@gmail.com`, support URL `https://www.atlynco.com/docs/faq`, and the project's own private GitHub repository. Verified by the coordinator; these are not placeholder blockers.
- [ ] Verify the support page is publication-ready and the contact responds through the intended support workflow; confirm monitoring, support commitments, and suitability for this offer.
- [ ] Review publisher/company identity, visual name/GUID/version, descriptions, documentation and privacy URLs, support locale, and geographic/support commitments.
- [ ] Check that any certification or marketplace claims reflect an actual Microsoft decision.
- [ ] Provide authentic, approved screenshots/video captured from a real report after host validation; label synthetic/browser images if used for engineering only.
- [ ] Provide a verified, sanitized sample report and source. Do not imply the generated PBIP has been opened or attach a fake PBIX.
- [ ] Review submission requirements current at submission time, including applicable Partner Center validation and Microsoft certification criteria.

## Evidence outcome

Release approval must explicitly state **approved**, **blocked**, or **approved with documented limitations**, identify the accountable reviewers, and link the evidence. A checklist in source control is not that approval.

Reference starting points:

- [Power BI visual certification requirements](https://learn.microsoft.com/power-bi/developer/visuals/power-bi-custom-visuals-certified)
- [Power BI projects](https://learn.microsoft.com/power-bi/developer/projects/projects-overview)
- [PBIR report format](https://learn.microsoft.com/power-bi/developer/projects/projects-report)
- [TMDL semantic models](https://learn.microsoft.com/power-bi/developer/projects/projects-dataset)
