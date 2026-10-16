import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { connectClient, createTestContext, type TestClient, type TestContext } from "./helpers.ts";

describe("MCP server", () => {
  let context: TestContext;
  let client: TestClient;

  beforeEach(async () => {
    context = createTestContext();
    client = await connectClient(context.service);
  });

  afterEach(async () => {
    await client.close();
    context.repository.close();
  });

  test("exposes all note tools", async () => {
    assert.deepEqual(await client.listToolNames(), [
      "add_note",
      "delete_note",
      "get_deleted_topic_notes",
      "get_note",
      "get_topic_notes",
      "restore_note",
    ]);
  });

  test("add_note, get_note and get_topic_notes work together", async () => {
    const added = await client.callTool("add_note", { topic: "tsc", key: "abc", value: "passed" });

    assert.deepEqual(added, {
      isError: false,
      data: { topic: "tsc", key: "abc", value: "passed", updatedAt: "2026-10-01T00:00:00.000Z" },
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
