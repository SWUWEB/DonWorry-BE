import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'mysql://donworry:donworry@localhost:3307/donworry_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.KAKAO_CLIENT_ID = 'test-rest-api-key';
process.env.KAKAO_CLIENT_SECRET = 'test-client-secret';
process.env.KAKAO_REDIRECT_URI = 'http://localhost:5173/oauth/kakao';
process.env.KAKAO_LINK_PASSWORD_MAX_ATTEMPTS = '3';
process.env.KAKAO_LINK_PASSWORD_LOCK_SECONDS = '300';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');
const app = createApp();
const emails = [
  'kakao-new@example.com',
  'kakao-existing@example.com',
  'kakao-local@example.com',
  'kakao-email-link@example.com',
  'kakao-invalid-code@example.com',
  'kakao-missing@example.com',
];

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const mockKakao = ({
  id = '123456789',
  email = 'kakao-new@example.com',
  nickname = '카카오 사용자',
  profileImageUrl = null,
  isEmailValid = true,
  isEmailVerified = true,
} = {}) => {
  const responses = [
    jsonResponse(200, { access_token: 'kakao-access-token' }),
    jsonResponse(200, {
      id,
      kakao_account: {
        email_needs_agreement: false,
        is_email_valid: isEmailValid,
        is_email_verified: isEmailVerified,
        email,
        profile_nickname_needs_agreement: false,
        profile_image_needs_agreement: profileImageUrl ? false : true,
        profile: {
          nickname,
          ...(profileImageUrl ? { profile_image_url: profileImageUrl } : {}),
        },
      },
    }),
  ];
  global.fetch = async () => responses.shift();
};

const createLocalUser = async (email, loginId) =>
  prisma.user.create({
    data: {
      email,
      loginId,
      passwordHash: await bcrypt.hash('Password123!', 12),
      loginProvider: 'LOCAL',
      emailVerifiedAt: new Date(),
      nickname: '기존 사용자',
    },
  });

const cleanup = async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  await prisma.authToken.deleteMany({
    where: {
      OR: [
        { emailSnapshot: { in: emails } },
        ...(userIds.length ? [{ userId: { in: userIds } }] : []),
      ],
    },
  });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
};

test.beforeEach(cleanup);
test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('POST /api/v1/auth/kakao/login creates a KAKAO user and uses default profile when image is absent', async () => {
  mockKakao();
  const response = await request(app)
    .post('/api/v1/auth/kakao/login')
    .send({ authorizationCode: 'valid-code' });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.tokenType, 'Bearer');
  assert.ok(response.body.data.accessToken);
  assert.ok(response.body.data.refreshToken);

  const user = await prisma.user.findUnique({ where: { email: 'kakao-new@example.com' } });
  assert.equal(user.kakaoUserId, '123456789');
  assert.equal(user.loginProvider, 'KAKAO');
  assert.equal(user.profileImageUrl, null);
  assert.ok(user.emailVerifiedAt);
  assert.ok(user.lastLoginAt);
});

test('POST /api/v1/auth/kakao/login logs in an already linked member', async () => {
  await prisma.user.create({
    data: {
      email: 'kakao-existing@example.com',
      kakaoUserId: '222222222',
      loginProvider: 'KAKAO',
      emailVerifiedAt: new Date(),
      nickname: '기존 카카오',
    },
  });
  mockKakao({ id: '222222222', email: 'kakao-existing@example.com' });

  const response = await request(app)
    .post('/api/v1/auth/kakao/login')
    .send({ authorizationCode: 'valid-code' });

  assert.equal(response.status, 200);
  assert.ok(response.body.data.accessToken);
  assert.equal(await prisma.user.count({ where: { email: 'kakao-existing@example.com' } }), 1);
});

test('LOCAL member requires verification and can link Kakao with password', async () => {
  const local = await createLocalUser('kakao-local@example.com', 'kakaolocal1');
  mockKakao({ id: '333333333', email: local.email });

  const loginResponse = await request(app)
    .post('/api/v1/auth/kakao/login')
    .send({ authorizationCode: 'valid-code' });

  assert.equal(loginResponse.status, 409);
  assert.equal(loginResponse.body.code, 'AUTH4093');
  assert.deepEqual(loginResponse.body.data.verificationMethods, ['PASSWORD', 'EMAIL']);

  const linkResponse = await request(app).post('/api/v1/auth/kakao/link').send({
    linkingToken: loginResponse.body.data.linkingToken,
    password: 'Password123!',
  });

  assert.equal(linkResponse.status, 200);
  assert.ok(linkResponse.body.data.accessToken);
  const linked = await prisma.user.findUnique({ where: { id: local.id } });
  assert.equal(linked.kakaoUserId, '333333333');
  assert.equal(linked.loginProvider, 'LOCAL');
});

