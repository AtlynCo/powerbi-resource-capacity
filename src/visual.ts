import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { cellKey, Cell, State, resourceTotal } from "./model";
import { DataResult, readData } from "./data";
import { clampSetting, Settings } from "./settings";
import strings from "./strings.json";
import "../style/visual.less";

type Identity = powerbi.visuals.ISelectionId;
type TextKey = keyof typeof strings;
function isIdentity(value: powerbi.extensibility.ISelectionId): value is Identity {
  return ["includes", "equals", "getKey", "getSelector", "getSelectorsByColumn", "hasIdentity"]
    .every(key => key in value && typeof Reflect.get(value, key) === "function");
}
const markers: Record<State, string> = {
  available: "+", full: "=", overload: "!", nonworking: "N", unavailable: "/", missing: "?", invalid: "X", duplicate: "D", absent: "?"
};
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

export class Visual implements powerbi.extensibility.visual.IVisual {
  private readonly host: powerbi.extensibility.visual.IVisualHost;
  private readonly root = element("div", "atlyn-capacity");
  private readonly toolbar = element("div", "toolbar");
  private readonly caption = element("div", "caption");
  private readonly status = element("div", "status");
  private readonly legend = element("div", "legend");
  private readonly scroller = element("div", "scroller");
  private readonly clearButton = element("button");
  private readonly moreButton = element("button");
  private readonly helpButton = element("button", "help", "?");
  private readonly selection: powerbi.extensibility.ISelectionManager;
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
  private get allowInteractions(): boolean { return this.host.hostCapabilities?.allowInteractions !== false; }

