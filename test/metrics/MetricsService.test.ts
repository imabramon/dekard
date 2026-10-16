import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { trackNotes } from "../../src/metrics/trackNotes.ts";
import type { SkillEvent } from "../../src/metrics/MetricEvent.ts";
import { createTestContext, type TestContext } from "../helpers.ts";

describe("MetricsService", () => {
  let context: TestContext;
  let notes: ReturnType<typeof trackNotes>;

  beforeEach(() => {
    context = createTestContext();
    notes = trackNotes({
      addNote: context.service.addNote,
      searchNotes: context.service.searchNotes,
      deleteNote: context.service.deleteNote,
      trackToolCall: context.metrics.trackToolCall,
    });
  });

  afterEach(() => {
    context.close();
  });

  const track = async (events: SkillEvent[]): Promise<void> => {
    for (const event of events) {
      await context.metrics.trackSkillEvent("p/files", event);
    }
  };

  test("empty topic has zero counters and no rates", async () => {
    const stats = await context.metrics.getStats("p/files");

    assert.equal(stats.searches, 0);
    assert.equal(stats.cacheHitRate, null);
    assert.equal(stats.reuseRate, null);
    assert.equal(stats.skillEvents.cache_hit, 0);
    assert.deepEqual(stats.foundNotes, []);
  });

  test("tracked notes record searches, added and deleted notes", async () => {
    await notes.addNote("p/files/resx", "getResx", "src/a.ts", "resx");
    await notes.addNote("p/files/dates", "formatDate", "src/b.ts", "date");
    await notes.searchNotes("p/files/", "resx");
    await notes.searchNotes("p/files", "resx");
    await notes.searchNotes("p/files", "modal");
    await notes.searchNotes("p/files", "modal");
    await notes.deleteNote("p/files/dates", "formatDate");
    await notes.deleteNote("p/files/dates", "missing");

    const stats = await context.metrics.getStats("p/files");

    assert.equal(stats.searches, 4);
    assert.equal(stats.emptySearches, 2);
    assert.deepEqual(stats.emptyQueries, ["modal"]);
    assert.equal(stats.addedNotes, 2);
    assert.equal(stats.deletedNotes, 1);
    assert.deepEqual(stats.foundNotes, [{ topic: "p/files/resx", key: "getResx", hits: 2 }]);
    assert.deepEqual(stats.unusedNotes, []);
  });

  test("notes never returned by search are unused", async () => {
    await notes.addNote("p/files", "found", "v", "resx");
    await notes.addNote("p/files", "lost", "v", "date");
    await notes.searchNotes("p/files", "resx");

    assert.deepEqual((await context.metrics.getStats("p/files")).unusedNotes, [
      { topic: "p/files", key: "lost", updatedAt: "2026-10-01T00:00:00.000Z" },
    ]);
  });

  test("calculates cache hit rate and reuse rate", async () => {
    await track(["cache_hit", "cache_hit", "cache_hit", "code_hit", "miss", "cache_stale"]);
    await track(["reused", "extended", "created", "created"]);

    const stats = await context.metrics.getStats("p/files");

    assert.equal(stats.cacheHitRate, 0.6);
    assert.equal(stats.reuseRate, 0.5);
    assert.equal(stats.skillEvents.cache_stale, 1);
  });

  test("lists misses caught on review", async () => {
    await context.metrics.trackSkillEvent("p/files", "from_review", "getResx");
    await context.metrics.trackSkillEvent("p/files", "manual", "other");

    assert.deepEqual((await context.metrics.getStats("p/files")).reviewMisses, [
      { topic: "p/files", key: "getResx", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
  });

  test("stats include nested topics only", async () => {
    await context.metrics.trackSkillEvent("p/files/resx", "miss");
    await context.metrics.trackSkillEvent("p/filesX", "miss");
    await context.metrics.trackSkillEvent("other/files", "miss");

    assert.equal((await context.metrics.getStats("p/files")).skillEvents.miss, 1);
  });

  test("since filters older events", async () => {
    await track(["miss"]);
    context.clock.advanceDays(2);
    await track(["cache_hit"]);

    const stats = await context.metrics.getStats("p/files", "2026-10-02");

    assert.equal(stats.since, "2026-10-02T00:00:00.000Z");
    assert.equal(stats.skillEvents.miss, 0);
    assert.equal(stats.cacheHitRate, 1);
  });

  test("invalid since, event and topic are rejected", async () => {
    await assert.rejects(context.metrics.getStats("p/files", "yesterday"), /Invalid date/);
    await assert.rejects(context.metrics.trackSkillEvent("p/files", "unknown" as SkillEvent), /Invalid event/);
    await assert.rejects(context.metrics.trackSkillEvent("/", "miss"), /Invalid topic/);
    await assert.rejects(context.metrics.trackSkillEvent("p/files", "miss", "k\u0000"), /null character/);
  });

  test("events older than 90 days are purged", async () => {
    await track(["miss"]);
    context.clock.advanceDays(89);
    assert.equal(await context.metrics.purgeExpiredEvents(), 0);

    context.clock.advanceDays(2);
    assert.equal(await context.metrics.purgeExpiredEvents(), 1);
    assert.equal((await context.metrics.getStats("p/files")).skillEvents.miss, 0);
  });
});
