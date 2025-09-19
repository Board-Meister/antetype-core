import type { IInjectable } from "@boardmeister/marshal"
import type { ISubscriber, Subscriptions } from "@boardmeister/herald"
import type Core from "@src/core";
import type {
  ICore,
  IInjected,
  Modules,
  ModulesEvent,
} from "@src/type.d";
import { Event } from "@src/type.d";
import { ID, VERSION } from "@src/index";
import type HelperModule from "@src/helper";

export class AntetypeCore {
  #injected?: IInjected;
  #moduleCore: (typeof Core)|null = null;
  #helperModule: (typeof HelperModule)|null = null;

  static inject: Record<string, string> = {
    marshal: 'boardmeister/marshal',
    herald: 'boardmeister/herald',
  }
  inject(injections: IInjected): void {
    this.#injected = injections;
  }

  async loadModules(required: string[], canvas: HTMLCanvasElement): Promise<Modules> {
    return (await this.#getHelper()).loadModules(required, canvas);
  }

  register(event: ModulesEvent): void {
    const { registration } = event.detail;

    registration[ID] = {
      load: (modules, canvas) => this.#getCore(modules, canvas),
      version: VERSION,
    };
  }

  static subscriptions: Subscriptions = {
    [Event.MODULES]: 'register',
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  #import<T>(suffix: string): Promise<{default: T}> {
    return import(this.#injected!.marshal.getResourceUrl(this, suffix));
  }

  async #getCore(modules: Modules, canvas: HTMLCanvasElement): Promise<ICore> {
    this.#moduleCore ??= (await this.#import<typeof Core>('core.js')).default;
    return this.#moduleCore({ canvas, modules: modules, herald: this.#injected!.herald });
  }

  async #getHelper(): Promise<HelperModule> {
    this.#helperModule ??= (await this.#import<typeof HelperModule>('helper.js')).default;
    return new this.#helperModule(this.#injected!.herald);
  }
}

const EnAntetypeCore: IInjectable<IInjected> & ISubscriber = AntetypeCore;
export default EnAntetypeCore;