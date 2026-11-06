const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const TIMEOUT_MS = 15000;

export async function translate(text, from, to) {
  const params = new URLSearchParams({ client: 'gtx', sl: from, tl: to, dt: 't' });

  let response;
  try {
    // POST because a long selection would not fit in a query string.
    response = await fetch(`${ENDPOINT}?${params}`, {
      method: 'POST',
      body: new URLSearchParams({ q: text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error('Could not reach the translation service.');
  }

  if (response.status === 429) {
    throw new Error('The translation service is rate limiting requests. Try again in a few minutes.');
  }
  if (!response.ok) {
    throw new Error(`The translation service returned HTTP ${response.status}.`);
  }

  // Shape: [[[translated, original, ...], ...], null, detectedLanguage, ...]
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data?.[0])) {
    throw new Error('The translation service returned an unexpected response.');
  }
  return {
    text: data[0].map((segment) => segment[0] ?? '').join(''),
    from: data[2] ?? from,
  };
}
