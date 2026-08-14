# 배치 프리셋 — 대상 프로젝트에 규칙이 없을 때 이걸 쓴다

> 우선순위: ① 프로젝트 규칙 문서 → ② 기존 코드 관례 → ③ **이 프리셋** → ④ (스택이 프리셋과 전혀 다를 때만) 사용자 확인.
> 프리셋이 있으므로 새 프로젝트에서 배치를 묻지 않는다. 적용한 프리셋 이름을 contract에 적고 보고에 한 줄 남긴다.

## 프리셋 A — Next.js App Router (기본값)

라우팅과 화면 구현을 **분리**한다. 라우트 파일은 라우팅만 하고 화면은 `features/`에 둔다.

```
src/
├── app/                      # 라우팅만 (App Router)
│   └── [locale]/             #   i18n을 쓰면 로케일 세그먼트
│       ├── layout.tsx
│       ├── page.tsx          #   features의 페이지 컴포넌트를 렌더만 한다
│       └── {route}/page.tsx
├── components/               # 여러 화면이 공유하는 것만
│   ├── ui/                   #   버튼·인풋 등 프리미티브
│   └── layout/               #   header·footer 등 공통 셸
├── core/                     # 화면과 무관한 로직
│   ├── api/                  #   API 클라이언트 (generated는 수정 금지)
│   ├── config/ constants/ routes/ seo/ stores/ utils/
├── features/                 # ★ 화면 구현은 여기
│   └── {page}/
│       ├── {page}-page.tsx   #   페이지 루트 컴포넌트
│       ├── sections/         #   섹션이 2개 이상일 때만 분리
│       └── index.ts          #   재노출
├── infra/                    # fonts · i18n · middleware · providers
└── lib/
messages/{locale}.json        # i18n 문구
public/
├── fonts/                    # 원본 폰트 파일
└── images/                   # 원본 이미지
```

**규칙**
- 페이지 하나 = `features/{page}/` 하나. 라우트 파일에 화면을 통째로 넣지 않는다.
- 섹션 파일은 화면 순서대로 이름 짓는다(`hero-section.tsx`·`pricing-section.tsx`). 섹션이 1개면 `sections/`를 만들지 않는다.
- 한 화면에서만 쓰는 컴포넌트는 `components/`로 올리지 않는다. **두 번째 화면이 쓸 때 올린다.**
- `core/api/generated/` 같은 자동 생성 폴더는 수정 금지.
- 디자인 토큰(색·폰트·간격)은 전역 스타일·설정 파일 한 곳에 정의하고 화면에서 하드코딩하지 않는다.

## 프리셋 B — Next.js Pages Router / 단순 SPA

`features/` 계층을 쓰지 않고 페이지 파일에 화면을 두되, 섹션은 `components/{page}/`로 분리한다.
`public/fonts`·`public/images`·전역 스타일 규칙은 프리셋 A와 같다.

## 프리셋 C — 정적 HTML (빌드 도구 없음)

```
index.html · {route}.html
css/   — reset/normalize · tokens.css · style.css
js/    — 동작 스크립트
fonts/ images/
```
원본이 정적 사이트이고 대상도 빌드 도구가 없을 때만 쓴다. 원본의 CSS·JS 파일 구성을 그대로 가져오는 경우 그 구조를 유지한다.

## 새 프로젝트일 때

빈 디렉토리에서 시작하면 프리셋 A로 폴더를 만들고 시작한다. 프레임워크 초기화가 필요하면 대상 스택의 표준 초기화(`create-next-app` 등)를 쓰고, 그 위에 프리셋 구조를 얹는다.

## i18n을 쓰는 프로젝트

- 문구는 `messages/{locale}.json`에 키로 넣고 컴포넌트는 번역 훅으로 읽는다. **하드코딩 금지.**
- 키 계층은 `common.*`(공통) + `{page}.*`(화면별)로 나눈다. 화면 키는 페이지 폴더명과 맞춘다.
- 원문은 **기본 로케일에만** 넣는다. 다른 로케일은 비워두고 "번역 필요"로 보고한다(기계번역으로 채우지 않는다).
- 로케일 목록·기본 로케일이 설정 파일 한 곳에 있으면 거기만 수정한다.
