import { deriveBeaconDistrictGrowth } from './beacon-district-growth.js';
import { DISTRICT_CONTRIBUTION } from './district-progress.js';
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
const LRI = '\u2066';
const PDI = '\u2069';

export function deriveCreatorRealmUpdate(realm) {
  const growth = deriveBeaconDistrictGrowth(realm);
  if (growth.status !== 'ready' || growth.contributionCount < 1 || !THEMES.has(realm?.theme)) {
    return Object.freeze({ status: 'unavailable' });
  }

  return Object.freeze({
    status: 'ready',
    archetypeId: realm.theme,
    districtId: growth.districtId,
    contributionCount: growth.contributionCount,
    totalEnergy: growth.totalEnergy,
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
