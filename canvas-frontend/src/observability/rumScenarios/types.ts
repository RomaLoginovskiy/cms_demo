import { BeforeSendStage } from '../rumBeforeSend';
import { RumSessionConfig } from '../rumSessionConfig';

export interface RumScenarioContext {
  config: RumSessionConfig;
  schedule: (fn: () => void, ms: number) => number;
  clearSchedule: (id: number) => void;
}

export interface RumScenarioDefinition {
  id: RumScenarioId;
  title: string;
  useCase: string;
  description: string;
  activate: (ctx: RumScenarioContext) => void | (() => void);
  beforeSend?: BeforeSendStage;
  runOnce?: (ctx: RumScenarioContext) => void;
}

export type RumScenarioId =
  | 's01' | 's02' | 's03' | 's04' | 's05' | 's06' | 's07' | 's08'
  | 's09' | 's10' | 's11' | 's12' | 's13' | 's14';

export const CRITICAL_BOARD_ERROR = 'BoardHydrationFailed: widget manifest mismatch';
export const BACKGROUND_NOISE_ERROR = 'ApiClient: SyntaxError: Unexpected token in JSON at position 0';
export const ENTERPRISE_CRITICAL_ERROR = 'BoardCriticalPathFailure: enterprise widget lock timeout';
export const VERSION_NEW_ERROR = 'ReleaseRegression: ShapeRenderer v2 compatibility check failed';
