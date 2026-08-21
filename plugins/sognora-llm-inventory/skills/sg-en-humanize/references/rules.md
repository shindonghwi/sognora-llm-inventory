# sg-en-humanize — 룰북 (SSOT)

> 영어 AI 문체의 알려진 패턴과 문맥 기반 자연스러움 판정을 분리한다. 패턴 0건은 자연스러움의 증명이 아니다.

## 목차

- [보호 범위](#보호-범위-do-not)
- [알려진 패턴](#알려진-패턴)
- [의미 기반 자연스러움 검토](#의미-기반-자연스러움-검토)
- [윤문 처방](#윤문-처방)
- [기계 검사의 범위](#기계-검사의-범위)
- [자체검증과 등급](#자체검증)

심각도 — 🔴 즉시 제거 / 🟡 문맥을 보고 교체 / ⚪ 적극 모드 후보.

## 보호 범위 (Do-NOT)

제품·회사·기관·인명, 숫자·날짜·통화·단위, URL·이메일, 직접 인용, 법률·계약 문구, 업계 표준 용어, 영국식·미국식 철자 선택은 보존한다.

변경률 30% 초과는 경고, 50% 초과는 롤백한다. `scripts/change_rate_en.py`가 수치·부정·URL·보호어의 결정 가능한 불변식과 변경률을 판정한다. 통과해도 의미가 보존됐다는 뜻은 아니므로 사람이 다시 본다.

## 알려진 패턴

### 1. 추상 연결·빈 흐름

- 🟡 `everything/it all` + `connects/flows/comes together` + `seamlessly/naturally/in one place` — 명사는 있지만 사용자의 행동과 결과가 없다.
- 🟡 `from X to Y`가 범위만 크게 잡고 실제 전환 행동을 말하지 않는다.
- 단어 자체는 금지하지 않는다. `The API connects Salesforce to Stripe.`처럼 주체·대상·행동이 구체적이면 정상이다.

예시:

- 후보: `From site photos to repaint concepts, everything connects seamlessly in one place.`
- 정상: `Upload site photos, compare repaint concepts, and share the selected option.`

두 문장은 사실 관계가 같다고 가정할 수 없다. 정상 예시의 기능이 원문·주변 문맥에 있을 때만 그 동사를 쓴다.

### 2. 마찰 없음의 상투 수식

- 🟡 `seamless/seamlessly/effortless/effortlessly/frictionless` 반복. 무엇이 줄어드는지 쓰지 않으면 빈 주장이다.
- 단건은 제품 맥락에서 성립할 수 있으므로 검출기는 두 번부터 경고한다.

### 3. 추상 변환 동사

- 🟡 `unlock/empower/elevate/transform/reimagine/revolutionize/supercharge` 반복. 목적어가 구체적이어도 결과가 없으면 추상적이다.
- 단어를 기계적으로 치환하지 말고 실제 사용 행동이나 관측 가능한 결과로 바꾼다.

### 4. 결과 없는 광고 공식

- 🟡 `take ... to the next level`, `experience the difference`, `discover what's possible`, `the future of ...`, `possibilities are endless`, `built for the way you work`.
- CTA라면 버튼 뒤에서 실제로 시작되는 행동을 쓴다. 예: 계정 생성이 사실일 때만 `Create an account`.

### 5. 기계적 도입·마무리

- 🔴 `In today's fast-paced world`, `In an ever-evolving landscape`, `In the digital age`, `It is important to note`, `In conclusion`로 시작하는 공식.
- 문서가 정말 결론 절을 요구하는 보고서라면 `In conclusion`은 장르상 허용할 수 있다.

### 6. 반복 골격

- 🟡 `Whether you're X or Y`가 두 번 이상.
- 🟡 `not just X — it's Y`, `more than just X`가 두 번 이상.
- 🟡 같은 길이의 세 항목과 같은 종결 구조가 문단마다 반복. 이 축은 문맥 검토가 판정한다.

### 7. 목적을 숨기는 도움말 문구

- 🟡 `designed to help you`, `helps you achieve`, `provides everything you need` 뒤에 구체 행동·결과가 없다.
- `Provides CSV exports`처럼 결과물이 구체적이면 정상이다.

## 의미 기반 자연스러움 검토

모든 입력에서 패턴 검사 뒤 의미 검토를 한다. 아래 4문항은 랜딩·UI와 제품 과정·효용을 말하는 문장에 적용한다.

1. 누가 행동하는가?
2. 그 주체가 실제로 무엇을 하는가?
3. 그 결과 무엇이 보이거나 바뀌거나 다음에 가능해지는가?
4. `connect/flow/empower/unlock/transform/provide/experience` 또는 `seamless/effortless`가 1~3번의 답을 가리고 있지 않은가?

1~3번의 답이 없거나 4번이 참이면 편집 후보로 둔다. 주변 문맥에도 답이 없으면 기능을 추측하지 말고 `meaning review incomplete`로 남긴다. 에세이·보고서의 일반 설명문에 사용자 행동을 억지로 넣지 않는다.

## 윤문 처방

1. 문맥에 이미 있는 주체·행동·결과를 앞으로 꺼낸다.
2. `seamlessly`, `powerful`, `transformative`를 지웠을 때 정보가 그대로면 삭제한다.
3. 큰 범위(`from X to Y`)는 실제 단계나 전환 조건이 있을 때만 남긴다.
4. 명사화보다 동사를 쓰되 원문의 격식과 voice를 보존한다.
5. 문장 구조 반복은 일부만 풀고, 모든 문장을 짧게 만들지는 않는다.
6. 원문에 없는 수치·기능·성과·고객 행동은 절대 추가하지 않는다.

## 기계 검사의 범위

`detect_en.py`의 exit 0은 등록된 🔴 패턴이 없다는 뜻이다. 🟡 후보가 없거나 자연스러운 영어라는 뜻이 아니다. 기계 검사만 보고할 때는 다음 문구를 쓴다.

> Known-pattern scan passed. Naturalness and contextual fit still require review.

한·영 혼합 카피는 `scripts/detect_bilingual.py`가 이 검출기와 `sg-ko-humanize/scripts/detect_ko.py`를 함께 실행한다. 두 검출기의 정규식 범위만 합친 것이며 의미 검토를 자동화하지 않는다.

## 자체검증

1. [ ] 숫자·날짜·통화·URL·이메일·고유명사·직접 인용이 보존됐다.
2. [ ] 부정·제약·조건·비교 범위가 뒤집히지 않았다.
3. [ ] 원문의 장르·격식·영국식/미국식 철자가 유지됐다.
4. [ ] 새 기능·성과·행동을 지어내지 않았다.
5. [ ] 🔴 패턴이 0이고 남은 🟡의 사유를 설명할 수 있다.
6. [ ] 의미 검토 4문항을 완료했고 `change_rate_en.py`가 채택 가능한 결과다.

## 등급

- A: 🔴0 · 🟡2 이하 · 의미 검토 4/4 · 자체검증 6/6 · 변경률 10~25%
- B: 🔴0 · 🟡4 이하 · 의미 검토 4/4 · 자체검증 5/6 이상
- C: 🔴1~2 또는 의미 검토 미완료 — 재실행·사람 검토
- D: 🔴3 이상 또는 변경률 50% 초과 — 채택 금지
