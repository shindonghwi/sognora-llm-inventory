# sg-growth-expose — 룰북 (SSOT)

> Claude Code·Codex 양쪽이 공유하는 본체. 내용 수정은 이 파일에서만 한다.
> 이 룰북은 하브루타 검증(2026-08)을 거친 원장 기반이다: 노출의 병목은 저권위 신생 서비스에선 "순위"가 아니라 "자격(인덱스 가능·크롤러 가시·리스팅 완비)"이다.

## 대상 판별 신호

- **앱**: `brand.yaml`에 `bundle_id` / `android/`·`ios/` 디렉토리 / `fastlane/` / Firebase 앱 설정
- **웹**: `package.json`에 next·react·vite 등 + 라우팅 디렉토리(`src/app`·`pages`) / 정적 사이트(html)
- **둘 다**: brand.yaml에 `web_domain`과 `bundle_id`가 함께 있으면 양쪽 다 수행
- **배제 신호(= "웹 아님")**: `src-tauri/` · 의존성 `electron` · `react-native` · `expo`. 이게 있으면 라우팅 디렉토리가 있어도 웹으로 판정하지 않는다.
  - 실측 재현: `next` + `src/app` + `src-tauri/`인 데스크톱 앱 레포가 **"웹"으로 오판**돼 robots.txt·sitemap·메타를 창작할 경로였다. (반대로 RN classic·Electron+Vite는 오판하지 않음을 실측 확인 — 원 지적 철회분)
- **모노레포**: 루트에서 판별 불가면 **1단계 하위(`packages/*`·`apps/*`)의 package.json까지 스캔**한 뒤 판정한다. 루트만 보고 "판별 불가"로 종료하면 실제 웹·앱이 있는데 아무것도 못 받는다.
- **웹뷰 하이브리드**(Capacitor 등)는 "둘 다"로 잡되, **웹 절차 착수 전에 그 웹 번들이 실제 배포되는 사이트인지 확인**한다 — 앱 안에만 들어가는 번들에 SEO를 적용하는 것은 헛일이다.
- 신호가 충돌하면 **둘 다**로 넓게 잡는다(놓치는 것보다 낫다). 판정 근거를 보고에 남긴다.

## 웹 체크리스트 (로컬 SEO 스킬이 없을 때의 자체 감사)

**기술 SEO**
1. [ ] 페이지별 `<title>`·meta description — 로케일별로 존재하고 중복 없음
2. [ ] canonical URL 정합 (로케일 변형 간 자기참조 canonical)
3. [ ] sitemap.xml — 전 로케일 라우트 포함, 404·리다이렉트 미포함
4. [ ] robots.txt — 크롤 허용 상태, sitemap 선언
5. [ ] hreflang — 지원 로케일 상호 참조 + x-default. **정합 깨짐은 로케일 표면 전체의 자격 상실**이므로 최우선
6. [ ] 구조화 데이터(JSON-LD) — Organization·WebSite 기본, 페이지 성격에 맞는 타입(FAQPage·Product 등)
7. [ ] OG·twitter 카드 (공유 노출)
8. [ ] 빌드 산출물에 로케일 페이지가 실제 정적 생성되는지 (빌드 로그 확인)

**GEO 층 (항상 이 스킬 담당)**
9. [ ] robots.txt의 AI 크롤러 처리 — **두 계열을 갈라서 본다. 섞으면 노출도 못 올리고 소유자 권리만 침해한다.**

   **분류 기준은 "노출을 좌우하는가"와 "robots.txt에 구속되는가" 둘이다.** 후자를 빼면 *효과 없는 수정을 성과로 보고*하게 된다.

   | UA | 계열 | robots 구속 | 처분 | 1차 근거 |
   |---|---|---|---|---|
   | `OAI-SearchBot` | 검색 인덱스 | ✔ | **차단 시 해제** | "will not be shown in ChatGPT search answers" (OpenAI) |
   | `Claude-SearchBot` | 검색 인덱스 | ✔ | **차단 시 해제** | "prevents … indexing your content for search" (Anthropic) |
   | `PerplexityBot` | 검색 인덱스 | ✔ | **차단 시 해제** | "surfaces and links websites in search results" (Perplexity) |
   | `Claude-User` | 사용자 발동 | ✔ | **차단 시 해제** | "prevents … retrieving your content in response to a user query" (Anthropic) |
   | `ChatGPT-User` | 사용자 발동 | **✘** | **보고만** | "robots.txt rules may not apply" (OpenAI) |
   | `Perplexity-User` | 사용자 발동 | **✘** | **보고만** | "generally ignores robots.txt rules" (Perplexity) |
   | `GPTBot` | 훈련 | ✔ | **불가침·보고만** | "should not be used in training" (OpenAI) |
   | `ClaudeBot` | 훈련 | ✔ | **불가침·보고만** | Anthropic 크롤러 문서 |
   | `Google-Extended` | 훈련(Gemini) | ✔ | **불가침·보고만** | "doesn't affect a site's inclusion in Search" (Google) |
   | `CCBot` | 훈련(Common Crawl) | ✔ | **불가침·보고만** | 1차 미확인 — 2차 다수 일치 |

   - **훈련 봇 차단을 스킬이 자동 해제하는 것은 금지다** — 이득이 0인데 소유자의 저작권 스탠스를 무단으로 뒤집는다. 남의 레포에서 이걸 하면 법무 이슈다.
   - **비구속 UA(`ChatGPT-User`·`Perplexity-User`)의 `Disallow`는 무효 지시어다.** 지우든 두든 동작이 안 바뀌므로 "해제했다"를 성과로 보고하지 않는다 — 보고서에 "무효 지시어"로만 적는다.
   - `Claude-Web`·`anthropic-ai`는 **현행 Anthropic 크롤러 문서에 존재하지 않는다**(현행 3종: ClaudeBot·Claude-User·Claude-SearchBot). 감사 대상에서 뺀다. *"폐기"라는 명시 문구는 1차 출처에서 확인되지 않았으므로 그렇게 단정하지 않는다.*
   - **이 표의 각 행에는 출처와 확인일을 붙여 유지한다.** 이 스킬의 고질병이 낡은 사실이므로, 데이터 자체가 낡음을 드러내야 한다.
