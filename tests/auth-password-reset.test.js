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
process.env.AUTH_EMAIL_CONFIRM_MAX_ATTEMPTS = '5';
process.env.AUTH_EMAIL_CONFIRM_LOCK_SECONDS = '300';

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

const createPasswordResetToken = async ({
  user,
  code = '123456',
  expiresAt = new Date(Date.now() + 600_000),
  usedAt = null,
  failedAttemptCount = 0,
  blockedUntil = null,
}) => {
  return prisma.authToken.create({
    data: {
      userId: user.id,
      emailSnapshot: user.email,
      tokenType: 'PASSWORD_RESET',
      tokenHash: await bcrypt.hash(code, 4),
      expiresAt,
      usedAt,
      failedAttemptCount,
      blockedUntil,
    },
  });
};

const confirmPasswordReset = (body) =>
  request(app).patch('/api/v1/auth/password-reset/confirm').send(body);

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

test('유효한 인증 코드로 비밀번호를 변경하고 기존 로그인 세션을 모두 폐기한다', async () => {
  const user = await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });
  const firstLogin = await request(app).post('/api/v1/auth/login').send({
    loginId: user.loginId,
    password: 'Password123!',
  });
  const secondLogin = await request(app).post('/api/v1/auth/login').send({
    loginId: user.loginId,
    password: 'Password123!',
  });
  const resetToken = await createPasswordResetToken({ user });

  const response = await confirmPasswordReset({
    email: ' PASSWORD-RESET-LOCAL@example.com ',
    code: '123456',
    newPassword: 'Changed123!',
    newPasswordConfirm: 'Changed123!',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    message: '비밀번호 재설정이 완료되었습니다.',
    data: null,
  });

  const [consumedResetToken, activeRefreshTokenCount] = await Promise.all([
    prisma.authToken.findUnique({ where: { id: resetToken.id } }),
    prisma.authToken.count({
      where: { userId: user.id, tokenType: 'REFRESH_TOKEN', usedAt: null },
    }),
  ]);
  const [oldLogin, newLogin] = await Promise.all([
    request(app).post('/api/v1/auth/login').send({
      loginId: user.loginId,
      password: 'Password123!',
    }),
    request(app).post('/api/v1/auth/login').send({
      loginId: user.loginId,
      password: 'Changed123!',
    }),
  ]);

  assert.ok(consumedResetToken.usedAt);
  assert.equal(consumedResetToken.failedAttemptCount, 0);
  assert.equal(activeRefreshTokenCount, 0);
  assert.equal(oldLogin.status, 401);
  assert.equal(newLogin.status, 200);

  const [firstRefresh, secondRefresh] = await Promise.all([
    request(app).post('/api/v1/auth/refresh').send({
      refreshToken: firstLogin.body.data.refreshToken,
    }),
    request(app).post('/api/v1/auth/refresh').send({
      refreshToken: secondLogin.body.data.refreshToken,
    }),
  ]);
  assert.equal(firstRefresh.status, 401);
  assert.equal(secondRefresh.status, 401);
});

test('잘못된 인증 코드는 실패 횟수를 증가시키고 비밀번호를 변경하지 않는다', async () => {
  const user = await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });
  const resetToken = await createPasswordResetToken({ user });

  const response = await confirmPasswordReset({
    email: user.email,
    code: '999999',
    newPassword: 'Changed123!',
    newPasswordConfirm: 'Changed123!',
  });
  const [storedToken, oldLogin] = await Promise.all([
    prisma.authToken.findUnique({ where: { id: resetToken.id } }),
    request(app).post('/api/v1/auth/login').send({
      loginId: user.loginId,
      password: 'Password123!',
    }),
  ]);

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'AUTH4001');
  assert.equal(storedToken.failedAttemptCount, 1);
  assert.equal(storedToken.usedAt, null);
  assert.equal(oldLogin.status, 200);
});

test('인증 코드 확인 실패가 최대 횟수에 도달하면 잠금 정보를 반환한다', async () => {
  const user = await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });
  await createPasswordResetToken({ user, failedAttemptCount: 4 });

  const response = await confirmPasswordReset({
    email: user.email,
    code: '999999',
    newPassword: 'Changed123!',
    newPasswordConfirm: 'Changed123!',
  });

  assertRateLimitResponse(response, 'PASSWORD_RESET_CONFIRM_LOCK');
});

