export type {
  AppConfig,
  AuthSource,
  AuthWall,
  ConflictStrategyName,
  IdentityMode,
  PersistenceMode,
} from './app.config';
export {
  appConfig,
  formatProductRelease,
  mobileShowsAuth,
  usesBackend,
  webShowsAuth,
} from './app.config';
export { findConfigProblems, type ConfigProblem } from './schema';
