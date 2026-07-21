import { getMissionResultCopy, normalizeMissionLocale } from './mission-result-i18n.js';
import { DEFAULT_MISSION_TEMPLATE_ID, normalizeMissionTemplateId } from './mission-templates.js';
import { parseCompletionReceiptFragment } from './completion-receipt.js';
import { parsePrototypeInviteFragment } from './prototype-invite.js';

const ROLE_IDS = new Set(['builder', 'explorer', 'guardian']);
const ROUTE_IDS = new Set(['sky', 'ocean']);
const LRI = '\u2066';
const PDI = '\u2069';

function boundedInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function sanitizeResultText(value, maximumLength = 64) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/[<>]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maximumLength);
}

export function createMissionResult({
  roleId,
  routeId,
  templateId,
  energyBefore,
  energyAdded = 3,
  target = 100,
  district = 'Signal Harbor',
}) {
  if (!ROLE_IDS.has(roleId)) throw new TypeError('INVALID_ROLE');
  if (!ROUTE_IDS.has(routeId)) throw new TypeError('INVALID_ROUTE');
  const safeTemplateId = normalizeMissionTemplateId(
    templateId ?? globalThis.__creatorverseMissionTemplateId ?? DEFAULT_MISSION_TEMPLATE_ID,
    { fallback: false },
  );

  const safeTarget = boundedInteger(target, 1, 1000000);
  const before = boundedInteger(energyBefore, 0, safeTarget);
  const requestedGain = boundedInteger(energyAdded, 0, safeTarget);
  const after = Math.min(safeTarget, before + requestedGain);
  const safeDistrict = sanitizeResultText(district);

  if (!safeDistrict) throw new TypeError('INVALID_DISTRICT');

  return Object.freeze({
    roleId,
    routeId,
    templateId: safeTemplateId,
    energyAdded: requestedGain,
    energyBefore: before,
    energyAfter: after,
    target: safeTarget,
    district: safeDistrict,
  });
}

function getValidatedCompletionReceiptFragment(hash) {
  const raw = String(hash ?? '').replace(/^#/u, '');
  if (!raw) return '';
  const parameters = new URLSearchParams(raw);
  const keys = [...parameters.keys()];
  if (keys.length !== 1 || keys[0] !== 'receipt') return '';
  if (parseCompletionReceiptFragment(`#${raw}`).status !== 'valid') return '';
  return `receipt=${parameters.get('receipt')}`;
}

function getValidatedPrototypeInviteFragment(hash) {
  const raw = String(hash ?? '').replace(/^#/u, '');
  if (!raw) return '';
  const parameters = new URLSearchParams(raw);
  const keys = [...parameters.keys()];
  if (keys.length !== 1 || keys[0] !== 'invite') return '';
  if (parsePrototypeInviteFragment(`#${raw}`).status !== 'valid') return '';
  return `invite=${parameters.get('invite')}`;
}

export function getPublicHttpUrl(value, {
  preserveCompletionReceipt = false,
  preservePrototypeInvite = false,
} = {}) {
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    const receiptFragment = preserveCompletionReceipt
      ? getValidatedCompletionReceiptFragment(url.hash)
      : '';
    const inviteFragment = !receiptFragment && preservePrototypeInvite
      ? getValidatedPrototypeInviteFragment(url.hash)
      : '';
    url.search = '';
    url.hash = receiptFragment || inviteFragment;
    return url.toString();
  } catch {
    return null;
  }
}

function isolate(value) {
  return `${LRI}${value}${PDI}`;
}

export function buildMissionSharePayload(result, { locale = 'en', publicUrl } = {}) {
  const normalizedLocale = normalizeMissionLocale(locale);
  const copy = getMissionResultCopy(normalizedLocale);
  const safeUrl = getPublicHttpUrl(publicUrl);
  if (!safeUrl) throw new TypeError('INVALID_PUBLIC_URL');

  const role = copy.roles[result.roleId];
  const template = copy.templates[result.templateId || DEFAULT_MISSION_TEMPLATE_ID];
  const district = copy.districts[result.district] || sanitizeResultText(result.district);
  if (!role || !template || !district) throw new TypeError('INVALID_RESULT_DATA');

  const contribution = `${isolate(`+${result.energyAdded}`)} ${copy.energy}`;
  const progress = isolate(`${result.energyBefore} → ${result.energyAfter}`);
  const text = `${copy.title}: ${role} · ${template} · ${contribution} · ${district} ${progress}.`;

  return Object.freeze({ title: copy.shareTitle, text, url: safeUrl });
}

export function buildClipboardText(payload) {
  const text = String(payload?.text || '').slice(0, 280).trim();
  const url = getPublicHttpUrl(payload?.url, {
    preserveCompletionReceipt: true,
    preservePrototypeInvite: true,
  }) || '';
  return `${text}\n${url}`.trim();
}

export function createMissionResultActionController({
  navigatorLike = {},
  payload,
  copyText,
} = {}) {
  const mode = typeof navigatorLike.share === 'function' ? 'share' : 'copy';
  const clipboardWriter = copyText
    || (typeof navigatorLike.clipboard?.writeText === 'function'
      ? text => navigatorLike.clipboard.writeText(text)
      : null);
  let pending = false;

  return Object.freeze({
    mode,
    isPending: () => pending,
    async activate() {
      if (pending) return Object.freeze({ status: 'ignored', mode });
      if (!payload?.url || !payload?.text) return Object.freeze({ status: 'invalid', mode });

      pending = true;
      try {
        if (mode === 'share') {
          await navigatorLike.share(payload);
          return Object.freeze({ status: 'shared', mode });
        }

        if (!clipboardWriter) return Object.freeze({ status: 'unsupported', mode });
        await clipboardWriter(buildClipboardText(payload));
        return Object.freeze({ status: 'copied', mode });
      } catch (error) {
        if (mode === 'share' && error?.name === 'AbortError') {
          return Object.freeze({ status: 'cancelled', mode });
        }
        if (mode === 'share' && ['NotAllowedError', 'SecurityError'].includes(error?.name)) {
          return Object.freeze({ status: 'denied', mode });
        }
        return Object.freeze({ status: 'failed', mode });
      } finally {
        pending = false;
      }
    },
  });
}
