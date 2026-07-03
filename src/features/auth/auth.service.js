import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { sendEmailVerificationCode } from './auth.mailer.js';

const passwordSaltRounds = 12;
const emailVerificationJwtTtl = '10m';
const emailVerificationCodeTtlSeconds = env.AUTH_EMAIL_CODE_TTL_SECONDS;
const emailVerificationResendCooldownSeconds = env.AUTH_EMAIL_RESEND_COOLDOWN_SECONDS;
const emailVerificationSendLimitWindowSeconds = env.AUTH_EMAIL_SEND_LIMIT_WINDOW_SECONDS;
const emailVerificationSendLimit = env.AUTH_EMAIL_SEND_LIMIT;
const emailVerificationConfirmMaxAttempts = env.AUTH_EMAIL_CONFIRM_MAX_ATTEMPTS;
const emailVerificationConfirmLockSeconds = env.AUTH_EMAIL_CONFIRM_LOCK_SECONDS;

export const serializeSignupUser = (user) => {
  return {
    userId: user.id.toString(),
    loginId: user.loginId,
    name: user.nickname,
    email: user.email,
    phoneNumber: user.phoneNumber,
  };
};

const formatPhoneNumber = (phoneNumber) => {
  const digits = phoneNumber.replace(/\D/g, '');

  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
};

const throwDuplicatedEmailError = () => {
  throw new HttpError(409, '이미 가입된 이메일입니다.', {
    errorCode: ERROR_CODES.AUTH4091,
  });
};

const assertEmailAvailable = async (email) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (user) {
    throwDuplicatedEmailError();
  }
};

const throwEmailVerificationRateLimitedError = () => {
  throw new HttpError(429, '이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
    errorCode: ERROR_CODES.AUTH4291,
  });
};

const throwEmailVerificationConfirmError = (message = '이메일 인증 코드가 올바르지 않습니다.') => {
  throw new HttpError(400, message, {
    errorCode: ERROR_CODES.AUTH4001,
  });
};

const throwEmailVerificationConfirmRateLimitedError = () => {
  throw new HttpError(429, '이메일 인증 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
    errorCode: ERROR_CODES.AUTH4291,
  });
};

export const createEmailVerificationToken = (email) => {
  return jwt.sign({ purpose: 'emailVerification', email }, env.JWT_ACCESS_SECRET, {
    expiresIn: emailVerificationJwtTtl,
  });
};

const createEmailVerificationCode = () => {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
};

const assertEmailVerificationRequestAllowed = async (email, now) => {
  const cooldownStartedAt = new Date(now.getTime() - emailVerificationResendCooldownSeconds * 1000);
  const limitWindowStartedAt = new Date(
    now.getTime() - emailVerificationSendLimitWindowSeconds * 1000,
  );

  const recentRequest = await prisma.authToken.findFirst({
    where: {
      emailSnapshot: email,
      tokenType: 'EMAIL_VERIFY',
      createdAt: { gt: cooldownStartedAt },
    },
    select: { id: true },
  });

  if (recentRequest) {
    throwEmailVerificationRateLimitedError();
  }

  const requestCountInWindow = await prisma.authToken.count({
    where: {
      emailSnapshot: email,
      tokenType: 'EMAIL_VERIFY',
      createdAt: { gte: limitWindowStartedAt },
    },
  });

  if (requestCountInWindow >= emailVerificationSendLimit) {
    throwEmailVerificationRateLimitedError();
  }
};

const verifyEmailVerificationJwt = (email, emailVerificationToken) => {
  try {
    const payload = jwt.verify(emailVerificationToken, env.JWT_ACCESS_SECRET);

    if (payload.purpose !== 'emailVerification' || payload.email !== email) {
      throw new HttpError(400, '이메일 인증 정보가 올바르지 않습니다.', {
        errorCode: ERROR_CODES.AUTH4001,
      });
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(400, '이메일 인증이 만료되었거나 올바르지 않습니다.', {
      errorCode: ERROR_CODES.AUTH4002,
    });
  }
};

const assertSignupUniqueFields = async ({ email, loginId }) => {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { loginId }],
    },
    select: { email: true, loginId: true },
  });

  if (existingUser?.email === email) {
    throwDuplicatedEmailError();
  }

  if (existingUser?.loginId === loginId) {
    throw new HttpError(409, '이미 사용 중인 아이디입니다.', {
      errorCode: ERROR_CODES.AUTH4092,
    });
  }
};

export const checkLoginId = async ({ loginId }) => {
  const user = await prisma.user.findUnique({
    where: { loginId },
    select: { id: true },
  });

  return { available: !user };
};

export const checkEmail = async ({ email }) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return { available: !user };
};

