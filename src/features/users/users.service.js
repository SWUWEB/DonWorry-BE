import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';

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
