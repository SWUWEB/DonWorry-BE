import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
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
process.env.AUTH_LOGIN_ID_RECOVERY_MIN_RESPONSE_MS = '0';
process.env.AUTH_EMAIL_RESEND_COOLDOWN_SECONDS = '60';
process.env.AUTH_EMAIL_SEND_LIMIT_WINDOW_SECONDS = '300';
process.env.AUTH_EMAIL_SEND_LIMIT = '3';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');

const app = createApp();
const localEmail = 'login-id-local@example.com';
const linkedEmail = 'login-id-linked@example.com';
const kakaoEmail = 'login-id-kakao@example.com';
const missingEmail = 'login-id-missing@example.com';
const limitEmail = 'login-id-limit@example.com';
const testEmails = [localEmail, linkedEmail, kakaoEmail, missingEmail, limitEmail];
const expectedSuccessBody = {
  success: true,
  message: '입력한 이메일로 아이디 안내를 전송했습니다.',
  data: { resendCooldownSeconds: 60 },
};

const createUser = async ({
  email,
  loginId,
  passwordHash = null,
  kakaoUserId = null,
  loginProvider = kakaoUserId && !passwordHash ? 'KAKAO' : 'LOCAL',
}) =>
  prisma.user.create({
    data: {
      email,
      loginId,
      passwordHash,
      kakaoUserId,
      loginProvider,
      emailVerifiedAt: new Date(),
      nickname: 'login-id-recovery-user',
    },
  });

const requestRecovery = (email, extraBody = {}) =>
  request(app)
    .post('/api/v1/auth/login-id-recovery/request')
    .send({ email, ...extraBody });

const requestKeyHashFor = (email) =>
  createHash('sha256')
    .update(`${process.env.JWT_REFRESH_SECRET}:login-id-recovery:${email}`)
    .digest('hex');

const cleanup = async () => {
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.authRequestLog.deleteMany({ where: { requestType: 'LOGIN_ID_RECOVERY' } });
};

const assertRateLimitResponse = (response, rateLimitType) => {
  assert.equal(response.status, 429);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4291');
  assert.equal(response.body.rateLimitType, rateLimitType);
  assert.ok(response.body.retryAfterSeconds >= 1);
  assert.equal(response.headers['retry-after'], String(response.body.retryAfterSeconds));
};

test.beforeEach(cleanup);

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('LOCAL 계정은 정규화된 이메일로 아이디 찾기 요청을 접수한다', async () => {
  await createUser({
    email: localEmail,
    loginId: 'findlocal1',
    passwordHash: await bcrypt.hash('Password123!', 4),
  });

  const response = await requestRecovery(' LOGIN-ID-LOCAL@example.com ');
  const requestLog = await prisma.authRequestLog.findFirst({
    where: {
      requestKeyHash: requestKeyHashFor(localEmail),
      requestType: 'LOGIN_ID_RECOVERY',
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedSuccessBody);
  assert.ok(requestLog);
});

test('비밀번호와 카카오가 연동된 계정도 동일한 성공 응답을 반환한다', async () => {
  await createUser({
    email: linkedEmail,
    loginId: 'findlink1',
    passwordHash: await bcrypt.hash('Password123!', 4),
    kakaoUserId: 'login-id-linked-kakao',
  });

  const response = await requestRecovery(linkedEmail);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedSuccessBody);
});

test('카카오 전용 계정과 미가입 이메일은 LOCAL 계정과 동일한 응답을 반환한다', async () => {
  await createUser({
    email: kakaoEmail,
    loginId: null,
    kakaoUserId: 'login-id-kakao-only',
  });

  const [kakaoResponse, missingResponse] = await Promise.all([
    requestRecovery(kakaoEmail),
    requestRecovery(missingEmail),
  ]);

  assert.equal(kakaoResponse.status, 200);
  assert.equal(missingResponse.status, 200);
  assert.deepEqual(kakaoResponse.body, expectedSuccessBody);
  assert.deepEqual(missingResponse.body, expectedSuccessBody);
  assert.equal(JSON.stringify(kakaoResponse.body).includes('KAKAO'), false);
  assert.equal(await prisma.authToken.count({ where: { emailSnapshot: { in: testEmails } } }), 0);
});

test('계정 유형과 가입 여부에 관계없이 이메일별 재요청 대기 시간을 적용한다', async () => {
  await createUser({
    email: localEmail,
    loginId: 'findlocal1',
    passwordHash: await bcrypt.hash('Password123!', 4),
  });
  await createUser({
    email: kakaoEmail,
    loginId: null,
    kakaoUserId: 'login-id-kakao-only',
  });

  for (const email of [localEmail, kakaoEmail, missingEmail]) {
    assert.equal((await requestRecovery(email)).status, 200);
    assertRateLimitResponse(await requestRecovery(email), 'RESEND_COOLDOWN');
  }
});

test('동일 시간 구간의 아이디 찾기 요청 횟수를 제한한다', async () => {
  const now = Date.now();
  await prisma.authRequestLog.createMany({
    data: [240, 180, 70].map((ageInSeconds) => ({
      requestKeyHash: requestKeyHashFor(limitEmail),
      requestType: 'LOGIN_ID_RECOVERY',
      createdAt: new Date(now - ageInSeconds * 1000),
    })),
  });

  const response = await requestRecovery(limitEmail);

  assertRateLimitResponse(response, 'SEND_LIMIT');
});

test('동일 이메일의 병렬 요청은 하나만 접수한다', async () => {
  const responses = await Promise.all([
    requestRecovery(missingEmail),
    requestRecovery(missingEmail),
  ]);

  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 429]);
  assert.equal(
    await prisma.authRequestLog.count({
      where: {
        requestKeyHash: requestKeyHashFor(missingEmail),
        requestType: 'LOGIN_ID_RECOVERY',
      },
    }),
    1,
  );
});

test('아이디 찾기 요청 DTO는 이메일 형식과 추가 필드를 검증한다', async () => {
  const [invalidEmailResponse, extraFieldResponse] = await Promise.all([
    requestRecovery('invalid-email'),
    requestRecovery(missingEmail, { password: 'Password123!' }),
  ]);

  assert.equal(invalidEmailResponse.status, 400);
  assert.equal(invalidEmailResponse.body.code, 'COMMON4001');
  assert.equal(extraFieldResponse.status, 400);
  assert.equal(extraFieldResponse.body.code, 'COMMON4001');
});

test('Swagger에 아이디 찾기 요청 API의 public 응답을 문서화한다', async () => {
  const response = await request(app).get('/api-docs.json');
  const operation = response.body.paths['/api/v1/auth/login-id-recovery/request'].post;
  const responseSchema = response.body.components.schemas.LoginIdRecoveryRequestResponse;

  assert.equal(response.status, 200);
  assert.deepEqual(operation.security, []);
  assert.ok(operation.requestBody);
  assert.ok(operation.responses['200']);
  assert.ok(operation.responses['400']);
  assert.ok(operation.responses['429']);
  assert.deepEqual(responseSchema.properties.data.required, ['resendCooldownSeconds']);
});
