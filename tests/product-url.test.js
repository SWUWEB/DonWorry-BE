import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'mysql://donworry:donworry@localhost:3307/donworry_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CORS_ORIGIN = 'http://localhost:5173';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');

const app = createApp();
const testEmail = 'product-url-test@example.com';
const testLoginId = 'producturl1';

const createAccessToken = (user) =>
  jwt.sign({ purpose: 'access', userId: user.id.toString() }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '1h',
  });

const createTestUser = () =>
  prisma.user.create({
    data: {
      email: testEmail,
      loginId: testLoginId,
      nickname: 'product-url-tester',
    },
  });

const deleteProductUrlTestData = () =>
  prisma.user.deleteMany({
    where: { OR: [{ email: testEmail }, { loginId: testLoginId }] },
  });

const publicProductUrl = 'https://8.8.8.8/product/123';

const mockHeaders = (headers = {}) => ({
  get: (name) => headers[name.toLowerCase()] ?? null,
});

const mockFetchResponse = (html, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: mockHeaders(headers),
  text: async () => html,
});

const requestParse = async (accessToken, productUrl) =>
  request(app)
    .post('/api/v1/product-url/parse')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ productUrl });

const withMockedFetch = async (html, callback) => {
  const previousFetch = global.fetch;
  global.fetch = async () => mockFetchResponse(html);
  try {
    return await callback();
  } finally {
    global.fetch = previousFetch;
  }
};

test.beforeEach(deleteProductUrlTestData);

test.after(async () => {
  await deleteProductUrlTestData();
  await prisma.$disconnect();
});

test('parses meta tags regardless of attribute order', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const html = `
    <html><head>
      <meta content="Sample Product" property="og:title">
      <meta content="6,100" property="product:price:amount">
    </head></html>`;

  const response = await withMockedFetch(html, () => requestParse(accessToken, publicProductUrl));

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.productName, 'Sample Product');
  assert.equal(response.body.data.price, 6100);
  assert.equal(typeof response.body.data.occurredAt, 'string');
});

test('supports an external HTTP product URL', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const html = `
    <meta property="og:title" content="HTTP Product">
    <meta property="product:price:amount" content="5000">`;

  const response = await withMockedFetch(html, () =>
    requestParse(accessToken, 'http://8.8.8.8/product/123'),
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.productName, 'HTTP Product');
  assert.equal(response.body.data.price, 5000);
});

