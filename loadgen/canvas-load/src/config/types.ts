export type EnginePhase =
  | 'idle'
  | 'ramping_up'
  | 'running'
  | 'degraded'
  | 'paused'
  | 'ramping_down'
  | 'stopped';

export type ProfileName =
  | 'lurker'
  | 'active_drawer'
  | 'collaborator'
  | 'admin'
  | 'media_placer'
  | 'complex_placer'
  | 'text_editor'
  | 'chaos';

export type BoardMode = 'shared' | 'per_user' | 'pool';

export type AbortMode = 'continue' | 'degrade' | 'pause' | 'exit';

export interface SessionPacingConfig {
  enabled: boolean;
  long_fraction: number;
  long_think_multiplier: number;
  normal_profile_max_duration_ms: number;
  long_profile_max_duration_ms: number;
}

export interface LoadConfig {
  run: {
    run_id: string | null;
    seed: number;
    duration: string | null;
    ramp_up: string;
    ramp_down: string;
    scenario: string | null;
    cleanup: boolean;
    paused: boolean;
  };
  target: {
    frontend_base_url: string;
    cms_probe_url: string | null;
  };
  users: {
    /** Total virtual users across all shards (UI). Per-pod count is computed from shard.count. */
    count: number;
    max_contexts_per_pod: number;
    think_time_ms: number;
    /** Long RUM replay slices — configured via admin UI only (defaults off). */
    session_pacing: SessionPacingConfig;
  };
  shard: {
    count: number;
  };
  browser: {
    headless: boolean;
    viewport_width: number;
    viewport_height: number;
    action_timeout_ms: number;
    navigation_timeout_ms: number;
    slow_mo_ms: number;
    fingerprint: {
      enabled: boolean;
    };
  };
  boards: {
    mode: BoardMode;
    shared_board_name: string | null;
    shared_board_id: string | null;
    pool_size: number;
    name_prefix: string;
    precreate_shapes: number;
  };
  profiles: {
    mix: Record<string, number>;
    lurker: {
      mouse_move_interval_ms: number;
      mouse_move_probability: number;
    };
    active_drawer: {
      tools: string[];
      draw_interval_ms: number;
      select_and_move_probability: number;
      delete_probability: number;
      max_shapes_before_delete: number;
    };
    collaborator: {
      mouse_move_interval_ms: number;
      selection_interval_ms: number;
      property_edit_interval_ms: number;
    };
    admin: {
      boards_per_session_min: number;
      boards_per_session_max: number;
      rename_probability: number;
      delete_probability: number;
      time_on_list_ms: number;
    };
    media_placer: {
      search_queries: string[];
      place_interval_ms: number;
      skip_if_cms_unavailable: boolean;
    };
    complex_placer: {
      templates: Array<{ tab: 'path' | 'mesh3d'; name: string }>;
      place_interval_ms: number;
    };
    text_editor: {
      edit_interval_ms: number;
      min_shapes: number;
    };
  };
  chaos: {
    enabled: boolean;
    overlay_weight: number;
    reload_probability: number;
    invalid_route_probability: number;
    spam_tools_probability: number;
    dialog_auto_accept: boolean;
  };
  abort: {
    warmup: string;
    error_rate_threshold: number;
    max_consecutive_action_errors: number;
    on_abort: AbortMode;
  };
  report: {
    rolling_interval_s: number;
    path: string;
  };
  control: {
    listen_port: number;
    metrics_port: number;
  };
  rum_batch?: {
    enabled: boolean;
    preset?: string;
    matrix?: Array<{
      plan: 'free' | 'enterprise' | 'team';
      v: string;
      scenario: string;
      count: number;
      featureArea?: string;
      releaseRing?: string;
      demoGeo?: string;
      demoBrowserFamily?: string;
      integrationContext?: string;
      widgetCountSeed?: number;
    }>;
    append_to_all_navigations?: boolean;
  };
}
