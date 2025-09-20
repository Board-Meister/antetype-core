import type { Herald } from '@boardmeister/herald';
import {
  Event,
  type IModulesEvent,
  type ModuleGenerator,
  type ModuleRegistration,
  type ModuleRegistrationWithName,
  type Modules,
} from "@src/type.d";

export default class HelperModule {
  herald: Herald;

  constructor(herald: Herald) {
    this.herald = herald;
  }

  async loadModules(required: string[], canvas: HTMLCanvasElement): Promise<Modules> {
    const requiredModules: Record<string, ModuleRegistration> = {}
    const event = new CustomEvent<IModulesEvent>(Event.MODULES, {  detail: { registration: {} } });
    await this.herald.dispatch(event);
    const registration = event.detail.registration;
    for (const id of required) {
      if (!registration[id]) {
        // @TODO Maybe add Courier notification
        throw new Error('Module ' + id + ' is not present! Cannot instantiate the Antetype.');
      }

      requiredModules[id] = registration[id];
    }

    return this.load(canvas, this.orderModules(requiredModules));
  }

  async load(canvas: HTMLCanvasElement, sorted: ModuleRegistrationWithName[],): Promise<Modules> {
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
    loaded.forEach(generator => {
      modules[generator.name] = generator.init(modules, canvas);
    })

    return modules;
  }

  // loadInGroups(
  //   modules: Modules,
  //   canvas: HTMLCanvasElement,
  //   sorted: ModuleRegistrationWithName[],
  // ): Promise<ModuleRegistrationWithName[][]> {
  //   const loadGroups: ModuleRegistrationWithName[][] = [[]];
  //   const loaded: Record<string, boolean> = {};
  //   const ejectLastLoadGroup = (): void => {
  //     const last = loadGroups.slice(-1)[0];
  //     for (const config of last) {
  //       loaded[config.name] = true;
  //     }
  //   }
  //   for (const config of sorted) {
  //     for (const name of config.requires ?? []) {
  //       if (!loaded[name]) {
  //         ejectLastLoadGroup();
  //         loadGroups.push([]);
  //       }
  //     }
  //     loadGroups.slice(-1)[0].push(config);
  //   }

  //   console.log('load groups', loadGroups);


  //   const promises: Promise<ModuleRegistrationWithName[]>[] = [];
  //   for (const group of loadGroups) {
  //     const groupPromises = [];
  //     for (const config of group) {
  //       groupPromises.push(new Promise(resolve => {
  //         void config.load(modules, canvas)
  //           .then(loaded => {
  //             modules[config.name] = loaded;
  //             resolve(loaded);
  //           })
  //         ;
  //       }));
  //     }
  //     promises.push(Promise.all(group));
  //   }

  //   return Promise.all(promises);
  // }

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