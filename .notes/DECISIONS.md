# BooKoo 재작성 — 확정 결정사항 (2026-08-24)

원본: `BooKooLegacy/` (Expo 36 + Redux + Firebase Realtime DB, 2020년경)
목표: 동일 도메인을 현대 스택으로 전면 재작성.

## 결제 제공자 전환 (2026-10-14 사용자 결정)

대회 탈락 이후 RevenueCat은 완전히 제거한다. BooKoo의 네이티브 구매·복원은
OpenIAP(`expo-iap`), 영수증 검증과 스토어 생명주기는 IAPKit을 사용한다.
Free/Pro 상품·가격·공유 가계부 권한 정책은 기존 소유자를 유지한다.

사용자는 RevenueCat BooKoo 프로젝트의 구매·고객 이력을 포함한 영구 삭제와
기존 Apple 구매 키 및 BooKoo 전용 Google 서비스 계정 JSON의 IAPKit 업로드를
명시적으로 승인했다. IAPKit 프로젝트는 `hyo-dev/bookoo`다. 스토어 구독과
Convex 가계부·계정 데이터는 별도 소유자이며 이 삭제 범위에 포함되지 않는다.
모바일에 IAPKit 비밀 키를 넣지 않고, 서버가 본인 계정에 구매를 연결하고
서명을 검증한 이벤트로 권한을 결정한다. 현재 계약은
`.notes/design/iapkit-entitlements.md`, 실행 근거는
`.notes/qa/2026-10-14-openiap-iapkit.md`에 기록한다.

## 스토어 국제화 — 영어 우선 (2026-10-09 사용자 교정)

영어는 BooKoo 스토어 메타데이터의 최우선 언어다. Google Play의 기본
스토어 언어는 English (United States), `en-US`로 지정하고, 해당 언어의
제목·설명·시각 자산을 번역이 없는 언어에 제공하는 기준으로 삼는다.
기존 한국어·일본어·중국어·인도네시아어 번역은 해당 사용자 언어에
맞게 유지한다. 영어 우선은 모든 사용자에게 영어 제목을 강제한다는
뜻이 아니다. 콘솔 대시보드 제목만으로 국제화의 정상 여부를 판정하지
말고 기본 언어 표시와 실제 언어별 스토어 제목을 확인한다.

## 제품 포지셔닝 — 투명한 커뮤니티 가계부 (2026-09-20 사용자 교정)

사용자가 의도한 제품은 **여러 사람이 공동 자금의 수입·지출을 함께
기록하고 확인하며 대화하는 투명한 커뮤니티 가계부**다. 대표 사용 맥락은
기업 팀의 총무, 글로벌 프로젝트 운영, 등산 모임, 가족 여행이다.
부부·커플은 이 범위에 포함되는 사용 사례이며, 제품 전체의 대상으로
한정하지 않는다. 9월 17–19일의 부부·커플 중심 스토어 포지셔닝보다
이 사용자 교정이 우선한다.

- 앞으로 소개 문구, 온보딩, 스크린샷, Shipaton 설명은 공동 자금과
  구성원 간 투명성을 중심에 둔다. 한 데모에서는 한 모임의 실제 흐름을
  구체적으로 보여준다.
- 투명성은 현재 권한 모델 안에서 설명한다. 초대된 구성원이 공유 기록을
  확인하는 경험이며, 불특정 다수 공개나 개인 가계부 노출을 뜻하지 않는다.
  소유자·관리자의 관리 권한과 일반 구성원의 권한을 동일하다고 설명하지 않는다.
- 현재 신규 가계부는 Free 2명, Pro 5명 제한이다
  (`convex/lib/entitlements.ts`). 더 큰 모임을 지원할 인원·과금 정책은
  검토 과제이며, 이번 포지셔닝 교정만으로 새 숫자나 상품을 확정하지 않는다.
  기존 문서의 미정 Community 요금제와 제품의 커뮤니티 방향은 구분한다.
- 글로벌 프로젝트는 지향하는 사용 맥락이다. 여러 통화의 자동 환산,
  기업 회계·결재, 송금·자동 정산을 이미 제공한다고 확대 해석하지 않는다.

