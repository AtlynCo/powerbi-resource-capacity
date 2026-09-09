/* global window, document */
const guid = "AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2";
const events = { starts: 0, finishes: 0, failures: [], selections: [], contexts: [], tooltips: [], fetches: [] };
let ids = [], callback = () => {}, fetchAccepted = true, visual;
const identity = key => ({
  getKey: () => key, equals: other => other.getKey() === key, includes: other => other.getKey() === key,
  getSelector: () => ({}), getSelectorsByColumn: () => ({}), hasIdentity: () => true
});
const selection = {
  select: (id, multi) => {
    ids = multi ? ids.some(item => item.equals(id)) ? ids.filter(item => !item.equals(id)) : [...ids, id] : [id];
    events.selections.push(ids.map(item => item.getKey())); return Promise.resolve(ids);
  },
  clear: () => { ids = []; return Promise.resolve({}); },
  hasSelection: () => ids.length > 0,
  getSelectionIds: () => ids,
  registerOnSelectCallback: fn => { callback = fn; },
  showContextMenu: (id, point) => { events.contexts.push({ key: id.getKey(), point }); return Promise.resolve({}); }
};
const host = {
  locale: "en-US",
  localizedStrings: {},
  colorPalette: { isHighContrast: false, foreground: { value: "#ffff00" }, background: { value: "#000000" } },
  createLocalizationManager: () => ({ getDisplayName: key => host.localizedStrings[key] ?? key }),
  createSelectionManager: () => selection,
  createSelectionIdBuilder: () => {
    const parts = [];
    const builder = {
      withCategory: (category, index) => { parts.push(String(category.values[index])); return builder; },
      createSelectionId: () => identity(parts.join("|"))
    };
    return builder;
  },
  eventService: {
    renderingStarted: () => events.starts++,
    renderingFinished: () => events.finishes++,
    renderingFailed: (_, reason) => events.failures.push(reason)
  },
  tooltipService: {
    enabled: () => true,
    show: options => events.tooltips.push(options),
    hide: () => {},
    move: () => {}
  },
  fetchMoreData: aggregate => { events.fetches.push(aggregate); return fetchAccepted; }
};
function makeView({ rows = 30, columns = 14, partial = false, highlights = false, unit = "hours", nonworking = false } = {}) {
  const resources = [], periods = [], allocated = [], capacity = [], orders = [], states = [];
  for (let r = 0; r < rows; r++) for (let p = 0; p < columns; p++) {
    resources.push(`Resource ${String(r + 1).padStart(3, "0")}`);
    periods.push(`Week ${String(p + 1).padStart(2, "0")}`);
    allocated.push(p === 0 ? 45 : p === 1 ? 8 : p === 2 ? null : p === 3 ? 0 : 32);
    capacity.push(p === 1 || p === 3 ? 0 : 40);
    orders.push(p); states.push(nonworking && p === 3 ? 1 : 0);
  }
  const category = (name, values) => ({ source: { displayName: name, queryName: `Sample.${name}`, roles: { [name]: true }, type: { text: true } }, values, identity: values.map(v => ({ key: v })) });
  const measure = (name, values) => ({ source: { displayName: name, queryName: `Sample.${name}`, roles: { [name]: true }, format: "#,0.0", type: { numeric: true }, isMeasure: true }, values });
  const values = [measure("allocated", allocated), measure("capacity", capacity), measure("periodOrder", orders), measure("nonworking", states)];
  if (highlights) { values[0].highlights = allocated.map((_, i) => i === 0 ? 0 : null); values[1].highlights = capacity.map(() => null); }
  values.grouped = () => [{ values }];
  const categories = [category("resource", resources), category("period", periods)];
  return {
    metadata: { columns: [...categories, ...values].map(c => c.source), objects: { analysis: { unit, additiveTotals: false }, layout: {} }, ...(partial ? { segment: {} } : {}) },
    categorical: { categories, values }
  };
}
const plugin = window[guid]?.default ?? window[guid];
function start() {
  visual = plugin.create({ element: document.getElementById("tile"), host });
}
let view = makeView();
function render(options = {}, width = 800, height = 500) {
  view = makeView(options);
  visual.update({ dataViews: [view], viewport: { width, height }, type: 2 });
}
window.capacityTest = {
  events, host, makeView, render,
  restart: () => { visual.destroy(); start(); render(); },
  resize: (width, height) => visual.update({ dataViews: [], viewport: { width, height }, type: 4 }),
  updateView: (next, width = 800, height = 500) => { view = next; visual.update({ dataViews: [view], viewport: { width, height }, type: 2 }); },
  getView: () => view,
  externalSelect: keys => { ids = keys.map(identity); callback(ids); },
  setFetchAccepted: value => { fetchAccepted = value; },
  destroy: () => visual.destroy(),
  formatModel: () => visual.getFormattingModel()
};
start();
render();
