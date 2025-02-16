// src/clone.tsx
function Clone({ modules, canvas }) {
  const ctx = canvas.getContext("2d");
  const maxDepth = 50;
  const originalSymbol = Symbol("original");
  const cloneSymbol = Symbol("clone");
  const isObject = (value) => {
    return typeof value === "object" && !Array.isArray(value) && value !== null;
  };
  const getOriginal = function(object) {
    return object[originalSymbol] ?? object;
  };
  const getClone = function(object) {
    return object[cloneSymbol] ?? object;
  };
  const iterateResolveAndCloneObject = async (object, recursive, depth = 0) => {
    if (recursive.has(object)) {
      return recursive.get(object);
    }
    if (object[originalSymbol] || object.type === "document") {
      return object;
    }
    const clone = {};
    recursive.set(object, clone);
    clone[originalSymbol] = object;
    object[cloneSymbol] = clone;
    if (maxDepth <= depth + 1) {
      console.error("We've reach limit depth!", object);
      throw new Error("limit reached");
    }
    await Promise.all(Object.keys(object).map(async (key) => {
      let result = await resolve(object[key], object);
      if (isObject(result)) {
        result = await iterateResolveAndCloneObject(result, recursive, depth + 1);
      } else if (Array.isArray(result)) {
        result = await iterateResolveAndCloneArray(result, recursive, depth + 1);
      }
      clone[key] = result;
    }));
    return clone;
  };
  const iterateResolveAndCloneArray = async (object, recursive, depth = 0) => {
    const clone = [];
    if (maxDepth <= depth + 1) {
      console.error("We've reach limit depth!", object);
      throw new Error("limit reached");
    }
    await Promise.all(object.map(async (value) => {
      let result = await resolve(value, object);
      if (isObject(result)) {
        result = await iterateResolveAndCloneObject(result, recursive, depth + 1);
      } else if (Array.isArray(result)) {
        result = await iterateResolveAndCloneArray(result, recursive, depth + 1);
      }
      clone.push(result);
    }));
    return clone;
  };
  const resolve = async (value, object) => {
    return typeof value == "function" ? await value(modules, ctx, object) : value;
  };
  const cloneDefinitions = async (data) => {
    return await iterateResolveAndCloneObject(data, /* @__PURE__ */ new WeakMap());
  };
  const isClone = (layer) => layer[originalSymbol] === true;
  return {
    isClone,
    cloneDefinitions,
    getClone,
    getOriginal
  };
}

