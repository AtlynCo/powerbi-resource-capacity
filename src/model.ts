export const LIMITS = Object.freeze({ resources: 200, periods: 104, cells: 10000, rows: 10000, text: 512 });

export type State = "available" | "full" | "overload" | "nonworking" | "unavailable" | "missing" | "invalid" | "duplicate" | "absent";
export type Issue = "invalidValue" | "invalidNonworking" | "duplicate" | "overflow";
export interface Accounting {
  state: State;
  allocated: number | null;
  capacity: number | null;
  utilization: number | null;
  overload: number | null;
  issue?: Issue;
}

export function account(allocated: unknown, capacity: unknown, nonworking?: unknown): Accounting {
  const a = typeof allocated === "number" ? allocated : null;
  const c = typeof capacity === "number" ? capacity : null;
  const base = { allocated: a, capacity: c, utilization: null, overload: null };
  if ([allocated, capacity].some(v => v != null && (typeof v !== "number" || !Number.isFinite(v) || v < 0))) {
    return { ...base, state: "invalid", issue: "invalidValue" };
  }
  if (nonworking != null && nonworking !== 0 && nonworking !== 1) {
    return { ...base, state: "invalid", issue: "invalidNonworking" };
  }
  if (a === null || c === null) return { ...base, state: "missing" };
  if (c === 0) return { ...base, state: a > 0 ? "overload" : nonworking === 1 ? "nonworking" : "unavailable", overload: a };
  const utilization = a / c;
  if (!Number.isFinite(utilization) || !Number.isFinite(utilization * 100)) {
    return { ...base, state: "invalid", issue: "overflow" };
  }
  return { allocated: a, capacity: c, utilization, overload: Math.max(0, a - c), state: a > c ? "overload" : a === c ? "full" : "available" };
}

export interface Axis {
  key: string;
  label: string;
  order?: number;
}
export interface InputRow<T> {
  resource: Axis;
  period: Axis;
  allocated: unknown;
  capacity: unknown;
  nonworking?: unknown;
  identity?: T;
  allocatedText: string;
  capacityText: string;
  highlighted: boolean;
  highlightAllocated?: string;
  highlightCapacity?: string;
  tooltips: { displayName: string; value: string }[];
}
export interface Cell<T> extends Accounting {
  key: string;
  resource: string;
  period: string;
  identity?: T;
  allocatedText: string;
  capacityText: string;
  nonworking: boolean;
  highlighted: boolean;
  highlightAllocated?: string;
  highlightCapacity?: string;
  tooltips: { displayName: string; value: string }[];
}
export interface CapacityModel<T> {
  resources: Axis[];
  periods: Axis[];
  cells: Map<string, Cell<T>>;
  partial: boolean;
  bounded: boolean;
  invalidCount: number;
  duplicateCount: number;
  orderConflict: boolean;
  sourceRows: number;
}
export const cellKey = (resource: string, period: string): string => JSON.stringify([resource, period]);

export function buildModel<T>(rows: InputRow<T>[], partial = false): CapacityModel<T> {
  const resources = new Map<string, Axis>();
  const periods = new Map<string, Axis>();
  const orders = new Map<number, string>();
  const cells = new Map<string, Cell<T>>();
  let bounded = rows.length > LIMITS.rows;
  let duplicateCount = 0;
  let orderConflict = false;
  for (const row of rows.slice(0, LIMITS.rows)) {
    const existingPeriod = periods.get(row.period.key);
    if (existingPeriod && existingPeriod.order !== row.period.order) orderConflict = true;
    if (row.period.order !== undefined) {
      if (!Number.isFinite(row.period.order)) orderConflict = true;
      const sameOrder = orders.get(row.period.order);
      if (sameOrder !== undefined && sameOrder !== row.period.key) orderConflict = true;
      orders.set(row.period.order, row.period.key);
    }
    const nr = resources.size + (resources.has(row.resource.key) ? 0 : 1);
    const np = periods.size + (periods.has(row.period.key) ? 0 : 1);
    if (nr > LIMITS.resources || np > LIMITS.periods || nr * np > LIMITS.cells) {
      bounded = true;
      continue;
    }
    resources.set(row.resource.key, row.resource);
    periods.set(row.period.key, row.period);
    const key = cellKey(row.resource.key, row.period.key);
    const previous = cells.get(key);
    if (previous) {
      if (previous.state !== "duplicate") duplicateCount++;
      // Ambiguous grains are never aggregated, even when the values match.
      cells.set(key, { ...previous, state: "duplicate", issue: "duplicate", allocated: null, capacity: null,
        allocatedText: "?", capacityText: "?", utilization: null, overload: null, identity: undefined, tooltips: [] });
      continue;
    }
    cells.set(key, {
      ...account(row.allocated, row.capacity, row.nonworking), key, resource: row.resource.key, period: row.period.key,
      identity: row.identity, allocatedText: row.allocatedText, capacityText: row.capacityText, nonworking: row.nonworking === 1,
      highlighted: row.highlighted, highlightAllocated: row.highlightAllocated, highlightCapacity: row.highlightCapacity, tooltips: row.tooltips
    });
  }
  const orderedPeriods = [...periods.values()];
  if (orderedPeriods.some(p => p.order !== undefined)) {
    if (orderedPeriods.some(p => p.order === undefined)) orderConflict = true;
    orderedPeriods.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return {
    resources: [...resources.values()], periods: orderedPeriods, cells, partial: partial || bounded, bounded,
    invalidCount: [...cells.values()].filter(c => c.state === "invalid").length, duplicateCount, orderConflict,
    sourceRows: Math.min(rows.length, LIMITS.rows)
  };
}

export function resourceTotal<T>(model: CapacityModel<T>, resource: string, additive: boolean): Accounting | undefined {
  if (!additive || model.partial || model.orderConflict || !model.periods.length) return undefined;
  let allocated = 0;
  let capacity = 0;
  for (const period of model.periods) {
    const cell = model.cells.get(cellKey(resource, period.key));
    if (!cell || cell.state === "invalid" || cell.state === "duplicate" || cell.allocated === null || cell.capacity === null) return undefined;
    allocated += cell.allocated;
    capacity += cell.capacity;
  }
  const total = account(allocated, capacity);
  return total.state === "invalid" ? undefined : total;
}
