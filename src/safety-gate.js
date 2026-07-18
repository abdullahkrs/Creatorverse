const messages = Object.freeze({
  en: 'Confirm the fictional-world safety acknowledgement before launching the preview.',
  ar: 'أكد إقرار الأمان الخاص بالعالم الخيالي قبل إطلاق المعاينة.',
});

export function isSafetyAcknowledged(control) {
  return control?.checked === true;
}

export function getSafetyAcknowledgementError(locale = 'en') {
  return String(locale).toLowerCase().startsWith('ar') ? messages.ar : messages.en;
}

export function installSafetyGate(root = document) {
  root.addEventListener('click', event => {
    const launchButton = event.target.closest?.('[data-action="creator-next"]');
    if (!launchButton) return;

    const acknowledgement = root.querySelector('[data-field="safety"]');
    if (!acknowledgement || isSafetyAcknowledged(acknowledgement)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const message = root.querySelector('.creator-studio .form-message');
    acknowledgement.setAttribute('aria-invalid', 'true');

    if (message) {
      if (!message.id) message.id = 'onboarding-safety-error';
      message.setAttribute('aria-live', 'assertive');
      message.textContent = getSafetyAcknowledgementError(document.documentElement.lang);
      acknowledgement.setAttribute('aria-describedby', message.id);
    }

    acknowledgement.focus();
  }, true);

  root.addEventListener('change', event => {
    const acknowledgement = event.target.closest?.('[data-field="safety"]');
    if (!acknowledgement || !isSafetyAcknowledged(acknowledgement)) return;

    acknowledgement.removeAttribute('aria-invalid');
    const message = root.querySelector('.creator-studio .form-message');
    if (message) message.textContent = '';
  });
}

if (typeof document !== 'undefined') installSafetyGate(document);
