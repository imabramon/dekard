import type { INotesRepository } from "./INotesRepository.ts";
import type { DeletedNote, Note } from "./Note.ts";
import { normalizeTopic, validateText } from "../validation.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

interface NotesServiceParams {
  repository: INotesRepository;
  deletedNotesRetentionDays: number;
  now: () => Date;
}

export class NotesService {
  private readonly _repository: INotesRepository;
  private readonly _deletedNotesRetentionDays: number;
  private readonly _now: () => Date;

  public constructor(params: NotesServiceParams) {
    this._repository = params.repository;
    this._deletedNotesRetentionDays = params.deletedNotesRetentionDays;
    this._now = params.now;
  }

  public addNote = async (topic: string, key: string, value: string, description = ""): Promise<Note> => {
    const note: Note = {
      topic: normalizeTopic(topic),
      key: validateText("key", key),
      value: validateText("value", value),
      description: validateText("description", description),
      updatedAt: this._now().toISOString(),
    };
    await this._repository.upsert(note);
    return note;
  };

  public getNote = (topic: string, key: string): Promise<Note | null> =>
    this._repository.find(normalizeTopic(topic), validateText("key", key));

  public getTopicNotes = (topic: string): Promise<Note[]> =>
    this._repository.findByTopic(normalizeTopic(topic));

  public searchNotes = async (topic: string, query: string): Promise<Note[]> => {
    const words = this._getSearchWords(query);
    const notes = await this._repository.findByTopic(normalizeTopic(topic));
    return notes
      .map((note) => ({ note, score: this._getSearchScore(note, words) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ note }) => note);
  };

  public deleteNote = async (topic: string, key: string): Promise<boolean> => {
    await this.purgeExpiredNotes();
    return this._repository.markDeleted(
      normalizeTopic(topic),
      validateText("key", key),
      this._now().toISOString(),
    );
  };

  public restoreNote = async (topic: string, key: string): Promise<Note | null> => {
    await this.purgeExpiredNotes();
    const normalizedTopic = normalizeTopic(topic);
    const validKey = validateText("key", key);
    const isRestored = await this._repository.restore(normalizedTopic, validKey);
    return isRestored ? this._repository.find(normalizedTopic, validKey) : null;
  };

  public getDeletedTopicNotes = async (topic: string): Promise<DeletedNote[]> => {
    await this.purgeExpiredNotes();
    return this._repository.findDeletedByTopic(normalizeTopic(topic));
  };

  public purgeExpiredNotes = (): Promise<number> => {
    const expirationDate = new Date(this._now().getTime() - this._deletedNotesRetentionDays * DAY_MS);
    return this._repository.purgeDeletedBefore(expirationDate.toISOString());
  };

  private _getSearchWords = (query: string): string[] => {
    const words = validateText("query", query).toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      throw new Error(`Invalid query: "${query}"`);
    }
    return [...new Set(words)];
  };

  private _getSearchScore = (note: Note, words: string[]): number => {
    const text = `${note.key} ${note.value} ${note.description}`.toLowerCase();
    return words.filter((word) => text.includes(word)).length;
  };
}
