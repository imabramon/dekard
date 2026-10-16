import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createTestContext, type TestContext } from "../helpers.ts";

describe("NotesService", () => {
  let context: TestContext;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    context.close();
  });

  test("addNote stores the note with current time", async () => {
    const note = await context.service.addNote("tsc", "abc", "passed");

    assert.deepEqual(note, {
      topic: "tsc",
      key: "abc",
      value: "passed",
      description: "",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    assert.deepEqual(await context.service.getNote("tsc", "abc"), note);
  });

  test("addNote updates updatedAt on overwrite", async () => {
    await context.service.addNote("tsc", "abc", "failed");
    context.clock.advanceDays(1);
    await context.service.addNote("tsc", "abc", "passed");

    assert.deepEqual(await context.service.getNote("tsc", "abc"), {
      topic: "tsc",
      key: "abc",
      value: "passed",
      description: "",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
  });

  test("addNote stores description and overwrite without description clears it", async () => {
    const note = await context.service.addNote("files", "helper", "src/helper.ts", "resx helper");

    assert.equal(note.description, "resx helper");
    assert.equal((await context.service.getNote("files", "helper"))?.description, "resx helper");

    await context.service.addNote("files", "helper", "src/helper.ts");
    assert.equal((await context.service.getNote("files", "helper"))?.description, "");
  });

  test("searchNotes matches key, value and description case-insensitively", async () => {
    await context.service.addNote("files", "getResxString", "src/a.ts");
    await context.service.addNote("files", "formatDate", "src/resx/b.ts");
    await context.service.addNote("files", "useTranslation", "src/c.ts", "Локализация строк");
    await context.service.addNote("files", "other", "src/d.ts", "unrelated");

    assert.deepEqual(
      (await context.service.searchNotes("files", "RESX")).map((note) => note.key),
      ["getResxString", "formatDate"],
    );
    assert.deepEqual(
      (await context.service.searchNotes("files", "локализация")).map((note) => note.key),
      ["useTranslation"],
    );
  });

  test("searchNotes sorts by number of matched words", async () => {
    await context.service.addNote("files", "one", "v", "resx");
    await context.service.addNote("files", "two", "v", "resx localization");
    await context.service.addNote("files", "none", "v", "date");

    assert.deepEqual(
      (await context.service.searchNotes("files", "  resx   localization resx ")).map((note) => note.key),
      ["two", "one"],
    );
  });

  test("searchNotes looks in nested topics and skips deleted notes", async () => {
    await context.service.addNote("pyrus/files/resx", "nested", "v", "resx");
    await context.service.addNote("pyrus/filesX", "sibling", "v", "resx");
    await context.service.addNote("pyrus/files", "deleted", "v", "resx");
    await context.service.deleteNote("pyrus/files", "deleted");

    assert.deepEqual(
      (await context.service.searchNotes("pyrus/files", "resx")).map((note) => note.key),
      ["nested"],
    );
  });

  test("searchNotes rejects empty query", async () => {
    await assert.rejects(context.service.searchNotes("files", "   "), /Invalid query/);
  });

  test("trailing slashes in topic are ignored everywhere", async () => {
    const note = await context.service.addNote("company/branch//", "k", "v");

    assert.equal(note.topic, "company/branch");
    assert.deepEqual(await context.service.getNote("company/branch/", "k"), note);
    assert.deepEqual(await context.service.getTopicNotes("company/branch/"), [note]);
    assert.equal(await context.service.deleteNote("company/branch/", "k"), true);
    assert.equal((await context.service.getDeletedTopicNotes("company/branch/")).length, 1);
    assert.deepEqual(await context.service.restoreNote("company/branch/", "k"), note);
  });

  test("topic consisting only of slashes is rejected", async () => {
    await assert.rejects(context.service.addNote("/", "k", "v"), /Invalid topic/);
    assert.throws(() => context.service.getTopicNotes("//"), /Invalid topic/);
  });

  test("getTopicNotes returns nested topics", async () => {
    await context.service.addNote("company/branch/a", "k", "v");
    await context.service.addNote("company/branch/b", "k", "v");
    await context.service.addNote("company/other", "k", "v");

    assert.deepEqual(
      (await context.service.getTopicNotes("company/branch")).map((note) => note.topic),
      ["company/branch/a", "company/branch/b"],
    );
  });

  test("deleted note is hidden and can be restored", async () => {
    await context.service.addNote("tsc", "abc", "passed");
    context.clock.advanceDays(1);

    assert.equal(await context.service.deleteNote("tsc", "abc"), true);
    assert.equal(await context.service.getNote("tsc", "abc"), null);
    assert.deepEqual(await context.service.getTopicNotes("tsc"), []);
    assert.deepEqual(await context.service.getDeletedTopicNotes("tsc"), [
      {
        topic: "tsc",
        key: "abc",
        value: "passed",
        description: "",
        updatedAt: "2026-10-01T00:00:00.000Z",
        deletedAt: "2026-10-02T00:00:00.000Z",
      },
    ]);

    assert.deepEqual(await context.service.restoreNote("tsc", "abc"), {
      topic: "tsc",
      key: "abc",
      value: "passed",
      description: "",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    assert.deepEqual(await context.service.getDeletedTopicNotes("tsc"), []);
  });

  test("deleteNote and restoreNote of missing notes", async () => {
    assert.equal(await context.service.deleteNote("tsc", "missing"), false);
    assert.equal(await context.service.restoreNote("tsc", "missing"), null);
  });

  test("deleted note can be restored within 30 days", async () => {
    await context.service.addNote("tsc", "abc", "passed");
    await context.service.deleteNote("tsc", "abc");
    context.clock.advanceDays(29);

    assert.equal((await context.service.restoreNote("tsc", "abc"))?.value, "passed");
  });

  test("deleted note is purged after 30 days", async () => {
    await context.service.addNote("tsc", "abc", "passed");
    await context.service.deleteNote("tsc", "abc");
    context.clock.advanceDays(31);

    assert.deepEqual(await context.service.getDeletedTopicNotes("tsc"), []);
    assert.equal(await context.service.restoreNote("tsc", "abc"), null);
    assert.equal(await context.service.getNote("tsc", "abc"), null);
  });

  test("purgeExpiredNotes keeps active notes regardless of age", async () => {
    await context.service.addNote("tsc", "old", "passed");
    context.clock.advanceDays(365);

    assert.equal(await context.service.purgeExpiredNotes(), 0);
    assert.equal((await context.service.getNote("tsc", "old"))?.value, "passed");
  });
});
