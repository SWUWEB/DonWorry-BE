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
const testEmail = 'users-budget-concurrency-test@example.com';
const testLoginId = 'budgetconc1';
const yearMonth = '2026-08';

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

test.beforeEach(deleteTestData);
test.after(async () => {
  await deleteTestData();
  await prisma.$disconnect();
});

test('PUT /api/v1/users/me/budget: 전체 카테고리 예산 리스트를 저장하면 통째로 교체되어 반영된다', async () => {
  const user = await prisma.user.create({
    data: { email: testEmail, loginId: testLoginId, nickname: 'budget-concurrency-test' },
  });
  const token = jwt.sign(
    { purpose: 'access', userId: user.id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );

  await prisma.monthlyBudget.create({
    data: {
      userId: user.id,
      yearMonth,
      monthlyBudget: 500000n,
      categoryBudgets: [
        { categoryCode: 'FOOD_SNACK', budgetAmount: '100' },
        { categoryCode: 'CAFE_DESSERT', budgetAmount: '200' },
      ],
    },
  });

  const res = await request(app)
    .put('/api/v1/users/me/budget')
    .set('Authorization', `Bearer ${token}`)
    .send({
      yearMonth,
      monthlyBudget: 500000,
      categoryBudgets: [
        { categoryCode: 'FOOD_SNACK', budgetAmount: 150 },
        { categoryCode: 'CAFE_DESSERT', budgetAmount: 250 },
      ],
    });
  assert.equal(res.status, 200);

  const { categoryBudgets } = (
    await request(app)
      .get(`/api/v1/users/me/budget?yearMonth=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)
  ).body.data;

  assert.equal(categoryBudgets.length, 2);
  assert.equal(categoryBudgets.find((c) => c.categoryCode === 'FOOD_SNACK').budgetAmount, '150');
  assert.equal(categoryBudgets.find((c) => c.categoryCode === 'CAFE_DESSERT').budgetAmount, '250');
});

test('GET /api/v1/users/me/budget: monthlyBudget 기준으로 remainingAmount/usageRate를 계산한다', async () => {
  const user = await prisma.user.create({
    data: { email: testEmail, loginId: testLoginId, nickname: 'budget-concurrency-test' },
  });
  const token = jwt.sign(
    { purpose: 'access', userId: user.id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );

  await prisma.monthlyBudget.create({
    data: {
      userId: user.id,
      yearMonth,
      monthlyIncome: 1000000n,
      monthlyBudget: 500000n,
      categoryBudgets: [],
    },
  });

  await prisma.consumptionRecord.create({
    data: {
      userId: user.id,
      type: 'CONSUMED',
      productName: 'test-item',
      price: 300000,
      occurredAt: new Date(`${yearMonth}-15T00:00:00+09:00`),
    },
  });

  const res = await request(app)
    .get(`/api/v1/users/me/budget?yearMonth=${yearMonth}`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.spentAmount, '300000');
  assert.equal(res.body.data.remainingAmount, '200000');
  assert.equal(res.body.data.usageRate, 60);
});

test('GET /api/v1/users/me/budget: 예산 초과 시 remainingAmount는 음수, usageRate는 100으로 고정된다', async () => {
  const user = await prisma.user.create({
    data: { email: testEmail, loginId: testLoginId, nickname: 'budget-concurrency-test' },
  });
  const token = jwt.sign(
    { purpose: 'access', userId: user.id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );

  await prisma.monthlyBudget.create({
    data: {
      userId: user.id,
      yearMonth,
      monthlyIncome: 1000000n,
      monthlyBudget: 500000n,
      categoryBudgets: [],
    },
  });

  await prisma.consumptionRecord.create({
    data: {
      userId: user.id,
      type: 'CONSUMED',
      productName: 'overbudget-test-item',
      price: 600000,
      occurredAt: new Date(`${yearMonth}-15T00:00:00+09:00`),
    },
  });

  const res = await request(app)
    .get(`/api/v1/users/me/budget?yearMonth=${yearMonth}`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.spentAmount, '600000');
  assert.equal(res.body.data.remainingAmount, '-100000');
  assert.equal(res.body.data.usageRate, 100);
});
