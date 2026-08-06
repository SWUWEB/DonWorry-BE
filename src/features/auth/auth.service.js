import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import {
  sendEmailVerificationCode,
  sendKakaoLoginGuide,
  sendPasswordResetCode,
} from './auth.mailer.js';
import { getKakaoUser } from './kakao.client.js';

const passwordSaltRounds = 12;
const emailVerificationJwtTtl = '10m';
const emailVerificationCodeTtlSeconds = env.AUTH_EMAIL_CODE_TTL_SECONDS;
const emailVerificationResendCooldownSeconds = env.AUTH_EMAIL_RESEND_COOLDOWN_SECONDS;
const emailVerificationSendLimitWindowSeconds = env.AUTH_EMAIL_SEND_LIMIT_WINDOW_SECONDS;
const emailVerificationSendLimit = env.AUTH_EMAIL_SEND_LIMIT;
const emailVerificationConfirmMaxAttempts = env.AUTH_EMAIL_CONFIRM_MAX_ATTEMPTS;
const emailVerificationConfirmLockSeconds = env.AUTH_EMAIL_CONFIRM_LOCK_SECONDS;
const passwordResetMinResponseMs = env.AUTH_PASSWORD_RESET_MIN_RESPONSE_MS;
const dummyPasswordHash = '$2b$12$nDS70w.TSxO.D2NgJnu9Ke6MCDX7bMWto3SoH4nXS9tmaTL06Okhu';
const emailVerificationRateLimitTypes = {
  RESEND_COOLDOWN: 'RESEND_COOLDOWN',
  SEND_LIMIT: 'SEND_LIMIT',
  CONFIRM_LOCK: 'CONFIRM_LOCK',
};

const durationUnitToMs = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

const parseDurationToMs = (duration) => {
  const match = /^(\d+)([smhd])$/.exec(duration);

  if (!match) {
    throw new Error('REFRESH_TOKEN_EXPIRES_IN must use s, m, h, or d suffix.');
  }

  return Number(match[1]) * durationUnitToMs[match[2]];
};

const refreshTokenTtlMs = parseDurationToMs(env.REFRESH_TOKEN_EXPIRES_IN);

export const serializeSignupUser = (user) => {
  return {
    userId: user.id.toString(),
    loginId: user.loginId,
    name: user.nickname,
    email: user.email,
    phoneNumber: user.phoneNumber,
  };
};

const createAccessToken = (user) => {
  return jwt.sign(
    {
      purpose: 'access',
      userId: user.id.toString(),
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN },
  );
};

const createRefreshTokenValue = () => {
  return randomBytes(32).toString('base64url');
};

const hashRefreshToken = (refreshToken) => {
  // DB가 유출되어도 원문 refreshToken을 바로 대입해볼 수 없도록 서버 secret을 섞어 해시한다.
  return createHash('sha256').update(`${env.JWT_REFRESH_SECRET}:${refreshToken}`).digest('hex');
};

const createRefreshToken = async (userId, now, tx = prisma, tokenFamilyId = randomUUID()) => {
  const refreshToken = createRefreshTokenValue();

  await tx.authToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      tokenFamilyId,
      tokenType: 'REFRESH_TOKEN',
      expiresAt: new Date(now.getTime() + refreshTokenTtlMs),
    },
  });

  return refreshToken;
};

const revokeRefreshTokenFamily = async (tokenFamilyId, now, tx = prisma) => {
  if (!tokenFamilyId) {
    return;
  }

  await tx.authToken.updateMany({
    where: {
      tokenType: 'REFRESH_TOKEN',
      tokenFamilyId,
      usedAt: null,
    },
    data: { usedAt: now },
  });
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

const throwInvalidLoginCredentialsError = () => {
  throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.', {
    errorCode: ERROR_CODES.AUTH4011,
  });
};

const throwInvalidRefreshTokenError = () => {
  throw new HttpError(401, 'refreshToken이 만료되었거나 올바르지 않습니다.', {
    errorCode: ERROR_CODES.AUTH4011,
  });
};

const createRateLimitMetadata = (retryAt, now, rateLimitType) => {
  const retryAfterSeconds = Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000));

  return {
    retryAfterSeconds,
    retryAt: retryAt.toISOString(),
    rateLimitType,
  };
};