이번 세션은 방향을 기록했다. 게시된 스토어 문구·영상·Devpost 설명의
정렬과 인원 정책 변경은 후속 작업이며, 이미 반영됐다고 보고하지 않는다.

### 스토어 정렬 실행 (2026-09-20)

위 교정을 실제 스토어 문구에 적용했다. 저장소 9개 로케일
(`store-assets/metadata/*.json`) 전부와 Play에 실제 활성화된 5개 로케일
(ko-KR, en-US, id, ja-JP, zh-CN)을 커뮤니티 포지셔닝으로 다시 썼다.
Play에 de/fr/es/it 등록정보는 존재하지 않는다 — 저장소의 9개 로케일 중
Play에 올라가는 것은 5개뿐이며, 나머지는 App Store 전용이다.

문구의 논지는 "공동 경비가 총무 한 사람에게 몰리고, 나머지는 따로
물어봐야 한다 → 장부를 열고 기록마다 댓글로 묻는다"이다. 댓글을 기능
목록의 한 줄이 아니라 제품의 쐐기로 올렸다.

새 문구가 과장으로 읽히지 않도록 세 가지를 같이 고쳤다.

- **무료 2명 제한을 처음으로 명시했다.** 인원 상한을 적지 않은 채
  "모임" 문구만 올리면 "동호회 전체를 초대해도 된다"로 읽힌다. Pro 단락과
  Play FAQ에 무료 2명 / Pro 5명을 적었다 (`convex/lib/entitlements.ts`와 일치).
- Pro 항목의 "한 명이 결제하면 **가구** 전체가 사용합니다"를 "그 **가계부의
  구성원** 전체"로 고쳤다. 상품은 그대로다.
- 모임 문구가 불러오는 오해를 명시적으로 부정했다: **자동 정산 없음**,
  **공개 게시판 아님**(초대받은 구성원만).

독일어는 제품 명사 자체를 Haushaltsbuch → Kassenbuch로 바꿨다. 독일어로
"살림 장부"라고 불리는 앱은 어떻게 설명해도 살림 앱으로 읽힌다.

한국어 Apple 앱 이름은 `BooKoo - 함께 쓰는 가계부` 그대로 뒀다. 가계부는
어원상 가정 장부지만 한국어에서 검색량을 가진 유일한 카테고리 단어다.
커뮤니티 신호는 부제(`팀·모임·여행 공동 경비 함께 기록`)와 키워드가 진다.

재촬영까지 끝냈다. Play 5개 로케일 전부가 이제 자기 언어의 패널 8장과
자기 피처 그래픽, 자기 트레일러를 갖는다. ko는 `우리집 생활비` 대신
모임 픽스처로, en·ja·zh·id는 각 언어의 등반 동호회 픽스처
(`.local/marketing-fixture/seed-en.ts`, `seed-locale.ts`)로 찍었다.
그전까지 ja·zh·id는 한국어 화면을 자국 방문자에게 그대로 보여주고
있었다. 패널 순서는 다섯 로케일 모두
`sharing, comments, calendar, timeline, stats, entry, categories, theme`다.

트레일러(전부 일부 공개): ko `YLvXCWzFThs` · en `dO8QSoVC0kc` ·
ja `2HQhHuWrp2Q` · zh `v_zFMH71HtM` · id `8i8QjHcg2MY`. 각
`store-assets/metadata/*.json`의 `google.promoVideo`에 기록했다.

**텍스트가 캔버스를 넘치는 결함을 두 번 냈다.** 처음은 인도네시아어 피처
그래픽 — 태그라인 SVG 캔버스가 520px인데 헤드라인이 541px로 렌더되어
"catatan bersam"으로 잘린 채 나갔다. 고친 뒤 muse 리뷰가 같은 유형을
`generate-promo-video.mjs`에서 또 찾아냈고, 이번엔 이미 공개된 트레일러
안이었다. 숏 플레이트는 1920 캔버스의 x=780에 78px 고정으로 좌측 정렬하는데
아무것도 재지 않아서, 인도네시아어 댓글 캡션이 아홉 글자를 잃고
인도네시아어·일본어 첫 캡션이 마지막 단어를 잃었다. 배포된 MP4에서 프레임을
뽑아 확인했다.

