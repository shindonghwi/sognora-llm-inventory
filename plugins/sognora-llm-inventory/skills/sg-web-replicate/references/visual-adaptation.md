# 브랜드·이미지 생성 계약

복제 범위는 레이아웃·정보 구조·반응형·상호작용·모션이다. 원본 브랜드와 시각 자산은 관찰 근거일 뿐 결과물에 넣지 않는다. 모든 최종 시각 자산은 새 가상 브랜드에 맞춰 `imagegen`으로 생성한다.

## 고정 정책

- 사진, 배경, 제품 이미지, 일러스트, 텍스처, 아이콘, 로고, 워드마크, 이미지 내부 문구, 지도, 평면도, 차트, QR, 포스터와 영상용 정지 프레임까지 전부 생성 대상이다.
- 원본 이미지·로고·SVG·영상 프레임을 앱의 public/static 폴더로 복사하거나 런타임 URL로 참조하지 않는다.
- 이미지 내부 문구·지도·평면도·차트·QR·로고를 HTML/CSS/SVG/canvas로 다시 그리지 않는다. 최종 픽셀은 `imagegen` 결과물이어야 한다.
- 자산 수가 많다는 이유로 대표 이미지 몇 장, placeholder, CSS gradient, stock 이미지로 축약하지 않는다. 고유 자산과 필요한 반응형 변형을 전부 처리한다.
- 원본 screenshot/crop은 구도·주제·밀도·분위기 참고 자료로만 제공한다. 원본 보존 편집이 아니라 새 브랜드용 `generate`로 분류한다.

## 1. 이미지 영역과 규격을 먼저 만든다

이미지를 생성하기 전에 실제 페이지의 DOM·레이아웃을 구현하고 `.sognora/replica/spec.md`에 visual slot을 확정한다. 이때 neutral placeholder는 임시 측정용으로만 허용하며 완료물에는 남기지 않는다.

각 slot은 다음을 가진다.

- 전역에서 유일한 `assetId`
- 사용 route·viewport·state와 selector
- 렌더 박스 x/y/w/h, aspect ratio, border radius와 clipping
- source pixel 목표 규격과 responsive variant
- crop 방식, focal point, 투명 배경 여부
- 이미지 내부에 들어갈 문구의 정확한 원문
- 원본에서 관찰한 주제·구도·시점·색감·광원·재질·정보 밀도
- 재사용 관계: 같은 시각 자산인지 별도 구도인지

source pixel 규격은 가장 크게 렌더되는 slot과 계약 DPR을 기준으로 정한다. 같은 이미지가 여러 곳에 쓰이면 가장 큰 규격으로 한 번 생성해 재사용하되, 모바일에서 구도나 내부 문구 배치가 달라지면 별도 variant로 생성한다. 생성 결과의 aspect가 다르면 새 내용을 덧그리지 않고 crop/resize만으로 정확한 파일 규격을 맞춘다.

## 2. 가상 브랜드를 먼저 확정한다

이미지 prompt보다 먼저 브랜드 계약을 만든다.

- 원본과 같은 업종·가격대·언어권·톤을 유지한다.
- 음절 수, 단어 길이와 화면 점유 폭은 비슷하게 맞추되 원본과 구별되는 가상 이름을 만든다.
- 브랜드명, 법인/시행/시공 표기, title·metadata·alt, 도메인·연락처 등 브랜드 고유 문자열을 한 매핑으로 교체한다.
- 로고·심볼·워드마크는 `logo-brand` 자산으로 생성한다. 정확한 새 브랜드명을 `Text (verbatim)`으로 넣고 철자를 검증한다.
- 원본 브랜드명·로고·도메인·상표가 최종 코드, 이미지, metadata에 남으면 실패다.

## 3. 자산별 imagegen 실행

도구는 `imagegen` 하나다. Codex는 내장 imagegen 스킬, Claude Code는 `codex exec --sandbox workspace-write --skip-git-repo-check -`에 프롬프트를 파이프해 같은 imagegen을 부른다. 둘 다 없으면 그 slot은 "미제공"으로 보고한다. 서로 다른 자산이나 variant는 한 호출에 묶지 않고 각각 호출한다. 실패 시 처분은 `contract.json`의 `imagegen.fallback`이 정한다(`none`|`hold`|승인한 대안) — 런마다 다시 승인받지 않는다.

