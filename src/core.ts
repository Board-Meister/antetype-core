import {
  ITypeDefinitionEvent,
  type ITypeDefinitionMap,
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
  RecalculateFinishedEvent,
  ISettingsDefinition, SettingsEvent, ISettingsDefinitionFieldList, SettingsDefinitionField, ISettings,
  InitEvent
} from "@src/type.d";
import Clone from "@src/component/clone";

export interface IInternalCore {
  init: (base: Layout, settings: ISettings) => Promise<IDocumentDef>;
}

export default function Core (
  parameters: IParameters
): ICore {
  const {
    herald,
  } = parameters;

  const sessionQueue: symbol[] = [];
  const calcQueue: (() => Promise<IBaseDef|null>)[] = [];
  const layerPolicy = Symbol('layer');
  const { cloneDefinition, isClone, getOriginal, getClone } = Clone(parameters);

  const __DOCUMENT: IDocumentDef = {
    type: 'document',
    base: [],
    layout: [],
    start: { x: 0, y: 0 },
    size: { w: 0, h: 0 },
    settings: {
      core: {
        fonts: [],
      },
    },
  };

  console.log(__DOCUMENT)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    herald.dispatchSync(new CustomEvent<DrawEvent>(Event.DRAW, { detail: { element } }));
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
    const awaitQueue = (resolve: (result: IBaseDef|null) => void): void => {
      setTimeout(() => {
        if (!trigger) {
          awaitQueue(resolve);
          return;
        }

        void func().then(result => {
          resolve(result);
        })
      })
    }

    const promise = new Promise<IBaseDef|null>(resolve => {
      awaitQueue(resolve)
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
  const isLayer = (layer: Record<symbol, unknown>): boolean => getClone(layer)[layerPolicy] === true;
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

  const loadFont = async (font: IFont): Promise<FontFaceSet|null> => {
    try {
      const myFont = new FontFace(font.name, 'url(' + font.url + ')');

      const fontFace = document.fonts.add(await myFont.load());
      module.view.redrawDebounce();

      return fontFace;
    } catch (error) {
      console.error('Font couldn\'t be loaded:', font.name + ',', font.url, error)
      return null;
    }
  }

  const reloadFonts = async (): Promise<(FontFaceSet|null)[]> => {
    document.fonts.clear();
    const promises = [];
    for (const font of __DOCUMENT.settings?.core?.fonts ?? []) {
      promises.push(loadFont(font));
    }

    return Promise.all(promises);
  }

  const retrieveSettingsDefinition = async function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional: Record<string, any> = {},
  ): Promise<ISettingsDefinition[]> {
    const event: SettingsEvent = new CustomEvent(Event.SETTINGS, {
      detail: {
        settings: [],
        additional,
      },
    });

    await herald.dispatch(event);

    return event.detail.settings;
  }

  const setSetting = (path: string[], value: unknown, settings: Record<string, unknown>): void => {
    if (path.length <= 1) {
      settings[path[0]] = value;
      return;
    }

    settings[path[0]] ??= {};
    if (typeof settings[path[0]] !== 'object' || settings[path[0]] === null) {
      console.warn('Cannot set setting, due to one of destination not being an object', path, settings, value);
      return;
    }

    setSetting(path.slice(1), value, settings[path[0]] as Record<string, unknown>);
  }

  const getSetting = (path: string[], settings: Record<string, unknown>): unknown => {
    if (path.length <= 1) {
      return settings[path[0]];
    }

    if (!settings[path[0]]) {
      return undefined;
    }

    return getSetting(path.slice(1), settings[path[0]] as Record<string, unknown>);
  }

  const setSettingsDefinition = (e: SettingsEvent): void => {
    const settings = e.detail.settings;
    const generateFonts = (): SettingsDefinitionField[][][] => {
      const definitions: SettingsDefinitionField[][][] = [];
      for (const font of __DOCUMENT.settings?.core?.fonts ?? []) {
        definitions.push([[
          {
            type: 'asset',
            name: 'url',
            label: 'File',
            value: font.url,
          },
          {
            type: 'title',
            name: 'name',
            label: 'Name',
            value: font.name,
          }
        ]])
      }

      return definitions;
    }

    settings.push({
      details: {
        label: 'Core',
      },
      name: 'core',
      tabs: [
        {
          label: 'Font',
          fields: [
            [{
              label: 'Fonts',
              type: 'container',
              fields: [
                [{
                  name: 'fonts',
                  type: 'list',
                  label: 'Fonts List',
                  template: [
                    [
                      {
                        type: 'asset',
                        name: 'url',
                        label: 'File',
                        value: '',
                      },
                      {
                        type: 'title',
                        name: 'name',
                        label: 'Name',
                        value: '',
                      }
                    ]
                  ],
                  entry: {
                    url: '',
                    name: '',
                  },
                  fields: generateFonts(),
                } as ISettingsDefinitionFieldList]
              ]
            }]
          ]
        }
      ]
    })
  }

  const layerDefinitions = (): ITypeDefinitionMap => {
    const event = new CustomEvent<ITypeDefinitionEvent>(Event.TYPE_DEFINITION, {
      detail: {
        definitions: {}
      }
    });
    herald.dispatchSync(event);

    return event.detail.definitions;
  }

  const getModule = (): ICore => ({
    meta: {
      document: __DOCUMENT,
      generateId,
      layerDefinitions,
    },
    clone: {
      definitions: cloneDefinition,
      getOriginal,
      getClone,
    },
    manage: {
      markAsLayer,
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
      move,
      resize,
    },
    policies: {
      isLayer,
      isClone,
    },
    font: {
      load: loadFont,
      reload: reloadFonts,
    },
    setting: {
      set(name: string, value: unknown): void {
        const path = name.split('.');
        if (!path.slice(-1)) {
          path.pop();
        }
        setSetting(path, value, __DOCUMENT.settings)
      },
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
      get<T = unknown>(name: string): T | null {
        const path = name.split('.');
        if (!path.slice(-1)) {
          path.pop();
        }
        return (getSetting(path, __DOCUMENT.settings) as T) ?? null;
      },
      has: function (name: string): boolean {
        return !!(this.get(name) ?? false)
      },
      retrieve: retrieveSettingsDefinition,
    }
  });

  const module = getModule(); /** INSTANTIATE PUBLIC METHODS */

  const isObject = (item: unknown): boolean => !!(item && typeof item === 'object' && !Array.isArray(item));

  const mergeDeep = (
    target: Record<string, unknown>,
    ...sources: Record<string, unknown>[]
  ): Record<string, unknown> => {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
      for (const key in source) {
        const sEl = source[key]
        if (isObject(sEl)) {
          const tEl = target[key];
          if (!tEl) Object.assign(target, { [key]: {} });
          mergeDeep(target[key] as Record<string, unknown>, sEl as Record<string, unknown>);
        } else {
          Object.assign(target, { [key]: sEl });
        }
      }
    }

    return mergeDeep(target, ...sources);
  }

  const init = async (base: Layout, settings: ISettings): Promise<IDocumentDef> => {
    for (const key in settings) {
      module.setting.set(key, settings[key]);
    }

    const doc = __DOCUMENT;
    doc.settings = mergeDeep({}, doc.settings, settings) as ISettings;
    doc.base = base;

    void Promise.all((module.setting.get<IFont[]>('core.fonts') ?? []).map(font => module.font.load(font)))
      .then(() => {
        void herald.dispatch(new CustomEvent(Event.FONTS_LOADED))
      })
    ;

    doc.layout = await module.view.recalculate(doc, doc.base);
    module.view.redraw(doc.layout);

    return doc;
  }

  const unregister = herald.batch([
    {
      event: Event.CLOSE,
      subscription: () => {
        unregister();
      }
    },
    {
      event: Event.INIT,
      subscription: (event: CustomEvent<InitEvent>): Promise<IDocumentDef> => {
        const { base, settings } = event.detail;

        return init(base, settings);
      }
    },
    {
      event: Event.SETTINGS,
      subscription: (e: SettingsEvent): void => {
        setSettingsDefinition(e);
      }
    },
    {
      event: Event.CALC,
      subscription: [
        {
          priority: -255,
          method: async (event: CustomEvent<CalcEvent>): Promise<void> => {
            if (event.detail.element === null) {
              return;
            }

            event.detail.element = await module.clone.definitions(event.detail.element);
          }
        }
      ]
    },
  ]);

  return module;
}