이제 세 생성기 모두 렌더된 잉크 폭을 잰다. 피처 그래픽은 넘치면 예외를
던지고, 영상·패널 플레이트는 폰트를 단계적으로 줄이다 그래도 안 들어가면
예외를 던진다. ko/en/zh 영상과 패널 40장 전부가 바이트 동일하게 재생성되는
것이 나머지는 잘리지 않았다는 증거다.

**이 프로젝트에서 경계할 실패 유형이다**: 잘못된 그림이 빌드의 모든 검사를
통과한다. 파일명도 바이트 수도 해상도도 재생시간도 전부 정상이다. 산출물을
실제로 렌더해서 읽어야만 보인다. 잉크를 재거나, 프레임을 눈으로 보라.

`screenshotAltText`는 위치 기반인데 세 로케일이 자기 패널과 어긋나 있었다.
이제 모든 메타데이터가 `screenshotScenes`를 함께 선언하고, 생성된 패널
매니페스트에서 읽은 장면 순서와 대조한다. `urls.terms`는 검증된 적이
없었는데 이것도 추가했다.

iOS는 프로모션 텍스트 외에는 여전히 다음 버전에서만 수정 가능하다.

## 1. 범위

- **레거시 전체 기능 이식**: 공유 가계부(멤버 초대/승인), 항목(수입/지출/카테고리/사진/위치/메모),
  리뷰 댓글, 캘린더, 통계 그래프, 앱 잠금, 다국어, 푸시.
- 단순 이식이 아니라 **전면 모던화**. 더 나은 구조/UX가 있으면 그쪽을 택한다.
  - 예: 초대 → 레거시의 `invites` 양방향 인덱스 + `requests` 승인 플로우 대신
    **초대 링크(딥링크) 하나로 즉시 합류**하는 방식을 우선 검토.

## 2. 스택

- 베이스: `crossplatformkorea/expo-template-cpk` 로 스캐폴드 후 Convex 얹기
- Expo SDK 57 / React Native 0.86.2 / React 19.2.3 (Martie·FightingHows와 동일 라인)
- 백엔드: **Convex** (DB + serverless functions + file storage)
- UI: **cpk-ui 0.8.0-beta.0**, 스타일: **kstyled 0.4.1** (+ babel-plugin-kstyled 0.4.1)
- 라우팅: expo-router / 상태: zustand + MMKV / 리스트: @shopify/flash-list
- 날짜: date-fns (moment 완전 제거)
- 패키지 매니저: bun

## 3. 인증

- Convex Auth 기반. 참조 구현: `~/Github/hyodotdev/FightingHows/convex/auth.ts`
- 제공자: **카카오 / 네이버 / 구글 / 애플 / 이메일 OTP**
- **이메일로 계정 병합**(provider가 이메일 검증을 보증할 때만 자동 링크)
- 최초 로그인 시 **인스타그램식 중복 없는 username(handle)** 설정 강제
- 레거시 Facebook 로그인은 폐기 → 해당 유저는 이메일로 복구

## 4. 데이터 이관

- **실제 프로덕션 유저 데이터를 Convex로 이관한다.**
- Firebase 프로젝트: `bookoo-89f6c`, Realtime Database `/bookoo` 하위 + Firebase Storage 사진
- 전 테이블에 `legacyUid` / `legacyKey` 필드를 처음부터 둔다 (나중에 붙이면 아픔)
- 비밀번호 해시는 이관하지 않음 → 첫 로그인 시 이메일 OTP/소셜로 재인증 후 legacy 계정에 링크

## 5. 비기능 요구사항 (최우선)

