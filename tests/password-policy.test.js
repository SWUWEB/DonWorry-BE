import assert from 'node:assert/strict';
import test from 'node:test';
import {
  kakaoLinkPasswordDto,
  loginDto,
  passwordResetConfirmDto,
  signupDto,
} from '../src/features/auth/auth.dto.js';
import { newPasswordSchema } from '../src/features/auth/password.schema.js';
import { changePasswordDto, deleteUserDto } from '../src/features/users/users.dto.js';
import { openApiDocument } from '../src/swagger/openapi.js';

const ascii72 = 'Aa1!' + 'x'.repeat(68);
const ascii73 = `${ascii72}x`;
const multibyte72 = 'Aa1!' + '가'.repeat(22) + 'ab';
const multibyte73 = `${multibyte72}c`;

const signupBody = (password) => ({
  name: 'test-user',
  loginId: 'test123',
  email: 'test@example.com',
  emailVerificationToken: 'verified',
  password,
  passwordConfirm: password,
  phoneNumber: '010-1234-5678',
});

const resetBody = (password) => ({
  email: 'test@example.com',
  code: '123456',
  newPassword: password,
  newPasswordConfirm: password,
});

const changeBody = (password) => ({
  currentPassword: 'Current123!',
  newPassword: password,
  newPasswordConfirm: password,
});

test('새 비밀번호 정책은 ASCII와 멀티바이트 입력의 72바이트 경계를 검증한다', () => {
  for (const password of [ascii72, multibyte72]) {
    assert.equal(Buffer.byteLength(password, 'utf8'), 72);
    assert.equal(newPasswordSchema.safeParse(password).success, true);
  }

  for (const password of [ascii73, multibyte73]) {
    assert.equal(Buffer.byteLength(password, 'utf8'), 73);
    const result = newPasswordSchema.safeParse(password);
    assert.equal(result.success, false);
    assert.match(result.error.message, /UTF-8 기준 72바이트 이하여야 합니다/);
  }
});

test('특수문자 정책은 공백과 일반 문자를 제외하고 Unicode 문장부호·기호를 허용한다', () => {
  const scenarios = [
    [signupDto, signupBody],
    [passwordResetConfirmDto, resetBody],
    [changePasswordDto, changeBody],
  ];

  for (const [dto, body] of scenarios) {
    for (const password of ['Password1 ', 'Password1\t', 'Password1가']) {
      const result = dto.safeParse({ body: body(password) });
      assert.equal(result.success, false);
      assert.match(result.error.message, /특수문자가 1개 이상 포함되어야 합니다/);
    }
    for (const password of ['Password1!', 'Password1！', 'Password1🔒']) {
      assert.equal(dto.safeParse({ body: body(password) }).success, true);
    }
  }
});

test('회원가입, 재설정, 변경은 같은 새 비밀번호 정책을 사용한다', () => {
  const scenarios = [
    [signupDto, signupBody],
    [passwordResetConfirmDto, resetBody],
    [changePasswordDto, changeBody],
  ];

  for (const [dto, body] of scenarios) {
    for (const validPassword of [ascii72, multibyte72]) {
      assert.equal(dto.safeParse({ body: body(validPassword) }).success, true);
    }
    for (const invalidPassword of [ascii73, multibyte73]) {
      const result = dto.safeParse({ body: body(invalidPassword) });
      assert.equal(result.success, false);
      assert.match(result.error.message, /UTF-8 기준 72바이트 이하여야 합니다/);
    }
    assert.equal(dto.safeParse({ body: body('password') }).success, false);
  }
});

test('비밀번호 확인 입력은 복잡도와 무관하게 72바이트를 초과하면 거부한다', () => {
  const scenarios = [
    [loginDto, (password) => ({ loginId: 'test123', password })],
    [kakaoLinkPasswordDto, (password) => ({ linkingToken: 'token', password })],
    [
      changePasswordDto,
      (password) => ({ ...changeBody('Changed123!'), currentPassword: password }),
    ],
    [deleteUserDto, (password) => ({ password })],
  ];

  for (const [dto, body] of scenarios) {
    assert.equal(dto.safeParse({ body: body('weak') }).success, true);
    assert.equal(dto.safeParse({ body: body('x'.repeat(72)) }).success, true);
    for (const invalidPassword of ['x'.repeat(73), '가'.repeat(25)]) {
      const result = dto.safeParse({ body: body(invalidPassword) });
      assert.equal(result.success, false);
      assert.match(result.error.message, /UTF-8 기준 72바이트 이하여야 합니다/);
    }
  }
});

test('비밀번호 확인 일치 검증은 유지된다', () => {
  const signupResult = signupDto.safeParse({
    body: { ...signupBody('Password123!'), passwordConfirm: 'Different123!' },
  });
  const resetResult = passwordResetConfirmDto.safeParse({
    body: { ...resetBody('Password123!'), newPasswordConfirm: 'Different123!' },
  });
  const changeResult = changePasswordDto.safeParse({
    body: { ...changeBody('Password123!'), newPasswordConfirm: 'Different123!' },
  });

  for (const result of [signupResult, resetResult, changeResult]) {
    assert.equal(result.success, false);
    assert.match(result.error.message, /비밀번호가 일치하지 않습니다/);
  }
});

test('OpenAPI 비밀번호 요청 필드에 72바이트 정책을 명시한다', () => {
  const operations = [
    ['/api/v1/auth/signup', 'post', 'password'],
    ['/api/v1/auth/login', 'post', 'password'],
    ['/api/v1/auth/password-reset/confirm', 'patch', 'newPassword'],
    ['/api/v1/auth/kakao/link', 'post', 'password'],
    ['/api/v1/users/me', 'delete', 'password'],
    ['/api/v1/users/me/password', 'patch', 'currentPassword'],
    ['/api/v1/users/me/password', 'patch', 'newPassword'],
  ];

  for (const [path, method, field] of operations) {
    const schema =
      openApiDocument.paths[path][method].requestBody.content['application/json'].schema;
    assert.match(schema.properties[field].description, /UTF-8 기준.*72바이트/);
  }
});
