import type { INotesRepository } from "./INotesRepository.ts";
import type { DeletedNote, Note } from "./Note.ts";

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

  public addNote = async (topic: string, key: string, value: string): Promise<Note> => {
    const note: Note = {
      topic: this._normalizeTopic(topic),
      key: this._validateText("key", key),
      value: this._validateText("value", value),
      updatedAt: this._now().toISOString(),
    };
    await this._repository.upsert(note);
    return note;
  };

  public getNote = (topic: string, key: string): Promise<Note | null> =>
    this._repository.find(this._normalizeTopic(topic), this._validateText("key", key));

  public getTopicNotes = (topic: string): Promise<Note[]> =>
    this._repository.findByTopic(this._normalizeTopic(topic));

  public deleteNote = async (topic: string, key: string): Promise<boolean> => {
    await this.purgeExpiredNotes();
    return this._repository.markDeleted(
      this._normalizeTopic(topic),
      this._validateText("key", key),
      this._now().toISOString(),
    );
  };

  public restoreNote = async (topic: string, key: string): Promise<Note | null> => {
    await this.purgeExpiredNotes();
    const normalizedTopic = this._normalizeTopic(topic);
    const validKey = this._validateText("key", key);
    const isRestored = await this._repository.restore(normalizedTopic, validKey);
    return isRestored ? this._repository.find(normalizedTopic, validKey) : null;
  };

  public getDeletedTopicNotes = async (topic: string): Promise<DeletedNote[]> => {
    await this.purgeExpiredNotes();
    return this._repository.findDeletedByTopic(this._normalizeTopic(topic));
  };

  public purgeExpiredNotes = (): Promise<number> => {
    const expirationDate = new Date(this._now().getTime() - this._deletedNotesRetentionDays * DAY_MS);
    return this._repository.purgeDeletedBefore(expirationDate.toISOString());
  };

  private _normalizeTopic = (topic: string): string => {
    const normalizedTopic = this._validateText("topic", topic).replace(/\/+$/, "");
    if (normalizedTopic === "") {
      throw new Error(`Invalid topic: "${topic}"`);
    }
    return normalizedTopic;
  };

  private _validateText = (name: string, text: string): string => {
    if (text.includes("\u0000")) {
      throw new Error(`Invalid ${name}: null character is not allowed`);
    }
    return text;
  };
}
