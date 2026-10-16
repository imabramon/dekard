import type { Note } from "../notes/Note.ts";
import type { MetricsService } from "./MetricsService.ts";

interface TrackNotesParams {
  addNote: (topic: string, key: string, value: string, description?: string) => Promise<Note>;
  searchNotes: (topic: string, query: string) => Promise<Note[]>;
  deleteNote: (topic: string, key: string) => Promise<boolean>;
  trackToolCall: MetricsService["trackToolCall"];
}

export const trackNotes = (params: TrackNotesParams) => ({
  addNote: async (topic: string, key: string, value: string, description?: string): Promise<Note> => {
    const note = await params.addNote(topic, key, value, description);
    await params.trackToolCall({ name: "add_note", topic: note.topic, key: note.key });
    return note;
  },
  searchNotes: async (topic: string, query: string): Promise<Note[]> => {
    const notes = await params.searchNotes(topic, query);
    await params.trackToolCall({
      name: "search_notes",
      topic,
      query,
      results: notes.map((note) => ({ topic: note.topic, key: note.key })),
    });
    return notes;
  },
  deleteNote: async (topic: string, key: string): Promise<boolean> => {
    const isDeleted = await params.deleteNote(topic, key);
    if (isDeleted) {
      await params.trackToolCall({ name: "delete_note", topic, key });
    }
    return isDeleted;
  },
});