const throwEmailVerificationRateLimitedError = (retryAt, now, rateLimitType) => {
  throw new HttpError(429, '이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
    errorCode: ERROR_CODES.AUTH4291,
    ...createRateLimitMetadata(retryAt, now, rateLimitType),
  });
};

const throwEmailVerificationConfirmError = (message = '이메일 인증 코드가 올바르지 않습니다.') => {
  throw new HttpError(400, message, {
    errorCode: ERROR_CODES.AUTH4001,
  });
};

const throwEmailVerificationConfirmRateLimitedError = (retryAt, now) => {
  throw new HttpError(429, '이메일 인증 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
    errorCode: ERROR_CODES.AUTH4291,
    ...createRateLimitMetadata(retryAt, now, emailVerificationRateLimitTypes.CONFIRM_LOCK),
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

const createPasswordResetRequestKeyHash = (email) => {
  return createHash('sha256')
    .update(`${env.JWT_REFRESH_SECRET}:password-reset:${email}`)
    .digest('hex');
};

const throwPasswordResetRateLimitedError = (retryAt, now, rateLimitType) => {
  throw new HttpError(429, '비밀번호 재설정 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
    errorCode: ERROR_CODES.AUTH4291,
    ...createRateLimitMetadata(retryAt, now, rateLimitType),
  });
};

const recordPasswordResetRequest = async (email, now) => {
  const requestKeyHash = createPasswordResetRequestKeyHash(email);
  const cooldownStartedAt = new Date(now.getTime() - emailVerificationResendCooldownSeconds * 1000);
  const limitWindowStartedAt = new Date(
    now.getTime() - emailVerificationSendLimitWindowSeconds * 1000,
  );

  const recordRequest = () =>
    prisma.$transaction(
      async (tx) => {
        await tx.authRequestLog.deleteMany({
          where: { createdAt: { lte: limitWindowStartedAt } },
        });

        const recentRequest = await tx.authRequestLog.findFirst({
          where: {
            requestKeyHash,
            requestType: 'PASSWORD_RESET',
            createdAt: { gt: cooldownStartedAt },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        const requestsInWindow = await tx.authRequestLog.findMany({
          where: {
            requestKeyHash,
            requestType: 'PASSWORD_RESET',
            createdAt: { gt: limitWindowStartedAt },
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        const activeLimits = [];

        if (recentRequest) {
          activeLimits.push({
            retryAt: new Date(
              recentRequest.createdAt.getTime() + emailVerificationResendCooldownSeconds * 1000,
            ),
            rateLimitType: emailVerificationRateLimitTypes.RESEND_COOLDOWN,
          });
        }

        if (requestsInWindow.length >= emailVerificationSendLimit) {
          const releaseRequestIndex = requestsInWindow.length - emailVerificationSendLimit;
          activeLimits.push({
            retryAt: new Date(
              requestsInWindow[releaseRequestIndex].createdAt.getTime() +
                emailVerificationSendLimitWindowSeconds * 1000,
            ),
            rateLimitType: emailVerificationRateLimitTypes.SEND_LIMIT,
          });
        }

        if (activeLimits.length > 0) {
          const effectiveLimit = activeLimits.reduce((latestLimit, currentLimit) =>
            currentLimit.retryAt > latestLimit.retryAt ? currentLimit : latestLimit,
          );
          throwPasswordResetRateLimitedError(
            effectiveLimit.retryAt,
            now,
            effectiveLimit.rateLimitType,
          );
        }

        await tx.authRequestLog.create({
          data: {
            requestKeyHash,
            requestType: 'PASSWORD_RESET',
            createdAt: now,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await recordRequest();
      return;
    } catch (error) {
      const shouldRetry =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';

      if (!shouldRetry || attempt === 2) {
        throw error;
      }
    }
  }
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
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const requestsInWindow = await prisma.authToken.findMany({
    where: {
      emailSnapshot: email,
      tokenType: 'EMAIL_VERIFY',
      createdAt: { gt: limitWindowStartedAt },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  const activeLimits = [];

  if (recentRequest) {
    activeLimits.push({
      retryAt: new Date(
        recentRequest.createdAt.getTime() + emailVerificationResendCooldownSeconds * 1000,
      ),
      rateLimitType: emailVerificationRateLimitTypes.RESEND_COOLDOWN,
    });
  }

  if (requestsInWindow.length >= emailVerificationSendLimit) {
    // 제한을 초과한 요청이 있더라도 요청 수가 한도 미만이 되는 실제 시점을 계산한다.
    const releaseRequestIndex = requestsInWindow.length - emailVerificationSendLimit;
    activeLimits.push({
      retryAt: new Date(
        requestsInWindow[releaseRequestIndex].createdAt.getTime() +
          emailVerificationSendLimitWindowSeconds * 1000,
      ),
      rateLimitType: emailVerificationRateLimitTypes.SEND_LIMIT,
    });
  }

  if (activeLimits.length > 0) {
    const effectiveLimit = activeLimits.reduce((latestLimit, currentLimit) =>
      currentLimit.retryAt > latestLimit.retryAt ? currentLimit : latestLimit,
    );

    throwEmailVerificationRateLimitedError(
      effectiveLimit.retryAt,
      now,
      effectiveLimit.rateLimitType,
    );
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

  let emailDelivery;

  try {
    emailDelivery = await sendEmailVerificationCode({
      email,
      code,
      codeTtlSeconds: emailVerificationCodeTtlSeconds,
    });
  } catch (error) {
    if (env.NODE_ENV !== 'production') {
      emailDelivery = { delivered: false, skipped: true };
    } else {
      await prisma.authToken.delete({
        where: { id: authToken.id },
      });

      throw error;
    }
  }

  if (env.NODE_ENV === 'production' && !emailDelivery?.delivered) {
    await prisma.authToken.delete({
      where: { id: authToken.id },
    });

    throw new Error('Email verification code was not delivered.');
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
    ...(env.NODE_ENV === 'development' && !emailDelivery?.delivered ? { debugCode: code } : {}),
  };
};

const createMinimumResponseDelay = () => {
  if (env.NODE_ENV === 'test' || passwordResetMinResponseMs === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, passwordResetMinResponseMs));
};

const issuePasswordResetCode = async ({ userId, email, code, codeHash, now, expiresAt }) => {
  const authToken = await prisma.authToken.create({
    data: {
      userId,
      emailSnapshot: email,
      tokenType: 'PASSWORD_RESET',
      tokenHash: codeHash,
      expiresAt,
    },
    select: { id: true },
  });

  try {
    const delivery = await sendPasswordResetCode({
      email,
      code,
      codeTtlSeconds: emailVerificationCodeTtlSeconds,
    });

    if (env.NODE_ENV === 'production' && !delivery?.delivered) {
      throw new Error('Password reset code was not delivered.');
    }
  } catch (_error) {
    await prisma.authToken.deleteMany({ where: { id: authToken.id } });
    return;
  }

  await prisma.authToken.updateMany({
    where: {
      id: { not: authToken.id },
      userId,
      tokenType: 'PASSWORD_RESET',
      usedAt: null,
    },
    data: {
      usedAt: now,
      failedAttemptCount: 0,
      blockedUntil: null,
    },
  });
};

export const requestPasswordReset = async ({ email }) => {
  const now = new Date();
  await recordPasswordResetRequest(email, now);

  const minimumResponseDelay = createMinimumResponseDelay();

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        kakaoUserId: true,
      },
    });
    const code = createEmailVerificationCode();
    const codeHash = await bcrypt.hash(code, passwordSaltRounds);
    const expiresAt = new Date(now.getTime() + emailVerificationCodeTtlSeconds * 1000);

    if (user?.passwordHash) {
      await issuePasswordResetCode({
        userId: user.id,
        email,
        code,
        codeHash,
        now,
        expiresAt,
      });
    } else if (user?.kakaoUserId) {
      try {
        await sendKakaoLoginGuide({ email });
      } catch (_error) {
        // 계정 유형을 외부에 노출하지 않도록 메일 발송 실패도 공통 성공 응답으로 처리한다.
      }
    }

    return {
      codeTtlSeconds: emailVerificationCodeTtlSeconds,
      resendCooldownSeconds: emailVerificationResendCooldownSeconds,
    };
  } finally {
    await minimumResponseDelay;
  }
};

const recordEmailVerificationFailedAttempt = async (authToken, now) => {
  const lockUntil = new Date(now.getTime() + emailVerificationConfirmLockSeconds * 1000);

  if (authToken.blockedUntil && authToken.blockedUntil <= now) {
    await prisma.authToken.updateMany({
      where: {
        id: authToken.id,
        usedAt: null,
        failedAttemptCount: authToken.failedAttemptCount,
        blockedUntil: authToken.blockedUntil,
      },
      data: {
        failedAttemptCount: 0,
        blockedUntil: null,
      },
    });
  }

  const updateResult = await prisma.authToken.updateMany({
    where: {
      id: authToken.id,
      usedAt: null,
      failedAttemptCount: { lt: emailVerificationConfirmMaxAttempts },
      OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
    },
    data: {
      failedAttemptCount: { increment: 1 },
      blockedUntil: null,
    },
  });

  const updatedAuthToken = await prisma.authToken.findUnique({
    where: { id: authToken.id },
    select: {
      failedAttemptCount: true,
      blockedUntil: true,
      usedAt: true,
    },
  });

  if (!updatedAuthToken || updatedAuthToken.usedAt) {
    throwEmailVerificationConfirmError();
  }

  if (updatedAuthToken.blockedUntil && updatedAuthToken.blockedUntil > now) {
    throwEmailVerificationConfirmRateLimitedError(updatedAuthToken.blockedUntil, now);
  }

  if (updatedAuthToken.failedAttemptCount >= emailVerificationConfirmMaxAttempts) {
    const lockResult = await prisma.authToken.updateMany({
      where: {
        id: authToken.id,
        usedAt: null,
        failedAttemptCount: { gte: emailVerificationConfirmMaxAttempts },
        OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
      },
      data: { blockedUntil: lockUntil },
    });

    if (lockResult.count === 1) {
      throwEmailVerificationConfirmRateLimitedError(lockUntil, now);
    }

    const lockedAuthToken = await prisma.authToken.findUnique({
      where: { id: authToken.id },
      select: { blockedUntil: true },
    });

    if (lockedAuthToken?.blockedUntil && lockedAuthToken.blockedUntil > now) {
      throwEmailVerificationConfirmRateLimitedError(lockedAuthToken.blockedUntil, now);
    }

    throwEmailVerificationConfirmError();
  }

  if (updateResult.count !== 1) {
    throwEmailVerificationConfirmError();
  }
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
    throwEmailVerificationConfirmRateLimitedError(authToken.blockedUntil, now);
  }

  const isCodeMatched = await bcrypt.compare(code, authToken.tokenHash);

  if (!isCodeMatched) {
    await recordEmailVerificationFailedAttempt(authToken, now);
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

export const login = async ({ loginId, password }) => {
  const user = await prisma.user.findUnique({
    where: { loginId },
    select: {
      id: true,
      loginId: true,
      email: true,
      nickname: true,
      phoneNumber: true,
      passwordHash: true,
    },
  });

  const isPasswordMatched = await bcrypt.compare(password, user?.passwordHash ?? dummyPasswordHash);

  if (!user?.passwordHash || !isPasswordMatched) {
    throwInvalidLoginCredentialsError();
  }

  const now = new Date();
  const refreshToken = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    return createRefreshToken(user.id, now, tx);
  });

  return {
    accessToken: createAccessToken(user),
    refreshToken,
    tokenType: 'Bearer',
    user: serializeSignupUser(user),
  };
};

export const logout = async ({ refreshToken }, userId) => {
  const now = new Date();
  const authToken = await prisma.authToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    select: {
      userId: true,
      tokenFamilyId: true,
      tokenType: true,
      expiresAt: true,
    },
  });

  if (
    !authToken ||
    authToken.tokenType !== 'REFRESH_TOKEN' ||
    !authToken.userId ||
    authToken.userId !== userId ||
    !authToken.tokenFamilyId ||
    authToken.expiresAt <= now
  ) {
    throwInvalidRefreshTokenError();
  }

  await prisma.authToken.updateMany({
    where: {
      userId,
      tokenFamilyId: authToken.tokenFamilyId,
      tokenType: 'REFRESH_TOKEN',
      usedAt: null,
    },
    data: { usedAt: now },
  });
};

export const refreshAccessToken = async ({ refreshToken }) => {
  const now = new Date();
  const tokenHash = hashRefreshToken(refreshToken);
  const authToken = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      tokenFamilyId: true,
      tokenType: true,
      expiresAt: true,
      usedAt: true,
      user: {
        select: {
          id: true,
          loginId: true,
          email: true,
          nickname: true,
          phoneNumber: true,
        },
      },
    },
  });

  if (!authToken || authToken.tokenType !== 'REFRESH_TOKEN') {
    throwInvalidRefreshTokenError();
  }

  if (authToken.usedAt) {
    await revokeRefreshTokenFamily(authToken.tokenFamilyId, now);
    throwInvalidRefreshTokenError();
  }

  if (!authToken.user || authToken.expiresAt <= now) {
    throwInvalidRefreshTokenError();
  }

  const result = await prisma.$transaction(async (tx) => {
    const tokenFamilyId = authToken.tokenFamilyId ?? randomUUID();
    const consumeResult = await tx.authToken.updateMany({
      where: {
        id: authToken.id,
        tokenType: 'REFRESH_TOKEN',
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now, tokenFamilyId },
    });

    if (consumeResult.count !== 1) {
      throwInvalidRefreshTokenError();
    }

    // refreshToken은 한 번 쓰면 폐기하고 새 토큰을 내려 재사용 공격의 성공 범위를 줄인다.
    const nextRefreshToken = await createRefreshToken(authToken.user.id, now, tx, tokenFamilyId);

    return {
      accessToken: createAccessToken(authToken.user),
      refreshToken: nextRefreshToken,
    };
  });

  return {
    tokenType: 'Bearer',
    ...result,
  };
};

const kakaoLinkTokenTtlSeconds = env.KAKAO_LINK_TOKEN_TTL_SECONDS;
const kakaoLinkPasswordMaxAttempts = env.KAKAO_LINK_PASSWORD_MAX_ATTEMPTS;
const kakaoLinkPasswordLockSeconds = env.KAKAO_LINK_PASSWORD_LOCK_SECONDS;

const issueLoginTokens = async (user, now = new Date(), tx = prisma) => {
  await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  return {
    accessToken: createAccessToken(user),
    refreshToken: await createRefreshToken(user.id, now, tx),
    tokenType: 'Bearer',
    user: serializeSignupUser(user),
  };
};

const createKakaoLinkSession = async (user, kakaoUser) => {
  const now = new Date();
  const tokenFamilyId = randomUUID();
  const linkingToken = jwt.sign(
    {
      purpose: 'kakaoLink',
      userId: user.id.toString(),
      tokenFamilyId,
      ...kakaoUser,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: kakaoLinkTokenTtlSeconds },
  );

  await prisma.authToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(linkingToken),
      tokenFamilyId,
      emailSnapshot: user.email,
      tokenType: 'KAKAO_LINK',
      expiresAt: new Date(now.getTime() + kakaoLinkTokenTtlSeconds * 1000),
    },
  });

  return linkingToken;
};

