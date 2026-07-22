import { getLocale } from './i18n.js';
import { getLivingWorldCopy } from './living-world-i18n.js';
import { buildLivingWorldUrl, eventFromLocation, readLivingWorldState } from './living-world-event.js';
import {
  classifyLivingWorldShareFailure,
  createLivingWorldMediaModel,
  createLivingWorldMediaSharePayload,
  LIVING_WORLD_MEDIA_FILENAME,
  LIVING_WORLD_MEDIA_TYPE,
  renderLivingWorldMedia,
  supportsLivingWorldFileShare,
} from './living-world-media.js';
import { getLivingWorldMediaCopy } from './living-world-media-i18n.js';

const SHARE_SELECTOR = '[data-living-share], [data-result-action="share"]';
let activeShare = false;
let activeDialog = null;
let activeObjectUrl = '';
let returnFocus = null;
let shareSyncQueued = false;

function mediaCopy() {
  return getLivingWorldMediaCopy(getLocale());
}

function statusFor(button) {
  return button
    ?.closest('.living-world-actions, .living-world-result-copy')
    ?.querySelector('[data-living-status]') || document.querySelector('[data-living-status]');
}

function setText(node, value) {
  if (!node) return;
  const next = value || '';
  if (node.textContent !== next) node.textContent = next;
}

function announce(message) {
  setText(document.querySelector('[data-living-announcement]'), message);
}

function setStatus(button, message) {
  setText(statusFor(button), message);
  announce(message);
}

function setButtonState(button, state, label, disabled) {
  if (!button) return;
  if (button.dataset.mediaState !== state) button.dataset.mediaState = state;
  setText(button, label);
  if (button.disabled !== disabled) button.disabled = disabled;
  if (disabled) {
    if (button.getAttribute('aria-busy') !== 'true') button.setAttribute('aria-busy', 'true');
  } else if (button.hasAttribute('aria-busy')) {
    button.removeAttribute('aria-busy');
  }
}

function restoreButton(button, { focus = false } = {}) {
  if (!button?.isConnected) return;
  setButtonState(button, 'idle', mediaCopy().action, false);
  if (focus) button.focus({ preventScroll: true });
}

function syncShareButtons() {
  document.querySelectorAll(SHARE_SELECTOR).forEach(button => {
    if (!button.dataset.mediaState || button.dataset.mediaState === 'idle') {
      setButtonState(button, 'idle', mediaCopy().action, false);
    }
  });
}

function queueShareButtonSync() {
  if (shareSyncQueued) return;
  shareSyncQueued = true;
  queueMicrotask(() => {
    shareSyncQueued = false;
    syncShareButtons();
  });
}

function mutationAddsShareButton(mutation) {
  return [...mutation.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && (
    node.matches?.(SHARE_SELECTOR) || node.querySelector?.(SHARE_SELECTOR)
  ));
}

function currentSnapshot() {
  const route = eventFromLocation(location.hash);
  if (route.status !== 'ready') throw new Error('MEDIA_EVENT_UNAVAILABLE');
  const state = readLivingWorldState(localStorage, route.event);
  if (state.status === 'storage-error') throw new Error('MEDIA_EVENT_UNAVAILABLE');
  const progress = state.progress;
  const model = createLivingWorldMediaModel(route.event, progress, getLocale());
  const baseUrl = `${location.origin}${location.pathname}`;
  const url = buildLivingWorldUrl(route.event, { progress, baseUrl });
  const payload = createLivingWorldMediaSharePayload(model, url);
  return { route, progress, model, url, payload };
}

function closeDialog() {
  if (!activeDialog) return;
  if (activeDialog.open && typeof activeDialog.close === 'function') activeDialog.close();
  else activeDialog.removeAttribute('open');
}

function cleanupDialog() {
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = '';
  activeDialog?.remove();
  activeDialog = null;
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected) target.focus({ preventScroll: true });
}

function element(name, className = '', text = '') {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/png;base64,')) {
        resolve(reader.result);
      } else {
        reject(new Error('MEDIA_PREVIEW_FAILED'));
      }
    }, { once: true });
    reader.addEventListener('error', () => reject(new Error('MEDIA_PREVIEW_FAILED')), { once: true });
    reader.readAsDataURL(blob);
  });
}

function revealManualLink(container, url, copy) {
  if (container.querySelector('[data-living-media-manual]')) return;
  const group = element('div', 'living-world-media-manual');
  group.dataset.livingMediaManual = 'true';
  const label = element('label', '', copy.manual);
  const input = element('input');
  const id = `living-media-url-${Math.random().toString(36).slice(2, 8)}`;
  label.htmlFor = id;
  input.id = id;
  input.type = 'text';
  input.readOnly = true;
  input.value = url;
  input.dir = 'ltr';
  input.autocomplete = 'off';
  group.append(label, input);
  container.append(group);
  input.select();
}

