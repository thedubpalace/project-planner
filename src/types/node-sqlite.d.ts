// Minimal ambient types for Node's built-in node:sqlite module (experimental,
// not yet in the pinned @types/node). Only the surface we actually use.
declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number;
    lastInsertRowid: number | bigint;
  }
  export class StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
  }
  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
