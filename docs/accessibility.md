# Accessibility and Power BI host behavior

These are the first-release interaction contract and manual acceptance targets. Automated browser tests do not replace testing the real Desktop and service hosts with assistive technology.

The retained validation log records **9/9 compiled-package browser checks passing**; the coordinator confirmed execution in installed Edge Chromium using `CAPACITY_BROWSER_CHANNEL=msedge`. The optional stalled Chromium download was cancelled, not used as evidence. This is actual browser execution of the built package in the test harness, not Power BI Desktop/service integration or assistive-technology sign-off.

## Keyboard and selection

| Action | Keyboard |
|---|---|
| Enter/leave the visual and its controls | Tab / Shift+Tab; Power BI may have its own focus-entry step |
| Move through cells | Arrow keys |
| First/last period in the current row | Home / End |
| First/last cell in the grid | Ctrl+Home / Ctrl+End |
| Move through visible rows | Page Up / Page Down |
| Select the focused intersection | Enter / Space |
| Multiselect | Ctrl, Command, or Shift with selection |
| Clear selection | Escape |
| Open native context menu | Shift+F10 / Context Menu key |
| Request the next bounded host segment | Focus **Load more**, then Enter / Space |

Pointer selection and context menus use host identities for the resource-period intersection. Native tooltip support includes the primary values and optional tooltip measures. Power BI controls what context actions are available.

If `hostCapabilities.allowInteractions` is explicitly `false`, the visual displays an interactions-disabled notice and suppresses selection, clearing, context menus, and **Load more**. Disabled buttons cannot issue those host calls; keyboard navigation remains available. Test this read-only host-policy mode separately from a normal report's interaction settings.

Check keyboard focus after filtering, resizing, fetching more rows, changing format settings, and clearing selection. Moving to an offscreen cell must bring it into the tile's viewport; focus must not disappear behind a sticky header.

The visual declares both `supportsLandingPage` and `supportsEmptyDataView`. With no fields bound, it provides binding/setup guidance rather than requiring a populated data view to render. Empty filters and missing required bindings must remain understandable and keyboard-accessible.

## Not color alone

Amounts, status text/symbols, and accessible labels must distinguish overload, missing, invalid, unavailable, and explicitly nonworking cells without relying only on hue. In host high-contrast mode, use the host's foreground/background and selection palette rather than assuming the regular heatmap colors remain legible.

Verify with a screen reader that each cell communicates its resource, period, allocation, capacity, status, and any nonworking assertion; an undefined ratio must not be announced as an ordinary percentage.

RTL layout is enabled automatically for host locales beginning with `ar`, `fa`, `he`, or `ur` (including regional variants), and can also be enabled explicitly with `layout.rtl`. The toggle defaults to off but does not override automatic RTL detection. Verify column direction, sticky resource labels, arrow-key behavior, scrollbar placement, and context-menu positioning in an actual RTL host/report. A numeric amount and its unit must remain readable.

Respect the operating system's reduced-motion preference. No animation may be required to understand an overload or obtain a stable result.

## Localization and sizing

English source strings provide fallback text when the host does not resolve a localized key. A complete `fr-FR` resource bundle is included; this is not a claim of completed French linguistic or host acceptance. Dates and numbers use the host locale and bound model formats. Automatic RTL support does not imply that Arabic, Persian, Hebrew, or Urdu translations are bundled.

`layout.cellWidth` defaults to 132 px and is rendered within 100–260 px. `layout.fontSize` defaults to 12 px and is rendered within 10–22 px. Nonfinite values fall back to their defaults. Test the extremes with translated strings, long resource labels, browser zoom, and a screen reader; wider cells still scroll inside the tile.

## Scroll inside the tile

The resource and period headers stay visible while the grid scrolls within the allocated visual area. A wide horizon or many resources must not expand the report canvas or hide report-level controls. Test a small tile and a large grid, not only a full-screen visual.

## Host filtering is not scheduling

Use **Edit interactions** to decide which report visuals filter or highlight one another. Multiselect is a set of host selection identities, not an instruction to add amounts together or write assignments.

Test incoming filters, highlight updates, clear selection, multi-visual selection, and a filter that replaces the entire resource/period universe. A stale host identity must not be mistaken for a newly loaded cell.

## Export limitations

PDF, PowerPoint, image, subscription, and service export behavior requires separate manual verification. Rendering lifecycle events can tell the host when rendering finishes; they do not guarantee that every offscreen cell or unloaded segment is included.

**Do not promise a full-grid export of a scrolled tile.** An exported image may represent the visible viewport. Use narrower report filters, dedicated report pages, or a native table/paginated report when a complete printable schedule is needed.

There is no custom data-export backend or writeback service. Power BI's native data export remains subject to report configuration and tenant policy.

Record host/version, viewport, loaded row count, filter context, scroll position, output format, and observed result in release evidence. Screenshots from a browser harness are not Power BI Desktop screenshots and must be labeled as such.
