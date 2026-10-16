import type { MetricEvent } from "./MetricEvent.ts";

export interface IEventsRepository {
  add: (event: MetricEvent) => Promise<void>;
  findByTopic: (topic: string, since: string) => Promise<MetricEvent[]>;
  purgeBefore: (date: string) => Promise<number>;
}
