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

const testEmail = 'ttest@ex.com';
const testLoginId = 'ttest1';
const otherEmail = 'otest@ex.com';
const otherLoginId = 'otest1';

let accessToken;
let testUser;
let otherUser;

const cleanupTestData = async () => {
  const users = await prisma.user.findMany({
    where: { OR: [{ email: testEmail }, { email: otherEmail }] },
    select: { id: true },
  });

  if (users.length > 0) {
    const userIds = users.map((u) => u.id);
    await prisma.consumptionRecord.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.wishlistDecision.deleteMany({
      where: { wishlistItem: { userId: { in: userIds } } },
    });
    await prisma.wishlistItem.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
};

test.before(async () => {
  await cleanupTestData();

  testUser = await prisma.user.create({
    data: {
      email: testEmail,
      nickname: '유혹테스터',
      loginId: testLoginId,
    },
  });

  otherUser = await prisma.user.create({
    data: {
      email: otherEmail,
      nickname: '타인테스터',
      loginId: otherLoginId,
    },
  });

  accessToken = jwt.sign(
    { purpose: 'access', userId: testUser.id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
});

test.after(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

test.afterEach(async () => {
  const users = await prisma.user.findMany({
    where: { OR: [{ email: testEmail }, { email: otherEmail }] },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  await prisma.consumptionRecord.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.wishlistDecision.deleteMany({
    where: { wishlistItem: { userId: { in: userIds } } },
  });
  await prisma.wishlistItem.deleteMany({ where: { userId: { in: userIds } } });
});

test('POST /api/v1/temptations/:temptationId/decisions - WAITING 상태에서 BUY 시 status가 DECIDED로 변경되고 알림이 삭제된다', async () => {
  const item = await prisma.wishlistItem.create({
    data: {
      userId: testUser.id,
      productName: '맥북 프로',
      price: 3000000,
      categoryCode: 'ELECTRONICS',
      status: 'WAITING',
    },
  });

  await prisma.notification.create({
    data: {
      userId: testUser.id,
      wishlistItemId: item.id,
      notificationType: 'TEMPTATION',
      title: '결단의 시간이 왔어요!',
      body: '대기 시간이 끝났어요.',
      notifyAt: new Date(Date.now() + 1000 * 60 * 60),
    },
  });

  const response = await request(app)
    .post(`/api/v1/temptations/${item.id}/decisions`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ decisionType: 'BUY' });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.decisionType, 'BUY');

  const updatedItem = await prisma.wishlistItem.findUnique({ where: { id: item.id } });
  assert.equal(updatedItem.status, 'DECIDED');

  const decision = await prisma.wishlistDecision.findFirst({
    where: { wishlistItemId: item.id },
  });
  assert.ok(decision);
  assert.equal(decision.decisionType, 'BUY');

  const remainingNotifications = await prisma.notification.findMany({
    where: { wishlistItemId: item.id },
  });
  assert.equal(remainingNotifications.length, 0);
});

test('POST /api/v1/temptations/:temptationId/decisions - WAITING 상태에서 SKIP 시 status가 DECIDED로 변경되고 ConsumptionRecord(SKIPPED)가 추가된다', async () => {
  const item = await prisma.wishlistItem.create({
    data: {
      userId: testUser.id,
      productName: '고급 의자',
      price: 500000,
      categoryCode: 'FURNITURE',
      status: 'WAITING',
    },
  });

  const response = await request(app)
    .post(`/api/v1/temptations/${item.id}/decisions`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ decisionType: 'SKIP' });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);

  const updatedItem = await prisma.wishlistItem.findUnique({ where: { id: item.id } });
  assert.equal(updatedItem.status, 'DECIDED');

  const record = await prisma.consumptionRecord.findFirst({
    where: { userId: testUser.id, productName: '고급 의자' },
  });
  assert.ok(record);
  assert.equal(record.type, 'SKIPPED');
  assert.equal(Number(record.price), 500000);
});

test('POST /api/v1/temptations/:temptationId/decisions - 최초 DELAY 시 status는 WAITING을 유지하고 waitUntil/waitType이 연장 갱신된다', async () => {
  const item = await prisma.wishlistItem.create({
    data: {
      userId: testUser.id,
      productName: '운동화',
      price: 100000,
      categoryCode: 'CLOTHING',
      status: 'WAITING',
      waitUntil: null,
    },
  });

  const beforeReq = Date.now();

  const response = await request(app)
    .post(`/api/v1/temptations/${item.id}/decisions`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      decisionType: 'DELAY',
      selectedWaitType: '1H',
    });

  const afterReq = Date.now();

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);

  const updatedItem = await prisma.wishlistItem.findUnique({ where: { id: item.id } });
  assert.equal(updatedItem.status, 'WAITING');
  assert.equal(updatedItem.waitType, 'ONE_HOUR');

  const waitUntilTime = new Date(updatedItem.waitUntil).getTime();
  const expectedMin = beforeReq + 1000 * 60 * 60 - 5000;
  const expectedMax = afterReq + 1000 * 60 * 60 + 5000;
  assert.ok(waitUntilTime >= expectedMin && waitUntilTime <= expectedMax);
});

