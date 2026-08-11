import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';

export const getOnboarding = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      interestTagsJson: true,
      savingGoalText: true,
      targetSavingAmount: true,
    },
  });

  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }

  return {
    interestTags: user.interestTagsJson,
    savingGoalText: user.savingGoalText,
    targetSavingAmount:
      user.targetSavingAmount !== null ? user.targetSavingAmount.toString() : null,
  };
};

export const updateOnboarding = async (userId, body) => {
  let updatedUser;
  try {
    updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        interestTagsJson: body.interestTags,
        savingGoalText: body.savingGoalText,
        targetSavingAmount: body.targetSavingAmount,
        onboardingCompletedAt: new Date(),
      },
      select: {
        interestTagsJson: true,
        savingGoalText: true,
        targetSavingAmount: true,
      },
    });
  } catch (err) {
    if (err.code === 'P2025') {
      throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
        errorCode: ERROR_CODES.USER4041,
      });
    }
    throw err;
  }

  return {
    interestTags: updatedUser.interestTagsJson,
    savingGoalText: updatedUser.savingGoalText,
    targetSavingAmount:
      updatedUser.targetSavingAmount !== null ? updatedUser.targetSavingAmount.toString() : null,
  };
};
