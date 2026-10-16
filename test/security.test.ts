import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { connectClient, createTestContext, type TestClient, type TestContext } from "./helpers.ts";

const INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "' OR 1=1 --",
  "x'); DROP TABLE notes; --",
  "'; DELETE FROM notes; --",
  "\" OR \"\"=\"",
  "1; UPDATE notes SET value = 'hacked'",
  "' UNION SELECT topic, key, value, updated_at FROM notes --",
  "\\'; DROP TABLE notes; --",
  "%",
  "_",
  "*",
  "[a-z]",
];

describe("security: SQL injection", () => {
  let context: TestContext;

  beforeEach(async () => {
    context = createTestContext();
    await context.service.addNote("victim", "secret", "original");
    await context.service.addNote("victim/nested", "secret", "original");
  });

  afterEach(() => {
    context.repository.close();
  });

  const assertDatabaseIntact = async (): Promise<void> => {
    assert.deepEqual(await context.service.getNote("victim", "secret"), {
      topic: "victim",
      key: "secret",
      value: "original",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    assert.equal((await context.service.getTopicNotes("victim")).length, 2);
  };

  for (const payload of INJECTION_PAYLOADS) {
    test(`payload is stored and read literally: ${payload}`, async () => {
      await context.service.addNote(payload, payload, payload);

      assert.deepEqual(await context.service.getNote(payload, payload), {
        topic: payload,
        key: payload,
        value: payload,
        updatedAt: "2026-10-01T00:00:00.000Z",
      });
      await assertDatabaseIntact();
    });

    test(`payload in read queries does not leak other notes: ${payload}`, async () => {
      assert.equal(await context.service.getNote("victim", payload), null);
      assert.equal(await context.service.getNote(payload, "secret"), null);
      assert.deepEqual(await context.service.getTopicNotes(payload), []);
      assert.deepEqual(await context.service.getDeletedTopicNotes(payload), []);
      await assertDatabaseIntact();
    });

    test(`payload in delete and restore does not touch other notes: ${payload}`, async () => {
      assert.equal(await context.service.deleteNote("victim", payload), false);
      assert.equal(await context.service.deleteNote(payload, "secret"), false);
      assert.equal(await context.service.restoreNote(payload, payload), null);
      await assertDatabaseIntact();
    });
  }

  test("null character is rejected because SQLite truncates text on it", async () => {
    await assert.rejects(context.service.addNote("t", "a\u0000b", "v"), /null character/);
    await assert.rejects(context.service.addNote("t\u0000x", "k", "v"), /null character/);
    await assert.rejects(context.service.addNote("t", "k", "v\u0000hidden"), /null character/);
    assert.throws(() => context.service.getNote("victim", "secret\u0000"), /null character/);
    await assert.rejects(context.service.deleteNote("victim", "secret\u0000"), /null character/);
    await assertDatabaseIntact();
  });

  test("topic prefix with injection does not match sibling topics", async () => {
    assert.deepEqual(await context.service.getTopicNotes("victim' OR '1'='1"), []);
    assert.deepEqual(await context.service.getTopicNotes("vic"), []);
    assert.deepEqual(await context.service.getTopicNotes("victim/nested/'"), []);
  });

  test("unicode, control characters and long strings are stored as is", async () => {
    const values = ["заметка 📝", "line1\nline2\ttab", "x".repeat(100_000)];

    for (const [index, value] of values.entries()) {
      await context.service.addNote(`unicode/${index}`, value, value);
      assert.equal((await context.service.getNote(`unicode/${index}`, value))?.value, value);
    }
    await assertDatabaseIntact();
  });
});

describe("security: MCP input validation", () => {
  let context: TestContext;
  let client: TestClient;

  beforeEach(async () => {
    context = createTestContext();
    client = await connectClient(context.service);
    await context.service.addNote("victim", "secret", "original");
  });

  afterEach(async () => {
    await client.close();
    context.repository.close();
  });

  const invalidCalls: [string, Record<string, unknown>][] = [
    ["add_note", { topic: "", key: "k", value: "v" }],
    ["add_note", { topic: "t", key: "", value: "v" }],
    ["add_note", { topic: "t", key: "k" }],
    ["add_note", { topic: 1, key: "k", value: "v" }],
    ["add_note", { topic: { $ne: null }, key: "k", value: "v" }],
    ["add_note", { topic: ["victim"], key: "k", value: "v" }],
    ["get_note", { topic: "victim" }],
    ["get_note", { topic: "victim", key: null }],
    ["get_topic_notes", {}],
    ["get_topic_notes", { topic: "/" }],
    ["add_note", { topic: "t", key: "k\u0000", value: "v" }],
    ["delete_note", { topic: "victim", key: 1 }],
    ["restore_note", { topic: true, key: "secret" }],
  ];

  for (const [name, args] of invalidCalls) {
    test(`rejects ${name} ${JSON.stringify(args)}`, async () => {
      const result = await client.callTool(name, args);

      assert.equal(result.isError, true);
      assert.equal((await context.service.getNote("victim", "secret"))?.value, "original");
    });
  }

  test("SQL payload through MCP is stored literally", async () => {
    const payload = "x'); DROP TABLE notes; --";

    await client.callTool("add_note", { topic: payload, key: payload, value: payload });

    assert.deepEqual(await client.callTool("get_note", { topic: payload, key: payload }), {
      isError: false,
      data: { topic: payload, key: payload, value: payload, updatedAt: "2026-10-01T00:00:00.000Z" },
    });
    assert.equal((await context.service.getNote("victim", "secret"))?.value, "original");
  });
});
