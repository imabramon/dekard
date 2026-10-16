import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/createServer.ts";
import { MetricsService } from "../src/metrics/MetricsService.ts";
import { trackNotes } from "../src/metrics/trackNotes.ts";
import { NotesService } from "../src/notes/NotesService.ts";
import { SqliteEventsRepository } from "../src/infrastructure/SqliteEventsRepository.ts";
import { SqliteNotesRepository } from "../src/infrastructure/SqliteNotesRepository.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export class TestClock {
  private _current: Date;

  public constructor(start: string) {
    this._current = new Date(start);
  }

  public now = (): Date => new Date(this._current);

  public advanceDays = (days: number): void => {
    this._current = new Date(this._current.getTime() + days * DAY_MS);
  };
}

export interface TestContext {
  repository: SqliteNotesRepository;
  eventsRepository: SqliteEventsRepository;
  service: NotesService;
  metrics: MetricsService;
  clock: TestClock;
  close: () => void;
}

export const createTestContext = (dbPath = ":memory:"): TestContext => {
  const repository = new SqliteNotesRepository({ dbPath });
  const eventsRepository = new SqliteEventsRepository({ dbPath });
  const clock = new TestClock("2026-10-01T00:00:00.000Z");
  const service = new NotesService({
    repository,
    deletedNotesRetentionDays: 30,
    now: clock.now,
  });
  const metrics = new MetricsService({
    repository: eventsRepository,
    getTopicNotes: service.getTopicNotes,
    eventsRetentionDays: 90,
    now: clock.now,
  });
  const close = (): void => {
    repository.close();
    eventsRepository.close();
  };
  return { repository, eventsRepository, service, metrics, clock, close };
};

export interface ToolCallResult {
  isError: boolean;
  data: unknown;
}

export interface TestClient {
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  listToolNames: () => Promise<string[]>;
  close: () => Promise<void>;
}

export const connectClient = async ({ service, metrics }: TestContext): Promise<TestClient> => {
  const trackedNotes = trackNotes({
    addNote: service.addNote,
    searchNotes: service.searchNotes,
    deleteNote: service.deleteNote,
    trackToolCall: metrics.trackToolCall,
  });
  const server = createServer({
    addNote: trackedNotes.addNote,
    getNote: service.getNote,
    searchNotes: trackedNotes.searchNotes,
    getTopicNotes: service.getTopicNotes,
    deleteNote: trackedNotes.deleteNote,
    restoreNote: service.restoreNote,
    getDeletedTopicNotes: service.getDeletedTopicNotes,
    trackSkillEvent: metrics.trackSkillEvent,
    getStats: metrics.getStats,
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const callTool = async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
    try {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as { type: string; text: string }[];
      const text = content[0]?.text ?? "";
      if (result.isError) {
        return { isError: true, data: text };
      }
      return { isError: false, data: JSON.parse(text) };
    } catch (error) {
      return { isError: true, data: error instanceof Error ? error.message : String(error) };
    }
  };

  const listToolNames = async (): Promise<string[]> => {
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name).sort();
  };

  const close = async (): Promise<void> => {
    await client.close();
    await server.close();
  };

  return { callTool, listToolNames, close };
};
