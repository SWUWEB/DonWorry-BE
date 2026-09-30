# DonWorry-BE

Node.js Express 기반 DonWorry 백엔드 API 서버입니다.

## Stack

- JavaScript
- Express
- MySQL
- Prisma
- Zod DTO validation

## Local Setup

1. 의존성 설치

   ```bash
   npm install
   ```

2. 환경변수 설정

   ```powershell
   copy .env.example .env
   ```

3. 로컬 MySQL 실행

   ```bash
   docker compose up -d mysql
   ```

4. Prisma Client 생성

   ```bash
   npm run prisma:generate
   ```

5. DB 마이그레이션

   ```bash
   npm run prisma:migrate
   ```

6. 초기 seed 데이터 입력

   ```bash
   npm run seed
   ```

7. 개발 서버 실행

   ```bash
   npm run dev
   ```

## 카카오 계정 탈퇴 운영 설정

- 카카오 디벨로퍼스의 서비스 앱 Admin Key를 `KAKAO_ADMIN_KEY`로 서버 비밀값에 주입해야 합니다. `.env`나 Git에 실제 키를 기록하지 마세요. 카카오 연결 계정 탈퇴와 장애 복구에 사용됩니다.
- 프론트엔드는 카카오 전용 계정에서 `POST /api/v1/users/me/withdrawal/kakao/authorization`을 호출하고, 응답의 `authorizationUrl`로 이동합니다. 콜백의 `code`와 `state`를 `DELETE /api/v1/users/me`의 `authorizationCode`, `state`로 보내며 DonWorry access token은 Bearer 헤더에 넣습니다.
- 카카오톡 인앱 브라우저에서 시작한 사용자는 외부 브라우저에서 DonWorry에 로그인한 뒤 위 탈퇴 절차를 진행해야 합니다. 기존 토큰을 URL로 전달하지 않습니다.
- 카카오 Unlink와 로컬 DB 삭제 사이에 실패하면 `withdrawal_attempts`에 복구 상태가 남습니다. 운영자가 실패 로그와 대상 건을 확인한 후, DB 및 `KAKAO_ADMIN_KEY`에 접근 가능한 환경에서 `npm run withdrawals:reconcile`을 실행하세요. 실행 중인 요청과 충돌하지 않도록 생성 후 2분이 지난 건만 재시도합니다. 복구 명령은 실제 카카오 연결 해제와 계정 삭제를 수행하므로 실행 전 대상 DB를 확인해야 합니다.

## Test Setup

로컬 테스트는 `donworry_test` 데이터베이스를 사용합니다.

1. MySQL 컨테이너 실행

   ```bash
   docker compose up -d mysql
   ```

2. 테스트 DB 생성

   ```bash
   docker compose exec mysql mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS donworry_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON donworry_test.* TO 'donworry'@'%'; FLUSH PRIVILEGES;"
   ```

3. 테스트 DB 마이그레이션

   테스트 DB는 이미 만들어진 마이그레이션을 적용하는 목적이므로 `migrate deploy`를 사용합니다.
   `migrate deploy`는 shadow database를 사용하지 않아 `migrate dev`에서 발생할 수 있는 P3014 권한 문제와는 관련이 없습니다.

   PowerShell:

   ```powershell
   $env:DATABASE_URL="mysql://donworry:donworry@localhost:3307/donworry_test"; npx prisma migrate deploy
   ```

4. 테스트 실행

   ```bash
   npm test
   ```

## Project Structure

- src/app.js: Express 앱 구성
- src/server.js: 서버 부팅
- src/config: 환경변수와 공통 설정
- src/features: feature-first API 모듈
- src/middlewares: 인증, 에러 처리, validation
- src/prisma: Prisma client singleton
- prisma/schema.prisma: ERD 기반 DB schema

## API Prefix

모든 비즈니스 API는 /api/v1 하위에 둡니다.

## Swagger

- Swagger UI: http://localhost:3000/api-docs
- OpenAPI JSON: http://localhost:3000/api-docs.json

Swagger UI 오른쪽 상단의 Authorize 버튼에 access token을 입력하면 인증이 필요한 API 요청에
Authorization: Bearer 토큰이 자동으로 포함됩니다.

## Troubleshooting

### Prisma migrate P3014

`npm run prisma:migrate`는 `prisma migrate dev`를 실행합니다. 로컬 개발 DB에 새 마이그레이션을
생성하거나 적용하는 과정에서 shadow database를 사용하므로, MySQL 사용자 권한이 부족하면 P3014가
발생할 수 있습니다.

이 조치는 로컬 개발에서 `npm run prisma:migrate`를 실행할 때만 필요한 가이드입니다. Test Setup은
`npx prisma migrate deploy`를 사용하며 shadow database를 만들지 않으므로 이 P3014 조치가 필요하지
않습니다.

`npm run prisma:migrate` 실행 중 shadow database 권한 오류가 발생하면 로컬 MySQL 컨테이너의
`donworry` 사용자 권한을 갱신합니다.

```bash
docker exec donworry-mysql mysql -uroot -proot -e "GRANT ALL PRIVILEGES ON *.* TO 'donworry'@'%'; FLUSH PRIVILEGES;"
npm run prisma:migrate
```
