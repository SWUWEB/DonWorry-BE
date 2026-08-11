---
name: 'Release'
about: 'develop → main 릴리즈 체크리스트'
title: '[TASK] 릴리즈 배포: develop → main'
labels: ['task']
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
- [ ] GitHub Actions `CD` 실행 성공 확인 (`main` push 또는 `workflow_dispatch`, ref: `main`)
- [ ] Cloud Run migration Job (`donworry-migrate`) 성공 확인
- [ ] Cloud Run 서비스 (`donworry-api`) 새 리비전 배포 및 정상 응답 확인
