import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'mysql://donworry:donworry@localhost:3307/donworry_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.KAKAO_CLIENT_ID = 'test-rest-api-key';
process.env.KAKAO_CLIENT_SECRET = 'test-client-secret';
process.env.KAKAO_ADMIN_KEY = 'test-admin-key';
process.env.KAKAO_REDIRECT_URI = 'http://localhost:5173/oauth/kakao';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');
const { reconcileKakaoWithdrawalAttempt } =
  await import('../src/features/users/users.withdrawal.service.js');
const app = createApp();
const testEmail = 'withdrawal-test@example.com';
const kakaoUserId = '987654321';
const emailHash = createHmac('sha256', process.env.JWT_ACCESS_SECRET)
  .update(testEmail)
  .digest('hex');

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const createUser = async ({ password = false, kakao = false } = {}) =>
  prisma.user.create({
    data: {
      email: testEmail,
      nickname: '탈퇴 테스트',
      loginId: password ? 'withdraw1' : null,
      passwordHash: password ? await bcrypt.hash('Password123!', 12) : null,
      kakaoUserId: kakao ? kakaoUserId : null,
      loginProvider: kakao && !password ? 'KAKAO' : 'LOCAL',
    },
  });

const deleteMe = (user, body) =>
  request(app)
    .delete('/api/v1/users/me')
    .set(
      'Authorization',
      `Bearer ${jwt.sign({ purpose: 'access', userId: user.id.toString() }, process.env.JWT_ACCESS_SECRET)}`,
    )
    .send(body);

const startKakaoWithdrawal = async (user) => {
  const response = await request(app)
    .post('/api/v1/users/me/withdrawal/kakao/authorization')
    .set(
      'Authorization',
      `Bearer ${jwt.sign({ purpose: 'access', userId: user.id.toString() }, process.env.JWT_ACCESS_SECRET)}`,
    );
  assert.equal(response.status, 200);
  const authorizationUrl = new URL(response.body.data.authorizationUrl);
  assert.equal(authorizationUrl.searchParams.get('prompt'), 'login');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), process.env.KAKAO_REDIRECT_URI);
  return authorizationUrl.searchParams.get('state');
};

const cleanup = async () => {
  const user = await prisma.user.findUnique({ where: { email: testEmail } });
  if (user) {
    await prisma.withdrawalAttempt.deleteMany({ where: { userId: user.id } });
    await prisma.authToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.withdrawalAudit.deleteMany({ where: { userEmailHash: emailHash } });
};

test.beforeEach(async () => {
  global.fetch = undefined;
  await cleanup();
});
test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('password account withdrawal preserves password verification and audit', async () => {
  const user = await createUser({ password: true });
  await prisma.authToken.create({
    data: {
      userId: user.id,
      tokenHash: 'withdrawal-test-refresh-token',
      tokenType: 'REFRESH_TOKEN',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const response = await deleteMe(user, { password: 'Password123!', reasonType: 'OTHER' });
  assert.equal(response.status, 200);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 0);
  assert.equal(await prisma.authToken.count({ where: { userId: user.id } }), 0);
  const audit = await prisma.withdrawalAudit.findFirst({ where: { userEmailHash: emailHash } });
  assert.equal(audit.reasonType, 'OTHER');
});

test('password account rejects an incorrect password without deleting the user', async () => {
  const user = await createUser({ password: true });
  const response = await deleteMe(user, { password: 'incorrect' });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'USER4001');
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 1);
});

test('Kakao-only withdrawal verifies the Kakao ID and unlinks without profile fields', async () => {
  const user = await createUser({ kakao: true });
  const state = await startKakaoWithdrawal(user);
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).endsWith('/oauth/token')) {
      return jsonResponse(200, { access_token: 'withdrawal-kakao-token' });
    }
    if (String(url).endsWith('/v2/user/me')) {
      return jsonResponse(200, { id: Number(kakaoUserId) });
    }
    return jsonResponse(200, { id: Number(kakaoUserId) });
  };

  const response = await deleteMe(user, { authorizationCode: 'fresh-code', state });
  assert.equal(response.status, 200);
  assert.deepEqual(urls, [
    'https://kauth.kakao.com/oauth/token',
    'https://kapi.kakao.com/v2/user/me',
    'https://kapi.kakao.com/v1/user/unlink',
  ]);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 0);
  assert.equal(await prisma.withdrawalAttempt.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.withdrawalAudit.count({ where: { userEmailHash: emailHash } }), 1);
});

test('Kakao-only withdrawal rejects another Kakao account before unlink', async () => {
  const user = await createUser({ kakao: true });
  const state = await startKakaoWithdrawal(user);
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    if (String(url).endsWith('/oauth/token')) return jsonResponse(200, { access_token: 'token' });
    return jsonResponse(200, { id: 123 });
  };

  const response = await deleteMe(user, { authorizationCode: 'different-account-code', state });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'USER4002');
  assert.equal(calls, 2);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 1);
  assert.equal(await prisma.withdrawalAttempt.count({ where: { userId: user.id } }), 0);
});

test('expired or reused Kakao authorization code cannot withdraw', async () => {
  const user = await createUser({ kakao: true });
  const state = await startKakaoWithdrawal(user);
  global.fetch = async () => jsonResponse(400, { error: 'invalid_grant' });

  const response = await deleteMe(user, { authorizationCode: 'used-code', state });
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'AUTH4012');
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 1);
});

