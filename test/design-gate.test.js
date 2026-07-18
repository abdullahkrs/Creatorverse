import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const multilingual = readFileSync(new URL('../src/multilingual.css', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/profile-import.js', import.meta.url), 'utf8');
const profileStyles = readFileSync(new URL('../src/profile-import.css', import.meta.url), 'utf8');
const resultView = readFileSync(new URL('../src/mission-result-view.js', import.meta.url), 'utf8');
const resultStyles = readFileSync(new URL('../src/mission-result.css', import.meta.url), 'utf8');
const resultCopy = readFileSync(new URL('../src/mission-result-i18n.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const allCss = `${styles}\n${multilingual}\n${profileStyles}\n${resultStyles}`;
const allVisibleSource = `${main}\n${profile}\n${resultView}\n${resultCopy}`;

test('professional visual gate removes rejected template effects and placeholder symbols', () => {
  assert.doesNotMatch(allCss, /gradient|box-shadow|backdrop-filter/i);
  assert.doesNotMatch(allVisibleSource, /[✦◇⬡◆◈↗◎]/u);
  assert.doesNotMatch(main, /class="principles|<section class="hero/);
  assert.doesNotMatch(styles, /6\.6rem|3\.35rem|min-height:\s*640px|min-height:\s*430px/i);
});

test('the primary playable loop precedes optional creator tools', () => {
  const loopIndex = main.indexOf('id="join"');
  const toolsIndex = main.indexOf('class="creator-tools shell"');
  assert.ok(loopIndex >= 0, 'primary loop must exist');
  assert.ok(toolsIndex > loopIndex, 'optional tools must follow the loop');
  assert.match(main, /<svg class="signal-map"/);
  assert.match(main, /<svg class="cv-icon/);
});

test('mobile, touch, RTL, and mixed-direction gates are explicit', () => {
  assert.match(styles, /min-block-size:\s*var\(--cv-target-min\)/);
  assert.match(multilingual, /min-block-size:\s*var\(--cv-target-min\)/);
  assert.match(`${multilingual}\n${profileStyles}`, /unicode-bidi:\s*plaintext/);
  assert.match(styles, /html\[dir="rtl"\] \.experience-grid\s*\{\s*grid-template-areas:\s*"realm play"/);
  assert.match(multilingual, /html\[dir="rtl"\] \.mission-actions/);
});

test('mission completion renders one semantic field receipt and one share-or-copy action', () => {
  assert.match(index, /mission-result\.css/);
  assert.match(index, /mission-result-view\.js/);
  assert.match(resultView, /<section class="signal-result"/);
  assert.match(resultView, /<dl class="signal-result-facts"/);
  assert.match(resultView, /const RESULT_ACTION = 'mission-result-action'/);
  assert.match(resultView, /navigatorLike:\s*navigator/);
  assert.match(resultView, /heading\?\.focus/);
  assert.match(resultStyles, /min-block-size:\s*var\(--cv-target-min\)/);
  assert.match(resultStyles, /@media \(min-width: 40rem\)/);
  assert.match(resultStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(resultStyles, /direction:\s*ltr/);
  assert.match(resultCopy, /Signal strengthened/);
  assert.match(resultCopy, /تم تعزيز الإشارة/);
});
