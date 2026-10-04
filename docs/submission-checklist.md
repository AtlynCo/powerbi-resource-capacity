# Quality and submission checklist

**Current PR candidate: 1.0.6.0; prior native retry: 1.0.4.0; sealed quality baseline: 1.0.1.0. Certification-oriented, not Microsoft certified.** The 1.0.4.0 retry addresses host serialization of declared Date periods, not licensing. Its targeted evidence is [separate from the historical full-quality run](quality-evidence.md#native-serialized-date-correction-1040); parent native acceptance is still required. Current candidate evidence and blockers are recorded below. Local engineering evidence is distinct from native-host acceptance, commercial/legal approval and Partner Center submission. No shared Desktop/service UI or live submission is operated by this repository's agent.

## Historical 1.0.1.0 engineering evidence

Use the exact frozen release directory and its `manifest.json` / `manifest.sha256`, not a prior build with the same version. See [quality evidence](quality-evidence.md), [submission dossier](submission-dossier.md) and [current public requirements](submission-research.md).

The final local run recorded **225 passing unit/host/sample tests, 55 passing compiled-package browser tests, passing source/SDK/package/schema gates and zero vulnerabilities in runtime/full dependency audits**. These engineering results do not constitute native or owner approval; the separate owner decision recorded below is explicitly identified.

| Evidence | Reproducible local command / file |
|---|---|
| Full final-byte gate sequence | `npm run validate:local` |
| Command exits, timestamps, Node/npm/PowerShell, package SHA-256 | `local-evidence\gates.json` |
| Strict source/test types, lint, accounting/host/sample tests | `typecheck.log`, `lint.log`, `unit.log` |
| Official SDK certification-oriented audit/build | `sdk-audit.log`; this is a tool result, not Microsoft approval |
| Actual compiled-package browser checks | `browser.log`; Edge host mocks, not native Power BI |
| Runtime and development dependency audits | `runtime-dependencies.log`, `all-dependencies.log` |
| Packaged permissions, retained OSS notice, no-network/static checks | `package-audit.log` |
| Five tile sizes and authentic sample captures | `screenshots\capture.json` and PNGs |
| Typical/max timing distributions, samples, machine and limitations | `performance\benchmark.json` |
| Bound sample with the exact embedded package | `sample\binding-manifest.json` and PBIP source |
| Exact reviewed source and runtime provenance | `source.zip`, `build-inputs.json`, frozen manifest |

No GitHub workflow, CI badge, hosted check, Codespace, cloud build or Actions run is required or permitted. Git source push and a review PR are separate from local execution.

## Current PR #6 candidate evidence (2026-10-04; not frozen)

The local candidate was built from source commit `c7a3c38cf9f15af1d03e66387a1635cd067182f6`: visual version **1.0.6.0**, API declaration **5.11.0**, API package **5.11.1**, and Power BI tools **7.2.1**. The generated `dist\AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2.1.0.6.0.pbiviz` is 134,569 bytes with SHA-256 `8137353a89894449033fdf1fb98d0ee527ec7f18beb7ae7394516dd857aab075`. The generated PBIP at `dist\sample\AtlynResourceCapacity\AtlynResourceCapacity.pbip` embeds that exact package hash; its binding manifest records official JSON Schema validation as passed. Neither artifact is a native Desktop acceptance result or a frozen release.

On this candidate, strict source/test typechecks, both ESLint commands, and **291 unit/host/sample tests** passed. `npm run audit:sdk` completed `pbiviz package --certification-audit` with no external requests found; `npm run audit:certification` passed its compiled-package inspection. The production-only dependency audit found zero vulnerabilities. The **full** lockfile audit exited 1 with six High affected-package entries from one advisory, GHSA-vfj7-8cjw-p6xm; the captured output is at `dist\local-evidence\full-dependency-audit.json`. No compatible published fix is available, and npm's suggested tools 1.7.2 downgrade is not applied. This prevents release freeze.

All **77 current compiled-package browser tests passed** in headless Microsoft Edge 153.0.4234.48 with the existing Playwright channel option and mocked Power BI host services; this used isolated test contexts, not a shared interactive Edge window or Desktop. The real-package captures were generated at five tile sizes and as three 1366x768 listing candidates under `dist\screenshots`, and the 30-sample benchmark and CPU profiles are under `dist\performance`; each manifest records the package SHA-256. These are engineering/mock-host evidence, not native screenshots or acceptance. No `.pbix` exists in this worktree; the PBIP must still be opened, refreshed, saved and reopened in Desktop by the owner, who must supply any genuine PBIX and record its provenance and embedded-package parity.

As of October 4, the coordinator confirmed read-only access for `OSDC1033` and `pbicvsupport` on each repository. This does not provide submission credentials or recovery codes and does not make the candidate source match the certification branch: the package's runtime source commit is `c7a3c38cf9f15af1d03e66387a1635cd067182f6`, while the remote `certification` branch remains `d3bb63714794e160c9305fb79586fba9f62be843`. Documentation-only readiness updates do not change the packaged inputs. No protected ref was advanced. Existing listing notes record the unresolved 1366x768 versus 1280x720 guidance discrepancy; current-candidate mock-host captures are available, but owner approval remains outstanding.

## Local release review

- Confirm stable GUID, API version, four-part visual version, package bytes/hash, source commit and lockfile.
- Run local gates against the final package; do not rebuild after browser/capture/performance evidence.
- Confirm the 20x20 package icon, 300x300 listing icon, and one to five proposed listing captures at the documented size.
- Do not add an in-visual certification badge or claim certification before Microsoft grants it. The requested official badge is a Microsoft certification outcome, not a parent-supplied asset or the IAP "additional purchase" label; leave runtime and frozen assets unchanged.
- Inspect the actual package screenshots, not only screenshot file existence.
- Review source and packaged OSS notices, `privileges: []`, no runtime telemetry/external assets/auth/licensing service and no unsafe DOM/dynamic code.
- Inspect retained evidence before freezing. A successful public-certificate lookup is not signing, trust, or certification.
- Freeze only clean, committed final source. Preserve the entire immutable directory outside disposable worktree storage through an approved owner-controlled handoff.
- Push the quality branch and open a review PR to main. Do not merge or publish without review.
- Coordinate the final lowercase `certification` source branch with the parent only after the source is final; avoid overwriting another branch or sending a moving source target.

## Parent-owned native Power BI acceptance

- [ ] Record exact package SHA-256, source commit, tester/date, Desktop/service/browser versions and tenant policy.
- [ ] Import the package under approved tenant policy. Open the generated bound PBIP, refresh literal-M partitions, inspect people/machine capacity pages and native comparison pages.
- [ ] Confirm role bindings, custom-visual resource loading, unit, measure formats, native Date columns (not date hierarchies), label ordering and tooltip measures.
- [ ] Save a real PBIX in Desktop; close and reopen it. Never rename generated text/ZIP to PBIX.
- [ ] Exercise overload, positive/zero, zero/zero, missing, nonworking, partial periods, invalid/negative/extreme values, duplicate intersections and conflicting model order.
- [ ] Verify guarded upstream modeling against already-aggregated duplicate capacity. The visual cannot undo a model's multiplied measure.
- [ ] Exercise additive totals and nonadditive FTE/rates/overlapping periods; confirm partial/reduced/truncated results suppress all totals.
- [ ] Exercise real segmentation, accepted/rejected fetch, bounds, changing filters, empty bindings and blank unit.
- [ ] Verify native cell selection, modifier/touch multiselect, host highlighting, bookmarks, context menu, clear and disabled-interaction policy.
- [ ] Exercise repeated settings updates, multiple instances, tile resizing/scrolling, long labels and reopen lifecycle.
- [ ] Publish only to an approved test service workspace and verify service reading/editing modes and tenant custom-visual restrictions.
- [ ] Check keyboard/screen-reader navigation, panel focus, native touch menu, HC, RTL, zoom/text scaling and reduced motion in actual hosts.
- [ ] Review French translations and host locale/model number/date formatting; bundled resources are not linguistic sign-off.
- [ ] Demonstrate actual Atlyn Gantt interoperability using approved artifacts and stable shared model keys. No mocked integration claim.
- [ ] Exercise PDF/PowerPoint/image/native data exports where supported; record filters, loaded row count, viewport and scroll position. Do not claim exports include every scrolled/unloaded cell.

The PBIP and local mock-host evidence do not complete any of these native checkboxes. A native table or paginated-report alternative may be needed for complete printable output.

## Owner and publication acceptance

- [ ] Approve source/artwork ownership, contribution rights, third-party redistribution and proprietary source access for Microsoft review.
- [x] Owner approved on 2026-09-10: existing Atlyn storefront subscriptions for acquisition, ungated runtime and free shared viewing. No paid-author/viewer enforcement or runtime licensing integration is required.
- [ ] Confirm applicable existing subscription/checkout/distribution terms. Preserve first-party `UNLICENSED` status and absence of a first-party LICENSE/COPYING file; no relicensing or new source grant.
- [ ] Approve offer-specific EULA, privacy statement, support policy and publisher/company information.
- [ ] Verify the existing support URL/contact are publication-ready and monitored.
- [ ] Approve listing wording, categories, keywords, countries/locales and authentic screenshots. Do not call the visual certified or market-leading.
- [ ] At authorized submission, parent selects **Request Power BI certification** in Partner Center's Product setup and supplies the final source/reviewer-access details in Notes for certification.
- [ ] Record the request receipt and Microsoft's review decision. Use the official **Power BI certified** status/badge only after Microsoft grants certification; selecting the checkbox is not approval.
- [ ] Complete native sample report acceptance and attach the genuine PBIX required by the submission flow.
- [ ] Recheck current Microsoft/Partner Center criteria, reviewer repository access and final certification-source branch.
- [ ] Parent/authorized publisher performs Partner Center draft creation, validations and final submission. No live submission is implied by this dossier.

Runtime licensing is no longer a blocker. Native acceptance, final assets,
commercial/legal materials and the parent's final gate still apply. Hold main,
certification refs, merges and submission until that gate; use no hosted CI or
shared native UI from this session. No certification request receipt or Microsoft
grant is recorded here; native results are still forthcoming. No badge asset or
placement is pending from the parent. The accountable reviewers must record
**approved**, **blocked**, or **approved with limitations** for the remaining
gates with exact artifact identity. Only the explicitly recorded owner decision
above is approved by this checklist's evidence.
