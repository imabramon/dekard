import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./createServer.ts";
import { getAppDataDir } from "./getAppDataDir.ts";
import { NotesService } from "./notes/NotesService.ts";
import { SqliteNotesRepository } from "./infrastructure/SqliteNotesRepository.ts";

const repository = new SqliteNotesRepository({
  dbPath: process.env.DEKARD_DB ?? join(getAppDataDir("dekard"), "notes.db"),
});

const notesService = new NotesService({
  repository,
  deletedNotesRetentionDays: 30,
  now: () => new Date(),
});

await notesService.purgeExpiredNotes();

const server = createServer({
  addNote: notesService.addNote,
  getNote: notesService.getNote,
  getTopicNotes: notesService.getTopicNotes,
  deleteNote: notesService.deleteNote,
  restoreNote: notesService.restoreNote,
  getDeletedTopicNotes: notesService.getDeletedTopicNotes,
});

process.on("exit", repository.close);

await server.connect(new StdioServerTransport());
