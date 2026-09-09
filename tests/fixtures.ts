import type powerbi from "powerbi-visuals-api";
import { vi } from "vitest";
import type { InputRow } from "../src/model";

export type NativeHost = powerbi.extensibility.visual.IVisualHost;
export type SelectionId = powerbi.visuals.ISelectionId;
export type NativeValue = powerbi.PrimitiveValue | null | undefined;
export type Role = "resource" | "period" | "allocated" | "capacity" | "periodOrder" | "nonworking" | "tooltips";

export interface ValueOptions {
  values: NativeValue[];
  source?: Partial<powerbi.DataViewMetadataColumn>;
  highlights?: NativeValue[];
}

export interface ViewOptions {
  resources?: NativeValue[];
  periods?: NativeValue[];
  allocated?: NativeValue[];
  capacity?: NativeValue[];
  periodOrder?: NativeValue[];
  nonworking?: NativeValue[];
  allocatedHighlights?: NativeValue[];
  capacityHighlights?: NativeValue[];
  tooltips?: ValueOptions[];
  sources?: Partial<Record<Role, Partial<powerbi.DataViewMetadataColumn>>>;
  identities?: boolean;
  metadata?: Partial<powerbi.DataViewMetadata>;
}

export interface CategoricalView extends powerbi.DataView {
  categorical: {
    categories: [powerbi.DataViewCategoryColumn, powerbi.DataViewCategoryColumn];
    values: powerbi.DataViewValueColumns;
  };
}

// Native categorical data includes blanks, although the SDK's PrimitiveValue omits null/undefined.
const nativeValues = (values: NativeValue[]): powerbi.PrimitiveValue[] => [...values] as powerbi.PrimitiveValue[];

export function makeSource(role: Role, source: Partial<powerbi.DataViewMetadataColumn> = {}): powerbi.DataViewMetadataColumn {
  return {
    displayName: role,
    queryName: `Capacity.${role}`,
    roles: { [role]: true },
    type: role === "resource" || role === "period" ? { text: true } : { numeric: true },
    ...source
  };
}

export function makeValueColumn(role: Role, options: ValueOptions): powerbi.DataViewValueColumn {
  return {
    source: makeSource(role, options.source),
    values: nativeValues(options.values),
    ...(options.highlights === undefined ? {} : { highlights: nativeValues(options.highlights) })
  };
}

export function makeValueColumns(columns: powerbi.DataViewValueColumn[]): powerbi.DataViewValueColumns {
  return Object.assign(columns, { grouped: () => [{ values: columns }] });
}

export function makeView(options: ViewOptions = {}): CategoricalView {
  const resources = options.resources ?? ["Ada", "Ada"];
  const count = resources.length;
  const periods = options.periods ?? resources.map((_, i) => `Week ${i + 1}`);
  const category = (role: "resource" | "period", values: NativeValue[]): powerbi.DataViewCategoryColumn => ({
    source: makeSource(role, options.sources?.[role]),
    values: nativeValues(values),
    ...(options.identities === false ? {} : { identity: values.map(value => ({ key: `${role}:${String(value)}` })) })
  });
  const columns = [
    makeValueColumn("allocated", { values: options.allocated ?? Array<number>(count).fill(8),
      source: options.sources?.allocated, highlights: options.allocatedHighlights }),
    makeValueColumn("capacity", { values: options.capacity ?? Array<number>(count).fill(10),
      source: options.sources?.capacity, highlights: options.capacityHighlights })
  ];
  if (options.periodOrder !== undefined) {
    columns.push(makeValueColumn("periodOrder", { values: options.periodOrder, source: options.sources?.periodOrder }));
  }
  if (options.nonworking !== undefined) {
    columns.push(makeValueColumn("nonworking", { values: options.nonworking, source: options.sources?.nonworking }));
  }
  columns.push(...(options.tooltips ?? []).map(tooltip => makeValueColumn("tooltips", tooltip)));
  const categories: CategoricalView["categorical"]["categories"] = [category("resource", resources), category("period", periods)];
  return {
    metadata: { columns: [...categories, ...columns].map(column => column.source), ...options.metadata },
    categorical: { categories, values: makeValueColumns(columns) }
  };
}

export function makeRow(overrides: Partial<InputRow<SelectionId>> = {}): InputRow<SelectionId> {
  return {
    resource: { key: "r1", label: "Ada" },
    period: { key: "p1", label: "Week 1" },
    allocated: 8,
    capacity: 10,
    allocatedText: "8",
    capacityText: "10",
    highlighted: false,
    tooltips: [],
    ...overrides
  };
}

export function makeSelectionId(key: string): SelectionId {
  return {
    getKey: () => key,
    equals: other => other.getKey() === key,
    includes: other => other.getKey() === key,
    getSelector: () => ({ key }),
    getSelectorsByColumn: () => ({ key }),
    hasIdentity: () => true
  };
}

