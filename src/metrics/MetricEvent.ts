export const SKILL_EVENTS = [
  "cache_hit",
  "cache_stale",
  "code_hit",
  "miss",
  "reused",
  "extended",
  "created",
  "from_review",
  "manual",
] as const;

export type SkillEvent = (typeof SKILL_EVENTS)[number];

export type TrackedTool = "search_notes" | "add_note" | "delete_note";

export interface NoteRef {
  topic: string;
  key: string;
}

export interface MetricEvent {
  createdAt: string;
  kind: "tool" | "skill";
  name: string;
  topic: string;
  key: string | null;
  query: string | null;
  results: NoteRef[] | null;
}
