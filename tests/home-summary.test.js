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
const testEmail = 'home-summary-test@example.com';
const testLoginId = 'homesummary1';
const RealDate = Date;
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
  if (user) {
    await prisma.monthlyBudget.deleteMany({ where: { userId: user.id } });
    await prisma.consumptionRecord.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { OR: [{ email: testEmail }, { loginId: testLoginId }] } });
};

const createUser = (data = {}) =>
  prisma.user.create({
    data: { email: testEmail, loginId: testLoginId, nickname: 'home-summary-test', ...data },
  });

const createRecords = (userId, records) =>
  prisma.consumptionRecord.createMany({
    data: records.map(({ type, price, occurredAt }) => ({
      userId,
      type,
      price,
      occurredAt: new Date(occurredAt),
      productName: `${type} ${price}`,
    })),
  });

const getSummary = async (user) => {
  const token = jwt.sign(
    { purpose: 'access', userId: user.id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
  const response = await request(app)
    .get('/api/v1/home/summary')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 200);
  return response.body.data;
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

test('GET /api/v1/home/summary requires authentication', async () => {
  const response = await request(app).get('/api/v1/home/summary');
  assert.equal(response.status, 401);
});

test('남은 예산은 월 예산 기준이며 SKIPPED는 계산하지 않는다', async () => {
  const user = await createUser();
  await prisma.monthlyBudget.create({
    data: { userId: user.id, yearMonth: '2026-08', monthlyIncome: 3000000, monthlyBudget: 1000000 },
  });
  await createRecords(user.id, [
    { type: 'CONSUMED', price: 300000, occurredAt: '2026-08-10T03:00:00Z' },
    { type: 'SKIPPED', price: 500000, occurredAt: '2026-08-10T04:00:00Z' },
  ]);

  const { remainingBudget } = await getSummary(user);

  assert.equal(remainingBudget.status, 'WITHIN');
  assert.equal(remainingBudget.amount, 700000);
});

test('예산을 초과하면 EXCEEDED 상태와 음수 금액을 반환한다', async () => {
  const user = await createUser();
  await prisma.monthlyBudget.create({
    data: { userId: user.id, yearMonth: '2026-08', monthlyBudget: 100000 },
  });
  await createRecords(user.id, [
    { type: 'CONSUMED', price: 130000, occurredAt: '2026-08-10T03:00:00Z' },
  ]);

  const { remainingBudget } = await getSummary(user);

  assert.equal(remainingBudget.status, 'EXCEEDED');
  assert.equal(remainingBudget.amount, -30000);
});

test('이번 달 예산이 없으면 다른 달 예산이 있어도 NOT_SET이다', async () => {
  const user = await createUser();
  await prisma.monthlyBudget.create({
    data: { userId: user.id, yearMonth: '2026-07', monthlyBudget: 1000000 },
  });

  const { remainingBudget } = await getSummary(user);

  assert.equal(remainingBudget.status, 'NOT_SET');
  assert.equal(remainingBudget.amount, null);
});

test('KST 월 경계: 이번 달 지출은 KST 자정 기준으로 집계한다', async () => {
  const user = await createUser();
  await createRecords(user.id, [
    { type: 'CONSUMED', price: 10000, occurredAt: '2026-07-31T14:59:59Z' },
    { type: 'CONSUMED', price: 20000, occurredAt: '2026-07-31T15:00:00Z' },
    { type: 'CONSUMED', price: 5000, occurredAt: '2026-08-31T14:59:59Z' },
    { type: 'CONSUMED', price: 99999, occurredAt: '2026-08-31T15:00:00Z' },
  ]);

  const { thisMonthSpending } = await getSummary(user);

  assert.equal(thisMonthSpending.amount, 25000);
  assert.equal(thisMonthSpending.comparisonRate, 150);
});

test('목표 달성률은 이번 달 SKIPPED만 반영하고 100%를 넘지 않는다', async () => {
  const user = await createUser({ targetSavingAmount: 100000 });
  await createRecords(user.id, [
    { type: 'SKIPPED', price: 90000, occurredAt: '2026-07-31T14:59:59Z' },
    { type: 'SKIPPED', price: 40000, occurredAt: '2026-07-31T15:00:00Z' },
  ]);

  const { goalAchievement } = await getSummary(user);
  assert.equal(goalAchievement.rate, 40);

  await createRecords(user.id, [
    { type: 'SKIPPED', price: 100000, occurredAt: '2026-08-10T03:00:00Z' },
  ]);

  const achieved = (await getSummary(user)).goalAchievement;
  assert.equal(achieved.status, 'ACHIEVED');
  assert.equal(achieved.rate, 100);
});