export const requestEmailVerification = async ({ email }) => {
  await assertEmailAvailable(email);

  const now = new Date();
  await assertEmailVerificationRequestAllowed(email, now);

  const code = createEmailVerificationCode();
  const codeHash = await bcrypt.hash(code, passwordSaltRounds);
  const expiresAt = new Date(now.getTime() + emailVerificationCodeTtlSeconds * 1000);

  const authToken = await prisma.authToken.create({
    data: {
      emailSnapshot: email,
      tokenType: 'EMAIL_VERIFY',
      tokenHash: codeHash,
      expiresAt,
    },
    select: { id: true },
  });

  try {
    await sendEmailVerificationCode({
      email,
      code,
      codeTtlSeconds: emailVerificationCodeTtlSeconds,
    });
  } catch (error) {
    await prisma.authToken.delete({
      where: { id: authToken.id },
    });

    throw error;
  }

  await prisma.authToken.updateMany({
    where: {
      id: { not: authToken.id },
      emailSnapshot: email,
      tokenType: 'EMAIL_VERIFY',
      usedAt: null,
    },
    data: {
      usedAt: now,
      failedAttemptCount: 0,
      blockedUntil: null,
    },
  });

  return {
    email,
    codeTtlSeconds: emailVerificationCodeTtlSeconds,
    resendCooldownSeconds: emailVerificationResendCooldownSeconds,
  };
};

export const confirmEmailVerification = async ({ email, code }) => {
  await assertEmailAvailable(email);

  const now = new Date();
  const authToken = await prisma.authToken.findFirst({
    where: {
      emailSnapshot: email,
      tokenType: 'EMAIL_VERIFY',
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      tokenHash: true,
      expiresAt: true,
      usedAt: true,
      failedAttemptCount: true,
      blockedUntil: true,
    },
  });

  if (!authToken) {
    throwEmailVerificationConfirmError();
  }

  if (authToken.usedAt) {
    throwEmailVerificationConfirmError('이미 사용된 이메일 인증 코드입니다.');
  }

  if (authToken.expiresAt <= now) {
    throwEmailVerificationConfirmError('이메일 인증 코드가 만료되었습니다.');
  }

  if (authToken.blockedUntil && authToken.blockedUntil > now) {
    throwEmailVerificationConfirmRateLimitedError();
  }

  const isCodeMatched = await bcrypt.compare(code, authToken.tokenHash);

  if (!isCodeMatched) {
    const currentFailedAttemptCount =
      authToken.blockedUntil && authToken.blockedUntil <= now ? 0 : authToken.failedAttemptCount;
    const failedAttemptCount = currentFailedAttemptCount + 1;
    const isBlocked = failedAttemptCount >= emailVerificationConfirmMaxAttempts;

    await prisma.authToken.update({
      where: { id: authToken.id },
      data: {
        failedAttemptCount,
        blockedUntil: isBlocked
          ? new Date(now.getTime() + emailVerificationConfirmLockSeconds * 1000)
          : null,
      },
    });

    if (isBlocked) {
      throwEmailVerificationConfirmRateLimitedError();
    }

    throwEmailVerificationConfirmError();
  }

  const updateResult = await prisma.authToken.updateMany({
    where: {
      id: authToken.id,
      usedAt: null,
    },
    data: {
      usedAt: now,
      failedAttemptCount: 0,
      blockedUntil: null,
    },
  });

  if (updateResult.count !== 1) {
    throwEmailVerificationConfirmError('이미 사용된 이메일 인증 코드입니다.');
  }

  return {
    email,
    emailVerificationToken: createEmailVerificationToken(email),
  };
};

export const signup = async ({
  name,
  loginId,
  email,
  emailVerificationToken,
  password,
  phoneNumber,
}) => {
  await assertSignupUniqueFields({ email, loginId });
  verifyEmailVerificationJwt(email, emailVerificationToken);

  const passwordHash = await bcrypt.hash(password, passwordSaltRounds);

  try {
    const user = await prisma.user.create({
      data: {
        loginId,
        email,
        passwordHash,
        nickname: name,
        phoneNumber: formatPhoneNumber(phoneNumber),
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        loginId: true,
        email: true,
        nickname: true,
        phoneNumber: true,
      },
    });

    return serializeSignupUser(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.target ?? [];
      const isLoginIdDuplicated = target.includes('loginId');
      const message = isLoginIdDuplicated
        ? '이미 사용 중인 아이디입니다.'
        : '이미 가입된 이메일입니다.';
      const errorCode = isLoginIdDuplicated ? ERROR_CODES.AUTH4092 : ERROR_CODES.AUTH4091;

      throw new HttpError(409, message, { errorCode });
    }

    throw error;
  }
};
