export type CaseId = 'cache' | 'counter' | 'permission';
export type Event = {
  id: string;
  payload: Record<string, unknown>;
  requires: string[];
  pinned: boolean;
  cost: number;
};
export type Trace = { schema_version: number; events: Event[] };
export type Outcome = {
  verdict: 'pass' | 'fail' | 'unresolved';
  signature: string;
  reason: string;
};
export type Trial = {
  number: number;
  phase: string;
  kept: string[];
  outcome: Outcome;
  samples: Outcome[];
  cached: boolean;
};
export type Report = {
  schema_version: number;
  algorithm: string;
  oracle_id: string;
  input_digest: string;
  original: Trace;
  reduced: Trace;
  status: string;
  one_minimal: boolean;
  confirmed: boolean;
  signature: string;
  oracle_calls: number;
  cache_hits: number;
  config: { max_calls: number; repeats: number };
  trials: Trial[];
  witnesses: {
    event: string;
    removed: string[];
    verdict: string;
    trial: number | null;
  }[];
  fixed_outcome: Outcome;
  reduced_json: string;
  original_json: string;
  rawReport?: string;
};
