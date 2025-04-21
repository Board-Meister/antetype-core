import type { UnknownRecord } from "@src/clone";
import type { Minstrel } from "@boardmeister/minstrel"
import type { Herald } from "@boardmeister/herald"

export interface ModulesEvent {
  modules: Record<string, Module>;
  canvas: HTMLCanvasElement|null;
}

export declare type Module = object;

export interface Modules {
  [key: string]: Module|undefined;
  core: ICore;
}

export const Event = {
  INIT: 'antetype.init',
  CLOSE: 'antetype.close',
  DRAW: 'antetype.draw',
  CALC: 'antetype.calc',
  RECALC_FINISHED: 'antetype.recalc.finished',
  MODULES: "antetype.modules",
  SETTINGS: "antetype.settings.definition",
  TYPE_DEFINITION: "antetype.layer.type.definition",
} as const;

export type EventKeys = typeof Event[keyof typeof Event]

export declare type RecalculateFinishedEvent = object;

type ITypeDefinitionPrimitive = 'boolean'|'string'|'number';
export type TypeDefinition = {
  [key: string]: ITypeDefinitionPrimitive|TypeDefinition|TypeDefinition[];
}|(ITypeDefinitionPrimitive)[]|TypeDefinition[];

export type ITypeDefinitionMap = Record<string, TypeDefinition>;

export interface ITypeDefinitionEvent {
  definitions: ITypeDefinitionMap,
}

export type TypeDefinitionEvent = CustomEvent<ITypeDefinitionEvent>;

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
    layerDefinitions: () => ITypeDefinitionMap;
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
