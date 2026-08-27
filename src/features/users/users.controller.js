import { ok } from '../../utils/api-response.js';
import {
  getMe,
  updateMe,
  changePassword,
  requestEmailChangeVerification,
  changeEmail,
  updateSavingGoal,
  deleteSavingGoal,
  deleteUser,
  updateNotificationSettings,
  getNotificationSettings,
  getBudget,
  setBudget,
} from './users.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const getMeController = asyncHandler(async (req, res) => {
  const result = await getMe(BigInt(req.user.userId));
  return ok(res, result, '회원 정보 조회 성공');
});

export const updateMeController = asyncHandler(async (req, res) => {
  const result = await updateMe(BigInt(req.user.userId), req.validated.body);
  return ok(res, result, '회원 정보 수정 성공');
});

export const changePasswordController = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.validated.body;
  await changePassword(BigInt(req.user.userId), currentPassword, newPassword);
  return ok(res, null, '비밀번호가 변경되었습니다.');
});

export const requestEmailChangeVerificationController = asyncHandler(async (req, res) => {
  const result = await requestEmailChangeVerification(
    BigInt(req.user.userId),
    req.validated.body.newEmail,
  );
  return ok(res, result, '이메일 변경 인증번호가 발송되었습니다.');
});

export const changeEmailController = asyncHandler(async (req, res) => {
  const result = await changeEmail(
    BigInt(req.user.userId),
    req.validated.body.newEmail,
    req.validated.body.code,
  );
  return ok(res, result, '이메일이 변경되었습니다.');
});

export const updateSavingGoalController = asyncHandler(async (req, res) => {
  const result = await updateSavingGoal(BigInt(req.user.userId), req.validated.body);
  return ok(res, result, '절약 목적 수정 성공');
});

export const deleteSavingGoalController = asyncHandler(async (req, res) => {
  const result = await deleteSavingGoal(BigInt(req.user.userId));
  return ok(res, result, '절약 목적 삭제 성공');
});

export const deleteUserController = asyncHandler(async (req, res) => {
  await deleteUser(
    BigInt(req.user.userId),
    req.validated.body.password,
    req.validated.body.reasonType,
  );
  return ok(res, null, '회원 탈퇴 성공');
});

export const updateNotificationSettingsController = asyncHandler(async (req, res) => {
  const result = await updateNotificationSettings(BigInt(req.user.userId), req.validated.body);
  return ok(res, result, '알림 설정 수정 성공');
});

export const getNotificationSettingsController = asyncHandler(async (req, res) => {
  const result = await getNotificationSettings(BigInt(req.user.userId));
  return ok(res, result, '알림 설정 조회 성공');
});

export const getBudgetController = asyncHandler(async (req, res) => {
  const { yearMonth } = req.validated.query;
  const result = await getBudget(BigInt(req.user.userId), yearMonth);
  return ok(res, result, '월별 수입/예산 조회 성공');
});

export const setBudgetController = asyncHandler(async (req, res) => {
  const result = await setBudget(BigInt(req.user.userId), req.validated.body);
  return ok(res, result, '월별 수입/예산이 설정되었습니다.');
});
