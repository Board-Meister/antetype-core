import { IBaseDef, type Canvas } from "@src/index";

export interface IClone {
  cloneDefinition: (data: IBaseDef) => Promise<IBaseDef>;
  isClone: (layer: Record<symbol, unknown>) => boolean;
  getOriginal: <T extends UnknownRecord = UnknownRecord>(object: T) => T;
  getClone: <T extends UnknownRecord = UnknownRecord>(object: T) => T;
}

export declare type UnknownRecord = Record<symbol | string, unknown>;
declare type RecursiveWeakMap = WeakMap<UnknownRecord, UnknownRecord>;

export type ResolveFunction = (
  ctx: CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D | null | undefined,
  object: unknown
) => Promise<unknown>;

const originalSymbol = Symbol('original');
const cloneSymbol = Symbol('clone');

export default function Clone(getCanvas: () => Canvas|null): IClone {
  const maxDepth = 50;

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

    for (const key of Object.keys(object)) {
      let result = await resolve(object[key], object);

      if (isObject(result)) {
        result = await iterateResolveAndCloneObject(result as UnknownRecord, recursive, depth + 1);
      } else if (Array.isArray(result)) {
        result = await iterateResolveAndCloneArray(result, recursive, depth + 1);
      }

      clone[key] = result;
    };

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

    for (const value of object) {
      let result = await resolve(value, object);

      if (isObject(result)) {
        result = await iterateResolveAndCloneObject(result as UnknownRecord, recursive, depth + 1);
      } else if (Array.isArray(result)) {
        result = await iterateResolveAndCloneArray(result, recursive, depth + 1);
      }

      clone.push(result);
    };

    return clone;
  }

  const resolve = async (value: unknown, object: unknown): Promise<unknown> => {
    return typeof value == 'function'
      ? await (value as ResolveFunction)(getCanvas()?.getContext('2d'), object)
      : value
    ;
  }

  const cloneDefinition = async (data: IBaseDef): Promise<IBaseDef> => {
    return await iterateResolveAndCloneObject(data, new WeakMap()) as IBaseDef;
  }

  const isClone = (layer: Record<symbol, unknown>): boolean => !!layer[originalSymbol];

  return {
    isClone,
    cloneDefinition,
    getClone,
    getOriginal,
  };
}
