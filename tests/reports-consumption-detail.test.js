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
const { CATEGORY_MAP } = await import('../src/config/categories.js');

const app = createApp();
const testEmail = 'reports-detail-test@example.com';
const testLoginId = 'reportdet1';
const RealDate = Date;
// KST 2026-08-13 12:00 (이번 달: 2026-08)
const fixedNow = new RealDate('2026-08-13T03:00:00.000Z');

class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fixedNow.getTime());
    else super(...args);
  }

  static now() {
    return fixedNow.getTime();
  }
}

const deleteTestData = async () => {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: testEmail }, { loginId: testLoginId }] },
    select: { id: true },
  });
  if (user) await prisma.consumptionRecord.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { OR: [{ email: testEmail }, { loginId: testLoginId }] } });
};

const createUser = () =>
  prisma.user.create({
    data: { email: testEmail, loginId: testLoginId, nickname: 'reports-detail-test' },
  });

const createRecords = (userId, records) =>
  prisma.consumptionRecord.createMany({
    data: records.map(({ type, price, categoryCode }) => ({
      userId,
      type,
      price,
      categoryCode,
      categoryLabel: CATEGORY_MAP[categoryCode],
      occurredAt: new Date('2026-08-10T03:00:00Z'),
      productName: `${type} ${categoryCode} ${price}`,
    })),
  });

const getReport = (user, query = '') => {
  const token = jwt.sign(
    { purpose: 'access', userId: user.id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
  return request(app)
    .get(`/api/v1/reports/consumption/detail${query}`)
    .set('Authorization', `Bearer ${token}`);
};

test.beforeEach(async () => {
  globalThis.Date = FixedDate;
  await deleteTestData();
});
test.afterEach(() => {
  globalThis.Date = RealDate;
});
test.after(async () => {
  await deleteTestData();
  await prisma.$disconnect();
});

test('GET /api/v1/reports/consumption/detail requires authentication', async () => {
  const response = await request(app).get('/api/v1/reports/consumption/detail');
  assert.equal(response.status, 401);
});

test('기록이 없으면 빈 리포트를 반환하고 month를 생략하면 이번 달을 조회한다', async () => {
  const user = await createUser();

  const response = await getReport(user);

  assert.equal(response.status, 200);
  const report = response.body.data;
  assert.equal(report.reportMonth, '2026-08');
  assert.equal(report.totalConsumption.totalAmount, 0);
  assert.deepEqual(report.totalConsumption.categories, []);
  assert.deepEqual(report.categoryDefenseSummary, []);
});

test('미래 월은 400 REPORT4001을 반환한다', async () => {
  const user = await createUser();

  const response = await getReport(user, '?month=2026-09');

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'REPORT4001');
});

test('카테고리가 5개 이상이면 상위 4개와 그 외로 합산하고 SKIPPED는 제외한다', async () => {
  const user = await createUser();
  await createRecords(user.id, [
    { type: 'CONSUMED', price: 6000, categoryCode: 'FASHION' },
    { type: 'CONSUMED', price: 5000, categoryCode: 'BEAUTY' },
    { type: 'CONSUMED', price: 4000, categoryCode: 'FOOD_SNACK' },
    { type: 'CONSUMED', price: 3000, categoryCode: 'CAFE_DESSERT' },
    { type: 'CONSUMED', price: 1000, categoryCode: 'HOBBY_GOODS' },
    { type: 'CONSUMED', price: 1000, categoryCode: 'ELECTRONICS' },
    { type: 'SKIPPED', price: 99999, categoryCode: 'FASHION' },
  ]);

  const response = await getReport(user);

  const { totalAmount, categories } = response.body.data.totalConsumption;
  assert.equal(totalAmount, 20000);
  assert.deepEqual(
    categories.map(({ categoryCode, amount, ratio }) => [categoryCode, amount, ratio]),
    [
      ['FASHION', 6000, 30],
      ['BEAUTY', 5000, 25],
      ['FOOD_SNACK', 4000, 20],
      ['CAFE_DESSERT', 3000, 15],
      ['ETC', 2000, 10],
    ],
  );
});

test('방어율: 참은 기록만 있으면 100, 소비만 있으면 0, 섞이면 비율로 계산한다', async () => {
  const user = await createUser();
  await createRecords(user.id, [
    { type: 'SKIPPED', price: 10000, categoryCode: 'FASHION' },
    { type: 'CONSUMED', price: 10000, categoryCode: 'BEAUTY' },
    { type: 'SKIPPED', price: 10000, categoryCode: 'FOOD_SNACK' },
    { type: 'CONSUMED', price: 30000, categoryCode: 'FOOD_SNACK' },
  ]);

  const response = await getReport(user);

  const summary = response.body.data.categoryDefenseSummary;
  const rateOf = (code) => summary.find((item) => item.categoryCode === code).defenseRate;
  assert.equal(rateOf('FASHION'), 100);
  assert.equal(rateOf('BEAUTY'), 0);
  assert.equal(rateOf('FOOD_SNACK'), 25);
});
