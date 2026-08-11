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
const emails = ['interventions-test@example.com', 'interventions-other@example.com'];

const ensureQuestions = async () => {
  const texts = [
    '혹시 이거, 이미 가지고 있진 않나요?',
    '이거, 지금 꼭 필요한 걸까요?',
    '비슷한 거, 최근에 산 적 있지 않나요?',
  ];
  return Promise.all(
    texts.map((questionText, index) =>
      prisma.interventionQuestion.upsert({
        where: { sortOrder: index + 1 },
        create: {
          sortOrder: index + 1,
          questionText,
          isActive: true,
          riskWeight: index === 1 ? 1 : 2,
        },
        update: { questionText, isActive: true, riskWeight: index === 1 ? 1 : 2 },
      }),
    ),
  );
};

const createUser = (email) =>
  prisma.user.create({
    data: {
      email,
      loginId: email.startsWith('interventions-other') ? 'intervother' : 'intervtest',
      nickname: 'test',
    },
  });

const tokenFor = (user) =>
  jwt.sign({ purpose: 'access', userId: user.id.toString() }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '1h',
  });

const clean = async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  await prisma.consumptionRecord.deleteMany({
    where: { userId: { in: users.map(({ id }) => id) } },
  });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.interventionQuestion.updateMany({
    where: { sortOrder: { in: [1, 2, 3] } },
    data: { isActive: true },
  });
};

test.beforeEach(async () => {
  await clean();
  await ensureQuestions();
});

test.after(async () => {
  await clean();
  await prisma.$disconnect();
});

test('GET intervention questions returns Q1-Q3 and only three newest owned consumed records', async () => {
  const user = await createUser(emails[0]);
  const other = await createUser(emails[1]);
  const token = tokenFor(user);
  const base = {
    type: 'CONSUMED',
    price: 6100,
    categoryCode: 'CAFE_DESSERT',
    categoryLabel: '카페/디저트',
  };

  for (let index = 0; index < 4; index += 1) {
    await prisma.consumptionRecord.create({
      data: {
        ...base,
        userId: user.id,
        productName: `own-${index}`,
        occurredAt: new Date(`2026-07-${10 + index}T12:00:00.000Z`),
      },
    });
  }
  await prisma.consumptionRecord.create({
    data: {
      ...base,
      userId: user.id,
      type: 'SKIPPED',
      productName: 'skipped',
      occurredAt: new Date(),
    },
  });
  await prisma.consumptionRecord.create({
    data: { ...base, userId: other.id, productName: 'other', occurredAt: new Date() },
  });

  const response = await request(app)
    .get('/api/v1/intervention-questions?category_code=CAFE_DESSERT')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(
    response.body.data.questions.map(({ sortOrder }) => sortOrder),
    [1, 2, 3],
  );
  assert.deepEqual(
    response.body.data.questions.map(({ options }) => options),
    [
      [
        { answerValue: false, label: '없는 것 같아요' },
        { answerValue: true, label: '있는 것 같아요' },
      ],
      [
        { answerValue: false, label: '지금 당장 필요해요' },
        { answerValue: true, label: '나중에도 괜찮아요' },
      ],
      [
        { answerValue: true, label: '최근에 산 적 있어요' },
        { answerValue: false, label: '최근에 산 적 없어요' },
      ],
    ],
  );
  assert.equal(response.body.data.recentCategoryConsumption.totalCount, 4);
  assert.deepEqual(
    response.body.data.recentCategoryConsumption.records.map(({ productName }) => productName),
    ['own-3', 'own-2', 'own-1'],
  );
});

test('GET intervention questions returns an empty history and validates category/auth/questions', async () => {
  const user = await createUser(emails[0]);
  const token = tokenFor(user);
  const empty = await request(app)
    .get('/api/v1/intervention-questions?category_code=CAFE_DESSERT')
    .set('Authorization', `Bearer ${token}`);
  assert.deepEqual(empty.body.data.recentCategoryConsumption.records, []);
  assert.equal(empty.body.data.recentCategoryConsumption.totalCount, 0);

  const invalid = await request(app)
    .get('/api/v1/intervention-questions?category_code=UNKNOWN')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'CONSUMPTION_RECORD4002');

  const unauthenticated = await request(app).get(
    '/api/v1/intervention-questions?category_code=CAFE_DESSERT',
  );
  assert.equal(unauthenticated.status, 401);

  await prisma.interventionQuestion.update({ where: { sortOrder: 1 }, data: { isActive: false } });
  const inactive = await request(app)
    .get('/api/v1/intervention-questions?category_code=CAFE_DESSERT')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(inactive.status, 404);
  assert.equal(inactive.body.code, 'INTERVENTION4041');
});

