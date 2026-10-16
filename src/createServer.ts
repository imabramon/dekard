import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SKILL_EVENTS } from "./metrics/MetricEvent.ts";
import type { MetricsService } from "./metrics/MetricsService.ts";
import type { NotesService } from "./notes/NotesService.ts";

interface CreateServerParams {
  addNote: NotesService["addNote"];
  getNote: NotesService["getNote"];
  searchNotes: NotesService["searchNotes"];
  getTopicNotes: NotesService["getTopicNotes"];
  deleteNote: NotesService["deleteNote"];
  restoreNote: NotesService["restoreNote"];
  getDeletedTopicNotes: NotesService["getDeletedTopicNotes"];
  trackSkillEvent: MetricsService["trackSkillEvent"];
  getStats: MetricsService["getStats"];
}

const toResult = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export const createServer = (params: CreateServerParams): McpServer => {
  const server = new McpServer({ name: "dekard", version: "1.0.0" });

  server.registerTool(
    "add_note",
    {
      title: "Add note",
      description:
        "Save a note shared between chats. Overwrites the existing note with the same topic and key. Example: topic='tsc', key=<commit hash>, value='passed'. Add a description with purpose and synonyms when the note should be found by search_notes.",
      inputSchema: {
        topic: z.string().min(1).describe("Hierarchical note group with '/' separator, e.g. 'tsc' or 'company/branch'"),
        key: z.string().min(1).describe("Note key within topic, e.g. commit hash"),
        value: z.string().describe("Note content"),
        description: z
          .string()
          .optional()
          .describe("Free text used by search_notes: what it is, what it is for, synonyms and keywords"),
      },
    },
    async ({ topic, key, value, description }) => toResult(await params.addNote(topic, key, value, description)),
  );

  server.registerTool(
    "get_note",
    {
      title: "Get note",
      description: "Get a note by topic and key. Returns null if the note does not exist.",
      inputSchema: {
        topic: z.string().min(1),
        key: z.string().min(1),
      },
    },
    async ({ topic, key }) => toResult(await params.getNote(topic, key)),
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description:
        "Search notes of the topic and all its nested topics by words in key, value and description. Case-insensitive substring match; notes matching more words come first. Example: topic='pyrus/files', query='resx localization'.",
      inputSchema: {
        topic: z.string().min(1),
        query: z.string().min(1).describe("Space-separated words, any of them may match"),
      },
    },
    async ({ topic, query }) => toResult(await params.searchNotes(topic, query)),
  );

  server.registerTool(
    "get_topic_notes",
    {
      title: "Get topic notes",
      description:
        "Get all notes of the topic and all its nested topics. Topics are hierarchical with '/' separator: 'company/branch' includes 'company/branch' and 'company/branch/a', but not 'company/branchX'.",
      inputSchema: {
        topic: z.string().min(1),
      },
    },
    async ({ topic }) => toResult(await params.getTopicNotes(topic)),
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description:
        "Soft-delete a note: it disappears from get_note and get_topic_notes but can be restored with restore_note within 30 days. Returns true if the note was deleted.",
      inputSchema: {
        topic: z.string().min(1),
        key: z.string().min(1),
      },
    },
    async ({ topic, key }) => toResult(await params.deleteNote(topic, key)),
  );

  server.registerTool(
    "restore_note",
    {
      title: "Restore note",
      description: "Restore a deleted note. Returns the restored note or null if there is nothing to restore.",
      inputSchema: {
        topic: z.string().min(1),
        key: z.string().min(1),
      },
    },
    async ({ topic, key }) => toResult(await params.restoreNote(topic, key)),
  );

  server.registerTool(
    "get_deleted_topic_notes",
    {
      title: "Get deleted topic notes",
      description:
        "Get deleted notes of the topic and all its nested topics that can still be restored. Topics are hierarchical with '/' separator.",
      inputSchema: {
        topic: z.string().min(1),
      },
    },
    async ({ topic }) => toResult(await params.getDeletedTopicNotes(topic)),
  );

  server.registerTool(
    "track_event",
    {
      title: "Track event",
      description:
        "Record the outcome of a skill step for usage analytics. find: cache_hit (found in notes), cache_stale (note was outdated and deleted), code_hit (found only in code and saved), miss (found nowhere). add: reused, extended, created. remember: from_review (reviewer pointed to existing code that was missed), manual.",
      inputSchema: {
        topic: z.string().min(1).describe("Catalog topic, e.g. '<project>/files'"),
        event: z.enum(SKILL_EVENTS),
        key: z.string().min(1).optional().describe("Key of the related note, if any"),
      },
    },
    async ({ topic, event, key }) => toResult(await params.trackSkillEvent(topic, event, key)),
  );

  server.registerTool(
    "get_stats",
    {
      title: "Get stats",
      description:
        "Usage analytics for the topic and its nested topics: searches and empty queries, skill outcomes, cache hit rate, reuse rate, misses caught on review, most found and never found notes.",
      inputSchema: {
        topic: z.string().min(1),
        since: z.string().min(1).optional().describe("ISO date to count events from, e.g. '2026-10-01'"),
      },
    },
    async ({ topic, since }) => toResult(await params.getStats(topic, since)),
  );

  return server;
};