async function copySafeLink({ url, dialog, dialogStatus, hostButton }) {
  const copy = mediaCopy();
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('CLIPBOARD_UNAVAILABLE');
    await navigator.clipboard.writeText(url);
    setText(dialogStatus, copy.copied);
    setText(statusFor(hostButton), getLivingWorldCopy(getLocale()).share.copied);
    return true;
  } catch {
    setText(dialogStatus, copy.manual);
    revealManualLink(dialog.querySelector('[data-living-media-body]'), url, copy);
    return false;
  }
}

async function openFallback({ blob, model, url, hostButton, initialStatus = '' }) {
  closeDialog();
  cleanupDialog();
  const copy = mediaCopy();
  const previewUrl = await blobToDataUrl(blob);
  activeObjectUrl = URL.createObjectURL(blob);
  returnFocus = hostButton;

  const dialog = element('dialog', 'living-world-media-dialog');
  dialog.dataset.livingMediaDialog = 'true';
  dialog.setAttribute('aria-labelledby', 'living-media-title');
  dialog.setAttribute('aria-describedby', 'living-media-description');

  const close = element('button', 'living-world-media-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', copy.close);
  close.addEventListener('click', closeDialog);

  const title = element('h2', '', copy.dialogTitle);
  title.id = 'living-media-title';

  const body = element('div', 'living-world-media-body');
  body.dataset.livingMediaBody = 'true';
  const preview = element('img', 'living-world-media-preview');
  preview.src = previewUrl;
  preview.alt = model.alternative;
  preview.width = model.width;
  preview.height = model.height;
  const description = element('p', 'living-world-media-visually-hidden', model.alternative);
  description.id = 'living-media-description';

  const status = element('p', 'living-world-media-status', initialStatus || copy.previewReady);
  status.dataset.livingMediaStatus = 'true';
  status.setAttribute('aria-live', 'polite');

  const actions = element('div', 'living-world-media-actions');
  const save = element('a', 'living-world-primary', copy.save);
  save.href = activeObjectUrl;
  save.download = LIVING_WORLD_MEDIA_FILENAME;
  save.dataset.livingMediaSave = 'true';
  save.addEventListener('click', () => setText(status, copy.saved));

  const copyButton = element('button', 'living-world-secondary', copy.copy);
  copyButton.type = 'button';
  copyButton.dataset.livingMediaCopy = 'true';
  copyButton.addEventListener('click', () => copySafeLink({ url, dialog, dialogStatus: status, hostButton }));

  actions.append(save, copyButton);
  body.append(preview, description, status, actions);
  dialog.append(close, title, body);
  document.body.append(dialog);
  activeDialog = dialog;

  dialog.addEventListener('close', cleanupDialog, { once: true });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });

  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  restoreButton(hostButton);
  save.focus({ preventScroll: true });
}

async function handleMediaShare(button) {
  if (activeShare) return;
  activeShare = true;
  const copy = mediaCopy();
  setButtonState(button, 'generating', copy.generating, true);
  setStatus(button, copy.generating);

  try {
    const snapshot = currentSnapshot();
    if (globalThis.__CREATORVERSE_MEDIA_FORCE_ERROR__ === true) throw new Error('CONTROLLED_MEDIA_FAILURE');
    const rendered = await renderLivingWorldMedia(snapshot.model);
    if (rendered.width !== 1080 || rendered.height !== 1920 || rendered.blob.type !== LIVING_WORLD_MEDIA_TYPE) {
      throw new Error('INVALID_MEDIA_ARTIFACT');
    }
    const file = new File([rendered.blob], snapshot.model.filename, { type: LIVING_WORLD_MEDIA_TYPE });

    if (supportsLivingWorldFileShare(navigator, file)) {
      setButtonState(button, 'native-sharing', copy.sharing, true);
      setStatus(button, copy.sharing);
      try {
        await navigator.share({
          files: [file],
          title: snapshot.payload.title,
          text: snapshot.payload.text,
          url: snapshot.payload.url,
        });
        setStatus(button, copy.shared);
        restoreButton(button, { focus: true });
      } catch (error) {
        const failure = classifyLivingWorldShareFailure(error);
        if (failure === 'cancelled') {
          setStatus(button, '');
          restoreButton(button, { focus: true });
        } else {
          await openFallback({
            blob: rendered.blob,
            model: snapshot.model,
            url: snapshot.url,
            hostButton: button,
            initialStatus: copy.shareUnavailable,
          });
        }
      }
    } else {
      await openFallback({
        blob: rendered.blob,
        model: snapshot.model,
        url: snapshot.url,
        hostButton: button,
      });
    }
  } catch {
    setButtonState(button, 'generation-error', copy.retry, false);
    setStatus(button, copy.generationError);
    button.focus({ preventScroll: true });
  } finally {
    activeShare = false;
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest?.(SHARE_SELECTOR);
  if (!button || !button.closest('[data-living-world]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handleMediaShare(button);
}, true);

window.addEventListener('hashchange', () => {
  closeDialog();
  queueShareButtonSync();
});

const observer = new MutationObserver(mutations => {
  if (mutations.some(mutationAddsShareButton)) queueShareButtonSync();
});
observer.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true });
queueShareButtonSync();
