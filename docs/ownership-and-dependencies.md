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

**Recorded result, September 9, 2026:** both runtime and full npm dependency audits reported **zero vulnerabilities** after the focused overrides. These point-in-time dependency results do not establish license approval, Microsoft certification, or safety of future dependency updates. Archive the audit evidence with the exact release lockfile and rerun after changes.

The final local logs record passing source, SDK, package and sample-schema gates, **225 unit/host/sample tests**, and **55 compiled-package browser checks**; see the [engineering evidence snapshot](submission-checklist.md#current-engineering-evidence). Installed Edge Chromium was the browser channel. Edge harness results are not Desktop/service-host proof. Do not infer completed manual acceptance or notice/license approval from automated checks alone.

## Release audit gate

- Inspect the exact release `package-lock.json`, installed package manifests/license texts, and emitted bundle.
- Confirm all bundled dependencies are reviewable and compatible with intended proprietary distribution and certification requirements.
- Preserve required copyright/license notices in the delivered artifact or accompanying materials as appropriate after review; verify both the root notice and the full Microsoft/Globalize MIT notice retained in packaged CSS.
- Run both production and full dependency audits; assess findings rather than asserting “secure” from an exit code alone.
- Inspect transitive dependencies and overrides; an override is not evidence of API compatibility.
- Confirm no remote fonts, images, service calls, dynamic code, telemetry, license-check backend, or hidden network requirement entered the production visual.
- Record the reviewer, date, artifact hash, findings, and disposition before release.

This document is an engineering inventory and a review checklist, not legal advice, completed approval, a security certification, or a warranty.