test('Kakao withdrawal state is bound to the user and can be used only once', async () => {
  const user = await createUser({ kakao: true });
  const state = await startKakaoWithdrawal(user);
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse(400, { error: 'invalid_grant' });
  };

  const first = await deleteMe(user, { authorizationCode: 'invalid-code', state });
  const second = await deleteMe(user, { authorizationCode: 'another-code', state });
  assert.equal(first.status, 401);
  assert.equal(second.status, 401);
  assert.equal(calls, 1);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 1);
});

test('expired Kakao withdrawal state is rejected before contacting Kakao', async () => {
  const user = await createUser({ kakao: true });
  const state = await startKakaoWithdrawal(user);
  await prisma.authToken.updateMany({
    where: { userId: user.id, tokenType: 'KAKAO_WITHDRAWAL' },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  let contactedKakao = false;
  global.fetch = async () => {
    contactedKakao = true;
    throw new Error('Kakao should not be contacted');
  };

  const response = await deleteMe(user, { authorizationCode: 'code', state });
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'AUTH4012');
  assert.equal(contactedKakao, false);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 1);
});

test('Kakao unlink failure leaves a durable attempt that can be reconciled', async () => {
  const user = await createUser({ kakao: true });
  const state = await startKakaoWithdrawal(user);
  global.fetch = async (url) => {
    if (String(url).endsWith('/oauth/token')) return jsonResponse(200, { access_token: 'token' });
    if (String(url).endsWith('/v2/user/me')) return jsonResponse(200, { id: Number(kakaoUserId) });
    return jsonResponse(503, { code: -1 });
  };

  const response = await deleteMe(user, { authorizationCode: 'fresh-code', state });
  assert.equal(response.status, 502);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 1);
  const attempt = await prisma.withdrawalAttempt.findUnique({ where: { userId: user.id } });
  assert.equal(attempt.status, 'UNLINK_PENDING');

  global.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'KakaoAK test-admin-key');
    return jsonResponse(400, { code: -101 });
  };
  await reconcileKakaoWithdrawalAttempt(attempt.id);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 0);
  assert.equal(await prisma.withdrawalAttempt.count({ where: { id: attempt.id } }), 0);
});

test('password account linked to Kakao uses the admin key to unlink', async () => {
  const user = await createUser({ password: true, kakao: true });
  let unlinkCalls = 0;
  global.fetch = async (url, options) => {
    assert.equal(String(url), 'https://kapi.kakao.com/v1/user/unlink');
    assert.equal(options.headers.Authorization, 'KakaoAK test-admin-key');
    assert.equal(options.body.get('target_id'), kakaoUserId);
    unlinkCalls += 1;
    return jsonResponse(200, { id: Number(kakaoUserId) });
  };

  const invalid = await deleteMe(user, { password: 'incorrect' });
  assert.equal(invalid.status, 400);
  assert.equal(unlinkCalls, 0);

  const response = await deleteMe(user, { password: 'Password123!' });
  assert.equal(response.status, 200);
  assert.equal(unlinkCalls, 1);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 0);
});

test('password rotation blocks recovery of a pending linked-account withdrawal', async () => {
  const user = await createUser({ password: true, kakao: true });
  let unlinkCalls = 0;
  global.fetch = async () => {
    unlinkCalls += 1;
    return jsonResponse(503, { msg: 'temporary failure' });
  };

  const response = await deleteMe(user, { password: 'Password123!' });
  assert.equal(response.status, 502);
  assert.equal(unlinkCalls, 1);
  const attempt = await prisma.withdrawalAttempt.findUnique({ where: { userId: user.id } });
  assert.equal(attempt.status, 'UNLINK_PENDING');
  assert.ok(attempt.credentialFingerprint);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash('NewPassword123!', 12) },
  });
  await assert.rejects(reconcileKakaoWithdrawalAttempt(attempt.id), {
    statusCode: 409,
  });
  assert.equal(unlinkCalls, 1);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 1);
  assert.equal(await prisma.withdrawalAttempt.count({ where: { id: attempt.id } }), 1);
});

test('withdrawal requires exactly one credential', async () => {
  const user = await createUser({ password: true });
  const noCredential = await deleteMe(user, {});
  const twoCredentials = await deleteMe(user, {
    password: 'Password123!',
    authorizationCode: 'code',
  });
  assert.equal(noCredential.status, 400);
  assert.equal(twoCredentials.status, 400);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 1);
});

test('withdrawal endpoints require a DonWorry access token', async () => {
  const startResponse = await request(app).post('/api/v1/users/me/withdrawal/kakao/authorization');
  const deleteResponse = await request(app)
    .delete('/api/v1/users/me')
    .send({ authorizationCode: 'code', state: 'state' });
  assert.equal(startResponse.status, 401);
  assert.equal(deleteResponse.status, 401);
});

test('OpenAPI documents the Kakao withdrawal start and completion contracts', async () => {
  const response = await request(app).get('/api-docs.json');
  assert.equal(response.status, 200);
  const start = response.body.paths['/api/v1/users/me/withdrawal/kakao/authorization'].post;
  const completion = response.body.paths['/api/v1/users/me'].delete;
  assert.equal(start.responses['200'].description, '카카오 탈퇴 재인증 URL 발급 성공');
  assert.ok(completion.description.includes('authorizationCode와 state'));
  assert.ok(completion.responses['409']);
  assert.ok(completion.responses['502']);
});
