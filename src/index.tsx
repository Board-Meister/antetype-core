import type { IInjectable } from "@boardmeister/marshal"
import type { Minstrel } from "@boardmeister/minstrel"
import type { Herald, ISubscriber, Subscriptions } from "@boardmeister/herald"
import type Core from "@src/core";
import type { UnknownRecord } from "@src/clone";


export interface ModulesEvent {
  modules: Record<string, Module>;
  canvas: HTMLCanvasElement|null;
}

export declare type Module = object;

export interface Modules {
  [key: string]: Module|undefined;
  core: ICore;
}

export enum Event {
  INIT = 'antetype.init',
  CLOSE = 'antetype.close',
  DRAW = 'antetype.draw',
  CALC = 'antetype.calc',
  RECALC_FINISHED = 'antetype.recalc.finished',
  MODULES = "antetype.modules",
  SETTINGS = "antetype.settings.definition",
}

export declare type RecalculateFinishedEvent = object;

export interface DrawEvent {
  element: IBaseDef;
}

export interface CalcEvent {
  element: IBaseDef|null;
  sessionId: symbol|null;
}

export interface ISettingFont {
  name: string;
  url: string;
}

export interface ISettings {
  [key: string|number|symbol]: unknown;
  core?: {
    fonts?: ISettingFont[];
  };
}

export interface ISettingsDefinitionFieldGeneric {
  label: string;
  type: string;
}

export type SettingsDefinitionField =
  ISettingsDefinitionFieldInput|ISettingsDefinitionFieldContainer|ISettingsDefinitionFieldGeneric;

export interface ISettingsDefinitionFieldContainer extends ISettingsDefinitionFieldGeneric {
  type: 'container';
  fields: SettingsDefinitionField[][];
  collapsable?: boolean;
}

export type ISettingsInputValue = string|number|string[]|number[]|Record<string, any>|Record<string, any>[]|undefined;

export interface ISettingsDefinitionFieldInput extends ISettingsDefinitionFieldGeneric {
  name: string;
  value: ISettingsInputValue;
}

export interface ISettingsDefinitionFieldList extends ISettingsDefinitionFieldGeneric {
  type: 'list';
  name: string;
  fields: SettingsDefinitionField[][][];
  template: SettingsDefinitionField[][];
  entry: Record<string, any>;
}

export interface ISettingsDefinitionTab {
  label: string;
  icon?: string;
  fields: SettingsDefinitionField[][];
}

export interface ISettingsDefinition {
  details: {
    label: string;
    icon?: string;
  }
  name: string;
  tabs: ISettingsDefinitionTab[];
}

export interface ISettingEvent {
  settings: ISettingsDefinition[];
  additional: Record<string, any>;
}

export type SettingsEvent = CustomEvent<ISettingEvent>;

export interface InitEvent {
  base: Layout;
  settings: ISettings;
}

export declare type CloseEvent = object;

export declare type XValue = number;
export declare type YValue = XValue;

export interface IStart {
  x: XValue;
  y: YValue;
}

export interface ISize {
  w: XValue;
  h: YValue;
}

export interface IArea {
  size: ISize;
  start: IStart;
}

export interface IHierarchy {
  parent: IParentDef|null;
  position: number;
}

export interface IBaseDef<T = never> {
  [key: symbol|string]: unknown;
  id?: string;
  hierarchy?: IHierarchy;
  start: IStart;
  size: ISize;
  type: string;
  can?: {
    move?: boolean;
    scale?: boolean;
    remove?: boolean;
  };
  area?: IArea;
  data?: T;
}

export interface IParentDef extends IBaseDef {
  layout: Layout;
}

export interface IDocumentDef extends IParentDef {
  type: 'document',
  base: Layout,
  start: { x: 0, y: 0 },
  size: { w: 0, h: 0 },
  settings: ISettings
}

export interface IInjected extends Record<string, object> {
  minstrel: Minstrel;
  herald: Herald;
}

export interface IParameters {
  canvas: HTMLCanvasElement|null,
  modules: Modules,
  herald: Herald,
}

export interface IFont {
  url: string;
  name: string;
}

