import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PAIR, LANGUAGES } from '../../extension/languages.js';

test('translates English to Russian by default', () => {
  assert.deepEqual(DEFAULT_PAIR, { from: 'en', to: 'ru' });
});

test('language names match the standard English names', () => {
  const standard = new Intl.DisplayNames(['en'], { type: 'language' });
  const { 'zh-CN': simplified, 'zh-TW': traditional, ...others } = LANGUAGES;

  assert.equal(simplified, 'Chinese (Simplified)');
  assert.equal(traditional, 'Chinese (Traditional)');
  for (const [code, name] of Object.entries(others)) {
    assert.equal(name, standard.of(code));
  }
});
