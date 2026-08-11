import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
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
const { createEmailVerificationToken } = await import('../src/features/auth/auth.service.js');

const app = createApp();
const signupEmails = [
  'signup@example.com',
  'email-verification@example.com',
  'email-verification-signup@example.com',
  'email-verification-duplicate@example.com',
  'email-confirm@example.com',
  'email-confirm-expired@example.com',
  'email-confirm-wrong-code@example.com',
  'email-confirm-used@example.com',
  'email-confirm-locked@example.com',
  'email-confirm-concurrent@example.com',
  'check-email-existing@example.com',
  'duplicate-email@example.com',
  'duplicate-login@example.com',
  'invalid-token@example.com',
  'login@example.com',
  'login-missing-password@example.com',
  'refresh@example.com',
  'refresh-expired@example.com',
  'refresh-used@example.com',
];
const signupLoginIds = [
  'signup123',
  'confirm1',
  'checkmail1',
  'duplicate1',
  'sameid1',
  'login123',
  'loginpw1',
  'refresh1',
  'refresh2',
  'refresh3',
];

const createEmailVerificationAuthToken = async ({
  email,
  code = '123456',
  expiresAt = new Date(Date.now() + 600 * 1000),
  usedAt = null,
  failedAttemptCount = 0,
  blockedUntil = null,
}) => {
  return prisma.authToken.create({
    data: {
      emailSnapshot: email,
      tokenType: 'EMAIL_VERIFY',
      tokenHash: await bcrypt.hash(code, 12),
      expiresAt,
      usedAt,
      failedAttemptCount,
      blockedUntil,
    },
  });
};

const assertRateLimitResponse = (response, rateLimitType, maxRetryAfterSeconds) => {
  assert.equal(response.status, 429);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4291');
  assert.equal(response.body.rateLimitType, rateLimitType);
  assert.equal(Number.isInteger(response.body.retryAfterSeconds), true);
  assert.ok(response.body.retryAfterSeconds >= 1);
  assert.ok(response.body.retryAfterSeconds <= maxRetryAfterSeconds);
  assert.equal(response.headers['retry-after'], String(response.body.retryAfterSeconds));
  assert.equal(new Date(response.body.retryAt).toISOString(), response.body.retryAt);
};

const createLocalUser = async ({
  email,
  loginId,
  password = 'Password123!',
  nickname = 'login-user',
  phoneNumber = '010-3333-4444',
}) => {
  return prisma.user.create({
    data: {
      email,
      loginId,
      passwordHash: await bcrypt.hash(password, 12),
      nickname,
      phoneNumber,
    },
  });
};

const deleteAuthTestData = async () => {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ email: { in: signupEmails } }, { loginId: { in: signupLoginIds } }],
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  await prisma.authToken.deleteMany({
    where: {
      OR: [
        { emailSnapshot: { in: signupEmails } },
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ],
    },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [{ email: { in: signupEmails } }, { loginId: { in: signupLoginIds } }],
    },
  });
};

test.beforeEach(async () => {
  await deleteAuthTestData();
});

test.after(async () => {
  await deleteAuthTestData();
  await prisma.$disconnect();
});

