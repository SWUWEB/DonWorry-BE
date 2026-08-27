import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { env } from '../../config/env.js';
import { sendEmailChangeVerificationCode } from '../auth/auth.mailer.js';

const passwordSaltRounds = 12;
const emailChangeTokenType = 'EMAIL_CHANGE';
const emailChangeRateLimitTypes = {
  RESEND_COOLDOWN: 'RESEND_COOLDOWN',
  SEND_LIMIT: 'SEND_LIMIT',
  CONFIRM_LOCK: 'CONFIRM_LOCK',
};

const createEmailChangeCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

const createRateLimitMetadata = (retryAt, now, rateLimitType) => ({
  retryAfterSeconds: Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000)),
  retryAt: retryAt.toISOString(),
  rateLimitType,
});

const throwDuplicatedEmailError = () => {
  throw new HttpError(409, '이미 가입된 이메일입니다.', {
    errorCode: ERROR_CODES.AUTH4091,
  });
};

const throwEmailChangeRequestRateLimitedError = (retryAt, now, rateLimitType) => {
  throw new HttpError(429, '이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
    errorCode: ERROR_CODES.AUTH4291,
    ...createRateLimitMetadata(retryAt, now, rateLimitType),
  });
};

const throwEmailChangeConfirmError = (message = '이메일 변경 인증 코드가 올바르지 않습니다.') => {
  throw new HttpError(400, message, {
    errorCode: ERROR_CODES.AUTH4001,
  });
};

const throwEmailChangeConfirmRateLimitedError = (retryAt, now) => {
  throw new HttpError(429, '이메일 인증 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
    errorCode: ERROR_CODES.AUTH4291,
    ...createRateLimitMetadata(retryAt, now, emailChangeRateLimitTypes.CONFIRM_LOCK),
  });
};

const getEmailChangeUserAndAssertTarget = async (userId, newEmail, prismaClient = prisma) => {
  const [user, existingUser] = await Promise.all([
    prismaClient.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    }),
    prismaClient.user.findUnique({
      where: { email: newEmail },
      select: { id: true },
    }),
  ]);

  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }

  if (existingUser) {
    throwDuplicatedEmailError();
  }

  return user;
};

