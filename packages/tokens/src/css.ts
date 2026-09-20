import { color, radius, space, type } from './tokens';

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function entriesToCss(prefix: string, values: object): string {
  return Object.entries(values as Record<string, string | number>)
    .map(([key, value]) => `  --${prefix}-${kebab(key)}: ${typeof value === 'number' ? `${value}px` : value};`)
    .join('\n');
}

function paletteBlock(scheme: 'light' | 'dark'): string {
  return entriesToCss('color', color[scheme]);
}

/**
 * CSS custom properties for the website. Dark is the default (current site).
 * Light is `[data-theme="light"]`.
 */
export function tokenStylesheet(): string {
  const spaceBlock = entriesToCss('space', space);
  const radiusBlock = entriesToCss('radius', radius);
  const typeSize = Object.entries(type)
    .map(([name, spec]) => `  --type-${name}-size: ${spec.fontSize}px;`)
    .join('\n');

  return `:root, [data-theme="dark"] {
  color-scheme: dark;
${paletteBlock('dark')}
${spaceBlock}
${radiusBlock}
${typeSize}
}

[data-theme="light"] {
  color-scheme: light;
${paletteBlock('light')}
}
`;
}
