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
process.env.AUTH_EMAIL_CODE_TTL_SECONDS = '600';
process.env.AUTH_EMAIL_RESEND_COOLDOWN_SECONDS = '60';
process.env.AUTH_EMAIL_SEND_LIMIT_WINDOW_SECONDS = '300';
process.env.AUTH_EMAIL_SEND_LIMIT = '3';
process.env.AUTH_EMAIL_CONFIRM_MAX_ATTEMPTS = '5';
process.env.AUTH_EMAIL_CONFIRM_LOCK_SECONDS = '300';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');

const app = createApp();
const currentEmail = 'email-change-current@example.com';
const newEmail = 'email-change-new@example.com';
const otherEmail = 'email-change-other@example.com';
const allEmails = [currentEmail, newEmail, otherEmail];
const validCode = '123456';

const cleanup = async () => {
  await prisma.authToken.deleteMany({ where: { emailSnapshot: { in: allEmails } } });
  await prisma.user.deleteMany({ where: { email: { in: allEmails } } });
};

const createUser = async (email = currentEmail) =>
  prisma.user.create({
    data: {
      email,
      loginId: email === currentEmail ? 'emailchg' : 'emailoth',
      nickname: 'email-change-user',
      emailVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  });

const accessTokenFor = (userId) =>
  jwt.sign({ purpose: 'access', userId: userId.toString() }, process.env.JWT_ACCESS_SECRET);

const createEmailChangeToken = async ({
  userId,
  email = newEmail,
  code = validCode,
  expiresAt = new Date(Date.now() + 10 * 60 * 1000),
  usedAt = null,
} = {}) =>
  prisma.authToken.create({
    data: {
      userId,
      emailSnapshot: email,
      tokenType: 'EMAIL_CHANGE',
      tokenHash: await bcrypt.hash(code, 4),
      expiresAt,
      usedAt,
    },
  });

const requestVerification = (accessToken, body = { newEmail }) => {
  const builder = request(app).post('/api/v1/users/me/email-verifications');
  if (accessToken) builder.set('Authorization', `Bearer ${accessToken}`);
  return builder.send(body);
};

const changeEmail = (accessToken, body = { newEmail, code: validCode }) => {
  const builder = request(app).patch('/api/v1/users/me/email');
  if (accessToken) builder.set('Authorization', `Bearer ${accessToken}`);
  return builder.send(body);
};

test.beforeEach(cleanup);

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('POST /users/me/email-verifications creates a user-bound EMAIL_CHANGE token', async () => {
  const user = await createUser();
  const oldToken = await createEmailChangeToken({ userId: user.id, email: otherEmail });
  await prisma.authToken.update({
    where: { id: oldToken.id },
    data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
  });

  const response = await requestVerification(accessTokenFor(user.id));

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, {
    newEmail,
    codeTtlSeconds: 600,
    resendCooldownSeconds: 60,
  });

  const tokens = await prisma.authToken.findMany({
    where: { userId: user.id, tokenType: 'EMAIL_CHANGE' },
    orderBy: { id: 'asc' },
  });
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].usedAt);
  assert.equal(tokens[1].emailSnapshot, newEmail);
  assert.equal(tokens[1].usedAt, null);
  assert.ok(tokens[1].expiresAt > new Date());
});

test('POST /users/me/email-verifications rejects current or occupied emails', async () => {
  const user = await createUser();
  await createUser(otherEmail);
  const accessToken = accessTokenFor(user.id);

  const currentResponse = await requestVerification(accessToken, { newEmail: currentEmail });
  const occupiedResponse = await requestVerification(accessToken, { newEmail: otherEmail });

  assert.equal(currentResponse.status, 409);
  assert.equal(currentResponse.body.code, 'AUTH4091');
  assert.equal(occupiedResponse.status, 409);
  assert.equal(occupiedResponse.body.code, 'AUTH4091');
});

test('POST /users/me/email-verifications enforces the resend cooldown', async () => {
  const user = await createUser();
  const accessToken = accessTokenFor(user.id);

  assert.equal((await requestVerification(accessToken)).status, 200);
  const response = await requestVerification(accessToken, { newEmail: otherEmail });

  assert.equal(response.status, 429);
  assert.equal(response.body.code, 'AUTH4291');
  assert.equal(response.body.rateLimitType, 'RESEND_COOLDOWN');
  assert.ok(response.body.retryAfterSeconds > 0);
});

test('concurrent email verification requests leave exactly one usable token', async () => {
  const user = await createUser();
  const accessToken = accessTokenFor(user.id);

  const responses = await Promise.all([
    requestVerification(accessToken),
    requestVerification(accessToken),
  ]);

  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 429]);

  const tokens = await prisma.authToken.findMany({
    where: { userId: user.id, tokenType: 'EMAIL_CHANGE' },
  });
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].usedAt, null);

  await prisma.authToken.update({
    where: { id: tokens[0].id },
    data: { tokenHash: await bcrypt.hash(validCode, 4) },
  });
  const changeResponse = await changeEmail(accessToken);
  assert.equal(changeResponse.status, 200);
  assert.equal(changeResponse.body.data.email, newEmail);
});

