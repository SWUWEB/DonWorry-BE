# Error Codes

상세 에러 코드는 아래 Google Sheets를 단일 원본으로 관리합니다.

Google Sheets: [Error Code Single Source](https://docs.google.com/spreadsheets/d/1rCsl4SikjwKhs5etK-PVfIaEpmGj0t19pxU0FgzLH6U/edit?gid=0#gid=0)

## 운영 원칙

- 에러 코드 추가/수정은 Google Sheets에 먼저 반영합니다.
- 코드 반영 시 `src/config/error-codes.js`와 동기화합니다.
- 시트 컬럼은 `ERROR_CODE`, `HTTP_STATUS`, `message`, `설명`, `로그레벨` 기준으로 관리합니다.
- `HTTP_STATUS`는 `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `409 CONFLICT`처럼 숫자와 상태명을 함께 작성합니다.
- PR 본문에는 변경된 에러 코드의 핵심 정보와 시트 스냅샷 탭 링크를 기록합니다.
- 커밋 해시는 운영 감사나 릴리즈 추적이 필요한 경우에만 선택적으로 기록합니다.

## PR 작성 예시

```md
- ErrorCode 동기화
  - AUTH4009 (HTTP 400 Bad Request): 회원가입 비밀번호 위험 등급 차단
- 에러코드 스냅샷 탭(v4): error-code-v4(gid=858152992)
```
