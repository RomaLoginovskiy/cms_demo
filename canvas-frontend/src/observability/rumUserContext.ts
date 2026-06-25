import { getOrCreateIdentity } from '../whiteboard/store/identity';
import { RumSessionConfig } from './rumSessionConfig';

export interface RumUserContext {
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_metadata?: Record<string, string | number | boolean>;
}

let invalidPayloadWarningLogged = false;

export function parseRumUserParam(encoded: string | null | undefined): RumUserContext | undefined {
  if (!encoded?.trim()) {
    return undefined;
  }

  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as Partial<RumUserContext>;

    if (typeof parsed.user_id !== 'string' || !parsed.user_id.trim()) {
      warnInvalidPayload('rum_user payload missing user_id');
      return undefined;
    }

    if (parsed.user_id.length > 128) {
      warnInvalidPayload('rum_user user_id exceeds max length');
      return undefined;
    }

    const context: RumUserContext = {
      user_id: parsed.user_id.trim()
    };

    if (typeof parsed.user_name === 'string' && parsed.user_name.trim()) {
      context.user_name = parsed.user_name.trim().slice(0, 128);
    }

    if (typeof parsed.user_email === 'string' && parsed.user_email.trim()) {
      context.user_email = parsed.user_email.trim().slice(0, 256);
    }

    if (parsed.user_metadata && typeof parsed.user_metadata === 'object') {
      context.user_metadata = parsed.user_metadata;
    }

    return context;
  } catch {
    warnInvalidPayload('rum_user payload is not valid base64url JSON');
    return undefined;
  }
}

export function extractUserRole(config: RumSessionConfig): string {
  const role = config.rumUserContext?.user_metadata?.role;
  if (typeof role === 'string' && role.trim()) {
    return role.trim();
  }
  return 'viewer';
}

function isLoadgenSyntheticUser(context: RumUserContext): boolean {
  const loadgen = context.user_metadata?.loadgen;
  return loadgen === '1' || loadgen === 1;
}

export function shouldApplyRumUserContext(config: RumSessionConfig): boolean {
  if (!config.rumUserContext) {
    return false;
  }

  return isLoadgenSyntheticUser(config.rumUserContext);
}

export function applyWhiteboardIdentityToRum(
  setUserContext: (context: RumUserContext) => void,
  storage: Storage = localStorage
): void {
  const identity = getOrCreateIdentity(storage);
  setUserContext({
    user_id: identity.userId,
    user_name: identity.displayName,
    user_metadata: { source: 'whiteboard' }
  });
}

export function applyRumUserContext(
  config: RumSessionConfig,
  setUserContext: (context: RumUserContext) => void
): void {
  if (!shouldApplyRumUserContext(config) || !config.rumUserContext) {
    return;
  }

  const { user_id, user_name, user_email, user_metadata } = config.rumUserContext;
  setUserContext({
    user_id,
    user_name: user_name ?? user_id,
    ...(user_email ? { user_email } : {}),
    ...(user_metadata ? { user_metadata } : {})
  });
}

export function resetRumUserContextWarningsForTests(): void {
  invalidPayloadWarningLogged = false;
}

function warnInvalidPayload(message: string): void {
  if (invalidPayloadWarningLogged) {
    return;
  }

  invalidPayloadWarningLogged = true;
  console.warn(`Coralogix RUM user context skipped: ${message}`);
}
