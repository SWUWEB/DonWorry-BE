# AWS 운영 배포

## 구성

- Amazon Lightsail Linux 2GB 인스턴스 한 대를 사용한다.
- API, MySQL, Caddy를 Docker Compose로 실행한다.
- MySQL 포트는 외부에 공개하지 않는다.
- Caddy가 HTTPS 요청을 받고 API 컨테이너로 전달한다.
- 구매한 도메인 대신 Lightsail 고정 IP에 대응하는 `sslip.io` 주소를 사용한다.

## 서버 초기 설정

1. Lightsail 인스턴스에 고정 IP를 연결한다.
2. 방화벽에서 TCP 22, 80, 443과 UDP 443만 허용한다.
3. `deploy/bootstrap.sh`를 서버에서 한 번 실행한다.
4. 다시 로그인해 Docker 그룹 권한을 반영한다.
5. `~/donworry/deploy/.env`에 운영 환경 변수를 저장한다.

운영 환경 변수는 `.env.production.example`을 기준으로 작성한다. 데이터베이스 비밀번호에 URL 예약 문자를 사용한다면 `DATABASE_URL`의 비밀번호 부분을 URL 인코딩해야 한다.

## GitHub production 환경

다음 환경 변수를 등록한다.

- `LIGHTSAIL_HOST`: Lightsail 고정 IPv4 주소
- `LIGHTSAIL_SSH_USER`: Ubuntu 이미지 기준 `ubuntu`
- `LIGHTSAIL_SSH_KNOWN_HOSTS`: 서버의 검증된 SSH host key
- `PRODUCTION_URL`: `https://고정-IP-하이픈표기.sslip.io` 형식의 공용 URL

`LIGHTSAIL_SSH_PRIVATE_KEY`에는 Lightsail SSH 개인 키 원문을 환경 secret으로 등록한다. 공개 연결 정보는 secret이 아니라 환경 변수로 관리한다.

`main` 브랜치만 `production` 환경에 배포할 수 있도록 deployment branch rule을 유지한다.

## 배포 순서

1. GitHub Actions가 애플리케이션 이미지를 빌드해 GHCR에 올린다.
2. 서버가 새 이미지를 내려받는다.
3. MySQL을 시작하고 준비 상태를 확인한다.
4. Prisma 마이그레이션을 실행한다.
5. 운영 필수 seed 데이터를 반영한다.
6. API 컨테이너를 새 이미지로 교체한다.
7. 컨테이너 내부 헬스 체크를 통과하면 Caddy를 시작한다.
8. 외부 HTTPS 헬스 체크를 통과하면 GitHub Deployment를 성공으로 표시한다.

초기 배포나 운영 점검 시 `deploy/verify.sh`에 공용 URL을 전달해 seed 데이터, 백업 생성, HTTPS 헬스 체크를 함께 확인한다.

API 교체 후 헬스 체크가 실패하면 이전 애플리케이션 이미지로 되돌린다. 이미 적용된 데이터베이스 마이그레이션은 자동으로 되돌리지 않는다.

## 백업

`deploy/bootstrap.sh`는 매일 오전 3시 15분에 `deploy/backup-db.sh`를 실행하도록 등록한다. 백업은 `~/donworry/backups`에 저장하며 7일이 지난 파일은 삭제한다.

백업과 데이터베이스가 같은 인스턴스에 있으므로 서버 자체가 손상되면 함께 유실될 수 있다. 고객 데이터가 생기거나 장기 운영으로 전환할 때는 S3 외부 백업을 추가한다.
