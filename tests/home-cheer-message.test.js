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

const { buildCheerMessage, calculateAchievementRate, getCheerMessage, getMessageLevel } =
  await import('../src/features/home/home.service.js');
const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');

const app = createApp();
const testEmail = 'home-cheer-message-test@example.com';
const testLoginId = 'homecheer1';

const createAccessToken = (user) =>
  jwt.sign({ purpose: 'access', userId: user.id.toString() }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '1h',
  });

const deleteTestData = async () => {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: testEmail }, { loginId: testLoginId }] },
    select: { id: true },
  });
  if (user) await prisma.consumptionRecord.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({
    where: { OR: [{ email: testEmail }, { loginId: testLoginId }] },
  });
};

test.beforeEach(deleteTestData);
test.after(async () => {
  await deleteTestData();
  await prisma.$disconnect();
});

test('achievement rate boundaries select the correct message level', () => {
  const cases = [
    [0, 'LEVEL_1'],
    [19, 'LEVEL_1'],
    [20, 'LEVEL_2'],
    [49, 'LEVEL_2'],
    [50, 'LEVEL_3'],
    [69, 'LEVEL_3'],
    [70, 'LEVEL_4'],
    [89, 'LEVEL_4'],
    [90, 'LEVEL_5'],
    [100, 'LEVEL_5'],
  ];
  for (const [rate, expected] of cases) assert.equal(getMessageLevel(rate), expected);
});

test('achievement rate is floored and capped at 100', () => {
  assert.equal(
    buildCheerMessage({
      userId: 1n,
      targetAmount: 300,
      skippedAmount: 149,
      now: new Date('2026-08-13T03:00:00Z'),
    }).achievementRate,
    49,
  );
  assert.equal(
    buildCheerMessage({ userId: 1n, targetAmount: 100, skippedAmount: 130 }).achievementRate,
    100,
  );
});

test('achievement rate preserves BigInt and decimal precision', () => {
  assert.equal(calculateAchievementRate('4503599627370496.50', 9007199254740993n), 50);
  assert.equal(calculateAchievementRate('8999999999999999.99', 9000000000000000n), 99);
  assert.equal(calculateAchievementRate('100.99', 100n), 100);
});

test('same user, KST date, and level always select the same message', () => {
  const input = {
    userId: 7n,
    targetAmount: 100000,
    skippedAmount: 72000,
    now: new Date('2026-08-13T14:59:00Z'),
  };
  assert.deepEqual(buildCheerMessage(input), buildCheerMessage(input));
});

test('KST date changes at 15:00 UTC and permits a new daily selection', () => {
  const beforeMidnight = buildCheerMessage({
    userId: 7n,
    targetAmount: 100000,
    skippedAmount: 72000,
    now: new Date('2026-08-13T14:59:59Z'),
  });
  const afterMidnight = buildCheerMessage({
    userId: 7n,
    targetAmount: 100000,
    skippedAmount: 72000,
    now: new Date('2026-08-13T15:00:00Z'),
  });
  assert.equal(beforeMidnight.messageLevel, afterMidnight.messageLevel);
  assert.equal(typeof afterMidnight.message, 'string');
});

test('getCheerMessage reads the goal and sums positive SKIPPED records', async () => {
  const calls = [];
  const result = await getCheerMessage(3n, new Date('2026-08-13T03:00:00Z'), {
    user: {
      findUnique: async (args) => {
        calls.push(['findUnique', args]);
        return { targetSavingAmount: 200000n };
      },
    },
    consumptionRecord: {
      aggregate: async (args) => {
        calls.push(['aggregate', args]);
        return { _sum: { price: 100000 } };
      },
    },
  });
  assert.equal(result.achievementRate, 50);
  assert.equal(result.messageLevel, 'LEVEL_3');
  assert.equal(typeof result.message, 'string');
  assert.deepEqual(calls, [
    [
      'findUnique',
      {
        where: { id: 3n },
        select: { targetSavingAmount: true },
      },
    ],
    [
      'aggregate',
      {
        where: { userId: 3n, type: 'SKIPPED', price: { gt: 0 } },
        _sum: { price: true },
      },
    ],
  ]);
});

test('getCheerMessage returns GOAL4041 when a goal is not set', async () => {
  await assert.rejects(
    getCheerMessage(3n, new Date(), {
      user: {
        findUnique: async () => ({ targetSavingAmount: null }),
      },
    }),
    (error) => error.statusCode === 404 && error.errorCode === 'GOAL4041',
  );
});

test('GET /api/v1/home/cheer-message requires authentication', async () => {
  const response = await request(app).get('/api/v1/home/cheer-message');
  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test('GET /api/v1/home/cheer-message sums only SKIPPED records and does not mutate data', async () => {
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      loginId: testLoginId,
      nickname: 'home-cheer-test',
      targetSavingAmount: 100000,
      accumulatedSavedAmount: 999999,
    },
  });
  await prisma.consumptionRecord.createMany({
    data: [
      {
        userId: user.id,
        type: 'SKIPPED',
        productName: '참은 소비 1',
        price: 20000,
        occurredAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        userId: user.id,
        type: 'SKIPPED',
        productName: '참은 소비 2',
        price: 30000,
        occurredAt: new Date('2026-08-01T00:00:00Z'),
      },
      {
        userId: user.id,
        type: 'CONSUMED',
        productName: '소비',
        price: 80000,
        occurredAt: new Date('2026-08-01T00:00:00Z'),
      },
    ],
  });
  const beforeUser = await prisma.user.findUnique({ where: { id: user.id } });
  const beforeRecords = await prisma.consumptionRecord.findMany({
    where: { userId: user.id },
    orderBy: { id: 'asc' },
  });
  const token = createAccessToken(user);

  const first = await request(app)
    .get('/api/v1/home/cheer-message')
    .set('Authorization', `Bearer ${token}`);
  const second = await request(app)
    .get('/api/v1/home/cheer-message')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(first.status, 200);
  assert.deepEqual(first.body, second.body);
  assert.equal(first.body.data.achievementRate, 50);
  assert.equal(first.body.data.messageLevel, 'LEVEL_3');
  const afterUser = await prisma.user.findUnique({ where: { id: user.id } });
  const afterRecords = await prisma.consumptionRecord.findMany({
    where: { userId: user.id },
    orderBy: { id: 'asc' },
  });
  assert.deepEqual(afterUser, beforeUser);
  assert.deepEqual(afterRecords, beforeRecords);
});

test('GET /api/v1/home/cheer-message returns GOAL4041 when goal is absent', async () => {
  const user = await prisma.user.create({
    data: { email: testEmail, loginId: testLoginId, nickname: 'home-cheer-test' },
  });
  const response = await request(app)
    .get('/api/v1/home/cheer-message')
    .set('Authorization', `Bearer ${createAccessToken(user)}`);
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'GOAL4041');
});

test('Swagger documents cheer message success, auth, and goal errors', async () => {
  const response = await request(app).get('/api-docs.json');
  const operation = response.body.paths['/api/v1/home/cheer-message'].get;
  assert.equal(
    operation.responses['200'].content['application/json'].schema.$ref,
    '#/components/schemas/CheerMessageResponse',
  );
  assert.equal(operation.responses['401'].$ref, '#/components/responses/Unauthorized');
  assert.equal(
    operation.responses['404'].content['application/json'].examples.goalNotSet.value.code,
    'GOAL4041',
  );
});
