import './realm-chronicle.css';
import {
  deriveRealmChronicle,
  REALM_CHRONICLE_RECENT_LIMIT,
} from './realm-chronicle.js';
import { getRealmChronicleCopy } from './realm-chronicle-i18n.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function numberTemplate(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => {
    const marker = `{${key}}`;
    const index = result.indexOf(marker);
    if (index < 0) return result;
    return `${result.slice(0, index)}<bdi dir="ltr">${escapeHtml(value)}</bdi>${result.slice(index + marker.length)}`;
  }, escapeHtml(template));
}

function missionGlyph(missionId) {
  const paths = {
    'route-choice': '<path d="M3 4h7l3 3-3 3H3m10-3h4"/>',
    'relay-sequence': '<circle cx="4" cy="9" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="16" cy="10" r="2"/><path d="m5.7 7.9 2.6-1.8m3.5.2 2.5 2.4"/>',
    'signal-match': '<path d="M3 13c3-5 6-5 9 0m-6-4c2-3 4-3 6 0m-3-4v10"/>',
  };
  return `<span class="realm-chronicle-glyph" aria-hidden="true"><svg viewBox="0 0 20 18" focusable="false">${paths[missionId] || ''}</svg></span>`;
}

function sharedSignalMarkup() {
  return `
    <span class="realm-chronicle-shared-mark" aria-hidden="true">
      <svg viewBox="0 0 28 12" focusable="false">
        <circle cx="5" cy="6" r="3"></circle>
        <path d="M8 6h12"></path>
        <circle cx="23" cy="6" r="3"></circle>
      </svg>
    </span>
  `;
}

function provenanceMarkup(entry, copy) {
  if (entry.provenance?.sourceKind !== 'shared') return '';
  return `
    <span class="realm-chronicle-provenance" data-shared-provenance>
      ${sharedSignalMarkup()}
      <span>${escapeHtml(copy.sharedMission)} <span aria-hidden="true">·</span> <bdi dir="auto">${escapeHtml(entry.provenance.partnerName)}</bdi></span>
    </span>
  `;
}

function rowMarkup(entry, copy) {
  return `
    <li class="realm-chronicle-entry">
      <span class="realm-chronicle-node" aria-hidden="true"></span>
      <span class="realm-chronicle-entry-main">
        ${missionGlyph(entry.missionId)}
        <strong>${escapeHtml(copy.missions[entry.missionId])}</strong>
      </span>
      <span class="realm-chronicle-entry-meta">
        <span>${escapeHtml(copy.roles[entry.roleId])}</span>
        <span>${escapeHtml(copy.routes[entry.routeId])}</span>
        <span>${escapeHtml(copy.stages[entry.stageId])}</span>
      </span>
      <span class="realm-chronicle-entry-result">
        <strong><span class="realm-chronicle-live">${escapeHtml(copy.contributionLabel)}</span><bdi dir="ltr">+${entry.contribution}</bdi></strong>
        <span class="realm-chronicle-entry-total"><span class="realm-chronicle-live">${escapeHtml(copy.totalLabel)}</span><bdi dir="ltr">${entry.totalEnergy}</bdi></span>
      </span>
      ${provenanceMarkup(entry, copy)}
    </li>
  `;
}

export function formatRealmChronicleAnnouncement({ expanded, count }, locale = 'en') {
  const copy = getRealmChronicleCopy(locale);
  const template = expanded ? copy.showingAllTemplate : copy.showingRecentTemplate;
  return template.replace('{count}', String(count));
}

export function renderRealmChronicle(realm, {
  locale = 'en',
  expanded = false,
  headingId = 'realm-chronicle-title',
} = {}) {
  const chronicle = deriveRealmChronicle(realm);
  if (chronicle.status !== 'ready') return '';
  const copy = getRealmChronicleCopy(locale);
  const visibleEntries = expanded
    ? chronicle.entries
    : chronicle.entries.slice(0, REALM_CHRONICLE_RECENT_LIMIT);
  const summary = numberTemplate(copy.summaryTemplate, {
    count: chronicle.contributionCount,
    total: chronicle.totalEnergy,
  }).replace('{stage}', escapeHtml(copy.stages[chronicle.stageId]));
  const toggleNeeded = chronicle.entries.length > REALM_CHRONICLE_RECENT_LIMIT;

  return `
    <section class="realm-chronicle" data-realm-chronicle data-expanded="${expanded ? 'true' : 'false'}" aria-labelledby="${escapeHtml(headingId)}">
      <header class="realm-chronicle-header">
        <h3 id="${escapeHtml(headingId)}">${escapeHtml(copy.title)}</h3>
        ${chronicle.entries.length
          ? `<p class="realm-chronicle-summary">${summary}</p>`
          : `<p class="realm-chronicle-empty">${escapeHtml(copy.empty)}</p>`}
      </header>
      ${visibleEntries.length
        ? `<ol class="realm-chronicle-list" data-chronicle-list>${visibleEntries.map(entry => rowMarkup(entry, copy)).join('')}</ol>`
        : ''}
      ${toggleNeeded
        ? `<button class="secondary realm-chronicle-toggle" type="button" data-action="toggle-realm-chronicle" aria-expanded="${expanded ? 'true' : 'false'}">${escapeHtml(expanded ? copy.showRecent : copy.showAll)}</button>`
        : ''}
      <p class="realm-chronicle-live" data-realm-chronicle-live aria-live="polite" aria-atomic="true"></p>
    </section>
  `;
}
