function synchronizeQuarantineRegionLabel() {
  const experience = document.querySelector('.experience');
  if (!experience) return;

  const quarantineHeading = experience.querySelector('#realm-quarantine-state-title');
  if (quarantineHeading) {
    experience.setAttribute('aria-labelledby', quarantineHeading.id);
    return;
  }

  if (experience.querySelector('#experience-title')) {
    experience.setAttribute('aria-labelledby', 'experience-title');
  }
}

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(() => queueMicrotask(synchronizeQuarantineRegionLabel));
  observer.observe(app, { childList: true, subtree: true });
}

synchronizeQuarantineRegionLabel();