test('POST risk analysis returns LOW, MEDIUM, HIGH without creating a record', async () => {
  const user = await createUser(emails[0]);
  const token = tokenFor(user);
  const questions = await ensureQuestions();
  const send = (values) =>
    request(app)
      .post('/api/v1/interventions/risk-score')
      .set('Authorization', `Bearer ${token}`)
      .send({
        interventionAnswers: questions.map((question, index) => ({
          questionId: question.id.toString(),
          answerValue: values[index],
        })),
      });

  const cases = [
    { values: [false, false, false], riskScore: 0, riskLevel: 'LOW' },
    { values: [false, true, false], riskScore: 1, riskLevel: 'LOW' },
    { values: [true, false, false], riskScore: 2, riskLevel: 'MEDIUM' },
    { values: [false, false, true], riskScore: 2, riskLevel: 'MEDIUM' },
    { values: [true, true, false], riskScore: 3, riskLevel: 'MEDIUM' },
    { values: [false, true, true], riskScore: 3, riskLevel: 'MEDIUM' },
    { values: [true, false, true], riskScore: 4, riskLevel: 'HIGH' },
    { values: [true, true, true], riskScore: 5, riskLevel: 'HIGH' },
  ];

  for (const expected of cases) {
    const response = await send(expected.values);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.riskScore, expected.riskScore);
    assert.equal(response.body.data.riskLevel, expected.riskLevel);
  }

  const high = await send([true, false, true]);
  assert.deepEqual(high.body.data, {
    riskScore: 4,
    riskLevel: 'HIGH',
    riskMessage: '충동소비 가능성 높음',
  });
  for (const field of [
    'productName',
    'price',
    'workHoursNeeded',
    'standardHourlyWage',
    'riskWeight',
  ]) {
    assert.equal(field in high.body.data, false);
  }
  assert.equal(await prisma.consumptionRecord.count({ where: { userId: user.id } }), 0);
});

test('POST risk analysis validates duplicate, missing, nonexistent, inactive and invalid answers', async () => {
  const user = await createUser(emails[0]);
  const token = tokenFor(user);
  const questions = await ensureQuestions();
  const post = (interventionAnswers) =>
    request(app)
      .post('/api/v1/interventions/risk-score')
      .set('Authorization', `Bearer ${token}`)
      .send({ interventionAnswers });
  const answers = questions.map(({ id }) => ({ questionId: id.toString(), answerValue: true }));

  const duplicate = await post([answers[0], answers[0], answers[2]]);
  assert.equal(duplicate.body.code, 'CONSUMPTION_RECORD4003');
  const missing = await post(answers.slice(0, 2));
  assert.equal(missing.body.code, 'RISK4001');
  const empty = await post([]);
  assert.equal(empty.body.code, 'RISK4001');
  const nonexistent = await post([
    answers[0],
    answers[1],
    { questionId: '999999999', answerValue: true },
  ]);
  assert.equal(nonexistent.body.code, 'CONSUMPTION_RECORD4042');
  await prisma.interventionQuestion.update({
    where: { id: questions[2].id },
    data: { isActive: false },
  });
  const inactive = await post(answers);
  assert.equal(inactive.body.code, 'CONSUMPTION_RECORD4042');
  const invalid = await post([{ questionId: 'abc', answerValue: 'true' }]);
  assert.equal(invalid.body.code, 'COMMON4001');
});

test('POST risk analysis fails safely when the stored risk policy is inconsistent', async () => {
  const user = await createUser(emails[0]);
  const token = tokenFor(user);
  const questions = await ensureQuestions();
  try {
    await prisma.interventionQuestion.update({
      where: { id: questions[0].id },
      data: { riskWeight: 1 },
    });

    const response = await request(app)
      .post('/api/v1/interventions/risk-score')
      .set('Authorization', `Bearer ${token}`)
      .send({
        interventionAnswers: questions.map(({ id }) => ({
          questionId: id.toString(),
          answerValue: true,
        })),
      });

    assert.equal(response.status, 500);
    assert.equal(response.body.code, 'RISK5001');
  } finally {
    await prisma.interventionQuestion.update({
      where: { id: questions[0].id },
      data: { riskWeight: 2 },
    });
  }
});