- **데이터가 무한히 늘어나도 빠릿빠릿해야 한다.** 레거시는 ledger 전체 items를 Redux에 통째로
  올려서 느려졌다. 새 앱은:
  - 무제한 증가 가능한 모든 리스트 = FlashList + Convex `paginate()` + `usePaginatedQuery`
  - 집계(월별 합계/카테고리별 합계/잔액)는 **롤업 테이블 또는 @convex-dev/aggregate**로 처리,
    절대 클라이언트에서 전량 집계 금지
  - 모든 쿼리는 `withIndex`. 큰 테이블에 `.filter()` 금지
  - 콜드 스타트 체감 개선: 현재 세션의 Convex 메모리 캐시와 화면 구조 스켈레톤
  - 2026-09-02부터 서버 데이터의 영구 query mirror와 오프라인 write queue는 지원하지 않는다.
    서버가 유일한 기준이며 오프라인 저장은 실패·재시도 상태로 남긴다.
- **다크/라이트 모드** 완전 지원
- **태블릿 레이아웃** 지원 (Martie의 `app/_Tabs/` Mobile/Tablet 분기 패턴 차용)
- 패키지 전부 최신화

## 6. AI 에이전트 설정

- Martie의 `.agents/` 단일 소스 + `.claude/` `.codex/` `.grok/` 미러 방식 그대로,
  **추가로 Cursor(`.cursor/rules/*.mdc`)까지** 호환되게 구성
- `AGENTS.md` + `CLAUDE.md`에 코딩 규칙(무제한 리스트 페이지네이션 강제, `any` 금지 등) 명시

## 7. 앱 식별자 (2026-08-24 확정)

- 번들 ID / 패키지명: **`dev.hyo.bookoo`** (기존 `com.dooboolab.bookoo` 승계 안 함)
- 즉 **새 스토어 리스팅**으로 출시된다. 기존 앱 사용자에게 자동 업데이트로 나가지 않음.
- 따라서:
  - 레거시 유저는 새 앱을 직접 설치해야 하고, 첫 로그인 시 이메일/소셜로 본인 확인 후
    `legacyUid` 매칭으로 과거 데이터를 넘겨받는다. (데이터 이관 계획은 그대로 유효)
  - 구 앱에 "새 BooKoo로 이사하세요" 안내를 띄우는 방안은 별도 검토 (구 앱은 Expo 36이라
    빌드 자체가 어려움 — 스토어 설명/스크린샷 변경이 현실적인 경로)

## 8. UI 컴포넌트 소유권 (2026-08-27 확정)

- 버튼, 입력, dialog/sheet, FAB, Calendar, ParallaxHeader, segmented/section control과
  pie/donut/bar/line chart 등 데이터에 독립적인 UI는 모두 오픈소스 `crossplatformkorea/cpk-ui`가
  소유한다.
- cpk-ui 컴포넌트가 없으면 upstream에 새로 만들고, 결과/API가 BooKoo에 맞지 않으면 BooKoo에서
  복제하지 말고 upstream 컴포넌트의 variant/slot/render/style API를 개선한다.
- BooKoo는 가계부 rollup을 chart series로 바꾸는 adapter, 금액/문구 포맷, i18n, 접근성 설명,
  권한, 라우팅, 화면 조합만 소유한다. Victory/Skia/SVG 같은 renderer는 cpk-ui 내부 구현 세부다.
- 공용 컴포넌트는 cpk-ui의 public export, 타입, 테스트, Storybook, light/dark, reduced-motion,
  native/web 검증을 갖추고 `bun run test:all && bun run build`를 통과한 뒤 BooKoo가 정확한 배포
  버전을 pin한다. 로컬 link는 미배포 QA 전용이며 절대 커밋하지 않는다.

## 9. EAS 빌드 실행 위치 (2026-08-30 확정)

- EAS 네이티브 빌드는 개발·프리뷰·프로덕션 모두 **반드시 `eas build --local`**로 실행한다.
- EAS 클라우드 빌드 큐는 사용하지 않는다. 시뮬레이터·에뮬레이터·연결 기기 E2E는 로컬
  Xcode/Gradle 빌드를 우선한다.
- 스토어 제출은 별도 단계이며, 로컬에서 생성하고 직접 검증한 IPA/AAB만 승인된 제출 작업에
  사용한다.

