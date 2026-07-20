import { MISSION_TEMPLATE_IDS } from './mission-templates.js';

export const DISTRICT_PROGRESS_VERSION = 1;
export const DISTRICT_ID = 'beacon-district';
export const DISTRICT_RESULT_KEY = 'Beacon District';
export const DISTRICT_TARGET = 3;
export const DISTRICT_CONTRIBUTION = 3;
export const DISTRICT_SESSION_KEY = 'creatorverse-district-progress';

const ROLE_IDS = new Set(['builder', 'explorer', 'guardian']);
const ROUTE_IDS = new Set(['sky', 'ocean']);
const TEMPLATE_IDS = new Set(MISSION_TEMPLATE_IDS);
const STATE_FIELDS = new Set([
  'version',
  'scope',
  'districtId',
  'unlocked',
  'contribution',
  'roleId',
  'routeId',
  'templateId',
]);

function validScope(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 80 && /^[a-z0-9:-]+$/u.test(value);
}

function frozenLocked(scope) {
  return Object.freeze({
    version: DISTRICT_PROGRESS_VERSION,
    scope,
    districtId: DISTRICT_ID,
    unlocked: false,
    contribution: 0,
    roleId: '',
    routeId: '',
    templateId: '',
  });
}

export function createDistrictScope(fragment = '', inviteStatus = 'none') {
  if (!['none', 'valid'].includes(inviteStatus)) return '';
  const input = `${inviteStatus}:${String(fragment).slice(0, 512)}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${inviteStatus}:${(hash >>> 0).toString(36)}`;
}

export function createLockedDistrictProgress(scope) {
  if (!validScope(scope)) throw new TypeError('INVALID_DISTRICT_SCOPE');
  return frozenLocked(scope);
}

export function restoreDistrictProgress(value, { scope } = {}) {
  if (!validScope(scope)) throw new TypeError('INVALID_DISTRICT_SCOPE');
  if (!value || typeof value !== 'object' || Array.isArray(value)) return frozenLocked(scope);
  if (Object.keys(value).some(key => !STATE_FIELDS.has(key)) || Object.keys(value).length !== STATE_FIELDS.size) {
    return frozenLocked(scope);
  }
  if (value.version !== DISTRICT_PROGRESS_VERSION || value.scope !== scope || value.districtId !== DISTRICT_ID) {
    return frozenLocked(scope);
  }

  if (value.unlocked === false) {
    if (value.contribution !== 0 || value.roleId !== '' || value.routeId !== '' || value.templateId !== '') {
      return frozenLocked(scope);
    }
    return frozenLocked(scope);
  }

  if (
    value.unlocked !== true
    || value.contribution !== DISTRICT_CONTRIBUTION
    || !ROLE_IDS.has(value.roleId)
    || !ROUTE_IDS.has(value.routeId)
    || !TEMPLATE_IDS.has(value.templateId)
  ) {
    return frozenLocked(scope);
  }

  return Object.freeze({
    version: DISTRICT_PROGRESS_VERSION,
    scope,
    districtId: DISTRICT_ID,
    unlocked: true,
    contribution: DISTRICT_CONTRIBUTION,
    roleId: value.roleId,
    routeId: value.routeId,
    templateId: value.templateId,
  });
}

export function completeDistrictProgress(current, { scope, roleId, routeId, templateId } = {}) {
  const restored = restoreDistrictProgress(current, { scope });
  if (restored.unlocked) return restored;
  if (!ROLE_IDS.has(roleId)) throw new TypeError('INVALID_DISTRICT_ROLE');
  if (!ROUTE_IDS.has(routeId)) throw new TypeError('INVALID_DISTRICT_ROUTE');
  if (!TEMPLATE_IDS.has(templateId)) throw new TypeError('INVALID_DISTRICT_TEMPLATE');

  return Object.freeze({
    version: DISTRICT_PROGRESS_VERSION,
    scope,
    districtId: DISTRICT_ID,
    unlocked: true,
    contribution: DISTRICT_CONTRIBUTION,
    roleId,
    routeId,
    templateId,
  });
}

export function serializeDistrictProgress(value, { scope } = {}) {
  return JSON.stringify(restoreDistrictProgress(value, { scope }));
}

export function districtResultInput(progress) {
  if (!progress?.unlocked || progress.contribution !== DISTRICT_CONTRIBUTION) {
    throw new TypeError('DISTRICT_NOT_UNLOCKED');
  }
  return Object.freeze({
    roleId: progress.roleId,
    routeId: progress.routeId,
    templateId: progress.templateId,
    energyBefore: 0,
    energyAdded: DISTRICT_CONTRIBUTION,
    target: DISTRICT_TARGET,
    district: DISTRICT_RESULT_KEY,
  });
}
