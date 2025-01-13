import { IBaseDef, IParameters } from "@src/index";

export interface IClone {
  cloneDefinitions: (data: IBaseDef) => Promise<IBaseDef>;
  isClone: (layer: Record<symbol, unknown>) => boolean;
  getOriginal: <T extends UnknownRecord = UnknownRecord>(object: T) => T;
  getClone: <T extends UnknownRecord = UnknownRecord>(object: T) => T;
}

export declare type UnknownRecord = Record<symbol | string, unknown>;
declare type RecursiveWeakMap = WeakMap<UnknownRecord, UnknownRecord>;

export default function Clone({ modules, canvas }: IParameters): IClone {
  const ctx = canvas!.getContext('2d');
  const maxDepth = 50;
  const originalSymbol = Symbol('original');
  const cloneSymbol = Symbol('clone');

  const isObject = (value: unknown): boolean => {
    return typeof value === 'object' && !Array.isArray(value) && value !== null;
  }

  const getOriginal = function <T extends UnknownRecord = UnknownRecord>(object: T): T {
    return (object[originalSymbol] ?? object) as T;
  }

  const getClone = function <T extends UnknownRecord = UnknownRecord>(object: T): T {
    return (object[cloneSymbol] ?? object) as T;
  }

  const iterateResolveAndCloneObject = async (
    object: Record<string|symbol, unknown>,
    recursive: RecursiveWeakMap,
    depth = 0,
  ): Promise<UnknownRecord> => {
    if (recursive.has(object)) {
      return recursive.get(object)!;
    }

    if (object[originalSymbol] || object.type === 'document') {
      return object;
    }

    const clone = {} as Record<string|symbol, unknown>;
    recursive.set(object, clone);
    clone[originalSymbol] = object;
    object[cloneSymbol] = clone;
    if (maxDepth <= depth + 1) {
      console.error('We\'ve reach limit depth!', object);
      throw new Error('limit reached');
    }

    await Promise.all(Object.keys(object).map(async key => {
      let result = await resolve(object[key], object);

      if (isObject(result)) {
        result = await iterateResolveAndCloneObject(result as UnknownRecord, recursive, depth + 1);
      } else if (Array.isArray(result)) {
        result = await iterateResolveAndCloneArray(result, recursive, depth + 1);
      }

      clone[key] = result;
    }));

    return clone;
  }

  const iterateResolveAndCloneArray = async (
    object: unknown[],
    recursive: RecursiveWeakMap,
    depth = 0,
  ): Promise<unknown[]> => {
    const clone = [] as unknown[];
    if (maxDepth <= depth + 1) {
      console.error('We\'ve reach limit depth!', object);
      throw new Error('limit reached');
    }

    await Promise.all(object.map(async value => {
      let result = await resolve(value, object);

      if (isObject(result)) {
        result = await iterateResolveAndCloneObject(result as UnknownRecord, recursive, depth + 1);
      } else if (Array.isArray(result)) {
        result = await iterateResolveAndCloneArray(result, recursive, depth + 1);
      }

      clone.push(result);
    }));

    return clone;
  }

  const resolve = async (value: unknown, object: unknown): Promise<unknown> => {
    return typeof value == 'function'
      ? await value(modules, ctx, object)
      : value
    ;
  }

  const cloneDefinitions = async (data: IBaseDef): Promise<IBaseDef> => {
    return await iterateResolveAndCloneObject(data, new WeakMap()) as IBaseDef;
  }

  const isClone = (layer: Record<symbol, unknown>): boolean => layer[originalSymbol] === true;

  return {
    isClone,
    cloneDefinitions,
    getClone,
    getOriginal,
  };
}