test('Kakao password linking locks after repeated failures', async () => {
  const local = await createLocalUser('kakao-local@example.com', 'kakaolocal1');
  mockKakao({ id: '444444444', email: local.email });
  const loginResponse = await request(app)
    .post('/api/v1/auth/kakao/login')
    .send({ authorizationCode: 'valid-code' });
  const linkingToken = loginResponse.body.data.linkingToken;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await request(app)
      .post('/api/v1/auth/kakao/link')
      .send({ linkingToken, password: 'WrongPassword!' });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'AUTH4013');
  }

  const locked = await request(app)
    .post('/api/v1/auth/kakao/link')
    .send({ linkingToken, password: 'WrongPassword!' });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.code, 'AUTH4291');
  assert.equal(locked.body.rateLimitType, 'KAKAO_LINK_PASSWORD_LOCK');
});

test('Kakao account linking rejects an invalid linking token', async () => {
  const response = await request(app).post('/api/v1/auth/kakao/link').send({
    linkingToken: 'invalid-linking-token',
    password: 'Password123!',
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'AUTH4014');
  assert.equal(response.body.message, '계정 연결 정보가 만료되었거나 올바르지 않습니다.');
});

test('LOCAL member can link Kakao using a one-time email code', async () => {
  const local = await createLocalUser('kakao-email-link@example.com', 'kakaoemail1');
  mockKakao({ id: '555555555', email: local.email });
  const loginResponse = await request(app)
    .post('/api/v1/auth/kakao/login')
    .send({ authorizationCode: 'valid-code' });
  const linkingToken = loginResponse.body.data.linkingToken;

  const requestResponse = await request(app)
    .post('/api/v1/auth/kakao/link/email-verifications')
    .send({ linkingToken });
  assert.equal(requestResponse.status, 200);
  assert.match(requestResponse.body.data.debugCode, /^\d{6}$/);

  const confirmResponse = await request(app)
    .post('/api/v1/auth/kakao/link/email-verifications/confirm')
    .send({ linkingToken, code: requestResponse.body.data.debugCode });
  assert.equal(confirmResponse.status, 200);
  assert.ok(confirmResponse.body.data.refreshToken);

  const linked = await prisma.user.findUnique({ where: { id: local.id } });
  assert.equal(linked.kakaoUserId, '555555555');
});

test('Kakao email linking rejects an invalid code without linking the account', async () => {
  const local = await createLocalUser('kakao-invalid-code@example.com', 'kakaoinvalid');
  mockKakao({ id: '666666666', email: local.email });
  const loginResponse = await request(app)
    .post('/api/v1/auth/kakao/login')
    .send({ authorizationCode: 'valid-code' });
  const linkingToken = loginResponse.body.data.linkingToken;

  const requestResponse = await request(app)
    .post('/api/v1/auth/kakao/link/email-verifications')
    .send({ linkingToken });
  const invalidCode = requestResponse.body.data.debugCode === '000000' ? '000001' : '000000';

  const confirmResponse = await request(app)
    .post('/api/v1/auth/kakao/link/email-verifications/confirm')
    .send({ linkingToken, code: invalidCode });

  assert.equal(confirmResponse.status, 400);
  assert.equal(confirmResponse.body.code, 'AUTH4001');
  const unlinked = await prisma.user.findUnique({ where: { id: local.id } });
  assert.equal(unlinked.kakaoUserId, null);
});

test('Kakao login rejects missing or unverified required email', async () => {
  mockKakao({ email: 'kakao-missing@example.com', isEmailVerified: false });
  const response = await request(app)
    .post('/api/v1/auth/kakao/login')
    .send({ authorizationCode: 'valid-code' });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'AUTH4004');
  assert.equal(await prisma.user.count({ where: { email: 'kakao-missing@example.com' } }), 0);
});
