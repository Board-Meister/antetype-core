import type { IInjectable } from "@boardmeister/marshal"
import type { ISubscriber, Subscriptions } from "@boardmeister/herald"
import type {
  Canvas,
  IInjected,
  Modules,
} from "@src/type.d";
import type HelperModule from "@src/helper";

export const ID = 'core';
export const VERSION = '0.0.5';

export class AntetypeCore {
  #injected?: IInjected;
  #helperModule: (typeof HelperModule)|null = null;

  static inject: Record<string, string> = {
    marshal: 'boardmeister/marshal',
    herald: 'boardmeister/herald',
  }
  inject(injections: IInjected): void {
    this.#injected = injections;
  }

  async loadModules(required: string[], canvas?: Canvas): Promise<Modules> {
    return (await this.#getHelper()).loadModules(required, canvas);
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  #import<T>(suffix: string): Promise<{default: T}> {
    return import(this.#injected!.marshal.getResourceUrl(this, suffix));
  }

  async #getHelper(): Promise<HelperModule> {
    this.#helperModule ??= (await this.#import<typeof HelperModule>('helper.js')).default;
    return new this.#helperModule(this.#injected!.herald, this.#import.bind(this));
  }

  static subscriptions: Subscriptions = {};
}

const EnAntetypeCore: IInjectable<IInjected> & ISubscriber = AntetypeCore;
export default EnAntetypeCore;