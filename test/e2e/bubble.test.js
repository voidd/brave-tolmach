import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  SITE, VIEWPORT, clickMenuItem, launch, readBubble, selectElement, stubTranslation, translationBody,
} from './harness.js';

describe('translation bubble', () => {
  let browser;
  let page;

  function waitForBubbleText(text) {
    return page.waitForFunction(
      (text) => document.getElementById('tolmach-bubble').shadowRoot.querySelector('p').textContent === text,
      text,
    );
  }

  before(async () => {
    browser = await launch({ canScriptPages: true });
    page = await browser.context.newPage();
  });
  after(() => browser.close());

  beforeEach(async () => {
    await browser.worker.evaluate(() => chrome.storage.sync.clear());
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(SITE);
    await stubTranslation(browser.worker, { body: translationBody() });
    await selectElement(page, 'intro');
  });

  test('shows the translation and languages under the selection', async () => {
    await clickMenuItem(browser.worker, page);

    const bubble = await readBubble(page);
    const selection = await page.evaluate(() => getSelection().getRangeAt(0).getBoundingClientRect().toJSON());
    assert.equal(bubble.text, 'Привет, мир');
    assert.equal(bubble.from, 'en');
    assert.equal(bubble.to, 'ru');
    assert.equal(bubble.direction, 'auto');
    assert.equal(bubble.isError, false);
    assert.equal(bubble.top, selection.bottom + 8);
    assert.equal(bubble.left, selection.left);
  });

  test('sends the selected text with the saved pair', async () => {
    await browser.worker.evaluate(() => chrome.storage.sync.set({ pair: { from: 'de', to: 'zh-CN' } }));

    await clickMenuItem(browser.worker, page, { text: 'Guten Tag' });

    const [request] = await browser.worker.evaluate(() => __test.requests);
    assert.equal(request.text, 'Guten Tag');
    assert.match(request.url, /sl=de&tl=zh-CN/);
  });

  test('is styled despite a strict page CSP', async () => {
    await clickMenuItem(browser.worker, page);
    assert.equal((await readBubble(page)).background, 'rgb(255, 255, 255)');
  });

  test('follows the dark colour scheme', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await clickMenuItem(browser.worker, page);
    assert.equal((await readBubble(page)).background, 'rgb(44, 44, 46)');
  });

  test('renders translated markup as text', async () => {
    const markup = '<img src=x onerror=alert(1)>';
    await stubTranslation(browser.worker, { body: translationBody(markup) });

    await clickMenuItem(browser.worker, page);

    assert.equal((await readBubble(page)).text, markup);
    const images = await page.evaluate(
      () => document.getElementById('tolmach-bubble').shadowRoot.querySelectorAll('img').length,
    );
    assert.equal(images, 0);
  });

  test('shows a service failure as an error', async () => {
    await stubTranslation(browser.worker, { status: 429, body: 'Sorry' });

    await clickMenuItem(browser.worker, page);

    const bubble = await readBubble(page);
    assert.match(bubble.text, /rate limiting/);
    assert.equal(bubble.isError, true);
  });

  test('changing a language translates again and remembers the pair', async () => {
    await clickMenuItem(browser.worker, page, { text: 'Hello' });
    await stubTranslation(browser.worker, { body: translationBody('Bonjour') });

    await page.getByLabel('To').selectOption('fr');

    await waitForBubbleText('Bonjour');
    const [request] = await browser.worker.evaluate(() => __test.requests);
    assert.equal(request.text, 'Hello');
    assert.match(request.url, /sl=en&tl=fr/);
    const { pair } = await browser.worker.evaluate(() => chrome.storage.sync.get('pair'));
    assert.deepEqual(pair, { from: 'en', to: 'fr' });
  });

  test('changing the source language translates again', async () => {
    await clickMenuItem(browser.worker, page);
    await stubTranslation(browser.worker, { body: translationBody('Hallo', 'de') });

    await page.getByLabel('From').selectOption('auto');

    await waitForBubbleText('Hallo');
    assert.equal((await readBubble(page)).autoLabel, 'Detected: German');
    assert.match((await browser.worker.evaluate(() => __test.requests))[0].url, /sl=auto&tl=ru/);
  });

  test('the next translation uses the pair chosen in the bubble', async () => {
    await clickMenuItem(browser.worker, page);
    await page.getByLabel('To').selectOption('fr');
    await waitForBubbleText('Привет, мир');
    await page.keyboard.press('Escape');

    await clickMenuItem(browser.worker, page);

    assert.equal((await readBubble(page)).to, 'fr');
  });

  test('shows progress while translating again', async () => {
    await clickMenuItem(browser.worker, page);
    await browser.worker.evaluate(() => {
      globalThis.fetch = () => new Promise(() => {});
    });

    await page.getByLabel('To').selectOption('fr');

    await waitForBubbleText('Translating…');
  });

  test('shows a failure when translating again', async () => {
    await clickMenuItem(browser.worker, page);
    await stubTranslation(browser.worker, { status: 500, body: '' });

    await page.getByLabel('To').selectOption('fr');

    await waitForBubbleText('The translation service returned HTTP 500.');
    assert.equal((await readBubble(page)).isError, true);
  });

  test('a slow earlier answer does not replace a newer one', async () => {
    await clickMenuItem(browser.worker, page);
    await browser.worker.evaluate(() => {
      globalThis.fetch = async (url) => {
        const slow = String(url).includes('tl=de');
        await new Promise((resolve) => setTimeout(resolve, slow ? 300 : 0));
        return Response.json([[[slow ? 'slow' : 'fast', 'x']], null, 'en']);
      };
    });

    await page.getByLabel('To').selectOption('de');
    await page.getByLabel('To').selectOption('fr');
    await waitForBubbleText('fast');
    await page.waitForTimeout(400);

    assert.equal((await readBubble(page)).text, 'fast');
  });

  test('keeps its place when a longer translation arrives after the selection is cleared', async () => {
    await clickMenuItem(browser.worker, page);
    const { top, left } = await readBubble(page);
    await stubTranslation(browser.worker, { body: translationBody('слово '.repeat(40)) });
    await page.evaluate(() => getSelection().removeAllRanges());

    await page.getByLabel('To').selectOption('fr');

    await waitForBubbleText('слово '.repeat(40));
    const bubble = await readBubble(page);
    assert.equal(bubble.top, top);
    assert.equal(bubble.left, left);
  });

  test('replaces an open bubble', async () => {
    await clickMenuItem(browser.worker, page);
    await clickMenuItem(browser.worker, page);
    assert.equal(await page.locator('#tolmach-bubble').count(), 1);
  });

  test('closes on Escape but not on other keys', async () => {
    await clickMenuItem(browser.worker, page);
    await page.keyboard.press('a');
    assert.ok(await readBubble(page));
    await page.keyboard.press('Escape');
    assert.equal(await readBubble(page), null);
  });

  test('closes on a click outside but not on one inside', async () => {
    await clickMenuItem(browser.worker, page);
    const { left, top } = await readBubble(page);
    await page.mouse.click(left + 15, top + 35);
    assert.ok(await readBubble(page));
    await page.mouse.click(VIEWPORT.width - 10, VIEWPORT.height - 10);
    assert.equal(await readBubble(page), null);
  });

  test('closes from the close button', async () => {
    await clickMenuItem(browser.worker, page);
    await page.getByRole('button', { name: 'Close' }).click();
    assert.equal(await readBubble(page), null);
  });

  test('anchors to a textarea holding the selection', async () => {
    await page.evaluate(() => {
      const box = document.getElementById('box');
      box.focus();
      box.select();
    });

    await clickMenuItem(browser.worker, page);

    const bubble = await readBubble(page);
    const box = await page.locator('#box').boundingBox();
    assert.equal(bubble.top, box.y + box.height + 8);
    assert.equal(bubble.left, box.x);
  });

  test('flips above a selection at the bottom of the viewport', async () => {
    await page.evaluate(() => { document.getElementById('spacer').style.height = '2000px'; });
    await selectElement(page, 'far');

    await clickMenuItem(browser.worker, page);

    const bubble = await readBubble(page);
    const far = await page.locator('#far').boundingBox();
    assert.ok(far.y > VIEWPORT.height / 2, 'selection should be low in the viewport');
    assert.equal(bubble.bottom, far.y - 8);
  });

  // Pins the selection so that exactly `room` pixels remain below it.
  async function leaveRoomBelowSelection(room) {
    await page.evaluate((room) => {
      const intro = document.getElementById('intro');
      intro.style.position = 'fixed';
      intro.style.margin = '0';
      intro.style.top = '0px';
      const { bottom } = getSelection().getRangeAt(0).getBoundingClientRect();
      intro.style.top = `${document.documentElement.clientHeight - room - bottom}px`;
    }, room);
  }

  test('stays below when the bubble fits exactly', async () => {
    await clickMenuItem(browser.worker, page);
    const { top, bottom } = await readBubble(page);
    await page.keyboard.press('Escape');
    await leaveRoomBelowSelection(bottom - top + 16);

    await clickMenuItem(browser.worker, page);

    const selection = await page.evaluate(() => getSelection().getRangeAt(0).getBoundingClientRect().toJSON());
    assert.equal((await readBubble(page)).top, selection.bottom + 8);
  });

  test('flips above rather than covering the selection', async () => {
    await clickMenuItem(browser.worker, page);
    const { top, bottom } = await readBubble(page);
    await page.keyboard.press('Escape');
    await leaveRoomBelowSelection(bottom - top + 12);

    await clickMenuItem(browser.worker, page);

    const selection = await page.evaluate(() => getSelection().getRangeAt(0).getBoundingClientRect().toJSON());
    assert.equal((await readBubble(page)).bottom, selection.top - 8);
  });

  test('stays inside the viewport when the selection is scrolled off screen', async () => {
    await page.evaluate(() => { document.getElementById('spacer').style.height = '2000px'; });
    await selectElement(page, 'far');
    await page.evaluate(() => window.scrollTo(0, 0));

    await clickMenuItem(browser.worker, page);

    const bubble = await readBubble(page);
    assert.equal(bubble.bottom, VIEWPORT.height - 8);
  });

  test('stays inside the viewport near the right edge', async () => {
    await page.evaluate(() => {
      const intro = document.getElementById('intro');
      intro.style.position = 'absolute';
      intro.style.left = `${document.documentElement.clientWidth - 40}px`;
      intro.style.whiteSpace = 'nowrap';
      intro.style.overflow = 'hidden';
      intro.style.width = '30px';
    });
    await selectElement(page, 'intro');
    await stubTranslation(browser.worker, { body: translationBody('x'.repeat(300)) });

    await clickMenuItem(browser.worker, page);

    const bubble = await readBubble(page);
    assert.equal(bubble.right, VIEWPORT.width - 8);
    assert.equal(bubble.left, VIEWPORT.width - 8 - 420);
  });

  test('opens inside the frame holding the selection', async () => {
    await page.evaluate((site) => {
      const frame = document.createElement('iframe');
      frame.src = `${site}frame`;
      document.body.append(frame);
      return new Promise((resolve) => { frame.onload = resolve; });
    }, SITE);
    const frame = page.frames()[1];
    await selectElement(frame, 'intro');
    const frameId = await browser.worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      return frames.find((candidate) => candidate.parentFrameId !== -1).frameId;
    }, page.url());

    await clickMenuItem(browser.worker, page, { frameId });

    assert.ok(await readBubble(frame));
    assert.equal(await readBubble(page), null);
  });
});