const throwInvalidKakaoLinkToken = () => {
  throw new HttpError(401, '계정 연결 정보가 만료되었거나 올바르지 않습니다.', {
    errorCode: ERROR_CODES.AUTH4014,
  });
};

const getKakaoLinkSession = async (linkingToken) => {
  let payload;
  try {
    payload = jwt.verify(linkingToken, env.JWT_ACCESS_SECRET);
  } catch (_error) {
    throwInvalidKakaoLinkToken();
  }

  if (payload.purpose !== 'kakaoLink' || !payload.userId || !payload.kakaoUserId) {
    throwInvalidKakaoLinkToken();
  }

  const session = await prisma.authToken.findUnique({
    where: { tokenHash: hashRefreshToken(linkingToken) },
    include: { user: true },
  });
  const now = new Date();

  if (
    !session ||
    session.tokenType !== 'KAKAO_LINK' ||
    session.usedAt ||
    session.expiresAt <= now ||
    session.userId?.toString() !== payload.userId ||
    session.tokenFamilyId !== payload.tokenFamilyId ||
    !session.user
  ) {
    throwInvalidKakaoLinkToken();
  }

  return { session, payload, now };
};

const completeKakaoLink = async (session, payload, now) => {
  const conflictingUser = await prisma.user.findUnique({
    where: { kakaoUserId: payload.kakaoUserId },
    select: { id: true },
  });
  if (conflictingUser && conflictingUser.id !== session.userId) {
    throw new HttpError(409, '이미 다른 계정에 연결된 카카오 계정입니다.', {
      errorCode: ERROR_CODES.AUTH4094,
    });
  }

  return prisma.$transaction(async (tx) => {
    const consume = await tx.authToken.updateMany({
      where: { id: session.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consume.count !== 1) {
      throwInvalidKakaoLinkToken();
    }

    const linked = await tx.user.updateMany({
      where: {
        id: session.userId,
        OR: [{ kakaoUserId: null }, { kakaoUserId: payload.kakaoUserId }],
      },
      data: { kakaoUserId: payload.kakaoUserId },
    });
    if (linked.count !== 1) {
      throw new HttpError(409, '이미 다른 계정에 연결된 카카오 계정입니다.', {
        errorCode: ERROR_CODES.AUTH4094,
      });
    }

    await tx.authToken.updateMany({
      where: {
        tokenFamilyId: session.tokenFamilyId,
        tokenType: 'KAKAO_LINK_EMAIL',
        usedAt: null,
      },
      data: { usedAt: now },
    });

    const user = await tx.user.findUnique({ where: { id: session.userId } });
    return issueLoginTokens(user, now, tx);
  });
};

export const kakaoLogin = async ({ authorizationCode }) => {
  const kakaoUser = await getKakaoUser(authorizationCode);
  const kakaoMember = await prisma.user.findUnique({
    where: { kakaoUserId: kakaoUser.kakaoUserId },
  });

  if (kakaoMember) {
    return prisma.$transaction((tx) => issueLoginTokens(kakaoMember, new Date(), tx));
  }

  const emailMember = await prisma.user.findUnique({ where: { email: kakaoUser.email } });
  if (emailMember) {
    if (emailMember.kakaoUserId && emailMember.kakaoUserId !== kakaoUser.kakaoUserId) {
      throw new HttpError(409, '이미 다른 계정에 연결된 카카오 계정입니다.', {
        errorCode: ERROR_CODES.AUTH4094,
      });
    }

    const linkingToken = await createKakaoLinkSession(emailMember, kakaoUser);
    throw new HttpError(409, '동일한 이메일로 가입된 계정의 본인 확인이 필요합니다.', {
      errorCode: ERROR_CODES.AUTH4093,
      data: {
        linkingToken,
        verificationMethods: ['PASSWORD', 'EMAIL'],
        expiresInSeconds: kakaoLinkTokenTtlSeconds,
      },
    });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      const user = await tx.user.create({
        data: {
          email: kakaoUser.email,
          kakaoUserId: kakaoUser.kakaoUserId,
          loginProvider: 'KAKAO',
          emailVerifiedAt: now,
          nickname: kakaoUser.nickname,
          profileImageUrl: kakaoUser.profileImageUrl,
        },
      });
      return issueLoginTokens(user, now, tx);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, '이미 다른 계정에 연결된 카카오 계정입니다.', {
        errorCode: ERROR_CODES.AUTH4094,
      });
    }
    throw error;
  }
};

