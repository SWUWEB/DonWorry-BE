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
const otherTestEmail = 'consumption-record-other-test@example.com';
const otherTestLoginId = 'consumption2';

const createAccessToken = (user) =>
  jwt.sign(
    {
      purpose: 'access',
      userId: user.id.toString(),
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );

const createTestUser = async ({
  email = testEmail,
  loginId = testLoginId,
  nickname = 'consumption-test-user',
} = {}) => {
  return prisma.user.create({
    data: {
      email,
      loginId,
      nickname,
    },
  });
};

const createTestQuestion = async () => {
  const aggregate = await prisma.interventionQuestion.aggregate({
    _max: { sortOrder: true },
  });

  return prisma.interventionQuestion.create({
    data: {
      questionText: `consumption-record-test-${Date.now()}`,
      isActive: true,
      sortOrder: (aggregate._max.sortOrder ?? 0) + 1,
    },
  });
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

const createTestRecord = async (user, data = {}) => {
  const categoryCode = data.categoryCode ?? CATEGORY_CODES[0];

  return prisma.consumptionRecord.create({
    data: {
      userId: user.id,
      type: data.type ?? 'CONSUMED',
      productName: data.productName ?? 'test snack',
      price: data.price ?? 3000,
      categoryCode,
      categoryLabel: data.categoryLabel ?? CATEGORY_MAP[categoryCode],
      occurredAt: data.occurredAt ?? new Date('2026-07-09T03:30:00.000Z'),
      riskScore: data.riskScore ?? 10,
      productUrl: data.productUrl ?? null,
      reason: data.reason ?? null,
      workHoursNeeded: data.workHoursNeeded ?? null,
      urlParseSuccess: false,
    },
  });
};

const deleteConsumptionTestData = async () => {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: testEmail },
        { loginId: testLoginId },
        { email: otherTestEmail },
        { loginId: otherTestLoginId },
      ],
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
      OR: [
        { email: testEmail },
        { loginId: testLoginId },
        { email: otherTestEmail },
        { loginId: otherTestLoginId },
      ],
    },
  });

  await prisma.interventionQuestion.deleteMany({
    where: {
      questionText: {
        startsWith: 'consumption-record-test-',
      },
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
      sortOrder:
        ((await prisma.interventionQuestion.aggregate({ _max: { sortOrder: true } }))._max
          .sortOrder ?? 0) + 1,
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
  assert.ok(response.body.errors);
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
  assert.ok(response.body.errors);
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
  assert.ok(response.body.errors);
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
  assert.ok(response.body.errors);
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

test('GET /api/v1/consumption-records requires authentication', async () => {
  const response = await request(app).get('/api/v1/consumption-records');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    message: 'Authentication required',
  });
});

test('GET /api/v1/consumption-records rejects an invalid access token', async () => {
  const response = await request(app)
    .get('/api/v1/consumption-records')
    .set('Authorization', 'Bearer invalid-token');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    message: 'Invalid or expired token',
  });
});

test('GET /api-docs.json documents the actual consumption authentication response', async () => {
  const response = await request(app).get('/api-docs.json');

  assert.equal(response.status, 200);
  assert.equal(
    response.body.paths['/api/v1/consumption-records'].get.responses['401'].$ref,
    '#/components/responses/Unauthorized',
  );
  assert.equal(
    response.body.components.responses.Unauthorized.content['application/json'].schema.$ref,
    '#/components/schemas/UnauthorizedResponse',
  );
  assert.deepEqual(response.body.components.schemas.UnauthorizedResponse.required, [
    'success',
    'message',
  ]);
  assert.deepEqual(
    response.body.components.responses.Unauthorized.content['application/json'].examples
      .missingToken.value,
    {
      success: false,
      message: 'Authentication required',
    },
  );
});

test('GET /api/v1/consumption-records returns only the authenticated user records', async () => {
  const user = await createTestUser();
  const otherUser = await createTestUser({
    email: otherTestEmail,
    loginId: otherTestLoginId,
    nickname: 'other-consumption-test-user',
  });
  const accessToken = createAccessToken(user);

  const olderRecord = await createTestRecord(user, {
    productName: 'older own record',
    occurredAt: daysAgo(2),
  });
  const newerRecord = await createTestRecord(user, {
    productName: 'newer own record',
    occurredAt: daysAgo(1),
  });
  await createTestRecord(otherUser, { productName: 'other user record' });

  const response = await request(app)
    .get('/api/v1/consumption-records')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(
    response.body.data.map((record) => record.id),
    [newerRecord.id.toString(), olderRecord.id.toString()],
  );
});