prompt에는 필요한 항목만 구체적으로 넣는다.

```text
Use case: <photorealistic-natural|product-mockup|infographic-diagram|logo-brand|...>
Asset type: <assetId와 실제 slot 역할>
Primary request: <새 브랜드용 시각 자산>
Input images: Image 1: composition/style reference only, not an edit target
Composition/framing: <slot aspect·시점·focal point·crop 안전영역>
Lighting/mood: <관찰값>
Color palette: <관찰값과 새 브랜드 팔레트>
Text (verbatim): "<이미지 내부의 정확한 문구>"
Constraints: <정확한 구조·라벨·여백·투명 배경·금지 요소>
Avoid: <원본 브랜드·원본 로고·추가 문구·watermark>
```

- 이미지 내부 문구는 prompt에 따옴표로 넣고 어려운 이름은 철자 단위로 반복한다. 오탈자·추가 글자·누락이 있으면 HTML overlay로 고치지 말고 imagegen edit 또는 재생성한다.
- 지도·평면도·차트는 방향, 구획, 범례, 라벨과 정보 계층을 prompt에 열거한다. 브랜드·주소·수치는 가상 계약값만 쓴다.
- **QR은 imagegen으로 만들지 않는다.** 이미지 모델은 스캔 가능한 QR을 안정적으로 만들 수 없다(달성 불가 요구를 두면 완료가 영구히 보류된다). 실제 QR 라이브러리(예: `qrcode` npm)로 가상/로컬 목적지를 인코딩해 PNG로 생성하고, 스타일(색·여백)만 slot 계약에 맞춘다. 스캔 확인은 생성 라이브러리의 디코드 테스트로 한다.
- 작은 아이콘과 투명 로고는 렌더 크기보다 충분히 크게 생성한 뒤 downscale하고 alpha·edge를 확인한다.
- 생성 결과는 임시 경로(Codex의 생성 폴더, `codex exec` 작업 디렉터리 등)에 두지 않고 프로젝트 static 경로로 옮겨 실제 코드에 연결하고, `manifest.json` `slots[].file`에 그 경로를 적는다. 기존 파일을 무단 덮어쓰지 않는다.

## 4. 완료 판정

- visual slot 수 = 생성·연결·검증된 asset/variant 수여야 한다.
- 각 파일의 실제 pixel 규격·aspect·alpha와 slot의 렌더 박스·crop이 계약과 맞아야 한다.
- 이미지 내부 문구는 확대 육안 검사로 확인한다(에이전트 판정 — OCR 계기는 없다). QR은 생성 라이브러리의 디코드로 확인한다.
- 원본 asset URL·파일·SHA-256을 최종 앱이 참조하는 건 0건이어야 한다 — `verify.mjs` `residue.asset-url`·`residue.asset-hash`가 `manifest.json` `originAssets`와 대조한다. slot 수=asset 수·파일 규격·alpha는 `asset.slot-mismatch`가 본다.
- 생성 이미지 내부는 원본과 pixel equality 대상으로 보지 않는다. 대신 slot 경계·위치·크기·crop은 브라우저 실측값과 정확히 맞추고, 주제·구도·색감·정보 밀도·문구 정확성을 원본과 나란히 확대해 imagegen QA로 판정한다.
- 승인된 생성 자산은 불가피한 `substituted_assets`가 아니다. stock·placeholder·원본 자산 재사용·미생성 slot만 대체 자산 실패다.
- 생성 결과가 요구를 충족하지 못하면 목표를 구체화해 반복하고 다시 검증한다. 자산 수나 반복 횟수 때문에 누락시키지 않는다. imagegen을 사용할 수 없거나 필수 문구·구조를 끝내 충족하지 못하면 `contract.imagegen.fallback`대로 처리하며, 계약에 없는 대안으로 스스로 우회하지 않는다.