test('잠긴 인증 코드는 올바른 코드여도 잠금 해제 전까지 사용할 수 없다', async () => {
  const user = await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });
  await createPasswordResetToken({
    user,
    failedAttemptCount: 5,
    blockedUntil: new Date(Date.now() + 300_000),
  });

  const response = await confirmPasswordReset({
    email: user.email,
    code: '123456',
    newPassword: 'Changed123!',
    newPasswordConfirm: 'Changed123!',
  });

  assertRateLimitResponse(response, 'PASSWORD_RESET_CONFIRM_LOCK');
});

test('만료되거나 이미 사용된 인증 코드를 거부한다', async () => {
  const user = await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });
  await createPasswordResetToken({ user, expiresAt: new Date(Date.now() - 1_000) });

  const expiredResponse = await confirmPasswordReset({
    email: user.email,
    code: '123456',
    newPassword: 'Changed123!',
    newPasswordConfirm: 'Changed123!',
  });

  await prisma.authToken.deleteMany({ where: { userId: user.id, tokenType: 'PASSWORD_RESET' } });
  await createPasswordResetToken({ user, usedAt: new Date() });

  const usedResponse = await confirmPasswordReset({
    email: user.email,
    code: '123456',
    newPassword: 'Changed123!',
    newPasswordConfirm: 'Changed123!',
  });

  assert.equal(expiredResponse.status, 400);
  assert.equal(expiredResponse.body.code, 'AUTH4001');
  assert.equal(usedResponse.status, 400);
  assert.equal(usedResponse.body.code, 'AUTH4001');
});

test('기존 비밀번호와 같은 새 비밀번호는 거부하고 인증 코드를 보존한다', async () => {
  const user = await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });
  const resetToken = await createPasswordResetToken({ user });

  const response = await confirmPasswordReset({
    email: user.email,
    code: '123456',
    newPassword: 'Password123!',
    newPasswordConfirm: 'Password123!',
  });
  const storedToken = await prisma.authToken.findUnique({ where: { id: resetToken.id } });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'AUTH4001');
  assert.equal(storedToken.usedAt, null);
});

test('완료 요청 DTO는 필수 필드, 비밀번호 확인 일치, 추가 필드를 검증한다', async () => {
  const baseBody = {
    email: 'password-reset-local@example.com',
    code: '123456',
    newPassword: 'Changed123!',
    newPasswordConfirm: 'Changed123!',
  };
  const [missingResponse, mismatchResponse, extraFieldResponse] = await Promise.all([
    confirmPasswordReset({ ...baseBody, code: undefined }),
    confirmPasswordReset({ ...baseBody, newPasswordConfirm: 'Another123!' }),
    confirmPasswordReset({ ...baseBody, token: 'unexpected' }),
  ]);

  for (const response of [missingResponse, mismatchResponse, extraFieldResponse]) {
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'COMMON4001');
  }
});

test('동일한 인증 코드는 동시에 요청되어도 한 번만 사용할 수 있다', async () => {
  const user = await createUser({
    email: 'password-reset-local@example.com',
    loginId: 'resetlocal1',
    passwordHash: await createLocalPasswordHash(),
  });
  await createPasswordResetToken({ user });
  const body = {
    email: user.email,
    code: '123456',
    newPassword: 'Changed123!',
    newPasswordConfirm: 'Changed123!',
  };

  const responses = await Promise.all([confirmPasswordReset(body), confirmPasswordReset(body)]);
  const statuses = responses.map((response) => response.status).sort();

  assert.deepEqual(statuses, [200, 400]);
});

test('Swagger에 비밀번호 재설정 완료 API의 public 응답을 문서화한다', async () => {
  const response = await request(app).get('/api-docs.json');
  const operation = response.body.paths['/api/v1/auth/password-reset/confirm'].patch;
  const responseSchema = response.body.components.schemas.PasswordResetConfirmResponse;

  assert.equal(response.status, 200);
  assert.deepEqual(operation.security, []);
  assert.ok(operation.requestBody);
  assert.ok(operation.responses['200']);
  assert.ok(operation.responses['400']);
  assert.ok(operation.responses['429']);
  assert.equal(operation.responses['501'], undefined);
  assert.deepEqual(responseSchema.properties.data, { type: 'object', nullable: true });
});
