import type { IInjectable } from "@boardmeister/marshal"
import type { ISubscriber, Subscriptions } from "@boardmeister/herald"
import type Core from "@src/core";
import type {
  IInjected,
  Modules,
  ModulesEvent,
} from "@src/type.d";
import { Event } from "@src/type.d";
import type HelperModule from "@src/helper";

export const ID = 'core';
export const VERSION = '0.0.5';

export class AntetypeCore {
  #injected?: IInjected;
  #moduleCore: (typeof Core)|null = null;
  #loading: Promise<void>|false = false;
  #helperModule: (typeof HelperModule)|null = null;

  static inject: Record<string, string> = {
    marshal: 'boardmeister/marshal',
    herald: 'boardmeister/herald',
  }
  inject(injections: IInjected): void {
    this.#injected = injections;
  }

  async loadModules(required: string[]): Promise<Modules> {
    return (await this.#getHelper()).loadModules(required);
  }

  register(event: ModulesEvent): void {
    const { registration } = event.detail;

    registration[ID] = {
      load: async () => {
        if (!this.#moduleCore && !this.#loading) {
          this.#loading = new Promise(resolve => {
            void this.#import<typeof Core>('core.js').then(module => {
              this.#moduleCore = module.default;
              this.#loading = false;
              resolve();
            })
          });
        }

        if (this.#loading) {
          await this.#loading;
        }
        console.log("load module3", this.#moduleCore);

        return modules => this.#moduleCore!({ modules: modules, herald: this.#injected!.herald })
      },
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

  async #getHelper(): Promise<HelperModule> {
    this.#helperModule ??= (await this.#import<typeof HelperModule>('helper.js')).default;
    return new this.#helperModule(this.#injected!.herald);
  }
}

const EnAntetypeCore: IInjectable<IInjected> & ISubscriber = AntetypeCore;
export default EnAntetypeCore;