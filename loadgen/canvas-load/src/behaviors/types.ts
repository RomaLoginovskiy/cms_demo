import { BrowserContext, Page } from 'playwright';
import { LoadConfig } from '../config/types';
import { ActionRecorder } from '../engine/ActionRecorder';
import { BoardResolver } from '../engine/BoardResolver';

export interface BehaviorContext {
  config: LoadConfig;
  context: BrowserContext;
  page: Page;
  userIndex: number;
  recorder: ActionRecorder;
  boardResolver: BoardResolver;
  rng: () => number;
  signal: AbortSignal;
  baseUrl: string;
  rumQuery?: string;
}

export type BehaviorFn = (ctx: BehaviorContext) => Promise<void>;
