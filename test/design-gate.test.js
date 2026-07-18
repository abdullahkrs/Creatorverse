import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const multilingual = readFileSync(new URL('../src/multilingual.css', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/profile-import.js', import.meta.url), 'utf8');
const profileStyles = readFileSync(new URL('../src/profile-import.css', import.meta.url), 'utf8');
const allCss = `${styles}\n${multilingual}\n${profileStyles}`;
const allVisibleSource = `${main}\n${profile}`;

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
