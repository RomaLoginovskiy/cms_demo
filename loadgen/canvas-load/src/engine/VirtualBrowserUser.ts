import { Browser, BrowserContext, Page } from 'playwright';
import { runProfile, pickProfile } from '../behaviors';
import { LoadConfig, ProfileName } from '../config/types';
import { createRng } from '../util/random';
import { ActionRecorder, GlobalMetricsCollector } from './ActionRecorder';
import { BoardResolver } from './BoardResolver';
import { pageErrors, recordActionMetrics, rumSessionsTotal } from '../metrics/prometheus';
import {
  fingerprintToContextOptions,
  resolveBrowserFingerprintForUser
} from '../rum/browserFingerprint';
import { buildRumQuery, buildUserQuery, resolveIntegrationContext, RumSessionAssignment } from '../rum/buildRumQuery';
import { resolveRumSessionForUser } from '../rum/rumSessionPlan';
import { buildRumSyntheticUser } from '../rum/rumSyntheticUser';
import {
  applyThinkMultiplier,
  resolveSessionPacing,
  SessionPacingAssignment
} from './sessionPacing';

export class VirtualBrowserUser {
  private context: BrowserContext | null = null;
  private readonly abortController = new AbortController();
  private loopPromise: Promise<void> | null = null;
  readonly recorder: ActionRecorder;
  private rumQuery = '';
  private pacing: SessionPacingAssignment | null = null;

  constructor(
    private readonly browser: Browser,
    private config: LoadConfig,
    private readonly boardResolver: BoardResolver,
    readonly userIndex: number
  ) {
    this.recorder = new ActionRecorder(record => {
      recordActionMetrics(record);
    });
    GlobalMetricsCollector.getInstance().register(this.recorder);
  }

  getRumQuery(): string {
    return this.rumQuery;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  async start(): Promise<void> {
    const rng = createRng(this.config.run.seed + this.userIndex);
    this.pacing = resolveSessionPacing(this.config, this.userIndex);

    const rumAssignment = resolveRumSessionForUser(this.config, this.userIndex, rng);
    const rumUser = buildRumSyntheticUser(this.userIndex, this.config.run.seed, rng, {
      plan: rumAssignment?.plan,
      scenario: rumAssignment?.scenario
    });
    this.rumQuery = buildInitialRumQuery(this.config, 'lurker', rumAssignment, rumUser);

    const contextOptions: Parameters<Browser['newContext']>[0] =
      buildContextOptions(this.config, rumAssignment, this.userIndex, rng);

    this.context = await this.browser.newContext(contextOptions);

    if (rumAssignment) {
      rumSessionsTotal.inc({
        scenario: rumAssignment.scenario,
        plan: rumAssignment.plan,
        version: rumAssignment.version
      });
    }
    let pageClosedOrCrashed = false;

    const wirePage = (pageToWire: Page): void => {
      pageToWire.setDefaultTimeout(this.config.browser.action_timeout_ms);
      pageToWire.setDefaultNavigationTimeout(this.config.browser.navigation_timeout_ms);

      pageToWire.on('pageerror', () => {
        GlobalMetricsCollector.getInstance().pageErrors++;
        pageErrors.inc();
      });

      pageToWire.on('close', () => {
        pageClosedOrCrashed = true;
      });
      pageToWire.on('crash', () => {
        pageClosedOrCrashed = true;
      });
    };

    let page = await this.context.newPage();
    wirePage(page);

    this.loopPromise = (async () => {
      const profileRng = createRng(this.config.run.seed + this.userIndex + 333);

      while (!this.abortController.signal.aborted) {
        const baseUrl = this.config.target.frontend_base_url;
        const profile = pickProfile(this.config, profileRng);
        this.rumQuery = buildInitialRumQuery(this.config, profile, rumAssignment, rumUser);
        const pacing = this.pacing;
        const profileConfig = applyThinkMultiplier(this.config, pacing);
        const profileAbort = new AbortController();
        let profileTimer: ReturnType<typeof setTimeout> | null = null;

        if (pacing) {
          profileTimer = setTimeout(() => profileAbort.abort(), pacing.profileMaxDurationMs);
        }

        const profileSignal = AbortSignal.any([
          this.abortController.signal,
          profileAbort.signal
        ]);

        try {
          if (pageClosedOrCrashed || page.isClosed()) {
            pageClosedOrCrashed = false;
            page = await this.context!.newPage();
            wirePage(page);
          }
          await runProfile(profile, {
            config: profileConfig,
            context: this.context!,
            page,
            userIndex: this.userIndex,
            recorder: this.recorder,
            boardResolver: this.boardResolver,
            rng: profileRng,
            signal: profileSignal,
            baseUrl,
            rumQuery: this.rumQuery
          });
        } catch (err) {
          if (this.abortController.signal.aborted) break;
          await new Promise(r => setTimeout(r, 500));
        } finally {
          if (profileTimer) clearTimeout(profileTimer);
        }
      }
    })();
  }

  async stop(): Promise<void> {
    this.abortController.abort();
    if (this.loopPromise) {
      await this.loopPromise.catch(() => undefined);
    }
    await this.context?.close();
    this.context = null;
  }

  updateConfig(config: LoadConfig): void {
    this.config = config;
    this.pacing = resolveSessionPacing(this.config, this.userIndex);
  }
}

function buildInitialRumQuery(
  config: LoadConfig,
  profile: ProfileName,
  rumAssignment: RumSessionAssignment | null,
  rumUser: ReturnType<typeof buildRumSyntheticUser>
): string {
  const batchId = config.run.run_id ?? undefined;
  const integrationContext = resolveIntegrationContext(
    profile,
    rumAssignment?.integrationContext
  );

  if (rumAssignment) {
    return buildRumQuery({
      ...rumAssignment,
      rumUser,
      integrationContext,
      batchId
    });
  }

  return buildUserQuery(rumUser, { integrationContext, batchId });
}

function buildContextOptions(
  config: LoadConfig,
  rumAssignment: RumSessionAssignment | null,
  userIndex: number,
  rng: () => number
): Parameters<Browser['newContext']>[0] {
  if (rumAssignment?.userAgent && rumAssignment.geolocation && rumAssignment.locale) {
    const fingerprint = {
      demoGeo: rumAssignment.demoGeo ?? 'eu-west',
      demoBrowserFamily: rumAssignment.demoBrowserFamily ?? 'chrome',
      userAgent: rumAssignment.userAgent,
      geolocation: rumAssignment.geolocation,
      locale: rumAssignment.locale,
      timezoneId: rumAssignment.timezoneId ?? 'UTC',
      viewport: rumAssignment.viewport ?? {
        width: config.browser.viewport_width,
        height: config.browser.viewport_height
      }
    };
    return fingerprintToContextOptions(fingerprint);
  }

  const fingerprint = resolveBrowserFingerprintForUser(config, userIndex, rng);
  if (fingerprint) {
    return fingerprintToContextOptions(fingerprint);
  }

  return {
    viewport: {
      width: config.browser.viewport_width,
      height: config.browser.viewport_height
    }
  };
}
