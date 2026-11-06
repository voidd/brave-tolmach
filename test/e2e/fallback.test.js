import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { SITE, clickMenuItem, launch, readBubble, stubTranslation, translationBody } from './harness.js';

describe('pages the extension cannot script', () => {
  let browser;
  let page;

  async function clickAndWaitForWindow() {
    const opened = browser.context.waitForEvent('page');
    await clickMenuItem(browser.worker, page);
    const result = await opened;
    await result.waitForLoadState();
    return result;
  }

  before(async () => {
    browser = await launch({ canScriptPages: false });
    page = await browser.context.newPage();
    await page.goto(SITE);
  });
  after(() => browser.close());

  beforeEach(() => browser.worker.evaluate(() => chrome.storage.sync.clear()));

  test('shows the translation in a separate window', async () => {
    await stubTranslation(browser.worker, { body: translationBody() });

    const result = await clickAndWaitForWindow();

    const bubble = await readBubble(result);
    assert.equal(bubble.text, 'Привет, мир');
    assert.equal(bubble.from, 'en');
    assert.equal(bubble.to, 'ru');
    assert.equal(bubble.isError, false);
    const windows = await browser.worker.evaluate(() => chrome.windows.getAll());
    assert.ok(windows.some(({ type }) => type === 'popup'));
  });

  test('shows a failure as an error in that window', async () => {
    await stubTranslation(browser.worker, { status: 500, body: '' });

    const result = await clickAndWaitForWindow();

    const bubble = await readBubble(result);
    assert.match(bubble.text, /HTTP 500/);
    assert.equal(bubble.isError, true);
  });

  test('can change the language there too', async () => {
    await stubTranslation(browser.worker, { body: translationBody() });
    const result = await clickAndWaitForWindow();
    await stubTranslation(browser.worker, { body: translationBody('Bonjour') });

    await result.getByLabel('To').selectOption('fr');

    await result.waitForFunction(
      () => document.getElementById('tolmach-bubble').shadowRoot.querySelector('p').textContent === 'Bonjour',
    );
  });

  test('closing the bubble closes the window', async () => {
    await stubTranslation(browser.worker, { body: translationBody() });
    const result = await clickAndWaitForWindow();

    const closed = result.waitForEvent('close');
    await result.getByRole('button', { name: 'Close' }).click();
    await closed;
  });
});