10. [ ] 핵심 페이지 SSR 가시성 — JS 실행 없이 받은 HTML에 본문 텍스트가 있는가 (`curl`로 확인). 상당수 AI 크롤러는 JS를 렌더링하지 않는다 — 빈 셸이면 AI 답변 엔진에 존재하지 않는 것과 같다
11. [ ] 추출 적합성 — 핵심 페이지에 질문형 헤딩·표·리스트 등 발췌 가능한 구조가 있는가 (없으면 "권고"로 보고, 콘텐츠 재작성은 하지 않는다)

**의도 존중 규칙 (수정 전 필수 판단)**: 편차를 전부 결함으로 보지 않는다. **코드에 명시적으로 인코딩된 제외는 소유자 의도로 간주하고 보고만 한다.**
- 신호: sitemap 생성기의 `filter(...)`·라우트 매니페스트의 `indexable` 같은 플래그·robots의 개별 `Disallow` — 실측 사례: nolpop `src/app/sitemap.ts`가 pricing을 `filter`로 의도 제외하고 `src/routing/manifest.ts`에 라우트별 `indexable` 필드를 둔다. 체크 3("전 로케일 라우트 포함")을 무인으로 적용하면 **소유자가 뺀 페이지를 되살린다.**
- 반대로 **누락·오타·미설정**(파일 자체가 없음, hreflang 오배선, 빈 값)은 결함으로 보고 수정한다.

**적용 규칙**: 1~10은 수정 대상(코드·설정 변경). 단 **9의 훈련 봇 계열과 위 의도 존중 규칙에 걸리는 항목은 보고만.** 11은 권고만.
**렌더링 아키텍처는 수정 대상이 아니다** — 체크 10(SSR 가시성)이 CSR SPA에서 실패하면 **보고하고 멈춘다.** SSR 전환은 이 스킬이 자가 승인할 범위가 아니다. 수정 후 build 통과 필수. 다국어 프로젝트의 문구는 메시지 파일에 키로(하드코딩 금지), 원문은 기본 로케일에만.

## 앱 리스팅 규격

**스토어마다 필드가 다르다.** 예전 표는 Google Play 단일 스키마였는데 판별 신호에는 `ios/`·`fastlane/`이 있어, iOS 앱을 잡으면 존재하지 않는 필드(짧은 설명)를 만들고 있어야 할 필드(부제·키워드·프로모)를 빠뜨렸다.

**App Store** (출처: developer.apple.com/help/app-store-connect · /app-store/product-page · fastlane `deliver` → `metadata/<locale>/`)

| 필드 | 자수 | 필수 | fastlane 파일 |
|---|---|---|---|
| 이름 | **30** (최소 2) | 필수 | `name.txt` |
| 부제 | **30** | 선택 | `subtitle.txt` |
| 프로모 텍스트 | **170** | 선택 — 심사 없이 수시 수정 가능 | `promotional_text.txt` |
| 설명 | 4000 | 필수 | `description.txt` |
| **키워드** | **100자 단일 필드** · 쉼표 구분 · **공백 없이** | 필수 | `keywords.txt` |
| 릴리스 노트 | 4000 | 갱신 시 | `release_notes.txt` |

**Google Play** (출처: support.google.com/googleplay/android-developer/answer/9859152 · fastlane `supply` → `metadata/android/<locale>/`)

