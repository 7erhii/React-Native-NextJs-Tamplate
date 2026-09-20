import type { CSSProperties } from 'react';

import type { IconName } from '@world/tokens';

/** Stroke paths, 24×24. Same names as the phone (expo-symbols). */
const paths: Record<IconName, string> = {
  home: 'M4 11 12 4l8 7v9H4z M9 20v-7h6v7',
  person: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z M5 20c0-3 3-5 7-5s7 2 7 5',
  settings:
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M12 2.5v2.2 M12 19.3V21.5 M4.9 6.1l1.6 1.6 M17.5 16.3l1.6 1.6 M2.5 12h2.2 M19.3 12H21.5 M4.9 17.9l1.6-1.6 M17.5 7.7l1.6-1.6',
  install: 'M12 4v10 M8 10l4 4 4-4 M5 18h14',
  check: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M8 12l2.5 2.5L16 9',
  warning: 'M12 4 3 20h18z M12 9v5 M12 16.5h.01',
  add: 'M12 5v14 M5 12h14',
  'sign-in': 'M14 7l5 5-5 5 M19 12H8 M10 5H5v14h5',
};

export function Icon({
  name,
  size = 18,
  color = 'currentColor',
  title,
}: {
  name: IconName;
  size?: number;
  color?: string;
  title?: string;
}) {
  const style: CSSProperties = { width: size, height: size, flex: '0 0 auto' };

  return (
    <svg
      viewBox="0 0 24 24"
      style={style}
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={paths[name]} />
    </svg>
  );
}
