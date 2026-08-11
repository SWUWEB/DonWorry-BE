import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import * as cheerio from 'cheerio';
import { Agent } from 'undici';

import { ERROR_CODES } from '../../config/error-codes.js';
import { HttpError } from '../../utils/http-error.js';

const PRODUCT_NAME_META_KEYS = new Set(['og:title', 'twitter:title']);
const PRODUCT_PRICE_META_KEYS = new Set(['product:price:amount', 'og:price:amount', 'price']);
const PRODUCT_NAME_KEYS = ['productName', 'name', 'title'];
const PRODUCT_PRICE_KEYS = [
  'salePrice',
  'discountedPrice',
  'finalPrice',
  'sellingPrice',
  'price',
  'lowPrice',
];
const STATE_MARKERS = ['__PRELOADED_STATE__', '__INITIAL_STATE__', '__APOLLO_STATE__'];
const MAX_STRUCTURED_DATA_DEPTH = 15;
const MAX_STRUCTURED_DATA_NODES = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

const createBadRequest = (message) =>
  new HttpError(400, message, {
    errorCode: ERROR_CODES.COMMON4001,
  });

const createProductUrlError = (statusCode, errorCode, message) =>
  new HttpError(statusCode, message, { errorCode });

const isPrivateIpv4 = (address) => {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return true;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const isPrivateIpv6 = (address) => {
  const normalized = address.toLowerCase().split('%')[0];
  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  ) {
    return true;
  }

  const mappedSuffix = normalized.match(/::ffff:(.+)$/)?.[1];
  if (!mappedSuffix) return false;

  if (isIP(mappedSuffix) === 4) return isPrivateIpv4(mappedSuffix);

  const groups = mappedSuffix.split(':');
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return true;
  }

  const high = Number.parseInt(groups[0], 16);
  const low = Number.parseInt(groups[1], 16);
  const mappedIpv4 = [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  return isPrivateIpv4(mappedIpv4);
};

const isPrivateAddress = (address) => {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
};

const validatePublicUrl = async (productUrl) => {
  let url;
  try {
    url = new URL(productUrl);
  } catch {
    throw createBadRequest('올바르지 않은 상품 URL 형식입니다.');
  }

  if (!/^https?:$/i.test(url.protocol) || url.username || url.password || !url.hostname) {
    throw createBadRequest('올바르지 않은 상품 URL 형식입니다.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw createBadRequest('접근할 수 없는 상품 URL입니다.');
  }

  const ipVersion = isIP(hostname);
  if (ipVersion) {
    if (isPrivateAddress(hostname)) {
      throw createBadRequest('접근할 수 없는 상품 URL입니다.');
    }
    return {
      url,
      addresses: [{ address: hostname, family: ipVersion }],
    };
  }

  let addresses;
  try {
    addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw createProductUrlError(
      502,
      ERROR_CODES.PRODUCT_URL5021,
      '외부 상품 페이지에 접근할 수 없습니다.',
    );
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw createBadRequest('접근할 수 없는 상품 URL입니다.');
  }

  return { url, addresses };
};

const createPinnedDispatcher = (addresses) =>
  new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options?.all) {
          callback(null, addresses);
          return;
        }

        const [{ address, family }] = addresses;
        callback(null, address, family);
      },
    },
  });

const normalizeText = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
};

const normalizePrice = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;

  const matched = value.match(/\d[\d,.]*/);
  if (!matched) return null;

  const numberValue = Number.parseFloat(matched[0].replace(/,/g, ''));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
};

const readFirstValue = (value, keys, normalizer) => {
  for (const key of keys) {
    const normalized = normalizer(value?.[key]);
    if (normalized !== null) return normalized;
  }
  return null;
};

const extractOfferPrice = (offers) => {
  const offerList = Array.isArray(offers) ? offers : [offers];

  for (const offer of offerList) {
    if (!offer || typeof offer !== 'object') continue;

    const directPrice = readFirstValue(offer, PRODUCT_PRICE_KEYS, normalizePrice);
    if (directPrice !== null) return directPrice;

    const specifications = Array.isArray(offer.priceSpecification)
      ? offer.priceSpecification
      : [offer.priceSpecification];
    for (const specification of specifications) {
      const price = readFirstValue(specification, PRODUCT_PRICE_KEYS, normalizePrice);
      if (price !== null) return price;
    }
  }

  return null;
};

