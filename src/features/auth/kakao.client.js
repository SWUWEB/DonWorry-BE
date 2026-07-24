import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { HttpError } from '../../utils/http-error.js';

const tokenEndpoint = 'https://kauth.kakao.com/oauth/token';
const userInfoEndpoint = 'https://kapi.kakao.com/v2/user/me';

const kakaoAuthError = () =>
  new HttpError(401, '카카오 인증이 만료되었거나 올바르지 않습니다.', {
    errorCode: ERROR_CODES.AUTH4012,
  });

const kakaoUpstreamError = (details) =>
  new HttpError(502, '카카오 로그인 서비스와 통신하지 못했습니다.', {
    errorCode: ERROR_CODES.AUTH5021,
    details,
  });

const requestKakao = async (url, options, authenticationFailureStatuses = []) => {
  let response;

  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(env.KAKAO_HTTP_TIMEOUT_MS),
    });
  } catch (error) {
    throw kakaoUpstreamError(error.message);
  }

  let data;
  try {
    data = await response.json();
  } catch (_error) {
    throw kakaoUpstreamError(`Kakao returned a non-JSON response (${response.status}).`);
  }

  if (!response.ok) {
    if (authenticationFailureStatuses.includes(response.status)) {
      throw kakaoAuthError();
    }

    throw kakaoUpstreamError({ status: response.status, kakao: data });
  }

  return data;
};

export const getKakaoUser = async (authorizationCode) => {
  if (!env.KAKAO_CLIENT_ID || !env.KAKAO_CLIENT_SECRET || !env.KAKAO_REDIRECT_URI) {
    throw kakaoUpstreamError('Kakao OAuth environment variables are not configured.');
  }

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.KAKAO_CLIENT_ID,
    client_secret: env.KAKAO_CLIENT_SECRET,
    redirect_uri: env.KAKAO_REDIRECT_URI,
    code: authorizationCode,
  });
  const token = await requestKakao(
    tokenEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: tokenBody,
    },
    [400, 401],
  );

  if (!token.access_token) {
    throw kakaoUpstreamError('Kakao token response does not contain access_token.');
  }

  const user = await requestKakao(
    userInfoEndpoint,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.access_token}` },
    },
    [401],
  );
  const account = user.kakao_account;
  const profile = account?.profile;
  const email = account?.email?.trim().toLowerCase();
  const nickname = profile?.nickname?.trim();
  const nicknameNeedsAgreement =
    account?.profile_nickname_needs_agreement ?? account?.profile_needs_agreement;
  const profileImageNeedsAgreement = account?.profile_image_needs_agreement === true;

  if (
    !user.id ||
    account?.email_needs_agreement !== false ||
    account?.is_email_valid !== true ||
    account?.is_email_verified !== true ||
    !email ||
    nicknameNeedsAgreement !== false ||
    !nickname
  ) {
    throw new HttpError(400, '카카오 계정의 필수 정보를 제공받지 못했습니다.', {
      errorCode: ERROR_CODES.AUTH4004,
    });
  }

  return {
    kakaoUserId: String(user.id),
    email,
    nickname,
    profileImageUrl: profileImageNeedsAgreement ? null : profile.profile_image_url || null,
  };
};
