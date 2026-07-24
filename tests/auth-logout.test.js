import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'mysql://donworry:donworry@localhost:3307/donworry_test';
if (!process.env.DATABASE_URL.includes('_test')) {
  throw new Error('DB write tests must run against a test database.');
}
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CORS_ORIGIN = 'http://localhost:5173';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma/client.js');

const app = createApp();
const logoutEmails = [
  'logout-success@example.com',
  'logout-idempotent@example.com',
  'logout-owner-a@example.com',
  'logout-owner-b@example.com',
  'logout-isolation@example.com',
  'logout-validation@example.com',
  'logout-expired@example.com',
];
const logoutLoginIds = [
  'logout01',
  'logout02',
  'logout03',
  'logout04',
  'logout05',
  'logout06',
  'logout07',
];

const createLocalUser = async ({ email, loginId }) => {
  return prisma.user.create({
    data: {
      email,
      loginId,
      passwordHash: await bcrypt.hash('Password123!', 12),
      nickname: 'logout-user',
    },
  });
};

const login = async (loginId) => {
  const response = await request(app).post('/api/v1/auth/login').send({
    loginId,
    password: 'Password123!',
  });

  assert.equal(response.status, 200);
  return response.body.data;
};

const logout = (accessToken, refreshToken) => {
  return request(app)
    .post('/api/v1/auth/logout')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ refreshToken });
};

const deleteLogoutTestData = async () => {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ email: { in: logoutEmails } }, { loginId: { in: logoutLoginIds } }],
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await prisma.authToken.deleteMany({
      where: { userId: { in: userIds } },
    });
  }

  await prisma.user.deleteMany({
    where: {
      OR: [{ email: { in: logoutEmails } }, { loginId: { in: logoutLoginIds } }],
    },
  });
};

test.beforeEach(async () => {
  await deleteLogoutTestData();
});

test.after(async () => {
  await deleteLogoutTestData();
  await prisma.$disconnect();
});

test('POST /api/v1/auth/logout revokes every unused refresh token in the current family', async () => {
  const user = await createLocalUser({
    email: 'logout-success@example.com',
    loginId: 'logout01',
  });
  const loginTokens = await login(user.loginId);
  const refreshResponse = await request(app)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: loginTokens.refreshToken });
  const currentRefreshToken = refreshResponse.body.data.refreshToken;

  const response = await logout(loginTokens.accessToken, currentRefreshToken);

  assert.equal(response.status, 204);
  assert.equal(response.text, '');

  const familyTokens = await prisma.authToken.findMany({
    where: { userId: user.id, tokenType: 'REFRESH_TOKEN' },
  });

  assert.equal(familyTokens.length, 2);
  assert.ok(familyTokens.every((authToken) => authToken.usedAt));

  const rejectedRefresh = await request(app)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: currentRefreshToken });
  const accessTokenResponse = await request(app)
    .get('/api/v1/users/me')
    .set('Authorization', `Bearer ${loginTokens.accessToken}`);

  assert.equal(rejectedRefresh.status, 401);
  assert.equal(rejectedRefresh.body.code, 'AUTH4011');
  assert.equal(accessTokenResponse.status, 200);
  assert.equal(accessTokenResponse.body.data.id, user.id.toString());
});

test('POST /api/v1/auth/logout handles an identical repeated request idempotently', async () => {
  await createLocalUser({
    email: 'logout-idempotent@example.com',
    loginId: 'logout02',
  });
  const loginTokens = await login('logout02');

  const firstResponse = await logout(loginTokens.accessToken, loginTokens.refreshToken);
  const secondResponse = await logout(loginTokens.accessToken, loginTokens.refreshToken);

  assert.equal(firstResponse.status, 204);
  assert.equal(secondResponse.status, 204);
  assert.equal(secondResponse.text, '');
});

test('POST /api/v1/auth/logout rejects another user refresh token without revoking it', async () => {
  await createLocalUser({
    email: 'logout-owner-a@example.com',
    loginId: 'logout03',
  });
  await createLocalUser({
    email: 'logout-owner-b@example.com',
    loginId: 'logout04',
  });
  const ownerATokens = await login('logout03');
  const ownerBTokens = await login('logout04');

  const response = await logout(ownerATokens.accessToken, ownerBTokens.refreshToken);

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'AUTH4011');

  const ownerBRefreshResponse = await request(app)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: ownerBTokens.refreshToken });

  assert.equal(ownerBRefreshResponse.status, 200);
});

