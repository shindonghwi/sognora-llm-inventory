# sg-en-humanize — 룰북 (SSOT)

> 영어 AI 문체의 알려진 패턴과 문맥 기반 자연스러움 판정을 분리한다. 패턴 0건은 자연스러움의 증명이 아니다.

## 목차

- [보호 범위](#보호-범위-do-not)
- [알려진 패턴](#알려진-패턴)
- [8. Claude 말버릇과 윤문 중 유입 금지](#8-claude-말버릇)
- [의미 기반 자연스러움 검토](#의미-기반-자연스러움-검토)
- [윤문 처방](#윤문-처방)
- [기계 검사의 범위](#기계-검사의-범위)
- [자체검증과 등급](#자체검증)

심각도 — 🔴 즉시 제거 / 🟡 문맥을 보고 교체 / ⚪ 적극 모드 후보.

## 보호 범위 (Do-NOT)

제품·회사·기관·인명, 숫자·날짜·통화·단위, URL·이메일, 직접 인용, 법률·계약 문구, 업계 표준 용어, 영국식·미국식 철자 선택은 보존한다.

변경률 30% 초과는 경고, 50% 초과는 롤백한다. `scripts/change_rate_en.py`가 수치·부정·URL·보호어의 결정 가능한 불변식과 변경률, 그리고 윤문본에 새로 생긴 AI 티(§8)를 판정한다. 통과해도 의미가 보존됐다는 뜻은 아니므로 사람이 다시 본다.

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
- 🟡 같은 길이의 세 항목과 같은 종결 구조가 문단마다 반복. 이 반복은 문맥 검토가 판정한다.

### 7. 목적을 숨기는 도움말 문구

- 🟡 `designed to help you`, `helps you achieve`, `provides everything you need` 뒤에 구체 행동·결과가 없다.
- `Provides CSV exports`처럼 결과물이 구체적이면 정상이다.

### 8. Claude 말버릇

영어권 사용자들이 "Claude가 쓴 글"이라고 집어낸 표현이다. 출처는 2026-10 조사로, GitHub 이슈(anthropics/claude-code #3382 등), Hacker News 스레드, 위키백과 "Signs of AI writing", Graphite·Arize·Pangram 측정, Anthropic 시스템 프롬프트와 프롬프팅 가이드다. SNS 불만도 직접 읽었다. HN 댓글 20,387개, Reddit 댓글 12,738개, Threads 562개, Bluesky 3,915개에서 표현을 AI 티로 지목한 서로 다른 사람 수를 셌다(`not X, it's Y` 281명, `load-bearing` 262명, 엠대시 217명, `You're absolutely right` 180명, `smoking gun` 105명, `footgun` 68명, `belt and suspenders` 66명 등). 이 스킬로 윤문하는 모델도 Claude라서, 이 절의 표현은 원문에서 지울 대상이면서 윤문본에 새로 생기기 가장 쉬운 표현이다. `change_rate_en.py`는 윤문본에서 이 절의 패턴이 원문보다 하나라도 늘면 롤백한다.

임계는 2022년 이전 사람 영어 코퍼스 실측이 근거다. 위키백과 15개 문서(2021-06 판), Paul Graham 에세이 20편, Wayback으로 받은 2020–2021년 랜딩 페이지 48개, 2019년 HN 댓글 약 23만 단어, 소설 2편, 미국 헌법으로 약 68만 단어다. "코퍼스 0회"는 이 사람 글에서 한 번도 안 나왔다는 뜻이고, 밀도 규칙의 🔴는 사람 문서 최대치의 2배를 넘을 때다.

| 등급 | 판정자 | 표현 | 이렇게 쓴다 |
|---|---|---|---|
| 🔴 | ENH09 | `You're absolutely right`, `Great question`, `I hope this helps`, `Now I have the full picture`, `I see the issue!`, `Found the smoking gun`, `You're right to push back`, `I'd gently push back` (코퍼스 0회) | 지운다. 카피와 문서에 남을 이유가 없는 대화 찌꺼기다 |
| 🟡, 2회 🔴 | ENH10 | 문장 첫머리 `Certainly!`, `Absolutely!`, `Of course!`, `Perfect!`, `I'd be happy to`, 끝맺음 제안 `Would you like me to`, `Do you want me to`, `Let me know if you'd like`, 그리고 `That's on me`, `You're not imagining it`, `Great catch` (`conversational` 면제) | 지우고 바로 답한다. 카피와 문서에는 제안 문장을 남기지 않는다 |
| 🔴 | ENH11 | `The honest answer is`, `honest take`, `my honest read`, `Honest caveat:`, `I'll be direct`, `Let me be honest`, `I want to be fully honest` (코퍼스 0회. Anthropic이 시스템 프롬프트로 금지한 표현) | 솔직하다고 선언하지 않고 내용만 쓴다 |
| 🟡, 밀도 🔴 | ENH12 | `genuinely`, `honestly`, `enormously`, `plainly` (Graphite: Opus 5의 `is genuinely` 224배, `enormously` 87배). 사람 최대치는 1천 단어당 1.59회(트윗 후기를 옮긴 랜딩), 3.2회를 넘으면 🔴 (`conversational` 면제) | 지운다. 강조가 필요하면 근거를 쓴다 |
| 🔴 | ENH13 | 비유로 쓴 `load-bearing`, `belt-and-suspenders`와 금지 뒤 바뀐 형태 `belt and braces`, `footgun`, `earns its keep`, `blast radius`, `smoking gun`, `in a trench coat`, `is doing a lot of work`, `the seam between`, `a dial worth` (코퍼스 0회. `load-bearing wall`은 정상) | 평범한 말로 쓴다. `the main part`, `a second check`, `affected users`, `evidence` |
| 🔴 | ENH14 | `quietly reshaping`, `quietly becoming`, `quietly outperforming` (코퍼스 0회. `closed the door quietly`는 정상) | `quietly`를 지우고 무엇이 언제 바뀌었는지 쓴다 |
| 🟡, 2회 🔴 | ENH15 | `Here's the thing`, `Here's why:`, `Here's what X hides:`, `The kicker?`, `The result?`, 문장으로 쓴 `This matters.`, 제목 `Why this matters`, `matters because`, `and that matters`, `This is where X comes in`, `cannot be overstated`, `And honestly?`, `Here's the rub`, `Let that sink in`, 문장 첫머리 `The key insight`, `One caveat:`, `One wrinkle:`, 비유로 쓴 `a wrinkle` (코퍼스 2회) | 예고하지 않고 그 내용을 바로 쓴다 |
| 🔴 | ENH16 | `No noise. No clutter. Just focus.`, `Not a detail. A decision.` (코퍼스 0회) | 한 문장으로 쓴다. `Relay shows one list.` |
| 🟡, 밀도 🔴 | ENH17 | `It's not X, it's Y`, `Relay isn't X. It's Y.`, `not because X but because Y`, `rather than merely`, `less like X and more like Y`, `is more than an X, it's` (사람 최대치 1천 단어당 1.15회. 그 이하는 세지 않고, 2.3회를 넘고 2회 이상이면 🔴) | Y만 쓴다. 독자가 실제로 X라고 오해할 때만 대조를 남긴다 |
| 🟡, 밀도 🔴 | ENH18 | 엠대시(—, 공백 낀 --, 단어에 붙인 --). 붙인 `--`는 엠대시를 금지했을 때 Claude가 바꿔 쓴다는 보고가 HN에서만 약 10명이다. 사람 비소설 최대치는 1천 단어당 2.65회(Paul Graham 에세이), 5.3회를 넘고 2회 이상이면 🔴 (`conversational` 면제) | 문장을 나누거나 쉼표, 괄호를 쓴다. 콜론·세미콜론으로 하나씩 바꾸지 않는다 |
| 🟡, 2회 🔴 | ENH19 | `Let's dive in`, `Let's break it down`, 문장 첫머리 `In short,`, `In summary,`, `TL;DR:`, `Key takeaways`, `Bottom line:`, `Taken together,`, `Looking ahead,`, `At its core,` | 지운다. 요약이 필요하면 첫 문장에 결론을 쓴다 |
| 🟡, 2회 🔴 | ENH20 | `It's worth noting`, `worth flagging`, `worth calling out`, `worth knowing`, `worth stating`, `worth being precise`, 문장 첫머리 `Notably,`. "평이하게 써라"는 지시에 `It's worth stating plainly:`로 답한 사례가 있다 | 예고 없이 그 사실을 쓴다 |
| 🟡, 2회 🔴 | ENH21 | `the real problem`, `the real question`, `the real win` (사람도 쓴다. 한 글에 두 번이면 버릇) | `the problem`으로 쓰거나 무엇이 문제인지 바로 쓴다 |
| 🟡, 2회 🔴 | ENH22 | 쉼표 뒤 `highlighting`, `underscoring`, `showcasing`, `fostering`, `paving the way` 꼬리 | 꼬리를 지운다. 의미가 있으면 근거를 붙여 따로 쓴다 |
| 🟡, 2회 🔴 | ENH23 | `a testament to`, `tapestry`, `delve`, `plays a crucial role`, `nestled`, `bustling`, `in the heart of`, `ever-evolving` | 구체적으로 쓴다. `plays a crucial role in X` → 무엇을 하는지 |
| 🔴 | ENH24 | 가짜 성찰·발견 프레임: `What separates X is`, `X stops being A and becomes B`, `worth sitting with`, `I keep coming back to`, `Here's where it gets interesting`, `what struck me most`, `the tell is`, `that's the whole game`, `nobody handed you`, `throughline`, `double-click on`, `X is not nothing`, 한 문장으로 쓴 `That's real.` (코퍼스 0회. claudisms.ai 금지 목록, Graphite의 Claude 전용 구) | 발견 과정을 연출하지 않고 관찰한 내용만 쓴다 |

실제 Claude 글 46개(GitHub 이슈, HN 댓글, 커밋 메시지, Graphite 데이터셋에서 모은 것)에 돌리면 30개가 하나 이상, 17개가 🔴로 걸린다. 못 잡은 16개는 대부분 아래 LLM 판정 항목(압축 은어, mannered prose)이거나 티가 없는 평문이다.

2021년 사람 랜딩 48개 중 3개(Superhuman, Trello, Dropbox)는 엠대시 밀도로 🔴가 난다. Opus 5의 실측 밀도(Arize 12.9회, Arena 15.2회)와 구분되지 않는 수준이고, 엠대시가 많은 글은 지금 독자에게 AI 글로 읽힌다. 그래서 사람이 쓴 글이어도 이 스킬에서는 고칠 대상으로 둔다. 소설은 이 스킬의 장르가 아니다(『위대한 개츠비』가 1천 단어당 8.6회).

기계가 세지 못하는 것 (판정자: LLM. 윤문 대상이지만 exit 코드의 근거는 아니다):

- 🔴 추상 사물을 행위자로 쓰는 문장: `the disk will not lie to you`, `the data tells a story`, `the code wants to be simple` → 사람이나 시스템이 실제로 하는 일을 쓴다
- 🔴 압축 은어: 동사로 쓴 `surface`, `land`, `wire`, `gate`, `fan out`, 그리고 `seam`, `substrate`, `wedge`, `spine`, `sidecar`, `plumbing`, `crux`, `canonical`, `the shape of`, `the texture of` → 평범한 동사와 명사로 푼다. SNS에서 `seam` 89명, `spine` 23명, `shape` 22명, `land` 26명이 지목했다. 다만 `seam`(레거시 코드 용어), `canonical`, `spine`은 글자 그대로 쓰는 분야가 있어 정규식으로 세지 않는다
- 🔴 즉석 조어를 공유 어휘처럼 쓰기: 작업 중에 만든 이름(`third activator gate`, `fix-wave`, `spine assets`)을 설명 없이 독자도 아는 말처럼 쓴다. Reddit 한 스레드에서만 75명이 지목했다 → 처음 나올 때 풀어 쓰거나 평범한 말로 바꾼다
- 🟡 mannered prose: 평범한 말 대신 은유와 수사를 쓴 문장. Anthropic 프롬프팅 가이드가 "글쓴이를 보여 주려는 문장"이라고 지목했다
- 🟡 평가 형용사 남발: `dependable`, `deliberate`, `steady`, `thoughtful`, `meaningful`, `robust`, `comprehensive`, `nuanced`
- 🟡 문단마다 반복되는 3항 나열, 길이가 같은 문장 연속, 한 줄씩 끊은 단문
- 🟡 산문을 불릿으로 쪼개기, 굵은 머리말 불릿(`**Speed:** ...`). 엠대시를 줄이면 이것이 대신 늘어난다(Opus 5.5 측정). 게이트가 윤문본에서 늘어난 불릿과 굵은 머리말을 경고한다
- 🟡 이모지를 제목, 불릿, 문장 끝에 붙이기. SNS 52명이 지목했다. 게이트가 윤문본에서 늘어난 이모지를 경고한다

### 윤문하면서 새로 넣지 않는다

조사에서 윤문 도구가 실패한 방식은 거의 하나였다. 지운 버릇 자리에 다른 버릇이 들어온다. Opus 5.5는 엠대시를 99% 줄인 대신 굵은 머리말 불릿과 `in short`를 늘렸고, `It's not X, it's Y`를 막자 `is more than an X, it's a Y`로 옮겨 갔다. 그래서 아래 다섯은 윤문 단계의 규칙이다.

1. 같은 대상은 끝까지 같은 단어로 쓴다. 반복을 피하려고 동의어로 바꾸지 않는다(위키백과가 elegant variation을 AI 티로 꼽는다).
2. 버릇을 지울 때 비슷한 버릇으로 바꾸지 않는다. 엠대시를 콜론·세미콜론으로, `In short`를 `In summary`로, `It's not X, it's Y`를 `rather than merely`로, 산문을 굵은 머리말 불릿으로 바꾸면 같은 버릇이다. 원문 단어로 되돌리거나 문장을 지운다.
3. 사람처럼 보이려고 1인칭 일화, 구어체, 슬랭, 관용구, 일부러 넣은 오타나 문법 오류를 더하지 않는다. 휴머나이저가 새로 심는 대표 패턴이다(DAMAGE, arXiv 2501.03437, 도구 19종 감사). Trustpilot 휴머나이저 리뷰 1,123개 중 출력을 묘사한 154개를 읽으면, 의미 없는 문장 25명, 오탈자·대소문자 파괴 22명, 의미 변경 15명, 유의어 치환 8명(브랜드명까지 다른 말로 바뀐 사례 포함)이다. 게이트는 소문자로 시작하는 문장, 세 단어 이하 단편문, 이모지가 늘거나 원문의 고유명사가 사라지면 경고한다.
4. 완곡 표현을 단정으로 올리지 않는다. `may help`를 `helps`로, `up to 30% faster`를 `much faster`로 바꾸면 뜻이 바뀐다.
5. 엠대시를 마침표로만 바꿔 문장을 토막 내지 않는다. 사용자들이 "sentences become fragmented", "very choppy writing"이라고 지적한 결과다. 두 문장으로 나눌 때는 각 문장이 완결되게 쓴다.

## 의미 기반 자연스러움 검토

모든 입력에서 패턴 검사 뒤 의미 검토를 한다. 아래 4문항은 랜딩·UI와 제품 과정·효용을 말하는 문장에 적용한다.

1. 누가 행동하는가?
2. 그 주체가 실제로 무엇을 하는가?
3. 그 결과 무엇이 보이거나 바뀌거나 다음에 가능해지는가?
4. `connect/flow/empower/unlock/transform/provide/experience` 또는 `seamless/effortless`가 1~3번의 답을 가리고 있지 않은가?

1~3번의 답이 없거나 4번이 참이면 편집 후보로 둔다. 주변 문맥에도 답이 없으면 기능을 추측하지 말고 `meaning review incomplete`로 남긴다. 에세이·보고서의 일반 설명문에 사용자 행동을 억지로 넣지 않는다.

## 윤문 처방

0. Claude 말버릇(§8)부터 지운다. 이 단계에서 지운 표현을 비슷한 표현으로 바꿔 넣지 않는다.
1. 문맥에 이미 있는 주체·행동·결과를 앞으로 꺼낸다.
2. `seamlessly`, `powerful`, `transformative`를 지웠을 때 정보가 그대로면 삭제한다.
3. 큰 범위(`from X to Y`)는 실제 단계나 전환 조건이 있을 때만 남긴다.
4. 명사화보다 동사를 쓰되 원문의 격식과 voice를 보존한다.
5. 문장 구조 반복은 일부만 풀고, 모든 문장을 짧게 만들지는 않는다.
6. 원문에 없는 수치·기능·성과·고객 행동은 절대 추가하지 않는다.

## 기계 검사의 범위

`detect_en.py`의 exit 0은 등록된 🔴 패턴이 없다는 뜻이다. 🟡 후보가 없거나 자연스러운 영어라는 뜻이 아니다. 기계 검사만 보고할 때는 다음 문구를 쓴다.

> Known-pattern scan passed. Naturalness and contextual fit still require review.

한·영 혼합 카피는 `scripts/detect_bilingual.py`(이 스킬 소유)가 이 검출기와 형제 스킬의 `sg-ko-humanize/scripts/detect_ko.py`를 함께 실행한다. 두 검출기의 정규식 범위만 합친 것이며 의미 검토를 자동화하지 않는다. 장르 목록은 `detect_en.py`의 `GENRES`(landing·UI·prose·report·formal·conversational)가 단일 출처이고, 한국어 전용 장르 `법률`·`스펙`은 영어 쪽 `formal`로 매핑된다. 미등록 장르는 exit 3.

## 자체검증

1. [ ] 숫자·날짜·통화·URL·이메일·고유명사·직접 인용이 보존됐다.
2. [ ] 부정·제약·조건·비교 범위가 뒤집히지 않았다.
3. [ ] 원문의 장르·격식·영국식/미국식 철자가 유지됐다.
4. [ ] 새 기능·성과·행동을 지어내지 않았다.
5. [ ] 🔴 패턴이 0이고 남은 🟡의 사유를 설명할 수 있다.
6. [ ] 의미 검토 4문항을 완료했고 `change_rate_en.py`가 채택 가능한 결과다. 이 게이트는 윤문본에 §8 패턴이나 🔴 규칙이 원문보다 늘었는지도 판정한다.

## 등급

- A: 🔴0 · 🟡2 이하 · 의미 검토 4/4 · 자체검증 6/6 · 변경률 10~25%(관행 기준 — sg-ko-humanize의 헌법 코퍼스 실측 12~24%를 준용, 영어 코퍼스 실측 없음)
- B: 🔴0 · 🟡4 이하 · 의미 검토 4/4 · 자체검증 5/6 이상
- C: 🔴1~2 또는 의미 검토 미완료 — 재실행·사람 검토
- D: 🔴3 이상 또는 변경률 50% 초과 — 채택 금지
