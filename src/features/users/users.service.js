import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';

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
    },
  });

  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  return {
    ...user,
    id: user.id.toString(),
    birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
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
  return {
    yearMonth: budget.yearMonth,
    monthlyIncome: budget.monthlyIncome !== null ? budget.monthlyIncome.toString() : null,
    monthlyBudget: budget.monthlyBudget.toString(),
    spentAmount: totalSpentAmount.toString(),
    remainingAmount: totalRemainingAmount.toString(),
    usageRate: totalUsageRate,
    categoryBudgets: categoryBudgetsResult,
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
  const { yearMonth, monthlyIncome, monthlyBudget, categoryBudgets } = body;
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