const assertEmailChangeRequestAllowed = async (userId, now) => {
  const cooldownStartedAt = new Date(now.getTime() - env.AUTH_EMAIL_RESEND_COOLDOWN_SECONDS * 1000);
  const limitWindowStartedAt = new Date(
    now.getTime() - env.AUTH_EMAIL_SEND_LIMIT_WINDOW_SECONDS * 1000,
  );
  const [recentRequest, requestsInWindow] = await Promise.all([
    prisma.authToken.findFirst({
      where: {
        userId,
        tokenType: emailChangeTokenType,
        createdAt: { gt: cooldownStartedAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.authToken.findMany({
      where: {
        userId,
        tokenType: emailChangeTokenType,
        createdAt: { gt: limitWindowStartedAt },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);
  const activeLimits = [];

  if (recentRequest) {
    activeLimits.push({
      retryAt: new Date(
        recentRequest.createdAt.getTime() + env.AUTH_EMAIL_RESEND_COOLDOWN_SECONDS * 1000,
      ),
      rateLimitType: emailChangeRateLimitTypes.RESEND_COOLDOWN,
    });
  }

  if (requestsInWindow.length >= env.AUTH_EMAIL_SEND_LIMIT) {
    const releaseRequestIndex = requestsInWindow.length - env.AUTH_EMAIL_SEND_LIMIT;
    activeLimits.push({
      retryAt: new Date(
        requestsInWindow[releaseRequestIndex].createdAt.getTime() +
          env.AUTH_EMAIL_SEND_LIMIT_WINDOW_SECONDS * 1000,
      ),
      rateLimitType: emailChangeRateLimitTypes.SEND_LIMIT,
    });
  }

  if (activeLimits.length > 0) {
    const effectiveLimit = activeLimits.reduce((latest, current) =>
      current.retryAt > latest.retryAt ? current : latest,
    );
    throwEmailChangeRequestRateLimitedError(
      effectiveLimit.retryAt,
      now,
      effectiveLimit.rateLimitType,
    );
  }
};

const recordEmailChangeFailedAttempt = async (authToken, now) => {
  const lockUntil = new Date(now.getTime() + env.AUTH_EMAIL_CONFIRM_LOCK_SECONDS * 1000);

  if (authToken.blockedUntil && authToken.blockedUntil <= now) {
    await prisma.authToken.updateMany({
      where: {
        id: authToken.id,
        usedAt: null,
        failedAttemptCount: authToken.failedAttemptCount,
        blockedUntil: authToken.blockedUntil,
      },
      data: { failedAttemptCount: 0, blockedUntil: null },
    });
  }

  const updateResult = await prisma.authToken.updateMany({
    where: {
      id: authToken.id,
      usedAt: null,
      failedAttemptCount: { lt: env.AUTH_EMAIL_CONFIRM_MAX_ATTEMPTS },
      OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
    },
    data: { failedAttemptCount: { increment: 1 }, blockedUntil: null },
  });
  const updatedToken = await prisma.authToken.findUnique({
    where: { id: authToken.id },
    select: { failedAttemptCount: true, blockedUntil: true, usedAt: true },
  });

  if (!updatedToken || updatedToken.usedAt) {
    throwEmailChangeConfirmError();
  }
  if (updatedToken.blockedUntil && updatedToken.blockedUntil > now) {
    throwEmailChangeConfirmRateLimitedError(updatedToken.blockedUntil, now);
  }

  if (updatedToken.failedAttemptCount >= env.AUTH_EMAIL_CONFIRM_MAX_ATTEMPTS) {
    const lockResult = await prisma.authToken.updateMany({
      where: {
        id: authToken.id,
        usedAt: null,
        failedAttemptCount: { gte: env.AUTH_EMAIL_CONFIRM_MAX_ATTEMPTS },
        OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
      },
      data: { blockedUntil: lockUntil },
    });
    if (lockResult.count === 1) {
      throwEmailChangeConfirmRateLimitedError(lockUntil, now);
    }

    const lockedToken = await prisma.authToken.findUnique({
      where: { id: authToken.id },
      select: { blockedUntil: true },
    });
    if (lockedToken?.blockedUntil && lockedToken.blockedUntil > now) {
      throwEmailChangeConfirmRateLimitedError(lockedToken.blockedUntil, now);
    }

    throwEmailChangeConfirmError();
  }

  if (updateResult.count !== 1) {
    throwEmailChangeConfirmError();
  }
};

export const getMe = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      profileImageUrl: true,
      savingGoalText: true,
      interestTagsJson: true,
      phoneNumber: true,
      birthDate: true,
      gender: true,
      email: true,
      loginProvider: true,
      passwordHash: true,
      hourlyWage: true,
    },
  });

  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  const { passwordHash, ...rest } = user;
  return {
    ...rest,
    id: user.id.toString(),
    birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
    hasPassword: !!passwordHash,
    hourlyWage: user.hourlyWage !== null ? user.hourlyWage.toString() : null,
  };
};

export const updateMe = async (userId, body) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }

  const data = {};
  if (body.nickname !== undefined) {
    data.nickname = body.nickname;
  }
  if (body.profileImageUrl !== undefined) {
    data.profileImageUrl = body.profileImageUrl;
  }
  if (body.interestTags !== undefined) {
    data.interestTagsJson = body.interestTags;
  }
  if (body.phoneNumber !== undefined) {
    data.phoneNumber = body.phoneNumber
      ? body.phoneNumber.replace(/^(01[016789])-?(\d{3,4})-?(\d{4})$/, '$1-$2-$3')
      : null;
  }
  if (body.birthDate !== undefined) {
    data.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  }
  if (body.gender !== undefined) {
    data.gender = body.gender;
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      nickname: true,
      profileImageUrl: true,
      savingGoalText: true,
      interestTagsJson: true,
      phoneNumber: true,
      birthDate: true,
      gender: true,
    },
  });
  return {
    ...updatedUser,
    id: updatedUser.id.toString(),
    birthDate: updatedUser.birthDate?.toISOString().slice(0, 10) ?? null,
  };
};

export const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }

  const isCurrentPasswordMatched =
    user.passwordHash && (await bcrypt.compare(currentPassword, user.passwordHash));

  if (!isCurrentPasswordMatched) {
    throw new HttpError(400, '현재 비밀번호가 올바르지 않습니다.', {
      errorCode: ERROR_CODES.USER4001,
    });
  }

  const newPasswordHash = await bcrypt.hash(newPassword, passwordSaltRounds);
  const updatedUser = await prisma.user.updateMany({
    where: {
      id: userId,
      passwordHash: user.passwordHash,
    },
    data: { passwordHash: newPasswordHash },
  });

  if (updatedUser.count !== 1) {
    throw new HttpError(400, '현재 비밀번호가 올바르지 않습니다.', {
      errorCode: ERROR_CODES.USER4001,
    });
  }
};

