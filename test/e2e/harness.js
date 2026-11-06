import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const EXTENSION_DIR = fileURLToPath(new URL('../../extension', import.meta.url));

export const SITE = 'https://site.test/';
export const VIEWPORT = { width: 900, height: 600 };

// Inline style attributes are blocked by this CSP, so tests size elements from script.
const PAGE = `<!doctype html>
<title>Test page</title>
<p id="intro">Hello world, this is some selected text.</p>
<textarea id="box">inside textarea</textarea>
<div id="spacer"></div>
<p id="far">far down the page</p>`;

// Prepended, so it runs before background.js registers its listeners. Playwright
// cannot open a native context menu, so tests call the registered listener directly.
const TEST_HOOK = `
globalThis.__test = { click: null, menu: [], menuErrors: [] };
chrome.contextMenus.onClicked.addListener = (listener) => { __test.click = listener; };
const realCreate = chrome.contextMenus.create.bind(chrome.contextMenus);
const realRemoveAll = chrome.contextMenus.removeAll.bind(chrome.contextMenus);
chrome.contextMenus.create = (properties) => realCreate(properties, () => {
  if (chrome.runtime.lastError) __test.menuErrors.push(chrome.runtime.lastError.message);
  else __test.menu.push(properties);
});
chrome.contextMenus.removeAll = () => { __test.menu = []; return realRemoveAll(); };
`;

function prepareExtension({ canScriptPages }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tolmach-e2e-'));
  fs.cpSync(EXTENSION_DIR, dir, { recursive: true });

  // Stryker selects a mutant through process.env, which the browser does not have.
  const activeMutant = process.env.__STRYKER_ACTIVE_MUTANT__;
  if (activeMutant) {
    const env = JSON.stringify({ __STRYKER_ACTIVE_MUTANT__: activeMutant });
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.js'))) {
      const script = path.join(dir, file);
      fs.writeFileSync(script, `globalThis.process = { env: ${env} };\n${fs.readFileSync(script, 'utf8')}`);
    }
  }

  const background = path.join(dir, 'background.js');
  fs.writeFileSync(background, TEST_HOOK + fs.readFileSync(background, 'utf8'));

  if (canScriptPages) {
    // Stands in for the activeTab grant that a real right-click gives.
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.host_permissions.push('<all_urls>');
    manifest.permissions.push('webNavigation');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  }
  return dir;
}

export async function launch({ canScriptPages }) {
  const extensionDir = prepareExtension({ canScriptPages });
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: VIEWPORT,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-proxy-server',
    ],
  });
  context.setDefaultTimeout(5000);
  await context.route(`${SITE}**`, (route) => route.fulfill({
    contentType: 'text/html',
    headers: { 'Content-Security-Policy': "default-src 'none'; frame-src https://site.test" },
    body: PAGE,
  }));

  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  return {
    context,
    worker,
    extensionId: new URL(worker.url()).host,
    async close() {
      await context.close();
      fs.rmSync(extensionDir, { recursive: true, force: true });
    },
  };
}

export function stubTranslation(worker, { status = 200, body }) {
  return worker.evaluate(([status, body]) => {
    __test.requests = [];
    globalThis.fetch = async (url, options) => {
      __test.requests.push({ url: String(url), text: options.body.get('q') });
      return new Response(body, { status });
    };
  }, [status, body]);
}

export function clickMenuItem(worker, page, { id = 'translate', text = 'Hello', frameId } = {}) {
  return worker.evaluate(async ([id, text, url, frameId]) => {
    const [tab] = await chrome.tabs.query({ url });
    await __test.click({ menuItemId: id, selectionText: text, frameId }, tab);
  }, [id, text, page.url(), frameId]);
}

export function selectElement(page, id) {
  return page.evaluate((id) => {
    const element = document.getElementById(id);
    const range = document.createRange();
    range.selectNodeContents(element);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    element.scrollIntoView({ block: 'end' });
  }, id);
}

export function readBubble(target) {
  return target.evaluate(() => {
    const host = document.getElementById('tolmach-bubble');
    if (!host) return null;
    const bubble = host.shadowRoot.querySelector('.bubble');
    const body = host.shadowRoot.querySelector('p');
    const { top, bottom, left, right } = bubble.getBoundingClientRect();
    return {
      text: body.textContent,
      from: host.shadowRoot.querySelector('[aria-label=From]').value,
      to: host.shadowRoot.querySelector('[aria-label=To]').value,
      autoLabel: host.shadowRoot.querySelector('option[value=auto]').text,
      arrow: host.shadowRoot.querySelector('header span').textContent,
      direction: body.dir,
      isError: body.classList.contains('error'),
      background: getComputedStyle(bubble).backgroundColor,
      top,
      bottom,
      left,
      right,
    };
  });
}

export function translationBody(text = 'Привет, мир', detected = 'en') {
  return JSON.stringify([[[text, 'Hello', null]], null, detected]);
}
