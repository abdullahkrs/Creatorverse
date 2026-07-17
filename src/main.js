import './styles.css';

const themes = [
  { id: 'cosmic', label: 'Cosmic', icon: '✦', description: 'Signals, portals, and luminous districts.' },
  { id: 'wild', label: 'Wild', icon: '◇', description: 'Floating forests, ruins, and discovery routes.' },
  { id: 'future', label: 'Future', icon: '⬡', description: 'Neon systems, labs, and creator-powered cities.' },
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
  { id: 'builder', icon: '◆', title: 'Builder', description: 'Turn community activity into structures and upgrades.' },
  { id: 'explorer', icon: '✦', title: 'Explorer', description: 'Discover new districts, routes, and seasonal rewards.' },
  { id: 'guardian', icon: '◈', title: 'Guardian', description: 'Protect streaks and represent the realm in events.' },
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

function themeClass(themeId) {
  return `theme-${themeId}`;
}

function renderRealmCard({ preview = false } = {}) {
  const data = preview ? draftRealm : realm;
  return `
    <article class="realm-card ${themeClass(data.theme)}">
      <div class="realm-orbit"><span></span><span></span><span></span></div>
      <div class="realm-heading">
        <div>
          <p class="muted">${preview ? 'Live realm preview' : 'Featured creator realm'}</p>
          <h2>${escapeHtml(data.name)}</h2>
          <p>${escapeHtml(data.creator)}</p>
        </div>
        <div class="level">LVL 01</div>
      </div>
      <p class="realm-tagline">${escapeHtml(data.tagline)}</p>
      <div class="stats">
        <div><strong>${data.members.toLocaleString()}</strong><span>members</span></div>
        <div><strong>${preview ? '1' : '14'}</strong><span>districts</span></div>
        <div><strong>${preview ? 'Ready' : '6 days'}</strong><span>${preview ? 'to launch' : 'streak'}</span></div>
      </div>
      <div class="progress-label"><span>Unlock ${escapeHtml(data.district)}</span><strong>${data.energy}/${data.target}</strong></div>
      <div class="progress"><span style="width:${data.energy}%"></span></div>
    </article>
  `;
}

function renderCreatorOnboarding() {
  return `
    <section class="creator-studio shell" id="creator-studio">
      <header class="studio-heading">
        <div>
          <p class="eyebrow">Creator setup · Step ${onboardingStep} of 3</p>
          <h2>Create a realm your audience will recognize.</h2>
          <p>Start with identity, visual direction, and one safe community promise. You can refine everything later.</p>
        </div>
        <button class="icon-button" data-action="close-creator" aria-label="Close creator setup">×</button>
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
                  <span>${theme.icon}</span><strong>${theme.label}</strong><small>${theme.description}</small>
                </button>
              `).join('')}
            </div>
          ` : ''}

          ${onboardingStep === 3 ? `
            <div class="launch-summary">
              <p class="eyebrow">First seven-day goal</p>
              <h3>Invite 30 members and unlock ${escapeHtml(draftRealm.district)}.</h3>
              <ul>
                <li>Members choose Builder, Explorer, or Guardian.</li>
                <li>You launch one controlled mission template.</li>
                <li>Every completed action visibly powers the realm.</li>
                <li>No real-world politics or off-platform conflict.</li>
              </ul>
              <label class="check-row"><input type="checkbox" data-field="safety" checked> I understand that all competition must remain inside the fictional Creatorverse universe.</label>
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
    <section class="social-import shell" id="social-import">
      <header class="section-heading social-heading">
        <div>
          <p class="eyebrow">Creator content bridge</p>
          <h2>Bring a public post into your realm.</h2>
          <p>Paste a public YouTube, TikTok, or X link. Creatorverse fetches basic public metadata only—never passwords, private messages, or follower lists.</p>
        </div>
        <div class="provider-pills" aria-label="Supported social platforms">
          <span>YouTube</span><span>TikTok</span><span>X</span><span class="planned">Instagram · planned</span>
        </div>
      </header>

      <div class="social-import-grid">
        <form class="social-import-form" data-form="social-import">
          <label for="social-url">Public post URL</label>
          <div class="url-row">
            <input id="social-url" type="url" inputmode="url" autocomplete="url" maxlength="2048" value="${escapeHtml(socialUrl)}" placeholder="https://www.youtube.com/watch?v=..." required>
            <button class="primary" type="submit" ${socialStatus === 'loading' ? 'disabled' : ''}>${socialStatus === 'loading' ? 'Fetching…' : 'Fetch post'}</button>
          </div>
          <p class="social-note">Only allowlisted HTTPS domains are requested by the server. Imported data is not saved in this prototype.</p>
          <p class="form-message social-message" aria-live="polite">${socialError ? escapeHtml(socialError) : ''}</p>
        </form>

        <article class="social-preview ${preview ? 'has-content' : ''}">
          ${preview ? `
            ${preview.thumbnailUrl ? `<img src="${escapeHtml(preview.thumbnailUrl)}" alt="Public post thumbnail from ${escapeHtml(preview.providerLabel)}" loading="lazy">` : '<div class="social-placeholder">No public thumbnail</div>'}
            <div class="social-preview-copy">
              <p class="eyebrow">${escapeHtml(preview.providerLabel)} · ${escapeHtml(preview.type)}</p>
              <h3>${escapeHtml(preview.title)}</h3>
              <p>${preview.authorName ? `By ${escapeHtml(preview.authorName)}` : 'Public creator post'}</p>
              <div class="social-actions">
                <a class="secondary link-button" href="${escapeHtml(preview.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original</a>
                <button class="primary" data-action="use-social-post">Use as mission seed</button>
              </div>
            </div>
          ` : `
            <div class="social-empty">
              <span>↗</span>
              <h3>Your imported post will appear here.</h3>
              <p>Use it later as the source for a safe mission, event announcement, or creator result card.</p>
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
      <nav class="nav shell">
        <a class="brand" href="#" aria-label="Creatorverse home"><span class="brand-mark">C</span><span>Creatorverse</span></a>
        <span class="season">Season 0 · Prototype</span>
      </nav>

      <section class="hero shell">
        <div class="hero-copy">
          <p class="eyebrow">A playable community for creators</p>
          <h1>Turn your audience into a living digital world.</h1>
          <p class="lead">Build a fictional realm with your followers, launch safe community missions, collaborate with other creators, and create moments worth sharing.</p>
          <div class="hero-actions">
            <button class="primary" data-action="join">Join this realm</button>
            <button class="secondary" data-action="creator">Create a realm</button>
          </div>
          <p class="safety-note">Fictional universe only · No real-world politics · No off-platform conflict</p>
        </div>
        ${renderRealmCard()}
      </section>

      ${creatorMode ? renderCreatorOnboarding() : ''}
      ${renderSocialImport()}

      <section class="loop shell" id="join">
        <header class="section-heading"><p class="eyebrow">The first playable loop</p><h2>Choose your role. Help the realm grow.</h2></header>
        <div class="role-grid">
          ${roles.map(role => `
            <button class="role-card ${selectedRole === role.id ? 'selected' : ''}" data-role="${role.id}">
              <span class="role-icon">${role.icon}</span><strong>${role.title}</strong><span>${role.description}</span>
            </button>
          `).join('')}
        </div>

        <article class="mission ${selectedRole ? 'active' : ''}">
          <div><p class="eyebrow">Creator mission · 35 seconds</p><h3>Power the Signal Harbor</h3><p>${selectedRole ? `As a ${roles.find(role => role.id === selectedRole).title}, choose the next energy route for the community.` : 'Select a role to unlock today’s mission.'}</p></div>
          <div class="mission-actions">
            <button class="route" ${!selectedRole || missionCompleted ? 'disabled' : ''} data-route="sky">Sky route</button>
            <button class="route" ${!selectedRole || missionCompleted ? 'disabled' : ''} data-route="ocean">Ocean route</button>
          </div>
          <div class="mission-result" aria-live="polite">${missionCompleted ? '<strong>Mission complete.</strong> Your action added 3 realm energy and will appear in the creator’s share card.' : ''}</div>
        </article>
      </section>

      <section class="principles shell">
        <div><span>01</span><h3>Creator-led</h3><p>Every realm reflects the creator’s content, voice, and community rituals.</p></div>
        <div><span>02</span><h3>Audience-powered</h3><p>Active participation matters more than the creator’s external follower count.</p></div>
        <div><span>03</span><h3>Safe by design</h3><p>Competition remains inside a fictional world through controlled mission templates.</p></div>
      </section>
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
  document.querySelector('#social-import')?.scrollIntoView({ block: 'center' });

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
  document.querySelector('#social-import')?.scrollIntoView({ block: 'center' });
}

function bindEvents() {
  document.querySelector('[data-action="join"]')?.addEventListener('click', () => document.querySelector('#join')?.scrollIntoView({ behavior: 'smooth' }));

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
    const message = document.querySelector('.form-message');
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
      document.querySelector('.mission')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  document.querySelectorAll('[data-route]').forEach(button => {
    button.addEventListener('click', () => {
      missionCompleted = true;
      realm.energy = Math.min(realm.target, realm.energy + 3);
      render();
      document.querySelector('.mission')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

render();