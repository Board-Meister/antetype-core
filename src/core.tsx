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

  const calc = async (element: IBaseDef, parent: IParentDef|null = null, position = 0): Promise<IBaseDef|null> => {
    element.hierarchy = { parent, position };
    const event = new CustomEvent(Event.CALC, { detail: { element: element } as CalcEvent });
    await herald.dispatch(event);

    if (event.detail.element !== null) markAsLayer(event.detail.element);
    return event.detail.element;
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

  const calcAndUpdateLayer = async (original: IBaseDef, def: IBaseDef): Promise<void> => {
    if (!def.hierarchy?.parent) {
      return;
    }

    const position = def.hierarchy.position;
    const parent = def.hierarchy.parent;

    const newLayer = await calc(original, parent, position);

    if (newLayer === null) {
      remove(def);
      removeVolatile(def);
      return;
    }

    parent.layout[position] = newLayer;
  }

  const move = async (original: IBaseDef, def: IBaseDef, newStart: IStart): Promise<void> => {
    original.start = newStart;

    await calcAndUpdateLayer(original, def);
  }

  const resize = async (original: IBaseDef, def: IBaseDef, newSize: ISize): Promise<void> => {
    original.size = newSize;

    await calcAndUpdateLayer(original, def);
  }

  const add = (def: IBaseDef, parent: IParentDef|null = null, position: number|null = null): void => {
    if (parent && isClone(parent)) {
      parent = getOriginal<IParentDef>(parent);
    }

    const layout = parent ? parent.layout : __DOCUMENT.base;
    parent ??= __DOCUMENT;
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
  }

  const remove = (def: IBaseDef): void => {
    if (!def.hierarchy?.parent) {
      return;
    }

    const position = def.hierarchy.position;
    const parent = getOriginal<IParentDef>(def.hierarchy.parent);
    const layout = (parent?.type === 'document' ? (parent as IDocumentDef).base : parent?.layout) ?? [];
    layout.splice(position, 1);

    // Recalculating all just to be sure
    for (let i = 0; i < layout.length; i++) {
      const layer = layout[i];
      if (!layer.hierarchy) {
        continue;
      }

      layer.hierarchy.position = i;
    }
  }

  const removeVolatile = (def: IBaseDef): void => {
    if (!def.hierarchy?.parent) {
      return;
    }

    const position = def.hierarchy.position;
    const parent = getClone<IParentDef>(def.hierarchy.parent);
    const layout = parent.layout;
    layout.splice(position, 1);

    // Recalculating all just to be sure
    for (let i = 0; i < layout.length; i++) {
      const layer = layout[i];
      if (!layer.hierarchy) {
        continue;
      }

      layer.hierarchy.position = i;
    }
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
