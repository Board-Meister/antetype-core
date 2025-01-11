import { Event as AntetypeEvent } from "@boardmeister/antetype"
import type { ModulesEvent, Modules } from "@boardmeister/antetype"
import type { IInjectable, Module } from "@boardmeister/marshal"
import type { Minstrel } from "@boardmeister/minstrel"
import type { Herald, ISubscriber, Subscriptions } from "@boardmeister/herald"
import Core from "@src/core";

export enum Event {
  INIT = 'antetype.init',
  DRAW = 'antetype.draw',
  CALC = 'antetype.calc',
}

export interface DrawEvent {
  element: IBaseDef;
}

export interface CalcEvent {
  element: IBaseDef|null;
}

export interface ISettings {
  [key: string|number|symbol]: unknown;
}

export interface InitEvent {
  base: Layout;
  settings: ISettings;
}

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
}

export interface IInjected extends Record<string, object> {
  minstrel: Minstrel;
  herald: Herald;
}

export interface IParameters {
  canvas: HTMLCanvasElement|null,
  modules: Modules,
  injected: IInjected
}

export interface IFont {
  url: string;
  name: string;
}

export interface ICore {
  manage: {
    move: (original: IBaseDef, def: IBaseDef, newStart: IStart) => Promise<void>;
    resize: (original: IBaseDef, def: IBaseDef, newSize: ISize) => Promise<void>;
    remove: (def: IBaseDef, ogParent: IParentDef, ogPosition: number) => void;
  };
  view: {
    calc: (element: IBaseDef, parent: IParentDef, position: number) => Promise<IBaseDef|null>;
    draw: (element: IBaseDef) => void;
    redraw: (layout: Layout) => void;
    recalculate: (parent: IParentDef, layout: Layout) => Promise<Layout>;
    redrawDebounce: (layout: Layout) => void;
  };
  policies: {
    markAsLayer: (layer: IBaseDef) => IBaseDef;
    isLayer: (layer: Record<symbol, unknown>) => boolean;
  };
  font: {
    load: (font: IFont) => Promise<void>,
  };
  setting: {
    set: (name: string, value: unknown) => void;
    get: <T = unknown>(name: string) => T | null;
    has: (name: string)=> boolean;
  }
}

export type Layout = (IBaseDef|IParentDef)[];

export class AntetypeCore {
  #injected?: IInjected;
  #module: (typeof Core)|null = null;
  #instance: ICore|null = null;

  static inject: Record<string, string> = {
    minstrel: 'boardmeister/minstrel',
    herald: 'boardmeister/herald',
  }
  inject(injections: IInjected): void {
    this.#injected = injections;
  }

  async #getInstance(modules: Modules, canvas: HTMLCanvasElement|null): Promise<ICore> {
    if (!this.#instance) {
      const module = this.#injected!.minstrel.getResourceUrl(this as Module, 'core.js');
      this.#module = (await import(module)).default;
      this.#instance = this.#module!({canvas, modules, injected: this.#injected!});
    }

    return this.#instance;
  }

  async register(event: CustomEvent<ModulesEvent>): Promise<void> {
    const { modules, canvas } = event.detail;

    modules.core = await this.#getInstance(modules, canvas);
  }

  async init(event: CustomEvent<InitEvent>): Promise<IDocumentDef> {
    if (!this.#instance) {
      throw new Error('Instance not loaded, trigger registration event first');
    }

    const { base, settings } = event.detail;
    for (const key in settings) {
      this.#instance.setting.set(key, settings[key]);
    }

    const doc: IDocumentDef = {
      type: 'document',
      base,
      layout: [],
      start: { x: 0, y: 0 },
      size: { w: 0, h: 0 },
    };

    // @TODO move this somewhere else?
    const promises: Promise<void>[] = [];
    (this.#instance.setting.get<IFont[]>('fonts') ?? []).forEach((font: IFont) => {
      promises.push(this.#instance!.font.load(font));
    });
    await Promise.all(promises);


    doc.layout = await this.#instance.view.recalculate(doc, doc.base);
    await this.#instance.view.redraw(doc.layout);

    return doc;
  }

  static subscriptions: Subscriptions = {
    [AntetypeEvent.MODULES]: 'register',
    [Event.INIT]: 'init',
  }
}

const EnAntetypeCore: IInjectable&ISubscriber = AntetypeCore;
export default EnAntetypeCore;