export interface ICore extends Module {
  meta: {
    document: IDocumentDef;
    generateId: () => string;
  },
  clone: {
    definitions: (data: IBaseDef) => Promise<IBaseDef>;
    getOriginal: <T extends UnknownRecord = UnknownRecord>(object: T) => T;
    getClone: <T extends UnknownRecord = UnknownRecord>(object: T) => T;
  }
  manage: {
    markAsLayer: (layer: IBaseDef) => IBaseDef;
    add:(def: IBaseDef, parent?: IParentDef|null, position?: number|null) => void;
    addVolatile:(def: IBaseDef, parent?: IParentDef|null, position?: number|null) => void;
    move: (original: IBaseDef, newStart: IStart) => Promise<void>;
    resize: (original: IBaseDef, newSize: ISize) => Promise<void>;
    remove: (def: IBaseDef) => void;
    removeVolatile: (def: IBaseDef) => void;
    calcAndUpdateLayer: (original: IBaseDef) => Promise<void>;
  };
  view: {
    calc: (
      element: IBaseDef,
      parent?: IParentDef,
      position?: number,
      currentSession?: symbol|null,
    ) => Promise<IBaseDef|null>;
    draw: (element: IBaseDef) => void;
    redraw: (layout?: Layout) => void;
    recalculate: (parent?: IParentDef, layout?: Layout, currentSession?: symbol|null) => Promise<Layout>;
    redrawDebounce: (layout?: Layout) => void;
  };
  policies: {
    isLayer: (layer: Record<symbol, unknown>) => boolean;
    isClone: (layer: Record<symbol, unknown>) => boolean;
  };
  font: {
    load: (font: IFont) => Promise<void>,
  };
  setting: {
    set: (name: string, value: unknown) => void;
    get: <T = unknown>(name: string) => T | null;
    has: (name: string)=> boolean;
    retrieveSettingsDefinition: (additional?: Record<string, any>) => Promise<ISettingsDefinition[]>;
    setSettingsDefinition: (e: SettingsEvent) => void;
  }
}

export type Layout = (IBaseDef|IParentDef)[];

export class AntetypeCore {
  #injected?: IInjected;
  #moduleCore: (typeof Core)|null = null;

  static inject: Record<string, string> = {
    minstrel: 'boardmeister/minstrel',
    herald: 'boardmeister/herald',
  }
  inject(injections: IInjected): void {
    this.#injected = injections;
  }

  async #getCore(modules: Record<string, Module>, canvas: HTMLCanvasElement|null): Promise<ICore> {
    const module = this.#injected!.minstrel.getResourceUrl(this, 'core.js');
    this.#moduleCore = (await import(module)).default as typeof Core;
    return this.#moduleCore({ canvas, modules: modules as Modules, herald: this.#injected!.herald });
  }

  async register(event: CustomEvent<ModulesEvent>): Promise<void> {
    const { modules, canvas } = event.detail;

    modules.core = await this.#getCore(modules, canvas);
  }

  // init(event: CustomEvent<InitEvent>): Promise<IDocumentDef> {
  //   if (!this.#core || !this.#internal) {
  //     throw new Error('Instance not loaded, trigger registration event first');
  //   }

  //   const { base, settings } = event.detail;
  //   return this.#internal.init(base, settings);
  // }

  // async cloneDefinitions(event: CustomEvent<CalcEvent>): Promise<void> {
  //   if (!this.#core) {
  //     throw new Error('Instance not loaded, trigger registration event first');
  //   }

  //   if (event.detail.element === null) {
  //     return;
  //   }

  //   event.detail.element = await this.#core.clone.definitions(event.detail.element);
  // }

  // setSettings(e: SettingsEvent): void {
  //   this.#core!.setting.setSettingsDefinition(e);
  // }

  static subscriptions: Subscriptions = {
    [Event.MODULES]: 'register',
    // [Event.INIT]: 'init',
    // [Event.SETTINGS]: 'setSettings',
    // [Event.CALC]: [
    //   {
    //     method: 'cloneDefinitions',
    //     priority: -255,
    //   },
    // ],
  }
}

const EnAntetypeCore: IInjectable<IInjected> & ISubscriber = AntetypeCore;
export default EnAntetypeCore;
