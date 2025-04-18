import type { IInjectable, Module } from "@boardmeister/marshal"
import type { ISubscriber, Subscriptions } from "@boardmeister/herald"
import type Core from "@src/core";
import type {
  ICore,
  IInjected, Modules, ModulesEvent,
} from "@src/type.d";
import { Event } from "@src/type.d";

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

  static subscriptions: Subscriptions = {
    [Event.MODULES]: 'register',
  }
}

const EnAntetypeCore: IInjectable<IInjected> & ISubscriber = AntetypeCore;
export default EnAntetypeCore;

export * from "@src/type.d";