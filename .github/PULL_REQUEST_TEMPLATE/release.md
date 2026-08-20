## 📌 작업 요약

- 요약:
  - develop 브랜치의 누적 변경사항을 main으로 릴리즈 배포
- 관련 이슈: closes #

## 🌿 브랜치 정보

- **Source**: `develop` (기본)
- **Target**: `main` (릴리즈)

## ✅ 체크리스트

- [ ] 브랜치 컨벤션 준수 (`feat/fix/refactor/docs/chore/test/ci/hotfix`)
- [ ] 커밋 컨벤션 준수 (`feat/fix/refactor/docs/style/test/ci/chore`)
- [ ] self-review 완료
- [ ] 테스트 및 로컬 실행 확인 완료

## 🚀 배포 검증

- GitHub Actions `CD` 실행 확인 (`main` push 또는 `workflow_dispatch`, ref: `main`)
  - 결과:
  - 실행 링크:
  - 스크린샷:

- Cloud Run migration Job (`donworry-migrate`) 성공 확인
  - 결과:
  - 실행 로그 링크:
  - 스크린샷:

- Cloud Run 서비스 (`donworry-api`) 새 리비전 배포 및 정상 응답 확인
  - 결과:
  - 리비전/로그 링크:
  - 스크린샷:
