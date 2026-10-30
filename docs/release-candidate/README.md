# accountBook 격리 릴리스 후보

기준: CI main `7f784b3`. 브랜치 `codex/accountbook-release-20261026`. 원본 개발 디렉터리와 CI 작업 디렉터리는 수정하지 않는다. 이 후보는 운영 배포 승인이 아니며 main으로 푸시하지 않는다.

## 이식 범위

`import-manifest.json`에 명시된 116개 파일만 원본에서 복사했다. src의 앱/인증/API/worker/서비스/컴포넌트/단위 테스트, SQLite Prisma 스키마, 알림 service worker, 인증 검증·claim CLI, API 빌드 스크립트, 설계/작업 문서다. 파일별 SHA-256으로 이식 시점의 내용을 확인할 수 있다. 파일 목록은 기능 의존성 관점에서 검토했으며 비밀 환경변수, DB, node_modules, 원본 잠금 파일, 파괴적 apply-schema 스크립트는 포함하지 않았다.

CI의 Next 15.5.28, PostCSS 8.5.31 override, tsx 4.23.15, vitest 2.1.9 및 standalone을 유지했다. 추가 의존성은 후보 자체에 offline 설치하고 잠금 파일을 갱신했다. SQLite 직접 모드를 우선하며 API/Redis/외부 알림 서비스를 운영에 켜지 않는다.

## 합성 구버전 DB 검증

`node scripts/release/verify-legacy.cjs`는 후보 안에 매번 새 `.release-test-*` 디렉터리를 만든다. `7f784b3`의 저장된 스키마에서 구버전 DB를 만들고 사용자 2명과 10개 기존 테이블의 계좌·거래·예산·알림·고정지출 관계를 채운다. 실제 운영/개발 DB 경로를 사용하지 않는다.

`scripts/release/migrate-sqlite.cjs`는 `--database <절대경로> --backup <새 절대경로>`를 모두 요구한다. VACUUM INTO 일관 백업과 보존 검증 뒤 단일 트랜잭션에서 nullable 인증 4열, Session/AuthRateLimit, 알림 4테이블, 할부 2열과 환불 FK/인덱스, 사용자별 알림 unique를 적용한다. 기존 사용자 ID와 소유권을 바꾸거나 첫 가입자에게 자동 귀속하지 않는다. 기존 데이터는 운영자가 명시적인 claim 코드를 발급해 연결해야 한다.

목표 스키마는 새 Prisma 스키마로 생성한 `target-schema.sql` 및 `target-shape.json`으로 검증한다. 모든 테이블의 컬럼 타입/null/default/PK, FK, 인덱스 unique/부분조건/열/collation/정렬을 비교한다. 동명 인덱스의 잘못된 정의나 nullable 할부 열이 있으면 전체 트랜잭션을 되돌린다. 기존에 존재했던 신규 열·테이블까지 모든 행 값을 비교하여 재실행 보존도 확인한다.

이 CLI는 운영 쓰기 프로세스를 모두 중단한 상태를 전제로 한다. 백업 비교는 다른 프로세스를 중단하는 잠금 장치가 아니다. 원본의 `setup`, `db push --force-reset`, dev.db 고정 apply 스크립트를 운영 업그레이드에 사용하지 않는다.

## 배포 전에 반드시 해결할 조건

