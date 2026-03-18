import type { Herald } from '@boardmeister/herald';
import { ID, VERSION, type Core } from '@src/index';
import {
  Event,
  type Canvas,
  type IModulesEvent,
  type ModuleGenerator,
  type ModuleRegistration,
  type ModuleRegistrationWithName,
  type Modules,
  type ModulesEvent,
} from "@src/type.d";

export default class HelperModule {
  herald: Herald;
  importModule: <T>(suffix: string) => Promise<{default: T}>;
  moduleCore: (typeof Core)|null = null;
  loading: Promise<void>|false = false;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  constructor(herald: Herald, importModule: <T>(suffix: string) => Promise<{default: T}>) {
    this.herald = herald;
    this.importModule = importModule;
  }

  register(event: ModulesEvent): void {
    const { registration, canvas } = event.detail;

    registration[ID] = {
      load: async () => {
        if (!this.moduleCore && !this.loading) {
          this.loading = new Promise(resolve => {
            void this.importModule<typeof Core>('core.js').then(module => {
              this.moduleCore = module.default;
              this.loading = false;
              resolve();
            })
          });
        }

        if (this.loading) {
          await this.loading;
        }

        return modules => this.moduleCore!({ modules: modules, herald: this.herald, canvas })
      },
      version: VERSION,
    };
  }

  async loadModules(required: string[], canvas?: Canvas): Promise<Modules> {
    const requiredModules: Record<string, ModuleRegistration> = {}
    const event = new CustomEvent<IModulesEvent>(Event.MODULES, {  detail: { registration: {}, canvas } });
    this.register(event);
    await this.herald.dispatch(event);
    const registration = event.detail.registration;
    for (const id of required) {
      if (!registration[id]) {
        // @TODO Maybe add Courier notification
        throw new Error('Module ' + id + ' is not present! Cannot instantiate the Antetype.');
      }

      requiredModules[id] = registration[id];
    }

    return this.load(this.orderModules(requiredModules));
  }

  async load(sorted: ModuleRegistrationWithName[],): Promise<Modules> {
    const modules: Modules = {};
    const loaded = await Promise.all(
      sorted.reduce((stack: Promise<ModuleGenerator>[], config: ModuleRegistrationWithName) => {
        stack.push(new Promise(resolve => {
          void config.load()
            .then(init => { resolve({ name: config.name, init }) })
          ;
        }))
        return stack;
      }, [])
    );

    for (const generator of loaded) {
      modules[generator.name] = await generator.init(modules);
    }

    return modules;
  }

  orderModules(moduleRegistry: Record<string, ModuleRegistration>): ModuleRegistrationWithName[] {
    const sorted: ModuleRegistrationWithName[] = [],
      prepared: Record<string, boolean> = {}
    ;

    let tries = Object.keys(moduleRegistry).length*2;
    while (!this.isObjectEmpty(moduleRegistry)) {
      tries--;
      if (tries < 0) {
        console.warn('Not registered in load groups', moduleRegistry)
        throw new Error('Infinite dependency detected, stopping script...')
      }
      toSendLoop: for (const name in moduleRegistry) {

        const moduleConfig = moduleRegistry[name],
          requires = moduleConfig.requires ?? []
        ;

        for (const required of requires) {
          if (!prepared[required] && !moduleRegistry[required]) {
            throw new Error('Module ' + name + ' is requesting not present dependency: ' + required);
          }

          if (moduleRegistry[required]) {
            continue toSendLoop;
          }
        }

        sorted.push({ ...moduleConfig, name });

        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete moduleRegistry[name];
        prepared[name] = true;
      }
    }

    return sorted;
  }

  isObjectEmpty(obj: object): boolean {
    for(const prop in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, prop))
        return false;
    }

    return true;
  }
}