export class SelectionBuilder implements powerbi.visuals.ISelectionIdBuilder {
  readonly categories: { column: powerbi.DataViewCategoryColumn; index: number }[] = [];
  readonly withCategory = vi.fn((column: powerbi.DataViewCategoryColumn, index: number): this => {
    this.categories.push({ column, index });
    return this;
  });
  readonly withSeries = vi.fn((): this => this);
  readonly withMeasure = vi.fn((): this => this);
  readonly withMatrixNode = vi.fn((): this => this);
  readonly withTable = vi.fn((): this => this);
  readonly createSelectionId = vi.fn((): SelectionId => makeSelectionId(JSON.stringify(
    this.categories.map(({ column, index }) => [column.source.queryName, column.values[index]])
  )));
}

export interface HostOptions {
  locale?: string;
  highContrast?: boolean;
  fetchMoreData?: boolean;
  localization?: Record<string, string>;
}

export function makeHost(options: HostOptions = {}) {
  const builders: SelectionBuilder[] = [];
  let selected: powerbi.extensibility.ISelectionId[] = [];
  let selectionCallback: ((ids: powerbi.extensibility.ISelectionId[]) => void) | undefined;
  const selectionManager = {
    select: vi.fn(async (ids: powerbi.extensibility.ISelectionId | powerbi.extensibility.ISelectionId[], multiSelect: boolean = false) => {
      const next = Array.isArray(ids) ? ids : [ids];
      selected = multiSelect ? [...selected, ...next] : next;
      return selected;
    }),
    clear: vi.fn(async () => { selected = []; return {}; }),
    getSelectionIds: vi.fn(() => selected),
    hasSelection: vi.fn(() => selected.length > 0),
    registerOnSelectCallback: vi.fn((callback: (ids: powerbi.extensibility.ISelectionId[]) => void) => {
      selectionCallback = callback;
    }),
    showContextMenu: vi.fn<(id: powerbi.extensibility.ISelectionId, position: powerbi.extensibility.IPoint) => Promise<object>>().mockResolvedValue({}),
    toggleExpandCollapse: vi.fn(async () => ({}))
  };
  const tooltipService = {
    enabled: vi.fn(() => true),
    show: vi.fn<powerbi.extensibility.ITooltipService["show"]>(),
    move: vi.fn<powerbi.extensibility.ITooltipService["move"]>(),
    hide: vi.fn<powerbi.extensibility.ITooltipService["hide"]>()
  } satisfies powerbi.extensibility.ITooltipService;
  const eventService = {
    renderingStarted: vi.fn<powerbi.extensibility.IVisualEventService["renderingStarted"]>(),
    renderingFinished: vi.fn<powerbi.extensibility.IVisualEventService["renderingFinished"]>(),
    renderingFailed: vi.fn<powerbi.extensibility.IVisualEventService["renderingFailed"]>()
  } satisfies powerbi.extensibility.IVisualEventService;
  const colorPalette = {
    isHighContrast: options.highContrast ?? false,
    foreground: { value: "#ffff00" },
    background: { value: "#000000" },
    foregroundSelected: { value: "#00ffff" },
    hyperlink: { value: "#00ffff" }
  };
  const services = {
    locale: options.locale ?? "en-US",
    createSelectionIdBuilder: vi.fn(() => {
      const builder = new SelectionBuilder();
      builders.push(builder);
      return builder;
    }),
    createSelectionManager: vi.fn(() => selectionManager),
    createLocalizationManager: vi.fn(() => ({
      getDisplayName: vi.fn((key: string) => options.localization?.[key] ?? key)
    })),
    colorPalette,
    tooltipService,
    eventService,
    fetchMoreData: vi.fn<NativeHost["fetchMoreData"]>().mockReturnValue(options.fetchMoreData ?? true),
    launchUrl: vi.fn<NativeHost["launchUrl"]>(),
    persistProperties: vi.fn<NativeHost["persistProperties"]>(),
    applyJsonFilter: vi.fn<NativeHost["applyJsonFilter"]>(),
    hostCapabilities: { allowInteractions: true }
  };
  const supportedHost: Pick<NativeHost, "locale" | "createSelectionIdBuilder" | "createLocalizationManager" |
    "tooltipService" | "eventService" | "fetchMoreData" | "launchUrl" | "persistProperties" | "applyJsonFilter" |
    "hostCapabilities"> = services;
  // Test-only structural host: unused platform services are absent and selection uses native Promises.
  const host = supportedHost as NativeHost;
  return {
    host, ...services, builders, selectionManager,
    setSelection(ids: powerbi.extensibility.ISelectionId[]) { selected = ids; },
    emitSelection(ids: powerbi.extensibility.ISelectionId[]) {
      selected = ids;
      selectionCallback?.(ids);
    }
  };
}

export function makeUpdate(view: powerbi.DataView, overrides: Partial<powerbi.extensibility.visual.VisualUpdateOptions> = {}):
powerbi.extensibility.visual.VisualUpdateOptions {
  return { dataViews: [view], viewport: { width: 900, height: 600 }, type: 2, ...overrides };
}