## On-device AI (locanara / expo-ondevice-ai) — assessed 2026-09-19, deferred

**Decision: build it, but not before the Shipaton deadline (2026-10-01 15:45 KST),
and not as 1.1.0 yet.**

The idea fits this app better than most. A shared household ledger is exactly the
data people will not paste into a cloud model, and BooKoo already sells privacy —
its last release note is about sending *less* to analytics. "처리는 전부 기기
안에서" is defensible here.

### Why it is deferred, not rejected

- A new native module means new local builds on both platforms and fresh review
  cycles, and a new iOS submission **supersedes the 1.0.3 binary in review**.
- No Shipaton award category rewards the feature; Grand Prize rewards post-launch
  growth. Twelve days spent on a native integration is twelve days not spent on
  anything a judge can score.
- On-device AI is not an acquisition hook for a ledger. It is a retention and
  delight story, and it only pays off once someone is choosing between BooKoo and
  a cloud alternative. Nobody is choosing yet.

### Blockers to clear before any branch exists

1. **AGPL-3.0.** Both `locanara` and `expo-ondevice-ai` are AGPL. Linking an AGPL
   native module into a closed-source paid app is the viral scenario the licence
   targets, and AGPL has a history of friction with store distribution. Owning
   the upstream org grants nothing until a written exception exists covering both
   repositories.
2. **Android floor.** The library needs API 34+ for Gemini Nano and 31+ for
   ExecuTorch. TabiMate — the same stack as BooKoo — ships
   `plugins/withMinSdk31.js` to force minSdk 31. BooKoo is at 24, so adopting
   this drops every device below Android 12. That is an app-wide decision, not a
   feature-local one.
3. **iOS floor.** iOS 26+ for Apple Intelligence against BooKoo's 17.0 target.

### The first feature, when it happens

**Auto-categorise an entry from its memo.** Every entry needs a category, so it is
the most repeated friction in the product; short-string classification is what
small on-device models are actually good at; and a wrong answer costs one tap,
which doubles as a correction signal. A plain-Korean monthly summary on the
statistics screen is the natural second.

**Do not start with the comment thread.** It is the product's differentiator and
its trust surface. A wrong category costs a tap; a hallucinated "you agreed to
split this 50/50" on a shared money conversation costs the user something real.
Probabilistic text belongs on low-trust surfaces first.

### What is shippable now, without touching the review in flight

The deterministic layer, JS-only and therefore OTA-safe: a keyword-map
categoriser, the suggestion UI, and the instrumentation, with the model call site
behind a capability check. That is the fallback path the feature needs anyway —
RecallAI's `on-device-organizer.ts` is the precedent, trying the model first and
falling back to `classifyDeterministically()`. Slot the model behind the same
interface in October.


## 2026-11-21 — Autonomous maintenance and delivery

The owner delegates routine investigation, implementation, necessary compatible
migrations, verification, commit/push/PR/review fixes, integration and existing-path
backend/OTA/native/store submission/publication. AGENTS.md's Autonomous operation
section is the canonical authority boundary; maintain orchestrates existing skills.
Reserved decisions include pricing/payment policy, forced-update floors, new paid
contracts, unsupported privacy/legal answers and irreversible production-data work.

One host-wide kernel lock serializes daily and manual coordinators across clones
and worktrees. Kernel ownership supersedes stale metadata; never unlink the inode.
No multi-host automation without shared scheduler exclusion. STATUS is tracked and
sanitized; PR metadata owns exact final head/merge/check evidence. Daily default:
09:00 Asia/Seoul, after a verified first cycle; no timestamp-only commits.

Root strict nonforce fast-forward integration wins over the old loop-review
squash wording. Protection/rulesets must still be inspected on each integration;
no bypass if they conflict. Self-review means self-review, with two clean full
snapshots at least five minutes apart; no external reviewer substitution.

Existing appConfig owns native build floors. Its ADMIN mutation replaces the
whole singleton, so preserve all unrelated settings and read back; no appVersions
table. Stored date buckets are integers in ledger timezone; ISO date strings are
UI/API codecs. No runtime dependency/version change belongs to this tooling batch.
