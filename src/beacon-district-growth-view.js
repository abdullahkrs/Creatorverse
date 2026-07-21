import './beacon-district-growth.css';
import { deriveBeaconDistrictGrowth } from './beacon-district-growth.js';
import { getBeaconDistrictGrowthCopy } from './beacon-district-growth-i18n.js';

const LRI = '\u2066';
const PDI = '\u2069';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function numberTemplate(template, key, value) {
  const marker = `{${key}}`;
  const index = template.indexOf(marker);
  if (index < 0) return escapeHtml(template);
  return `${escapeHtml(template.slice(0, index))}<bdi dir="ltr">${escapeHtml(value)}</bdi>${escapeHtml(template.slice(index + marker.length))}`;
}

function artworkMarkup(growth) {
  const active = index => growth.stageIndex >= index ? ' is-active' : '';
  return `
    <div class="beacon-district-artwork" aria-hidden="true">
      <svg class="beacon-district-map" viewBox="0 0 320 190" focusable="false">
        <path class="beacon-district-ground" d="M20 148 54 58l76-31 77 17 91 66-26 54-92 12-94-8Z"/>
        <path class="beacon-district-ridge" d="m34 137 64-48 62 24 54-39 72 49"/>
        <g class="beacon-stage-layer beacon-stage-gate${active(0)}" data-stage-layer="locked">
          <path d="M45 142V96h48v46M57 142v-27h24v27"/>
          <path d="M45 96h48M57 115h24"/>
        </g>
        <g class="beacon-stage-layer beacon-stage-outpost${active(1)}" data-stage-layer="outpost">
          <path d="M132 137V72h26v65M124 137h42M137 72l8-17 8 17"/>
          <path d="M145 55V38M132 49l13-11 13 11"/>
          <circle cx="145" cy="87" r="5"/>
        </g>
        <g class="beacon-stage-layer beacon-stage-connected${active(2)}" data-stage-layer="connected">
          <path d="m81 128 64-33 58 21 52-31"/>
          <path d="M188 146v-45h38v45M196 115h22M196 128h22"/>
          <circle cx="81" cy="128" r="5"/>
          <circle cx="203" cy="116" r="5"/>
          <circle cx="255" cy="85" r="5"/>
        </g>
        <g class="beacon-stage-layer beacon-stage-illuminated${active(3)}" data-stage-layer="illuminated">
          <path d="M238 151V92h35v59M247 106h6m8 0h5m-19 14h6m8 0h5m-19 14h6m8 0h5"/>
          <path d="M101 157v-35h24v35M106 132h14m-14 11h14"/>
          <path d="M153 153h84"/>
        </g>
      </svg>
      <ol class="beacon-district-stage-rail">
        ${[0, 1, 2, 3].map(index => `<li class="${growth.stageIndex >= index ? 'is-active' : ''}"><span></span></li>`).join('')}
      </ol>
    </div>
  `;
}

export function renderBeaconDistrictGrowth(realm, {
  locale = 'en',
  headingId = 'beacon-district-stage-title',
  headingLevel = 2,
  compact = false,
  transition = false,
} = {}) {
  const growth = deriveBeaconDistrictGrowth(realm);
  if (growth.status !== 'ready') return '';
  const copy = getBeaconDistrictGrowthCopy(locale);
  const stage = copy.stages[growth.stageId];
  const heading = headingLevel === 3 ? 'h3' : 'h2';
  const completion = growth.complete
    ? escapeHtml(copy.completed)
    : numberTemplate(copy.thresholdTemplate, 'threshold', growth.nextThreshold);

  return `
    <figure class="beacon-district-growth${compact ? ' is-compact' : ''}${transition ? ' is-transitioning' : ''}" data-beacon-district-growth data-stage="${growth.stageId}" data-stage-index="${growth.stageIndex}" data-energy="${growth.totalEnergy}">
      ${artworkMarkup(growth)}
      <figcaption class="beacon-district-copy">
        <p class="beacon-district-name">${escapeHtml(copy.districtName)}</p>
        <${heading} id="${escapeHtml(headingId)}" tabindex="-1">${escapeHtml(stage.title)}</${heading}>
        <p class="beacon-district-support">${escapeHtml(stage.support)}</p>
        <p class="beacon-district-energy"><span>${escapeHtml(copy.energy)}</span><strong><bdi dir="ltr">${growth.totalEnergy}</bdi><span aria-hidden="true">/</span><bdi dir="ltr">${growth.maxEnergy}</bdi></strong></p>
        <p class="beacon-district-threshold">${completion}</p>
      </figcaption>
    </figure>
  `;
}

export function formatBeaconDistrictGrowthAnnouncement(growth, {
  locale = 'en',
  stageChanged = false,
} = {}) {
  if (growth?.status !== 'ready') return '';
  const copy = getBeaconDistrictGrowthCopy(locale);
  const template = stageChanged ? copy.transitionTemplate : copy.energyUpdateTemplate;
  return template
    .replace('{district}', copy.districtName)
    .replace('{stage}', copy.stages[growth.stageId].title)
    .replace('{total}', `${LRI}${growth.totalEnergy}${PDI}`);
}
