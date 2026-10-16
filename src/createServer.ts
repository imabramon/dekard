import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NotesService } from "./notes/NotesService.ts";

interface CreateServerParams {
  addNote: NotesService["addNote"];
  getNote: NotesService["getNote"];
  getTopicNotes: NotesService["getTopicNotes"];
  deleteNote: NotesService["deleteNote"];
  restoreNote: NotesService["restoreNote"];
  getDeletedTopicNotes: NotesService["getDeletedTopicNotes"];
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
        "Save a note shared between chats. Overwrites the existing note with the same topic and key. Example: topic='tsc', key=<commit hash>, value='passed'.",
      inputSchema: {
        topic: z.string().min(1).describe("Hierarchical note group with '/' separator, e.g. 'tsc' or 'company/branch'"),
        key: z.string().min(1).describe("Note key within topic, e.g. commit hash"),
        value: z.string().describe("Note content"),
      },
    },
    async ({ topic, key, value }) => toResult(await params.addNote(topic, key, value)),
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

  return server;
};