export const requestEmailChangeVerification = async (userId, newEmail) => {
  await getEmailChangeUserAndAssertTarget(userId, newEmail);

  const now = new Date();
  await assertEmailChangeRequestAllowed(userId, now);

  const code = createEmailChangeCode();
  const codeHash = await bcrypt.hash(code, passwordSaltRounds);
  const expiresAt = new Date(now.getTime() + env.AUTH_EMAIL_CODE_TTL_SECONDS * 1000);
  const authToken = await prisma.authToken.create({
    data: {
      userId,
      emailSnapshot: newEmail,
      tokenType: emailChangeTokenType,
      tokenHash: codeHash,
      expiresAt,
    },
    select: { id: true },
  });

  let emailDelivery;
  try {
    emailDelivery = await sendEmailChangeVerificationCode({
      email: newEmail,
      code,
      codeTtlSeconds: env.AUTH_EMAIL_CODE_TTL_SECONDS,
    });
  } catch (error) {
    if (env.NODE_ENV !== 'production') {
      emailDelivery = { delivered: false, skipped: true };
    } else {
      await prisma.authToken.delete({ where: { id: authToken.id } });
      throw error;
    }
  }

  if (env.NODE_ENV === 'production' && !emailDelivery?.delivered) {
    await prisma.authToken.delete({ where: { id: authToken.id } });
    throw new Error('Email change verification code was not delivered.');
  }

  await prisma.authToken.updateMany({
    where: {
      id: { not: authToken.id },
      userId,
      tokenType: emailChangeTokenType,
      usedAt: null,
    },
    data: { usedAt: now, failedAttemptCount: 0, blockedUntil: null },
  });

  return {
    newEmail,
    codeTtlSeconds: env.AUTH_EMAIL_CODE_TTL_SECONDS,
    resendCooldownSeconds: env.AUTH_EMAIL_RESEND_COOLDOWN_SECONDS,
    ...(env.NODE_ENV === 'development' && !emailDelivery?.delivered ? { debugCode: code } : {}),
  };
};

export const changeEmail = async (userId, newEmail, code) => {
  const user = await getEmailChangeUserAndAssertTarget(userId, newEmail);
  const now = new Date();
  const authToken = await prisma.authToken.findFirst({
    where: {
      userId,
      emailSnapshot: newEmail,
      tokenType: emailChangeTokenType,
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
    throwEmailChangeConfirmError();
  }
  if (authToken.usedAt) {
    throwEmailChangeConfirmError('이미 사용된 이메일 변경 인증 코드입니다.');
  }
  if (authToken.expiresAt <= now) {
    throwEmailChangeConfirmError('이메일 변경 인증 코드가 만료되었습니다.');
  }
  if (authToken.blockedUntil && authToken.blockedUntil > now) {
    throwEmailChangeConfirmRateLimitedError(authToken.blockedUntil, now);
  }

  const isCodeMatched = await bcrypt.compare(code, authToken.tokenHash);
  if (!isCodeMatched) {
    await recordEmailChangeFailedAttempt(authToken, now);
    throwEmailChangeConfirmError();
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const consumeResult = await tx.authToken.updateMany({
          where: {
            id: authToken.id,
            userId,
            emailSnapshot: newEmail,
            tokenType: emailChangeTokenType,
            usedAt: null,
            expiresAt: { gt: now },
            OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
          },
          data: { usedAt: now, failedAttemptCount: 0, blockedUntil: null },
        });

        if (consumeResult.count !== 1) {
          throwEmailChangeConfirmError('이미 사용된 이메일 변경 인증 코드입니다.');
        }

        const updateResult = await tx.user.updateMany({
          where: { id: userId, email: user.email },
          data: { email: newEmail, emailVerifiedAt: now },
        });
        if (updateResult.count !== 1) {
          throwEmailChangeConfirmError('이메일 변경 요청 상태가 올바르지 않습니다.');
        }

        await tx.authToken.updateMany({
          where: {
            id: { not: authToken.id },
            userId,
            tokenType: emailChangeTokenType,
            usedAt: null,
          },
          data: { usedAt: now, failedAttemptCount: 0, blockedUntil: null },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throwDuplicatedEmailError();
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throwEmailChangeConfirmError('이메일 변경 요청이 충돌했습니다. 다시 시도해 주세요.');
    }
    throw error;
  }

  return { email: newEmail };
};

export const updateSavingGoal = async (userId, body) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      savingGoalText: body.savingGoalText,
      targetSavingAmount: body.targetSavingAmount,
      savingGoalIsActive: body.savingGoalIsActive ?? true,
    },
    select: {
      id: true,
      savingGoalText: true,
      targetSavingAmount: true,
      savingGoalIsActive: true,
    },
  });
  return {
    ...updatedUser,
    id: updatedUser.id.toString(),
    targetSavingAmount: updatedUser.targetSavingAmount.toString(),
  };
};

