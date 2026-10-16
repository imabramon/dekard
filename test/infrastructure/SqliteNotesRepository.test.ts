import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, test } from "node:test";
import { SqliteNotesRepository } from "../../src/infrastructure/SqliteNotesRepository.ts";

const note = (topic: string, key: string, value = "v", updatedAt = "2026-10-01T00:00:00.000Z") => ({
  topic,
  key,
  value,
  description: "",
  updatedAt,
});

describe("SqliteNotesRepository", () => {
  let repository: SqliteNotesRepository;

  beforeEach(() => {
    repository = new SqliteNotesRepository({ dbPath: ":memory:" });
  });

  afterEach(() => {
    repository.close();
  });

  test("upsert creates and overwrites a note", async () => {
    await repository.upsert(note("tsc", "abc", "passed"));
    await repository.upsert(note("tsc", "abc", "failed", "2026-10-02T00:00:00.000Z"));

    assert.deepEqual(await repository.find("tsc", "abc"), note("tsc", "abc", "failed", "2026-10-02T00:00:00.000Z"));
    assert.equal((await repository.findByTopic("tsc")).length, 1);
  });

  test("upsert stores and overwrites description", async () => {
    await repository.upsert({ ...note("files", "helper"), description: "first" });
    assert.equal((await repository.find("files", "helper"))?.description, "first");

    await repository.upsert({ ...note("files", "helper"), description: "second" });
    assert.equal((await repository.find("files", "helper"))?.description, "second");
  });

  test("find returns null for missing note", async () => {
    assert.equal(await repository.find("tsc", "missing"), null);
  });

  test("findByTopic returns the topic and its nested topics only", async () => {
    for (const topic of ["company", "company/branch", "company/branch/a", "company/branch/a/deep", "company/branchX"]) {
      await repository.upsert(note(topic, "k"));
    }

    const topics = (await repository.findByTopic("company/branch")).map((item) => item.topic);

    assert.deepEqual(topics, ["company/branch", "company/branch/a", "company/branch/a/deep"]);
  });

  test("findByTopic is case sensitive", async () => {
    await repository.upsert(note("company/a", "k"));
    await repository.upsert(note("Company/b", "k"));

    assert.deepEqual(
      (await repository.findByTopic("company")).map((item) => item.topic),
      ["company/a"],
    );
  });

  test("findByTopic sorts by topic and then by updatedAt desc", async () => {
    await repository.upsert(note("t", "old", "v", "2026-10-01T00:00:00.000Z"));
    await repository.upsert(note("t", "new", "v", "2026-10-02T00:00:00.000Z"));
    await repository.upsert(note("t/a", "k", "v", "2026-10-03T00:00:00.000Z"));

    assert.deepEqual(
      (await repository.findByTopic("t")).map((item) => `${item.topic}:${item.key}`),
      ["t:new", "t:old", "t/a:k"],
    );
  });

  test("markDeleted hides the note and reports whether anything changed", async () => {
    await repository.upsert(note("tsc", "abc"));

    assert.equal(await repository.markDeleted("tsc", "abc", "2026-10-05T00:00:00.000Z"), true);
    assert.equal(await repository.markDeleted("tsc", "abc", "2026-10-06T00:00:00.000Z"), false);
    assert.equal(await repository.markDeleted("tsc", "missing", "2026-10-06T00:00:00.000Z"), false);
    assert.equal(await repository.find("tsc", "abc"), null);
    assert.deepEqual(await repository.findByTopic("tsc"), []);
    assert.deepEqual(await repository.findDeletedByTopic("tsc"), [
      { ...note("tsc", "abc"), deletedAt: "2026-10-05T00:00:00.000Z" },
    ]);
  });

  test("restore returns the note back", async () => {
    await repository.upsert(note("tsc", "abc"));
    await repository.markDeleted("tsc", "abc", "2026-10-05T00:00:00.000Z");

    assert.equal(await repository.restore("tsc", "abc"), true);
    assert.equal(await repository.restore("tsc", "abc"), false);
    assert.deepEqual(await repository.find("tsc", "abc"), note("tsc", "abc"));
    assert.deepEqual(await repository.findDeletedByTopic("tsc"), []);
  });

  test("upsert of a deleted note makes it active again", async () => {
    await repository.upsert(note("tsc", "abc", "old"));
    await repository.markDeleted("tsc", "abc", "2026-10-05T00:00:00.000Z");
    await repository.upsert(note("tsc", "abc", "new"));

    assert.equal((await repository.find("tsc", "abc"))?.value, "new");
    assert.deepEqual(await repository.findDeletedByTopic("tsc"), []);
  });

  test("purgeDeletedBefore removes only deleted notes older than the date", async () => {
    await repository.upsert(note("t", "active"));
    await repository.upsert(note("t", "expired"));
    await repository.upsert(note("t", "fresh"));
    await repository.markDeleted("t", "expired", "2026-09-01T00:00:00.000Z");
    await repository.markDeleted("t", "fresh", "2026-10-10T00:00:00.000Z");

    assert.equal(await repository.purgeDeletedBefore("2026-10-01T00:00:00.000Z"), 1);
    assert.deepEqual(
      (await repository.findByTopic("t")).map((item) => item.key),
      ["active"],
    );
    assert.deepEqual(
      (await repository.findDeletedByTopic("t")).map((item) => item.key),
      ["fresh"],
    );
  });
});

describe("SqliteNotesRepository file database", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dekard-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("creates missing directories and persists data between instances", async () => {
    const dbPath = join(dir, "nested", "deeper", "notes.db");
    const first = new SqliteNotesRepository({ dbPath });
    await first.upsert(note("tsc", "abc", "passed"));
    first.close();

    const second = new SqliteNotesRepository({ dbPath });
    assert.equal((await second.find("tsc", "abc"))?.value, "passed");
    second.close();
  });

  test("migrates a database without deleted_at and description columns", async () => {
    const dbPath = join(dir, "old.db");
    const oldDb = new DatabaseSync(dbPath);
    oldDb.exec(`
      CREATE TABLE notes (
        topic TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (topic, key)
      ) WITHOUT ROWID;
      INSERT INTO notes VALUES ('tsc', 'abc', 'passed', '2026-10-01T00:00:00.000Z');
    `);
    oldDb.close();

    const repository = new SqliteNotesRepository({ dbPath });
    assert.deepEqual(await repository.find("tsc", "abc"), note("tsc", "abc", "passed"));
    assert.equal(await repository.markDeleted("tsc", "abc", "2026-10-02T00:00:00.000Z"), true);
    assert.equal(await repository.find("tsc", "abc"), null);
    repository.close();
  });
});
