import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';

export const getMe = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      profileImageUrl: true,
      savingGoalText: true,
      interestTagsJson: true,
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
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      nickname: true,
      profileImageUrl: true,
      savingGoalText: true,
      interestTagsJson: true,
    },
  });
  return {
    ...updatedUser,
    id: updatedUser.id.toString(),
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
