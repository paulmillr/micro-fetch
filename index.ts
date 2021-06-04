type FETCH_OPT = {
  method?: string;
  type?: 'text' | 'json' | 'bytes'; // Response encoding (auto-detect if empty)
  redirect: boolean; // Follow redirects
  expectStatusCode?: number | false; // Expect this status code
  headers: Record<string, string>;
  data?: object; // POST/PUT/DELETE request data
  full: boolean; // Return full request {headers, status, body}
  keepAlive: boolean; // Enable keep-alive (node only)
  cors: boolean; // Allow CORS safe-listed headers (browser-only)
  referrer: boolean; // Send referrer (browser-only)
  _redirectCount: number;
};

const DEFAULT_OPT: FETCH_OPT = Object.freeze({
  redirect: true,
  expectStatusCode: 200,
  headers: {},
  full: false,
  keepAlive: true,
  cors: false,
  referrer: false,
  _redirectCount: 0,
});

function detectType(b: Uint8Array, type?: 'text' | 'json' | 'bytes') {
  if (!type || type === 'text' || type === 'json') {
    try {
      let text = new TextDecoder('utf8', { fatal: true }).decode(b);
      if (type === 'text') return text;
      try {
        return JSON.parse(text);
      } catch (err) {
        if (type === 'json') throw err;
        return text;
      }
    } catch (err) {
      if (type === 'text' || type === 'json') throw err;
    }
  }
  return b;
}

let _httpAgent: any, _httpsAgent: any;
function fetchNode(url: string, options: FETCH_OPT = DEFAULT_OPT): Promise<any> {
  options = { ...DEFAULT_OPT, ...options };
  const http = require('http');
  const https = require('https');
  const zlib = require('zlib');
  const { promisify } = require('util');
  const { resolve: urlResolve } = require('url');
  const agentOpt = { keepAlive: true, keepAliveMsecs: 30 * 1000, maxFreeSockets: 1024 };
  if (!_httpAgent) _httpAgent = new http.Agent(agentOpt);
  if (!_httpsAgent) _httpsAgent = new https.Agent(agentOpt);
  const isSecure = !!/^https/.test(url);
  let opts: any = {
    method: options.method || 'GET',
    headers: { 'Accept-Encoding': 'gzip, deflate, br' }, // Same as browsers
  };
  if (options.keepAlive) opts.agent = isSecure ? _httpsAgent : _httpAgent;
  if (options.type === 'json') opts.headers['Content-Type'] = 'application/json';
  if (options.data) {
    if (!options.method) opts.method = 'POST';
    opts.body = options.type === 'json' ? JSON.stringify(options.data) : options.data;
  }
  opts.headers = { ...opts.headers, ...options.headers };
  const handleRes = async (res: any) => {
    const status = res.statusCode;
    if (options.redirect && 300 <= status && status < 400 && res.headers['location']) {
      if (options._redirectCount == 10) throw new Error('Request failed. Too much redirects.');
      options._redirectCount += 1;
      return await fetchNode(urlResolve(url, res.headers['location']), options);
    }
    if (options.expectStatusCode && status !== options.expectStatusCode) {
      res.resume(); // Consume response data to free up memory
      throw new Error(`Request Failed. Status Code: ${status}`);
    }
    let buf = [];
    for await (const chunk of res) buf.push(chunk);
    let bytes = Buffer.concat(buf);
    const encoding = res.headers['content-encoding'];
    if (encoding === 'br') bytes = await promisify(zlib.brotliDecompress)(bytes);
    if (encoding === 'gzip' || encoding === 'deflate') bytes = await promisify(zlib.unzip)(bytes);
    const body = detectType(bytes, options.type);
    if (options.full) return { headers: res.headers, status, body };
    return body;
  };
  return new Promise((resolve, reject) => {
    const req = (isSecure ? https : http).request(url, opts, (res: any) => {
      // Should be set immediately since error can happen on connect (before promise)
      res.on('error', reject);
      (async () => {
        try {
          resolve(await handleRes(res));
        } catch (error) {
          reject(error);
        }
      })();
    });
    // Disable Nagle's algorithm
    if (options.keepAlive) req.setNoDelay(true);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// List of headers which can be set without CORS (https://fetch.spec.whatwg.org/#no-cors-safelisted-request-header-name)
const SAFE_HEADERS = new Set(
  ['Accept', 'Accept-Language', 'Content-Language', 'Content-Type'].map((i) => i.toLowerCase())
);
// List of headers which cannot be set even with CORS (https://fetch.spec.whatwg.org/#forbidden-header-name)
// prettier-ignore
const FORBIDDEN_HEADERS = new Set(['Accept-Charset', 'Accept-Encoding', 'Access-Control-Request-Headers', 'Access-Control-Request-Method',
  'Connection', 'Content-Length', 'Cookie', 'Cookie2', 'Date', 'DNT', 'Expect', 'Host', 'Keep-Alive', 'Origin', 'Referer', 'TE', 'Trailer',
  'Transfer-Encoding','Upgrade', 'Via'].map((i) => i.toLowerCase()));

async function fetchBrowser(url: string, options?: FETCH_OPT): Promise<any> {
  options = { ...DEFAULT_OPT, ...options };
  const headers = new Headers();
  if (options.type === 'json') headers.set('Content-Type', 'application/json');
  for (let k in options.headers) {
    const name = k.toLowerCase();
    if (SAFE_HEADERS.has(name) || (options.cors && !FORBIDDEN_HEADERS.has(name)))
      headers.set(k, options.headers[k]);
  }
  let opts: any = { headers, redirect: options.redirect ? 'follow' : 'manual' };
  if (!options.referrer) opts.referrerPolicy = 'no-referrer';
  if (options.cors) opts.mode = 'cors';
  if (options.data) {
    if (!options.method) opts.method = 'POST';
    opts.body = options.type === 'json' ? JSON.stringify(options.data) : options.data;
  }
  const res = await fetch(url, opts);
  if (options.expectStatusCode && res.status !== options.expectStatusCode)
    throw new Error(`Request failed. Status code: ${res.status}`);
  const body = detectType(new Uint8Array(await res.arrayBuffer()), options.type);
  if (options.full)
    return { headers: Object.fromEntries(res.headers.entries()), status: res.status, body };
  return body;
}

const IS_NODE = !!(
  typeof process == 'object' &&
  process.versions &&
  process.versions.node &&
  process.versions.v8
);

// We cannot name this fetch, since browser uses one.
export default function fetchUrl(url: string, options: FETCH_OPT = DEFAULT_OPT): Promise<any> {
  const fn = IS_NODE ? fetchNode : fetchBrowser;
  return fn(url, options);
}
