import {
  IBaseDef, IParameters, ICore, IFont, IParentDef, ISize, IStart, Event, DrawEvent, CalcEvent, Layout, IDocumentDef
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

  const draw = (element: IBaseDef): void => {
    herald.dispatchSync(new CustomEvent(Event.DRAW, { detail: { element } as DrawEvent }));
  }

  const redraw = (layout: IBaseDef[] = __DOCUMENT.layout): void => {
    for (const layer of layout) {
      draw(layer);
    }
  }
  const _assignHierarchy = (element: IBaseDef, parent: IParentDef|null, position: number): void => {
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

  const calc = async (element: IBaseDef, parent: IParentDef|null = null, position = 0): Promise<IBaseDef|null> => {
    const original = getOriginal(element);
    _assignHierarchy(original, parent ? getOriginal(parent) : null, position)

    const event = new CustomEvent(Event.CALC, { detail: { element: element } as CalcEvent });
    await herald.dispatch(event);

    const clone = event.detail.element;
    if (clone !== null) {
      markAsLayer(clone);
      _assignHierarchy(clone, parent ? getClone(parent) : null, position);
    }

    return clone;
  }

  const isLayer = (layer: Record<symbol, unknown>): boolean => layer[layerPolicy] === true;
  const markAsLayer = (layer: IBaseDef): IBaseDef => {
    layer[layerPolicy] = true;

    return layer;
  }

  const recalculate = async (parent: IParentDef = __DOCUMENT, layout: Layout = __DOCUMENT.base): Promise<Layout> => {
    markAsLayer(parent);

    const calculated: Layout = [];
    for (let i = 0; i < layout.length; i++) {
      const calcLayer = await calc(layout[i], parent, i);
      if (calcLayer !== null) calculated.push(calcLayer);
    }

    parent.layout = calculated;

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

  const debounce = (func: (...args: any[]) => void, timeout = 100): () => void => {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: unknown[]): void => {
      clearTimeout(timer);
      if (args[0] === 'clear') {
        return;
      }

      timer = setTimeout(() => {
        func.apply({}, args);
      }, timeout);
    };
  }

  return {
    meta: {
      document: __DOCUMENT,
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
