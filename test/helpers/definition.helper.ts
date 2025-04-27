import type { IBaseDef } from "@src/index";

export const generateRandomLayer = (type: string): IBaseDef => ({
  type,
  start: { x: Math.random(), y: Math.random() },
  size: { w: Math.random(), h: Math.random() },
  _mark: Math.random(),
});