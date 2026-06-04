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
      NotImplementedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'auth API is not implemented yet' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', format: 'password', example: 'password123' },
        },
      },
      SignupRequest: {
        type: 'object',
        required: [
          'name',
          'loginId',
          'email',
          'emailVerificationToken',
          'password',
          'passwordConfirm',
          'phoneNumber',
        ],
        properties: {
          name: { type: 'string', example: '홍길동' },
          loginId: { type: 'string', example: 'gachi123' },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          emailVerificationToken: {
            type: 'string',
            example: 'email-verification-token',
          },
          password: { type: 'string', format: 'password', example: 'Password123!' },
          passwordConfirm: { type: 'string', format: 'password', example: 'Password123!' },
          phoneNumber: { type: 'string', example: '010-0000-0000' },
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
              userId: { type: 'integer', example: 1 },
              loginId: { type: 'string', example: 'gachi123' },
              name: { type: 'string', example: '홍길동' },
              email: { type: 'string', format: 'email', example: 'user@example.com' },
              phoneNumber: { type: 'string', example: '010-0000-0000' },
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
      ConsumptionRecordRequest: {
        type: 'object',
        required: ['type', 'productName', 'price', 'occurredAt'],
        properties: {
          type: { type: 'string', enum: ['CONSUMED', 'SKIPPED'], example: 'SKIPPED' },
          productName: { type: 'string', example: '무선 키보드' },
          price: { type: 'number', example: 69000 },
          productUrl: { type: 'string', format: 'uri', example: 'https://example.com/products/1' },
          reason: { type: 'string', example: '작업 환경 개선' },
          occurredAt: { type: 'string', format: 'date-time', example: '2026-06-03T12:00:00.000Z' },
          interventionAnswers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                questionId: { type: 'integer', example: 1 },
                answerValue: { type: 'boolean', example: true },
              },
            },
          },
        },
      },
      WishlistItemRequest: {
        type: 'object',
        required: ['productName'],
        properties: {
          productName: { type: 'string', example: '운동화' },
          productUrl: { type: 'string', format: 'uri', example: 'https://example.com/products/2' },
          price: { type: 'integer', example: 129000 },
          productImageUrl: {
            type: 'string',
            format: 'uri',
            example: 'https://example.com/image.jpg',
          },
          waitType: { type: 'string', enum: ['1H', '1D', '3D', '1W'], example: '1D' },
        },
      },
      WishlistDecisionRequest: {
        type: 'object',
        required: ['decisionType'],
        properties: {
          decisionType: { type: 'string', enum: ['BUY', 'SKIP', 'DELAY'], example: 'DELAY' },
          reasonAlternative: { type: 'boolean', example: true },
          reasonNeed: { type: 'boolean', example: false },
          reasonRecentBuy: { type: 'boolean', example: false },
          reasonType: {
            type: 'string',
            enum: [
              'NECESSARY',
              'HAS_ALTERNATIVE',
              'LOW_NECESSITY',
              'RECENT_SIMILAR_PURCHASE',
              'PRICE_BURDEN',
              'NEED_MORE_TIME',
              'OTHER',
            ],
            example: 'NEED_MORE_TIME',
          },
          reasonDetail: { type: 'string', example: '하루 더 고민해보기' },
          selectedWaitType: { type: 'string', enum: ['1H', '1D', '3D', '1W'], example: '1D' },
        },
      },
    },
    parameters: {
      ConsumptionRecordId: {
        name: 'consumptionRecordId',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
      },
      NotificationId: {
        name: 'notificationId',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
      },
      WishlistId: {
        name: 'wishlistId',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
      },
      TemptationId: {
        name: 'temptationId',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
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
        ...publicJsonOperation('Auth', '회원가입', 'SignupRequest'),
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
                schema: { $ref: '#/components/schemas/ErrorResponse' },
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
      post: publicJsonOperation('Auth', '로그인', 'LoginRequest'),
    },
    '/api/v1/auth/logout': {
      post: securedOperation('Auth', '로그아웃'),
    },
    '/api/v1/auth/refresh': {
      post: publicOperation('Auth', '토큰 재발급'),
    },
    '/api/v1/auth/check-email': {
      get: {
        ...publicOperation('Auth', '이메일 중복 확인'),
        parameters: [
          {
            name: 'email',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'email' },
          },
        ],
      },
    },
    '/api/v1/auth/check-login-id': {
      get: {
        tags: ['Auth'],
        summary: '아이디 중복 확인',
        security: [],
        parameters: [
          {
            name: 'loginId',
            in: 'query',
            required: true,
            schema: { type: 'string', example: 'gachi123' },
          },
        ],
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
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/email-verifications': {
      post: publicJsonOperation('Auth', '이메일 인증 요청', null, {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
      }),
    },
    '/api/v1/auth/email-verifications/confirm': {
      post: publicJsonOperation('Auth', '이메일 인증 확인', null, {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
        token: { type: 'string', example: '123456' },
      }),
    },
    '/api/v1/auth/password-reset/request': {
      post: publicJsonOperation('Auth', '비밀번호 재설정 요청', null, {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
      }),
    },
    '/api/v1/auth/password-reset/confirm': {
      patch: publicJsonOperation('Auth', '비밀번호 재설정 완료', null, {
        token: { type: 'string', example: 'reset-token' },
        newPassword: { type: 'string', format: 'password', example: 'newPassword123' },
      }),
    },
    '/api/v1/auth/kakao/login': {
      post: publicOperation('Auth', '카카오 로그인'),
    },
    '/api/v1/users/me': {
      get: securedOperation('Users', '내 정보 조회'),
      patch: securedJsonOperation('Users', '내 정보 수정', null, {
        nickname: { type: 'string', example: '돈워리' },
        profileImageUrl: {
          type: 'string',
          format: 'uri',
          example: 'https://example.com/profile.png',
        },
        interestTags: { type: 'array', items: { type: 'string' }, example: ['saving', 'fashion'] },
      }),
      delete: securedOperation('Users', '회원 탈퇴'),
    },
    '/api/v1/users/me/password': {
      patch: securedJsonOperation('Users', '비밀번호 변경', null, {
        currentPassword: { type: 'string', format: 'password', example: 'password123' },
        newPassword: { type: 'string', format: 'password', example: 'newPassword123' },
      }),
    },
    '/api/v1/users/me/saving-goal': {
      put: securedJsonOperation('Users', '절약 목표 설정/수정', null, {
        savingGoalText: { type: 'string', example: '여행 자금 모으기' },
        targetSavingAmount: { type: 'integer', example: 1000000 },
        savingGoalIsActive: { type: 'boolean', example: true },
      }),
      delete: securedOperation('Users', '절약 목표 삭제/해제'),
    },
    '/api/v1/users/me/notification-settings': {
      patch: securedJsonOperation('Users', '알림 설정 수정', null, {
        notifyGoalEnabled: { type: 'boolean', example: true },
        notifyTemptationEnabled: { type: 'boolean', example: true },
        notifyGeneralEnabled: { type: 'boolean', example: true },
        notifyPushEnabled: { type: 'boolean', example: true },
      }),
    },
    '/api/v1/onboarding': {
      get: securedOperation('Onboarding', '온보딩 정보 조회'),
      put: securedOperation('Onboarding', '온보딩 정보 저장/수정'),
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
      post: securedJsonOperation(
        'ConsumptionRecords',
        '소비 기록 입력',
        'ConsumptionRecordRequest',
      ),
    },
    '/api/v1/consumption-records/{consumptionRecordId}': {
      get: withParameters(securedOperation('ConsumptionRecords', '소비 기록 상세'), [
        'ConsumptionRecordId',
      ]),
      patch: withParameters(
        securedJsonOperation('ConsumptionRecords', '소비 기록 수정', 'ConsumptionRecordRequest'),
        ['ConsumptionRecordId'],
      ),
      delete: withParameters(securedOperation('ConsumptionRecords', '소비 기록 삭제'), [
        'ConsumptionRecordId',
      ]),
    },
    '/api/v1/intervention-questions': {
      get: securedOperation('Interventions', '개입 질문 목록 조회'),
    },
    '/api/v1/interventions/risk-score': {
      post: securedJsonOperation('Interventions', '소비 위험도 계산', null, {
        answers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              questionId: { type: 'integer', example: 1 },
              answerValue: { type: 'boolean', example: true },
            },
          },
        },
      }),
    },
    '/api/v1/product-url/parse': {
      post: securedJsonOperation('ProductUrl', '상품 URL 파싱', null, {
        productUrl: { type: 'string', format: 'uri', example: 'https://example.com/products/1' },
      }),
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
      patch: withParameters(securedOperation('Notifications', '알림 읽음 처리'), [
        'NotificationId',
      ]),
    },
    '/api/v1/wishlist-items': {
      get: securedOperation('WishlistItems', '위시리스트 목록 조회'),
      post: securedJsonOperation('WishlistItems', '위시리스트 추가', 'WishlistItemRequest'),
    },
    '/api/v1/wishlist-items/{wishlistId}': {
      get: withParameters(securedOperation('WishlistItems', '위시리스트 상세 조회'), [
        'WishlistId',
      ]),
      patch: withParameters(
        securedJsonOperation('WishlistItems', '위시리스트 수정', 'WishlistItemRequest'),
        ['WishlistId'],
      ),
      delete: withParameters(securedOperation('WishlistItems', '위시리스트 삭제'), ['WishlistId']),
    },
    '/api/v1/temptations/{temptationId}/decisions': {
      get: withParameters(securedOperation('Temptations', '재판단 기록 조회'), ['TemptationId']),
      post: withParameters(
        securedJsonOperation('Temptations', '재판단 기록 추가', 'WishlistDecisionRequest'),
        ['TemptationId'],
      ),
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

function publicJsonOperation(tag, summary, schemaName, properties) {
  return withJsonRequest(publicOperation(tag, summary), schemaName, properties);
}

function securedJsonOperation(tag, summary, schemaName, properties) {
  return withJsonRequest(securedOperation(tag, summary), schemaName, properties);
}

function withJsonRequest(operation, schemaName, properties) {
  const schema = schemaName
    ? { $ref: `#/components/schemas/${schemaName}` }
    : {
        type: 'object',
        properties,
      };

  return {
    ...operation,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema,
        },
      },
    },
  };
}

function withParameters(operation, parameterNames) {
  return {
    ...operation,
    parameters: parameterNames.map((name) => ({ $ref: `#/components/parameters/${name}` })),
  };
}
