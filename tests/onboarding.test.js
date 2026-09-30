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
const { INTEREST_TAGS } = await import('../src/config/interest-tags.js');

const app = createApp();
const testEmail = 'onboarding-test@example.com';
const testLoginId = 'onboarding1';
const [tagA, tagB, tagC] = INTEREST_TAGS;

const deleteTestData = () =>
  prisma.user.deleteMany({ where: { OR: [{ email: testEmail }, { loginId: testLoginId }] } });

const createUser = () =>
  prisma.user.create({
    data: { email: testEmail, loginId: testLoginId, nickname: 'onboarding-test' },
  });

const authHeader = (user) => ({
  Authorization: `Bearer ${jwt.sign(
    { purpose: 'access', userId: user.id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  )}`,
});

test.beforeEach(deleteTestData);
test.after(async () => {
  await deleteTestData();
  await prisma.$disconnect();
});

test('GET/PUT /api/v1/onboarding requires authentication', async () => {
  const getResponse = await request(app).get('/api/v1/onboarding');
  const putResponse = await request(app).put('/api/v1/onboarding').send({});
  assert.equal(getResponse.status, 401);
  assert.equal(putResponse.status, 401);
});

test('온보딩 전에는 모든 값이 null이다', async () => {
  const user = await createUser();

  const response = await request(app).get('/api/v1/onboarding').set(authHeader(user));

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, {
    interestTags: null,
    savingGoalText: null,
    targetSavingAmount: null,
  });
});

test('저장한 온보딩 정보를 조회하면 같은 값이 나오고 완료 시각이 기록된다', async () => {
  const user = await createUser();
  const body = {
    interestTags: [tagA, tagB],
    savingGoalText: '여행',
    targetSavingAmount: 500000,
  };

  const putResponse = await request(app).put('/api/v1/onboarding').set(authHeader(user)).send(body);
  const getResponse = await request(app).get('/api/v1/onboarding').set(authHeader(user));

  const expected = {
    interestTags: [tagA, tagB],
    savingGoalText: '여행',
    targetSavingAmount: '500000',
  };
  assert.equal(putResponse.status, 200);
  assert.deepEqual(putResponse.body.data, expected);
  assert.deepEqual(getResponse.body.data, expected);

  const saved = await prisma.user.findUnique({ where: { id: user.id } });
  assert.notEqual(saved.onboardingCompletedAt, null);
});

test('다시 저장하면 이전 값을 덮어쓴다', async () => {
  const user = await createUser();
  await request(app)
    .put('/api/v1/onboarding')
    .set(authHeader(user))
    .send({ interestTags: [tagA], savingGoalText: '여행', targetSavingAmount: 500000 });

  await request(app)
    .put('/api/v1/onboarding')
    .set(authHeader(user))
    .send({ interestTags: [tagB, tagC], savingGoalText: '노트북', targetSavingAmount: 1000000 });

  const response = await request(app).get('/api/v1/onboarding').set(authHeader(user));
  assert.deepEqual(response.body.data, {
    interestTags: [tagB, tagC],
    savingGoalText: '노트북',
    targetSavingAmount: '1000000',
  });
});

test('허용되지 않은 관심 소비 영역은 400을 반환하고 저장하지 않는다', async () => {
  const user = await createUser();

  const response = await request(app)
    .put('/api/v1/onboarding')
    .set(authHeader(user))
    .send({ interestTags: ['없는라벨'], savingGoalText: '여행', targetSavingAmount: 500000 });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'COMMON4001');
  const saved = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(saved.onboardingCompletedAt, null);
});
