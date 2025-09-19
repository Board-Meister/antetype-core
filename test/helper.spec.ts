import { Herald } from "@boardmeister/herald";
import HelperModule from "@src/helper";
import { Event } from "@src/index";
import type { Module, ModuleRegistration, ModuleRegistrationWithName, Modules, ModulesEvent } from "@src/index";

describe('Helper component', () => {
  const herald = new Herald();
  const helper = new HelperModule(herald)
  const canvas = document.createElement('canvas');
  const load = (): Promise<Module> => new Promise(r => { r({}) });

  it('detects empty objects', (): void => {
    expect(helper.isObjectEmpty({})).toBeTrue();
    expect(helper.isObjectEmpty({ a: 1 })).toBeFalse();
  })

  it('orders modules', (): void => {
    const modules: Record<string, ModuleRegistration> = {
      module2: {
        requires: ['module1'],
        load,
      },
      module1: {
        requires: ['core'],
        load,
      },
      core: {
        load,
      },
    };
    const sorted = helper.orderModules(modules);

    expect(sorted).toEqual([
      jasmine.objectContaining({
        name: 'core',
      }),
      jasmine.objectContaining({
        name: 'module1',
      }),
      jasmine.objectContaining({
        name: 'module2',
      }),
    ]);
  })

  it('detects missing modules', (): void => {
    const modules: Record<string, ModuleRegistration> = {
      core: {
        load,
      },
      module2: {
        requires: ['module1'],
        load,
      },
    };
    expect(() => { helper.orderModules(modules) })
      .toThrowError('Module module2 is requesting not present dependency: module1');
  })

  it('detects infinite requirements', (): void => {
    const modules: Record<string, ModuleRegistration> = {
      core: {
        load,
        requires: ['module1'],
      },
      module1: {
        requires: ['core'],
        load,
      },
    };
    expect(() => { helper.orderModules(modules) })
      .toThrowError('Infinite dependency detected, stopping script...');
  })

  const loadAndReturn = (toReturn: string, order: string[]) => (() : Promise<Module> => new Promise(r => {
    order.push(toReturn);
    r({
      res: toReturn,
    })
  }));

  it('loads modules correctly', async (): Promise<void> => {
    const order: string[] = [];
    const sorted: ModuleRegistrationWithName[] = [
      {
        name: 'core',
        load: loadAndReturn('1', order),
      },
      {
        name: 'module1',
        requires: ['core'],
        load: loadAndReturn('2', order),
      },
      {
        name: 'module2',
        requires: ['module1'],
        load: loadAndReturn('3', order),
      },
    ];
    const modules: Modules = {};
    await helper.loadInGroups(modules, canvas, sorted);

    expect(modules).toEqual(
      jasmine.objectContaining({
        core: jasmine.objectContaining({ res: '1' }),
        module1: jasmine.objectContaining({ res: '2' }),
        module2: jasmine.objectContaining({ res: '3' }),
      })
    );

    expect(order).toEqual(['1','2','3']);
  })

  it('happy path', async (): Promise<void> => {
    const order: string[] = [];
    const registered: Record<string, ModuleRegistration> = {
      module2: {
        requires: ['module1'],
        load: loadAndReturn('3', order),
      },
      module1: {
        requires: ['core'],
        load: loadAndReturn('2', order),
      },
      unnecessary: {
        requires: ['core'],
        load: loadAndReturn('4', order),
      },
      core: {
        load: loadAndReturn('1', order),
      },
    };
    const unregister = herald.batch([
      {
        event: Event.MODULES,
        subscription: (event: ModulesEvent) => {
          event.detail.registration = registered;
        }
      }
    ]);
    const required = ['module2', 'core', 'module1'];

    const modules: Modules = await helper.loadModules(required, canvas);

    expect(modules).toEqual(
      jasmine.objectContaining({
        core: jasmine.objectContaining({ res: '1' }),
        module1: jasmine.objectContaining({ res: '2' }),
        module2: jasmine.objectContaining({ res: '3' }),
      })
    );

    expect(order).toEqual(['1','2','3']);

    unregister();
  })

  it('missing plugin is detected', async (): Promise<void> => {
    const order: string[] = [];
    const registered: Record<string, ModuleRegistration> = {
      module2: {
        requires: ['module1'],
        load: loadAndReturn('3', order),
      },
      unnecessary: {
        requires: ['core'],
        load: loadAndReturn('4', order),
      },
      core: {
        load: loadAndReturn('1', order),
      },
    };
    const unregister = herald.batch([
      {
        event: Event.MODULES,
        subscription: (event: ModulesEvent) => {
          event.detail.registration = registered;
        }
      }
    ]);
    const required = ['module2', 'core', 'module1'];

    await expectAsync((async (): Promise<void> => { await helper.loadModules(required, canvas) })())
      .toBeRejectedWithError('Module module1 is not present! Cannot instantiate the Antetype.');
    unregister();
  })
});