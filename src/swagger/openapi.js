import {
  checkEmailDto,
  checkLoginIdDto,
  emailVerificationConfirmDto,
  emailVerificationRequestDto,
  loginDto,
  passwordResetConfirmDto,
  passwordResetRequestDto,
  refreshTokenDto,
  signupDto,
} from '../features/auth/auth.dto.js';
import {
  consumptionRecordIdDto,
  createConsumptionRecordDto,
  updateConsumptionRecordDto,
} from '../features/consumption-records/consumption-records.dto.js';
import { calculateRiskScoreDto } from '../features/interventions/interventions.dto.js';
import { notificationIdDto } from '../features/notifications/notifications.dto.js';
import { upsertOnboardingDto } from '../features/onboarding/onboarding.dto.js';
import { parseProductUrlDto } from '../features/product-url/product-url.dto.js';
import {
  createWishlistDecisionDto,
  temptationIdDto,
} from '../features/temptations/temptations.dto.js';
import {
  changePasswordDto,
  notificationSettingsDto,
  savingGoalDto,
  updateMeDto,
} from '../features/users/users.dto.js';
import {
  createWishlistItemDto,
  updateWishlistItemDto,
  wishlistItemIdDto,
} from '../features/wishlist-items/wishlist-items.dto.js';
import { withZodDto } from './zod-openapi.js';

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'DonWorry API',
    version: '0.1.0',
    description: 'DonWorry backend API documentation',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local development server',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Onboarding' },
    { name: 'Home' },
    { name: 'ConsumptionRecords' },
    { name: 'Interventions' },
    { name: 'ProductUrl' },
    { name: 'Reports' },
    { name: 'Notifications' },
    { name: 'WishlistItems' },
    { name: 'Temptations' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token. Swagger UI will send it as Authorization: Bearer <token>.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          code: { type: 'string', example: 'COMMON4001' },
          message: { type: 'string', example: 'Invalid request' },
        },
      },
      ValidationErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          code: { type: 'string', example: 'COMMON4001' },
          message: { type: 'string', example: 'Invalid request' },
          errors: {
            type: 'object',
            properties: {
              formErrors: {
                type: 'array',
                items: { type: 'string' },
                example: [],
              },
              fieldErrors: {
                type: 'object',
                additionalProperties: {
                  type: 'array',
                  items: { type: 'string' },
                },
                example: {
                  email: ['올바른 이메일 형식이 아닙니다.'],
                },
              },
            },
          },
        },
      },
      NotImplementedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'auth API is not implemented yet' },
        },
      },
      SignupResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '회원가입이 완료되었습니다.' },
          data: {
            type: 'object',
            properties: {
              userId: { type: 'string', example: '1' },
              loginId: { type: 'string', example: 'gachi123' },
              name: { type: 'string', example: '홍길동' },
              email: { type: 'string', format: 'email', example: 'user@example.com' },
              phoneNumber: { type: 'string', example: '010-0000-0000' },
            },
          },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '로그인이 완료되었습니다.' },
          data: {
            type: 'object',
            properties: {
              accessToken: {
                type: 'string',
                example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              },
              refreshToken: {
                type: 'string',
                example: '5JxQdKc0yW5rYIYqunzBMT4o62AofWYWfAVvUdGdXug',
              },
              tokenType: { type: 'string', example: 'Bearer' },
              user: {
                type: 'object',
                properties: {
                  userId: { type: 'string', example: '1' },
                  loginId: { type: 'string', example: 'gachi123' },
                  name: { type: 'string', example: '홍길동' },
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  phoneNumber: { type: 'string', example: '010-0000-0000' },
                },
              },
            },
          },
        },
      },
      RefreshTokenResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '토큰 재발급이 완료되었습니다.' },
          data: {
            type: 'object',
            properties: {
              tokenType: { type: 'string', example: 'Bearer' },
              accessToken: {
                type: 'string',
                example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              },
              refreshToken: {
                type: 'string',
                example: '5JxQdKc0yW5rYIYqunzBMT4o62AofWYWfAVvUdGdXug',
                description: 'Rotated refresh token. Use this value for the next refresh request.',
              },
            },
          },
        },
      },
      CheckEmailResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'OK' },
          data: {
            type: 'object',
            properties: {
              available: { type: 'boolean', example: true },
            },
          },
        },
      },
      EmailVerificationResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '이메일 인증 요청이 완료되었습니다.' },
          data: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email', example: 'user@example.com' },
              codeTtlSeconds: { type: 'integer', example: 600 },
              resendCooldownSeconds: { type: 'integer', example: 60 },
              debugCode: {
                type: 'string',
                example: '123456',
                description: 'Development only. Returned when SMTP delivery is skipped or fails.',
              },
            },
          },
        },
      },
      EmailVerificationConfirmResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '이메일 인증이 완료되었습니다.' },
          data: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email', example: 'user@example.com' },
              emailVerificationToken: {
                type: 'string',
                example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              },
            },
          },
        },
      },
      CheckLoginIdResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'OK' },
          data: {
            type: 'object',
            properties: {
              available: { type: 'boolean', example: true },
            },
          },
        },
      },
      ConsumptionRecordResult: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '1' },
          type: { type: 'string', example: 'CONSUMED' },
          productName: { type: 'string', example: '쿠팡 상품' },
          price: { type: ['number', 'null'], example: 12000 },
          occurredAt: { type: 'string', format: 'date-time', example: '2026-07-02T14:52:20.000Z' },
        },
      },
      ConsumptionRecordCreatedResponse: {
        type: 'object',
        properties: {
          isSuccess: { type: 'boolean', example: true },
          status: { type: 'integer', example: 201 },
          code: { type: ['string', 'null'], example: null },
          message: { type: 'string', example: '소비 기록 생성에 성공했습니다.' },
          result: { $ref: '#/components/schemas/ConsumptionRecordResult' },
        },
      },
    },
    responses: {
      NotImplemented: {
        description: 'Endpoint scaffolded but not implemented yet',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NotImplementedResponse' },
          },
        },
      },
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        security: [],
        responses: {
          200: {
            description: 'Server health status',
          },
        },
      },
    },
    '/api/v1/auth/signup': {
      post: {
        ...publicJsonOperation('Auth', '회원가입', signupDto),
        responses: {
          201: {
            description: 'Signup completed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignupResponse' },
              },
            },
          },
          400: {
            description: 'Invalid request or email verification token',
            content: {
              'application/json': {
                schema: {
                  anyOf: [
                    { $ref: '#/components/schemas/ValidationErrorResponse' },
                    { $ref: '#/components/schemas/ErrorResponse' },
                  ],
                },
              },
            },
          },
          409: {
            description: 'Duplicated email or login id',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        ...publicJsonOperation('Auth', '로그인', loginDto),
        responses: {
          200: {
            description: 'Login completed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          400: {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: {
            description: 'Invalid login id or password',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: securedOperation('Auth', '로그아웃'),
    },
    '/api/v1/auth/refresh': {
      post: {
        ...publicJsonOperation('Auth', '토큰 재발급', refreshTokenDto),
        responses: {
          200: {
            description: 'Access token refreshed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RefreshTokenResponse' },
              },
            },
          },
          400: {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: {
            description: 'Invalid, expired, used, or revoked refresh token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/check-email': {
      get: {
        ...withZodDto(publicOperation('Auth', '이메일 중복 확인'), checkEmailDto),
        responses: {
          200: {
            description: 'Email availability',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CheckEmailResponse' },
              },
            },
          },
          400: {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/check-login-id': {
      get: {
        ...withZodDto(publicOperation('Auth', '아이디 중복 확인'), checkLoginIdDto),
        responses: {
          200: {
            description: 'Login id availability',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CheckLoginIdResponse' },
              },
            },
          },
          400: {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/email-verifications': {
      post: {
        ...publicJsonOperation('Auth', '이메일 인증 요청', emailVerificationRequestDto),
        responses: {
          200: {
            description: 'Email verification code sent',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EmailVerificationResponse' },
              },
            },
          },
          400: {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          409: {
            description: 'Duplicated email',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          429: {
            description: 'Email verification request rate limited',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/email-verifications/confirm': {
      post: {
        ...publicJsonOperation('Auth', '이메일 인증 확인', emailVerificationConfirmDto),
        responses: {
          200: {
            description: 'Email verification confirmed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EmailVerificationConfirmResponse' },
              },
            },
          },
          400: {
            description: 'Invalid request, expired code, wrong code, or already used code',
            content: {
              'application/json': {
                schema: {
                  anyOf: [
                    { $ref: '#/components/schemas/ValidationErrorResponse' },
                    { $ref: '#/components/schemas/ErrorResponse' },
                  ],
                },
              },
            },
          },
          409: {
            description: 'Duplicated email',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          429: {
            description: 'Email verification confirm rate limited',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/password-reset/request': {
      post: publicJsonOperation('Auth', '비밀번호 재설정 요청', passwordResetRequestDto),
    },
    '/api/v1/auth/password-reset/confirm': {
      patch: publicJsonOperation('Auth', '비밀번호 재설정 완료', passwordResetConfirmDto),
    },
    '/api/v1/auth/kakao/login': {
      post: publicOperation('Auth', '카카오 로그인'),
    },
    '/api/v1/users/me': {
      get: securedOperation('Users', '내 정보 조회'),
      patch: securedJsonOperation('Users', '내 정보 수정', updateMeDto),
      delete: securedOperation('Users', '회원 탈퇴'),
    },
    '/api/v1/users/me/password': {
      patch: securedJsonOperation('Users', '비밀번호 변경', changePasswordDto),
    },
    '/api/v1/users/me/saving-goal': {
      put: securedJsonOperation('Users', '절약 목표 설정/수정', savingGoalDto),
      delete: securedOperation('Users', '절약 목표 삭제/해제'),
    },
    '/api/v1/users/me/notification-settings': {
      patch: securedJsonOperation('Users', '알림 설정 수정', notificationSettingsDto),
    },
    '/api/v1/onboarding': {
      get: securedOperation('Onboarding', '온보딩 정보 조회'),
      put: securedJsonOperation('Onboarding', '온보딩 정보 저장/수정', upsertOnboardingDto),
    },
    '/api/v1/home/summary': {
      get: securedOperation('Home', '홈 요약 조회'),
    },
    '/api/v1/home/cheer-message': {
      get: securedOperation('Home', '응원 메시지 조회'),
    },
    '/api/v1/home/daily-question': {
      get: securedOperation('Home', '오늘의 소비 질문 조회'),
    },
    '/api/v1/consumption-records': {
      get: securedOperation('ConsumptionRecords', '소비 기록 목록 조회'),
      post: {
        ...withZodDto(
          securedOperation('ConsumptionRecords', '소비 기록 입력'),
          createConsumptionRecordDto,
        ),
        responses: {
          201: {
            description: 'Consumption record created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConsumptionRecordCreatedResponse' },
              },
            },
          },
          400: {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          401: {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/consumption-records/{consumptionRecordId}': {
      get: withZodDto(
        securedOperation('ConsumptionRecords', '소비 기록 상세'),
        consumptionRecordIdDto,
      ),
      patch: securedJsonOperation(
        'ConsumptionRecords',
        '소비 기록 수정',
        updateConsumptionRecordDto,
      ),
      delete: withZodDto(
        securedOperation('ConsumptionRecords', '소비 기록 삭제'),
        consumptionRecordIdDto,
      ),
    },
    '/api/v1/intervention-questions': {
      get: securedOperation('Interventions', '개입 질문 목록 조회'),
    },
    '/api/v1/interventions/risk-score': {
      post: securedJsonOperation('Interventions', '소비 위험도 계산', calculateRiskScoreDto),
    },
    '/api/v1/product-url/parse': {
      post: securedJsonOperation('ProductUrl', '상품 URL 파싱', parseProductUrlDto),
    },
    '/api/v1/reports/consumption/summary': {
      get: securedOperation('Reports', '간단 소비 분석 리포트 조회'),
    },
    '/api/v1/reports/consumption/detail': {
      get: securedOperation('Reports', '상세 소비 분석 리포트 조회'),
    },
    '/api/v1/notifications': {
      get: securedOperation('Notifications', '알림 목록 조회'),
    },
    '/api/v1/notifications/read-all': {
      patch: securedOperation('Notifications', '알림 전체 읽음 처리'),
    },
    '/api/v1/notifications/{notificationId}/read': {
      patch: withZodDto(securedOperation('Notifications', '알림 읽음 처리'), notificationIdDto),
    },
    '/api/v1/wishlist-items': {
      get: securedOperation('WishlistItems', '위시리스트 목록 조회'),
      post: securedJsonOperation('WishlistItems', '위시리스트 추가', createWishlistItemDto),
    },
    '/api/v1/wishlist-items/{wishlistId}': {
      get: withZodDto(securedOperation('WishlistItems', '위시리스트 상세 조회'), wishlistItemIdDto),
      patch: securedJsonOperation('WishlistItems', '위시리스트 수정', updateWishlistItemDto),
      delete: withZodDto(securedOperation('WishlistItems', '위시리스트 삭제'), wishlistItemIdDto),
    },
    '/api/v1/temptations/{temptationId}/decisions': {
      get: withZodDto(securedOperation('Temptations', '재판단 기록 조회'), temptationIdDto),
      post: securedJsonOperation('Temptations', '재판단 기록 추가', createWishlistDecisionDto),
    },
  },
};

function publicOperation(tag, summary) {
  return {
    tags: [tag],
    summary,
    security: [],
    responses: {
      501: { $ref: '#/components/responses/NotImplemented' },
    },
  };
}

function securedOperation(tag, summary) {
  return {
    tags: [tag],
    summary,
    security: [{ bearerAuth: [] }],
    responses: {
      401: { $ref: '#/components/responses/Unauthorized' },
      501: { $ref: '#/components/responses/NotImplemented' },
    },
  };
}

function publicJsonOperation(tag, summary, dto) {
  return withZodDto(publicOperation(tag, summary), dto);
}

function securedJsonOperation(tag, summary, dto) {
  return withZodDto(securedOperation(tag, summary), dto);
}
