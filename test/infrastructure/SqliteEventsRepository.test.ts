import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { SqliteEventsRepository } from "../../src/infrastructure/SqliteEventsRepository.ts";
import { SqliteNotesRepository } from "../../src/infrastructure/SqliteNotesRepository.ts";
import type { MetricEvent } from "../../src/metrics/MetricEvent.ts";

const event = (topic: string, createdAt = "2026-10-01T00:00:00.000Z"): MetricEvent => ({
  createdAt,
  kind: "tool",
  name: "search_notes",
  topic,
  key: null,
  query: "resx",
  results: [{ topic, key: "getResx" }],
});

describe("SqliteEventsRepository", () => {
  let repository: SqliteEventsRepository;

  beforeEach(() => {
    repository = new SqliteEventsRepository({ dbPath: ":memory:" });
  });

  afterEach(() => {
    repository.close();
  });

  test("stores and reads events with results", async () => {
    const skillEvent: MetricEvent = { ...event("t"), kind: "skill", name: "miss", query: null, results: null };
    await repository.add(event("t"));
    await repository.add(skillEvent);

    assert.deepEqual(await repository.findByTopic("t", ""), [event("t"), skillEvent]);
  });

  test("findByTopic returns the topic and its nested topics only", async () => {
    for (const topic of ["p", "p/files", "p/files/resx", "p/filesX"]) {
      await repository.add(event(topic));
    }

    assert.deepEqual(
      (await repository.findByTopic("p/files", "")).map((item) => item.topic),
      ["p/files", "p/files/resx"],
    );
  });

  test("findByTopic filters by since and sorts by time", async () => {
    await repository.add(event("t", "2026-10-03T00:00:00.000Z"));
    await repository.add(event("t", "2026-10-01T00:00:00.000Z"));
    await repository.add(event("t", "2026-10-02T00:00:00.000Z"));

    assert.deepEqual(
      (await repository.findByTopic("t", "2026-10-02T00:00:00.000Z")).map((item) => item.createdAt),
      ["2026-10-02T00:00:00.000Z", "2026-10-03T00:00:00.000Z"],
    );
  });

  test("purgeBefore removes only older events", async () => {
    await repository.add(event("t", "2026-09-01T00:00:00.000Z"));
    await repository.add(event("t", "2026-10-10T00:00:00.000Z"));

    assert.equal(await repository.purgeBefore("2026-10-01T00:00:00.000Z"), 1);
    assert.equal((await repository.findByTopic("t", "")).length, 1);
  });
});

describe("SqliteEventsRepository file database", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dekard-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("shares the database file with notes", async () => {
    const dbPath = join(dir, "notes.db");
    const notes = new SqliteNotesRepository({ dbPath });
    const events = new SqliteEventsRepository({ dbPath });
    await notes.upsert({ topic: "t", key: "k", value: "v", description: "", updatedAt: "2026-10-01T00:00:00.000Z" });
    await events.add(event("t"));
    events.close();
    notes.close();

    const reopened = new SqliteEventsRepository({ dbPath });
    assert.equal((await reopened.findByTopic("t", "")).length, 1);
    reopened.close();
  });
});
