import { color } from '../tokens';
import { iconNames } from '../icons';

describe('@world/tokens', () => {
  it('keeps the same semantic keys in light and dark', () => {
    expect(Object.keys(color.light).sort()).toEqual(Object.keys(color.dark).sort());
  });

  it('uses the same accent in both schemes so brand does not flip', () => {
    expect(color.light.accent).toBe(color.dark.accent);
  });

  it('has a unique icon name list', () => {
    expect(new Set(iconNames).size).toBe(iconNames.length);
  });
});
