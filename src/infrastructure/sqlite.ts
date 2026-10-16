import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqliteRow = Record<string, unknown>;

export const openSqliteDatabase = (dbPath: string): DatabaseSync => {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
  `);
  return db;
};

export const getTopicTreeParams = (topic: string): [string, string, string] => {
  const childPrefix = `${topic}/`;
  return [topic, childPrefix, childPrefix];
};
