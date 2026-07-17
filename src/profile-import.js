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

function template() {
  const profile = state.profile;
  return `
    <section class="profile-import shell" id="profile-import">
      <header class="section-heading profile-heading">
        <div>
          <p class="eyebrow">Creator profile connection</p>
          <h2>Build your realm from a real creator profile.</h2>
          <p>Import public YouTube channel identity and statistics. TikTok, X, and Instagram profiles will require the creator to connect their own account through official authorization.</p>
        </div>
        <div class="profile-support"><span>YouTube · available</span><span class="planned">TikTok · OAuth</span><span class="planned">X · OAuth</span><span class="planned">Instagram · OAuth</span></div>
      </header>
      <div class="profile-grid">
        <form class="profile-form" data-profile-form>
          <label for="profile-url">YouTube channel URL</label>
          <div class="profile-url-row">
            <input id="profile-url" type="url" inputmode="url" autocomplete="url" maxlength="2048" value="${escapeHtml(state.url)}" placeholder="https://www.youtube.com/@creator" required>
            <button class="primary" type="submit" ${state.status === 'loading' ? 'disabled' : ''}>${state.status === 'loading' ? 'Fetching…' : 'Fetch profile'}</button>
          </div>
          <p class="social-note">This uses the official YouTube Data API. Add <code>YOUTUBE_API_KEY</code> to Railway Variables to enable it.</p>
          <p class="form-message" aria-live="polite">${escapeHtml(state.error)}</p>
        </form>
        <article class="profile-card ${profile ? 'has-profile' : ''}">
          ${profile ? `
            <img src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.title)} profile image" loading="lazy">
            <div class="profile-copy">
              <p class="eyebrow">${escapeHtml(profile.providerLabel)}</p>
              <h3>${escapeHtml(profile.title)}</h3>
              <p class="profile-description">${escapeHtml(profile.description || 'Public creator profile')}</p>
              <div class="profile-stats">
                <div><strong>${compactNumber(profile.subscriberCount)}</strong><span>subscribers</span></div>
                <div><strong>${compactNumber(profile.videoCount)}</strong><span>videos</span></div>
                <div><strong>${compactNumber(profile.viewCount)}</strong><span>views</span></div>
              </div>
              <div class="social-actions">
                <a class="secondary link-button" href="${escapeHtml(profile.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open profile</a>
                <button class="primary" type="button" data-use-profile>Use for realm</button>
              </div>
            </div>
          ` : `
            <div class="profile-empty"><span>◎</span><h3>Creator profile preview</h3><p>Public identity and statistics will appear here after a successful lookup.</p></div>
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
