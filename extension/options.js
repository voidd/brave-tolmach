import { AUTO, LANGUAGES, loadPair } from './languages.js';

const from = document.getElementById('from');
const to = document.getElementById('to');

function save() {
  chrome.storage.sync.set({ pair: { from: from.value, to: to.value } });
}

from.add(new Option('Detect language', AUTO));
for (const select of [from, to]) {
  for (const [code, name] of Object.entries(LANGUAGES)) {
    select.add(new Option(name, code));
  }
  select.addEventListener('change', save);
}

({ from: from.value, to: to.value } = await loadPair());