  constructor(options?: powerbi.extensibility.visual.VisualConstructorOptions) {
    if (!options) throw new Error("Power BI constructor options are required");
    this.host = options.host;
    this.selection = this.host.createSelectionManager();
    this.localization = this.host.createLocalizationManager();
    this.formatService = new FormattingSettingsService(this.localization);
    this.root.setAttribute("role", "region");
    this.root.setAttribute("aria-label", this.t("Title"));
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.status.tabIndex = 0;
    this.scroller.setAttribute("role", "region");
    this.scroller.setAttribute("aria-label", this.t("Title"));
    this.clearButton.textContent = this.t("Clear");
    this.moreButton.textContent = this.t("More");
    this.helpButton.title = this.t("Help");
    this.helpButton.setAttribute("aria-label", this.t("Help"));
    this.toolbar.append(element("strong", "", this.t("Title")), this.clearButton, this.moreButton, this.helpButton);
    this.root.append(this.toolbar, this.caption, this.status, this.legend, this.scroller);
    options.element.append(this.root);
    this.root.addEventListener("click", this.click);
    this.root.addEventListener("keydown", this.keydown);
    this.root.addEventListener("contextmenu", this.contextmenu);
    this.scroller.addEventListener("mouseover", this.mouseover);
    this.scroller.addEventListener("mouseleave", this.hideTooltip);
    this.scroller.addEventListener("scroll", this.hideTooltip);
    this.scroller.addEventListener("focusin", this.focusin);
    this.scroller.addEventListener("focusout", this.hideTooltip);
    this.selection.registerOnSelectCallback(ids => {
      if (!this.disposed) this.acceptSelection(ids);
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
      this.root.style.width = `${Math.max(0, options.viewport.width)}px`;
      this.root.style.height = `${Math.max(0, options.viewport.height)}px`;
      this.root.classList.toggle("compact", options.viewport.width < 430 || options.viewport.height < 250);
      const hasDataUpdate = (options.type & powerbi.VisualUpdateType.Data) !== 0 || !this.data;
      if (hasDataUpdate) {
        clearTimeout(this.timer);
        this.pending = false;
        this.message = "";
        const view = options.dataViews?.[0];
        this.settings = view ? this.formatService.populateFormattingSettingsModel(Settings, view) : new Settings();
        this.data = readData(view, this.host);
      }
      this.rtl = this.settings.layout.rtl.value || /^(ar|fa|he|ur)(-|$)/i.test(this.host.locale);
      this.root.dir = this.rtl ? "rtl" : "ltr";
      this.root.style.setProperty("--cell-width", `${clampSetting(this.settings.layout.cellWidth.value, 100, 260, 132)}px`);
      this.root.style.setProperty("--font-size", `${clampSetting(this.settings.layout.fontSize.value, 10, 22, 12)}px`);
      const palette = this.host.colorPalette;
      this.root.classList.toggle("high-contrast", palette.isHighContrast);
      this.root.style.setProperty("--fg", palette.isHighContrast ? palette.foreground.value : "#172c3b");
      this.root.style.setProperty("--bg", palette.isHighContrast ? palette.background.value : "#ffffff");
      this.root.style.setProperty("--focus", palette.isHighContrast ? palette.foreground.value : "#174db0");
      const selectionIds = this.selection.getSelectionIds();
      if (!selectionIds.every(isIdentity)) throw new Error("InvalidSelectionIdentity");
      this.selected = selectionIds;
      if (hasDataUpdate) this.render();
      else this.paintSelection();
      this.host.eventService.renderingFinished(options);
    } catch (error) {
      // A lifecycle boundary reports failure to both the user and the host, never a success-shaped empty matrix.
      this.data = undefined;
      this.scroller.replaceChildren();
      this.status.textContent = this.t("RenderError");
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
    this.legend.textContent = this.t("Legend");
    this.legend.title = this.t("Help");
    const previousScroll = { top: this.scroller.scrollTop, left: this.scroller.scrollLeft };
    const hadFocus = this.scroller.contains(document.activeElement);
    this.scroller.replaceChildren();
    this.active = undefined;
    this.moreButton.hidden = !data.segmented || data.model.bounded || !!data.error;
    this.clearButton.disabled = !this.allowInteractions;
    this.moreButton.disabled = this.pending || !this.allowInteractions;
    this.moreButton.textContent = this.t(this.pending ? "Loading" : "More");
    const error = data.error ? this.t(data.error) : !unit || unit.length > 80 ? this.t("UnitRequired") : "";
    if (error) { this.status.textContent = error; return; }
    const model = data.model;
    const notices: string[] = [];
    if (!this.allowInteractions) notices.push(this.t("InteractionsDisabled"));
    if (model.partial) notices.push(this.t("Partial"));
    if (data.reduced) notices.push(this.t("Reduced"));
    if (model.bounded) notices.push(this.t("Bounds"));
    if (model.invalidCount || model.duplicateCount) notices.push(this.t("Problems", model.invalidCount, model.duplicateCount));
    if ([...model.cells.values()].some(c => c.state !== "duplicate" && !c.identity)) notices.push(this.t("NoIdentity"));
    if (data.hasHighlights) notices.push(this.t("HighlightHelp"));
    if (!model.resources.length) notices.push(this.t("Empty"));
    const totals = this.settings.analysis.additiveTotals.value;
    const additive = totals && data.additiveAllowed;
    if (totals && model.resources.some(r => !resourceTotal(model, r.key, additive))) notices.push(this.t("TotalsUnavailable"));
    notices.push(this.t("Scope", model.resources.length, model.periods.length, model.sourceRows));
    if (this.message) notices.unshift(this.message);
    this.status.textContent = notices.join(" ");
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
      const th = element("th", "", p.label); th.scope = "col"; th.title = p.label; header.append(th);
    }
    if (totals) header.append(element("th", "", this.t("Total")));
    thead.append(header); table.append(thead);
    const tbody = element("tbody");
    for (const [r, resource] of model.resources.entries()) {
      const tr = element("tr");
      tr.setAttribute("aria-rowindex", String(r + 2));
      const rh = element("th", "resource", resource.label);
      rh.scope = "row"; rh.title = resource.label; tr.append(rh);
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
        td.append(element("small", "ratio", cell?.utilization != null ? percent : this.t(state)));
        if (cell?.nonworking && state !== "nonworking") td.append(element("small", "", "N"));
        if (cell?.highlighted && data.hasHighlights) td.append(element("small", "highlight-label", `H ${cell.highlightAllocated ?? "-"} / ${cell.highlightCapacity ?? "-"}`));
        const items = this.tooltipItems(cell, resource.label, period.label);
        const description = items.map(item => `${item.displayName}: ${item.value}`).join(". ");
        td.setAttribute("aria-label", description);
        td.title = description;
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
    this.active = [...this.scroller.querySelectorAll<HTMLTableCellElement>(".cell")].find(td => td.dataset.key === this.focusedKey)
      ?? this.scroller.querySelector<HTMLTableCellElement>(".cell") ?? undefined;
    if (this.active) {
      this.active.tabIndex = 0;
      if (hadFocus) this.active.focus({ preventScroll: true });
    }
    this.scroller.scrollTop = previousScroll.top;
    this.scroller.scrollLeft = previousScroll.left;
    this.paintSelection();
  }

  private percent(value: number): string {
    return new Intl.NumberFormat(this.host.locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
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
    return items.concat(cell.tooltips);
  }

  private target(event: Event): HTMLTableCellElement | undefined {
    return event.target instanceof Element ? event.target.closest<HTMLTableCellElement>("td.cell") ?? undefined : undefined;
  }
  private cell(td: HTMLTableCellElement): Cell<Identity> | undefined { return this.data?.model.cells.get(td.dataset.key ?? ""); }
  private paintSelection(): void {
    for (const td of this.scroller.querySelectorAll<HTMLTableCellElement>(".cell")) {
      const cell = this.cell(td);
      const selected = !!cell?.identity && this.selected.some(id => id.includes(cell.identity!));
      td.classList.toggle("selected", selected);
      td.setAttribute("aria-selected", String(selected));
      td.classList.toggle("dimmed", (this.selected.length > 0 && !selected) || (!!this.data?.hasHighlights && !cell?.highlighted));
    }
  }
  private interactionError = (): void => {
    if (!this.disposed) { this.message = this.t("InteractionError"); this.render(); }
  };
  private acceptSelection(ids: powerbi.extensibility.ISelectionId[]): void {
    if (!ids.every(isIdentity)) { this.interactionError(); return; }
    this.selected = ids;
    this.paintSelection();
  }
  private select(td: HTMLTableCellElement, multi: boolean): void {
    if (!this.allowInteractions) return;
    const identity = this.cell(td)?.identity;
    if (identity) this.selection.select(identity, multi).then(ids => {
      if (!this.disposed) this.acceptSelection(ids);
    }, this.interactionError);
  }
  private clear(): void {
    if (!this.allowInteractions) return;
    this.selection.clear().then(() => {
      if (!this.disposed) { this.selected = []; this.paintSelection(); }
    }, this.interactionError);
  }
  private loadMore(): void {
    if (!this.allowInteractions || this.pending || !this.data?.segmented || this.data.model.bounded) return;
    this.pending = this.host.fetchMoreData(true);
    this.message = this.t(this.pending ? "Loading" : "Rejected");
    if (this.pending) this.timer = setTimeout(() => {
      if (!this.disposed && this.pending) { this.message = this.t("Waiting"); this.render(); }
    }, 15000);
    this.render();
  }
  private click = (event: MouseEvent): void => {
    if (event.target === this.clearButton) this.clear();
    else if (event.target === this.moreButton) this.loadMore();
    else if (event.target === this.helpButton) { this.message = this.t("Help"); this.render(); }
    else {
      const td = this.target(event);
      if (td) { this.moveFocus(td); this.select(td, event.ctrlKey || event.metaKey || event.shiftKey); }
      else if (event.target === this.scroller || event.target === this.root) this.clear();
    }
  };
  private contextmenu = (event: MouseEvent): void => {
    event.preventDefault();
    const identity = this.target(event) && this.cell(this.target(event)!)?.identity;
    if (identity && this.allowInteractions) this.selection.showContextMenu(identity, { x: event.clientX, y: event.clientY }).then(() => undefined, this.interactionError);
  };
  private keydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") { event.preventDefault(); this.hideTooltip(); this.clear(); return; }
    const td = this.target(event), data = this.data;
    if (!td || !data) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.select(td, event.ctrlKey || event.metaKey || event.shiftKey); return; }
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault(); const box = td.getBoundingClientRect(), id = this.cell(td)?.identity;
      if (id && this.allowInteractions) this.selection.showContextMenu(id, { x: box.left, y: box.top }).then(() => undefined, this.interactionError);
      return;
    }
    let r = Number(td.dataset.row), c = Number(td.dataset.col);
    switch (event.key) {
      case "ArrowDown": r++; break;
      case "ArrowUp": r--; break;
      case "ArrowRight": c += this.rtl ? -1 : 1; break;
      case "ArrowLeft": c += this.rtl ? 1 : -1; break;
      case "Home": c = 0; if (event.ctrlKey) r = 0; break;
      case "End": c = data.model.periods.length - 1; if (event.ctrlKey) r = data.model.resources.length - 1; break;
      case "PageDown": r += Math.max(1, Math.floor(this.scroller.clientHeight / td.offsetHeight) - 1); break;
      case "PageUp": r -= Math.max(1, Math.floor(this.scroller.clientHeight / td.offsetHeight) - 1); break;
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
  private showTooltip(td: HTMLTableCellElement, x: number, y: number): void {
    if (!this.host.tooltipService.enabled()) return;
    const data = this.data, cell = this.cell(td);
    const resource = data?.model.resources[Number(td.dataset.row)], period = data?.model.periods[Number(td.dataset.col)];
    if (resource && period) this.host.tooltipService.show({
      coordinates: [x, y], isTouchEvent: false, dataItems: this.tooltipItems(cell, resource.label, period.label),
      identities: cell?.identity ? [cell.identity] : []
    });
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
    const rect = td.getBoundingClientRect(); this.showTooltip(td, rect.left, rect.bottom);
  };
  private hideTooltip = (): void => { this.host.tooltipService.hide({ isTouchEvent: false, immediately: true }); };

  public destroy(): void {
    this.disposed = true; clearTimeout(this.timer); this.hideTooltip();
    this.root.removeEventListener("click", this.click);
    this.root.removeEventListener("keydown", this.keydown);
    this.root.removeEventListener("contextmenu", this.contextmenu);
    this.scroller.removeEventListener("mouseover", this.mouseover);
    this.scroller.removeEventListener("mouseleave", this.hideTooltip);
    this.scroller.removeEventListener("scroll", this.hideTooltip);
    this.scroller.removeEventListener("focusin", this.focusin);
    this.scroller.removeEventListener("focusout", this.hideTooltip);
    this.selection.registerOnSelectCallback(() => undefined);
    this.data = undefined; this.selected = []; this.active = undefined; this.focusedKey = undefined;
    this.scroller.replaceChildren(); this.root.remove();
  }
}
