---
name: 'Release'
about: 'develop → main 릴리즈 체크리스트'
title: '[TASK] 릴리즈 배포: develop → main'
labels: ['release']
---

## 🎯 목적

develop 브랜치에 누적된 변경사항을 main으로 릴리즈 배포합니다.

## 📦 포함 범위

- **포함 이슈**
- #

- **포함 PR**
- #

- **제외 이슈**
- #

- **제외 PR**
- #

## ✅ 릴리즈 체크리스트

- [ ] develop 최신 상태 확인
- [ ] release PR 생성 (develop → main)
- [ ] 리뷰/체크 통과
- [ ] main 머지
- [ ] GitHub Actions `CD` 성공 확인 (마이그레이션, Cloud Run 배포, `/health` 응답 검사 포함)
