import { completionReceiptLimits } from './completion-receipt.js';
import { DISTRICT_CONTRIBUTION, DISTRICT_ID } from './district-progress.js';
import {
  buildClipboardText,
  createMissionResultActionController,
  getPublicHttpUrl,
} from './mission-result.js';
import {
  getCreatorRealmUpdateCopy,
  normalizeCreatorRealmUpdateLocale,
} from './creator-realm-update-i18n.js';

const THEMES = new Set(['cosmic', 'wild', 'future']);
const MISSIONS = new Set(['route-choice', 'relay-sequence', 'signal-match']);
const ROLES = new Set(['builder', 'explorer', 'guardian']);
const ROUTES = new Set(['sky', 'ocean']);
const REALM_FIELDS = new Set(['id', 'name', 'theme', 'total', 'districtId', 'unlocked', 'receipts']);
const ENTRY_FIELDS = new Set(['id', 'missionId', 'roleId', 'routeId', 'districtId', 'contribution']);
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const LRI = '\u2066';
const PDI = '\u2069';

function exactObject(value, fields) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every(key => fields.has(key));
}

function validIdentifier(value) {
  return typeof value === 'string'
    && !CONTROL_OR_BIDI.test(value)
    && completionReceiptLimits.identifierPattern.test(value);
}

function validName(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 28
    && !CONTROL_OR_BIDI.test(value)
    && !/[<>]/u.test(value);
}

function validEntry(entry) {
  return exactObject(entry, ENTRY_FIELDS)
    && validIdentifier(entry.id)
    && MISSIONS.has(entry.missionId)
    && ROLES.has(entry.roleId)
    && ROUTES.has(entry.routeId)
    && entry.districtId === DISTRICT_ID
    && entry.contribution === DISTRICT_CONTRIBUTION;
}

export function deriveCreatorRealmUpdate(realm) {
  if (!exactObject(realm, REALM_FIELDS)) return Object.freeze({ status: 'unavailable' });
  if (!validIdentifier(realm.id) || !validName(realm.name) || !THEMES.has(realm.theme)) {
    return Object.freeze({ status: 'unavailable' });
  }
  if (realm.districtId !== DISTRICT_ID || realm.unlocked !== true || !Array.isArray(realm.receipts)) {
    return Object.freeze({ status: 'unavailable' });
  }
  const count = realm.receipts.length;
  if (count < 1 || count > 24 || !realm.receipts.every(validEntry)) {
    return Object.freeze({ status: 'unavailable' });
  }
  if (new Set(realm.receipts.map(entry => entry.id)).size !== count) {
    return Object.freeze({ status: 'unavailable' });
  }
  const total = count * DISTRICT_CONTRIBUTION;
  if (!Number.isInteger(realm.total) || realm.total !== total) {
    return Object.freeze({ status: 'unavailable' });
  }

  return Object.freeze({
    status: 'ready',
    archetypeId: realm.theme,
    districtId: realm.districtId,
    contributionCount: count,
    totalEnergy: total,
    latestContribution: DISTRICT_CONTRIBUTION,
  });
}

function isolate(value) {
  return `${LRI}${value}${PDI}`;
}

function format(template, values) {
  return template.replace(/\{([a-z]+)\}/gu, (_, key) => String(values[key] ?? ''));
}

export function buildCreatorRealmUpdatePayload(update, { locale = 'en', publicUrl } = {}) {
  if (!update || update.status !== 'ready') throw new TypeError('REALM_UPDATE_UNAVAILABLE');
  const normalizedLocale = normalizeCreatorRealmUpdateLocale(locale);
  const copy = getCreatorRealmUpdateCopy(normalizedLocale);
  const archetype = copy.archetypes[update.archetypeId];
  const district = copy.districts[update.districtId];
  const url = getPublicHttpUrl(publicUrl);
  if (!archetype || !district) throw new TypeError('REALM_UPDATE_COPY_UNAVAILABLE');
  if (!url) throw new TypeError('REALM_UPDATE_URL_INVALID');

  const text = format(copy.payloadTemplate, {
    archetype,
    district,
    count: isolate(update.contributionCount),
    total: isolate(update.totalEnergy),
  });
  if (text.length > 180) throw new TypeError('REALM_UPDATE_COPY_TOO_LONG');

  return Object.freeze({ title: copy.shareTitle, text, url });
}

export function buildCreatorRealmUpdateManualText(payload) {
  return buildClipboardText(payload);
}

export function createCreatorRealmUpdateActionController(options = {}) {
  return createMissionResultActionController(options);
}