test('parses Product JSON-LD before fallback metadata', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const html = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "JSON-LD Product",
        "offers": [{"@type": "Offer", "price": "12900"}]
      }
    </script>
    <meta property="og:title" content="Fallback Product">`;

  const response = await withMockedFetch(html, () => requestParse(accessToken, publicProductUrl));

  assert.equal(response.status, 200);
  assert.equal(response.body.data.productName, 'JSON-LD Product');
  assert.equal(response.body.data.price, 12900);
});

test('parses nested product data from Next.js __NEXT_DATA__', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const html = `
    <script id="__NEXT_DATA__" type="application/json">
      {
        "props": {
          "pageProps": {
            "product": {
              "productName": "Next Product",
              "discountedPrice": 8900
            }
          }
        }
      }
    </script>`;

  const response = await withMockedFetch(html, () => requestParse(accessToken, publicProductUrl));

  assert.equal(response.status, 200);
  assert.equal(response.body.data.productName, 'Next Product');
  assert.equal(response.body.data.price, 8900);
});

test('parses a product from preloaded global state', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const html = `
    <script>
      window.__PRELOADED_STATE__ = {
        "catalog": {
          "currentProduct": {
            "name": "State Product",
            "salePrice": "7,500"
          }
        }
      };
    </script>`;

  const response = await withMockedFetch(html, () => requestParse(accessToken, publicProductUrl));

  assert.equal(response.status, 200);
  assert.equal(response.body.data.productName, 'State Product');
  assert.equal(response.body.data.price, 7500);
});

test('rejects an invalid productUrl format', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const response = await requestParse(accessToken, 'example.com/not-valid');

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
});

test('returns unauthorized without an access token', async () => {
  const response = await request(app)
    .post('/api/v1/product-url/parse')
    .send({ productUrl: publicProductUrl });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test('returns a validation error when product data is incomplete', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const html = '<html><head><title>No product price</title></head></html>';

  const response = await withMockedFetch(html, () => requestParse(accessToken, publicProductUrl));

  assert.equal(response.status, 422);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'PRODUCT_URL4221');
});

test('blocks localhost and private network URLs before fetch', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const previousFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return mockFetchResponse('');
  };

  try {
    for (const productUrl of [
      'http://localhost/product',
      'http://127.0.0.1/product',
      'http://10.0.0.1/product',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/product',
      'http://[::ffff:127.0.0.1]/product',
      'http://[::ffff:7f00:1]/product',
    ]) {
      const response = await requestParse(accessToken, productUrl);
      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'COMMON4001');
    }
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = previousFetch;
  }
});

test('pins fetch connections to the validated address', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const previousFetch = global.fetch;
  let requestOptions;
  global.fetch = async (_url, options) => {
    requestOptions = options;
    return mockFetchResponse(`
      <meta property="og:title" content="Pinned Product">
      <meta property="product:price:amount" content="1000">`);
  };

  try {
    const response = await requestParse(accessToken, publicProductUrl);
    assert.equal(response.status, 200);
    assert.ok(requestOptions.dispatcher);
    assert.equal(requestOptions.redirect, 'manual');
  } finally {
    global.fetch = previousFetch;
  }
});

test('blocks redirects to a private network URL', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const previousFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return mockFetchResponse('', 302, {
      location: 'http://127.0.0.1/internal',
    });
  };

  try {
    const response = await requestParse(accessToken, publicProductUrl);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'COMMON4001');
    assert.equal(fetchCount, 1);
  } finally {
    global.fetch = previousFetch;
  }
});

test('rejects a product page larger than the response limit', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const previousFetch = global.fetch;
  global.fetch = async () =>
    mockFetchResponse('', 200, {
      'content-length': String(2 * 1024 * 1024 + 1),
    });

  try {
    const response = await requestParse(accessToken, publicProductUrl);
    assert.equal(response.status, 502);
    assert.equal(response.body.code, 'PRODUCT_URL5022');
  } finally {
    global.fetch = previousFetch;
  }
});

test('returns a gateway timeout when the upstream request times out', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const previousFetch = global.fetch;
  global.fetch = async () => {
    const error = new Error('request timed out');
    error.name = 'TimeoutError';
    throw error;
  };

  try {
    const response = await requestParse(accessToken, publicProductUrl);
    assert.equal(response.status, 504);
    assert.equal(response.body.code, 'PRODUCT_URL5041');
  } finally {
    global.fetch = previousFetch;
  }
});

test('returns a bad gateway for blocked upstream responses', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const previousFetch = global.fetch;
  global.fetch = async () => mockFetchResponse('', 429);

  try {
    const response = await requestParse(accessToken, publicProductUrl);
    assert.equal(response.status, 502);
    assert.equal(response.body.code, 'PRODUCT_URL5021');
  } finally {
    global.fetch = previousFetch;
  }
});

test('documents the project response contract and both bad request shapes', async () => {
  const response = await request(app).get('/api-docs.json');
  const operation = response.body.paths['/api/v1/product-url/parse'].post;
  const successSchema = operation.responses['200'].content['application/json'].schema;
  const badRequestSchema = operation.responses['400'].content['application/json'].schema;

  assert.equal(response.status, 200);
  assert.ok(successSchema.properties.success);
  assert.ok(successSchema.properties.message);
  assert.ok(successSchema.properties.data);
  assert.deepEqual(successSchema.required, ['success', 'message', 'data']);
  assert.deepEqual(successSchema.properties.data.required, ['productName', 'price', 'occurredAt']);
  assert.equal(successSchema.properties.data.properties.occurredAt.format, 'date-time');
  assert.deepEqual(badRequestSchema.anyOf, [
    { $ref: '#/components/schemas/ValidationErrorResponse' },
    { $ref: '#/components/schemas/ErrorResponse' },
  ]);
  assert.equal(
    operation.responses['422'].content['application/json'].example.code,
    'PRODUCT_URL4221',
  );
  assert.equal(
    operation.responses['502'].content['application/json'].examples.upstreamFailure.value.code,
    'PRODUCT_URL5021',
  );
  assert.equal(
    operation.responses['502'].content['application/json'].examples.responseTooLarge.value.code,
    'PRODUCT_URL5022',
  );
  assert.equal(
    operation.responses['504'].content['application/json'].example.code,
    'PRODUCT_URL5041',
  );
});