test('GET /api/v1/consumption-records filters the last 28 days by consumption type', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);

  const consumedRecord = await createTestRecord(user, {
    type: 'CONSUMED',
    productName: '투썸플레이스 신봉점',
    price: 6500,
    categoryCode: CATEGORY_CODES[1],
    occurredAt: daysAgo(1),
  });
  const skippedRecord = await createTestRecord(user, {
    type: 'SKIPPED',
    productName: '참은 야식',
    price: 18000,
    categoryCode: CATEGORY_CODES[2],
    occurredAt: daysAgo(2),
  });
  await createTestRecord(user, {
    type: 'CONSUMED',
    productName: '28일 범위 밖 기록',
    occurredAt: daysAgo(29),
  });

  const allResponse = await request(app)
    .get('/api/v1/consumption-records?type=ALL')
    .set('Authorization', `Bearer ${accessToken}`);
  const consumedResponse = await request(app)
    .get('/api/v1/consumption-records?type=CONSUMED')
    .set('Authorization', `Bearer ${accessToken}`);
  const skippedResponse = await request(app)
    .get('/api/v1/consumption-records?type=SKIPPED')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(allResponse.status, 200);
  assert.deepEqual(
    allResponse.body.data.map((record) => record.id),
    [consumedRecord.id.toString(), skippedRecord.id.toString()],
  );
  assert.deepEqual(
    {
      type: allResponse.body.data[0].type,
      productName: allResponse.body.data[0].productName,
      price: allResponse.body.data[0].price,
      categoryLabel: allResponse.body.data[0].categoryLabel,
      hasOccurredAt: typeof allResponse.body.data[0].occurredAt === 'string',
    },
    {
      type: 'CONSUMED',
      productName: '투썸플레이스 신봉점',
      price: 6500,
      categoryLabel: CATEGORY_MAP[CATEGORY_CODES[1]],
      hasOccurredAt: true,
    },
  );
  assert.deepEqual(
    consumedResponse.body.data.map((record) => record.id),
    [consumedRecord.id.toString()],
  );
  assert.deepEqual(
    skippedResponse.body.data.map((record) => record.id),
    [skippedRecord.id.toString()],
  );
});

test('GET /api/v1/consumption-records rejects an unsupported type filter', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);

  const response = await request(app)
    .get('/api/v1/consumption-records?type=UNKNOWN')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
  assert.ok(response.body.errors);
});

for (const method of ['get', 'put', 'delete']) {
  test(`${method.toUpperCase()} /api/v1/consumption-records/:id rejects an invalid path id`, async () => {
    const user = await createTestUser();
    const accessToken = createAccessToken(user);

    const requester = request(app);
    const response = await requester[method]('/api/v1/consumption-records/abc').set(
      'Authorization',
      `Bearer ${accessToken}`,
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'COMMON4001');
    assert.ok(response.body.errors);
  });
}

test('GET /api/v1/consumption-records/:id returns a record detail owned by the user', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const question = await createTestQuestion();
  const record = await createTestRecord(user, {
    productName: '투썸플레이스 신봉점',
    price: 6500,
    categoryCode: CATEGORY_CODES[1],
    reason: '친구와 시간을 보내고 싶어서',
    occurredAt: daysAgo(2),
  });
  const recentSameCategoryRecord = await createTestRecord(user, {
    productName: '같은 카테고리의 최근 소비',
    categoryCode: CATEGORY_CODES[1],
    occurredAt: daysAgo(1),
  });
  await createTestRecord(user, {
    type: 'SKIPPED',
    productName: '같은 카테고리지만 참은 소비',
    categoryCode: CATEGORY_CODES[1],
    occurredAt: daysAgo(1),
  });
  await createTestRecord(user, {
    productName: '다른 카테고리 소비',
    categoryCode: CATEGORY_CODES[2],
    occurredAt: daysAgo(1),
  });
  await createTestRecord(user, {
    productName: '28일 범위 밖 같은 카테고리 소비',
    categoryCode: CATEGORY_CODES[1],
    occurredAt: daysAgo(29),
  });

  await prisma.interventionAnswer.create({
    data: {
      recordId: record.id,
      questionId: question.id,
      answerValue: true,
    },
  });

  const response = await request(app)
    .get(`/api/v1/consumption-records/${record.id}`)
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.id, record.id.toString());
  assert.equal(response.body.data.productName, '투썸플레이스 신봉점');
  assert.equal(response.body.data.price, 6500);
  assert.equal(response.body.data.categoryCode, CATEGORY_CODES[1]);
  assert.equal(response.body.data.categoryLabel, CATEGORY_MAP[CATEGORY_CODES[1]]);
  assert.equal(response.body.data.reason, '친구와 시간을 보내고 싶어서');
  assert.equal(response.body.data.interventionAnswers.length, 1);
  assert.equal(response.body.data.interventionAnswers[0].questionId, question.id.toString());
  assert.equal(response.body.data.recentCategoryConsumptionCount, 2);
  assert.deepEqual(
    response.body.data.recentCategoryConsumptions.map((item) => item.id),
    [recentSameCategoryRecord.id.toString(), record.id.toString()],
  );
  assert.deepEqual(
    {
      productName: response.body.data.recentCategoryConsumptions[0].productName,
      price: response.body.data.recentCategoryConsumptions[0].price,
      categoryLabel: response.body.data.recentCategoryConsumptions[0].categoryLabel,
      hasOccurredAt:
        typeof response.body.data.recentCategoryConsumptions[0].occurredAt === 'string',
    },
    {
      productName: '같은 카테고리의 최근 소비',
      price: 3000,
      categoryLabel: CATEGORY_MAP[CATEGORY_CODES[1]],
      hasOccurredAt: true,
    },
  );
});

