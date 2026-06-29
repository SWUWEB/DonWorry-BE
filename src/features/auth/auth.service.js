import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';

const passwordSaltRounds = 12;
const emailVerificationJwtTtl = '10m';

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

export const createEmailVerificationToken = (email) => {
  return jwt.sign({ purpose: 'emailVerification', email }, env.JWT_ACCESS_SECRET, {
    expiresIn: emailVerificationJwtTtl,
  });
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
