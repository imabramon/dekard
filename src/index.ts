import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./createServer.ts";
import { getAppDataDir } from "./getAppDataDir.ts";
import { MetricsService } from "./metrics/MetricsService.ts";
import { trackNotes } from "./metrics/trackNotes.ts";
import { NotesService } from "./notes/NotesService.ts";
import { SqliteEventsRepository } from "./infrastructure/SqliteEventsRepository.ts";
import { SqliteNotesRepository } from "./infrastructure/SqliteNotesRepository.ts";

const dbPath = process.env.DEKARD_DB ?? join(getAppDataDir("dekard"), "notes.db");
const repository = new SqliteNotesRepository({ dbPath });
const eventsRepository = new SqliteEventsRepository({ dbPath });

const notesService = new NotesService({
  repository,
  deletedNotesRetentionDays: 30,
  now: () => new Date(),
});

const metricsService = new MetricsService({
  repository: eventsRepository,
  getTopicNotes: notesService.getTopicNotes,
  eventsRetentionDays: 90,
  now: () => new Date(),
});

await notesService.purgeExpiredNotes();
await metricsService.purgeExpiredEvents();

const trackedNotes = trackNotes({
  addNote: notesService.addNote,
  searchNotes: notesService.searchNotes,
  deleteNote: notesService.deleteNote,
  trackToolCall: metricsService.trackToolCall,
});

const server = createServer({
  addNote: trackedNotes.addNote,
  getNote: notesService.getNote,
  searchNotes: trackedNotes.searchNotes,
  getTopicNotes: notesService.getTopicNotes,
  deleteNote: trackedNotes.deleteNote,
  restoreNote: notesService.restoreNote,
  getDeletedTopicNotes: notesService.getDeletedTopicNotes,
  trackSkillEvent: metricsService.trackSkillEvent,
  getStats: metricsService.getStats,
});

process.on("exit", () => {
  repository.close();
  eventsRepository.close();
});

await server.connect(new StdioServerTransport());
