/* global window, document */
const guid = "AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2";
// These are deliberately mock host contracts, not evidence of native Power BI behavior.
const identity = (key, includes = other => other.getKey() === key) => ({
  getKey: () => key, equals: other => other.getKey() === key, includes,
  getSelector: () => ({}), getSelectorsByColumn: () => ({}), hasIdentity: () => true
});
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
function createHarness(container) {
  const events = {
    starts: 0, finishes: 0, failures: [], selections: [], contexts: [], tooltips: [], fetches: [],
    clears: 0, hides: [], calls: [], identityBuilds: [], registrations: 0
  };
  const behaviors = {}, pending = [];
  let ids = [], callback = () => {}, fetchAccepted = true, visual, view = makeView(), instrumentation = true;
  function operation(name, complete) {
    if (instrumentation) events.calls.push(name);
    if (behaviors[name] === "throw") throw new Error(`Mock ${name} synchronous error`);
    if (behaviors[name] === "reject") return Promise.reject(new Error(`Mock ${name} rejection`));
    if (behaviors[name] === "defer") return new Promise((resolve, reject) => pending.push({ name, resolve, reject, complete }));
    return Promise.resolve(complete());
  }
  function syncOperation(name, complete) {
    if (instrumentation) events.calls.push(name);
    if (behaviors[name] === "throw") throw new Error(`Mock ${name} synchronous error`);
    return complete();
  }
  const selection = {
    select: (id, multi) => operation("select", () => {
      ids = multi ? ids.some(item => item.equals(id)) ? ids.filter(item => !item.equals(id)) : [...ids, id] : [id];
      events.selections.push(ids.map(item => item.getKey())); return ids;
    }),
    clear: () => operation("clear", () => { events.clears++; ids = []; return {}; }),
    hasSelection: () => ids.length > 0,
    getSelectionIds: () => syncOperation("getSelectionIds", () => ids),
    registerOnSelectCallback: fn => { events.registrations++; callback = fn; },
    showContextMenu: (id, point) => operation("context", () => { events.contexts.push({ key: id.getKey(), point }); return {}; })
  };
  const host = {
    locale: "en-US",
    localizedStrings: {},
    hostCapabilities: { allowInteractions: true },
    colorPalette: { isHighContrast: false, foreground: { value: "#ffff00" }, background: { value: "#000000" } },
    createLocalizationManager: () => ({ getDisplayName: key => host.localizedStrings[key] ?? key }),
    createSelectionManager: () => selection,
    createSelectionIdBuilder: () => {
      const parts = [], categories = [];
      const builder = {
        withCategory: (category, index) => {
          parts.push(String(category.values[index]));
          if (instrumentation) categories.push({ queryName: category.source.queryName, index, identity: category.identity?.[index]?.key });
          return builder;
        },
        createSelectionId: () => syncOperation("identity", () => {
          if (instrumentation) events.identityBuilds.push(categories);
          return identity(parts.join("|"));
        })
      };
      return builder;
    },
    eventService: {
      renderingStarted: () => events.starts++,
      renderingFinished: () => events.finishes++,
      renderingFailed: (_, reason) => events.failures.push(reason)
    },
    tooltipService: {
      enabled: () => syncOperation("tooltipEnabled", () => true),
      show: options => syncOperation("tooltip", () => events.tooltips.push(options)),
      hide: options => syncOperation("hide", () => { if (instrumentation) events.hides.push(options); }),
      move: () => {}
    },
    fetchMoreData: aggregate => syncOperation("fetch", () => { events.fetches.push(aggregate); return fetchAccepted; })
  };
  function start() { visual = plugin.create({ element: container, host }); }
  function updateView(next, width = 800, height = 500, type = 2) {
    view = next;
    visual.update({ dataViews: [view], viewport: { width, height }, type });
  }
  function render(options = {}, width = 800, height = 500) { updateView(makeView(options), width, height); }
  const harness = {
    events, host, makeView, render, updateView,
    setInstrumentation: enabled => { instrumentation = enabled; },
    restart: () => { visual.destroy(); start(); render(); },
    resize: (width, height) => visual.update({ dataViews: [], viewport: { width, height }, type: 4 }),
    style: (width = 800, height = 500) => visual.update({ dataViews: [], viewport: { width, height }, type: 16 }),
    getView: () => view,
    externalSelect: keys => { ids = keys.map(key => identity(key)); callback(ids); },
    externalResourceSelect: resource => {
      ids = [identity(`resource:${resource}`, other => other.getKey().startsWith(`${resource}|`))]; callback(ids);
    },
    externalInvalidSelection: () => callback([{}]),
    captureCallback: () => callback,
    setFetchAccepted: value => { fetchAccepted = value; },
    setBehavior: (name, value) => { behaviors[name] = value; },
    pendingOperations: () => pending.map(item => item.name),
    settle: (index = 0, reject = false) => {
      const item = pending.splice(index, 1)[0];
      if (!item) throw new Error("No pending mock operation");
      if (reject) item.reject(new Error(`Mock ${item.name} delayed rejection`));
      else item.resolve(item.complete());
    },
    destroy: () => visual.destroy(),
    formatModel: () => visual.getFormattingModel()
  };
  start(); render();
  return harness;
}
window.capacityTest = createHarness(document.getElementById("tile"));
window.capacityInstances = {};
window.capacityTest.createInstance = id => {
  if (document.getElementById(id)) throw new Error("Fixture instance id must be unique");
  const container = document.createElement("div");
  container.id = id; document.body.append(container);
  return window.capacityInstances[id] = createHarness(container);
};
