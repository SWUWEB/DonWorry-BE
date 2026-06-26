import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
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
  'check-email-existing@example.com',
  'duplicate-email@example.com',
  'duplicate-login@example.com',
  'invalid-token@example.com',
];
const signupLoginIds = ['signup123', 'checkmail1', 'duplicate1', 'sameid1'];

test.beforeEach(async () => {
  await prisma.user.deleteMany({
    where: {
      OR: [{ email: { in: signupEmails } }, { loginId: { in: signupLoginIds } }],
    },
  });
});

test.after(async () => {
  await prisma.user.deleteMany({
    where: {
      OR: [{ email: { in: signupEmails } }, { loginId: { in: signupLoginIds } }],
    },
  });
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