export const deleteSavingGoal = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      savingGoalText: null,
      targetSavingAmount: null,
      savingGoalIsActive: false,
    },
    select: {
      id: true,
      savingGoalIsActive: true,
    },
  });
  return {
    ...updatedUser,
    id: updatedUser.id.toString(),
  };
};

export const deleteUser = async (userId, password, reasonType) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user || !user.passwordHash) {
    throw new HttpError(400, '비밀번호가 올바르지 않습니다.', {
      errorCode: ERROR_CODES.USER4001,
    });
  }

  const isPasswordMatched = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordMatched) {
    throw new HttpError(400, '비밀번호가 올바르지 않습니다.', {
      errorCode: ERROR_CODES.USER4001,
    });
  }
  await prisma.$transaction(async (tx) => {
    await tx.withdrawalAudit.create({
      data: {
        userEmailHash: createHmac('sha256', process.env.JWT_ACCESS_SECRET)
          .update(user.email)
          .digest('hex'),
        reasonType: reasonType ?? null,
      },
    });
    await tx.authToken.deleteMany({
      where: { userId },
    });
    const deletedUser = await tx.user.deleteMany({
      where: {
        id: userId,
        passwordHash: user.passwordHash,
      },
    });
    if (deletedUser.count !== 1) {
      throw new HttpError(400, '비밀번호가 올바르지 않습니다.', {
        errorCode: ERROR_CODES.USER4001,
      });
    }
  });
};

export const updateNotificationSettings = async (userId, body) => {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        notifyGeneralEnabled: true,
        notifyGoalEnabled: true,
        notifyTemptationEnabled: true,
        notifyPushEnabled: true,
      },
    });
    if (!user) {
      throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
        errorCode: ERROR_CODES.USER4041,
      });
    }
    const next = {
      notifyGeneralEnabled: body.notifyGeneralEnabled ?? user.notifyGeneralEnabled,
      notifyGoalEnabled: body.notifyGoalEnabled ?? user.notifyGoalEnabled,
      notifyTemptationEnabled: body.notifyTemptationEnabled ?? user.notifyTemptationEnabled,
    };

    if (body.notifyPushEnabled !== undefined) {
      next.notifyGeneralEnabled = body.notifyPushEnabled;
      next.notifyGoalEnabled = body.notifyPushEnabled;
      next.notifyTemptationEnabled = body.notifyPushEnabled;
    }
    next.notifyPushEnabled =
      next.notifyGeneralEnabled && next.notifyGoalEnabled && next.notifyTemptationEnabled;

    const result = await prisma.user.updateMany({
      where: {
        id: userId,
        notifyGeneralEnabled: user.notifyGeneralEnabled,
        notifyGoalEnabled: user.notifyGoalEnabled,
        notifyTemptationEnabled: user.notifyTemptationEnabled,
        notifyPushEnabled: user.notifyPushEnabled,
      },
      data: next,
    });
    if (result.count === 1) {
      return next;
    }
  }
  throw new HttpError(409, '동시 요청 충돌이 발생했습니다.', {
    errorCode: ERROR_CODES.USER4091,
  });
};

