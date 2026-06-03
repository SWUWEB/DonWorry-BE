import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mysql://donworry:donworry@localhost:3307/donworry_test';
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
