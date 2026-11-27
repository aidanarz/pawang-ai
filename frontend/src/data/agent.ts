/** Flood Watch Agent data as the backend sends it (GET /api/v1/warnings and GET /api/v1/admin/agent-log). */

export type WarningLevel = 'waspada' | 'siaga' | 'awas';

/** A warning that is active now (one per kecamatan). */
export interface ActiveWarning {
  grid_id: string;
  level: WarningLevel;
  warning_id: string;
  since: string;
  message: string;
  area: string;
  tier?: string;
}

/** A warning that was published at some point. */
export interface WarningRecord {
  id: string;
  grid_id: string;
  area: string;
  level: WarningLevel;
  message: string;
  target_date: string;
  created_at: string;
  decided_by: 'qwen' | 'rules';
  tier: string;
}

export interface WarningsResponse {
  active: ActiveWarning[];
  warnings: WarningRecord[];
  last_cycle: { cycle_id: string; target_date: string; at: string; triggered: boolean; decided_by: string } | null;
}

export interface AgentChange {
  grid_id: string;
  area: string;
  kinds: string[];
  tier: string;
  prev_tier: string | null;
}

export interface AgentStep {
  step: string;
  tool?: string;
  grid_id?: string;
  action?: string;
  result?: unknown;
  error?: string;
  status?: string;
  message?: string;
  elapsed_ms?: number;
}

/** One cycle of the agent, with everything it saw and decided. */
export interface AgentDecision {
  cycle_id: string;
  target_date: string;
  at: string;
  prompt_version: string;
  triggered: boolean;
  changes: AgentChange[];
  steps: AgentStep[];
  proposal: unknown | null;
  guardrail_errors: string[];
  suppressed: Array<{ grid_id: string; level: string; message: string; reason: string }>;
  published: WarningRecord[];
  decided_by: 'qwen' | 'rules';
  cleared?: string[];
  active?: Record<string, string>;
  note?: string;
}

export interface AgentLogResponse {
  data_mode: 'live' | 'replay';
  agent: {
    scheduler_running: boolean;
    interval_s: number;
    cooldown_h: number;
    max_steps: number;
    llm_enabled: boolean;
    llm_model: string | null;
  };
  totals: {
    cycles: number;
    triggered: number;
    decided_by_qwen: number;
    guardrail_rejected: number;
    warnings_published: number;
    areas_tracked: number;
  };
  active: ActiveWarning[];
  decisions: AgentDecision[];
}
