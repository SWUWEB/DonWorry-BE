import {
  checkEmailDto,
  checkLoginIdDto,
  emailVerificationConfirmDto,
  emailVerificationRequestDto,
  kakaoLinkEmailConfirmDto,
  kakaoLinkEmailRequestDto,
  kakaoLinkPasswordDto,
  kakaoLoginDto,
  loginDto,
  logoutDto,
  passwordResetConfirmDto,
  passwordResetRequestDto,
  refreshTokenDto,
  signupDto,
} from '../features/auth/auth.dto.js';
import {
  consumptionRecordIdDto,
  createConsumptionRecordDto,
  listConsumptionRecordsDto,
  updateConsumptionRecordDto,
} from '../features/consumption-records/consumption-records.dto.js';
import {
  calculateRiskScoreDto,
  listInterventionQuestionsDto,
} from '../features/interventions/interventions.dto.js';
import {
  notificationIdDto,
  listNotificationsDto,
} from '../features/notifications/notifications.dto.js';
import { upsertOnboardingDto } from '../features/onboarding/onboarding.dto.js';
import { parseProductUrlDto } from '../features/product-url/product-url.dto.js';
import { createWishlistDecisionDto } from '../features/temptations/temptations.dto.js';
import {
  changePasswordDto,
  notificationSettingsDto,
  savingGoalDto,
  updateMeDto,
  deleteUserDto,
  getBudgetDto,
  setBudgetDto,
} from '../features/users/users.dto.js';
import {
  createWishlistItemDto,
  updateWishlistItemDto,
  wishlistItemIdDto,
} from '../features/wishlist-items/wishlist-items.dto.js';
import { consumptionReportDetailDto } from '../features/reports/reports.dto.js';
import { withZodDto, zodToOpenApiSchema } from './zod-openapi.js';

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'DonWorry API',
    version: '0.1.0',
    description: 'DonWorry backend API documentation',
  },
  servers: [
    {
      url: '/',
      description: 'Current server',
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
      KakaoLinkRequiredResponse: {
        type: 'object',
        required: ['success', 'code', 'message', 'data'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          code: { type: 'string', enum: ['AUTH4093'] },
          message: {
            type: 'string',
            example: '동일한 이메일로 가입된 계정의 본인 확인이 필요합니다.',
          },
          data: {
            type: 'object',
            required: ['linkingToken', 'verificationMethods', 'expiresInSeconds'],
            properties: {
              linkingToken: {
                type: 'string',
                description: '기존 LOCAL 계정의 본인 확인에 사용하는 일회용 토큰',
              },
              verificationMethods: {
                type: 'array',
                items: { type: 'string', enum: ['PASSWORD', 'EMAIL'] },
                example: ['PASSWORD', 'EMAIL'],
              },
              expiresInSeconds: { type: 'integer', minimum: 1, example: 600 },
            },
          },
        },
      },
      KakaoAccountConflictResponse: {
        type: 'object',
        required: ['success', 'code', 'message'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          code: { type: 'string', enum: ['AUTH4094'] },
          message: {
            type: 'string',
            example: '이미 다른 계정에 연결된 카카오 계정입니다.',
          },
        },
      },
      KakaoLinkTokenErrorResponse: {
        type: 'object',
        required: ['success', 'code', 'message'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          code: { type: 'string', enum: ['AUTH4014'] },
          message: {
            type: 'string',
            example: '계정 연결 정보가 만료되었거나 올바르지 않습니다.',
          },
        },
      },
      KakaoLinkVerificationErrorResponse: {
        type: 'object',
        required: ['success', 'code', 'message'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          code: { type: 'string', enum: ['AUTH4013'] },
          message: {
            type: 'string',
            example: '계정 연결을 위한 본인 확인에 실패했습니다.',
          },
        },
      },
      KakaoLinkEmailVerificationResponse: {
        type: 'object',
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          message: {
            type: 'string',
            example: '계정 연결 이메일 인증 요청이 완료되었습니다.',
          },
          data: {
            type: 'object',
            required: ['email', 'codeTtlSeconds', 'resendCooldownSeconds'],
            properties: {
              email: { type: 'string', format: 'email', example: 'user@example.com' },
              codeTtlSeconds: { type: 'integer', minimum: 1, example: 600 },
              resendCooldownSeconds: { type: 'integer', minimum: 1, example: 60 },
              debugCode: {
                type: 'string',
                pattern: '^\\d{6}$',
                example: '123456',
                description: 'Non-production environments only.',
              },
            },
          },
        },
      },
      UnauthorizedResponse: {
        type: 'object',
        required: ['success', 'message'],
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Authentication required' },
        },
      },
      RateLimitErrorResponse: {
        type: 'object',
        required: ['success', 'code', 'message', 'retryAfterSeconds', 'retryAt', 'rateLimitType'],
        properties: {
          success: { type: 'boolean', example: false },
          code: { type: 'string', example: 'AUTH4291' },
          message: {
            type: 'string',
            example: '이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          },
          retryAfterSeconds: {
            type: 'integer',
            minimum: 1,
            example: 42,
            description: '요청 시점을 기준으로 다시 시도할 수 있을 때까지 남은 초',
          },
          retryAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-07-09T12:34:56.000Z',
            description: '다시 시도할 수 있는 UTC 시각',
          },
          rateLimitType: {
            type: 'string',
            enum: ['RESEND_COOLDOWN', 'SEND_LIMIT', 'CONFIRM_LOCK', 'KAKAO_LINK_PASSWORD_LOCK'],
            example: 'RESEND_COOLDOWN',
            description: '적용된 이메일 인증 제한 종류',
          },
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
      PasswordResetRequestResponse: {
        type: 'object',
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          message: {
            type: 'string',
            example: '입력한 이메일로 계정 복구 안내를 전송했습니다.',
          },
          data: {
            type: 'object',
            required: ['codeTtlSeconds', 'resendCooldownSeconds'],
            properties: {
              codeTtlSeconds: { type: 'integer', minimum: 1, example: 600 },
              resendCooldownSeconds: { type: 'integer', minimum: 1, example: 60 },
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
      GetMeResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '회원 정보 조회 성공' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1' },
              nickname: { type: 'string', example: '홍길동' },
              profileImageUrl: {
                type: 'string',
                nullable: true,
                example: 'https://image.com/profile.png',
              },
              savingGoalText: {
                type: 'string',
                nullable: true,
                example: '목돈 마련',
              },
              interestTagsJson: {
                type: 'array',
                items: { type: 'string' },
                nullable: true,
                example: ['쇼핑', '카페'],
              },
              phoneNumber: { type: 'string', nullable: true, example: '010-1234-5678' },
              birthDate: { type: 'string', format: 'date', nullable: true, example: '1998-05-02' },
              gender: {
                type: 'string',
                enum: ['FEMALE', 'MALE'],
                nullable: true,
                example: 'FEMALE',
              },
            },
          },
        },
      },
      UpdateMeResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '회원 정보 수정 성공' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1' },
              nickname: { type: 'string', example: '홍길동' },
              profileImageUrl: {
                type: 'string',
                nullable: true,
                example: 'https://image.com/profile.png',
              },
              savingGoalText: {
                type: 'string',
                nullable: true,
                example: '여행',
              },
              interestTagsJson: {
                type: 'array',
                items: { type: 'string' },
                nullable: true,
                example: ['패션', '뷰티'],
              },
              phoneNumber: { type: 'string', nullable: true, example: '010-1234-5678' },
              birthDate: { type: 'string', format: 'date', nullable: true, example: '1998-05-02' },
              gender: {
                type: 'string',
                enum: ['FEMALE', 'MALE'],
                nullable: true,
                example: 'FEMALE',
              },
            },
          },
        },
      },
      UpdateSavingGoalResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '절약 목적 수정 성공' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1' },
              savingGoalText: { type: 'string', example: '목돈 마련' },
              targetSavingAmount: { type: 'string', example: '1000000' },
              savingGoalIsActive: { type: 'boolean', example: true },
            },
          },
        },
      },
      DeleteSavingGoalResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '절약 목적 삭제 성공' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1' },
              savingGoalIsActive: { type: 'boolean', example: false },
            },
          },
        },
      },
      GetOnboardingResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '온보딩 정보 조회 성공' },
          data: {
            type: 'object',
            properties: {
              interestTags: {
                type: 'array',
                nullable: true,
                items: { type: 'string' },
                example: ['식비', '쇼핑'],
              },
              savingGoalText: { type: 'string', nullable: true, example: '여행' },
              targetSavingAmount: { type: 'string', nullable: true, example: '500000' },
            },
          },
        },
      },
      UpdateOnboardingResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '온보딩 정보 저장 성공' },
          data: {
            type: 'object',
            properties: {
              interestTags: {
                type: 'array',
                items: { type: 'string' },
                example: ['식비', '쇼핑'],
              },
              savingGoalText: { type: 'string', example: '여행' },
              targetSavingAmount: { type: 'string', example: '500000' },
            },
          },
        },
      },
      UpdateNotificationSettingsResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '알림 설정 수정 성공' },
          data: {
            type: 'object',
            properties: {
              notifyGeneralEnabled: { type: 'boolean', example: true },
              notifyGoalEnabled: { type: 'boolean', example: true },
              notifyTemptationEnabled: { type: 'boolean', example: true },
              notifyPushEnabled: { type: 'boolean', example: true },
            },
          },
        },
      },
      NotificationResult: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '1' },
          notificationType: {
            type: 'string',
            enum: ['TEMPTATION', 'GOAL', 'GENERAL'],
            example: 'TEMPTATION',
          },
          isRead: { type: 'boolean', example: false },
          readAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          wishlistItemId: { type: 'string', nullable: true, example: '3' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-07-30T09:00:00.000Z' },
        },
      },
      ListNotificationsResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '알림 목록 조회 성공' },
          data: { type: 'array', items: { $ref: '#/components/schemas/NotificationResult' } },
        },
      },
      MarkNotificationReadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '알림 읽음 처리 성공' },
          data: { nullable: true, example: null },
        },
      },
      MarkAllNotificationsReadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '알림 전체 읽음 처리 성공' },
          data: { nullable: true, example: null },
        },
      },
      DeleteNotificationResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '알림 삭제 성공' },
          data: { nullable: true, example: null },
        },
      },
      ConsumptionReportDetailResponse: {
        type: 'object',
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          message: { type: 'string', example: '상세 소비 분석 리포트 조회에 성공했습니다.' },
          data: {
            type: 'object',
            required: [
              'reportMonth',
              'totalConsumption',
              'savingStatus',
              'goalAchievement',
              'insights',
              'categoryDefenseSummary',
            ],
            properties: {
              reportMonth: { type: 'string', example: '2026-05' },
              totalConsumption: {
                type: 'object',
                required: ['totalAmount', 'categories'],
                properties: {
                  totalAmount: { type: 'number', minimum: 0, example: 750000 },
                  categories: {
                    type: 'array',
                    description: '소비 금액이 큰 상위 4개 카테고리 + 그 외(합산) 목록',
                    items: {
                      type: 'object',
                      required: ['categoryCode', 'categoryLabel', 'amount', 'ratio'],
                      properties: {
                        categoryCode: { type: 'string', example: 'FOOD_SNACK' },
                        categoryLabel: { type: 'string', example: '음식' },
                        amount: { type: 'number', minimum: 0, example: 200000 },
                        ratio: { type: 'integer', minimum: 0, maximum: 100, example: 33 },
                      },
                    },
                  },
                },
              },
              savingStatus: {
                type: 'object',
                required: ['totalAttemptCount', 'skipped', 'consumed'],
                properties: {
                  totalAttemptCount: { type: 'integer', minimum: 0, example: 24 },
                  skipped: {
                    type: 'object',
                    required: ['amount', 'count'],
                    properties: {
                      amount: { type: 'number', minimum: 0, example: 345000 },
                      count: { type: 'integer', minimum: 0, example: 18 },
                    },
                  },
                  consumed: {
                    type: 'object',
                    required: ['amount', 'count'],
                    properties: {
                      amount: { type: 'number', minimum: 0, example: 120000 },
                      count: { type: 'integer', minimum: 0, example: 6 },
                    },
                  },
                },
              },
              goalAchievement: {
                type: 'object',
                required: ['status', 'achievementRate', 'savedAmount'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['NOT_SET', 'IN_PROGRESS', 'ACHIEVED'],
                    example: 'IN_PROGRESS',
                  },
                  achievementRate: { type: 'integer', minimum: 0, example: 69 },
                  targetAmount: { type: 'number', nullable: true, minimum: 0, example: 500000 },
                  savedAmount: { type: 'number', minimum: 0, example: 345000 },
                  remainingAmount: { type: 'number', nullable: true, minimum: 0, example: 155000 },
                },
              },
              insights: {
                type: 'object',
                required: ['hasEnoughData', 'insights'],
                properties: {
                  hasEnoughData: {
                    type: 'boolean',
                    description:
                      '실제 소비 기록이 3건 이상인지 여부 (false일 경우 인사이트 미제공)',
                    example: true,
                  },
                  insights: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['VULNERABLE_TIME', 'INFLOW_CHANNEL'] },
                        weekdayLabel: { type: 'string', example: '금' },
                        hour: { type: 'integer', nullable: true, example: 23 },
                        amount: { type: 'number', nullable: true, example: 300000 },
                        ratio: { type: 'integer', nullable: true, example: 40 },
                        channel: { type: 'string', nullable: true, example: 'instagram.com' },
                        count: { type: 'integer', nullable: true, example: 5 },
                      },
                    },
                  },
                },
              },
              categoryDefenseSummary: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'categoryCode',
                    'categoryLabel',
                    'skippedAmount',
                    'consumedAmount',
                    'defenseRate',
                  ],
                  properties: {
                    categoryCode: { type: 'string', example: 'FOOD_SNACK' },
                    categoryLabel: { type: 'string', example: '음식' },
                    skippedAmount: { type: 'number', minimum: 0, example: 102000 },
                    consumedAmount: { type: 'number', minimum: 0, example: 18000 },
                    defenseRate: { type: 'integer', minimum: 0, maximum: 100, example: 85 },
                  },
                },
              },
            },
          },
        },
      },
      MonthlyBudgetResult: {
        type: 'object',
        properties: {
          yearMonth: {
            type: 'string',
            example: '2026-08',
            description: 'YYYY-MM',
          },
          monthlyIncome: {
            type: 'string',
            nullable: true,
            example: '1000000',
            description: '월 수입',
          },
          monthlyBudget: { type: 'string', example: '500000', description: '월 예산' },
        },
      },
      GetMonthlyBudgetResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '월별 수입/예산 조회 성공' },
          data: {
            oneOf: [{ type: 'null' }, { $ref: '#/components/schemas/MonthlyBudgetResult' }],
          },
        },
      },
      UpsertMonthlyBudgetResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '월별 수입/예산이 설정되었습니다.' },
          data: { $ref: '#/components/schemas/MonthlyBudgetResult' },
        },
      },
      HomeSummaryResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '홈 요약 조회 성공' },
          data: {
            type: 'object',
            properties: {
              goalAchievement: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['NOT_SET', 'IN_PROGRESS', 'ACHIEVED'] },
                  rate: { type: 'integer', example: 70 },
                  remainingAmount: { type: 'number', nullable: true, example: 150000 },
                  message: { type: 'string', example: '이번 달 목표 70% 달성했어요 🎯' },
                },
              },
              consumptionChart: {
                type: 'object',
                properties: {
                  hasData: { type: 'boolean' },
                  categories: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        categoryCode: { type: 'string', example: 'FOOD_SNACK' },
                        categoryLabel: { type: 'string', example: '음식' },
                        amount: { type: 'number', example: 200000 },
                        ratio: { type: 'integer', example: 33 },
                      },
                    },
                  },
                  others: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      amount: { type: 'number', example: 50000 },
                      ratio: { type: 'integer', example: 9 },
                    },
                  },
                  summaryText: {
                    type: 'string',
                    example: '이번 달에는 음식 소비가 전체 지출의 33%를 차지했어요.',
                  },
                },
              },
              thisMonthSpending: {
                type: 'object',
                properties: {
                  amount: { type: 'number', example: 350000 },
                  comparisonRate: { type: 'integer', nullable: true, example: 12 },
                  comparisonMessage: { type: 'string', nullable: true, example: '지난달보다 +12%' },
                },
              },
              remainingBudget: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['NOT_SET', 'WITHIN', 'EXCEEDED'] },
                  amount: { type: 'number', nullable: true, example: 150000 },
                  message: { type: 'string', example: '목표까지 남았어요' },
                },
              },
            },
          },
        },
      },
      DailyQuestionResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '오늘의 소비 질문 조회 성공' },
          data: {
            type: 'object',
            properties: {
              questionText: { type: 'string', example: '오늘 계획하지 않은 소비가 있었나요?' },
              date: { type: 'string', format: 'date', example: '2026-07-30' },
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
          price: { type: 'number', nullable: true, example: 12000 },
          categoryCode: { type: 'string', example: 'CAFE_DESSERT' },
          categoryLabel: { type: 'string', example: '카페/디저트' },
          reason: {
            type: 'string',
            nullable: true,
            example: '친구와 시간을 보내고 싶어서',
          },
          occurredAt: { type: 'string', format: 'date-time', example: '2026-07-02T14:52:20.000Z' },
        },
      },
      ConsumptionRecordCreatedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '소비 기록 생성에 성공했습니다.' },
          data: { $ref: '#/components/schemas/ConsumptionRecordResult' },
        },
      },
      ConsumptionRecordResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'OK' },
          data: { $ref: '#/components/schemas/ConsumptionRecordResult' },
        },
      },
      ConsumptionRecordDetailResult: {
        allOf: [
          { $ref: '#/components/schemas/ConsumptionRecordResult' },
          {
            type: 'object',
            properties: {
              recentCategoryConsumptionCount: {
                type: 'integer',
                minimum: 0,
                example: 3,
                description: '최근 28일간 동일 카테고리의 실제 소비 횟수',
              },
              recentCategoryConsumptions: {
                type: 'array',
                description: '최근 28일간 동일 카테고리의 실제 소비 내역',
                items: { $ref: '#/components/schemas/ConsumptionRecordResult' },
              },
            },
          },
        ],
      },
      ConsumptionRecordDetailResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'OK' },
          data: { $ref: '#/components/schemas/ConsumptionRecordDetailResult' },
        },
      },
      ConsumptionRecordListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'OK' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ConsumptionRecordResult' },
          },
        },
      },
      ConsumptionRatioResponse: {
        type: 'object',
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          message: { type: 'string', example: '최근 소비 비율 조회에 성공했습니다.' },
          data: {
            type: 'object',
            required: [
              'period',
              'totalAmount',
              'skippedAmount',
              'consumedAmount',
              'skippedRatio',
              'consumedRatio',
            ],
            properties: {
              period: {
                type: 'object',
                required: ['startDate', 'endDate', 'days'],
                properties: {
                  startDate: { type: 'string', format: 'date', example: '2026-03-21' },
                  endDate: { type: 'string', format: 'date', example: '2026-04-17' },
                  days: { type: 'integer', enum: [28] },
                },
              },
              totalAmount: { type: 'number', minimum: 0, example: 148500 },
              skippedAmount: { type: 'number', minimum: 0, example: 96500 },
              consumedAmount: { type: 'number', minimum: 0, example: 52000 },
              skippedRatio: { type: 'integer', minimum: 0, maximum: 100, example: 65 },
              consumedRatio: { type: 'integer', minimum: 0, maximum: 100, example: 35 },
            },
          },
        },
      },
      InterventionQuestionsResponse: {
        type: 'object',
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          message: { type: 'string', example: '개입 질문 목록 조회에 성공했습니다.' },
          data: {
            type: 'object',
            required: ['questions', 'recentCategoryConsumption'],
            properties: {
              questions: {
                type: 'array',
                minItems: 3,
                maxItems: 3,
                items: {
                  type: 'object',
                  required: ['questionId', 'questionText', 'description', 'sortOrder', 'options'],
                  properties: {
                    questionId: { type: 'string', example: '1' },
                    questionText: { type: 'string' },
                    description: { type: 'string' },
                    sortOrder: { type: 'integer', minimum: 1, maximum: 3 },
                    options: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['answerValue', 'label'],
                        properties: {
                          answerValue: { type: 'boolean' },
                          label: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
              recentCategoryConsumption: {
                type: 'object',
                required: ['categoryCode', 'totalCount', 'records'],
                properties: {
                  categoryCode: { type: 'string', example: 'CAFE_DESSERT' },
                  totalCount: { type: 'integer', minimum: 0 },
                  records: {
                    type: 'array',
                    maxItems: 3,
                    items: {
                      type: 'object',
                      required: ['consumptionRecordId', 'productName', 'price', 'occurredAt'],
                      properties: {
                        consumptionRecordId: { type: 'string', example: '15' },
                        productName: { type: 'string', example: '투썸플레이스 신봉점' },
                        price: { type: 'number', example: 6100 },
                        occurredAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      RiskAnalysisResponse: {
        type: 'object',
        required: ['success', 'message', 'data'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          message: { type: 'string', example: '소비 위험도 계산에 성공했습니다.' },
          data: {
            type: 'object',
            required: ['riskScore', 'riskLevel', 'riskMessage'],
            properties: {
              riskScore: { type: 'integer', minimum: 0, maximum: 5 },
              riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
              riskMessage: { type: 'string' },
            },
          },
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
      ConsumptionRecordValidationBadRequest: {
        description: 'Invalid path or query parameter',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            example: {
              success: false,
              code: 'COMMON4001',
              message: 'Invalid request',
              errors: {
                formErrors: [],
                fieldErrors: {},
              },
            },
          },
        },
      },
      ConsumptionRecordBadRequest: {
        description: 'Invalid consumption record request',
        content: {
          'application/json': {
            schema: {
              anyOf: [
                { $ref: '#/components/schemas/ValidationErrorResponse' },
                { $ref: '#/components/schemas/ErrorResponse' },
              ],
            },
            examples: {
              invalidRequest: {
                summary: 'DTO 검증 실패',
                value: {
                  success: false,
                  code: 'COMMON4001',
                  message: 'Invalid request',
                  errors: { formErrors: [], fieldErrors: { body: ['Invalid input'] } },
                },
              },
              invalidOccurredAt: {
                summary: 'occurredAt 형식 오류',
                value: {
                  success: false,
                  code: 'CONSUMPTION_RECORD4001',
                  message: 'occurredAt은 유효한 ISO 8601 날짜/시간 문자열이어야 합니다.',
                  errors: {
                    formErrors: [],
                    fieldErrors: { body: ['occurredAt must be a non-empty ISO datetime string'] },
                  },
                },
              },
              invalidCategoryCode: {
                summary: '허용되지 않은 카테고리 코드',
                value: {
                  success: false,
                  code: 'CONSUMPTION_RECORD4002',
                  message: '허용되지 않은 카테고리 코드입니다.',
                  errors: {
                    formErrors: [],
                    fieldErrors: { body: ['Invalid category code'] },
                  },
                },
              },
              duplicateQuestionAnswer: {
                summary: '질문 답변 중복 등록',
                value: {
                  success: false,
                  code: 'CONSUMPTION_RECORD4003',
                  message: '동일한 질문에 대한 답변을 중복해서 등록할 수 없습니다.',
                  errors: {
                    formErrors: [],
                    fieldErrors: {
                      body: ['Duplicate questionId in interventionAnswers is not allowed.'],
                    },
                  },
                },
              },
            },
          },
        },
      },
      ConsumptionRecordNotFound: {
        description: 'Consumption record not found or inaccessible',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              success: false,
              code: 'CONSUMPTION_RECORD4041',
              message: '요청한 소비 기록을 찾을 수 없습니다.',
            },
          },
        },
      },
      ConsumptionRecordOrQuestionNotFound: {
        description: 'Consumption record or intervention question not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            examples: {
              recordNotFound: {
                summary: '소비 기록 없음 또는 접근 불가',
                value: {
                  success: false,
                  code: 'CONSUMPTION_RECORD4041',
                  message: '요청한 소비 기록을 찾을 수 없습니다.',
                },
              },
              questionNotFound: {
                summary: '질문 없음 또는 비활성',
                value: {
                  success: false,
                  code: 'CONSUMPTION_RECORD4042',
                  message: '요청한 질문을 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
      ConsumptionRecordInternalServerError: {
        description: 'Unexpected consumption record processing error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              success: false,
              code: 'CONSUMPTION_RECORD5001',
              message: 'Internal server error',
            },
          },
        },
      },
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UnauthorizedResponse' },
            examples: {
              missingToken: {
                summary: 'Access token missing',
                value: { success: false, message: 'Authentication required' },
              },
              invalidToken: {
                summary: 'Access token invalid or expired',
                value: { success: false, message: 'Invalid or expired token' },
              },
            },
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
      post: {
        ...securedJsonOperation('Auth', '로그아웃', logoutDto),
        description:
          '현재 refresh token family의 미사용 refresh token만 폐기합니다. 다른 기기 또는 다른 token family의 세션은 유지됩니다. Access token은 서버에서 즉시 폐기되지 않으므로 로그아웃 성공 후 클라이언트가 access token과 refresh token을 모두 삭제해야 합니다.',
        responses: {
          204: {
            description: '현재 로그인 세션 종료 완료. 응답 본문은 없습니다.',
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
            description:
              'Access token 인증 실패 또는 유효하지 않거나 다른 사용자가 소유한 refresh token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
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
            headers: {
              'Retry-After': {
                description: '요청을 다시 시도할 수 있을 때까지 남은 초',
                schema: { type: 'integer', minimum: 1, example: 42 },
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RateLimitErrorResponse' },
                examples: {
                  resendCooldown: {
                    summary: '60초 재전송 쿨다운',
                    value: {
                      success: false,
                      code: 'AUTH4291',
                      message: '이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
                      retryAfterSeconds: 42,
                      retryAt: '2026-07-09T12:34:56.000Z',
                      rateLimitType: 'RESEND_COOLDOWN',
                    },
                  },
                  sendLimit: {
                    summary: '발송 횟수 제한',
                    value: {
                      success: false,
                      code: 'AUTH4291',
                      message: '이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
                      retryAfterSeconds: 120,
                      retryAt: '2026-07-09T12:36:56.000Z',
                      rateLimitType: 'SEND_LIMIT',
                    },
                  },
                },
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
            headers: {
              'Retry-After': {
                description: '인증 확인을 다시 시도할 수 있을 때까지 남은 초',
                schema: { type: 'integer', minimum: 1, example: 300 },
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RateLimitErrorResponse' },
                example: {
                  success: false,
                  code: 'AUTH4291',
                  message: '이메일 인증 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
                  retryAfterSeconds: 300,
                  retryAt: '2026-07-09T12:39:56.000Z',
                  rateLimitType: 'CONFIRM_LOCK',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/password-reset/request': {
      post: {
        ...publicJsonOperation('Auth', '비밀번호 재설정 요청', passwordResetRequestDto),
        description:
          '계정 존재 여부와 로그인 방식을 노출하지 않고 항상 동일한 성공 응답을 반환합니다. LOCAL 비밀번호 로그인이 가능한 계정에는 재설정 인증 코드를, 카카오 전용 계정에는 카카오 로그인 안내를 발송합니다.',
        responses: {
          200: {
            description: 'Password reset guidance accepted',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PasswordResetRequestResponse' },
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
          429: {
            description: 'Password reset request rate limited',
            headers: {
              'Retry-After': {
                description: '요청을 다시 시도할 수 있을 때까지 남은 초',
                schema: { type: 'integer', minimum: 1, example: 42 },
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RateLimitErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/password-reset/confirm': {
      patch: publicJsonOperation('Auth', '비밀번호 재설정 완료', passwordResetConfirmDto),
    },
    '/api/v1/auth/kakao/login': {
      post: {
        ...publicJsonOperation('Auth', '카카오 로그인', kakaoLoginDto),
        responses: {
          200: {
            description: 'Kakao login completed',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          400: { description: 'Required Kakao account information is missing' },
          401: { description: 'Invalid or expired Kakao authorization code' },
          409: {
            description: 'Local account verification is required or Kakao account conflict',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/KakaoLinkRequiredResponse' },
                    { $ref: '#/components/schemas/KakaoAccountConflictResponse' },
                  ],
                },
              },
            },
          },
          502: { description: 'Kakao API communication failed' },
        },
      },
    },
    '/api/v1/auth/kakao/link': {
      post: {
        ...publicJsonOperation('Auth', 'LOCAL 비밀번호로 카카오 계정 연결', kakaoLinkPasswordDto),
        responses: {
          200: {
            description: 'Kakao account linked',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          401: {
            description: 'Invalid linking token or account verification failed',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/KakaoLinkTokenErrorResponse' },
                    { $ref: '#/components/schemas/KakaoLinkVerificationErrorResponse' },
                  ],
                },
              },
            },
          },
          409: { description: 'Kakao account conflict' },
          429: {
            description: 'Too many attempts',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RateLimitErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/kakao/link/email-verifications': {
      post: {
        ...publicJsonOperation(
          'Auth',
          '카카오 계정 연결 이메일 인증 요청',
          kakaoLinkEmailRequestDto,
        ),
        responses: {
          200: {
            description: 'Kakao account linking email verification code sent',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/KakaoLinkEmailVerificationResponse',
                },
              },
            },
          },
          401: {
            description: 'Invalid linking token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/KakaoLinkTokenErrorResponse' },
              },
            },
          },
          429: {
            description: 'Email verification request rate limited',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RateLimitErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/kakao/link/email-verifications/confirm': {
      post: {
        ...publicJsonOperation(
          'Auth',
          '이메일 인증으로 카카오 계정 연결',
          kakaoLinkEmailConfirmDto,
        ),
        responses: {
          200: {
            description: 'Kakao account linked',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          400: { description: 'Invalid email verification code' },
          401: {
            description: 'Invalid linking token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/KakaoLinkTokenErrorResponse' },
              },
            },
          },
          409: { description: 'Kakao account conflict' },
          429: {
            description: 'Too many attempts',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RateLimitErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/users/me': {
      get: {
        ...securedOperation('Users', '내 정보 조회'),
        responses: {
          200: {
            description: '회원 정보 조회 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GetMeResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
      patch: {
        ...securedJsonOperation('Users', '내 정보 수정', updateMeDto),
        responses: {
          200: {
            description: '회원 정보 수정 성공',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UpdateMeResponse',
                },
              },
            },
          },
          400: {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
      delete: {
        ...securedJsonOperation('Users', '회원 탈퇴', deleteUserDto),
        responses: {
          200: {
            description: '회원 탈퇴 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '회원 탈퇴 성공' },
                    data: {
                      nullable: true,
                      example: null,
                    },
                  },
                },
              },
            },
          },
          400: {
            description: '비밀번호 불일치 또는 요청 값 검증 실패',
            content: {
              'application/json': {
                schema: {
                  anyOf: [
                    { $ref: '#/components/schemas/ValidationErrorResponse' },
                    { $ref: '#/components/schemas/ErrorResponse' },
                  ],
                },
                examples: {
                  invalidPassword: {
                    summary: '비밀번호 불일치',
                    value: {
                      success: false,
                      code: 'USER4001',
                      message: '비밀번호가 올바르지 않습니다.',
                    },
                  },
                  validationFailed: {
                    summary: '요청 값 검증 실패',
                    value: {
                      success: false,
                      code: 'COMMON4001',
                      message: 'Invalid request',
                      errors: {
                        formErrors: [],
                        fieldErrors: { body: ['비밀번호를 입력해주세요.'] },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/users/me/password': {
      patch: securedJsonOperation('Users', '비밀번호 변경', changePasswordDto),
    },
    '/api/v1/users/me/saving-goal': {
      put: {
        ...securedJsonOperation('Users', '절약 목적 설정/수정', savingGoalDto),
        responses: {
          200: {
            description: '절약 목적 수정 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateSavingGoalResponse' },
              },
            },
          },
          400: {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
      delete: {
        ...securedOperation('Users', '절약 목적 삭제/해제'),
        responses: {
          200: {
            description: '절약 목적 삭제 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteSavingGoalResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/users/me/notification-settings': {
      patch: {
        ...securedJsonOperation('Users', '알림 설정 수정', notificationSettingsDto),
        description: '전체 알림과 세부 알림은 동일한 요청에서 함께 변경할 수 없습니다.',
        responses: {
          200: {
            description: '알림 설정 수정 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateNotificationSettingsResponse' },
              },
            },
          },
          400: {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
          409: {
            description: '동시 요청 충돌 발생',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4091',
                  message: '동시 요청 충돌이 발생했습니다.',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/users/me/budget': {
      get: {
        ...withZodDto(securedOperation('Users', '월별 수입/예산 조회'), getBudgetDto),
        responses: {
          200: {
            description: '월별 수입/예산 조회 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GetMonthlyBudgetResponse' },
              },
            },
          },
          400: {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
      put: {
        ...securedJsonOperation('Users', '월별 수입/예산 설정', setBudgetDto),
        responses: {
          200: {
            description: '월별 수입/예산이 설정되었습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpsertMonthlyBudgetResponse' },
              },
            },
          },
          400: {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/onboarding': {
      get: {
        ...securedOperation('Onboarding', '온보딩 정보 조회'),
        responses: {
          200: {
            description: '온보딩 정보 조회 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GetOnboardingResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
      put: {
        ...securedJsonOperation('Onboarding', '온보딩 정보 저장/수정', upsertOnboardingDto),
        responses: {
          200: {
            description: '온보딩 정보 저장 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateOnboardingResponse' },
              },
            },
          },
          400: {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/home/summary': {
      get: {
        ...securedOperation('Home', '홈 요약 조회'),
        responses: {
          200: {
            description: '홈 요약 조회 성공',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/HomeSummaryResponse' } },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/home/cheer-message': {
      get: securedOperation('Home', '응원 메시지 조회'),
    },
    '/api/v1/home/daily-question': {
      get: {
        ...securedOperation('Home', '오늘의 소비 질문 조회'),
        responses: {
          200: {
            description: '오늘의 소비 질문 조회 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DailyQuestionResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/consumption-records': {
      get: {
        ...withZodDto(
          securedOperation('ConsumptionRecords', '소비 기록 목록 조회'),
          listConsumptionRecordsDto,
        ),
        responses: {
          200: {
            description: 'Consumption record list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConsumptionRecordListResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/ConsumptionRecordValidationBadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          500: { $ref: '#/components/responses/ConsumptionRecordInternalServerError' },
        },
      },
      post: {
        ...withZodDto(
          securedOperation('ConsumptionRecords', '소비 기록 입력'),
          createConsumptionRecordDto,
        ),
        requestBody: {
          required: true,
          description: 'occurredAt을 생략하면 서버의 현재 시각을 소비 발생 시각으로 저장합니다.',
          content: {
            'application/json': {
              schema: zodToOpenApiSchema(createConsumptionRecordDto.shape.body),
              example: {
                type: 'CONSUMED',
                productName: '아이스 아메리카노',
                price: 4500,
                productUrl: 'https://example.com/products/americano',
                reason: '친구와 시간을 보내고 싶어서',
                riskScore: 30,
                workHoursNeeded: 0.5,
                category_code: 'CAFE_DESSERT',
                interventionAnswers: [
                  {
                    questionId: 1,
                    answerValue: true,
                  },
                ],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Consumption record created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConsumptionRecordCreatedResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/ConsumptionRecordBadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: 'Not Found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'CONSUMPTION_RECORD4042',
                  message: '요청한 질문을 찾을 수 없습니다.',
                },
              },
            },
          },
          500: {
            description: 'Internal Server Error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'CONSUMPTION_RECORD5001',
                  message: 'Internal server error',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/consumption-records/{consumptionRecordId}': {
      get: {
        ...withZodDto(
          securedOperation('ConsumptionRecords', '소비 기록 상세'),
          consumptionRecordIdDto,
        ),
        responses: {
          200: {
            description: 'Consumption record detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConsumptionRecordDetailResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/ConsumptionRecordValidationBadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/ConsumptionRecordNotFound' },
          500: { $ref: '#/components/responses/ConsumptionRecordInternalServerError' },
        },
      },
      put: {
        ...securedJsonOperation('ConsumptionRecords', '소비 기록 수정', updateConsumptionRecordDto),
        responses: {
          200: {
            description: 'Consumption record updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConsumptionRecordResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/ConsumptionRecordBadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/ConsumptionRecordOrQuestionNotFound' },
          500: { $ref: '#/components/responses/ConsumptionRecordInternalServerError' },
        },
      },
      delete: {
        ...withZodDto(
          securedOperation('ConsumptionRecords', '소비 기록 삭제'),
          consumptionRecordIdDto,
        ),
        responses: {
          200: {
            description: 'Consumption record deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'OK' },
                    data: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ConsumptionRecordValidationBadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/ConsumptionRecordNotFound' },
          500: { $ref: '#/components/responses/ConsumptionRecordInternalServerError' },
        },
      },
    },
    '/api/v1/consumption-records/ratio': {
      get: {
        ...securedOperation('ConsumptionRecords', '최근 28일 소비 비율 조회'),
        description:
          '로그인 사용자의 KST 기준 오늘 포함 최근 28일 SKIPPED/CONSUMED 금액 합계와 비율을 조회합니다.',
        responses: {
          200: {
            description: '최근 소비 비율 조회 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConsumptionRatioResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          500: { $ref: '#/components/responses/ConsumptionRecordInternalServerError' },
        },
      },
    },
    '/api/v1/intervention-questions': {
      get: {
        ...withZodDto(
          securedOperation('Interventions', '개입 질문 목록 및 최근 동일 카테고리 소비 조회'),
          listInterventionQuestionsDto,
        ),
        responses: {
          200: {
            description: '개입 질문 목록 조회 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/InterventionQuestionsResponse' },
              },
            },
          },
          400: {
            description: 'Query 검증 실패 또는 허용되지 않은 category_code',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '활성 Q1~Q3를 찾을 수 없음 (INTERVENTION4041)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          500: {
            description: '질문 또는 최근 소비 기록 조회 실패 (INTERVENTION5001)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/interventions/risk-score': {
      post: {
        ...securedJsonOperation(
          'Interventions',
          '개입 질문 답변 기반 소비 위험도 계산',
          calculateRiskScoreDto,
        ),
        description:
          'Q1~Q3 답변을 모두 전달해야 하며 중복 questionId, 누락 질문, 존재하지 않거나 비활성인 질문을 검증합니다. 소비 기록은 생성하거나 수정하지 않습니다.',
        responses: {
          200: {
            description: '소비 위험도 계산 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RiskAnalysisResponse' },
              },
            },
          },
          400: {
            description:
              'DTO 검증 실패(COMMON4001), 중복 질문(CONSUMPTION_RECORD4003), 필수 질문 누락(RISK4001)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '질문이 존재하지 않거나 비활성 상태(CONSUMPTION_RECORD4042)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          500: {
            description: '위험도 계산 실패(RISK5001)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/product-url/parse': {
      post: {
        ...securedJsonOperation('ProductUrl', '상품 URL 파싱', parseProductUrlDto),
        responses: {
          200: {
            description: '상품 URL 파싱 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'message', 'data'],
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'url 파싱에 성공했습니다.' },
                    data: {
                      type: 'object',
                      required: ['productName', 'price', 'occurredAt'],
                      properties: {
                        productName: { type: 'string', example: '투썸플레이스 신봉점' },
                        price: { type: 'number', example: 6100 },
                        occurredAt: {
                          type: 'string',
                          format: 'date-time',
                          example: '2026-05-17T12:00:00.000Z',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: '잘못된 URL 또는 접근할 수 없는 내부 주소',
            content: {
              'application/json': {
                schema: {
                  anyOf: [
                    { $ref: '#/components/schemas/ValidationErrorResponse' },
                    { $ref: '#/components/schemas/ErrorResponse' },
                  ],
                },
                examples: {
                  invalidRequest: {
                    summary: 'URL 형식 오류',
                    value: {
                      success: false,
                      code: 'COMMON4001',
                      message: 'Invalid request',
                    },
                  },
                },
              },
            },
          },
          422: {
            description: '상품 정보 파싱 실패',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'PRODUCT_URL4221',
                  message: '상품 정보를 파싱하지 못했습니다.',
                },
              },
            },
          },
          502: {
            description: '외부 상품 페이지 요청 실패',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  upstreamFailure: {
                    summary: '외부 상품 페이지 접근 실패',
                    value: {
                      success: false,
                      code: 'PRODUCT_URL5021',
                      message: '외부 상품 페이지에 접근할 수 없습니다.',
                    },
                  },
                  responseTooLarge: {
                    summary: '외부 상품 페이지 응답 크기 초과',
                    value: {
                      success: false,
                      code: 'PRODUCT_URL5022',
                      message: '상품 페이지의 응답 크기가 너무 큽니다.',
                    },
                  },
                },
              },
            },
          },
          504: {
            description: '외부 상품 페이지 응답 시간 초과',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'PRODUCT_URL5041',
                  message: '외부 상품 페이지 응답 시간이 초과되었습니다.',
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/reports/consumption/summary': {
      get: securedOperation('Reports', '간단 소비 분석 리포트 조회'),
    },
    '/api/v1/reports/consumption/detail': {
      get: {
        ...withZodDto(
          securedOperation('Reports', '상세 소비 분석 리포트 조회'),
          consumptionReportDetailDto,
        ),
        description: '현재 및 과거 월 조회 가능 (미래 월 불가 / month 미입력 시 현재 연월)',
        responses: {
          200: {
            description: '상세 소비 분석 리포트 조회 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConsumptionReportDetailResponse' },
              },
            },
          },
          400: {
            description: '잘못된 요청',
            content: {
              'application/json': {
                schema: {
                  anyOf: [
                    { $ref: '#/components/schemas/ValidationErrorResponse' },
                    { $ref: '#/components/schemas/ErrorResponse' },
                  ],
                },
                example: {
                  success: false,
                  code: 'REPORT4001',
                  message: '미래 월은 조회할 수 없습니다.',
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '사용자를 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'USER4041',
                  message: '사용자를 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/notifications': {
      get: {
        ...withZodDto(securedOperation('Notifications', '알림 목록 조회'), listNotificationsDto),
        responses: {
          200: {
            description: '알림 목록 조회 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ListNotificationsResponse' },
              },
            },
          },
          400: {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/notifications/read-all': {
      patch: {
        ...securedOperation('Notifications', '알림 전체 읽음 처리'),
        responses: {
          200: {
            description: '알림 전체 읽음 처리 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MarkAllNotificationsReadResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/notifications/{notificationId}/read': {
      patch: {
        ...withZodDto(securedOperation('Notifications', '알림 읽음 처리'), notificationIdDto),
        responses: {
          200: {
            description: '알림 읽음 처리 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MarkNotificationReadResponse' },
              },
            },
          },
          400: {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '요청한 알림을 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'NOTIFICATION4041',
                  message: '요청한 알림을 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/notifications/{notificationId}': {
      delete: {
        ...withZodDto(securedOperation('Notifications', '알림 삭제'), notificationIdDto),
        responses: {
          200: {
            description: '알림 삭제 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteNotificationResponse' },
              },
            },
          },
          400: {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationErrorResponse',
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: {
            description: '요청한 알림을 찾을 수 없습니다.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  code: 'NOTIFICATION4041',
                  message: '요청한 알림을 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/wishlist-items': {
      get: {
        ...securedOperation('WishlistItems', '위시리스트 목록 조회'),
        responses: {
          401: { $ref: '#/components/responses/Unauthorized' },
          200: {
            description: '위시리스트 목록 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', example: '1' },
                          userId: { type: 'string', example: '1' },
                          categoryCode: { type: 'string', example: 'ELECTRONICS' },
                          productName: { type: 'string', example: '맥북 프로' },
                          productUrl: { type: 'string', example: 'https://apple.com/kr/macbook' },
                          price: { type: 'string', example: '2500000' },
                          productImageUrl: {
                            type: 'string',
                            example: 'https://images.com/macbook.png',
                          },
                          reason: {
                            type: 'string',
                            nullable: true,
                            example: '개발 작업용 스펙 업그레이드',
                          },
                          waitType: { type: 'string', example: 'ONE_WEEK' },
                          waitUntil: {
                            type: 'string',
                            format: 'date-time',
                            example: '2026-07-23T18:00:00.000Z',
                          },
                          status: { type: 'string', example: 'WAITING' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        ...securedJsonOperation('WishlistItems', '위시리스트 추가', createWishlistItemDto),
        responses: {
          401: { $ref: '#/components/responses/Unauthorized' },
          201: {
            description: '위시리스트 추가 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: '1' },
                        userId: { type: 'string', example: '1' },
                        categoryCode: { type: 'string', example: 'ELECTRONICS' },
                        productName: { type: 'string', example: '맥북 프로' },
                        productUrl: { type: 'string', example: 'https://apple.com/kr/macbook' },
                        price: { type: 'string', example: '2500000' },
                        productImageUrl: {
                          type: 'string',
                          example: 'https://images.com/macbook.png',
                        },
                        reason: {
                          type: 'string',
                          nullable: true,
                          example: '개발 작업용 스펙 업그레이드',
                        },
                        waitType: { type: 'string', example: 'ONE_WEEK' },
                        waitUntil: {
                          type: 'string',
                          format: 'date-time',
                          example: '2026-07-23T18:00:00.000Z',
                        },
                        status: { type: 'string', example: 'WAITING' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/wishlist-items/{wishlistId}': {
      get: {
        ...withZodDto(securedOperation('WishlistItems', '위시리스트 상세 조회'), wishlistItemIdDto),
        responses: {
          401: { $ref: '#/components/responses/Unauthorized' },
          200: {
            description: '위시리스트 상세 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: '1' },
                        userId: { type: 'string', example: '1' },
                        categoryCode: { type: 'string', example: 'ELECTRONICS' },
                        productName: { type: 'string', example: '맥북 프로' },
                        productUrl: { type: 'string', example: 'https://apple.com/kr/macbook' },
                        price: { type: 'string', example: '2500000' },
                        productImageUrl: {
                          type: 'string',
                          example: 'https://images.com/macbook.png',
                        },
                        reason: {
                          type: 'string',
                          nullable: true,
                          example: '개발 작업용 스펙 업그레이드',
                        },
                        waitType: { type: 'string', example: 'ONE_WEEK' },
                        waitUntil: {
                          type: 'string',
                          format: 'date-time',
                          example: '2026-07-23T18:00:00.000Z',
                        },
                        status: { type: 'string', example: 'WAITING' },
                      },
                    },
                  },
                },
              },
            },
          },
          403: {
            description: '접근 권한이 없음 (본인 소유가 아님)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4031',
                  message: '접근 권한이 없습니다.',
                },
              },
            },
          },
          404: {
            description: '존재하지 않는 항목',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4041',
                  message: '해당 위시리스트 항목을 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
      patch: {
        ...securedJsonOperation('WishlistItems', '위시리스트 수정', updateWishlistItemDto),
        responses: {
          401: { $ref: '#/components/responses/Unauthorized' },
          200: {
            description: '위시리스트 수정 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: '1' },
                        userId: { type: 'string', example: '1' },
                        categoryCode: { type: 'string', example: 'ELECTRONICS' },
                        productName: { type: 'string', example: '아이패드 프로' },
                        productUrl: { type: 'string', example: 'https://apple.com/kr/ipad' },
                        price: { type: 'string', example: '1500000' },
                        productImageUrl: { type: 'string', example: 'https://images.com/ipad.png' },
                        reason: {
                          type: 'string',
                          nullable: true,
                          example: '필기 및 드로잉용',
                        },
                        waitType: { type: 'string', example: 'ONE_DAY' },
                        waitUntil: {
                          type: 'string',
                          format: 'date-time',
                          example: '2026-07-17T18:00:00.000Z',
                        },
                        status: { type: 'string', example: 'WAITING' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: '수정할 데이터가 주어지지 않음 (빈 body)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4001',
                  message: '수정할 값이 없습니다.',
                },
              },
            },
          },
          403: {
            description: '접근 권한이 없음 (본인 소유가 아님)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4031',
                  message: '접근 권한이 없습니다.',
                },
              },
            },
          },
          404: {
            description: '존재하지 않는 항목',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4041',
                  message: '해당 위시리스트 항목을 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
      delete: {
        ...withZodDto(securedOperation('WishlistItems', '위시리스트 삭제'), wishlistItemIdDto),
        responses: {
          401: { $ref: '#/components/responses/Unauthorized' },
          200: {
            description: '위시리스트 삭제 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '삭제 성공' },
                  },
                },
              },
            },
          },
          403: {
            description: '접근 권한이 없음 (본인 소유가 아님)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4031',
                  message: '접근 권한이 없습니다.',
                },
              },
            },
          },
          404: {
            description: '존재하지 않는 항목',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4041',
                  message: '해당 위시리스트 항목을 찾을 수 없습니다.',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/temptations/{temptationId}/decisions': {
      post: {
        ...securedJsonOperation('Temptations', '재판단 기록 추가', createWishlistDecisionDto),
        responses: {
          201: {
            description: '재판단 기록 추가 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: '6' },
                        wishlistItemId: { type: 'string', example: '2' },
                        decisionType: { type: 'string', example: 'DELAY' },
                        selectedWaitType: { type: 'string', example: 'ONE_DAY' },
                        selectedWaitUntil: {
                          type: 'string',
                          format: 'date-time',
                          example: '2026-08-01T14:37:35.850Z',
                        },
                        decidedAt: {
                          type: 'string',
                          format: 'date-time',
                          example: '2026-07-31T14:37:35.857Z',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: '유효하지 않은 요청 데이터',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                examples: {
                  MISSING_WAIT_TYPE: {
                    summary: '고민 연장 시 대기 시간 미선택 (WISH4002)',
                    value: {
                      success: false,
                      code: 'WISH4002',
                      message: '고민 시간 연장 시 추가 대기 시간 선택은 필수입니다.',
                    },
                  },
                  NOT_YET_REDECISION_TIME: {
                    summary: '아직 재판단 시간이 지나지 않음 (WISH4003)',
                    value: {
                      success: false,
                      code: 'WISH4003',
                      message: '아직 고민 시간이 끝나지 않아 추가 연장을 할 수 없습니다.',
                    },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: {
            description: '접근 권한 없음 (타인의 항목)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4031',
                  message: '접근 권한이 없습니다.',
                },
              },
            },
          },
          404: {
            description: '존재하지 않는 항목',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4041',
                  message: '해당 위시리스트 항목을 찾을 수 없습니다.',
                },
              },
            },
          },
          409: {
            description: '이미 처리가 완료되었거나 대기 상태가 아닌 항목',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  success: false,
                  code: 'WISH4091',
                  message: '이미 재판단이 완료되었거나 대기 상태가 아닌 항목입니다.',
                },
              },
            },
          },
        },
      },
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
