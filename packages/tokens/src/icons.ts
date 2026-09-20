export const iconNames = [
  'home',
  'person',
  'settings',
  'install',
  'check',
  'warning',
  'add',
  'sign-in',
] as const;

export type IconName = (typeof iconNames)[number];
