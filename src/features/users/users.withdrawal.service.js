import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { getKakaoWithdrawalIdentity, unlinkKakaoUser } from '../auth/kakao.client.js';

const invalidPassword = () =>
  new HttpError(400, '비밀번호가 올바르지 않습니다.', { errorCode: ERROR_CODES.USER4001 });

const invalidKakaoAccount = () =>
  new HttpError(400, '현재 계정과 다른 카카오 계정입니다.', {
    errorCode: ERROR_CODES.USER4002,
  });

const withdrawalInProgress = () =>
  new HttpError(409, '회원 탈퇴 처리가 진행 중입니다.', {
    errorCode: ERROR_CODES.USER4092,
  });

const withdrawalStateHash = (state) => createHash('sha256').update(state).digest('hex');

const requireKakaoAdminKey = () => {
  if (!env.KAKAO_ADMIN_KEY) {
    throw new HttpError(502, '카카오 앱 연결 해제 설정이 완료되지 않았습니다.', {
      errorCode: ERROR_CODES.AUTH5021,
    });
  }
};

export const startKakaoWithdrawal = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, kakaoUserId: true },
  });
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  if (user.passwordHash || !user.kakaoUserId) {
    throw new HttpError(400, '카카오 전용 계정만 재인증 URL을 발급할 수 있습니다.', {
      errorCode: ERROR_CODES.USER4002,
    });
  }
  if (await prisma.withdrawalAttempt.findUnique({ where: { userId } })) {
    throw withdrawalInProgress();
  }
  requireKakaoAdminKey();
  if (!env.KAKAO_CLIENT_ID || !env.KAKAO_REDIRECT_URI) {
    throw new HttpError(502, '카카오 로그인 설정이 완료되지 않았습니다.', {
      errorCode: ERROR_CODES.AUTH5021,
    });
  }

  const state = randomBytes(32).toString('base64url');
  const expiresInSeconds = env.KAKAO_WITHDRAWAL_STATE_TTL_SECONDS;
  await prisma.$transaction(async (tx) => {
    await tx.authToken.deleteMany({
      where: { userId, tokenType: 'KAKAO_WITHDRAWAL' },
    });
    await tx.authToken.create({
      data: {
        userId,
        tokenType: 'KAKAO_WITHDRAWAL',
        tokenHash: withdrawalStateHash(state),
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      },
    });
  });

  const authorizationUrl = new URL('https://kauth.kakao.com/oauth/authorize');
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.KAKAO_CLIENT_ID,
    redirect_uri: env.KAKAO_REDIRECT_URI,
    prompt: 'login',
    state,
  }).toString();
  return { authorizationUrl: authorizationUrl.toString(), expiresInSeconds };
};

const consumeKakaoWithdrawalState = async (userId, state) => {
  const result = await prisma.authToken.updateMany({
    where: {
      userId,
      tokenType: 'KAKAO_WITHDRAWAL',
      tokenHash: withdrawalStateHash(state),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (result.count !== 1) {
    throw new HttpError(401, '카카오 탈퇴 재인증이 만료되었거나 올바르지 않습니다.', {
      errorCode: ERROR_CODES.AUTH4012,
    });
  }
};

const createWithdrawalAudit = (tx, user, reasonType) =>
  tx.withdrawalAudit.create({
    data: {
      userEmailHash: createHmac('sha256', env.JWT_ACCESS_SECRET).update(user.email).digest('hex'),
      reasonType: reasonType ?? null,
    },
  });

const deleteLocalUser = async (user, password, reasonType) => {
  await prisma.$transaction(async (tx) => {
    await createWithdrawalAudit(tx, user, reasonType);
    await tx.authToken.deleteMany({ where: { userId: user.id } });
    const deleted = await tx.user.deleteMany({
      where: { id: user.id, passwordHash: user.passwordHash },
    });
    if (deleted.count !== 1) {
      throw invalidPassword();
    }
  });
};

export const finalizeKakaoWithdrawalAttempt = async (attemptId) => {
  await prisma.$transaction(async (tx) => {
    const attempt = await tx.withdrawalAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.status !== 'UNLINKED') {
      throw withdrawalInProgress();
    }

    const user = await tx.user.findUnique({
      where: { id: attempt.userId },
      select: { id: true, email: true, kakaoUserId: true },
    });
    if (!user || user.kakaoUserId !== attempt.kakaoUserId) {
      throw new HttpError(409, '탈퇴 대상 계정이 변경되어 수동 확인이 필요합니다.', {
        errorCode: ERROR_CODES.USER4092,
      });
    }

    await createWithdrawalAudit(tx, user, attempt.reasonType);
    await tx.authToken.deleteMany({ where: { userId: user.id } });
    const deleted = await tx.user.deleteMany({
      where: { id: user.id, kakaoUserId: attempt.kakaoUserId },
    });
    if (deleted.count !== 1) {
      throw withdrawalInProgress();
    }
    await tx.withdrawalAttempt.delete({ where: { id: attempt.id } });
  });
};

export const reconcileKakaoWithdrawalAttempt = async (attemptId) => {
  const attempt = await prisma.withdrawalAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return;

  if (attempt.status === 'UNLINK_PENDING') {
    await unlinkKakaoUser({
      kakaoUserId: attempt.kakaoUserId,
      allowAlreadyUnlinked: true,
    });
    await prisma.withdrawalAttempt.updateMany({
      where: { id: attempt.id, status: 'UNLINK_PENDING' },
      data: { status: 'UNLINKED' },
    });
  }

  await finalizeKakaoWithdrawalAttempt(attempt.id);
};

export const deleteUser = async (userId, { password, authorizationCode, state, reasonType }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, kakaoUserId: true },
  });
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }

  if (await prisma.withdrawalAttempt.findUnique({ where: { userId } })) {
    throw withdrawalInProgress();
  }

  if (user.passwordHash) {
    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
      throw invalidPassword();
    }
  } else {
    if (!user.kakaoUserId || !authorizationCode || !state) {
      throw new HttpError(400, '카카오 재인증이 필요합니다.', {
        errorCode: ERROR_CODES.USER4002,
      });
    }
  }

  if (!user.kakaoUserId) {
    await deleteLocalUser(user, password, reasonType);
    return;
  }

  requireKakaoAdminKey();

  let accessToken;
  if (!user.passwordHash) {
    await consumeKakaoWithdrawalState(userId, state);
    const kakaoIdentity = await getKakaoWithdrawalIdentity(authorizationCode);
    if (kakaoIdentity.kakaoUserId !== user.kakaoUserId) {
      throw invalidKakaoAccount();
    }
    accessToken = kakaoIdentity.accessToken;
  }

  let attempt;
  try {
    attempt = await prisma.withdrawalAttempt.create({
      data: {
        userId,
        kakaoUserId: user.kakaoUserId,
        reasonType: reasonType ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw withdrawalInProgress();
    }
    throw error;
  }

  try {
    await unlinkKakaoUser({ accessToken, kakaoUserId: user.kakaoUserId });
    await prisma.withdrawalAttempt.update({
      where: { id: attempt.id },
      data: { status: 'UNLINKED' },
    });
    await finalizeKakaoWithdrawalAttempt(attempt.id);
  } catch (error) {
    // Unlink may already have succeeded. Keep the attempt for the recovery command.
    console.error('Kakao withdrawal requires reconciliation', {
      attemptId: attempt.id.toString(),
      status: error.statusCode ?? 500,
      code: error.errorCode ?? null,
    });
    throw error;
  }
};
