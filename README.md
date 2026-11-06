# Tolmach

A Brave/Chrome extension that translates selected text from the right-click menu.

## Install

1. Open `brave://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension` folder.

## Use

Select text, right-click, and pick **Tolmach**. The translation
appears next to the selection. Close it with Esc, the × button, or a click anywhere else.

On pages extensions cannot script, such as the PDF viewer, the Web Store, and
cross-origin frames, the translation opens in a small window instead.

## Language pair

The default is English to Russian. To change it, use the two language lists at the top of
the translation: it translates again straight away and the choice is remembered. The pair is also under the extension's **Details** > **Extension options**.

## Privacy

Selected text is sent to Google when you translate it, and only then. The extension
uses `translate.googleapis.com`, Google's keyless endpoint. It is unofficial, so it
can rate limit or change without notice.

## Tests

    npm install
    npx playwright install chromium

    npm test               # unit tests
    npm run test:e2e       # the extension in a real Chromium, translation stubbed
    npm run test:mutation  # mutation coverage, report in reports/mutation.html

Playwright cannot open a native context menu, so the browser tests call the extension's
registered click listener directly. They run a temporary copy of the extension with a
test hook and `<all_urls>` in place of the `activeTab` grant from a real right-click.
