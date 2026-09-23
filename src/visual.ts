import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { cellKey, Cell, resourceTotal, LIMITS } from "./model";
import { legendStates, markers, summarize } from "./presentation";
import { DataResult, readData } from "./data";
import { clampSetting, Settings } from "./settings";
import strings from "./strings.json";
import visualConfig from "../pbiviz.json";
import "../style/visual.less";

type Identity = powerbi.visuals.ISelectionId;
type TextKey = keyof typeof strings;
function isIdentity(value: powerbi.extensibility.ISelectionId): value is Identity {
  return value !== null && typeof value === "object" && ["includes", "equals", "getKey", "getSelector", "getSelectorsByColumn", "hasIdentity"]
    .every(key => key in value && typeof Reflect.get(value, key) === "function");
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

export class Visual implements powerbi.extensibility.visual.IVisual {
  private readonly host: powerbi.extensibility.visual.IVisualHost;
  private readonly container: HTMLElement;
  private readonly root = element("div", "atlyn-capacity");
  private readonly toolbar = element("div", "toolbar");
  private readonly caption = element("div", "caption");
  private readonly status = element("div", "status");
  private readonly legend = element("div", "legend");
  private readonly summary = element("div", "summary");
  private readonly context = element("div", "context-bar");
  private readonly tinySummary = element("div", "tiny-summary");
  private readonly inspector = element("aside", "inspector");
  private readonly inspectorBody = element("div", "inspector-body");
  private readonly closeDetails = element("button", "close-details", "x");
  private readonly scroller = element("div", "scroller");
  private readonly clearButton = element("button");
  private readonly moreButton = element("button");
  private readonly helpButton = element("button", "help", "?");
  private readonly detailsButton = element("button", "details-button", "i");
  private readonly nextButton = element("button", "next-exception");
  private readonly multiButton = element("button", "multi-select", "+");
  private readonly selection: powerbi.extensibility.ISelectionManager;
  private readonly emptyId: Identity;
  private readonly formatService: FormattingSettingsService;
  private readonly localization: powerbi.extensibility.ILocalizationManager;
  private settings = new Settings();
  private data?: DataResult;
  private selected: Identity[] = [];
  private disposed = false;
  private pending = false;
  private message = "";
  private timer?: ReturnType<typeof setTimeout>;
  private focusedKey?: string;
  private active?: HTMLTableCellElement;
  private rtl = false;
  private tiny = false;
  private compact = false;
  private percentFormatter?: Intl.NumberFormat;
  private numberLocale = "";
  private multiSelect = false;
  private panel: "details" | "guide" | undefined;
  private generation = 0;
  private requestSequence = 0;
  private press?: { pointerId: number; x: number; y: number; timer: ReturnType<typeof setTimeout> };
  private rendered: { td: HTMLTableCellElement; cell?: Cell<Identity>; identityKey?: string }[] = [];
  private identityKeys = new Set<string>();
  private selectionSignature?: string;
  private baseNotices = "";
  private touchContext?: { key: string; until: number };
  private lastTooltipTouch = false;
  private lastAllowInteractions?: boolean;
  private get allowInteractions(): boolean { return this.host.hostCapabilities?.allowInteractions !== false; }

  constructor(options?: powerbi.extensibility.visual.VisualConstructorOptions) {
    if (!options) throw new Error("Power BI constructor options are required");
    this.host = options.host;
    this.container = options.element;
    this.selection = this.host.createSelectionManager();
    this.emptyId = this.host.createSelectionIdBuilder().createSelectionId();
    this.localization = this.host.createLocalizationManager();
    this.formatService = new FormattingSettingsService(this.localization);
    this.root.setAttribute("role", "region");
    this.root.setAttribute("aria-label", this.t("Title"));
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.status.tabIndex = 0;
    this.tinySummary.tabIndex = 0;
    this.tinySummary.setAttribute("role", "status");
    this.inspector.setAttribute("aria-label", this.t("Details"));
    this.inspector.tabIndex = 0;
    this.inspector.hidden = true;
    this.closeDetails.setAttribute("aria-label", this.t("CloseDetails"));
    this.closeDetails.title = this.t("CloseDetails");
    this.inspector.append(this.closeDetails, this.inspectorBody);
    this.scroller.setAttribute("role", "region");
    this.scroller.setAttribute("aria-label", this.t("Title"));
    this.clearButton.textContent = this.t("ClearShort");
    this.clearButton.setAttribute("aria-label", this.t("Clear"));
    this.clearButton.title = this.t("Clear");
    this.moreButton.textContent = this.t("More");
    this.helpButton.title = this.t("Guide");
    this.helpButton.setAttribute("aria-label", this.t("Guide"));
    this.detailsButton.title = this.t("Details");
    this.detailsButton.setAttribute("aria-label", this.t("Details"));
    this.multiButton.title = this.t("MultiSelect");
    this.multiButton.setAttribute("aria-label", this.t("MultiSelect"));
    this.multiButton.setAttribute("aria-pressed", "false");
    this.nextButton.textContent = this.t("NextShort");
    this.nextButton.title = this.t("NextException");
    this.nextButton.setAttribute("aria-label", this.t("NextException"));
    const brand = element("strong", "brand", this.t("Title"));
    brand.title = this.t("ReadOnly");
    this.toolbar.append(brand, this.nextButton, this.clearButton, this.multiButton, this.moreButton, this.detailsButton, this.helpButton);
    this.root.append(this.toolbar, this.summary, this.caption, this.status, this.legend, this.scroller, this.context, this.inspector, this.tinySummary);
    options.element.append(this.root);
    this.root.addEventListener("click", this.click);
    this.root.addEventListener("keydown", this.keydown);
    this.root.addEventListener("contextmenu", this.contextmenu);
    this.container.addEventListener("contextmenu", this.contextmenu);
    this.scroller.addEventListener("mouseover", this.mouseover);
    this.scroller.addEventListener("mouseleave", this.hideTooltip);
    this.scroller.addEventListener("scroll", this.hideTooltip);
    this.scroller.addEventListener("focusin", this.focusin);
    this.scroller.addEventListener("focusout", this.hideTooltip);
    this.scroller.addEventListener("pointerdown", this.pointerdown);
    this.scroller.addEventListener("pointermove", this.pointermove);
    this.scroller.addEventListener("pointerup", this.cancelPress);
    this.scroller.addEventListener("pointercancel", this.cancelPress);
    this.selection.registerOnSelectCallback(ids => {
      if (!this.disposed) { this.requestSequence++; this.acceptSelection(ids); }
    });
  }

  private t(key: TextKey, ...args: (string | number)[]): string {
    const localized = this.localization.getDisplayName(key);
    const value = localized && localized !== key ? localized : strings[key];
    return value.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)] ?? ""));
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
    if (this.disposed) return;
    this.host.eventService.renderingStarted(options);
    try {
      if (![options.viewport.width, options.viewport.height].every(v => Number.isFinite(v) && v >= 0)) throw new Error("InvalidViewport");
      this.root.style.width = `${Math.max(0, options.viewport.width)}px`;
      this.root.style.height = `${Math.max(0, options.viewport.height)}px`;
      this.compact = options.viewport.width < 430 || options.viewport.height < 300;
      this.tiny = options.viewport.width < 200 || options.viewport.height < 140;
      this.root.classList.toggle("compact", this.compact);
      this.root.classList.toggle("tiny", this.tiny);
      this.tinySummary.hidden = !this.tiny;
      const hasDataUpdate = (options.type & powerbi.VisualUpdateType.Data) !== 0
        || ((options.type & powerbi.VisualUpdateType.Style) !== 0 && !!options.dataViews?.[0]) || !this.data;
      if (hasDataUpdate) {
        this.generation++;
        this.cancelPress();
        clearTimeout(this.timer);
        this.pending = false;
        this.message = "";
        const view = options.dataViews?.[0];
        this.settings = view ? this.formatService.populateFormattingSettingsModel(Settings, view) : new Settings();
        this.data = readData(view, this.host);
      }
      if (this.numberLocale !== this.host.locale || !this.percentFormatter) {
        this.numberLocale = this.host.locale;
        this.percentFormatter = new Intl.NumberFormat(this.host.locale, { style: "percent", maximumFractionDigits: 1 });
      }
      this.rtl = this.settings.layout.rtl.value === true || /^(ar|fa|he|ur)(-|$)/i.test(this.host.locale);
      this.root.dir = this.rtl ? "rtl" : "ltr";
      this.root.style.setProperty("--cell-width", `${clampSetting(this.settings.layout.cellWidth.value, 100, 260, 132)}px`);
      this.root.style.setProperty("--font-size", `${clampSetting(this.settings.layout.fontSize.value, 10, 22, 12)}px`);
      const palette = this.host.colorPalette;
      this.root.classList.toggle("high-contrast", palette.isHighContrast);
      this.root.style.setProperty("--fg", palette.isHighContrast ? palette.foreground.value : "#172c3b");
      this.root.style.setProperty("--bg", palette.isHighContrast ? palette.background.value : "#ffffff");
      this.root.style.setProperty("--focus", palette.isHighContrast ? palette.foreground.value : "#174db0");
      const selectionIds = this.selection.getSelectionIds();
      if (selectionIds.length > LIMITS.cells || !selectionIds.every(isIdentity)) throw new Error("InvalidSelectionIdentity");
      this.selected = selectionIds;
      const interactionChanged = this.lastAllowInteractions !== this.allowInteractions;
      this.lastAllowInteractions = this.allowInteractions;
      if (hasDataUpdate || interactionChanged) this.render();
      else { this.updateSummary(); this.updateControls(); this.paintSelection(); }
      this.host.eventService.renderingFinished(options);
    } catch (error) {
      // A lifecycle boundary reports failure to both the user and the host, never a success-shaped empty matrix.
      this.data = undefined;
      this.scroller.replaceChildren();
      this.rendered = []; this.identityKeys.clear(); this.inspector.hidden = true;
      this.status.textContent = this.t("RenderError");
      this.status.hidden = false;
      this.tinySummary.textContent = this.t("RenderError");
      this.tinySummary.setAttribute("aria-label", this.t("RenderError"));
      this.tinySummary.title = this.t("RenderError");
      this.summary.textContent = ""; this.caption.textContent = ""; this.context.textContent = "";
      this.legend.replaceChildren(); this.panel = undefined; this.updateControls();
      this.moreButton.hidden = true;
      this.host.eventService.renderingFailed(options, error instanceof Error ? error.name : "RenderError");
    }
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formatService.buildFormattingModel(this.settings);
  }

  private render(): void {
    const data = this.data;
    if (!data) return;
    const unit = typeof this.settings.analysis.unit.value === "string" ? this.settings.analysis.unit.value.trim() : "";
    this.caption.textContent = this.t("UnitCaption", unit.slice(0, 80));
    this.caption.title = this.caption.textContent;
    this.legend.replaceChildren(...legendStates.map(state => element("span", `legend-item state-${state}`, `${markers[state]} ${this.t(state)}`)));
    this.legend.title = this.t("Help");
    const previousScroll = { top: this.scroller.scrollTop, left: this.scroller.scrollLeft };
    const hadFocus = this.scroller.contains(document.activeElement);
    this.scroller.replaceChildren();
    this.rendered = []; this.identityKeys.clear(); this.selectionSignature = undefined;
    this.active = undefined;
    this.moreButton.hidden = !data.segmented || data.model.bounded || !!data.error;
    this.updateControls();
    let error = data.error ? this.t(data.error) : !unit || unit.length > 80 ? this.t("UnitRequired") : "";
    if (data.error === "keys" && data.keyDiagnostic) {
      const diagnostic = data.keyDiagnostic;
      error += ` ${this.t("KeyDiagnostic", visualConfig.visual.version, diagnostic.row,
        this.t(diagnostic.role === "resource" ? "Resource" : "RolePeriod"), diagnostic.actualType, diagnostic.expectedType)}`;
      if (diagnostic.serializedDate) {
        error += ` ${this.t("SerializedDateDiagnostic", diagnostic.serializedDate.format, diagnostic.serializedDate.validity)}`;
      }
    }
    this.status.hidden = false;
    if (error) {
      this.baseNotices = error;
      this.status.textContent = error;
      this.summary.textContent = this.t("ReadOnly");
      this.tinySummary.textContent = `${this.t("TinyTitle")}: ${error}`;
      this.tinySummary.setAttribute("aria-label", error); this.tinySummary.title = error;
      const setup = element("div", "onboarding");
      setup.append(element("h2", "", this.t("Onboarding")), element("p", "", this.t("OnboardingFields")),
        element("p", "", this.t("OnboardingUnit")), element("p", "", this.t("OnboardingGrain")));
      this.scroller.append(setup); this.context.textContent = ""; this.inspector.hidden = true; return;
    }
    const model = data.model;
    const notices: string[] = [];
    if (!this.allowInteractions) notices.push(this.t("InteractionsDisabled"));
    if (model.partial) notices.push(this.t("Partial"));
    if (data.reduced) notices.push(this.t("Reduced"));
    if (data.ambiguousLabels) notices.push(this.t("AmbiguousLabels"));
    if (model.bounded) notices.push(this.t("Bounds"));
    if (model.invalidCount || model.duplicateCount) notices.push(this.t("Problems", model.invalidCount, model.duplicateCount));
    if ([...model.cells.values()].some(c => c.state !== "duplicate" && !c.identity)) notices.push(this.t("NoIdentity"));
    if (data.hasHighlights) notices.push(this.t("HighlightHelp"));
    if (!model.resources.length) notices.push(this.t("Empty"));
    const totals = this.settings.analysis.additiveTotals.value === true;
    const additive = totals && data.additiveAllowed;
    if (totals && model.resources.some(r => !resourceTotal(model, r.key, additive))) notices.push(this.t("TotalsUnavailable"));
    this.caption.textContent += ` | ${this.t(totals ? "TotalsOn" : "TotalsOff")}`;
    this.caption.title = `${this.caption.textContent}. ${this.t("Scope", model.resources.length, model.periods.length, model.sourceRows)}`;
    this.baseNotices = notices.join(" ");
    this.showMessage(this.message);
    this.updateSummary();
    if (!model.resources.length) return;
    const table = element("table");
    table.setAttribute("role", "grid");
    table.setAttribute("aria-label", `${this.t("Title")}. ${this.caption.textContent}. ${this.t("Help")}`);
    table.setAttribute("aria-rowcount", String(model.resources.length + 1));
    table.setAttribute("aria-colcount", String(model.periods.length + 1 + (totals ? 1 : 0)));
    table.setAttribute("aria-multiselectable", "true");
    table.setAttribute("aria-readonly", "true");
    const thead = element("thead"), header = element("tr");
    header.append(element("th", "corner", this.t("Resource")));
    for (const p of model.periods) {
      const th = element("th", "", p.label); th.scope = "col"; th.title = p.rawLabel && p.rawLabel !== p.label ? `${p.label}\n${p.rawLabel}` : p.label; header.append(th);
    }
    if (totals) header.append(element("th", "", this.t("Total")));
    thead.append(header); table.append(thead);
    const tbody = element("tbody");
    for (const [r, resource] of model.resources.entries()) {
      const tr = element("tr");
      tr.setAttribute("aria-rowindex", String(r + 2));
      const rh = element("th", "resource", resource.label);
      rh.scope = "row"; rh.title = resource.rawLabel && resource.rawLabel !== resource.label ? `${resource.label}\n${resource.rawLabel}` : resource.label; tr.append(rh);
      for (const [c, period] of model.periods.entries()) {
        const key = cellKey(resource.key, period.key), cell = model.cells.get(key);
        const state = cell?.state ?? "absent";
        const td = element("td", `cell state-${state}`);
        td.dataset.key = key; td.dataset.row = String(r); td.dataset.col = String(c);
        td.setAttribute("role", "gridcell");
        td.setAttribute("aria-colindex", String(c + 2));
        td.tabIndex = -1;
        td.setAttribute("aria-selected", "false");
        const marker = element("span", "marker", markers[state]);
        marker.setAttribute("aria-hidden", "true");
        const label = cell ? `${cell.allocatedText} / ${cell.capacityText}` : "- / -";
        td.append(marker, element("span", "amounts", label));
        const percent = cell?.utilization != null ? this.percent(cell.utilization) : this.t("Undefined");
        td.append(element("small", "ratio", cell?.utilization != null ? percent
          : cell?.state === "overload" && cell.capacity === 0 ? this.t("ZeroCapacityShort") : this.t(state)));
        if (cell?.nonworking && state !== "nonworking") td.append(element("small", "", "N"));
        if (cell?.highlighted && data.hasHighlights) td.append(element("small", "highlight-label", `H ${cell.highlightAllocated ?? "-"} / ${cell.highlightCapacity ?? "-"}`));
        const items = this.tooltipItems(cell, resource.label, period.label);
        const description = items.map(item => `${item.displayName}: ${item.value}`).join(". ");
        td.setAttribute("aria-label", description);
        td.title = description;
        const identityKey = cell?.identity?.getKey();
        if (identityKey) this.identityKeys.add(identityKey);
        this.rendered.push({ td, cell, identityKey });
        tr.append(td);
      }
      if (totals) {
        const total = resourceTotal(model, resource.key, additive);
        const td = element("td", "total", total
          ? `${data.formatAllocated(total.allocated!)} / ${data.formatCapacity(total.capacity!)}`
          : this.t("Undefined"));
        td.title = total ? this.t("Total") : this.t("TotalsUnavailable");
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody); this.scroller.append(table);
    this.active = this.rendered.find(item => item.td.dataset.key === this.focusedKey)?.td ?? this.rendered[0]?.td;
    if (this.active) this.active.tabIndex = 0;
    this.paintSelection();
    if (this.active && hadFocus) this.active.focus({ preventScroll: true });
    this.scroller.scrollTop = previousScroll.top;
    this.scroller.scrollLeft = previousScroll.left;
    this.updateContext();
    if (this.panel) this.renderInspector();
  }

  private percent(value: number): string {
    return this.percentFormatter!.format(value);
  }

  private tooltipItems(cell: Cell<Identity> | undefined, resource: string, period: string): powerbi.extensibility.VisualTooltipDataItem[] {
    const items = [
      { displayName: this.t("Resource"), value: resource },
      { displayName: this.t("RolePeriod"), value: period },
      { displayName: this.t("Unit"), value: this.settings.analysis.unit.value },
      { displayName: this.t("Status"), value: this.t(cell?.state ?? "absent") }
    ];
    if (!cell) { items.push({ displayName: this.t("Status"), value: this.t("MissingRecord") }); return items; }
    items.push(
      { displayName: this.t("RoleAllocated"), value: cell.allocatedText },
      { displayName: this.t("RoleCapacity"), value: cell.capacityText },
      { displayName: this.t("Utilization"), value: cell.utilization == null ? this.t("Undefined") : this.percent(cell.utilization) },
      { displayName: this.t("Overload"), value: cell.overload == null ? this.t("Undefined") : this.data!.formatAllocated(cell.overload) }
    );
    if (cell.issue) items.push({ displayName: this.t("Status"), value: this.t(cell.issue) });
    if (cell.capacity === 0 && cell.allocated !== null && cell.allocated > 0) items.push({ displayName: this.t("Status"), value: this.t("ZeroCapacity") });
    if (cell.nonworking) items.push({ displayName: this.t("SuppliedNonworking"), value: this.t("Yes") });
    if (cell.highlightAllocated !== undefined) items.push({ displayName: this.t("HighlightedAllocation"), value: cell.highlightAllocated });
    if (cell.highlightCapacity !== undefined) items.push({ displayName: this.t("HighlightedCapacity"), value: cell.highlightCapacity });
    if (!cell.identity && cell.state !== "duplicate") items.push({ displayName: this.t("Status"), value: this.t("NoIdentityCell") });
    return items.concat(cell.tooltips);
  }

  private updateControls(): void {
    this.clearButton.disabled = !this.allowInteractions || this.selected.length === 0;
    this.multiButton.disabled = !this.allowInteractions;
    this.multiButton.setAttribute("aria-pressed", String(this.multiSelect));
    this.moreButton.disabled = this.pending || !this.allowInteractions;
    this.moreButton.textContent = this.t(this.pending ? "Loading" : "More");
    const unit = this.settings.analysis.unit.value;
    const ready = typeof unit === "string" && unit.trim().length > 0 && unit.trim().length <= 80;
    this.nextButton.disabled = !this.data || !!this.data.error || !ready
      || summarize(this.data.model).overloads === 0;
    this.detailsButton.disabled = !this.data || !!this.data.error || !ready;
  }
  private updateSummary(): void {
    const data = this.data;
    const unit = this.settings.analysis.unit.value;
    if (!data || data.error || typeof unit !== "string" || !unit.trim() || unit.trim().length > 80) return;
    const counts = summarize(data.model);
    const full = this.t("Summary", counts.overloads, counts.unknown, data.model.sourceRows);
    this.summary.textContent = this.compact ? this.t("SummaryCompact", counts.overloads, counts.unknown) : full;
    this.summary.title = `${full}. ${this.t("Scope", data.model.resources.length, data.model.periods.length, data.model.sourceRows)}`;
    this.summary.setAttribute("aria-label", this.summary.title);
    const tinyWarnings = [data.model.partial ? this.t("PartialShort") : "", data.model.bounded ? this.t("BoundShort") : ""].filter(Boolean).join(" ");
    const tinyState = !data.model.resources.length ? this.t("EmptyShort")
      : `${tinyWarnings ? `${tinyWarnings}\n` : ""}! ${counts.overloads} | ? ${counts.unknown}`;
    this.tinySummary.textContent = `${this.t("TinyTitle")}\n${tinyState}\n${this.t("TinyHelp")}\n${this.message}`;
    this.tinySummary.setAttribute("aria-label", `${full}. ${this.tinySummary.textContent}`);
    this.tinySummary.title = full;
  }
  private showMessage(message: string): void {
    this.message = message;
    this.status.textContent = [message, this.baseNotices].filter(Boolean).join(" ");
    this.status.hidden = !this.status.textContent;
    this.updateSummary();
  }
  private activeItems(): powerbi.extensibility.VisualTooltipDataItem[] {
    if (!this.active || !this.data) return [];
    const resource = this.data.model.resources[Number(this.active.dataset.row)];
    const period = this.data.model.periods[Number(this.active.dataset.col)];
    if (!resource || !period) return [];
    const items = this.tooltipItems(this.cell(this.active), resource.label, period.label);
    const cell = this.cell(this.active);
    if (cell?.allocated != null) items.push({ displayName: this.t("RawAllocated"), value: String(cell.allocated) });
    if (cell?.capacity != null) items.push({ displayName: this.t("RawCapacity"), value: String(cell.capacity) });
    if (resource.rawLabel && resource.rawLabel !== resource.label) items.push({ displayName: this.t("ModelResource"), value: resource.rawLabel });
    if (period.rawLabel && period.rawLabel !== period.label) items.push({ displayName: this.t("ModelPeriod"), value: period.rawLabel });
    return items;
  }
  private updateContext(): void {
    const items = this.activeItems();
    this.context.textContent = items.length ? items.slice(0, 4).map(item => item.value).join(" | ") : this.t("SelectForDetails");
    this.context.title = items.map(item => `${item.displayName}: ${item.value}`).join("\n");
    if (this.panel === "details") this.renderInspector();
  }
  private renderInspector(): void {
    this.inspector.hidden = !this.panel;
    if (!this.panel) return;
    this.inspector.setAttribute("aria-label", this.t(this.panel === "guide" ? "Guide" : "Details"));
    this.inspectorBody.replaceChildren(element("h2", "", this.t(this.panel === "guide" ? "Guide" : "Details")));
    if (this.panel === "guide") {
      this.inspectorBody.append(element("p", "", this.t("Help")), element("p", "", this.t("HighlightHelp")),
        element("p", "", this.t("OnboardingGrain")));
      for (const state of legendStates) this.inspectorBody.append(element("p", `legend-item state-${state}`, `${markers[state]} ${this.t(state)}`));
    } else {
      const dl = element("dl");
      for (const item of this.activeItems()) dl.append(element("dt", "", item.displayName), element("dd", "", item.value));
      if (this.data?.model.partial) this.inspectorBody.append(element("p", "detail-warning", this.t("Partial")));
      this.inspectorBody.append(dl);
    }
  }
  private openPanel(panel: "details" | "guide"): void {
    this.panel = panel; this.renderInspector(); this.closeDetails.focus();
  }
  private closePanel(): void {
    this.panel = undefined; this.inspector.hidden = true;
    if (this.active) this.active.focus({ preventScroll: true }); else this.helpButton.focus();
  }
  private nextException(): void {
    const exceptions = this.rendered.filter(item => item.cell?.state === "overload");
    if (!exceptions.length) return;
    const current = exceptions.findIndex(item => item.td === this.active);
    const next = exceptions[(current + 1) % exceptions.length];
    if (next) this.moveFocus(next.td);
  }
  private target(event: Event): HTMLTableCellElement | undefined {
    const target = event.target instanceof Element ? event.target.closest<HTMLTableCellElement>("td.cell") : null;
    return target && this.scroller.contains(target) ? target : undefined;
  }
  private cell(td: HTMLTableCellElement): Cell<Identity> | undefined { return this.data?.model.cells.get(td.dataset.key ?? ""); }
  private paintSelection(): void {
    const keys = new Set(this.selected.map(id => id.getKey()));
    const signature = JSON.stringify([...keys]);
    if (this.selectionSignature === signature) return;
    const partialIdentities = this.selected.filter(id => !this.identityKeys.has(id.getKey()));
    for (const { td, cell, identityKey } of this.rendered) {
      const selected = !!cell?.identity && (!!identityKey && keys.has(identityKey) || partialIdentities.some(id => id.includes(cell.identity!)));
      const dimmed = (this.selected.length > 0 && !selected) || (!!this.data?.hasHighlights && !cell?.highlighted);
      if (td.getAttribute("aria-selected") !== String(selected)) {
        td.classList.toggle("selected", selected); td.setAttribute("aria-selected", String(selected));
      }
      if (td.classList.contains("dimmed") !== dimmed) td.classList.toggle("dimmed", dimmed);
    }
    this.selectionSignature = signature;
    this.updateControls();
  }
  private interactionError = (): void => {
    if (!this.disposed) this.showMessage(this.t("InteractionError"));
  };
  private currentRequestError(generation: number, request: number): () => void {
    return () => {
      if (generation === this.generation && request === this.requestSequence) this.interactionError();
    };
  }
  private acceptSelection(ids: powerbi.extensibility.ISelectionId[]): void {
    if (ids.length > LIMITS.cells || !ids.every(isIdentity)) { this.interactionError(); return; }
    this.selected = ids;
    this.paintSelection();
  }
  private select(td: HTMLTableCellElement, multi: boolean): void {
    if (!this.allowInteractions) return;
    const identity = this.cell(td)?.identity;
    const generation = this.generation, request = ++this.requestSequence;
    try {
      if (identity) this.selection.select(identity, multi || this.multiSelect).then(ids => {
        if (!this.disposed && generation === this.generation && request === this.requestSequence) this.acceptSelection(ids);
      }, this.currentRequestError(generation, request));
    } catch { this.interactionError(); }
  }
  private clear(): void {
    if (!this.allowInteractions) return;
    const generation = this.generation, request = ++this.requestSequence;
    try {
      this.selection.clear().then(() => {
        if (!this.disposed && generation === this.generation && request === this.requestSequence) { this.selected = []; this.paintSelection(); }
      }, this.currentRequestError(generation, request));
    } catch { this.interactionError(); }
  }
  private loadMore(): void {
    if (!this.allowInteractions || this.pending || !this.data?.segmented || this.data.model.bounded) return;
    try { this.pending = this.host.fetchMoreData(true); }
    catch { this.interactionError(); return; }
    this.showMessage(this.t(this.pending ? "Loading" : "Rejected"));
    if (this.pending) this.timer = setTimeout(() => {
      if (!this.disposed && this.pending) this.showMessage(this.t("Waiting"));
    }, 15000);
    this.updateControls();
  }
  private click = (event: MouseEvent): void => {
    if (event.target === this.clearButton) this.clear();
    else if (event.target === this.moreButton) this.loadMore();
    else if (event.target === this.helpButton) this.openPanel("guide");
    else if (event.target === this.detailsButton) this.openPanel("details");
    else if (event.target === this.closeDetails) this.closePanel();
    else if (event.target === this.nextButton) this.nextException();
    else if (event.target === this.multiButton) { this.multiSelect = !this.multiSelect; this.updateControls(); }
    else {
      const td = this.target(event);
      if (td) {
        if (this.touchContext && this.touchContext.key === td.dataset.key && this.touchContext.until > Date.now()) { this.touchContext = undefined; return; }
        this.moveFocus(td); this.select(td, event.ctrlKey || event.metaKey || event.shiftKey);
        if ("pointerType" in event && event.pointerType === "touch") this.showTooltip(td, event.clientX, event.clientY, true);
      }
      else if (event.target === this.scroller || event.target === this.root) this.clear();
    }
  };
  private contextmenu = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const td = this.target(event);
    if (td && this.touchContext && this.touchContext.key === td.dataset.key && this.touchContext.until > Date.now()) {
      this.touchContext = undefined;
      return;
    }
    this.menu(td, event.clientX, event.clientY);
  };
  private menu(td: HTMLTableCellElement | undefined, x: number, y: number): void {
    if (!this.allowInteractions) return;
    const identity = td ? this.cell(td)?.identity : this.emptyId;
    if (!identity) return;
    const generation = this.generation;
    try {
      this.selection.showContextMenu(identity, { x, y }).then(() => undefined, () => {
        if (generation === this.generation) this.interactionError();
      });
    } catch { this.interactionError(); }
  }
  private keydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault(); this.hideTooltip();
      if (this.panel) this.closePanel(); else this.clear();
      return;
    }
    if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); this.nextException(); return; }
    const td = this.target(event), data = this.data;
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      const rect = td?.getBoundingClientRect() ?? (event.target instanceof Element ? event.target.getBoundingClientRect() : this.root.getBoundingClientRect());
      this.menu(td, rect.left, rect.top);
      return;
    }
    if (!td || !data) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.select(td, event.ctrlKey || event.metaKey || event.shiftKey); return; }
    let r = Number(td.dataset.row), c = Number(td.dataset.col);
    switch (event.key) {
      case "ArrowDown": r++; break;
      case "ArrowUp": r--; break;
      case "ArrowRight": c += this.rtl ? -1 : 1; break;
      case "ArrowLeft": c += this.rtl ? 1 : -1; break;
      case "Home": c = 0; if (event.ctrlKey) r = 0; break;
      case "End": c = data.model.periods.length - 1; if (event.ctrlKey) r = data.model.resources.length - 1; break;
      case "PageDown": r += Math.max(1, Math.floor(this.scroller.clientHeight / Math.max(1, td.offsetHeight)) - 1); break;
      case "PageUp": r -= Math.max(1, Math.floor(this.scroller.clientHeight / Math.max(1, td.offsetHeight)) - 1); break;
      default: return;
    }
    event.preventDefault();
    r = Math.max(0, Math.min(data.model.resources.length - 1, r));
    c = Math.max(0, Math.min(data.model.periods.length - 1, c));
    const next = this.scroller.querySelector<HTMLTableCellElement>(`[data-row="${r}"][data-col="${c}"]`);
    if (next) this.moveFocus(next);
  };
  private moveFocus(td: HTMLTableCellElement): void {
    if (this.active) this.active.tabIndex = -1;
    this.active = td; this.focusedKey = td.dataset.key; td.tabIndex = 0;
    this.updateContext();
    td.focus({ preventScroll: true });
    const viewport = this.scroller.getBoundingClientRect(), box = td.getBoundingClientRect();
    const header = this.scroller.querySelector("thead")?.getBoundingClientRect().height ?? 40;
    const pinnedWidth = this.scroller.querySelector(".resource")?.getBoundingClientRect().width ?? 160;
    if (box.top < viewport.top + header) this.scroller.scrollTop -= viewport.top + header - box.top;
    else if (box.bottom > viewport.bottom) this.scroller.scrollTop += box.bottom - viewport.bottom;
    const left = viewport.left + (this.rtl ? 0 : pinnedWidth), right = viewport.right - (this.rtl ? pinnedWidth : 0);
    if (box.left < left) this.scroller.scrollLeft -= left - box.left;
    else if (box.right > right) this.scroller.scrollLeft += box.right - right;
  }
  private showTooltip(td: HTMLTableCellElement, x: number, y: number, touch = false): void {
    const data = this.data, cell = this.cell(td);
    const resource = data?.model.resources[Number(td.dataset.row)], period = data?.model.periods[Number(td.dataset.col)];
    try {
      if (resource && period && this.host.tooltipService.enabled()) {
        this.lastTooltipTouch = touch;
        this.host.tooltipService.show({
          coordinates: [x, y], isTouchEvent: touch, dataItems: this.tooltipItems(cell, resource.label, period.label),
          identities: cell?.identity ? [cell.identity] : []
        });
      }
    } catch { this.interactionError(); }
  }
  private mouseover = (event: MouseEvent): void => {
    const td = this.target(event);
    if (td) this.showTooltip(td, event.clientX, event.clientY);
  };
  private focusin = (event: FocusEvent): void => {
    const td = this.target(event);
    if (!td) return;
    if (this.active) this.active.tabIndex = -1;
    this.active = td; this.focusedKey = td.dataset.key; td.tabIndex = 0;
    this.updateContext();
    const rect = td.getBoundingClientRect(); this.showTooltip(td, rect.left, rect.bottom);
  };
  private cancelPress = (): void => { if (this.press) clearTimeout(this.press.timer); this.press = undefined; };
  private pointerdown = (event: PointerEvent): void => {
    this.cancelPress();
    const td = this.target(event);
    if (event.pointerType !== "touch" || !td) return;
    const { pointerId, clientX: x, clientY: y } = event;
    const generation = this.generation;
    this.press = { pointerId, x, y, timer: setTimeout(() => {
      if (this.disposed || generation !== this.generation) return;
      this.touchContext = { key: td.dataset.key ?? "", until: Date.now() + 800 };
      this.moveFocus(td); this.menu(td, x, y); this.cancelPress();
    }, 550) };
  };
  private pointermove = (event: PointerEvent): void => {
    if (this.press && (event.pointerId !== this.press.pointerId || Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > 8)) this.cancelPress();
  };
  private hideTooltip = (): void => {
    this.cancelPress();
    try { this.host.tooltipService.hide({ isTouchEvent: this.lastTooltipTouch, immediately: true }); }
    catch { this.interactionError(); }
  };

  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++; clearTimeout(this.timer); this.hideTooltip();
    this.root.removeEventListener("click", this.click);
    this.root.removeEventListener("keydown", this.keydown);
    this.root.removeEventListener("contextmenu", this.contextmenu);
    this.container.removeEventListener("contextmenu", this.contextmenu);
    this.scroller.removeEventListener("mouseover", this.mouseover);
    this.scroller.removeEventListener("mouseleave", this.hideTooltip);
    this.scroller.removeEventListener("scroll", this.hideTooltip);
    this.scroller.removeEventListener("focusin", this.focusin);
    this.scroller.removeEventListener("focusout", this.hideTooltip);
    this.scroller.removeEventListener("pointerdown", this.pointerdown);
    this.scroller.removeEventListener("pointermove", this.pointermove);
    this.scroller.removeEventListener("pointerup", this.cancelPress);
    this.scroller.removeEventListener("pointercancel", this.cancelPress);
    this.selection.registerOnSelectCallback(() => undefined);
    this.data = undefined; this.selected = []; this.active = undefined; this.focusedKey = undefined;
    this.scroller.replaceChildren(); this.root.remove();
    this.rendered = []; this.identityKeys.clear(); this.inspectorBody.replaceChildren();
  }
}
