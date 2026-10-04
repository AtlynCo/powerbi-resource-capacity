# Ownership and third-party review

## Atlyn source

This is a private, proprietary source repository. There is no tracked first-party `LICENSE` or `COPYING` file. `package.json` declares `UNLICENSED`; no open-source grant for Atlyn's source is supplied. This documentation update preserves that state and does not add, replace or relicense first-party terms.

On 2026-09-10 the owner approved **storefront subscriptions, ungated visuals**:
existing Atlyn subscriptions govern external acquisition, while the visual
runtime has no licensing checks or feature gates and shared viewing is free.
This is not runtime paid-author or viewer enforcement. It requires no license
keys, new signer, AAD flow, entitlement API, WebAccess or external runtime calls.
Runtime access behavior and source licensing are separate: free shared viewing
does not create an open-source or source-redistribution grant.

The original capacity-grid motif in `assets\icon.svg` and its PNG generation script are part of this source. They do not copy vendor artwork or imply a Microsoft certification badge.

Before any release, the responsible owner must review source ownership, contributor permissions, existing subscription/distribution terms, EULA, privacy statement, trademarks and support commitments. The acquisition/runtime model is decided; implementing licensing enforcement is not a remaining task. No broader legal review is represented as completed here.

## Actual runtime utility dependencies

The current package and lockfile include these Microsoft utility libraries:

| Component | Version | Relationship | Declared license |
|---|---|---|---|
| `powerbi-visuals-utils-formattingmodel` | 7.1.0 | Direct runtime dependency | MIT |
| `powerbi-visuals-utils-formattingutils` | 7.0.0 | Direct runtime dependency | MIT |
| `powerbi-visuals-utils-dataviewutils` | 7.0.0 | Transitive runtime utility | MIT |
| `powerbi-visuals-utils-typeutils` | 7.0.0 | Transitive runtime utility | MIT |

See the actual [third-party notices](../THIRD-PARTY-NOTICES.txt) and installed package license files. Version numbers and dependency classifications must be rechecked against the release lockfile and bundle after any dependency change.

`THIRD-PARTY-NOTICES.txt` is provided at the repository root. The visual stylesheet also carries the full MIT notice in a preserved license comment so it can accompany the packaged CSS. The notices cover Microsoft's utilities and the bundled Globalize/culture data embedded in `formattingutils`; Globalize offers MIT or GPL Version 2, and this distribution uses the MIT option with Software Freedom Conservancy, Inc. attribution. Inspect the final package to confirm notices survive compilation and minification; their presence does not constitute legal approval.

Build and test tooling is not an external runtime service. It still needs license review if redistributed. A production-only vulnerability audit does not review every development dependency and is not an inventory of all bundled code.

The quality pass explicitly pins the existing official `eslint-plugin-powerbi-visuals` 1.1.1 for source lint and Ajv 6.15.0 for local sample-schema validation. Both are MIT-licensed development dependencies, not additions to the visual runtime or external visual services. Schema validation downloads public Microsoft schemas without uploading the sample.

## Build-only patched overrides

The manifest pins two transitive dependencies used by development/build tooling:

| Parent dependency | Override | Purpose |
|---|---|---|
| `webpack-dev-server` | `qs` 6.16.0 | Replace the vulnerable transitive parser version without downgrading the current Power BI SDK |
| `sockjs` | `uuid` 11.1.1 | Replace the vulnerable transitive UUID version while preserving the CommonJS API used by SockJS |

The inspected SockJS call site uses `require('uuid').v4()` without arguments; UUID 11.1.1 supplies that CommonJS call. Keep the compatibility check tied to the exact lockfile and repeat it when changing SockJS, UUID, or the SDK.

These are build-only overrides, not external services used by the packaged visual. The packaging workflow invokes `pbiviz package`, not the SDK development server; no SDK development server is required or started for packaging.

