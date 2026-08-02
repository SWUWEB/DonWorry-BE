import { ok, notImplemented } from '../../utils/api-response.js';
import {
  getMe,
  updateMe,
  updateSavingGoal,
  deleteSavingGoal,
  deleteUser,
  updateNotificationSettings,
} from './users.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

export const getMeController = asyncHandler(async (req, res) => {
  const result = await getMe(BigInt(req.user.userId));
  return ok(res, result, '회원 정보 조회 성공');
});

export const updateMeController = asyncHandler(async (req, res) => {
  const result = await updateMe(BigInt(req.user.userId), req.validated.body);
  return ok(res, result, '회원 정보 수정 성공');
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
