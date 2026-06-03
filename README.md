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

   npm install

2. 환경변수 설정

   copy .env.example .env

3. 로컬 MySQL 실행

   docker compose up -d mysql

4. Prisma Client 생성

   npm run prisma:generate

5. DB 마이그레이션

   npm run prisma:migrate

6. 초기 seed 데이터 입력

   npm run seed

7. 개발 서버 실행

   npm run dev

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
