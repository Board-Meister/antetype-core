import { Herald } from "@boardmeister/herald";
import Clone from "@src/component/clone";
import { generateRandomLayer } from "test/helpers/definition.helper";

describe('Clone component', () => {
  const herald = new Herald();
  const canvas = document.createElement('canvas');
  const clone = Clone({
    herald,
    canvas
  })

  it('clones properly', async () => {
    const original = generateRandomLayer('clear1');
    const cloned = await clone.cloneDefinition(original);
    expect(original).not.toBe(cloned);
    expect(clone.getClone(original)).toBe(cloned);
    expect(clone.getOriginal(cloned)).toBe(original);
    expect(clone.getOriginal(original)).toBe(original);
    expect(clone.getClone(cloned)).toBe(cloned);
    expect(clone.isClone(cloned)).toBeTrue();
    expect(clone.isClone(original)).toBeFalse();
  })
});