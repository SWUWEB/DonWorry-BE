import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL || 'mysql://donworry:donworry@localhost:3307/donworry_test';
const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!testDatabaseName.endsWith('_test')) {
  throw new Error('DB write tests must run against a test database.');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');

const app = createApp();

const testEmail = 'wtest@ex.com';
const testLoginId = 'wtest_id';

let accessToken;
let testUser;

const cleanupTestData = async () => {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: testEmail }, { loginId: testLoginId }] },
    select: { id: true },
  });
  if (user) {
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.wishlistItem.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
};

test.before(async () => {
  await cleanupTestData();

  testUser = await prisma.user.create({
    data: {
      email: testEmail,
      nickname: '위시리스트테스터',
      loginId: testLoginId,
    },
  });

  accessToken = jwt.sign(
    {
      purpose: 'access',
      userId: testUser.id.toString(),
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );

  const now = new Date();
  await prisma.wishlistItem.createMany({
    data: [
      {
        userId: testUser.id,
        productName: '맥북 프로 M3',
        price: 2500000,
        categoryCode: 'ELECTRONICS',
        status: 'WAITING',
        waitUntil: new Date(now.getTime() + 1000 * 60 * 60 * 24),
      },
      {
        userId: testUser.id,
        productName: '맥북 에어 M2',
        price: 1500000,
        categoryCode: 'ELECTRONICS',
        status: 'WAITING',
        waitUntil: new Date(now.getTime() + 1000 * 60 * 60),
      },
      {
        userId: testUser.id,
        productName: '나이키 운동화',
        price: 120000,
        categoryCode: 'FASHION',
        status: 'WAITING',
        waitUntil: new Date(now.getTime() + 1000 * 60 * 60 * 2),
      },
    ],
  });
});

test.after(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

test('GET /api/v1/wishlist-items - 검색어(query) 조건으로 항목을 필터링하여 조회한다', async () => {
  const response = await request(app)
    .get('/api/v1/wishlist-items')
    .query({ query: '맥북' })
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.totalCount, 2);

  const items = response.body.data;
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => item.productName.includes('맥북')));
});

test('GET /api/v1/wishlist-items - 카테고리(categoryCode) 조건으로 항목을 필터링하여 조회한다', async () => {
  const response = await request(app)
    .get('/api/v1/wishlist-items')
    .query({ categoryCode: 'ELECTRONICS' })
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.totalCount, 2);

  const items = response.body.data;
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => item.categoryCode === 'ELECTRONICS'));
});

test('GET /api/v1/wishlist-items - categoryCode가 ALL일 경우 전체 항목을 조회한다', async () => {
  const response = await request(app)
    .get('/api/v1/wishlist-items')
    .query({ categoryCode: 'ALL' })
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.totalCount, 3);
  assert.equal(response.body.data.length, 3);
});

test('GET /api/v1/wishlist-items - 정렬 및 페이징 조건에 맞게 조회하고 totalCount를 반환한다', async () => {
  const response = await request(app)
    .get('/api/v1/wishlist-items')
    .query({ sort: 'NAME_ASC', page: 1, limit: 2 })
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.totalCount, 3);

  const items = response.body.data;
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 2);
  assert.equal(items[0].productName, '나이키 운동화');
  assert.equal(items[1].productName, '맥북 에어 M2');
});

test('GET /api/v1/wishlist-items - 대기시간 마감임박순(DEADLINE_ASC) 정렬을 검증한다', async () => {
  const response = await request(app)
    .get('/api/v1/wishlist-items')
    .query({ sort: 'DEADLINE_ASC', page: 1, limit: 3 })
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  const items = response.body.data;
  assert.equal(items.length, 3);

  assert.equal(items[0].productName, '맥북 에어 M2');
  assert.equal(items[1].productName, '나이키 운동화');
  assert.equal(items[2].productName, '맥북 프로 M3');
});
