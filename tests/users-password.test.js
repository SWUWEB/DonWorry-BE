import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL || 'mysql://donworry:donworry@localhost:3307/donworry_test';
const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!testDatabaseName.endsWith('_test')) {
  throw new Error('DB write tests must run against a test database.');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CORS_ORIGIN = 'http://localhost:5173';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');

const app = createApp();
const testEmail = 'users-password@example.com';
const testLoginId = 'userpw01';
const currentPassword = 'Current123!';
const newPassword = 'Changed123!';

const deleteTestUser = async () => {
  await prisma.user.deleteMany({
    where: {
      OR: [{ email: testEmail }, { loginId: testLoginId }],
    },
  });
};

const createTestUser = async () => {
  return prisma.user.create({
    data: {
      email: testEmail,
      loginId: testLoginId,
      nickname: 'password-user',
      passwordHash: await bcrypt.hash(currentPassword, 12),
      emailVerifiedAt: new Date(),
    },
  });
};

const createAccessToken = (userId) => {
  return jwt.sign({ purpose: 'access', userId: userId.toString() }, process.env.JWT_ACCESS_SECRET);
};

const changePassword = (accessToken, body) => {
  const requestBuilder = request(app).patch('/api/v1/users/me/password');

  if (accessToken) {
    requestBuilder.set('Authorization', `Bearer ${accessToken}`);
  }

  return requestBuilder.send(body);
};

test.beforeEach(deleteTestUser);

test.after(async () => {
  await deleteTestUser();
  await prisma.$disconnect();
});

test('PATCH /api/v1/users/me/password changes the authenticated user password', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user.id);

  const response = await changePassword(accessToken, {
    currentPassword,
    newPassword,
    newPasswordConfirm: newPassword,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, '비밀번호가 변경되었습니다.');
  assert.equal(response.body.data, null);

  const updatedUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  assert.equal(await bcrypt.compare(currentPassword, updatedUser.passwordHash), false);
  assert.equal(await bcrypt.compare(newPassword, updatedUser.passwordHash), true);
  assert.notEqual(updatedUser.passwordHash, newPassword);
});

test('PATCH /api/v1/users/me/password rejects an incorrect current password', async () => {
  const user = await createTestUser();
  const accessToken = createAccessToken(user.id);

  const response = await changePassword(accessToken, {
    currentPassword: 'Incorrect123!',
    newPassword,
    newPasswordConfirm: newPassword,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'USER4001');
  assert.equal(response.body.message, '현재 비밀번호가 올바르지 않습니다.');

  const unchangedUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  assert.equal(await bcrypt.compare(currentPassword, unchangedUser.passwordHash), true);
});

test('PATCH /api/v1/users/me/password requires the current password', async () => {
  const user = await createTestUser();
  const response = await changePassword(createAccessToken(user.id), {
    newPassword,
    newPasswordConfirm: newPassword,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'COMMON4001');
  assert.match(JSON.stringify(response.body.errors), /현재 비밀번호를 입력해주세요\./);
});

test('PATCH /api/v1/users/me/password validates the new password policy', async () => {
  const user = await createTestUser();
  const response = await changePassword(createAccessToken(user.id), {
    currentPassword,
    newPassword: 'password',
    newPasswordConfirm: 'password',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'COMMON4001');
  assert.match(
    JSON.stringify(response.body.errors),
    /8자 이상, 영문, 숫자, 특수문자를 모두 포함해주세요\./,
  );
});

test('PATCH /api/v1/users/me/password rejects bcrypt inputs over 72 UTF-8 bytes', async () => {
  const sharedPrefix = 'A'.repeat(71) + 'b';
  const currentLongPassword = `${sharedPrefix}1!`;
  const collidingNewPassword = `${sharedPrefix}2@`;
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      loginId: testLoginId,
      nickname: 'password-user',
      passwordHash: await bcrypt.hash(currentLongPassword, 12),
      emailVerifiedAt: new Date(),
    },
  });

  assert.equal(await bcrypt.compare(collidingNewPassword, user.passwordHash), true);

  const response = await changePassword(createAccessToken(user.id), {
    currentPassword: currentLongPassword,
    newPassword: collidingNewPassword,
    newPasswordConfirm: collidingNewPassword,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'COMMON4001');
  assert.match(JSON.stringify(response.body.errors), /UTF-8 기준 72바이트 이하여야 합니다\./);

  const unchangedUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  assert.equal(unchangedUser.passwordHash, user.passwordHash);
});

test('PATCH /api/v1/users/me/password rejects the current password as the new password', async () => {
  const user = await createTestUser();
  const response = await changePassword(createAccessToken(user.id), {
    currentPassword,
    newPassword: currentPassword,
    newPasswordConfirm: currentPassword,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'COMMON4001');
  assert.match(
    JSON.stringify(response.body.errors),
    /현재 비밀번호와 다른 비밀번호를 입력해주세요\./,
  );
});

test('PATCH /api/v1/users/me/password requires matching new passwords', async () => {
  const user = await createTestUser();
  const response = await changePassword(createAccessToken(user.id), {
    currentPassword,
    newPassword,
    newPasswordConfirm: 'Different123!',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'COMMON4001');
  assert.match(JSON.stringify(response.body.errors), /새 비밀번호가 일치하지 않습니다\./);
});

test('PATCH /api/v1/users/me/password requires the new password confirmation', async () => {
  const user = await createTestUser();
  const response = await changePassword(createAccessToken(user.id), {
    currentPassword,
    newPassword,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'COMMON4001');
  assert.match(JSON.stringify(response.body.errors), /새 비밀번호를 다시 입력해주세요\./);
});

test('PATCH /api/v1/users/me/password requires authentication', async () => {
  const response = await changePassword(null, {
    currentPassword,
    newPassword,
    newPasswordConfirm: newPassword,
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test('GET /api-docs.json documents the password change API', async () => {
  const response = await request(app).get('/api-docs.json');
  const operation = response.body.paths['/api/v1/users/me/password'].patch;
  const requestSchema = operation.requestBody.content['application/json'].schema;

  assert.equal(response.status, 200);
  assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
  assert.deepEqual(requestSchema.required.sort(), [
    'currentPassword',
    'newPassword',
    'newPasswordConfirm',
  ]);
  assert.deepEqual(Object.keys(operation.responses).sort(), ['200', '400', '401', '404']);
});
