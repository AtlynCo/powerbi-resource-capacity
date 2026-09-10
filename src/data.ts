import powerbi from "powerbi-visuals-api";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { Axis, buildModel, CapacityModel, InputRow, LIMITS } from "./model";

type Identity = powerbi.visuals.ISelectionId;
type Host = powerbi.extensibility.visual.IVisualHost;
export interface DataResult {
  model: CapacityModel<Identity>;
  error?: "bind" | "shape" | "keys" | "order";
  segmented: boolean;
  reduced: boolean;
  hasHighlights: boolean;
  additiveAllowed: boolean;
  ambiguousLabels?: boolean;
  formatAllocated: (value: number) => string;
  formatCapacity: (value: number) => string;
}
export const shorten = (value: string): string => value.length > LIMITS.text ? value.slice(0, LIMITS.text - 3) + "..." : value;

function localDate(value: powerbi.PrimitiveValue | undefined): Date | undefined {
  if (value == null || typeof value !== "object") return undefined;
  let time: number;
  try {
    // Host Dates can come from another frame; test the intrinsic Date slot, not its realm or tag.
    time = Date.prototype.getTime.call(value);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
  return new Date(time);
}

export function formatter(source: powerbi.DataViewMetadataColumn, locale: string): (value: powerbi.PrimitiveValue | undefined) => string {
  const format = valueFormatter.getFormatStringByColumn(source) ?? source.format;
  const f = valueFormatter.createDefaultFormatter(format, false, locale);
  return value => value == null ? "-" : shorten(f.format(localDate(value) ?? (typeof value === "string" ? shorten(value) : value)));
}

function axis(value: powerbi.PrimitiveValue | undefined, label: string): Axis | undefined {
  const date = localDate(value);
  if (date) {
    const time = date.getTime();
    return Number.isFinite(time) ? { key: `date:${time}`, label, rawLabel: date.toISOString(), order: time } : undefined;
  }
  if ((typeof value === "string" && value.trim() && value.length <= LIMITS.text) ||
      (typeof value === "number" && Number.isFinite(value))) return { key: `${typeof value}:${value}`, label, rawLabel: String(value) };
  return undefined;
}

export function readData(view: powerbi.DataView | undefined, host: Host): DataResult {
  const empty: DataResult = {
    model: buildModel<Identity>([]), segmented: false, reduced: false, hasHighlights: false, additiveAllowed: false,
    formatAllocated: String, formatCapacity: String
  };
  if (!view?.categorical) return { ...empty, error: "bind" };
  const categories = view.categorical.categories ?? [];
  const values = view.categorical.values ?? [];
  const resources = categories.filter(c => c.source.roles?.resource);
  const periods = categories.filter(c => c.source.roles?.period);
  const allocations = values.filter(c => c.source.roles?.allocated);
  const capacities = values.filter(c => c.source.roles?.capacity);
  const orders = values.filter(c => c.source.roles?.periodOrder);
  const nonworkings = values.filter(c => c.source.roles?.nonworking);
  const tooltips = values.filter(c => c.source.roles?.tooltips);
  const resource = resources[0], period = periods[0], allocated = allocations[0], capacity = capacities[0];
  if (!resource || !period || !allocated || !capacity || resources.length !== 1 || periods.length !== 1 ||
      allocations.length !== 1 || capacities.length !== 1 || orders.length > 1 || nonworkings.length > 1 ||
      tooltips.length > 5 || categories.length !== 2 || values.length > 9) return { ...empty, error: "bind" };
  const count = resource.values.length;
  if (period.values.length !== count || values.some(c => c.values.length !== count ||
    (c.highlights !== undefined && c.highlights.length !== count))) return { ...empty, error: "shape" };
  if ([...categories, ...values].some(c => (c.source.format?.length ?? 0) > LIMITS.text ||
    (valueFormatter.getFormatStringByColumn(c.source)?.length ?? 0) > LIMITS.text)) return { ...empty, error: "shape" };
  const order = orders[0], nonworking = nonworkings[0];
  const fr = formatter(resource.source, host.locale), fp = formatter(period.source, host.locale);
  const fa = formatter(allocated.source, host.locale), fc = formatter(capacity.source, host.locale);
  const ft = tooltips.map(c => formatter(c.source, host.locale));
  const rows: InputRow<Identity>[] = [];
  const hasHighlights = allocated.highlights !== undefined || capacity.highlights !== undefined;
  for (let i = 0; i < Math.min(count, LIMITS.rows); i++) {
    const r = axis(resource.values[i], "");
    const p = axis(period.values[i], "");
    const periodDate = localDate(period.values[i]);
    if (!r || !p || (period.source.type?.dateTime && !periodDate)) return { ...empty, error: "keys" };
    r.label = fr(resource.values[i]); p.label = fp(period.values[i]);
    if (order && !periodDate) {
      const value = order.values[i];
      if (typeof value !== "number" || !Number.isFinite(value)) return { ...empty, error: "order" };
      p.order = value;
    }
    const candidateIdentity = resource.identity?.[i] && period.identity?.[i]
      ? host.createSelectionIdBuilder().withCategory(resource, i).withCategory(period, i).createSelectionId() : undefined;
    const identity = candidateIdentity?.hasIdentity() ? candidateIdentity : undefined;
    rows.push({
      resource: r, period: p, allocated: allocated.values[i], capacity: capacity.values[i], nonworking: nonworking?.values[i],
      allocatedText: fa(allocated.values[i]), capacityText: fc(capacity.values[i]), identity,
      highlighted: allocated.highlights?.[i] != null || capacity.highlights?.[i] != null,
      highlightAllocated: allocated.highlights ? fa(allocated.highlights[i]) : undefined,
      highlightCapacity: capacity.highlights ? fc(capacity.highlights[i]) : undefined,
      tooltips: tooltips.map((c, j) => ({ displayName: shorten(c.source.displayName), value: ft[j]!(c.values[i]) }))
    });
  }
  const segmented = view.metadata.segment !== undefined;
  const reduced = view.metadata.dataReduction !== undefined;
  const model = buildModel(rows, segmented || reduced || count > LIMITS.rows);
  if (count >= LIMITS.rows) model.bounded = true;
  return {
    model, segmented, reduced, hasHighlights,
    ambiguousLabels: [model.resources, model.periods].some(axis => new Set(axis.map(item => item.label)).size < axis.length),
    additiveAllowed: !allocated.source.discourageAggregationAcrossGroups && !capacity.source.discourageAggregationAcrossGroups,
    formatAllocated: fa, formatCapacity: fc, error: model.orderConflict ? "order" : undefined
  };
}