export const kakaoLinkByPassword = async ({ linkingToken, password }) => {
  const { session, payload, now } = await getKakaoLinkSession(linkingToken);

  if (session.blockedUntil && session.blockedUntil > now) {
    throw new HttpError(429, '비밀번호 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
      errorCode: ERROR_CODES.AUTH4291,
      ...createRateLimitMetadata(session.blockedUntil, now, 'KAKAO_LINK_PASSWORD_LOCK'),
    });
  }

  const matched = await bcrypt.compare(password, session.user.passwordHash ?? dummyPasswordHash);
  if (!session.user.passwordHash || !matched) {
    const nextAttempts =
      session.blockedUntil && session.blockedUntil <= now ? 1 : session.failedAttemptCount + 1;
    const blockedUntil =
      nextAttempts >= kakaoLinkPasswordMaxAttempts
        ? new Date(now.getTime() + kakaoLinkPasswordLockSeconds * 1000)
        : null;
    await prisma.authToken.update({
      where: { id: session.id },
      data: { failedAttemptCount: nextAttempts, blockedUntil },
    });

    if (blockedUntil) {
      throw new HttpError(429, '비밀번호 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
        errorCode: ERROR_CODES.AUTH4291,
        ...createRateLimitMetadata(blockedUntil, now, 'KAKAO_LINK_PASSWORD_LOCK'),
      });
    }

    throw new HttpError(401, '계정 연결을 위한 본인 확인에 실패했습니다.', {
      errorCode: ERROR_CODES.AUTH4013,
    });
  }

  return completeKakaoLink(session, payload, now);
};

