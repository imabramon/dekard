import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { IEventsRepository } from "../metrics/IEventsRepository.ts";
import type { MetricEvent, NoteRef } from "../metrics/MetricEvent.ts";
import { getTopicTreeParams, openSqliteDatabase, type SqliteRow } from "./sqlite.ts";

interface SqliteEventsRepositoryParams {
  dbPath: string;
}

export class SqliteEventsRepository implements IEventsRepository {
  private readonly _db: DatabaseSync;
  private readonly _addStatement: StatementSync;
  private readonly _findByTopicStatement: StatementSync;
  private readonly _purgeBeforeStatement: StatementSync;

  public constructor(params: SqliteEventsRepositoryParams) {
    this._db = openSqliteDatabase(params.dbPath);
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        topic TEXT NOT NULL,
        key TEXT,
        query TEXT,
        results TEXT
      );
      CREATE INDEX IF NOT EXISTS events_topic_created_at ON events (topic, created_at);
    `);
    this._addStatement = this._db.prepare(
      "INSERT INTO events (created_at, kind, name, topic, key, query, results) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    this._findByTopicStatement = this._db.prepare(`
      SELECT created_at AS createdAt, kind, name, topic, key, query, results FROM events
      WHERE (topic = ? OR substr(topic, 1, length(?)) = ?) AND created_at >= ?
      ORDER BY created_at, id
    `);
    this._purgeBeforeStatement = this._db.prepare("DELETE FROM events WHERE created_at < ?");
  }

  public add = async (event: MetricEvent): Promise<void> => {
    this._addStatement.run(
      event.createdAt,
      event.kind,
      event.name,
      event.topic,
      event.key,
      event.query,
      event.results === null ? null : JSON.stringify(event.results),
    );
  };

  public findByTopic = async (topic: string, since: string): Promise<MetricEvent[]> =>
    this._findByTopicStatement.all(...getTopicTreeParams(topic), since).map(this._toEvent);

  public purgeBefore = async (date: string): Promise<number> => Number(this._purgeBeforeStatement.run(date).changes);

  public close = (): void => {
    this._db.close();
  };

  private _toEvent = (row: SqliteRow): MetricEvent => ({
    createdAt: String(row.createdAt),
    kind: row.kind === "skill" ? "skill" : "tool",
    name: String(row.name),
    topic: String(row.topic),
    key: row.key === null ? null : String(row.key),
    query: row.query === null ? null : String(row.query),
    results: row.results === null ? null : (JSON.parse(String(row.results)) as NoteRef[]),
  });
}
