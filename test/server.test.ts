import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { connectClient, createTestContext, type TestClient, type TestContext } from "./helpers.ts";

describe("MCP server", () => {
  let context: TestContext;
  let client: TestClient;

  beforeEach(async () => {
    context = createTestContext();
    client = await connectClient(context);
  });

  afterEach(async () => {
    await client.close();
    context.close();
  });

  test("exposes all note tools", async () => {
    assert.deepEqual(await client.listToolNames(), [
      "add_note",
      "delete_note",
      "get_deleted_topic_notes",
      "get_note",
      "get_stats",
      "get_topic_notes",
      "restore_note",
      "search_notes",
      "track_event",
    ]);
  });

  test("add_note, get_note and get_topic_notes work together", async () => {
    const added = await client.callTool("add_note", { topic: "tsc", key: "abc", value: "passed" });

    assert.deepEqual(added, {
      isError: false,
      data: { topic: "tsc", key: "abc", value: "passed", description: "", updatedAt: "2026-10-01T00:00:00.000Z" },
    });
    assert.deepEqual(await client.callTool("get_note", { topic: "tsc", key: "abc" }), added);
    assert.deepEqual(await client.callTool("get_topic_notes", { topic: "tsc" }), {
      isError: false,
      data: [added.data],
    });
  });

  test("get_note returns null for missing note", async () => {
    assert.deepEqual(await client.callTool("get_note", { topic: "tsc", key: "missing" }), {
      isError: false,
      data: null,
    });
  });

  test("search_notes finds notes by description", async () => {
    await client.callTool("add_note", {
      topic: "pyrus/files/resx",
      key: "getResxString",
      value: "src/resx.ts",
      description: "resx localization helper",
    });
    await client.callTool("add_note", { topic: "pyrus/files", key: "formatDate", value: "src/date.ts" });

    const result = await client.callTool("search_notes", { topic: "pyrus/files", query: "localization" });

    assert.deepEqual(result, {
      isError: false,
      data: [
        {
          topic: "pyrus/files/resx",
          key: "getResxString",
          value: "src/resx.ts",
          description: "resx localization helper",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
  });

  test("tool calls and skill events are reflected in get_stats", async () => {
    await client.callTool("add_note", {
      topic: "dekard/files/resx",
      key: "getResxString",
      value: "src/resx.ts",
      description: "resx localization",
    });
    await client.callTool("search_notes", { topic: "dekard/files", query: "resx" });
    await client.callTool("search_notes", { topic: "dekard/files", query: "modal" });
    await client.callTool("track_event", { topic: "dekard/files", event: "cache_hit", key: "getResxString" });
    await client.callTool("track_event", { topic: "dekard/files", event: "miss" });
    await client.callTool("track_event", { topic: "dekard/files", event: "from_review", key: "formatDate" });

    const { isError, data } = await client.callTool("get_stats", { topic: "dekard/files" });
    const stats = data as Record<string, unknown>;

    assert.equal(isError, false);
    assert.equal(stats.searches, 2);
    assert.equal(stats.emptySearches, 1);
    assert.deepEqual(stats.emptyQueries, ["modal"]);
    assert.equal(stats.addedNotes, 1);
    assert.equal(stats.cacheHitRate, 0.5);
    assert.deepEqual(stats.foundNotes, [{ topic: "dekard/files/resx", key: "getResxString", hits: 1 }]);
    assert.deepEqual(stats.reviewMisses, [
      { topic: "dekard/files", key: "formatDate", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
  });

  test("track_event rejects unknown events", async () => {
    const result = await client.callTool("track_event", { topic: "dekard/files", event: "unknown" });

    assert.equal(result.isError, true);
  });

  test("delete, list deleted and restore flow", async () => {
    await client.callTool("add_note", { topic: "tsc", key: "abc", value: "passed" });

    assert.deepEqual(await client.callTool("delete_note", { topic: "tsc", key: "abc" }), { isError: false, data: true });
    assert.deepEqual(await client.callTool("get_topic_notes", { topic: "tsc" }), { isError: false, data: [] });

    const deleted = await client.callTool("get_deleted_topic_notes", { topic: "tsc" });
    assert.equal((deleted.data as unknown[]).length, 1);

    const restored = await client.callTool("restore_note", { topic: "tsc", key: "abc" });
    assert.equal((restored.data as { value: string }).value, "passed");
  });

  test("invalid topic returns a tool error instead of crashing", async () => {
    const result = await client.callTool("get_topic_notes", { topic: "/" });

    assert.equal(result.isError, true);
    assert.match(String(result.data), /Invalid topic/);
    assert.equal((await client.callTool("get_note", { topic: "tsc", key: "k" })).isError, false);
  });
});
