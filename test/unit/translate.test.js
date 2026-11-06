import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { translate } from '../../extension/translate.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(response) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (response instanceof Error) throw response;
    return response;
  };
  return calls;
}

test('joins segments and reports the detected language', async () => {
  const body = [[['Привет. ', 'Hello. ', null], ['Мир', 'World', null]], null, 'en'];
  const calls = stubFetch(Response.json(body));

  const result = await translate('Hello. World', 'auto', 'ru');

  assert.deepEqual(result, { text: 'Привет. Мир', from: 'en' });
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('sl'), 'auto');
  assert.equal(url.searchParams.get('tl'), 'ru');
  assert.equal(calls[0].options.body.get('q'), 'Hello. World');
});

test('explains rate limiting', async () => {
  stubFetch(new Response('Sorry', { status: 429 }));
  await assert.rejects(translate('x', 'auto', 'ru'), /rate limiting/);
});

test('reports other HTTP failures', async () => {
  stubFetch(new Response('', { status: 500 }));
  await assert.rejects(translate('x', 'auto', 'ru'), /HTTP 500/);
});

test('reports network failures', async () => {
  stubFetch(new TypeError('Failed to fetch'));
  await assert.rejects(translate('x', 'auto', 'ru'), /Could not reach/);
});

test('rejects a body it cannot parse', async () => {
  stubFetch(new Response('<html>'));
  await assert.rejects(translate('x', 'auto', 'ru'), /unexpected response/);
});

test('sends the text as a POST with the expected query', async () => {
  const calls = stubFetch(Response.json([[['a', 'b']], null, 'en']));

  await translate('b', 'de', 'zh-CN');

  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, 'https://translate.googleapis.com/translate_a/single');
  assert.equal(url.searchParams.get('client'), 'gtx');
  assert.equal(url.searchParams.get('dt'), 't');
  assert.equal(calls[0].options.method, 'POST');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('falls back to the requested language when none is detected', async () => {
  stubFetch(Response.json([[['a', 'b']]]));
  const result = await translate('b', 'de', 'ru');
  assert.equal(result.from, 'de');
});

test('treats a segment without a translation as empty', async () => {
  stubFetch(Response.json([[['a', 'b'], [null, 'c'], ['d', 'e']], null, 'en']));
  const result = await translate('bce', 'auto', 'ru');
  assert.equal(result.text, 'ad');
});
