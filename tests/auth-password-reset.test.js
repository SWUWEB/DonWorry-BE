import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'mysql://donworry:donworry@localhost:3307/donworry_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.AUTH_PASSWORD_RESET_MIN_RESPONSE_MS = '0';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');

const app = createApp();
const testEmails = [
  'password-reset-local@example.com',
  'password-reset-linked@example.com',
  'password-reset-kakao@example.com',
  'password-reset-missing@example.com',
  'password-reset-other@example.com',
  'password-reset-limit@example.com',
];

const expectedSuccessBody = {
  success: true,
  message: '입력한 이메일로 계정 복구 안내를 전송했습니다.',
  data: {
    codeTtlSeconds: 600,
    resendCooldownSeconds: 60,
  },
};

const createUser = async ({ email, loginId, passwordHash = null, kakaoUserId = null }) => {
  return prisma.user.create({
    data: {
      email,
      loginId,
      passwordHash,
      kakaoUserId,
      loginProvider: kakaoUserId && !passwordHash ? 'KAKAO' : 'LOCAL',
      emailVerifiedAt: new Date(),
      nickname: 'password-reset-user',
    },
  });
};

const createLocalPasswordHash = () => bcrypt.hash('Password123!', 12);

const deleteTestData = async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: testEmails } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  await prisma.authToken.deleteMany({
    where: {
      OR: [
        { emailSnapshot: { in: testEmails } },
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ],
    },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.authRequestLog.deleteMany();
};

const assertRateLimitResponse = (response, rateLimitType) => {
  assert.equal(response.status, 429);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4291');
  assert.equal(response.body.rateLimitType, rateLimitType);
  assert.ok(response.body.retryAfterSeconds >= 1);
  assert.equal(response.headers['retry-after'], String(response.body.retryAfterSeconds));
};

test.beforeEach(deleteTestData);

test.after(async () => {
  await deleteTestData();
  await prisma.$disconnect();
});

test('LOCAL 계정에 비밀번호 재설정 인증 코드를 발급한다', async () => {
  const user = await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });

  const response = await request(app).post('/api/v1/auth/password-reset/request').send({
    email: ' PASSWORD-RESET-LOCAL@example.com ',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedSuccessBody);

  const authToken = await prisma.authToken.findFirst({
    where: { userId: user.id, tokenType: 'PASSWORD_RESET' },
  });

  assert.ok(authToken);
  assert.equal(authToken.emailSnapshot, 'password-reset-local@example.com');
  assert.match(authToken.tokenHash, /^\$2/);
  assert.equal(authToken.usedAt, null);
  assert.ok(authToken.expiresAt > new Date());
});

test('LOCAL과 카카오가 연동된 계정에도 재설정 인증 코드를 발급한다', async () => {
  const user = await createUser({
    email: 'password-reset-linked@example.com',
    loginId: 'resetlink1',
    passwordHash: await createLocalPasswordHash(),
    kakaoUserId: 'password-reset-linked-kakao',
  });

  const response = await request(app).post('/api/v1/auth/password-reset/request').send({
    email: user.email,
  });
  const authTokenCount = await prisma.authToken.count({
    where: { userId: user.id, tokenType: 'PASSWORD_RESET' },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedSuccessBody);
  assert.equal(authTokenCount, 1);
});

test('카카오 전용 계정은 인증 코드 없이 공통 성공 응답을 반환한다', async () => {
  const user = await createUser({
    email: 'password-reset-kakao@example.com',
    loginId: null,
    kakaoUserId: 'password-reset-kakao-only',
  });

  const response = await request(app).post('/api/v1/auth/password-reset/request').send({
    email: user.email,
  });
  const authTokenCount = await prisma.authToken.count({
    where: { userId: user.id, tokenType: 'PASSWORD_RESET' },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedSuccessBody);
  assert.equal(authTokenCount, 0);
  assert.equal(JSON.stringify(response.body).includes('KAKAO'), false);
});

test('미가입 이메일은 인증 코드 없이 동일한 성공 응답을 반환한다', async () => {
  const response = await request(app).post('/api/v1/auth/password-reset/request').send({
    email: 'password-reset-missing@example.com',
  });
  const authTokenCount = await prisma.authToken.count({
    where: {
      emailSnapshot: 'password-reset-missing@example.com',
      tokenType: 'PASSWORD_RESET',
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedSuccessBody);
  assert.equal(authTokenCount, 0);
});

test('새 인증 코드 발급 시 같은 사용자의 기존 코드만 폐기한다', async () => {
  const user = await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });
  const otherUser = await createUser({
    email: 'password-reset-other@example.com',
    loginId: 'resetother1',
    passwordHash: await createLocalPasswordHash(),
  });
  const expiresAt = new Date(Date.now() + 600_000);
  const previousToken = await prisma.authToken.create({
    data: {
      userId: user.id,
      emailSnapshot: user.email,
      tokenType: 'PASSWORD_RESET',
      tokenHash: 'previous-password-reset-token',
      expiresAt,
      createdAt: new Date(Date.now() - 61_000),
    },
  });
  const otherUserToken = await prisma.authToken.create({
    data: {
      userId: otherUser.id,
      emailSnapshot: otherUser.email,
      tokenType: 'PASSWORD_RESET',
      tokenHash: 'other-user-password-reset-token',
      expiresAt,
    },
  });
  const otherTypeToken = await prisma.authToken.create({
    data: {
      userId: user.id,
      emailSnapshot: user.email,
      tokenType: 'EMAIL_VERIFY',
      tokenHash: 'other-token-type',
      expiresAt,
    },
  });

  await request(app).post('/api/v1/auth/password-reset/request').send({ email: user.email });

  const [previous, otherUserResult, otherTypeResult] = await Promise.all([
    prisma.authToken.findUnique({ where: { id: previousToken.id } }),
    prisma.authToken.findUnique({ where: { id: otherUserToken.id } }),
    prisma.authToken.findUnique({ where: { id: otherTypeToken.id } }),
  ]);

  assert.ok(previous.usedAt);
  assert.equal(otherUserResult.usedAt, null);
  assert.equal(otherTypeResult.usedAt, null);
});

test('계정 유형과 존재 여부에 관계없이 동일한 재요청 제한을 적용한다', async () => {
  await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });
  await createUser({
    email: 'password-reset-kakao@example.com',
    loginId: null,
    kakaoUserId: 'password-reset-kakao-only',
  });

  for (const email of [
    'password-reset-local@example.com',
    'password-reset-kakao@example.com',
    'password-reset-missing@example.com',
  ]) {
    const firstResponse = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email });
    const secondResponse = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email });

    assert.equal(firstResponse.status, 200);
    assertRateLimitResponse(secondResponse, 'RESEND_COOLDOWN');
  }
});

