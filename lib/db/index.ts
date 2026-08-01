/**
 * lib/db — the storage layer, split one module per table.
 *
 * Every caller imports from '@/lib/db'; this barrel is the whole public API, so
 * moving a helper between table modules never touches a route. The table
 * modules are the single place where SQLite storage shapes (active INTEGER 0/1,
 * bigint from INTEGER columns) are serialized to/from the domain types.
 */
export { getClient, type DB } from './client';
export * from './metrics';
export * from './entries';
export * from './bulk';
export * from './timeline';
export * from './sync';
export * from './oauth';
