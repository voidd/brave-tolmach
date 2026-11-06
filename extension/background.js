import { LANGUAGES, loadPair } from './languages.js';
import { translate } from './translate.js';

async function buildMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'translate', title: 'Tolmach', contexts: ['selection'] });
}

async function translateText(text, { from, to }) {
  try {
    const result = await translate(text, from, to);
    return { text: result.text, detected: result.from };
  } catch (error) {
    return { error: error.message };
  }
}

async function handleMenuClick(info, tab) {
  const pair = await loadPair();
  const bubble = {
    source: info.selectionText,
    pair,
    languages: LANGUAGES,
    result: await translateText(info.selectionText, pair),
  };

  try {
    const target = { tabId: tab.id, frameIds: [info.frameId ?? 0] };
    await chrome.scripting.executeScript({ target, files: ['bubble.js'] });
    await chrome.scripting.executeScript({
      target,
      // Stryker disable next-line all: serialized into the page, so it cannot be instrumented.
      func: (bubble) => showBubble(bubble),
      args: [bubble],
    });
  } catch {
    // Pages an extension cannot script: PDF viewer, Web Store, cross-origin frames.
    await chrome.windows.create({
      url: chrome.runtime.getURL(`result.html?${new URLSearchParams({ bubble: JSON.stringify(bubble) })}`),
      type: 'popup',
      width: 460,
      height: 320,
    });
  }
}

chrome.runtime.onInstalled.addListener(buildMenu);
chrome.contextMenus.onClicked.addListener(handleMenuClick);
chrome.runtime.onMessage.addListener(({ text, pair }, _sender, sendResponse) => {
  chrome.storage.sync.set({ pair });
  translateText(text, pair).then(sendResponse);
  return true;
});
