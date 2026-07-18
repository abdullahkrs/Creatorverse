import { applyLocale, getLocale, setLocale } from './i18n.js';
import './multilingual.css';

function renderLanguageControl() {
  const host = document.querySelector('.nav-actions');
  if (!host) return;

  let control = host.querySelector('.language-control');
  if (!control) {
    control = document.createElement('div');
    control.className = 'language-control';
    control.setAttribute('aria-label', 'Language');
    control.innerHTML = `
      <button type="button" data-locale="en">EN</button>
      <button type="button" data-locale="ar">العربية</button>
    `;
    host.prepend(control);

    control.addEventListener('click', event => {
      const button = event.target.closest('[data-locale]');
      if (!button || button.dataset.locale === getLocale()) return;
      setLocale(button.dataset.locale);
      window.location.reload();
    });
  }
  updateSelectedLanguage();
}

function updateSelectedLanguage() {
  document.querySelectorAll('[data-locale]').forEach(button => {
    const selected = button.dataset.locale === getLocale();
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

let applying = false;
function localizeApplication() {
  if (applying) return;
  applying = true;
  renderLanguageControl();
  applyLocale(document);
  updateSelectedLanguage();
  applying = false;
}

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(() => queueMicrotask(localizeApplication));
  observer.observe(app, { childList: true, subtree: true });
}

localizeApplication();
