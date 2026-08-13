import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';

const passwordSaltRounds = 12;

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

const toCurrentYearMonth = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${month}`;
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
  return {
    yearMonth: budget.yearMonth,
    monthlyIncome: budget.monthlyIncome !== null ? budget.monthlyIncome.toString() : null,
    monthlyBudget: budget.monthlyBudget.toString(),
  };
};

export const setBudget = async (userId, body) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  const { yearMonth, monthlyIncome, monthlyBudget } = body;
  const updateData = { monthlyBudget };
  if (monthlyIncome !== undefined) {
    updateData.monthlyIncome = monthlyIncome;
  }

  const budget = await prisma.monthlyBudget.upsert({
    where: {
      userId_yearMonth: {
        userId,
        yearMonth,
      },
    },
    update: updateData,
    create: {
      userId,
      yearMonth,
      monthlyIncome: monthlyIncome ?? null,
      monthlyBudget,
    },
  });
  return {
    yearMonth: budget.yearMonth,
    monthlyIncome: budget.monthlyIncome !== null ? budget.monthlyIncome.toString() : null,
    monthlyBudget: budget.monthlyBudget.toString(),
  };
};
