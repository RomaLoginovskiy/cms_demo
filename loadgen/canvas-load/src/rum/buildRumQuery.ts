import { ProfileName } from '../config/types';
import { encodeRumUserParam, RumSyntheticUser } from './rumSyntheticUser';

export interface RumSessionAssignment {
  plan: 'free' | 'enterprise' | 'team';
  version: string;
  scenario: string;
  featureArea?: string;
  releaseRing?: string;
  demoGeo?: string;
  demoBrowserFamily?: string;
  integrationContext?: string;
  widgetCountSeed?: number;
  batchId?: string;
  userAgent?: string;
  geolocation?: { latitude: number; longitude: number };
  locale?: string;
  timezoneId?: string;
  viewport?: { width: number; height: number };
  rumUser?: RumSyntheticUser;
}

const PROFILE_INTEGRATION_CONTEXT: Record<ProfileName, string> = {
  lurker: 'whiteboard_only',
  active_drawer: 'whiteboard_only',
  text_editor: 'whiteboard_only',
  collaborator: 'whiteboard_only',
  complex_placer: 'whiteboard_only',
  media_placer: 'cms_media',
  admin: 'admin_api',
  chaos: 'whiteboard_only'
};

export function resolveIntegrationContext(
  profile: ProfileName,
  matrixOverride?: string
): string {
  return matrixOverride?.trim() || PROFILE_INTEGRATION_CONTEXT[profile] || 'whiteboard_only';
}

export function buildUserQuery(
  rumUser: RumSyntheticUser,
  extras: { integrationContext?: string; batchId?: string } = {}
): string {
  const params = new URLSearchParams();
  params.set('rum_user', encodeRumUserParam(rumUser));
  if (extras.integrationContext) {
    params.set('integration_context', extras.integrationContext);
  }
  if (extras.batchId) {
    params.set('batchId', extras.batchId);
  }
  return params.toString();
}

export function buildRumQuery(assignment: RumSessionAssignment): string {
  const params = new URLSearchParams();
  params.set('rumDemo', '1');
  params.set('plan', assignment.plan);
  params.set('v', assignment.version);
  params.set('scenario', assignment.scenario);
  if (assignment.featureArea) {
    params.set('feature_area', assignment.featureArea);
  }
  if (assignment.releaseRing) {
    params.set('ring', assignment.releaseRing);
  }
  if (assignment.demoGeo) {
    params.set('geo', assignment.demoGeo);
  }
  if (assignment.demoBrowserFamily) {
    params.set('browser', assignment.demoBrowserFamily);
  }
  if (assignment.integrationContext) {
    params.set('integration_context', assignment.integrationContext);
  }
  if (assignment.widgetCountSeed !== undefined) {
    params.set('widgetCount', String(assignment.widgetCountSeed));
  }
  if (assignment.batchId) {
    params.set('batchId', assignment.batchId);
  }
  if (assignment.rumUser) {
    params.set('rum_user', encodeRumUserParam(assignment.rumUser));
  }
  return params.toString();
}

export function appendRumQuery(url: string, query: string): string {
  if (!query) {
    return url;
  }
  return url.includes('?') ? `${url}&${query}` : `${url}?${query}`;
}