- 현재 Windows 배포기는 기존 data/app.db를 보존하지만 마이그레이션을 실행하지 않으며, standalone 파일만 패키징해 이 CLI/목표 DDL/shape를 배포 산출물에 포함하지 않는다. 백업→마이그레이션→검증→앱 전환 및 실패 복구 절차를 먼저 통합해야 한다. 아직 수정하거나 실행하지 않았다.
- 현재 배포기의 initial.db는 데모 seed를 생성한다. 새 인증 스키마에서 이 사용자는 인증정보가 없는 기존 사용자이므로 claim 전 접근할 수 없다. 신규 운영 DB의 빈 상태 정책을 확정하고 데모 seed 자동 실행을 제거할지 결정해야 한다. 기존 운영 DB에는 seed하지 않는다.
- production 세션 쿠키는 Secure다. HTTP만 있는 LAN/Tailscale 주소로 인증 검증을 완료했다고 주장하지 않는다. 사설 HTTPS 또는 승인된 공개 HTTPS부터 구성한다.
- DB와 백업 위치/서비스 계정 ACL, 마이그레이션 실행 권한, 런타임 환경변수는 운영 배포 전에 별도 검토한다. 후보에는 .env를 복사하지 않았다.
- standalone 빌드와 실제 인증/권한 화면 검증이 끝나도 운영 전환·신규 계정 claim·HTTPS 설정은 별도 단계다.
- 기존 supervisor의 HTTP 200~399 검사는 로그인 redirect만으로도 통과할 수 있다. DB 조회·로그인·소유권 분리·저장 검증을 대체하지 않는다.
- baseline 7f784b3은 인증 없는 데모이므로 새 사용자 데이터 생성 후 옛 코드로 단순 롤백하면 인증과 소유권 보장을 잃을 수 있다. 접근 차단/유지보수 상태에서 정확한 릴리스와 DB 백업의 짝을 복원하는 절차 및 백업 이후 데이터 손실 영향을 먼저 검토한다. 이번 작업에서는 원격 전환/복원을 수행하지 않았다.

검증 로그와 남은 항목은 `migration-results.json` 및 작업 종료 보고를 기준으로 한다.

## 2026-10-26 검증 결과와 릴리스 차단 항목

- 후보 자체의 offline lockfile 갱신과 npm ci 성공. 단위 83/83, 타입 검사, API 빌드 통과. Next 15.5.28/PostCSS 8.5.31 standalone 빌드 성공(`build.log`).
- 합성 구버전 migration, 10개 기존 테이블 전체 기존 값 보존, 6개 새 테이블에 실제 행을 넣은 뒤 재실행 보존, FK/무결성, 잘못된 인덱스·partial unique·nullable 할부 열 전체 rollback 통과. 인증 서비스의 가입 경쟁, claim 만료/재사용, 세션, 사용자별 알림과 rate limit 통과(`migration-results.json`).
- 실제 standalone server.js를 localhost:4428에서 실행하여 Prisma 엔진 포함 및 DB 접근을 검증했다. 마지막 두 번의 Edge 전체 smoke 통과: 6개 비공개 경로, 320/390/1440px 인증 화면, 가입/로그인/로그아웃, Secure 쿠키, 서로 다른 사용자 거래·검색·할부·환불 조회 격리, 위조 ID 변경 차단, 만료/폐기/위조 세션, 기존 사용자 claim. 모바일 다크 캡처 직접 확인. 테스트 서버/브라우저 종료. localhost의 Secure 쿠키 예외를 이용한 검증이며 사설 HTTPS 운영 검증이 아니다.
- **운영 배포 차단: 간헐 저장 표시 지연 미해결.** 앞선 여러 실행에서 거래가 DB에 정상 저장됐지만 UI가 30초 뒤에도 ‘저장 중…’/목록 0건이었다. `browser/add-failure.json`과 PNG에 입력/DB/네트워크 증거를 보존했다. 폰트 요청을 명시 abort한 대조군에서도 재현되어 외부 폰트를 원인으로 단정하지 않는다. 이후 HTTP finish/close 계측을 추가한 두 실행은 통과했고 addTransactionAction 응답이 수십 ms 안에 서버에서 완료됐다. 성공 재실행은 이전 실패의 해결을 증명하지 않는다. 클라이언트 RSC/후속 GET/JS 청크 경계를 더 확인해야 하며, 이 후보를 운영 준비 완료로 취급하지 않는다.
- 예전 auth 브라우저 스크립트의 중복 input[name=id]와 환불 merchantRaw 표시 가정은 검증 스크립트 문제로 확인해 수정했다. 제품 코드에 추측성 수정은 하지 않았다. `trace-http.cjs`는 합성 smoke 실행에서만 사용하며 쿠키/요청·응답 본문을 기록하지 않는다. 진단에는 후속 RSC GET/정적 청크 완료 이벤트도 포함하도록 준비했다.
- 원본 `accountBook/prisma/dev.db` SHA-256은 기존 `f5d46cad611413532c0a5c8e57b3283fe443001de897d8c2de144ebacb98c688`과 같다. CI 작업 디렉터리의 기존 docs/setup/windows-server.md 변경도 보존했다. 운영 DB·원격 서비스·main push는 수행하지 않았다.
