import './styles.css';

const realm = {
  name: 'Nova Guild',
  creator: '@creator',
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

function render() {
  document.querySelector('#app').innerHTML = `
    <main>
      <nav class="nav shell">
        <a class="brand" href="#" aria-label="Creatorverse home">
          <span class="brand-mark">C</span>
          <span>Creatorverse</span>
        </a>
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

        <article class="realm-card">
          <div class="realm-orbit"><span></span><span></span><span></span></div>
          <div class="realm-heading">
            <div>
              <p class="muted">Featured creator realm</p>
              <h2>${realm.name}</h2>
              <p>${realm.creator}</p>
            </div>
            <div class="level">LVL 08</div>
          </div>
          <div class="stats">
            <div><strong>${realm.members.toLocaleString()}</strong><span>members</span></div>
            <div><strong>14</strong><span>districts</span></div>
            <div><strong>6 days</strong><span>streak</span></div>
          </div>
          <div class="progress-label"><span>Unlock ${realm.district}</span><strong>${realm.energy}/${realm.target}</strong></div>
          <div class="progress"><span style="width:${realm.energy}%"></span></div>
        </article>
      </section>

      <section class="loop shell" id="join">
        <header class="section-heading">
          <p class="eyebrow">The first playable loop</p>
          <h2>Choose your role. Help the realm grow.</h2>
        </header>
        <div class="role-grid">
          ${roles.map(role => `
            <button class="role-card ${selectedRole === role.id ? 'selected' : ''}" data-role="${role.id}">
              <span class="role-icon">${role.icon}</span>
              <strong>${role.title}</strong>
              <span>${role.description}</span>
            </button>
          `).join('')}
        </div>

        <article class="mission ${selectedRole ? 'active' : ''}">
          <div>
            <p class="eyebrow">Creator mission · 35 seconds</p>
            <h3>Power the Signal Harbor</h3>
            <p>${selectedRole ? `As a ${roles.find(role => role.id === selectedRole).title}, choose the next energy route for the community.` : 'Select a role to unlock today’s mission.'}</p>
          </div>
          <div class="mission-actions">
            <button class="route" ${!selectedRole || missionCompleted ? 'disabled' : ''} data-route="sky">Sky route</button>
            <button class="route" ${!selectedRole || missionCompleted ? 'disabled' : ''} data-route="ocean">Ocean route</button>
          </div>
          <div class="mission-result" aria-live="polite">
            ${missionCompleted ? '<strong>Mission complete.</strong> Your action added 3 realm energy and will appear in the creator’s share card.' : ''}
          </div>
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

function bindEvents() {
  document.querySelector('[data-action="join"]')?.addEventListener('click', () => {
    document.querySelector('#join')?.scrollIntoView({ behavior: 'smooth' });
  });

  document.querySelector('[data-action="creator"]')?.addEventListener('click', () => {
    window.alert('Creator onboarding is the next MVP slice.');
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