The Windows PowerShell wrapper isolates SDK home in `.tmp\tool-home` and supplies only a public-certificate PFX for package-time lookup. The private RSA key exists only in memory and is not exported; no certificate-store or trust changes are made. Packaging uses `--no-stats` to avoid the SDK's outside-worktree statistics path. Browser installation/testing uses a separate wrapper with downloaded Chromium in `.tmp\browsers` and scratch files in `.tmp\browser-tmp`. Alternatively, `CAPACITY_BROWSER_CHANNEL=msedge` selects an existing Edge Chromium installation without installing a new browser. Use the repository npm scripts to preserve the configured behavior.

Run `npm run audit:all-dependencies` to include development dependencies and `npm run audit:dependencies` for the production-only scope. `npm run audit:sdk` invokes the SDK's `pbiviz package --certification-audit` path; it is distinct from the repository's `audit:certification` package-inspection script.

**Historical recorded result, September 9, 2026:** both runtime and full npm dependency audits reported **zero vulnerabilities** after the focused overrides. This is a point-in-time result for the historical lockfile, not the current PR candidate; it does not establish license approval, Microsoft certification, or safety of later dependency updates.

**Current PR #6 audit, October 4, 2026:** `npm audit --package-lock-only --json` against the committed lockfile exited **1** and reported **6 High, 0 Moderate, 0 Critical, 0 Low** findings across 657 dependencies (7 production, 650 development, 42 optional). The six affected audit entries are `braces`, `chokidar`, `micromatch`, `http-proxy-middleware`, `webpack-dev-server`, and `powerbi-visuals-tools`; they all trace to the single high-severity [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) advisory for `braces <=3.0.3`. GitHub advisory metadata has no first patched version. The recorded full JSON and summary are under `dist\local-evidence\full-dependency-audit.json` and `full-dependency-audit-summary.json`, keyed to the exact lockfile SHA-256.

The lockfile uses `powerbi-visuals-tools` **7.2.1** and `powerbi-visuals-api` **5.11.1**. The reported 7.2.2 GitHub release does not provide a complete installable npm package; the configured Microsoft npm feed returned E404, and public npm TLS verification was unavailable. Do not synthesize or vendor a package. npm offers only `powerbi-visuals-tools@1.7.2` as a `semver-major` fix, which is not an acceptable compatibility-preserving remedy. Do not suppress this advisory, force an override, or downgrade the SDK. The production-only `npm run audit:dependencies` did report zero vulnerabilities, but that does not satisfy Microsoft's full `npm audit` requirement. **The full audit is a release-freeze blocker until a compatible upstream patch becomes installable and the full audit passes.**

These current results supersede the historical zero-finding result for release-readiness decisions. Preserve the historical record as history; never describe the current full dependency audit as clean.

The historical 1.0.1.0 local logs record passing source, SDK, package and sample-schema gates, **225 unit/host/sample tests**, and **55 compiled-package browser checks**; see the [engineering evidence snapshot](submission-checklist.md#historical-1010-engineering-evidence). The 1.0.2.0 native Date retry has separate targeted evidence. Installed Edge Chromium was the browser channel. Edge harness results are not Desktop/service-host proof. Do not infer completed manual acceptance or notice/license approval from automated checks alone.

## Release audit gate

- Inspect the exact release `package-lock.json`, installed package manifests/license texts, and emitted bundle.
- Confirm all bundled dependencies are reviewable and compatible with intended proprietary distribution and certification requirements.
- Preserve required copyright/license notices in the delivered artifact or accompanying materials as appropriate after review; verify both the root notice and the full Microsoft/Globalize MIT notice retained in packaged CSS.
- Run both production and full dependency audits; assess findings rather than asserting “secure” from an exit code alone.
- Inspect transitive dependencies and overrides; an override is not evidence of API compatibility.
- Confirm no remote fonts, images, service calls, dynamic code, telemetry, license-check backend, or hidden network requirement entered the production visual.
- Record the reviewer, date, artifact hash, findings, and disposition before release.

This document is an engineering inventory and a review checklist, not legal advice, completed approval, a security certification, or a warranty.
