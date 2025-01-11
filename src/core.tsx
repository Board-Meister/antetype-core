import {
  IBaseDef, IParameters, ICore, IFont, IParentDef, ISize, IStart, Event, DrawEvent, CalcEvent, Layout
} from "@src/index";

export default function Core(
  {
    canvas,
    injected: { herald },
  }: IParameters
): ICore {
  if (!canvas) {
    throw new Error('[Antetype Workspace] Provided canvas is empty')
  }
  const settings: Record<string, any> = {};
  const layerPolicy = Symbol('layer');

  const draw = (element: IBaseDef): void => {
    herald.dispatchSync(new CustomEvent(Event.DRAW, { detail: { element } as DrawEvent }));
  }

  const redraw = (layout: IBaseDef[]): void => {
    for (const layer of layout) {
      draw(layer);
    }
  }

  const calc = async (element: IBaseDef, parent: IParentDef|null = null, position: number = 0): Promise<IBaseDef|null> => {
    element.hierarchy = { parent, position };
    const event = new CustomEvent(Event.CALC, { detail: { element: element } as CalcEvent });
    await herald.dispatch(event);

    event.detail.element !== null && markAsLayer(event.detail.element);
    return event.detail.element;
  }

  const isLayer = (layer: Record<symbol, unknown>): boolean => layer[layerPolicy] === true;
  const markAsLayer = (layer: IBaseDef): IBaseDef => {
    layer[layerPolicy] = true;

    return layer;
  }

  const recalculate = async (parent: IParentDef, layout: Layout): Promise<Layout> => {
    markAsLayer(parent);

    const calculated: Layout = [];
    for (let i = 0; i < layout.length; i++) {
      const calcLayer = await calc(layout[i], parent, i);
      calcLayer !== null && calculated.push(calcLayer);
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
      remove(def, parent, position);
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

  const remove = (def: IBaseDef, ogParent: IParentDef, ogPosition: number): void => {
    ogParent.layout.splice(ogPosition, 1);

    if (!def.hierarchy?.parent) {
      return;
    }

    const altPosition = def.hierarchy.position;
    const altParent = def.hierarchy.parent;

    altParent.layout.splice(altPosition, 1);

    for (let i = 0; i < altParent.layout.length; i++) {
      const layer = altParent.layout[i];
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
    manage: {
      move,
      resize,
      remove,
    },
    view: {
      calc,
      recalculate,
      draw,
      redraw,
      redrawDebounce: debounce(redraw),
    },
    policies: {
      markAsLayer,
      isLayer,
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
