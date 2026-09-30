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
const testEmails = ['notifications-test@example.com', 'notifications-other-test@example.com'];
const testLoginIds = ['notiftest1', 'notifother1'];

const deleteTestData = async () => {
  const where = { OR: [{ email: { in: testEmails } }, { loginId: { in: testLoginIds } }] };
  const users = await prisma.user.findMany({ where, select: { id: true } });
  await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where });
};

const createUser = (index) =>
  prisma.user.create({
    data: {
      email: testEmails[index],
      loginId: testLoginIds[index],
      nickname: 'notifications-test',
    },
  });

const authHeader = (user) => ({
  Authorization: `Bearer ${jwt.sign(
    { purpose: 'access', userId: user.id.toString() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  )}`,
});

const hoursFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

const createNotification = (
  userId,
  { title, type = 'GENERAL', notifyAt = hoursFromNow(-1), isRead = false },
) =>
  prisma.notification.create({
    data: { userId, title, body: title, notificationType: type, notifyAt, isRead },
  });

const listTitles = async (user, query = '') => {
  const response = await request(app).get(`/api/v1/notifications${query}`).set(authHeader(user));
  assert.equal(response.status, 200);
  return response.body.data.map((notification) => notification.title);
};

test.beforeEach(deleteTestData);
test.after(async () => {
  await deleteTestData();
  await prisma.$disconnect();
});

test('GET /api/v1/notifications requires authentication', async () => {
  const response = await request(app).get('/api/v1/notifications');
  assert.equal(response.status, 401);
});

test('예약 알림은 notifyAt 전에는 보이지 않고 시각이 지나면 조회된다', async () => {
  const user = await createUser(0);
  const notification = await createNotification(user.id, {
    title: '예약 알림',
    notifyAt: hoursFromNow(1),
  });

  assert.deepEqual(await listTitles(user), []);

  await prisma.notification.update({
    where: { id: notification.id },
    data: { notifyAt: hoursFromNow(-1) },
  });

  assert.deepEqual(await listTitles(user), ['예약 알림']);
});

test('유형 필터는 해당 유형의 알림만 반환한다', async () => {
  const user = await createUser(0);
  await createNotification(user.id, { title: '일반', type: 'GENERAL' });
  await createNotification(user.id, { title: '목표', type: 'GOAL' });

  assert.deepEqual(await listTitles(user, '?type=GOAL'), ['목표']);
  assert.equal((await listTitles(user, '?type=ALL')).length, 2);
});

test('정렬은 notifyAt 기준이며 읽지 않은 알림 우선 정렬을 지원한다', async () => {
  const user = await createUser(0);
  await createNotification(user.id, { title: 'A', notifyAt: hoursFromNow(-3) });
  await createNotification(user.id, { title: 'B', notifyAt: hoursFromNow(-2) });
  await createNotification(user.id, { title: 'C', notifyAt: hoursFromNow(-1), isRead: true });

  assert.deepEqual(await listTitles(user, '?sort=LATEST'), ['C', 'B', 'A']);
  assert.deepEqual(await listTitles(user, '?sort=OLDEST'), ['A', 'B', 'C']);
  assert.deepEqual(await listTitles(user, '?sort=UNREAD_FIRST'), ['B', 'A', 'C']);
});

test('개별 읽음 처리는 readAt을 기록하고 전체 읽음은 내 알림만 바꾼다', async () => {
  const user = await createUser(0);
  const other = await createUser(1);
  const first = await createNotification(user.id, { title: '개별' });
  const second = await createNotification(user.id, { title: '전체' });
  const others = await createNotification(other.id, { title: '남의 알림' });

  const readResponse = await request(app)
    .patch(`/api/v1/notifications/${first.id}/read`)
    .set(authHeader(user));
  assert.equal(readResponse.status, 200);
  const readOne = await prisma.notification.findUnique({ where: { id: first.id } });
  assert.equal(readOne.isRead, true);
  assert.notEqual(readOne.readAt, null);

  const readAllResponse = await request(app)
    .patch('/api/v1/notifications/read-all')
    .set(authHeader(user));
  assert.equal(readAllResponse.status, 200);
  assert.equal((await prisma.notification.findUnique({ where: { id: second.id } })).isRead, true);
  assert.equal((await prisma.notification.findUnique({ where: { id: others.id } })).isRead, false);
});

test('다른 사용자의 알림은 읽음 처리와 삭제 모두 404를 반환한다', async () => {
  const user = await createUser(0);
  const other = await createUser(1);
  const others = await createNotification(other.id, { title: '남의 알림' });

  const readResponse = await request(app)
    .patch(`/api/v1/notifications/${others.id}/read`)
    .set(authHeader(user));
  const deleteResponse = await request(app)
    .delete(`/api/v1/notifications/${others.id}`)
    .set(authHeader(user));

  assert.equal(readResponse.status, 404);
  assert.equal(readResponse.body.code, 'NOTIFICATION4041');
  assert.equal(deleteResponse.status, 404);
  assert.equal(deleteResponse.body.code, 'NOTIFICATION4041');
});

test('알림을 삭제하면 목록에서 사라진다', async () => {
  const user = await createUser(0);
  const notification = await createNotification(user.id, { title: '지울 알림' });

  const response = await request(app)
    .delete(`/api/v1/notifications/${notification.id}`)
    .set(authHeader(user));

  assert.equal(response.status, 200);
  assert.deepEqual(await listTitles(user), []);
});
