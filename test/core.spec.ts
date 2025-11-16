import Core from '@src/core';
import { Herald } from '@boardmeister/herald';
import type {
  CalcEvent, DrawEvent, IBaseDef, InitEvent, IParentDef, ISettings, Layout,
  TypeDefinitionEvent
} from "@src/type.d";
import { Event } from "@src/type.d";
import { generateRandomLayer } from 'test/helpers/definition.helper';


describe('Core module', () => {
  const herald = new Herald();
  const canvas = document.createElement('canvas');
  const core = Core({ herald });
  core.meta.setCanvas(canvas);

  it('initializes properly', async () => {
    let drawn = 0;
    let fontChecked = false;

    const clone = (obj: object): IBaseDef => JSON.parse(JSON.stringify(obj)) as IBaseDef;
    const noCloneLayout: Layout = [
      generateRandomLayer('clear1'),
      generateRandomLayer('clear2'),
      generateRandomLayer('clear3'),
    ]
    const layout = noCloneLayout.map(def => clone(def));
    const unregister = herald.batch([
      {
        event: Event.DRAW,
        /* Validate if cloned content is properly linked, cloned and assigned */
        subscription: (event: CustomEvent<DrawEvent>) => {
          const position = drawn;
          const layer = (noCloneLayout[position] ?? null) as IBaseDef|IParentDef|null;
          drawn++;

          expect(layer).not.toBe(null);
          if (layer === null) {
            return;
          }
          expect(event.detail.element).not.toBe(layer);
          expect(event.detail.element)
            .withContext('Layer initial structure and values were not changed')
            .toEqual(jasmine.objectContaining({
              type: layer.type,
              _mark: layer._mark,
              start: jasmine.objectContaining({ x: layer.start.x, y: layer.start.y }),
              size: jasmine.objectContaining({ w: layer.size.w, h: layer.size.h }),
              hierarchy: jasmine.objectContaining({ parent: core.meta.document, position }),
            }));
          expect(event.detail.element.id).toBeDefined();
        }
      }, {
        event: Event.FONTS_LOADED,
        /* Validate if fonts were loaded and missing font didn't break the script */
        subscription: () => {
          const keysIterator = document.fonts.keys();
          const keys: Record<string, true> = {};
          while(true) {
            const next= keysIterator.next();
            if (next.done) break;
            keys[next.value.family] = true;
          }
          expect(keys.Correct).withContext('Correct font is present').toBeDefined()
          expect(keys.Broken).withContext('Broken font is not present').toBeUndefined()
          fontChecked = true;
        }
      }
    ]);

    const settings: ISettings = {
      core: {
        fonts: [ { url: 'broken', name: 'Broken' }, { url: '/__spec__/asset/correct.font.ttf', name: 'Correct' } ]
      }
    }

    const event = new CustomEvent<InitEvent>(Event.INIT, { detail: { base: layout, settings } });
    await herald.dispatch(event);

    /* Validate if content was calculated, and drawn once */
    const doc = core.meta.document;
    expect(doc.layout).withContext('Layout has correct size').toHaveSize(layout.length);
    expect(doc.base).withContext('Base has correct size').toHaveSize(layout.length);
    const Clone = core.clone;
    for (let i = 0; i < layout.length; i++) {
      const prefix = `[${String(i)}]`,
        base = doc.base[i],
        layer = doc.layout[i];
      expect(base).withContext(prefix + ' Generates clones').not.toBe(layer);
      expect(Clone.getClone(base)).withContext(prefix + ' Clone is properly linked').toBe(layer);
      expect(Clone.getOriginal(layer)).withContext(prefix + ' Original is properly linked').toBe(base);
    }
    expect(drawn).withContext('Layer was drawn correct amount of time').toBe(layout.length);

    /* Wait for fonts to load */
    let waited = 0;
    while(!fontChecked && (waited += 10) < 3000) { await new Promise(r => setTimeout(r, 10)); }
    expect(fontChecked).withContext('Fonts were checked').toBeTrue();

    unregister();
  });

  it('validate meta works properly', () => {
    const meta = core.meta;

    expect(meta.document).toBeDefined();

    const ids: Record<string, true> = {};
    for (let i = 0; i < 1000; i++) {
      const id = meta.generateId();
      expect(ids[id]).toBeUndefined();
      ids[id] = true;
    }
    const testDefinition = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      object: { string_in_obj: 'string' },
      array: [ { string_in_array: 'string' } ]
    };

    const unregister = herald.batch([
      {
        event: Event.TYPE_DEFINITION,
        subscription: (event: TypeDefinitionEvent) => {
          const { definitions } = event.detail;
          definitions.test = testDefinition;
        }
      }
    ]);

    const definitions = meta.layerDefinitions();
    unregister();
    expect(definitions.test as typeof testDefinition|undefined).toBe(testDefinition);
  });

  it('validate clone and policies works properly', async () => {
    const clone = core.clone;
    const policies = core.policies;
    const original = generateRandomLayer('clear1');
    expect(policies.isLayer(original)).toBeFalse();
    expect(policies.isClone(original)).toBeFalse();

    const cloned = await clone.definitions(original);
    expect(original).not.toBe(cloned);
    expect(clone.getClone(original)).toBe(cloned);
    expect(clone.getOriginal(cloned)).toBe(original);
    expect(clone.getOriginal(original)).toBe(original);
    expect(clone.getClone(cloned)).toBe(cloned);
    console.log(core.meta.document.layout[0]);


    expect(policies.isLayer(core.meta.document.layout[0])).toBeTrue();
    expect(policies.isLayer(core.meta.document.base[0])).toBeTrue();
    expect(policies.isClone(cloned)).toBeTrue();
    expect(policies.isClone(original)).toBeFalse();
  });

  it('validate setting works properly', async () => {
    const setting = core.setting;
    const settings = await setting.retrieve();
    expect(settings[0]).toEqual(jasmine.objectContaining({
      details: jasmine.objectContaining({
        label: 'Core',
      }),
      name: 'core',
    }));
    expect(setting.get('test')).toBeNull();
    expect(setting.has('test')).toBeFalse();
    setting.set('test', 'test')
    expect(setting.has('test')).toBeTrue();
    expect(setting.get('test')).toBe('test');
    expect(setting.has('testObj.new.value')).toBeFalse();
    setting.set('testObj.new.value', 'test2');
    expect(setting.has('testObj.new.value')).toBeTrue();
    expect(typeof setting.get('testObj')).toBe('object');
    expect(typeof setting.get('testObj.new')).toBe('object');
    expect(setting.get('testObj.new.value')).toBe('test2');
  });

  it('validate manage works properly', async () => {
    const manage = core.manage;
    const policies = core.policies;
    const base = core.meta.document.base;
    const layout = core.meta.document.layout;
    const validatePositioning = (layout: Layout): void => {
      layout.forEach((layer, i) => {
        expect(layer.hierarchy!.position).toBe(i);
      });
    }
    const getClone = core.clone.getClone;

    /* MARK LAYER */
    const toBeLayer = generateRandomLayer('clear1');
    expect(policies.isLayer(toBeLayer)).toBeFalse();
    manage.markAsLayer(toBeLayer);
    expect(policies.isLayer(toBeLayer)).toBeTrue();

    /* REMOVE LAYER */
    const firstLayer = base[0];
    const firstClone = layout[0];
    expect(firstLayer.hierarchy!.position).toBe(0);
    manage.removeVolatile(firstClone);
    expect(base[0]).toBe(firstLayer);
    expect(layout[0]).not.toBe(firstClone);
    manage.remove(firstLayer);
    expect(base[0]).not.toBe(firstLayer);
    validatePositioning(base);

    /* ADD LAYER */
    const toAddVolatileLayer = generateRandomLayer('clear2');
    manage.addVolatile(toAddVolatileLayer);
    expect(layout.length).toBeGreaterThan(base.length);
    validatePositioning(layout);
    manage.add(toAddVolatileLayer);
    expect(layout.length).toBe(base.length);
    expect(toAddVolatileLayer.hierarchy?.parent).toBe(core.meta.document);
    validatePositioning(base);

    /* UPDATE LAYER */
    const unregister = herald.batch([
      {
        event: Event.CALC,
        subscription: (e: CustomEvent<CalcEvent>) => {
          const { element } = e.detail;
          if (element?.type === 'return_null') {
            e.detail.element = { type: 'none' };
            return;
          }

          if (element?.type === 'to_be_calced') element._calced = true;
        }
      }
    ]);
    const toBeNull = generateRandomLayer('return_null');
    const toBeCalced = generateRandomLayer('to_be_calced');
    manage.add(toBeNull);
    manage.add(toBeCalced);
    expect(getClone(toBeNull))
      .withContext('Verify that not calculated layer doesn\'t have a clone')
      .toBe(toBeNull)
    ;
    expect(getClone(toBeCalced))
      .withContext('Verify that not calculated layer doesn\'t have a clone')
      .toBe(toBeCalced)
    ;

    await manage.calcAndUpdateLayer(toBeNull);
    await manage.calcAndUpdateLayer(toBeCalced);

    const toBeNullClone = getClone(toBeNull);
    const toBeCalcedClone = getClone(toBeCalced);
    expect(toBeNullClone).not.toBe(toBeNull);
    expect(toBeCalcedClone).not.toBe(toBeCalced);
    expect(toBeCalcedClone._calced).toBeDefined();
    expect(layout).not.toContain(toBeNullClone);
    expect(layout).toContain(toBeCalcedClone);
    await manage.calcAndUpdateLayer(toBeCalced);
    expect(getClone(toBeCalced))
      .withContext('Verify that each calculation results in different clone')
      .not.toBe(toBeCalcedClone)
    ;

    unregister();
  });

  it('validate view works properly', async () => {
    const { manage, view, policies, meta } = core;
    const toCalcType = 'clear1' + String(Math.random());
    const toCalc = generateRandomLayer(toCalcType);
    let wasToCalcCalculated = false;
    manage.add(toCalc);
    let unregister = herald.batch(
      [
        {
          event: Event.CALC,
          subscription: (e: CustomEvent<CalcEvent>) => {
            if (e.detail.element?.type === toCalcType) wasToCalcCalculated = true;
          }
        }
      ]
    );
    const toCalcClone = await view.calc(toCalc);
    expect(policies.isClone(toCalcClone as any)).toBeTrue();
    expect(wasToCalcCalculated).toBeTrue();
    unregister();

    /* RECALCULATED */
    await view.recalculate(); // Run recalculation to remove any volatile layers
    const oldLayout = meta.document.layout;
    await view.recalculate();
    expect(oldLayout).not.toBe(meta.document.layout);
    expect(oldLayout.length).toBe(meta.document.layout.length);

    /* DRAW */
    let drawEventCalledCounter = 0;
    unregister = herald.batch(
      [
        {
          event: Event.DRAW,
          subscription: (e: CustomEvent<DrawEvent>) => {
            drawEventCalledCounter++;
          }
        }
      ]
    );
    view.redraw();
    expect(drawEventCalledCounter).toBe(meta.document.base.length);
    unregister();

    // I am skipping redrawDebounce, move and resize as they use already checked components and are quite simple
  })
});