test('POST /api/v1/auth/logout keeps another token family for the same user active', async () => {
  const user = await createLocalUser({
    email: 'logout-isolation@example.com',
    loginId: 'logout05',
  });
  const firstSession = await login(user.loginId);
  const secondSession = await login(user.loginId);
  const tokenRecordsBeforeLogout = await prisma.authToken.findMany({
    where: { userId: user.id, tokenType: 'REFRESH_TOKEN' },
    orderBy: { id: 'asc' },
  });

  assert.equal(tokenRecordsBeforeLogout.length, 2);
  assert.notEqual(
    tokenRecordsBeforeLogout[0].tokenFamilyId,
    tokenRecordsBeforeLogout[1].tokenFamilyId,
  );

  const response = await logout(firstSession.accessToken, firstSession.refreshToken);
  const firstSessionRefresh = await request(app)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: firstSession.refreshToken });
  const secondSessionRefresh = await request(app)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: secondSession.refreshToken });

  assert.equal(response.status, 204);
  assert.equal(firstSessionRefresh.status, 401);
  assert.equal(secondSessionRefresh.status, 200);

  const tokenRecordsAfterLogout = await prisma.authToken.findMany({
    where: { userId: user.id, tokenType: 'REFRESH_TOKEN' },
  });
  const firstFamilyTokens = tokenRecordsAfterLogout.filter(
    (authToken) => authToken.tokenFamilyId === tokenRecordsBeforeLogout[0].tokenFamilyId,
  );
  const secondFamilyTokens = tokenRecordsAfterLogout.filter(
    (authToken) => authToken.tokenFamilyId === tokenRecordsBeforeLogout[1].tokenFamilyId,
  );

  assert.ok(firstFamilyTokens.every((authToken) => authToken.usedAt));
  assert.ok(secondFamilyTokens.some((authToken) => authToken.usedAt === null));
});

test('POST /api/v1/auth/logout requires a valid access token before body validation', async () => {
  const missingAccessTokenResponse = await request(app)
    .post('/api/v1/auth/logout')
    .send({ refreshToken: 'refresh-token' });
  const wrongPurposeToken = jwt.sign(
    { purpose: 'emailVerification', email: 'logout-validation@example.com' },
    process.env.JWT_ACCESS_SECRET,
  );
  const wrongPurposeResponse = await request(app)
    .post('/api/v1/auth/logout')
    .set('Authorization', `Bearer ${wrongPurposeToken}`)
    .send({ refreshToken: 'refresh-token' });

  assert.equal(missingAccessTokenResponse.status, 401);
  assert.equal(wrongPurposeResponse.status, 401);
});

test('POST /api/v1/auth/logout validates the request body and rejects forged tokens', async () => {
  await createLocalUser({
    email: 'logout-validation@example.com',
    loginId: 'logout06',
  });
  const loginTokens = await login('logout06');

  const invalidBodyResponse = await request(app)
    .post('/api/v1/auth/logout')
    .set('Authorization', `Bearer ${loginTokens.accessToken}`)
    .send({});
  const forgedTokenResponse = await logout(loginTokens.accessToken, 'forged-refresh-token');

  assert.equal(invalidBodyResponse.status, 400);
  assert.equal(invalidBodyResponse.body.code, 'COMMON4001');
  assert.equal(forgedTokenResponse.status, 401);
  assert.equal(forgedTokenResponse.body.code, 'AUTH4011');
});

test('POST /api/v1/auth/logout rejects an expired refresh token', async () => {
  const user = await createLocalUser({
    email: 'logout-expired@example.com',
    loginId: 'logout07',
  });
  const loginTokens = await login(user.loginId);

  await prisma.authToken.updateMany({
    where: { userId: user.id, tokenType: 'REFRESH_TOKEN' },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const response = await logout(loginTokens.accessToken, loginTokens.refreshToken);

  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'AUTH4011');
});
