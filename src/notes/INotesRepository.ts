import type { DeletedNote, Note } from "./Note.ts";

export interface INotesRepository {
  upsert: (note: Note) => Promise<void>;
  find: (topic: string, key: string) => Promise<Note | null>;
  findByTopic: (topic: string) => Promise<Note[]>;
  findDeletedByTopic: (topic: string) => Promise<DeletedNote[]>;
  markDeleted: (topic: string, key: string, deletedAt: string) => Promise<boolean>;
  restore: (topic: string, key: string) => Promise<boolean>;
  purgeDeletedBefore: (date: string) => Promise<number>;
}
