import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { INotesRepository } from "../notes/INotesRepository.ts";
import type { DeletedNote, Note } from "../notes/Note.ts";
import { getTopicTreeParams, openSqliteDatabase, type SqliteRow } from "./sqlite.ts";

interface SqliteNotesRepositoryParams {
  dbPath: string;
}

export class SqliteNotesRepository implements INotesRepository {
  private readonly _db: DatabaseSync;
  private readonly _upsertStatement: StatementSync;
  private readonly _findStatement: StatementSync;
  private readonly _findByTopicStatement: StatementSync;
  private readonly _findDeletedByTopicStatement: StatementSync;
  private readonly _markDeletedStatement: StatementSync;
  private readonly _restoreStatement: StatementSync;
  private readonly _purgeDeletedBeforeStatement: StatementSync;

  public constructor(params: SqliteNotesRepositoryParams) {
    this._db = openSqliteDatabase(params.dbPath);
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        topic TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        PRIMARY KEY (topic, key)
      ) WITHOUT ROWID;
    `);
    this._migrate();
    this._upsertStatement = this._db.prepare(`
      INSERT INTO notes (topic, key, value, description, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT (topic, key) DO UPDATE SET
        value = excluded.value,
        description = excluded.description,
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `);
    this._findStatement = this._db.prepare(`
      SELECT topic, key, value, description, updated_at AS updatedAt FROM notes
      WHERE topic = ? AND key = ? AND deleted_at IS NULL
    `);
    this._findByTopicStatement = this._db.prepare(`
      SELECT topic, key, value, description, updated_at AS updatedAt FROM notes
      WHERE (topic = ? OR substr(topic, 1, length(?)) = ?) AND deleted_at IS NULL
      ORDER BY topic, updated_at DESC
    `);
    this._findDeletedByTopicStatement = this._db.prepare(`
      SELECT topic, key, value, description, updated_at AS updatedAt, deleted_at AS deletedAt FROM notes
      WHERE (topic = ? OR substr(topic, 1, length(?)) = ?) AND deleted_at IS NOT NULL
      ORDER BY topic, deleted_at DESC
    `);
    this._markDeletedStatement = this._db.prepare(
      "UPDATE notes SET deleted_at = ? WHERE topic = ? AND key = ? AND deleted_at IS NULL",
    );
    this._restoreStatement = this._db.prepare(
      "UPDATE notes SET deleted_at = NULL WHERE topic = ? AND key = ? AND deleted_at IS NOT NULL",
    );
    this._purgeDeletedBeforeStatement = this._db.prepare(
      "DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?",
    );
  }

  public upsert = async (note: Note): Promise<void> => {
    this._upsertStatement.run(note.topic, note.key, note.value, note.description, note.updatedAt);
  };

  public find = async (topic: string, key: string): Promise<Note | null> => {
    const row = this._findStatement.get(topic, key);
    return row ? this._toNote(row) : null;
  };

  public findByTopic = async (topic: string): Promise<Note[]> =>
    this._findByTopicStatement.all(...getTopicTreeParams(topic)).map(this._toNote);

  public findDeletedByTopic = async (topic: string): Promise<DeletedNote[]> =>
    this._findDeletedByTopicStatement.all(...getTopicTreeParams(topic)).map(this._toDeletedNote);

  public markDeleted = async (topic: string, key: string, deletedAt: string): Promise<boolean> =>
    Number(this._markDeletedStatement.run(deletedAt, topic, key).changes) > 0;

  public restore = async (topic: string, key: string): Promise<boolean> =>
    Number(this._restoreStatement.run(topic, key).changes) > 0;

  public purgeDeletedBefore = async (date: string): Promise<number> =>
    Number(this._purgeDeletedBeforeStatement.run(date).changes);

  public close = (): void => {
    this._db.close();
  };

  private _toNote = (row: SqliteRow): Note => ({
    topic: String(row.topic),
    key: String(row.key),
    value: String(row.value),
    description: String(row.description),
    updatedAt: String(row.updatedAt),
  });

  private _toDeletedNote = (row: SqliteRow): DeletedNote => ({
    ...this._toNote(row),
    deletedAt: String(row.deletedAt),
  });

  private _migrate = (): void => {
    const columns = this._db.prepare("PRAGMA table_info(notes)").all();
    if (!columns.some((column) => column.name === "deleted_at")) {
      this._db.exec("ALTER TABLE notes ADD COLUMN deleted_at TEXT");
    }
    if (!columns.some((column) => column.name === "description")) {
      this._db.exec("ALTER TABLE notes ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    }
  };
}