export const requestKakaoLinkEmailVerification = async ({ linkingToken }) => {
  const { session, now } = await getKakaoLinkSession(linkingToken);
  const recent = await prisma.authToken.findFirst({
    where: {
      tokenFamilyId: session.tokenFamilyId,
      tokenType: 'KAKAO_LINK_EMAIL',
      createdAt: { gt: new Date(now.getTime() - emailVerificationResendCooldownSeconds * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    const retryAt = new Date(
      recent.createdAt.getTime() + emailVerificationResendCooldownSeconds * 1000,
    );
    throwEmailVerificationRateLimitedError(
      retryAt,
      now,
      emailVerificationRateLimitTypes.RESEND_COOLDOWN,
    );
  }

  const code = createEmailVerificationCode();
  const expiresAt = new Date(now.getTime() + emailVerificationCodeTtlSeconds * 1000);
  const authToken = await prisma.authToken.create({
    data: {
      userId: session.userId,
      tokenFamilyId: session.tokenFamilyId,
      emailSnapshot: session.user.email,
      tokenType: 'KAKAO_LINK_EMAIL',
      tokenHash: await bcrypt.hash(code, passwordSaltRounds),
      expiresAt,
    },
  });

  try {
    await sendEmailVerificationCode({
      email: session.user.email,
      code,
      codeTtlSeconds: emailVerificationCodeTtlSeconds,
    });
  } catch (error) {
    await prisma.authToken.delete({ where: { id: authToken.id } });
    throw error;
  }

  await prisma.authToken.updateMany({
    where: {
      id: { not: authToken.id },
      tokenFamilyId: session.tokenFamilyId,
      tokenType: 'KAKAO_LINK_EMAIL',
      usedAt: null,
    },
    data: { usedAt: now },
  });

  return {
    email: session.user.email,
    codeTtlSeconds: emailVerificationCodeTtlSeconds,
    resendCooldownSeconds: emailVerificationResendCooldownSeconds,
    ...(env.NODE_ENV !== 'production' ? { debugCode: code } : {}),
  };
};

export const kakaoLinkByEmail = async ({ linkingToken, code }) => {
  const { session, payload, now } = await getKakaoLinkSession(linkingToken);
  const verification = await prisma.authToken.findFirst({
    where: {
      tokenFamilyId: session.tokenFamilyId,
      tokenType: 'KAKAO_LINK_EMAIL',
      usedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  if (!verification || verification.expiresAt <= now) {
    throw new HttpError(400, '이메일 인증 코드가 만료되었거나 올바르지 않습니다.', {
      errorCode: ERROR_CODES.AUTH4001,
    });
  }
  if (verification.blockedUntil && verification.blockedUntil > now) {
    throwEmailVerificationConfirmRateLimitedError(verification.blockedUntil, now);
  }

  const matched = await bcrypt.compare(code, verification.tokenHash);
  if (!matched) {
    await recordEmailVerificationFailedAttempt(verification, now);
    throwEmailVerificationConfirmError('이메일 인증 코드가 올바르지 않습니다.');
  }

  const consume = await prisma.authToken.updateMany({
    where: { id: verification.id, usedAt: null },
    data: { usedAt: now, failedAttemptCount: 0, blockedUntil: null },
  });
  if (consume.count !== 1) {
    throwEmailVerificationConfirmError('이미 사용된 이메일 인증 코드입니다.');
  }

  return completeKakaoLink(session, payload, now);
};
