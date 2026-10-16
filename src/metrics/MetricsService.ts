import type { Note } from "../notes/Note.ts";
import { normalizeTopic, validateText } from "../validation.ts";
import type { IEventsRepository } from "./IEventsRepository.ts";
import { SKILL_EVENTS, type MetricEvent, type NoteRef, type SkillEvent, type TrackedTool } from "./MetricEvent.ts";
import type { FoundNote, Stats } from "./Stats.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

interface MetricsServiceParams {
  repository: IEventsRepository;
  getTopicNotes: (topic: string) => Promise<Note[]>;
  eventsRetentionDays: number;
  now: () => Date;
}

export interface ToolCall {
  name: TrackedTool;
  topic: string;
  key?: string;
  query?: string;
  results?: NoteRef[];
}

export class MetricsService {
  private readonly _repository: IEventsRepository;
  private readonly _getTopicNotes: (topic: string) => Promise<Note[]>;
  private readonly _eventsRetentionDays: number;
  private readonly _now: () => Date;

  public constructor(params: MetricsServiceParams) {
    this._repository = params.repository;
    this._getTopicNotes = params.getTopicNotes;
    this._eventsRetentionDays = params.eventsRetentionDays;
    this._now = params.now;
  }

  public trackToolCall = (call: ToolCall): Promise<MetricEvent> =>
    this._addEvent({
      createdAt: this._now().toISOString(),
      kind: "tool",
      name: call.name,
      topic: normalizeTopic(call.topic),
      key: call.key ?? null,
      query: call.query ?? null,
      results: call.results ?? null,
    });

  public trackSkillEvent = async (topic: string, event: SkillEvent, key?: string): Promise<MetricEvent> => {
    if (!SKILL_EVENTS.includes(event)) {
      throw new Error(`Invalid event: "${event}"`);
    }
    return this._addEvent({
      createdAt: this._now().toISOString(),
      kind: "skill",
      name: event,
      topic: normalizeTopic(topic),
      key: key === undefined ? null : validateText("key", key),
      query: null,
      results: null,
    });
  };

  public getStats = async (topic: string, since?: string): Promise<Stats> => {
    const normalizedTopic = normalizeTopic(topic);
    const sinceDate = since === undefined ? null : this._parseDate(since);
    const events = await this._repository.findByTopic(normalizedTopic, sinceDate ?? "");
    const toolEvents = events.filter((event) => event.kind === "tool");
    const searches = toolEvents.filter((event) => event.name === "search_notes");
    const emptySearches = searches.filter((event) => (event.results ?? []).length === 0);
    const skillEvents = this._countSkillEvents(events);
    const foundNotes = this._getFoundNotes(searches);
    const foundIds = new Set(foundNotes.map(this._getNoteId));
    const notes = await this._getTopicNotes(normalizedTopic);

    return {
      topic: normalizedTopic,
      since: sinceDate,
      searches: searches.length,
      emptySearches: emptySearches.length,
      emptyQueries: [...new Set(emptySearches.map((event) => event.query ?? ""))],
      addedNotes: toolEvents.filter((event) => event.name === "add_note").length,
      deletedNotes: toolEvents.filter((event) => event.name === "delete_note").length,
      skillEvents,
      cacheHitRate: this._getRate(skillEvents.cache_hit, skillEvents.code_hit + skillEvents.miss),
      reuseRate: this._getRate(skillEvents.reused + skillEvents.extended, skillEvents.created),
      reviewMisses: events
        .filter((event) => event.kind === "skill" && event.name === "from_review")
        .map((event) => ({ topic: event.topic, key: event.key ?? "", createdAt: event.createdAt })),
      foundNotes,
      unusedNotes: notes
        .filter((note) => !foundIds.has(this._getNoteId(note)))
        .map((note) => ({ topic: note.topic, key: note.key, updatedAt: note.updatedAt })),
    };
  };

  public purgeExpiredEvents = (): Promise<number> => {
    const expirationDate = new Date(this._now().getTime() - this._eventsRetentionDays * DAY_MS);
    return this._repository.purgeBefore(expirationDate.toISOString());
  };

  private _addEvent = async (event: MetricEvent): Promise<MetricEvent> => {
    await this._repository.add(event);
    return event;
  };

  private _parseDate = (date: string): string => {
    const time = Date.parse(date);
    if (Number.isNaN(time)) {
      throw new Error(`Invalid date: "${date}"`);
    }
    return new Date(time).toISOString();
  };

  private _countSkillEvents = (events: MetricEvent[]): Record<SkillEvent, number> => {
    const counts = Object.fromEntries(SKILL_EVENTS.map((event) => [event, 0])) as Record<SkillEvent, number>;
    for (const event of events) {
      if (event.kind === "skill" && event.name in counts) {
        counts[event.name as SkillEvent] += 1;
      }
    }
    return counts;
  };

  private _getFoundNotes = (searches: MetricEvent[]): FoundNote[] => {
    const found = new Map<string, FoundNote>();
    for (const ref of searches.flatMap((event) => event.results ?? [])) {
      const id = this._getNoteId(ref);
      const note = found.get(id) ?? { topic: ref.topic, key: ref.key, hits: 0 };
      note.hits += 1;
      found.set(id, note);
    }
    return [...found.values()].sort((a, b) => b.hits - a.hits);
  };

  private _getRate = (success: number, failure: number): number | null =>
    success + failure === 0 ? null : success / (success + failure);

  private _getNoteId = (ref: NoteRef): string => JSON.stringify([ref.topic, ref.key]);
}
