import type { NoteRef, SkillEvent } from "./MetricEvent.ts";

export interface FoundNote extends NoteRef {
  hits: number;
}

export interface UnusedNote extends NoteRef {
  updatedAt: string;
}

export interface ReviewMiss extends NoteRef {
  createdAt: string;
}

export interface Stats {
  topic: string;
  since: string | null;
  searches: number;
  emptySearches: number;
  emptyQueries: string[];
  addedNotes: number;
  deletedNotes: number;
  skillEvents: Record<SkillEvent, number>;
  cacheHitRate: number | null;
  reuseRate: number | null;
  reviewMisses: ReviewMiss[];
  foundNotes: FoundNote[];
  unusedNotes: UnusedNote[];
}