test('POST /api/v1/temptations/:temptationId/decisions - 아직 대기 시간이 도달하지 않은(미래) 상태에서 DELAY 시 400 에러를 반환한다', async () => {
  const futureTime = new Date(Date.now() + 1000 * 60 * 60);
  const item = await prisma.wishlistItem.create({
    data: {
      userId: testUser.id,
      productName: '키보드',
      price: 150000,
      categoryCode: 'ELECTRONICS',
      status: 'WAITING',
      waitType: 'ONE_HOUR',
      waitUntil: futureTime,
    },
  });

  const response = await request(app)
    .post(`/api/v1/temptations/${item.id}/decisions`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      decisionType: 'DELAY',
      selectedWaitType: '1D',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'WISH4003');
});

test('POST /api/v1/temptations/:temptationId/decisions - 대기 시간이 지난(과거) 상태에서 DELAY 및 2회 연속 DELAY 요청 시 정상 재연장된다', async () => {
  const pastTime = new Date(Date.now() - 1000 * 60 * 60);
  const item = await prisma.wishlistItem.create({
    data: {
      userId: testUser.id,
      productName: '모니터',
      price: 300000,
      categoryCode: 'ELECTRONICS',
      status: 'WAITING',
      waitType: 'ONE_HOUR',
      waitUntil: pastTime,
    },
  });

  const beforeFirstReq = Date.now();
  const firstResponse = await request(app)
    .post(`/api/v1/temptations/${item.id}/decisions`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      decisionType: 'DELAY',
      selectedWaitType: '1D',
    });

  assert.equal(firstResponse.status, 201);

  let updatedItem = await prisma.wishlistItem.findUnique({ where: { id: item.id } });
  assert.equal(updatedItem.waitType, 'ONE_DAY');

  const firstWaitUntil = new Date(updatedItem.waitUntil).getTime();
  assert.ok(firstWaitUntil >= beforeFirstReq + 1000 * 60 * 60 * 24 - 5000);

  await prisma.wishlistItem.update({
    where: { id: item.id },
    data: { waitUntil: new Date(Date.now() - 1000 * 60) },
  });

  const secondResponse = await request(app)
    .post(`/api/v1/temptations/${item.id}/decisions`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      decisionType: 'DELAY',
      selectedWaitType: '1H',
    });

  assert.equal(secondResponse.status, 201);

  updatedItem = await prisma.wishlistItem.findUnique({ where: { id: item.id } });
  assert.equal(updatedItem.waitType, 'ONE_HOUR');
});

test('POST /api/v1/temptations/:temptationId/decisions - DELAY 요청 시 selectedWaitType 누락 시 400 에러를 반환한다', async () => {
  const item = await prisma.wishlistItem.create({
    data: {
      userId: testUser.id,
      productName: '헤드폰',
      price: 200000,
      categoryCode: 'ELECTRONICS',
      status: 'WAITING',
    },
  });

  const response = await request(app)
    .post(`/api/v1/temptations/${item.id}/decisions`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ decisionType: 'DELAY' });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'WISH4002');
});

test('POST /api/v1/temptations/:temptationId/decisions - 이미 DECIDED 상태인 항목에 결정 요청 시 409 에러를 반환한다', async () => {
  const item = await prisma.wishlistItem.create({
    data: {
      userId: testUser.id,
      productName: '지갑',
      price: 100000,
      categoryCode: 'FASHION',
      status: 'DECIDED',
    },
  });

  const response = await request(app)
    .post(`/api/v1/temptations/${item.id}/decisions`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ decisionType: 'BUY' });

  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'WISH4091');
});

test('POST /api/v1/temptations/:temptationId/decisions - 타인의 위시리스트 항목에 결정 요청 시 403 에러를 반환한다', async () => {
  const item = await prisma.wishlistItem.create({
    data: {
      userId: otherUser.id,
      productName: '타인의 자전거',
      price: 500000,
      categoryCode: 'SPORTS',
      status: 'WAITING',
    },
  });

  const response = await request(app)
    .post(`/api/v1/temptations/${item.id}/decisions`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ decisionType: 'BUY' });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'WISH4031');
});