| 필드 | 자수 | 필수 | fastlane 파일 |
|---|---|---|---|
| 앱 이름 | **30** | 필수 | `title.txt` |
| 짧은 설명 | **80** | 필수 | `short_description.txt` |
| 전체 설명 | **4000** | 필수 — 첫 3줄에 핵심(접힘 위) | `full_description.txt` |
| 키워드 필드 | **없음** — Play엔 키워드 필드 자체가 없다(설명 텍스트에서 알고리즘이 추출) | — | — |

- **자수는 코드포인트 기준이다.** Play 1차 문서 명시: "Character limits apply to both full-width and half-width characters" — 한글도 한 글자가 1자다(바이트 아님). 계수는 `[...str].length`.
- **키워드 후보(로케일당 10~20개)의 매핑 규칙**: iOS는 **100자 필드에 압축**(후보 20개를 그대로 넣으면 초과로 리젝된다), Play는 필드가 없으므로 **설명문에 자연스럽게 배치**한다. 이 두 줄이 없으면 iOS 리젝이 난다.
- 공통 규칙: 타이틀은 앱명 + 핵심 키워드 1개, 키워드 나열 금지(리젝 사유). 기능은 **앱에 실제 있는 것만**. 키워드 후보는 근거 필수(라우트·기능·메시지 파일에서 도출), 경쟁 앱 브랜드명 금지.

- 로케일별로 **번역이 아니라 현지 검색어 기준으로** 다시 뽑는다(예: 같은 기능도 로케일마다 부르는 말이 다르다). 확신 없는 로케일은 "검수 필요" 강조 표시.
- 과장·최상급("최고의"·"1위") 및 스토어 금지어를 쓰지 않는다.
- 산출물 끝에 검수 포인트 표: 로케일 / 항목 / 이유(어색함 후보·과장 위험·금지어 의심).

## 금지 전술 (요청받아도 수행하지 않는다)

1. **동일 소유 사이트 간 상호 키워드-앵커 링크** — 같은 호스팅·애널리틱스 풋프린트에서 링크 스킴 판정 리스크가 비대칭적으로 크다. 푸터의 자연스러운 운영사 표기만 예외.
2. **무검수 기계번역 로케일 페이지 대량 생성** — 스팸 정책의 명시 과녁이고, 처벌은 도메인 신뢰 전체로 번진다.
3. **데이터 근거 없는 템플릿 대량 페이지**(프로그래매틱) — "이 페이지가 우리 데이터 없이는 못 쓰는 문장을 담는가"를 통과하고, 수요 증거(autocomplete·GSC 노출)가 있는 쿼리일 때만 예외적으로 허용.
4. **llms.txt 생성** — 이건 *역효과*가 아니라 **무효**다(Google 2026-06 문서: "no effect positive or negative", AI 봇의 llms.txt 요청은 전체 방문의 0.1%). 거부 사유는 해로워서가 아니라 **무효인 산출물을 만들어 성과처럼 보고하는 것 자체가 기만이기 때문**이다. 요청 시 이유를 설명하고 대신 §GEO 층 9~11을 처리한다.
   - 각주: 문서 포털(docs 사이트)은 일부 개발 도구가 llms.txt를 명시적으로 읽는 생태계가 있으나, **이 스킬의 대상(서비스 노출)이 아니다.**
5. **키워드 스터핑·숨김 텍스트·리뷰 조작** — 논외.
6. **설치량 없는 신규 앱의 키워드 A/B 실험** — 통계 검정력이 없어 노이즈만 읽는다. 리스팅은 출시 시점 1회 고품질 생성이 맞고, 실험은 설치 볼륨이 생긴 뒤의 일이다.

## 판정의 한계 (보고서 문구 규칙)

- 이 스킬이 만드는 것은 **노출 자격**이다: 인덱스 가능, AI 크롤러 가시, 리스팅 완비. 순위·설치·매출은 콘텐츠·제품·수요가 정하며 스킬이 약속할 수 없다.
- 금지 문구: "상위 노출됩니다", "순위가 오릅니다", "설치가 늘어납니다". 허용 문구: "노출 자격을 갖췄습니다", "차단 요인을 제거했습니다".
- 미검증 영역(AI 인용→설치 전환율, 프로그래매틱 페이지당 기대 노출 등)은 아는 척하지 않는다 — "실측 필요"로 쓴다.

## 자체검증 (보고 직전)

1. [ ] 대상 판정 근거를 보고에 남겼는가
2. [ ] 수정한 프로젝트의 build가 통과하는가
3. [ ] 로컬 SEO 스킬이 있는 레포에서 같은 감사를 두 벌 돌리지 않았는가
4. [ ] 리스팅의 모든 기능 서술이 앱에 실제 존재하는가
5. [ ] 금지 전술을 하나도 수행하지 않았는가
6. [ ] 보고서에 성과 약속 문구가 없는가