export const getNotificationSettings = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      notifyGeneralEnabled: true,
      notifyGoalEnabled: true,
      notifyTemptationEnabled: true,
      notifyPushEnabled: true,
    },
  });

  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  return user;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const toCurrentYearMonth = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${month}`;
};
const getKstMonthRange = (yearMonth) => {
  const [year, month] = yearMonth.split('-').map(Number);
  return {
    startAt: new Date(Date.UTC(year, month - 1, 1) - KST_OFFSET_MS),
    endAt: new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS),
  };
};

export const getBudget = async (userId, yearMonth) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  const targetYearMonth = yearMonth ?? toCurrentYearMonth();
  const budget = await prisma.monthlyBudget.findUnique({
    where: {
      userId_yearMonth: {
        userId,
        yearMonth: targetYearMonth,
      },
    },
  });
  if (!budget) return null;

  const { startAt, endAt } = getKstMonthRange(targetYearMonth);
  const consumptionRecords = await prisma.consumptionRecord.findMany({
    where: {
      userId,
      occurredAt: {
        gte: startAt,
        lt: endAt,
      },
      type: 'CONSUMED',
    },
    select: { categoryCode: true, price: true },
  });

  const spentMap = {};
  let totalSpentAmount = 0;
  for (const record of consumptionRecords) {
    const categoryKey = record.categoryCode ?? 'ETC';
    const amount = Number(record.price || 0);
    spentMap[categoryKey] = (spentMap[categoryKey] || 0) + amount;
    totalSpentAmount += amount;
  }

  const rawCategoryBudgets = budget.categoryBudgets;
  let categoryBudgetsResult = [];

  if (Array.isArray(rawCategoryBudgets)) {
    categoryBudgetsResult = rawCategoryBudgets.map((item) => {
      const categoryKey = item.categoryCode;
      const budgetAmount = Number(item.budgetAmount || 0);
      const spentAmount = spentMap[categoryKey] || 0;
      const remainingAmount = budgetAmount - spentAmount;
      const usageRate =
        budgetAmount > 0 ? Math.min(100, Math.round((spentAmount / budgetAmount) * 100)) : 0;
      return {
        ...item,
        budgetAmount: budgetAmount.toString(),
        spentAmount: spentAmount.toString(),
        remainingAmount: remainingAmount.toString(),
        usageRate,
      };
    });
  }
  const totalMonthlyIncome = Number(budget.monthlyIncome || 0);
  const totalRemainingAmount = totalMonthlyIncome - totalSpentAmount;
  const totalUsageRate =
    totalMonthlyIncome > 0
      ? Math.min(100, Math.round((totalSpentAmount / totalMonthlyIncome) * 100))
      : 0;

  const hourlyWage = user.hourlyWage !== null ? Number(user.hourlyWage) : null;
  const workedHours =
    hourlyWage && hourlyWage > 0 && budget.monthlyIncome !== null
      ? Math.round(totalMonthlyIncome / hourlyWage)
      : null;
  const spentHours =
    hourlyWage && hourlyWage > 0 ? Math.round((totalSpentAmount / hourlyWage) * 10) / 10 : null;
  return {
    yearMonth: budget.yearMonth,
    monthlyIncome: budget.monthlyIncome !== null ? budget.monthlyIncome.toString() : null,
    monthlyBudget: budget.monthlyBudget.toString(),
    spentAmount: totalSpentAmount.toString(),
    remainingAmount: totalRemainingAmount.toString(),
    usageRate: totalUsageRate,
    categoryBudgets: categoryBudgetsResult,
    hourlyWage: hourlyWage !== null ? hourlyWage.toString() : null,
    workedHours,
    spentHours,
  };
};

const isPrismaTransactionConflictError = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';

export const setBudget = async (userId, body) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  const { yearMonth, monthlyIncome, monthlyBudget, categoryBudgets, hourlyWage } = body;
  const normalizedCategoryBudgets = categoryBudgets?.map((item) => ({
    ...item,
    budgetAmount: item.budgetAmount.toString(),
  }));

  const upsertBudget = () =>
    prisma.$transaction(
      async (tx) => {
        const existing = await tx.monthlyBudget.findUnique({
          where: { userId_yearMonth: { userId, yearMonth } },
        });

        let mergedCategoryBudgets = existing?.categoryBudgets ?? [];
        if (categoryBudgets !== undefined) {
          mergedCategoryBudgets = normalizedCategoryBudgets;
        }

        await tx.monthlyBudget.upsert({
          where: { userId_yearMonth: { userId, yearMonth } },
          create: {
            userId,
            yearMonth,
            monthlyIncome: monthlyIncome ?? null,
            monthlyBudget: monthlyBudget ?? 0n,
            categoryBudgets: mergedCategoryBudgets,
          },
          update: {
            ...(monthlyIncome !== undefined && { monthlyIncome }),
            ...(monthlyBudget !== undefined && { monthlyBudget }),
            categoryBudgets: mergedCategoryBudgets,
          },
        });
        if (hourlyWage !== undefined) {
          await tx.user.update({
            where: { id: userId },
            data: { hourlyWage },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await upsertBudget();
      break;
    } catch (error) {
      const shouldRetry = isPrismaTransactionConflictError(error);

      if (!shouldRetry || attempt === 2) {
        throw error;
      }

      const retryDelayMs = 10 * 2 ** attempt + randomInt(0, 11);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  return await getBudget(userId, yearMonth);
};