// src/core.tsx
function Core(parameters) {
  const {
    canvas,
    injected: { herald }
  } = parameters;
  if (!canvas) {
    throw new Error("[Antetype Workspace] Provided canvas is empty");
  }
  const sessionQueue = [];
  const calcQueue = [];
  const settings = {};
  const layerPolicy = Symbol("layer");
  const { cloneDefinitions, isClone, getOriginal, getClone } = Clone(parameters);
  const __DOCUMENT = {
    type: "document",
    base: [],
    layout: [],
    start: { x: 0, y: 0 },
    size: { w: 0, h: 0 }
  };
  console.log(__DOCUMENT);
  const debounce = (func, timeout = 100) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      if (args[0] === "clear") {
        return;
      }
      timer = setTimeout(() => {
        void func.apply({}, args);
      }, timeout);
    };
  };
  const debounceRecalculatedEvent = debounce(() => {
    void herald.dispatch(new CustomEvent("antetype.recalc.finished" /* RECALC_FINISHED */));
  });
  const debounceCalcQueueCheck = debounce(async () => {
    if (calcQueue.length == 0) {
      return;
    }
    await calcQueue.shift()();
    debounceCalcQueueCheck();
  });
  const draw = (element) => {
    herald.dispatchSync(new CustomEvent("antetype.draw" /* DRAW */, { detail: { element } }));
  };
  const redraw = (layout = __DOCUMENT.layout) => {
    for (const layer of layout) {
      draw(layer);
    }
  };
  const assignHierarchy = (element, parent, position) => {
    element.hierarchy ??= {
      parent,
      position
    };
    if (parent) {
      element.hierarchy.parent = parent;
    }
    if (position) {
      element.hierarchy.position = position;
    }
  };
  const moveCalculationToQueue = (func) => {
    let trigger = false;
    const promise = new Promise(async (resolve) => {
      while (!trigger) {
        await new Promise((r) => setTimeout(r, 100));
      }
      void func().then((result) => {
        resolve(result);
      });
    });
    calcQueue.push(() => {
      trigger = true;
      return promise;
    });
    debounceCalcQueueCheck();
    return promise;
  };
  const calc = async (element, parent = null, position = null, currentSession = null) => {
    if (currentSession !== (sessionQueue[0] ?? null)) {
      return moveCalculationToQueue(() => calc(element, parent, position, currentSession));
    }
    const original = getOriginal(element);
    position ??= original.hierarchy?.position ?? 0;
    assignHierarchy(original, parent ? getOriginal(parent) : null, position);
    const event = new CustomEvent("antetype.calc" /* CALC */, { detail: { element, sessionId: currentSession } });
    await herald.dispatch(event);
    const clone = event.detail.element;
    if (clone !== null) {
      markAsLayer(clone);
      assignHierarchy(clone, parent ? getClone(parent) : null, position);
    }
    return clone;
  };
  const generateId = () => Math.random().toString(16).slice(2);
  const isLayer = (layer) => typeof getOriginal(layer)[layerPolicy] == "number";
  const markAsLayer = (layer) => {
    layer[layerPolicy] = true;
    getOriginal(layer).id ??= generateId();
    const clone = getClone(layer);
    if (!clone.id) {
      Object.defineProperty(clone, "id", {
        get() {
          return getOriginal(layer).id;
        }
      });
    }
    return layer;
  };
  const startSession = () => {
    const sessionId = Symbol("illustrator_session_id" + String(Math.random()));
    sessionQueue.push(sessionId);
    return sessionId;
  };
  const stopSession = () => {
    sessionQueue.shift();
  };
  const recalculate = async (parent = __DOCUMENT, layout = __DOCUMENT.base, startedSession = null) => {
    const currentSession = startedSession ?? startSession();
    markAsLayer(parent);
    const calculated = [];
    for (let i = 0; i < layout.length; i++) {
      const calcLayer = await calc(layout[i], parent, i, currentSession);
      if (calcLayer !== null) calculated.push(calcLayer);
    }
    parent.layout = calculated;
    debounceRecalculatedEvent();
    if (!startedSession) {
      stopSession();
    }
    return calculated;
  };
  const calcAndUpdateLayer = async (original) => {
    if (!original.hierarchy?.parent) {
      return;
    }
    const position = original.hierarchy.position;
    const parent = original.hierarchy.parent;
    const newLayer = await calc(original, parent, position);
    if (newLayer === null) {
      remove(original);
      removeVolatile(original);
      return;
    }
    getClone(parent).layout[position] = newLayer;
  };
  const move = async (original, newStart) => {
    original.start = newStart;
    await calcAndUpdateLayer(original);
  };
  const resize = async (original, newSize) => {
    original.size = newSize;
    await calcAndUpdateLayer(original);
  };
  const add = (def, parent = null, position = null) => {
    if (parent && isClone(parent)) {
      parent = getOriginal(parent);
    }
    let layout = parent ? parent.layout : __DOCUMENT.base;
    parent ??= __DOCUMENT;
    if (parent.base) {
      layout = parent.base;
    }
    position ??= layout.length;
    insert(def, parent, position, layout);
  };
  const addVolatile = (def, parent = null, position = null) => {
    if (parent && !isClone(parent)) {
      parent = getClone(parent);
    }
    parent ??= __DOCUMENT;
    position ??= parent.layout.length;
    insert(def, parent, position, parent.layout);
  };
  const insert = (def, parent, position, layout) => {
    layout.splice(position, 0, def);
    def.hierarchy = {
      position,
      parent
    };
    recalculatePositionInLayout(layout);
  };
  const recalculatePositionInLayout = (layout) => {
    for (let i = 0; i < layout.length; i++) {
      const layer = layout[i];
      if (!layer.hierarchy) {
        continue;
      }
      layer.hierarchy.position = i;
    }
  };
  const remove = (def) => {
    if (!def.hierarchy?.parent) {
      return;
    }
    const position = def.hierarchy.position;
    const parent = getOriginal(def.hierarchy.parent);
    const layout = (parent?.type === "document" ? parent.base : parent?.layout) ?? [];
    if (layout[position] !== getOriginal(def)) {
      return;
    }
    layout.splice(position, 1);
    recalculatePositionInLayout(layout);
  };
  const removeVolatile = (def) => {
    if (!def.hierarchy?.parent) {
      return;
    }
    const position = def.hierarchy.position;
    const parent = getClone(def.hierarchy.parent);
    const layout = parent.layout;
    if (layout[position] !== getClone(def)) {
      return;
    }
    layout.splice(position, 1);
    recalculatePositionInLayout(layout);
  };
  const loadFont = async (font) => {
    const myFont = new FontFace(font.name, "url(" + font.url + ")");
    document.fonts.add(await myFont.load());
  };
  return {
    meta: {
      document: __DOCUMENT,
      generateId
    },
    clone: {
      definitions: cloneDefinitions,
      getOriginal,
      getClone
    },
    manage: {
      markAsLayer,
      move,
      resize,
      remove,
      removeVolatile,
      add,
      addVolatile,
      calcAndUpdateLayer
    },
    view: {
      calc,
      recalculate,
      draw,
      redraw,
      redrawDebounce: debounce(redraw)
    },
    policies: {
      isLayer,
      isClone
    },
    font: {
      load: loadFont
    },
    setting: {
      set(name, value) {
        settings[name] = value;
      },
      get(name) {
        return settings[name] ?? null;
      },
      has: (name) => !!(settings[name] ?? false)
    }
  };
}
export {
  Core as default
};
