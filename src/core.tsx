import {
  IBaseDef,
  IParameters,
  ICore,
  IFont,
  IParentDef,
  ISize,
  IStart,
  Event,
  DrawEvent,
  CalcEvent,
  Layout,
  IDocumentDef,
  RecalculateFinishedEvent
} from "@src/index";
import Clone from "@src/clone";

export default function Core(
  parameters: IParameters
): ICore {
  const {
    canvas,
    injected: { herald },
  } = parameters;
  if (!canvas) {
    throw new Error('[Antetype Workspace] Provided canvas is empty')
  }
  const sessionQueue: symbol[] = [];
  const calcQueue: (() => Promise<IBaseDef|null>)[] = [];
  const settings: Record<string, any> = {};
  const layerPolicy = Symbol('layer');
  const { cloneDefinitions, isClone, getOriginal, getClone } = Clone(parameters);

  const __DOCUMENT: IDocumentDef = {
    type: 'document',
    base: [],
    layout: [],
    start: { x: 0, y: 0 },
    size: { w: 0, h: 0 },
  };
  console.log(__DOCUMENT)

  const debounce = (func: (...args: any[]) => void|Promise<void>, timeout = 100): () => void => {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: unknown[]): void => {
      clearTimeout(timer);
      if (args[0] === 'clear') {
        return;
      }

      timer = setTimeout(() => {
        void func.apply({}, args);
      }, timeout);
    };
  }

  const debounceRecalculatedEvent = debounce(() => {
    void herald.dispatch(new CustomEvent<RecalculateFinishedEvent>(Event.RECALC_FINISHED));
  })

  const debounceCalcQueueCheck = debounce(async (): Promise<void> => {
    if (calcQueue.length == 0) {
      return;
    }

    await calcQueue.shift()!();
    debounceCalcQueueCheck();
  })

  const draw = (element: IBaseDef): void => {
    herald.dispatchSync(new CustomEvent(Event.DRAW, { detail: { element } as DrawEvent }));
  }

  const redraw = (layout: IBaseDef[] = __DOCUMENT.layout): void => {
    for (const layer of layout) {
      draw(layer);
    }
  }

  const assignHierarchy = (element: IBaseDef, parent: IParentDef|null, position: number): void => {
    element.hierarchy ??= {
      parent,
      position,
    };

    if (parent) {
      element.hierarchy.parent = parent;
    }
    if (position) {
      element.hierarchy.position = position;
    }
  }

  const moveCalculationToQueue = (func: () => Promise<IBaseDef|null>): Promise<IBaseDef|null> => {
    let trigger = false;
    const promise = new Promise<IBaseDef|null>(async (resolve): Promise<void> => {
      while (!trigger) {
        await new Promise(r => setTimeout(r, 100));
      }

      void func().then(result => {
        resolve(result);
      })
    });
    calcQueue.push(() => {
      trigger = true;
      return promise;
    });
    debounceCalcQueueCheck();

    return promise;
  }

  const calc = async (
    element: IBaseDef,
    parent: IParentDef|null = null,
    position: number|null = null,
    currentSession: symbol|null = null,
  ): Promise<IBaseDef|null> => {
    if (currentSession !== (sessionQueue[0] ?? null)) {
      return moveCalculationToQueue(() => calc(element, parent, position, currentSession));
    }
    const original = getOriginal(element);
    position ??= original.hierarchy?.position ?? 0;
    assignHierarchy(original, parent ? getOriginal(parent) : null, position)

    const event = new CustomEvent<CalcEvent>(Event.CALC, { detail: { element, sessionId: currentSession } });
    await herald.dispatch(event);

    const clone = event.detail.element;
    if (clone !== null) {
      markAsLayer(clone);
      assignHierarchy(clone, parent ? getClone(parent) : null, position);
    }

    return clone;
  }

  const generateId = (): string => Math.random().toString(16).slice(2);
  const isLayer = (layer: Record<symbol, unknown>): boolean => typeof getOriginal(layer)[layerPolicy] == 'number';
  const markAsLayer = (layer: IBaseDef): IBaseDef => {
    layer[layerPolicy] = true;
    getOriginal(layer).id ??= generateId();
    const clone = getClone(layer);
    if (!clone.id) {
      Object.defineProperty(clone, "id", {
        get () {
          return getOriginal(layer).id
        },
      });
    }

    return layer;
  }

  const startSession = (): symbol => {
    const sessionId = Symbol('illustrator_session_id' + String(Math.random()));
    sessionQueue.push(sessionId);

    return sessionId;
  }

  const stopSession = (): void => {
    sessionQueue.shift();
  }

  const recalculate = async (
    parent: IParentDef = __DOCUMENT,
    layout: Layout = __DOCUMENT.base,
    startedSession: symbol|null = null,
  ): Promise<Layout> => {
    const currentSession = startedSession ?? startSession();
    markAsLayer(parent);

    const calculated: Layout = [];
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
  }

  const calcAndUpdateLayer = async (original: IBaseDef): Promise<void> => {
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
  }

  const move = async (original: IBaseDef, newStart: IStart): Promise<void> => {
    original.start = newStart;

    await calcAndUpdateLayer(original);
  }

  const resize = async (original: IBaseDef, newSize: ISize): Promise<void> => {
    original.size = newSize;

    await calcAndUpdateLayer(original);
  }

  const add = (def: IBaseDef, parent: IParentDef|null = null, position: number|null = null): void => {
    if (parent && isClone(parent)) {
      parent = getOriginal<IParentDef>(parent);
    }

    let layout = parent ? parent.layout : __DOCUMENT.base;
    parent ??= __DOCUMENT;
    if (parent.base) {
      layout = (parent as IDocumentDef).base;
    }
    position ??= layout.length;

    insert(def, parent, position, layout);
  }

  const addVolatile = (def: IBaseDef, parent: IParentDef|null = null, position: number|null = null): void => {
    if (parent && !isClone(parent)) {
      parent = getClone<IParentDef>(parent);
    }

    parent ??= __DOCUMENT;
    position ??= parent.layout.length;

    insert(def, parent, position, parent.layout);
  }

  const insert = (def: IBaseDef, parent: IParentDef, position: number, layout: Layout): void => {
    layout.splice(position, 0,  def);
    def.hierarchy = {
      position,
      parent,
    };
    recalculatePositionInLayout(layout);
  }

  const recalculatePositionInLayout = (layout: Layout): void => {
    for (let i = 0; i < layout.length; i++) {
      const layer = layout[i];
      if (!layer.hierarchy) {
        continue;
      }

      layer.hierarchy.position = i;
    }
  }

  const remove = (def: IBaseDef): void => {
    if (!def.hierarchy?.parent) {
      return;
    }

    const position = def.hierarchy.position;
    const parent = getOriginal<IParentDef>(def.hierarchy.parent);
    const layout = (parent?.type === 'document' ? (parent as IDocumentDef).base : parent?.layout) ?? [];
    if (layout[position] !== getOriginal(def)) {
      return;
    }
    layout.splice(position, 1);

    recalculatePositionInLayout(layout);
  }

  const removeVolatile = (def: IBaseDef): void => {
    if (!def.hierarchy?.parent) {
      return;
    }

    const position = def.hierarchy.position;
    const parent = getClone<IParentDef>(def.hierarchy.parent);
    const layout = parent.layout;
    if (layout[position] !== getClone(def)) {
      return;
    }
    layout.splice(position, 1);

    recalculatePositionInLayout(layout);
  }

  const loadFont = async (font: IFont): Promise<void> => {
    const myFont = new FontFace(font.name, 'url(' + font.url + ')');

    document.fonts.add(await myFont.load());
  }

  return {
    meta: {
      document: __DOCUMENT,
      generateId,
    },
    clone: {
      definitions: cloneDefinitions,
      getOriginal,
      getClone,
    },
    manage: {
      markAsLayer,
      move,
      resize,
      remove,
      removeVolatile,
      add,
      addVolatile,
      calcAndUpdateLayer,
    },
    view: {
      calc,
      recalculate,
      draw,
      redraw,
      redrawDebounce: debounce(redraw),
    },
    policies: {
      isLayer,
      isClone,
    },
    font: {
      load: loadFont
    },
    setting: {
      set(name: string, value: unknown): void { settings[name] = value; },
      get<T = unknown>(name: string): T | null { return (settings[name] as T) ?? null; },
      has: (name: string): boolean => !!(settings[name] ?? false)
    }
  };
}