test('동일 시간 구간의 비밀번호 재설정 요청 횟수를 제한한다', async () => {
  const email = 'password-reset-limit@example.com';
  const requestKeyHash = createHash('sha256')
    .update(`${process.env.JWT_REFRESH_SECRET}:password-reset:${email}`)
    .digest('hex');
  const now = Date.now();

  await prisma.authRequestLog.createMany({
    data: [240, 180, 70].map((ageInSeconds) => ({
      requestKeyHash,
      requestType: 'PASSWORD_RESET',
      createdAt: new Date(now - ageInSeconds * 1000),
    })),
  });

  const response = await request(app).post('/api/v1/auth/password-reset/request').send({ email });

  assertRateLimitResponse(response, 'SEND_LIMIT');
});

test('요청 처리 중 다른 이메일의 만료된 rate limit 로그를 삭제하지 않는다', async () => {
  const otherEmail = 'password-reset-other@example.com';
  const otherRequestKeyHash = createHash('sha256')
    .update(`${process.env.JWT_REFRESH_SECRET}:password-reset:${otherEmail}`)
    .digest('hex');
  const otherRequestLog = await prisma.authRequestLog.create({
    data: {
      requestKeyHash: otherRequestKeyHash,
      requestType: 'PASSWORD_RESET',
      createdAt: new Date(Date.now() - 600_000),
    },
  });

  const response = await request(app).post('/api/v1/auth/password-reset/request').send({
    email: 'password-reset-missing@example.com',
  });
  const preservedLog = await prisma.authRequestLog.findUnique({
    where: { id: otherRequestLog.id },
  });

  assert.equal(response.status, 200);
  assert.ok(preservedLog);
});

test('잘못된 이메일과 추가 필드를 거부한다', async () => {
  const invalidEmailResponse = await request(app)
    .post('/api/v1/auth/password-reset/request')
    .send({ email: 'invalid-email' });
  const extraFieldResponse = await request(app).post('/api/v1/auth/password-reset/request').send({
    email: 'password-reset-missing@example.com',
    password: 'Password123!',
  });

  assert.equal(invalidEmailResponse.status, 400);
  assert.equal(invalidEmailResponse.body.code, 'COMMON4001');
  assert.equal(extraFieldResponse.status, 400);
  assert.equal(extraFieldResponse.body.code, 'COMMON4001');
});

test('Swagger에 비밀번호 재설정 요청 API의 public 응답을 문서화한다', async () => {
  const response = await request(app).get('/api-docs.json');
  const operation = response.body.paths['/api/v1/auth/password-reset/request'].post;

  assert.equal(response.status, 200);
  assert.deepEqual(operation.security, []);
  assert.ok(operation.requestBody);
  assert.ok(operation.responses['200']);
  assert.ok(operation.responses['400']);
  assert.ok(operation.responses['429']);
  assert.equal(operation.responses['501'], undefined);
});