test('POST /api/v1/auth/signup creates a local user from signup UI payload', async () => {
  const emailVerificationToken = createEmailVerificationToken('signup@example.com');

  const response = await request(app).post('/api/v1/auth/signup').send({
    name: 'holdon',
    loginId: 'signup123',
    email: 'SIGNUP@example.com',
    emailVerificationToken,
    password: 'Password123!',
    passwordConfirm: 'Password123!',
    phoneNumber: '010-0000-0000',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.email, 'signup@example.com');
  assert.equal(response.body.data.loginId, 'signup123');
  assert.equal(response.body.data.name, 'holdon');
  assert.equal(response.body.data.phoneNumber, '010-0000-0000');
  assert.equal(typeof response.body.data.userId, 'string');

  const user = await prisma.user.findUnique({
    where: { email: 'signup@example.com' },
  });

  assert.ok(user);
  assert.equal(user.email, 'signup@example.com');
  assert.equal(user.loginId, 'signup123');
  assert.equal(user.phoneNumber, '010-0000-0000');
  assert.ok(user.emailVerifiedAt);
  assert.notEqual(user.passwordHash, 'Password123!');
  assert.equal(await bcrypt.compare('Password123!', user.passwordHash), true);
});

test('POST /api/v1/auth/signup rejects duplicate email', async () => {
  const emailVerificationToken = createEmailVerificationToken('duplicate-email@example.com');

  await prisma.user.create({
    data: {
      email: 'duplicate-email@example.com',
      loginId: 'duplicate1',
      passwordHash: await bcrypt.hash('Password123!', 12),
      nickname: 'existing',
    },
  });

  const response = await request(app).post('/api/v1/auth/signup').send({
    name: 'new-user',
    loginId: 'newuser1',
    email: 'duplicate-email@example.com',
    emailVerificationToken,
    password: 'Password123!',
    passwordConfirm: 'Password123!',
    phoneNumber: '010-1111-2222',
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4091');
});

test('POST /api/v1/auth/signup rejects duplicate login id', async () => {
  const emailVerificationToken = createEmailVerificationToken('duplicate-login@example.com');

  await prisma.user.create({
    data: {
      email: 'existing-login@example.com',
      loginId: 'sameid1',
      passwordHash: await bcrypt.hash('Password123!', 12),
      nickname: 'existing',
    },
  });

  const response = await request(app).post('/api/v1/auth/signup').send({
    name: 'new-user',
    loginId: 'sameid1',
    email: 'duplicate-login@example.com',
    emailVerificationToken,
    password: 'Password123!',
    passwordConfirm: 'Password123!',
    phoneNumber: '010-1111-2222',
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4092');
});

test('POST /api/v1/auth/signup rejects invalid email verification token', async () => {
  const response = await request(app)
    .post('/api/v1/auth/signup')
    .send({
      name: 'invalid-token-user',
      loginId: 'validid1',
      email: 'invalid-token@example.com',
      emailVerificationToken: createEmailVerificationToken('other@example.com'),
      password: 'Password123!',
      passwordConfirm: 'Password123!',
      phoneNumber: '010-1111-2222',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4001');

  const user = await prisma.user.findUnique({
    where: { email: 'invalid-token@example.com' },
  });

  assert.equal(user, null);
});

test('POST /api/v1/auth/signup validates request body', async () => {
  const response = await request(app).post('/api/v1/auth/signup').send({
    name: '',
    loginId: 'bad',
    email: 'invalid-email',
    emailVerificationToken: '',
    password: 'password',
    passwordConfirm: 'different',
    phoneNumber: '010-0000-0000',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
});

test('POST /api/v1/auth/login returns access token and user info with login id', async () => {
  await createLocalUser({
    email: 'login@example.com',
    loginId: 'login123',
  });

  const response = await request(app).post('/api/v1/auth/login').send({
    loginId: 'login123',
    password: 'Password123!',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.tokenType, 'Bearer');
  assert.equal(typeof response.body.data.accessToken, 'string');
  assert.equal(typeof response.body.data.refreshToken, 'string');
  assert.equal(response.body.data.user.email, 'login@example.com');
  assert.equal(response.body.data.user.loginId, 'login123');
  assert.equal(response.body.data.user.name, 'login-user');
  assert.equal(response.body.data.user.phoneNumber, '010-3333-4444');

  const tokenPayload = jwt.verify(response.body.data.accessToken, process.env.JWT_ACCESS_SECRET);
  assert.equal(tokenPayload.purpose, 'access');
  assert.equal(tokenPayload.userId, response.body.data.user.userId);
  assert.equal(tokenPayload.email, undefined);
  assert.equal(tokenPayload.loginId, undefined);

  const user = await prisma.user.findUnique({
    where: { email: 'login@example.com' },
  });

  assert.ok(user.lastLoginAt);

  const refreshTokenRecord = await prisma.authToken.findFirst({
    where: { userId: user.id, tokenType: 'REFRESH_TOKEN' },
  });

  assert.ok(refreshTokenRecord);
  assert.match(refreshTokenRecord.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(typeof refreshTokenRecord.tokenFamilyId, 'string');
  assert.equal(refreshTokenRecord.usedAt, null);
  assert.ok(refreshTokenRecord.expiresAt > new Date());
});

test('POST /api/v1/auth/refresh rotates refresh token and returns a new access token', async () => {
  const user = await createLocalUser({
    email: 'refresh@example.com',
    loginId: 'refresh1',
  });

  const loginResponse = await request(app).post('/api/v1/auth/login').send({
    loginId: 'refresh1',
    password: 'Password123!',
  });
  const oldRefreshToken = loginResponse.body.data.refreshToken;

  const response = await request(app).post('/api/v1/auth/refresh').send({
    refreshToken: oldRefreshToken,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.tokenType, 'Bearer');
  assert.equal(typeof response.body.data.accessToken, 'string');
  assert.equal(typeof response.body.data.refreshToken, 'string');
  assert.notEqual(response.body.data.refreshToken, oldRefreshToken);

  const tokenPayload = jwt.verify(response.body.data.accessToken, process.env.JWT_ACCESS_SECRET);
  assert.equal(tokenPayload.purpose, 'access');
  assert.equal(tokenPayload.userId, user.id.toString());

  const refreshTokenRecords = await prisma.authToken.findMany({
    where: { userId: user.id, tokenType: 'REFRESH_TOKEN' },
    orderBy: { id: 'asc' },
  });

  assert.equal(refreshTokenRecords.length, 2);
  assert.ok(refreshTokenRecords[0].usedAt);
  assert.equal(refreshTokenRecords[1].usedAt, null);
  assert.equal(refreshTokenRecords[0].tokenFamilyId, refreshTokenRecords[1].tokenFamilyId);
  assert.match(refreshTokenRecords[1].tokenHash, /^[a-f0-9]{64}$/);
});

test('POST /api/v1/auth/refresh rejects a used refresh token and revokes its family', async () => {
  const user = await createLocalUser({
    email: 'refresh-used@example.com',
    loginId: 'refresh3',
  });

  const loginResponse = await request(app).post('/api/v1/auth/login').send({
    loginId: 'refresh3',
    password: 'Password123!',
  });
  const refreshToken = loginResponse.body.data.refreshToken;

  const firstResponse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
  const rotatedRefreshToken = firstResponse.body.data.refreshToken;
  const secondResponse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
  const familyRevokedResponse = await request(app)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: rotatedRefreshToken });

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 401);
  assert.equal(secondResponse.body.success, false);
  assert.equal(secondResponse.body.code, 'AUTH4011');
  assert.equal(familyRevokedResponse.status, 401);
  assert.equal(familyRevokedResponse.body.success, false);
  assert.equal(familyRevokedResponse.body.code, 'AUTH4011');

  const refreshTokenRecords = await prisma.authToken.findMany({
    where: { userId: user.id, tokenType: 'REFRESH_TOKEN' },
  });

  assert.equal(refreshTokenRecords.length, 2);
  assert.ok(refreshTokenRecords.every((authToken) => authToken.usedAt));
});

test('POST /api/v1/auth/refresh rejects an expired refresh token', async () => {
  const user = await createLocalUser({
    email: 'refresh-expired@example.com',
    loginId: 'refresh2',
  });

  const loginResponse = await request(app).post('/api/v1/auth/login').send({
    loginId: 'refresh2',
    password: 'Password123!',
  });
  const refreshToken = loginResponse.body.data.refreshToken;

  await prisma.authToken.updateMany({
    where: { userId: user.id, tokenType: 'REFRESH_TOKEN' },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const response = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4011');
});

test('POST /api/v1/auth/refresh rejects a nonexistent or forged refresh token', async () => {
  const response = await request(app).post('/api/v1/auth/refresh').send({
    refreshToken: 'forged-refresh-token',
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4011');
});

test('POST /api/v1/auth/refresh validates request body', async () => {
  const response = await request(app).post('/api/v1/auth/refresh').send({});

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
});

test('POST /api/v1/auth/login rejects email identifier', async () => {
  const response = await request(app).post('/api/v1/auth/login').send({
    email: 'unknown-login@example.com',
    password: 'Password123!',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
});

test('POST /api/v1/auth/login rejects unknown login id', async () => {
  const response = await request(app).post('/api/v1/auth/login').send({
    loginId: 'unknown1',
    password: 'Password123!',
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4011');
});

test('POST /api/v1/auth/login rejects wrong password', async () => {
  await prisma.user.create({
    data: {
      email: 'login@example.com',
      loginId: 'login123',
      passwordHash: await bcrypt.hash('Password123!', 12),
      nickname: 'login-user',
    },
  });

  const response = await request(app).post('/api/v1/auth/login').send({
    loginId: 'login123',
    password: 'Password123?',
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4011');
});

test('POST /api/v1/auth/login rejects local login when password hash is missing', async () => {
  await prisma.user.create({
    data: {
      email: 'login-missing-password@example.com',
      loginId: 'loginpw1',
      nickname: 'oauth-user',
      loginProvider: 'KAKAO',
    },
  });

  const response = await request(app).post('/api/v1/auth/login').send({
    loginId: 'loginpw1',
    password: 'Password123!',
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4011');
});

test('POST /api/v1/auth/login validates request body', async () => {
  const response = await request(app).post('/api/v1/auth/login').send({
    loginId: 'bad',
    password: 'password',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
});

test('POST /api/v1/auth/login rejects extra email with login id', async () => {
  const response = await request(app).post('/api/v1/auth/login').send({
    email: 'login@example.com',
    loginId: 'login123',
    password: 'Password123!',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
});

test('POST /api/v1/auth/email-verifications sends code for available email', async () => {
  const requestedAt = new Date();
  const response = await request(app).post('/api/v1/auth/email-verifications').send({
    email: 'EMAIL-VERIFICATION@example.com',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, '이메일 인증 요청이 완료되었습니다.');
  assert.equal(response.body.data.email, 'email-verification@example.com');
  assert.equal(response.body.data.codeTtlSeconds, 600);
  assert.equal(response.body.data.resendCooldownSeconds, 60);
  assert.equal(response.body.data.expiresInMinutes, undefined);
  assert.equal(response.body.data.debugCode, undefined);
  assert.equal(response.body.data.emailVerificationToken, undefined);

  const authToken = await prisma.authToken.findFirst({
    where: {
      emailSnapshot: 'email-verification@example.com',
      tokenType: 'EMAIL_VERIFY',
    },
    orderBy: { id: 'desc' },
  });

  assert.ok(authToken);
  assert.match(authToken.tokenHash, /^\$2/);
  assert.equal(authToken.usedAt, null);
  assert.ok(authToken.expiresAt > requestedAt);
  assert.ok(authToken.expiresAt <= new Date(requestedAt.getTime() + 600 * 1000 + 5000));
});

test('POST /api/v1/auth/email-verifications invalidates previous unused code after cooldown', async () => {
  const oldRequestDate = new Date(Date.now() - 61 * 1000);

  await prisma.authToken.create({
    data: {
      emailSnapshot: 'email-verification-signup@example.com',
      tokenType: 'EMAIL_VERIFY',
      tokenHash: 'old-email-verification-code-hash',
      expiresAt: new Date(Date.now() + 600 * 1000),
      createdAt: oldRequestDate,
    },
  });

  const response = await request(app).post('/api/v1/auth/email-verifications').send({
    email: 'email-verification-signup@example.com',
  });

  assert.equal(response.status, 200);

  const authTokens = await prisma.authToken.findMany({
    where: {
      emailSnapshot: 'email-verification-signup@example.com',
      tokenType: 'EMAIL_VERIFY',
    },
    orderBy: { id: 'asc' },
  });

  assert.equal(authTokens.length, 2);
  assert.ok(authTokens[0].usedAt);
  assert.equal(authTokens[1].usedAt, null);
});

test('POST /api/v1/auth/email-verifications limits resend within one minute', async () => {
  const firstResponse = await request(app).post('/api/v1/auth/email-verifications').send({
    email: 'email-verification-signup@example.com',
  });
  const secondResponse = await request(app).post('/api/v1/auth/email-verifications').send({
    email: 'email-verification-signup@example.com',
  });

  assert.equal(firstResponse.status, 200);
  assertRateLimitResponse(secondResponse, 'RESEND_COOLDOWN', 60);
});

test('POST /api/v1/auth/email-verifications limits requests within send limit window', async () => {
  const now = Date.now();

  for (let index = 0; index < 3; index += 1) {
    await prisma.authToken.create({
      data: {
        emailSnapshot: 'email-verification-signup@example.com',
        tokenType: 'EMAIL_VERIFY',
        tokenHash: `window-email-verification-code-hash-${index}`,
        expiresAt: new Date(now + 600 * 1000),
        createdAt: new Date(now - (index + 2) * 60 * 1000),
        usedAt: new Date(now - (index + 1) * 60 * 1000),
      },
    });
  }

  const response = await request(app).post('/api/v1/auth/email-verifications').send({
    email: 'email-verification-signup@example.com',
  });

  assertRateLimitResponse(response, 'SEND_LIMIT', 60);
});

test('POST /api/v1/auth/email-verifications returns the latest retry time for overlapping limits', async () => {
  const now = Date.now();
  const requestAgesInSeconds = [240, 70, 10];

  for (const [index, ageInSeconds] of requestAgesInSeconds.entries()) {
    await prisma.authToken.create({
      data: {
        emailSnapshot: 'email-verification-signup@example.com',
        tokenType: 'EMAIL_VERIFY',
        tokenHash: `overlapping-limit-code-hash-${index}`,
        expiresAt: new Date(now + 600 * 1000),
        createdAt: new Date(now - ageInSeconds * 1000),
        usedAt: new Date(now - ageInSeconds * 1000),
      },
    });
  }

  const response = await request(app).post('/api/v1/auth/email-verifications').send({
    email: 'email-verification-signup@example.com',
  });

  assertRateLimitResponse(response, 'SEND_LIMIT', 60);
});

test('POST /api/v1/auth/email-verifications rejects duplicate email', async () => {
  await prisma.user.create({
    data: {
      email: 'email-verification-duplicate@example.com',
      loginId: 'verify2',
      passwordHash: await bcrypt.hash('Password123!', 12),
      nickname: 'existing',
    },
  });

  const response = await request(app).post('/api/v1/auth/email-verifications').send({
    email: 'email-verification-duplicate@example.com',
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4091');
});

test('POST /api/v1/auth/email-verifications validates request body', async () => {
  const response = await request(app).post('/api/v1/auth/email-verifications').send({
    email: 'invalid-email',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
});

test('POST /api/v1/auth/email-verifications/confirm returns signup token and supports signup', async () => {
  await createEmailVerificationAuthToken({
    email: 'email-confirm@example.com',
    code: '123456',
  });

  const confirmResponse = await request(app).post('/api/v1/auth/email-verifications/confirm').send({
    email: 'EMAIL-CONFIRM@example.com',
    code: '123456',
  });

  assert.equal(confirmResponse.status, 200);
  assert.equal(confirmResponse.body.success, true);
  assert.equal(confirmResponse.body.data.email, 'email-confirm@example.com');
  assert.equal(typeof confirmResponse.body.data.emailVerificationToken, 'string');

  const usedAuthToken = await prisma.authToken.findFirst({
    where: {
      emailSnapshot: 'email-confirm@example.com',
      tokenType: 'EMAIL_VERIFY',
    },
  });

  assert.ok(usedAuthToken.usedAt);

  const signupResponse = await request(app).post('/api/v1/auth/signup').send({
    name: 'confirmed-user',
    loginId: 'confirm1',
    email: 'email-confirm@example.com',
    emailVerificationToken: confirmResponse.body.data.emailVerificationToken,
    password: 'Password123!',
    passwordConfirm: 'Password123!',
    phoneNumber: '010-2222-3333',
  });

  assert.equal(signupResponse.status, 201);
  assert.equal(signupResponse.body.success, true);
  assert.equal(signupResponse.body.data.email, 'email-confirm@example.com');
  assert.equal(signupResponse.body.data.loginId, 'confirm1');
});

test('POST /api/v1/auth/email-verifications/confirm rejects expired code', async () => {
  await createEmailVerificationAuthToken({
    email: 'email-confirm-expired@example.com',
    code: '123456',
    expiresAt: new Date(Date.now() - 1000),
  });

  const response = await request(app).post('/api/v1/auth/email-verifications/confirm').send({
    email: 'email-confirm-expired@example.com',
    code: '123456',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4001');
  assert.equal(response.body.data, undefined);
});

test('POST /api/v1/auth/email-verifications/confirm rejects wrong code', async () => {
  const authToken = await createEmailVerificationAuthToken({
    email: 'email-confirm-wrong-code@example.com',
    code: '123456',
  });

  const response = await request(app).post('/api/v1/auth/email-verifications/confirm').send({
    email: 'email-confirm-wrong-code@example.com',
    code: '654321',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4001');

  const unchangedAuthToken = await prisma.authToken.findUnique({
    where: { id: authToken.id },
  });

  assert.equal(unchangedAuthToken.usedAt, null);
  assert.equal(unchangedAuthToken.failedAttemptCount, 1);
  assert.equal(unchangedAuthToken.blockedUntil, null);
});

test('POST /api/v1/auth/email-verifications/confirm locks after too many wrong codes', async () => {
  const authToken = await createEmailVerificationAuthToken({
    email: 'email-confirm-locked@example.com',
    code: '123456',
    failedAttemptCount: 4,
  });

  const lockedResponse = await request(app).post('/api/v1/auth/email-verifications/confirm').send({
    email: 'email-confirm-locked@example.com',
    code: '654321',
  });

  assertRateLimitResponse(lockedResponse, 'CONFIRM_LOCK', 300);

  const lockedAuthToken = await prisma.authToken.findUnique({
    where: { id: authToken.id },
  });

  assert.equal(lockedAuthToken.failedAttemptCount, 5);
  assert.ok(lockedAuthToken.blockedUntil > new Date());
  assert.equal(lockedResponse.body.retryAt, lockedAuthToken.blockedUntil.toISOString());

  const correctCodeResponse = await request(app)
    .post('/api/v1/auth/email-verifications/confirm')
    .send({
      email: 'email-confirm-locked@example.com',
      code: '123456',
    });

  assertRateLimitResponse(correctCodeResponse, 'CONFIRM_LOCK', 300);
  assert.equal(correctCodeResponse.body.retryAt, lockedAuthToken.blockedUntil.toISOString());
});

test('POST /api/v1/auth/email-verifications/confirm counts concurrent wrong codes atomically', async () => {
  const authToken = await createEmailVerificationAuthToken({
    email: 'email-confirm-concurrent@example.com',
    code: '123456',
  });

  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(app).post('/api/v1/auth/email-verifications/confirm').send({
        email: 'email-confirm-concurrent@example.com',
        code: '654321',
      }),
    ),
  );

  assert.ok(responses.every((response) => [400, 429].includes(response.status)));
  assert.ok(responses.some((response) => response.status === 429));

  const lockedAuthToken = await prisma.authToken.findUnique({
    where: { id: authToken.id },
  });

  assert.equal(lockedAuthToken.failedAttemptCount, 5);
  assert.ok(lockedAuthToken.blockedUntil > new Date());
});

test('POST /api/v1/auth/email-verifications/confirm resets attempts after lock expires', async () => {
  const authToken = await createEmailVerificationAuthToken({
    email: 'email-confirm-locked@example.com',
    code: '123456',
    failedAttemptCount: 5,
    blockedUntil: new Date(Date.now() - 1000),
  });

  const response = await request(app).post('/api/v1/auth/email-verifications/confirm').send({
    email: 'email-confirm-locked@example.com',
    code: '654321',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4001');

  const updatedAuthToken = await prisma.authToken.findUnique({
    where: { id: authToken.id },
  });

  assert.equal(updatedAuthToken.failedAttemptCount, 1);
  assert.equal(updatedAuthToken.blockedUntil, null);
});

test('POST /api/v1/auth/email-verifications/confirm rejects already used code', async () => {
  await createEmailVerificationAuthToken({
    email: 'email-confirm-used@example.com',
    code: '123456',
    usedAt: new Date(),
  });

  const response = await request(app).post('/api/v1/auth/email-verifications/confirm').send({
    email: 'email-confirm-used@example.com',
    code: '123456',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4001');
});

test('POST /api/v1/auth/email-verifications/confirm validates request body', async () => {
  const response = await request(app).post('/api/v1/auth/email-verifications/confirm').send({
    email: 'email-confirm@example.com',
    code: '12345',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
});

test('GET /api/v1/auth/check-login-id returns availability', async () => {
  const response = await request(app)
    .get('/api/v1/auth/check-login-id')
    .query({ loginId: 'signup123' });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.available, true);
});

test('GET /api/v1/auth/check-email returns false for existing email', async () => {
  await prisma.user.create({
    data: {
      email: 'check-email-existing@example.com',
      loginId: 'checkmail1',
      passwordHash: await bcrypt.hash('Password123!', 12),
      nickname: 'existing',
    },
  });

  const response = await request(app)
    .get('/api/v1/auth/check-email')
    .query({ email: 'check-email-existing@example.com' });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.available, false);
});

test('GET /api/v1/auth/check-email returns true for unused email without auth', async () => {
  const response = await request(app)
    .get('/api/v1/auth/check-email')
    .query({ email: 'check-email-new@example.com' });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.available, true);
});

test('GET /api/v1/auth/check-email rejects invalid email format', async () => {
  const response = await request(app)
    .get('/api/v1/auth/check-email')
    .query({ email: 'invalid-email' });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'COMMON4001');
});
