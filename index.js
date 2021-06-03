"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DEFAULT_OPT = Object.freeze({
    redirect: true,
    status: 200,
    headers: {},
    full: false,
    keepalive: true,
    cors: false,
    referrer: false,
    _redirectCnt: 0,
});
function detectType(b, type) {
    if (!type || type === 'text' || type === 'json') {
        try {
            let text = new TextDecoder('utf8', { fatal: true }).decode(b);
            if (type === 'text')
                return text;
            try {
                return JSON.parse(text);
            }
            catch (err) {
                if (type === 'json')
                    throw err;
                return text;
            }
        }
        catch (err) {
            if (type === 'text' || type === 'json')
                throw err;
        }
    }
    return b;
}
let _httpAgent, _httpsAgent;
function fetchNode(url, options = DEFAULT_OPT) {
    options = { ...DEFAULT_OPT, ...options };
    const http = require('http');
    const https = require('https');
    const zlib = require('zlib');
    const { resolve: urlResolve } = require('url');
    const agentOpt = { keepAlive: true, keepAliveMsecs: 30 * 1000, maxFreeSockets: 1024 };
    if (!_httpAgent)
        _httpAgent = new http.Agent(agentOpt);
    if (!_httpsAgent)
        _httpsAgent = new https.Agent(agentOpt);
    const isSecure = !!/^https/.test(url);
    let opts = {
        method: options.method || 'GET',
        headers: { 'Accept-Encoding': 'gzip, deflate, br' },
    };
    if (options.keepalive)
        opts.agent = isSecure ? _httpsAgent : _httpAgent;
    if (options.type === 'json')
        opts.headers['Content-Type'] = 'application/json';
    if (options.data) {
        if (!options.method)
            opts.method = 'POST';
        opts.body = options.type === 'json' ? JSON.stringify(options.data) : options.data;
    }
    opts.headers = { ...opts.headers, ...options.headers };
    const handleRes = async (res) => {
        const status = res.statusCode;
        if (options.redirect && 300 <= status && status < 400 && res.headers['location']) {
            if (options._redirectCnt == 10)
                throw new Error('Request failed. Too much redirects.');
            options._redirectCnt += 1;
            return await fetchNode(urlResolve(url, res.headers['location']), options);
        }
        if (options.status && status !== options.status) {
            res.resume();
            throw new Error(`Request Failed. Status Code: ${status}`);
        }
        let buf = [];
        for await (const chunk of res)
            buf.push(chunk);
        let bytes = Buffer.concat(buf);
        const encoding = res.headers['content-encoding'];
        if (encoding === 'br')
            bytes = zlib.brotliDecompressSync(bytes);
        if (encoding === 'gzip' || encoding === 'deflate')
            bytes = zlib.unzipSync(bytes);
        const body = detectType(bytes, options.type);
        if (options.full)
            return { headers: res.headers, status, body };
        return body;
    };
    return new Promise((resolve, reject) => {
        const req = (isSecure ? https : http).request(url, opts, (res) => {
            res.on('error', reject);
            (async () => {
                try {
                    resolve(await handleRes(res));
                }
                catch (error) {
                    reject(error);
                }
            })();
        });
        if (options.keepalive)
            req.setNoDelay(true);
        if (opts.body)
            req.write(opts.body);
        req.end();
    });
}
const SAFE_HEADERS = new Set(['Accept', 'Accept-Language', 'Content-Language', 'Content-Type'].map((i) => i.toLowerCase()));
const FORBIDDEN_HEADERS = new Set(['Accept-Charset', 'Accept-Encoding', 'Access-Control-Request-Headers', 'Access-Control-Request-Method',
    'Connection', 'Content-Length', 'Cookie', 'Cookie2', 'Date', 'DNT', 'Expect', 'Host', 'Keep-Alive', 'Origin', 'Referer', 'TE', 'Trailer',
    'Transfer-Encoding', 'Upgrade', 'Via'].map((i) => i.toLowerCase()));
async function fetchBrowser(url, options) {
    options = { ...DEFAULT_OPT, ...options };
    const headers = new Headers();
    if (options.type === 'json')
        headers.set('Content-Type', 'application/json');
    for (let k in options.headers) {
        const name = k.toLowerCase();
        if (SAFE_HEADERS.has(name) || (options.cors && !FORBIDDEN_HEADERS.has(name)))
            headers.set(k, options.headers[k]);
    }
    let opts = { headers, redirect: options.redirect ? 'follow' : 'manual' };
    if (!options.referrer)
        opts.referrerPolicy = 'no-referrer';
    if (options.cors)
        opts.mode = 'cors';
    if (options.data) {
        if (!options.method)
            opts.method = 'POST';
        opts.body = options.type === 'json' ? JSON.stringify(options.data) : options.data;
    }
    const res = await fetch(url, opts);
    if (options.status && res.status !== options.status)
        throw new Error(`Request failed. Status code: ${res.status}`);
    const body = detectType(new Uint8Array(await res.arrayBuffer()), options.type);
    if (options.full)
        return { headers: Object.fromEntries(res.headers.entries()), status: res.status, body };
    return body;
}
const IS_NODE = !!(typeof process == 'object' &&
    process.versions &&
    process.versions.node &&
    process.versions.v8);
function fetchUrl(url, options = DEFAULT_OPT) {
    const fn = IS_NODE ? fetchNode : fetchBrowser;
    return fn(url, options);
}
exports.default = fetchUrl;