test('GET /api/v1/consumption-records/:id returns 404 when the record does not exist', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);

  const response = await request(app)
    .get('/api/v1/consumption-records/999999999')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4041');
});

test('GET /api/v1/consumption-records/:id returns 404 for another user record', async () => {
  const user = await createTestUser();
  const otherUser = await createTestUser({
    email: otherTestEmail,
    loginId: otherTestLoginId,
    nickname: 'other-consumption-test-user',
  });
  const accessToken = createAccessToken(user);
  const otherRecord = await createTestRecord(otherUser);

  const response = await request(app)
    .get(`/api/v1/consumption-records/${otherRecord.id}`)
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4041');
});

test('PUT /api/v1/consumption-records/:id updates a record owned by the user', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const question = await createTestQuestion();
  const record = await createTestRecord(user, {
    productName: 'before update',
    categoryCode: CATEGORY_CODES[0],
  });

  const response = await request(app)
    .put(`/api/v1/consumption-records/${record.id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'SKIPPED',
      productName: 'after update',
      price: 9900,
      occurredAt: '2026-07-10T12:30:00+09:00',
      category_code: CATEGORY_CODES[2],
      riskScore: 80,
      interventionAnswers: [{ questionId: question.id.toString(), answerValue: false }],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.productName, 'after update');
  assert.equal(response.body.data.type, 'SKIPPED');
  assert.equal(response.body.data.price, 9900);
  assert.equal(response.body.data.categoryCode, CATEGORY_CODES[2]);
  assert.equal(response.body.data.categoryLabel, CATEGORY_MAP[CATEGORY_CODES[2]]);

  const updatedRecord = await prisma.consumptionRecord.findUnique({
    where: { id: record.id },
    include: { interventionAnswers: true },
  });

  assert.equal(updatedRecord.productName, 'after update');
  assert.equal(updatedRecord.categoryCode, CATEGORY_CODES[2]);
  assert.equal(updatedRecord.interventionAnswers.length, 1);
  assert.equal(updatedRecord.interventionAnswers[0].questionId, question.id);
  assert.equal(updatedRecord.interventionAnswers[0].answerValue, false);
});

test('PUT /api/v1/consumption-records/:id rejects invalid values', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const record = await createTestRecord(user);

  const response = await request(app)
    .put(`/api/v1/consumption-records/${record.id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      riskScore: 101,
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
  assert.ok(response.body.errors);
});

test('PUT /api/v1/consumption-records/:id rejects invalid occurredAt with a consumption error code', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const record = await createTestRecord(user);

  const response = await request(app)
    .put(`/api/v1/consumption-records/${record.id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      occurredAt: '2026-02-30T12:00:00+09:00',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4001');
  assert.ok(response.body.errors);
});

test('PUT /api/v1/consumption-records/:id rejects duplicate intervention question ids', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const record = await createTestRecord(user);

  const response = await request(app)
    .put(`/api/v1/consumption-records/${record.id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      interventionAnswers: [
        { questionId: '1', answerValue: true },
        { questionId: '1', answerValue: false },
      ],
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4003');
  assert.ok(response.body.errors);
});
test('PUT /api/v1/consumption-records/:id returns 400 for unsupported category_code', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const record = await createTestRecord(user);

  const response = await request(app)
    .put(`/api/v1/consumption-records/${record.id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      category_code: 'NOT_ALLOWED_CATEGORY',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4002');
  assert.ok(response.body.errors);
});

test('PUT /api/v1/consumption-records/:id returns 404 for another user record', async () => {
  const user = await createTestUser();
  const otherUser = await createTestUser({
    email: otherTestEmail,
    loginId: otherTestLoginId,
    nickname: 'other-consumption-test-user',
  });
  const accessToken = createAccessToken(user);
  const otherRecord = await createTestRecord(otherUser);

  const response = await request(app)
    .put(`/api/v1/consumption-records/${otherRecord.id}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      productName: 'blocked update',
    });

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4041');
});

test('DELETE /api/v1/consumption-records/:id deletes a record owned by the user', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);
  const record = await createTestRecord(user);

  const response = await request(app)
    .delete(`/api/v1/consumption-records/${record.id}`)
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  const deletedRecord = await prisma.consumptionRecord.findUnique({
    where: { id: record.id },
  });
  assert.equal(deletedRecord, null);
});

test('DELETE /api/v1/consumption-records/:id returns 404 when the record does not exist', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user);

  const response = await request(app)
    .delete('/api/v1/consumption-records/999999999')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4041');
});

test('DELETE /api/v1/consumption-records/:id returns 404 for another user record', async () => {
  const user = await createTestUser();
  const otherUser = await createTestUser({
    email: otherTestEmail,
    loginId: otherTestLoginId,
    nickname: 'other-consumption-test-user',
  });
  const accessToken = createAccessToken(user);
  const otherRecord = await createTestRecord(otherUser);

  const response = await request(app)
    .delete(`/api/v1/consumption-records/${otherRecord.id}`)
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'CONSUMPTION_RECORD4041');
});
