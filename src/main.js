import './styles.css';

const themes = [
  { id: 'cosmic', label: 'Signal', description: 'Clear routes and bright checkpoints.' },
  { id: 'wild', label: 'Canopy', description: 'Branching paths and shared discoveries.' },
  { id: 'future', label: 'Circuit', description: 'Structured systems and rapid upgrades.' },
];

const realm = {
  name: 'Nova Guild',
  creator: '@creator',
  tagline: 'A community built around bold ideas.',
  theme: 'cosmic',
  members: 2847,
  energy: 72,
  target: 100,
  district: 'Signal Harbor',
};

const roles = [
  { id: 'builder', title: 'Builder', description: 'Build upgrades.' },
  { id: 'explorer', title: 'Explorer', description: 'Open routes.' },
  { id: 'guardian', title: 'Guardian', description: 'Protect progress.' },
];

let selectedRole = null;
let missionCompleted = false;
let creatorMode = false;
let onboardingStep = 1;
let draftRealm = { ...realm };
let socialUrl = '';
let socialStatus = 'idle';
let socialPreview = null;
let socialError = '';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function icon(name, className = '') {
  const paths = {
    brand: '<path d="M5 6h7v4H9v4h7v4H5V6Zm7 0h7v12h-7v-4h3v-4h-3V6Z"/>',
    builder: '<path d="M5 18V9l7-4 7 4v9h-5v-5h-4v5H5Zm5-7h4V9h-4v2Z"/>',
    explorer: '<path d="m12 4 7 4-3 9-4 3-4-3-3-9 7-4Zm0 4-3 2 2 5 1 1 1-1 2-5-3-2Z"/>',
    guardian: '<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Zm0 5-3 1v2c0 2.4 1.1 4.3 3 5.6 1.9-1.3 3-3.2 3-5.6V9l-3-1Z"/>',
    signal: '<path d="M5 17h3V7H5v10Zm5 0h4V4h-4v13Zm6 0h3V10h-3v7Z"/>',
    canopy: '<path d="M12 3c3 0 5 2.1 5 4.8 2 .4 3 1.9 3 3.7 0 2.5-2 4.5-4.5 4.5H14v5h-4v-5H8.5A4.5 4.5 0 0 1 4 11.5c0-1.8 1-3.3 3-3.7C7 5.1 9 3 12 3Z"/>',
    circuit: '<path d="M7 3h4v4H9v3h6V7h-2V3h4v4h-1v4h4v4h-4v-2H9v2H8v3h3v-1h4v4h-4v-1H6v-5H4v-4h3V7H7V3Z"/>',
    close: '<path d="m7 7 10 10m0-10L7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    import: '<path d="M12 3v10m0 0 4-4m-4 4L8 9M5 15v4h14v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    expand: '<path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  return `<svg class="cv-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.signal}</svg>`;
}

function themeIcon(themeId) {
  const map = { cosmic: 'signal', wild: 'canopy', future: 'circuit' };
  return icon(map[themeId] || 'signal');
}

function renderSignalMap(data, preview) {
  const activeNodes = Math.max(1, Math.min(4, Math.ceil(data.energy / 25)));
  return `
    <svg class="signal-map" viewBox="0 0 320 118" role="img" aria-label="Signal Harbor district map">
      <path class="signal-rail" d="M20 83H88L120 51H194L226 27H300"/>
      <path class="signal-rail signal-rail-secondary" d="M20 101H112L144 69H214L246 45H300"/>
      ${[0, 1, 2, 3].map((index) => {
        const coordinates = [[88,83], [144,69], [214,69], [246,45]][index];
        return `<circle class="signal-node ${index < activeNodes ? 'is-active' : ''}" cx="${coordinates[0]}" cy="${coordinates[1]}" r="7"/>`;
      }).join('')}
      <rect class="signal-gate ${preview ? 'is-preview' : ''}" x="278" y="16" width="22" height="22" rx="3"/>
    </svg>
  `;
}

function renderRealmCard({ preview = false } = {}) {
  const data = preview ? draftRealm : realm;
  const progress = Math.max(0, Math.min(100, Math.round((data.energy / data.target) * 100)));
  return `
    <article class="realm-card theme-${escapeHtml(data.theme)}" aria-label="Current realm">
      <header class="realm-heading">
        <div>
          <p class="section-kicker">${preview ? 'Live realm preview' : 'Current realm'}</p>
          <h2>${escapeHtml(data.name)}</h2>
          <p class="realm-creator"><bdi>${escapeHtml(data.creator)}</bdi></p>
        </div>
        <span class="level">LVL 01</span>
      </header>
      ${renderSignalMap(data, preview)}
      <p class="realm-tagline">${escapeHtml(data.tagline)}</p>
      <dl class="realm-stats">
        <div><dt>members</dt><dd><bdi>${data.members.toLocaleString()}</bdi></dd></div>
        <div><dt>districts</dt><dd><bdi>${preview ? '1' : '14'}</bdi></dd></div>
      </dl>
      <div class="progress-label"><span>Unlock ${escapeHtml(data.district)}</span><strong><bdi>${data.energy}/${data.target}</bdi></strong></div>
      <div class="progress" role="progressbar" aria-label="Current realm energy" aria-valuemin="0" aria-valuemax="${data.target}" aria-valuenow="${data.energy}">
        <span style="inline-size:${progress}%"></span>
      </div>
    </article>
  `;
}

function renderRoleButton(role) {
  return `
    <button class="role-card ${selectedRole === role.id ? 'selected' : ''}" data-role="${role.id}" aria-pressed="${selectedRole === role.id}">
      ${icon(role.id)}
      <span class="role-copy"><strong>${role.title}</strong><small>${role.description}</small></span>
    </button>
  `;
}

function renderMission() {
  return `
    <article class="mission ${selectedRole ? 'active' : ''}" aria-labelledby="mission-title">
      <header class="mission-heading">
        <div>
          <p class="section-kicker">One mission · 35 seconds</p>
          <h2 id="mission-title">Power Signal Harbor</h2>
        </div>
        <span class="mission-status">${missionCompleted ? 'Complete' : selectedRole ? 'Ready' : 'Choose a role'}</span>
      </header>
      <p class="mission-prompt">${selectedRole ? 'Choose one route for your role.' : 'Choose a role to unlock the routes.'}</p>
      <div class="mission-actions" aria-label="Energy route">
        <button class="route" ${!selectedRole || missionCompleted ? 'disabled' : ''} data-route="sky">Sky route</button>
        <button class="route" ${!selectedRole || missionCompleted ? 'disabled' : ''} data-route="ocean">Ocean route</button>
      </div>
      <div class="mission-result" aria-live="polite">${missionCompleted ? '<strong>Mission complete.</strong> Your action added 3 realm energy.' : ''}</div>
    </article>
  `;
}

function renderCreatorOnboarding() {
  return `
    <section class="creator-studio shell" id="creator-studio" aria-labelledby="creator-studio-title">
      <header class="studio-heading">
        <div>
          <p class="section-kicker">Creator setup · Step ${onboardingStep} of 3</p>
          <h2 id="creator-studio-title">Create your realm.</h2>
        </div>
        <button class="icon-button" data-action="close-creator" aria-label="Close creator setup">${icon('close')}</button>
      </header>

      <div class="studio-layout">
        <div class="studio-panel">
          ${onboardingStep === 1 ? `
            <div class="field-stack">
              <label>Realm name<input maxlength="28" data-field="name" value="${escapeHtml(draftRealm.name)}" placeholder="Nova Guild"></label>
              <label>Creator handle<input maxlength="32" data-field="creator" value="${escapeHtml(draftRealm.creator)}" placeholder="@yourhandle"></label>
              <label>Community promise<textarea maxlength="90" data-field="tagline" rows="3" placeholder="What should members feel here?">${escapeHtml(draftRealm.tagline)}</textarea></label>
            </div>
          ` : ''}

          ${onboardingStep === 2 ? `
            <div class="theme-grid" role="radiogroup" aria-label="Realm visual theme">
              ${themes.map(theme => `
                <button class="theme-option ${draftRealm.theme === theme.id ? 'selected' : ''}" data-theme="${theme.id}" role="radio" aria-checked="${draftRealm.theme === theme.id}">
                  ${themeIcon(theme.id)}
                  <span><strong>${theme.label}</strong><small>${theme.description}</small></span>
                </button>
              `).join('')}
            </div>
          ` : ''}

          ${onboardingStep === 3 ? `
            <div class="launch-summary">
              <p class="section-kicker">First seven-day goal</p>
              <h3>Invite 30 members and unlock ${escapeHtml(draftRealm.district)}.</h3>
              <p>Members choose a role, complete one controlled mission, and add visible realm energy.</p>
              <label class="check-row"><input type="checkbox" data-field="safety" checked> <span>I understand that all competition must remain inside the fictional Creatorverse universe.</span></label>
            </div>
          ` : ''}

          <div class="studio-actions">
            <button class="secondary" data-action="creator-back" ${onboardingStep === 1 ? 'disabled' : ''}>Back</button>
            <button class="primary" data-action="creator-next">${onboardingStep === 3 ? 'Launch preview' : 'Continue'}</button>
          </div>
          <p class="form-message" aria-live="polite"></p>
        </div>
        <div class="preview-panel">${renderRealmCard({ preview: true })}</div>
      </div>
    </section>
  `;
}

function renderSocialImport() {
  const preview = socialPreview;
  return `
    <section class="social-import" id="social-import" aria-labelledby="social-import-title">
      <header class="tool-heading">
        <div>
          <p class="section-kicker">Public post</p>
          <h3 id="social-import-title">Import a public post.</h3>
        </div>
        <p>Public links only. Nothing is saved.</p>
      </header>
      <div class="social-import-grid">
        <form class="social-import-form" data-form="social-import">
          <label for="social-url">Public post URL</label>
          <div class="url-row">
            <input id="social-url" type="url" inputmode="url" autocomplete="url" maxlength="2048" value="${escapeHtml(socialUrl)}" placeholder="https://www.youtube.com/watch?v=..." required>
            <button class="primary" type="submit" ${socialStatus === 'loading' ? 'disabled' : ''}>${socialStatus === 'loading' ? 'Fetching…' : 'Fetch post'}</button>
          </div>
          <p class="form-message social-message" aria-live="polite">${socialError ? escapeHtml(socialError) : ''}</p>
        </form>

        <article class="social-preview ${preview ? 'has-content' : ''}">
          ${preview ? `
            ${preview.thumbnailUrl ? `<img src="${escapeHtml(preview.thumbnailUrl)}" alt="Public post thumbnail from ${escapeHtml(preview.providerLabel)}" loading="lazy">` : '<div class="social-placeholder">No public thumbnail</div>'}
            <div class="social-preview-copy">
              <p class="section-kicker">${escapeHtml(preview.providerLabel)} · ${escapeHtml(preview.type)}</p>
              <h3>${escapeHtml(preview.title)}</h3>
              <p>${preview.authorName ? `By ${escapeHtml(preview.authorName)}` : 'Public creator post'}</p>
              <div class="social-actions">
                <a class="secondary link-button" href="${escapeHtml(preview.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original</a>
                <button class="primary" data-action="use-social-post">Use for mission</button>
              </div>
            </div>
          ` : `
            <div class="social-empty">
              ${icon('import')}
              <h3>No post imported.</h3>
              <p>Paste a supported public link.</p>
            </div>
          `}
        </article>
      </div>
    </section>
  `;
}

function render() {
  document.querySelector('#app').innerHTML = `
    <main>
      <nav class="nav shell" aria-label="Primary navigation">
        <a class="brand" href="#join" aria-label="Creatorverse home">${icon('brand', 'brand-icon')}<span>Creatorverse</span></a>
        <div class="nav-actions">
          <button class="secondary nav-create" data-action="creator">Create realm</button>
        </div>
      </nav>

      <section class="experience shell" id="join" aria-labelledby="experience-title">
        <div class="experience-intro">
          <p class="section-kicker">Season 0 · Prototype</p>
          <h1 id="experience-title">Choose your role. Help the realm grow.</h1>
        </div>
        <div class="experience-grid">
          <div class="play-panel">
            <div class="role-grid" aria-label="Choose your role">
              ${roles.map(renderRoleButton).join('')}
            </div>
            ${renderMission()}
          </div>
          <div class="realm-panel">${renderRealmCard()}</div>
        </div>
      </section>

      ${creatorMode ? renderCreatorOnboarding() : ''}

      <details class="creator-tools shell">
        <summary>
          <span><strong>Creator tools</strong><small>Import public content</small></span>
          <span class="summary-action">${icon('expand')}</span>
        </summary>
        <div class="creator-tools-content">
          ${renderSocialImport()}
        </div>
      </details>
    </main>
  `;

  bindEvents();
}

function updateDraftField(field, value) {
  draftRealm[field] = value.trimStart();
  const card = document.querySelector('.preview-panel');
  if (card) card.innerHTML = renderRealmCard({ preview: true });
}

async function importSocialPost() {
  socialStatus = 'loading';
  socialError = '';
  socialPreview = null;
  render();
  document.querySelector('.creator-tools')?.setAttribute('open', '');

  try {
    const response = await fetch('/api/social/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: socialUrl }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Unable to fetch this public post.');
    socialPreview = body.preview;
    socialStatus = 'success';
  } catch (error) {
    socialStatus = 'error';
    const messages = {
      UNSUPPORTED_SOCIAL_URL: 'Use a public HTTPS link from YouTube, TikTok, or X.',
      SOCIAL_PROVIDER_REJECTED: 'The platform did not provide public metadata for this post.',
      SOCIAL_PROVIDER_TIMEOUT: 'The social platform took too long to respond. Try again.',
      INVALID_URL: 'Enter a valid public post URL.',
    };
    socialError = messages[error.message] || error.message;
  }

  render();
  document.querySelector('.creator-tools')?.setAttribute('open', '');
  document.querySelector('#social-import')?.scrollIntoView({ block: 'center' });
}

function bindEvents() {
  document.querySelector('[data-action="creator"]')?.addEventListener('click', () => {
    creatorMode = true;
    onboardingStep = 1;
    draftRealm = { ...realm, members: 0, energy: 0 };
    render();
    document.querySelector('#creator-studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.querySelector('[data-action="close-creator"]')?.addEventListener('click', () => { creatorMode = false; render(); });
  document.querySelector('[data-action="creator-back"]')?.addEventListener('click', () => { onboardingStep = Math.max(1, onboardingStep - 1); render(); document.querySelector('#creator-studio')?.scrollIntoView(); });
  document.querySelector('[data-action="creator-next"]')?.addEventListener('click', () => {
    const message = document.querySelector('.creator-studio .form-message');
    if (onboardingStep === 1 && (!draftRealm.name.trim() || !draftRealm.creator.trim() || !draftRealm.tagline.trim())) {
      if (message) message.textContent = 'Complete all three fields to continue.';
      return;
    }
    if (onboardingStep < 3) {
      onboardingStep += 1;
      render();
      document.querySelector('#creator-studio')?.scrollIntoView();
      return;
    }
    Object.assign(realm, draftRealm, { members: 0, energy: 0 });
    creatorMode = false;
    render();
    document.querySelector('.realm-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.querySelectorAll('[data-field="name"], [data-field="creator"], [data-field="tagline"]').forEach(input => {
    input.addEventListener('input', () => updateDraftField(input.dataset.field, input.value));
  });

  document.querySelectorAll('[data-theme]').forEach(button => {
    button.addEventListener('click', () => { draftRealm.theme = button.dataset.theme; render(); document.querySelector('#creator-studio')?.scrollIntoView(); });
  });

  document.querySelector('[data-form="social-import"]')?.addEventListener('submit', event => {
    event.preventDefault();
    socialUrl = document.querySelector('#social-url')?.value.trim() || '';
    if (socialUrl) importSocialPost();
  });

  document.querySelector('[data-action="use-social-post"]')?.addEventListener('click', () => {
    if (!socialPreview) return;
    socialStatus = 'used';
    socialError = '';
    realm.tagline = `Mission inspired by ${socialPreview.authorName || socialPreview.providerLabel}: ${socialPreview.title}`.slice(0, 90);
    render();
    document.querySelector('.realm-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.querySelectorAll('[data-role]').forEach(button => {
    button.addEventListener('click', () => {
      selectedRole = button.dataset.role;
      missionCompleted = false;
      render();
      document.querySelector('.mission')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  document.querySelectorAll('[data-route]').forEach(button => {
    button.addEventListener('click', () => {
      missionCompleted = true;
      realm.energy = Math.min(realm.target, realm.energy + 3);
      render();
      document.querySelector('.mission')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

render();
