import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { launch } from './harness.js';

describe('menu and options', () => {
  let browser;
  let options;

  const menu = () => browser.worker.evaluate(() => __test.menu);

  function waitForStored(expected) {
    return browser.worker.evaluate(async (expected) => {
      const stored = async () => JSON.stringify((await chrome.storage.sync.get('pair')).pair);
      while (await stored() !== JSON.stringify(expected)) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }, expected);
  }

  before(async () => {
    browser = await launch({ canScriptPages: true });
    options = await browser.context.newPage();
  });
  after(() => browser.close());

  beforeEach(async () => {
    await browser.worker.evaluate(() => chrome.storage.sync.clear());
    await options.goto(`chrome-extension://${browser.extensionId}/options.html`);
  });

  test('the menu has a single Tolmach item for selections', async () => {
    assert.deepEqual(await menu(), [{ id: 'translate', title: 'Tolmach', contexts: ['selection'] }]);
    assert.deepEqual(await browser.worker.evaluate(() => __test.menuErrors), []);
  });

  test('the options page shows the default pair', async () => {
    assert.equal(await options.getByLabel('From').inputValue(), 'en');
    assert.equal(await options.getByLabel('To').inputValue(), 'ru');
  });

  test('only the source list offers language detection', async () => {
    assert.equal(await options.locator('#from option[value=auto]').textContent(), 'Detect language');
    assert.equal(await options.locator('#to option[value=auto]').count(), 0);
  });

  test('changing the target is saved and survives a reload', async () => {
    await options.getByLabel('To').selectOption('zh-CN');

    await waitForStored({ from: 'en', to: 'zh-CN' });
    await options.reload();
    assert.equal(await options.getByLabel('To').inputValue(), 'zh-CN');
  });

  test('changing the source is saved', async () => {
    await options.getByLabel('From').selectOption('auto');

    await waitForStored({ from: 'auto', to: 'ru' });
  });

  test('the menu stays Tolmach after the pair changes', async () => {
    await options.getByLabel('To').selectOption('fr');

    await waitForStored({ from: 'en', to: 'fr' });
    assert.equal((await menu())[0].title, 'Tolmach');
  });
});
