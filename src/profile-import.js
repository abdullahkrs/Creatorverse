import './profile-import.css';

const state = {
  url: '',
  status: 'idle',
  profile: null,
  error: '',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function compactNumber(value) {
  if (value === null || value === undefined) return 'Hidden';
  return new Intl.NumberFormat(document.documentElement.lang || 'en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function profileIcon() {
  return `
    <svg class="profile-empty-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 19v-2c0-2.8 2.3-5 5-5h4c2.8 0 5 2.2 5 5v2H5Zm7-9a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/>
    </svg>
  `;
}

function template() {
  const profile = state.profile;
  return `
    <section class="profile-import" id="profile-import" aria-labelledby="profile-import-title">
      <header class="tool-heading profile-heading">
        <div>
          <p class="section-kicker">YouTube profile</p>
          <h3 id="profile-import-title">Import a YouTube profile.</h3>
        </div>
        <p>Public channel data only.</p>
      </header>
      <div class="profile-grid">
        <form class="profile-form" data-profile-form>
          <label for="profile-url">YouTube channel URL</label>
          <div class="profile-url-row">
            <input id="profile-url" type="url" inputmode="url" autocomplete="url" maxlength="2048" value="${escapeHtml(state.url)}" placeholder="https://www.youtube.com/@creator" required>
            <button class="primary" type="submit" ${state.status === 'loading' ? 'disabled' : ''}>${state.status === 'loading' ? 'Fetching…' : 'Fetch profile'}</button>
          </div>
          <p class="profile-note">Official YouTube API. Nothing is saved.</p>
          <p class="form-message" aria-live="polite">${escapeHtml(state.error)}</p>
        </form>
        <article class="profile-card ${profile ? 'has-profile' : ''}">
          ${profile ? `
            <img src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.title)} profile image" loading="lazy">
            <div class="profile-copy">
              <p class="section-kicker">${escapeHtml(profile.providerLabel)}</p>
              <h3>${escapeHtml(profile.title)}</h3>
              <p class="profile-description">${escapeHtml(profile.description || 'Public creator profile')}</p>
              <dl class="profile-stats">
                <div><dt>subscribers</dt><dd>${compactNumber(profile.subscriberCount)}</dd></div>
                <div><dt>videos</dt><dd>${compactNumber(profile.videoCount)}</dd></div>
                <div><dt>views</dt><dd>${compactNumber(profile.viewCount)}</dd></div>
              </dl>
              <div class="social-actions">
                <a class="secondary link-button" href="${escapeHtml(profile.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open profile</a>
                <button class="primary" type="button" data-use-profile>Use for realm</button>
              </div>
            </div>
          ` : `
            <div class="profile-empty">${profileIcon()}<h3>No profile imported.</h3><p>Paste a public YouTube channel link.</p></div>
          `}
        </article>
      </div>
    </section>
  `;
}

function renderProfileSection({ replace = false } = {}) {
  const socialSection = document.querySelector('#social-import');
  if (!socialSection) return;
  const section = document.querySelector('#profile-import');
  if (!section) {
    socialSection.insertAdjacentHTML('beforebegin', template());
  } else if (replace) {
    section.outerHTML = template();
  } else {
    return;
  }
  bind();
}

async function fetchProfile() {
  state.status = 'loading';
  state.error = '';
  state.profile = null;
  renderProfileSection({ replace: true });
  try {
    const response = await fetch('/api/social/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: state.url }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'PROFILE_LOOKUP_FAILED');
    state.profile = body.profile;
    state.status = 'success';
  } catch (error) {
    state.status = 'error';
    const messages = {
      YOUTUBE_API_NOT_CONFIGURED: 'YouTube profile import is ready, but YOUTUBE_API_KEY must be added in Railway Variables.',
      UNSUPPORTED_PROFILE_URL: 'Use a YouTube channel URL with @handle, /channel/, or /user/.',
      PROFILE_NOT_FOUND: 'No public YouTube channel was found for this URL.',
      PROFILE_PROVIDER_REJECTED: 'YouTube rejected the profile request. Check the API key and restrictions.',
      PROFILE_PROVIDER_TIMEOUT: 'YouTube took too long to respond. Try again.',
      INVALID_URL: 'Enter a valid YouTube channel URL.',
    };
    state.error = messages[error.message] || error.message;
  }
  renderProfileSection({ replace: true });
  document.querySelector('#profile-import')?.scrollIntoView({ block: 'center' });
}

function bind() {
  document.querySelector('[data-profile-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    state.url = document.querySelector('#profile-url')?.value.trim() || '';
    if (state.url) fetchProfile();
  });
  document.querySelector('[data-use-profile]')?.addEventListener('click', () => {
    if (!state.profile) return;
    document.querySelector('[data-action="creator"]')?.click();
    queueMicrotask(() => {
      const name = document.querySelector('[data-field="name"]');
      const handle = document.querySelector('[data-field="creator"]');
      const tagline = document.querySelector('[data-field="tagline"]');
      if (name) {
        name.value = state.profile.title.slice(0, 28);
        name.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (handle) {
        handle.value = state.profile.customUrl || state.profile.title;
        handle.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (tagline) {
        tagline.value = state.profile.description.slice(0, 90);
        tagline.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
}

const observer = new MutationObserver(() => {
  if (!document.querySelector('#profile-import')) queueMicrotask(() => renderProfileSection());
});
observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
renderProfileSection();
