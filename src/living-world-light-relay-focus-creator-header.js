import { getLocale } from './i18n.js';
import { getLivingWorldLightRelayCopy } from './living-world-light-relay-i18n.js';

const app = document.querySelector('#app');

function splitCreatorIdentity(identity) {
  const [name = '', ...realmParts] = String(identity ?? '').split(/\s*·\s*/u);
  return {
    name: name.trim(),
    realm: realmParts.join(' · ').trim(),
  };
}

function enhanceCreatorIdentity() {
  const root = app?.querySelector('[data-living-light-relay][data-route="relay"]');
  const label = root?.querySelector('.chapter-creator > span');
  if (!root || !label) return;

  const fullIdentity = getLivingWorldLightRelayCopy(getLocale()).creator.realm;
  if (label.dataset.creatorIdentity === fullIdentity) return;

  const { name, realm } = splitCreatorIdentity(fullIdentity);
  const nameNode = document.createElement('span');
  nameNode.className = 'chapter-creator-name';
  nameNode.textContent = name;

  label.className = 'chapter-creator-label';
  label.dataset.creatorIdentity = fullIdentity;
  label.replaceChildren(nameNode);

  if (realm) {
    const realmNode = document.createElement('span');
    realmNode.className = 'chapter-creator-realm';
    realmNode.textContent = ` · ${realm}`;
    label.append(realmNode);
  }
}

const observer = new MutationObserver(enhanceCreatorIdentity);
if (app) observer.observe(app, { childList: true, subtree: true });
enhanceCreatorIdentity();
