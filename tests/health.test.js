import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'mysql://donworry:donworry@localhost:3307/donworry_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CORS_ORIGIN = 'http://localhost:5173';

const { createApp } = await import('../src/app.js');

test('GET /health returns healthy status', async () => {
  const response = await request(createApp()).get('/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
});

test('unknown route returns 404', async () => {
  const response = await request(createApp()).get('/missing');

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
});

test('GET /api-docs.json exposes bearer auth OpenAPI config', async () => {
  const response = await request(createApp()).get('/api-docs.json');

  assert.equal(response.status, 200);
  assert.equal(response.body.openapi, '3.0.3');
  assert.equal(response.body.components.securitySchemes.bearerAuth.type, 'http');
  assert.equal(response.body.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.deepEqual(response.body.paths['/api/v1/users/me'].get.security, [{ bearerAuth: [] }]);
});

test('GET /api-docs.json generates request body schema from Zod DTO', async () => {
  const response = await request(createApp()).get('/api-docs.json');

  assert.equal(response.status, 200);

  const signupSchema =
    response.body.paths['/api/v1/auth/signup'].post.requestBody.content['application/json'].schema;

  assert.equal(signupSchema.type, 'object');
  assert.deepEqual(signupSchema.required.sort(), [
    'email',
    'emailVerificationToken',
    'loginId',
    'name',
    'password',
    'passwordConfirm',
    'phoneNumber',
  ]);
  assert.equal(signupSchema.properties.email.format, 'email');
  assert.equal(signupSchema.properties.loginId.type, 'string');
});

test('GET /api-docs.json generates query and path parameters from Zod DTO', async () => {
  const response = await request(createApp()).get('/api-docs.json');

  assert.equal(response.status, 200);

  const loginIdParameter = response.body.paths['/api/v1/auth/check-login-id'].get.parameters[0];
  const emailParameter = response.body.paths['/api/v1/auth/check-email'].get.parameters[0];
  const wishlistIdParameter =
    response.body.paths['/api/v1/wishlist-items/{wishlistId}'].get.parameters[0];

  assert.equal(emailParameter.name, 'email');
  assert.equal(emailParameter.in, 'query');
  assert.equal(emailParameter.required, true);
  assert.equal(emailParameter.schema.type, 'string');
  assert.equal(emailParameter.schema.format, 'email');

  assert.equal(loginIdParameter.name, 'loginId');
  assert.equal(loginIdParameter.in, 'query');
  assert.equal(loginIdParameter.required, true);
  assert.equal(loginIdParameter.schema.type, 'string');

  assert.equal(wishlistIdParameter.name, 'wishlistId');
  assert.equal(wishlistIdParameter.in, 'path');
  assert.equal(wishlistIdParameter.required, true);
  assert.equal(wishlistIdParameter.schema.type, 'integer');
  assert.equal(wishlistIdParameter.schema.format, 'int64');
});

test('GET /api-docs.json exposes check email response example as public API', async () => {
  const response = await request(createApp()).get('/api-docs.json');

  assert.equal(response.status, 200);

  const operation = response.body.paths['/api/v1/auth/check-email'].get;

  assert.deepEqual(operation.security, []);
  assert.equal(
    operation.responses[200].content['application/json'].schema.$ref,
    '#/components/schemas/CheckEmailResponse',
  );
  assert.equal(
    response.body.components.schemas.CheckEmailResponse.properties.data.properties.available
      .example,
    true,
  );
});

test('GET /api-docs.json documents validation error response shape', async () => {
  const response = await request(createApp()).get('/api-docs.json');

  assert.equal(response.status, 200);

  const validationErrorSchema = response.body.components.schemas.ValidationErrorResponse;
  const emailVerification400 =
    response.body.paths['/api/v1/auth/email-verifications'].post.responses[400].content[
      'application/json'
    ].schema;
  const signup400 =
    response.body.paths['/api/v1/auth/signup'].post.responses[400].content['application/json']
      .schema;

  assert.equal(validationErrorSchema.properties.errors.type, 'object');
  assert.equal(validationErrorSchema.properties.errors.properties.fieldErrors.type, 'object');
  assert.deepEqual(emailVerification400, {
    $ref: '#/components/schemas/ValidationErrorResponse',
  });
  assert.deepEqual(signup400.anyOf, [
    { $ref: '#/components/schemas/ValidationErrorResponse' },
    { $ref: '#/components/schemas/ErrorResponse' },
  ]);
});
