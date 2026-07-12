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
const { CATEGORY_CODES, CATEGORY_MAP } = await import('../src/config/categories.js');

const app = createApp();

const testEmail = 'consumption-record-test@example.com';
const testLoginId = 'consumption1';

const createAccessToken = (user) =>
  jwt.sign(
    {
      purpose: 'access',
      userId: user.id.toString(),
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );

const createTestUser = async () => {
  return prisma.user.create({
    data: {
      email: testEmail,
      loginId: testLoginId,
      nickname: 'consumption-test-user',
    },
  });
};

const deleteConsumptionTestData = async () => {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ email: testEmail }, { loginId: testLoginId }],
    },
    select: { id: true },
  });

  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await prisma.interventionAnswer.deleteMany({
      where: {
        record: {
          userId: { in: userIds },
        },
      },
    });

    await prisma.consumptionRecord.deleteMany({
      where: {
        userId: { in: userIds },
      },
    });
  }

  await prisma.user.deleteMany({
    where: {
      OR: [{ email: testEmail }, { loginId: testLoginId }],
    },
  });
};

test.beforeEach(async () => {
  await deleteConsumptionTestData();
});

test.after(async () => {
  await deleteConsumptionTestData();
  await prisma.$disconnect();
});

test('POST /api/v1/consumption-records creates a consumption record', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const categoryCode = CATEGORY_CODES[0];

  const question = await prisma.interventionQuestion.create({
    data: {
      questionText: '이 소비를 하기 전에 한 번 더 생각해보셨나요?',
      isActive: true,
      sortOrder: 1,
    },
  });

  const response = await request(app)
    .post('/api/v1/consumption-records')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'CONSUMED',
      productName: '아이스 아메리카노',
      price: 4500,
      occurredAt: '2026-07-09T12:30:00+09:00',
      category_code: categoryCode,
      interventionAnswers: [
        {
          questionId: question.id.toString(),
          answerValue: true,
        },
      ],
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.productName, '아이스 아메리카노');
  assert.equal(response.body.data.price, 4500);
  assert.equal(response.body.data.categoryCode, categoryCode);
  assert.equal(response.body.data.categoryLabel, CATEGORY_MAP[categoryCode]);
  const record = await prisma.consumptionRecord.findUnique({
    where: { id: BigInt(response.body.data.id) },
    include: {
      interventionAnswers: true,
    },
  });

  assert.ok(record);
  assert.equal(record.userId, user.id);
  assert.equal(record.categoryCode, categoryCode);
  assert.equal(record.categoryLabel, CATEGORY_MAP[categoryCode]);
  assert.equal(record.interventionAnswers.length, 1);
  assert.equal(record.interventionAnswers[0].recordId, record.id);
  assert.equal(record.interventionAnswers[0].questionId, question.id);
  assert.equal(record.interventionAnswers[0].answerValue, true);
});

test('POST /api/v1/consumption-records rejects empty occurredAt', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);

  const response = await request(app)
    .post('/api/v1/consumption-records')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'CONSUMED',
      productName: '간식',
      price: 3000,
      occurredAt: '',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4001');
});

test('POST /api/v1/consumption-records rejects invalid calendar date occurredAt', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);

  const response = await request(app)
    .post('/api/v1/consumption-records')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'CONSUMED',
      productName: '간식',
      price: 3000,
      occurredAt: '2026-02-30T12:00:00+09:00',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4001');
});

test('POST /api/v1/consumption-records rejects unsupported category_code', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);

  const response = await request(app)
    .post('/api/v1/consumption-records')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'CONSUMED',
      productName: '간식',
      price: 3000,
      category_code: 'NOT_ALLOWED_CATEGORY',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4002');
});

test('POST /api/v1/consumption-records rejects duplicate intervention question ids', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);

  const response = await request(app)
    .post('/api/v1/consumption-records')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'CONSUMED',
      productName: '간식',
      price: 3000,
      interventionAnswers: [
        { questionId: '1', answerValue: true },
        { questionId: '1', answerValue: false },
      ],
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4003');
});

test('POST /api/v1/consumption-records rejects nonexistent or inactive intervention question id', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);

  const response = await request(app)
    .post('/api/v1/consumption-records')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'CONSUMED',
      productName: '간식',
      price: 3000,
      interventionAnswers: [{ questionId: '999999999', answerValue: true }],
    });

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4042');
});
