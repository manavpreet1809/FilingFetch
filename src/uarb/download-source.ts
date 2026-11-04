import { FilingError } from '../domain.js';

export const UARB_ORIGIN = 'https://uarb.novascotia.ca';
const connectorPath = '/fmi/webd/APP/connector/';

/** Validate before requesting cookies, fetching bytes or accepting a browser event. */
export function downloadSourceUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new FilingError('DOWNLOAD_FAILED', 'Invalid download location'); }
  if (url.origin !== UARB_ORIGIN || url.username || url.password || url.hash || value.includes('\\')
      || !url.pathname.startsWith(connectorPath) || url.pathname.length === connectorPath.length
      || /%2f|%5c/i.test(url.pathname)) {
    throw new FilingError('DOWNLOAD_FAILED', 'Unexpected download location');
  }
  let decoded: string;
  try { decoded = decodeURIComponent(value.split('?')[0]!); }
  catch { throw new FilingError('DOWNLOAD_FAILED', 'Invalid download location'); }
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded)) throw new FilingError('DOWNLOAD_FAILED', 'Unexpected download location');
  return url;
}

/** Never forward a source cookie through a redirect, even to another allowed URL. */
export async function fetchDownloadSource(value: string, cookie: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = downloadSourceUrl(value);
  const response = await fetcher(url.href, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'error', signal });
  try {
    if (response.redirected || (response.status >= 300 && response.status < 400)) throw new FilingError('DOWNLOAD_FAILED', 'Download redirects are not allowed');
    if (downloadSourceUrl(response.url).href !== url.href) throw new FilingError('DOWNLOAD_FAILED', 'Download response location changed');
    return response;
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
}
