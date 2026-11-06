// Injected as a classic script, so showBubble becomes a global of the extension's world.
function showBubble({ source, pair, languages, result, onClose }) {
  const HOST_ID = 'tolmach-bubble';
  const MARGIN = 8;
  const AUTO = 'auto';
  const AUTO_LABEL = 'Detect language';

  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0;';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { color-scheme: light dark; }
    .bubble {
      box-sizing: border-box;
      width: max-content;
      max-width: min(420px, calc(100vw - 16px));
      max-height: min(320px, calc(100vh - 16px));
      overflow: auto;
      padding: 10px 12px;
      border-radius: 8px;
      background: #fff;
      color: #1c1c1e;
      font: 14px/1.45 system-ui, sans-serif;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      color: #6e6e73;
      font-size: 12px;
    }
    select {
      min-width: 0;
      max-width: 150px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    button {
      all: unset;
      cursor: pointer;
      margin-left: auto;
      padding: 0 4px;
      font-size: 16px;
      line-height: 1;
    }
    button:focus-visible, select:focus-visible { outline: 2px solid currentColor; }
    p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .error { color: #c62828; }
    @media (prefers-color-scheme: dark) {
      .bubble { background: #2c2c2e; color: #f2f2f7; }
      header { color: #aeaeb2; }
      .error { color: #ff8a80; }
    }
  `;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  function languageSelect(value, label, autoOption) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    if (autoOption) select.add(autoOption);
    for (const [code, name] of Object.entries(languages)) {
      select.add(new Option(name, code));
    }
    select.value = value;
    select.addEventListener('change', retranslate);
    return select;
  }

  const header = document.createElement('header');
  const autoOption = new Option(AUTO_LABEL, AUTO);
  const from = languageSelect(pair.from, 'From', autoOption);
  const to = languageSelect(pair.to, 'To');
  const arrow = document.createElement('span');
  arrow.textContent = '→';
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close');
  header.append(from, arrow, to, closeButton);

  const body = document.createElement('p');
  body.dir = 'auto';

  bubble.append(header, body);
  shadow.append(style, bubble);
  document.documentElement.append(host);

  function anchorRect() {
    const selection = window.getSelection();
    const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    if (rect && (rect.width || rect.height)) return rect;
    // Text selected inside an input or textarea has no range of its own.
    return document.activeElement?.getBoundingClientRect() ?? new DOMRect(MARGIN, MARGIN, 0, 0);
  }

  // Taken once: clicking a language list can clear the page selection.
  const anchor = anchorRect();

  function position() {
    const { width, height } = bubble.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const fitsBelow = anchor.bottom + MARGIN + height + MARGIN <= viewportHeight;
    const top = fitsBelow ? anchor.bottom + MARGIN : anchor.top - MARGIN - height;
    host.style.top = `${Math.max(MARGIN, Math.min(top, viewportHeight - height - MARGIN))}px`;
    host.style.left = `${Math.max(MARGIN, Math.min(anchor.left, viewportWidth - width - MARGIN))}px`;
  }

  function render({ text, detected, error }) {
    body.textContent = error ?? text;
    body.classList.toggle('error', Boolean(error));
    autoOption.text = languages[detected] ? `Detected: ${languages[detected]}` : AUTO_LABEL;
    position();
  }

  let latestRequest = 0;

  async function retranslate() {
    latestRequest += 1;
    const request = latestRequest;
    render({ text: 'Translating…' });

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        text: source,
        pair: { from: from.value, to: to.value },
      });
    } catch {
      response = { error: 'Tolmach was updated. Reload this page to translate again.' };
    }
    // A slower answer for an earlier choice must not replace a newer one.
    if (request === latestRequest) render(response);
  }

  render(result);

  const listeners = new AbortController();
  const close = () => {
    listeners.abort();
    host.remove();
    onClose?.();
  };
  closeButton.addEventListener('click', close);
  // Events from inside the shadow root are retargeted to the host.
  document.addEventListener('pointerdown', (event) => {
    if (event.target !== host) close();
  }, { signal: listeners.signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  }, { signal: listeners.signal });
}