test('PATCH /users/me/email atomically changes the email and consumes pending tokens', async () => {
  const user = await createUser();
  const token = await createEmailChangeToken({ userId: user.id });
  const otherToken = await createEmailChangeToken({ userId: user.id, email: otherEmail });
  const previousVerifiedAt = user.emailVerifiedAt;

  const response = await changeEmail(accessTokenFor(user.id));

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, { email: newEmail });

  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(updatedUser.email, newEmail);
  assert.ok(updatedUser.emailVerifiedAt > previousVerifiedAt);

  const consumedTokens = await prisma.authToken.findMany({
    where: { id: { in: [token.id, otherToken.id] } },
  });
  assert.equal(
    consumedTokens.every(({ usedAt }) => usedAt !== null),
    true,
  );
});

test('PATCH /users/me/email rejects a code issued to another user', async () => {
  const user = await createUser();
  const otherUser = await createUser(otherEmail);
  await createEmailChangeToken({ userId: otherUser.id });

  const response = await changeEmail(accessTokenFor(user.id));

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'AUTH4001');
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).email, currentEmail);
});

test('PATCH /users/me/email locks verification after repeated incorrect codes', async () => {
  const user = await createUser();
  const token = await createEmailChangeToken({ userId: user.id });
  const accessToken = accessTokenFor(user.id);

  for (let attempt = 1; attempt < 5; attempt += 1) {
    const response = await changeEmail(accessToken, { newEmail, code: '654321' });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'AUTH4001');
  }

  const lockedResponse = await changeEmail(accessToken, { newEmail, code: '654321' });
  assert.equal(lockedResponse.status, 429);
  assert.equal(lockedResponse.body.code, 'AUTH4291');
  assert.equal(lockedResponse.body.rateLimitType, 'CONFIRM_LOCK');

  const lockedToken = await prisma.authToken.findUnique({ where: { id: token.id } });
  assert.equal(lockedToken.failedAttemptCount, 5);
  assert.ok(lockedToken.blockedUntil > new Date());
});

test('PATCH /users/me/email rejects incorrect, expired, and used codes', async (t) => {
  await t.test('incorrect code increments the failed attempt count', async () => {
    const user = await createUser();
    const token = await createEmailChangeToken({ userId: user.id });

    const response = await changeEmail(accessTokenFor(user.id), {
      newEmail,
      code: '654321',
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'AUTH4001');
    assert.equal(
      (await prisma.authToken.findUnique({ where: { id: token.id } })).failedAttemptCount,
      1,
    );
  });

  await cleanup();

  await t.test('expired code is rejected', async () => {
    const user = await createUser();
    await createEmailChangeToken({
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await changeEmail(accessTokenFor(user.id));
    assert.equal(response.status, 400);
    assert.match(response.body.message, /만료/);
  });

  await cleanup();

  await t.test('used code is rejected', async () => {
    const user = await createUser();
    await createEmailChangeToken({ userId: user.id, usedAt: new Date() });

    const response = await changeEmail(accessTokenFor(user.id));
    assert.equal(response.status, 400);
    assert.match(response.body.message, /사용된/);
  });
});

test('email change endpoints require authentication and validate their DTOs', async () => {
  assert.equal((await requestVerification(null)).status, 401);
  assert.equal((await changeEmail(null)).status, 401);

  const user = await createUser();
  const accessToken = accessTokenFor(user.id);
  const invalidRequest = await requestVerification(accessToken, { newEmail: 'not-an-email' });
  const invalidChange = await changeEmail(accessToken, { newEmail, code: '12' });

  assert.equal(invalidRequest.status, 400);
  assert.equal(invalidRequest.body.code, 'COMMON4001');
  assert.equal(invalidChange.status, 400);
  assert.equal(invalidChange.body.code, 'COMMON4001');
});

test('GET /api-docs.json documents the email change APIs', async () => {
  const response = await request(app).get('/api-docs.json');
  const requestOperation = response.body.paths['/api/v1/users/me/email-verifications'].post;
  const changeOperation = response.body.paths['/api/v1/users/me/email'].patch;

  assert.equal(response.status, 200);
  assert.deepEqual(requestOperation.security, [{ bearerAuth: [] }]);
  assert.deepEqual(changeOperation.security, [{ bearerAuth: [] }]);
  assert.deepEqual(Object.keys(requestOperation.responses).sort(), [
    '200',
    '400',
    '401',
    '404',
    '409',
    '429',
  ]);
  assert.deepEqual(Object.keys(changeOperation.responses).sort(), [
    '200',
    '400',
    '401',
    '404',
    '409',
    '429',
  ]);
});