const extractProductFromObject = (value) => {
  const productName = readFirstValue(value, PRODUCT_NAME_KEYS, normalizeText);
  const price =
    readFirstValue(value, PRODUCT_PRICE_KEYS, normalizePrice) ?? extractOfferPrice(value?.offers);

  return { productName, price };
};

const findStructuredProduct = (root) => {
  const stack = [{ value: root, depth: 0 }];
  let visitedNodes = 0;
  let partialResult = { productName: null, price: null };

  while (stack.length && visitedNodes < MAX_STRUCTURED_DATA_NODES) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== 'object') continue;
    visitedNodes += 1;

    const candidate = extractProductFromObject(value);
    if (candidate.productName && candidate.price !== null) return candidate;
    if (!partialResult.productName && candidate.productName) {
      partialResult = candidate;
    }

    if (depth >= MAX_STRUCTURED_DATA_DEPTH) continue;
    const children = Array.isArray(value) ? value : Object.values(value);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      if (children[index] && typeof children[index] === 'object') {
        stack.push({ value: children[index], depth: depth + 1 });
      }
    }
  }

  return partialResult;
};

const parseJson = (value) => {
  try {
    return JSON.parse(value.trim());
  } catch {
    return null;
  }
};

const extractBalancedJson = (script, startIndex) => {
  const openingIndex = script.slice(startIndex).search(/[[{]/);
  if (openingIndex < 0) return null;

  const absoluteStart = startIndex + openingIndex;
  const opening = script[absoluteStart];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = absoluteStart; index < script.length; index += 1) {
    const character = script[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    if (character === closing) depth -= 1;
    if (depth === 0) return script.slice(absoluteStart, index + 1);
  }

  return null;
};

const extractScriptProduct = ($) => {
  const jsonCandidates = [];
  const nextData = $('#__NEXT_DATA__').first().text();
  if (nextData) jsonCandidates.push(nextData);

  $('script[type="application/ld+json"]').each((_, element) => {
    const content = $(element).text();
    if (content) jsonCandidates.push(content);
  });

  for (const json of jsonCandidates) {
    const parsed = parseJson(json);
    if (!parsed) continue;
    const candidate = findStructuredProduct(parsed);
    if (candidate.productName && candidate.price !== null) return candidate;
  }

  let partialResult = { productName: null, price: null };
  $('script:not([src])').each((_, element) => {
    if (partialResult.productName && partialResult.price !== null) return;
    const script = $(element).html() || '';

    for (const marker of STATE_MARKERS) {
      const markerIndex = script.indexOf(marker);
      if (markerIndex < 0) continue;

      const json = extractBalancedJson(script, markerIndex + marker.length);
      const parsed = json ? parseJson(json) : null;
      if (!parsed) continue;

      const candidate = findStructuredProduct(parsed);
      if (candidate.productName && candidate.price !== null) {
        partialResult = candidate;
        return;
      }
      if (!partialResult.productName && candidate.productName) {
        partialResult = candidate;
      }
    }
  });

  return partialResult;
};

const extractMetaContent = ($, keys) => {
  let result = null;

  $('meta').each((_, element) => {
    if (result) return;
    const key = ($(element).attr('property') || $(element).attr('name'))?.trim().toLowerCase();
    if (!key || !keys.has(key)) return;

    result = normalizeText($(element).attr('content'));
  });

  return result;
};

const readLimitedResponseBody = async (response) => {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw createProductUrlError(
      502,
      ERROR_CODES.PRODUCT_URL5022,
      '상품 페이지의 응답 크기가 너무 큽니다.',
    );
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw createProductUrlError(
        502,
        ERROR_CODES.PRODUCT_URL5022,
        '상품 페이지의 응답 크기가 너무 큽니다.',
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const contentType = response.headers?.get?.('content-type');
  const contentTypeMatch = /charset\s*=\s*([^;\s]+)/i.exec(contentType || '');
  const normalizeEncoding = (value) => value?.trim().toLowerCase().replace(/_/g, '-');
  const getMetaCharset = (text) =>
    /<meta[^>]*charset\s*=\s*['"]?([^'">\s]+)/i.exec(text)?.[1]?.trim().toLowerCase() ||
    /<meta[^>]*http-equiv\s*=\s*['"]?content-type['"][^>]*content\s*=\s*['"][^'">]*charset\s*=\s*([^;'"'\s>]+)/i
      .exec(text)?.[1]
      ?.trim()
      .toLowerCase();

  let decoder;
  const headerCharsetMatch = contentTypeMatch?.[1]?.replace(/['"]/g, '').trim();
  if (headerCharsetMatch) {
    try {
      decoder = new TextDecoder(normalizeEncoding(headerCharsetMatch));
    } catch {
      decoder = undefined;
    }
  }

  let receivedBytes = 0;
  let result = '';
  const chunks = [];

  if (!decoder) {
    const provisionalDecoder = new TextDecoder();
    let detectedMetaCharset;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw createProductUrlError(
          502,
          ERROR_CODES.PRODUCT_URL5022,
          '상품 페이지의 응답 크기가 너무 큽니다.',
        );
      }

      chunks.push(new Uint8Array(value));
      result += provisionalDecoder.decode(value, { stream: true });

      if (!detectedMetaCharset) {
        detectedMetaCharset = getMetaCharset(result);
      }
    }

    const decodedSuffix = provisionalDecoder.decode();
    if (!detectedMetaCharset) {
      return result + decodedSuffix;
    }

    try {
      decoder = new TextDecoder(normalizeEncoding(detectedMetaCharset));
    } catch {
      return result + decodedSuffix;
    }

    result = '';
    for (const chunk of chunks) {
      result += decoder.decode(chunk, { stream: true });
    }

    return result + decoder.decode();
  }

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw createProductUrlError(
        502,
        ERROR_CODES.PRODUCT_URL5022,
        '상품 페이지의 응답 크기가 너무 큽니다.',
      );
    }
    result += decoder.decode(value, { stream: true });
  }

  return result + decoder.decode();
};
const fetchProductPage = async (productUrl) => {
  let target = await validatePublicUrl(productUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const dispatcher = createPinnedDispatcher(target.addresses);
    try {
      const response = await fetch(target.url, {
        method: 'GET',
        redirect: 'manual',
        dispatcher,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.get?.('location');
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw createProductUrlError(
            502,
            ERROR_CODES.PRODUCT_URL5021,
            '외부 상품 페이지에 접근할 수 없습니다.',
          );
        }
        target = await validatePublicUrl(new URL(location, target.url).href);
        continue;
      }

      if (!response.ok) {
        throw createProductUrlError(
          502,
          ERROR_CODES.PRODUCT_URL5021,
          '외부 상품 페이지에 접근할 수 없습니다.',
        );
      }
      return await readLimitedResponseBody(response);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw createProductUrlError(
          504,
          ERROR_CODES.PRODUCT_URL5041,
          '외부 상품 페이지 응답 시간이 초과되었습니다.',
        );
      }
      throw createProductUrlError(
        502,
        ERROR_CODES.PRODUCT_URL5021,
        '외부 상품 페이지에 접근할 수 없습니다.',
      );
    } finally {
      await dispatcher.close();
    }
  }

  throw createBadRequest('상품 정보를 불러오지 못했습니다.');
};

export const parseProductUrl = async ({ productUrl }) => {
  const html = await fetchProductPage(productUrl);
  const $ = cheerio.load(html);
  const structuredData = extractScriptProduct($);

  const productName =
    structuredData.productName ||
    extractMetaContent($, PRODUCT_NAME_META_KEYS) ||
    normalizeText($('h1').first().text()) ||
    normalizeText($('title').first().text());
  const price =
    structuredData.price ?? normalizePrice(extractMetaContent($, PRODUCT_PRICE_META_KEYS));

  if (!productName || price === null) {
    throw createProductUrlError(
      422,
      ERROR_CODES.PRODUCT_URL4221,
      '상품 정보를 파싱하지 못했습니다.',
    );
  }

  return {
    productName,
    price,
    occurredAt: new Date().toISOString(),
  };
};
