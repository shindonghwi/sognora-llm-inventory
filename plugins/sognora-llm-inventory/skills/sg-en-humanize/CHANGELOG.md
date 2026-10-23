# sg-en-humanize — CHANGELOG

## 0.1.1 — 2026-10-22 (Claude 말버릇 §8 + 윤문 중 AI 티 유입 게이트)

사용자 지적: 윤문 결과가 마음에 들지 않는다. 한국어 쪽(sg-ko-humanize 1.6.9)과 원인이 같다. 윤문하는 모델이 Claude라서 지운 자리에 자기 말버릇을 다시 넣는데, 영어 검출기에는 그 말버릇이 하나도 없었다. 기존 규칙 8개는 마케팅 상투구(seamless, unlock, take it to the next level)만 봤다.

- **§8 Claude 말버릇 신설 (ENH09~ENH24)**: 챗봇 응대 문구(`You're absolutely right`, `I hope this helps`), 감탄사로 여는 응대, 솔직함 자기 선언(`The honest answer is`), `genuinely`·`honestly` 밀도, Claude 은어(`load-bearing`, `belt-and-suspenders`, `earns its keep`), `quietly reshaping`, 예고·중요도 신호어(`Here's the thing`, `The result?`, `This matters.`), `No X. No Y. Just Z.`, `It's not X, it's Y` 밀도, 엠대시 밀도, 요약 표지(`In short`, `TL;DR`), `worth noting`, `the real X`, `-ing` 꼬리 해설, GPT 시기 상투어(`testament`, `tapestry`, `delve`), 가짜 성찰·발견 프레임(`What separates X is`, `I keep coming back to`, `the tell is`)을 잡는다. 근거는 2026-10 조사다. GitHub 이슈, Hacker News, 위키백과 "Signs of AI writing", Graphite·Arize·Pangram 측정, claudisms.ai 금지 목록, Anthropic 시스템 프롬프트를 봤다.
- **실제 Claude 글로 재현율을 쟀다.** GitHub 이슈, HN 댓글, 커밋 메시지, Graphite 데이터셋에서 모은 46개 중 30개가 하나 이상, 17개가 🔴로 걸린다. 못 잡은 16개는 대부분 압축 은어와 mannered prose라 LLM 판정 목록에 남겼다.
- **사람 영어 코퍼스로 오탐을 쟀다.** 2022년 이전 글로 약 68만 단어다. 위키백과 15개 문서(2021-06 판), Paul Graham 에세이 20편, Wayback으로 받은 2020–2021년 랜딩 48개, 2019년 HN 댓글, 소설 2편, 미국 헌법이다.
  - 결과: 🔴는 엠대시 밀도에서만 나왔다. 『위대한 개츠비』(소설, 장르 밖)와 2021년 랜딩 3개(Superhuman, Trello, Dropbox)다. 이 랜딩들은 Opus 5 실측 밀도와 구분되지 않아 고칠 대상으로 둔다.
  - 사람 글에 나온 형태는 범위를 좁히거나 뺐다. `doing the heavy lifting`(2019 HN), `to be brutally honest`(HN), `full stop`(2021 GitHub 랜딩), `rather than simply`, `why it matters`가 그런 경우다.
  - `It's not X, it's Y`는 사람 대화문 75묶음 중 42묶음에 나와서, 1회 🟡 대신 밀도로 판정한다. 사람 최대치(1천 단어당 1.15회) 이하는 세지 않는다.
- **`change_rate_en.py`에 세 번째 검사 "AI 티 유입"을 추가했다.** 검출기 규칙마다 원문과 윤문본의 매치 수를 비교한다.
  - §8 패턴이나 🔴 규칙이 하나라도 늘면 ABORT, 🟡 전용 규칙이 늘면 WARN이다.
  - 버릇이 옮겨 가는 것도 경고한다. 엠대시가 줄면서 콜론·세미콜론이 늘거나, 불릿과 굵은 머리말 불릿이 늘면 WARN이다. Opus 5.5가 엠대시를 99% 줄인 대신 늘린 것이 이것이다(Graphite, Arize, Pangram).
- **수사적 부정 예외**: `It's not X, it's Y`, `No X. No Y. Just Z.`, `not just X but Y`를 걷어내면 부정 불변식이 ABORT를 냈다. 룰북이 시키는 교정을 게이트가 막는 충돌이었다. 이 형태 안의 `not`·`no`는 부정 개수에서 뺀다. `Refunds are not available → are available`은 계속 막는다.
- **SNS 불만 조사를 반영했다.** HN 댓글 20,387개, Reddit 댓글 12,738개, Threads 562개, Bluesky 3,915개, Trustpilot 휴머나이저 리뷰 1,123개를 읽고, 표현을 AI 티로 지목한 서로 다른 사람 수를 셌다. 아직 검출기에 없던 형태를 넣었다. 모두 사람 코퍼스에서 0회다.
  - `footgun`(68명), `belt and braces`(`belt and suspenders`를 금지하자 바뀐 형태), `You're right to push back`·`I'd gently push back`(33명), `honest read`·`Honest caveats:`·`Let me be honest`
  - `And honestly?`, `Here's the rub`, `Let that sink in`, `The key insight`, `One caveat:`·`One wrinkle:`, `worth knowing`·`worth stating`(`State things plainly`라는 지시에 `It's worth stating plainly:`로 답한 사례), `X is not nothing`, `That's real.`
  - 끝맺음 제안 `Would you like me to`·`Do you want me to`(39명), `That's on me`, `You're not imagining it`, `Great catch`. 대화문에서는 사람도 쓰므로 ENH10에 넣어 `conversational`을 면제했다.
  - 엠대시를 금지하면 단어에 붙인 `--`로 바꾼다는 보고가 있어 ENH18에 넣었다. 사람 코퍼스에서는 대화문(면제 장르)에만 나온다.
  - `seam`(89명), `spine`, `canonical`, `crux`는 글자 그대로 쓰는 분야가 있어 정규식에 넣지 않고 LLM 판정 목록에 두었다. 즉석 조어를 공유 어휘처럼 쓰는 버릇(80명)도 LLM 판정 목록에 추가했다.
- **게이트 경고를 넓혔다.** 엠대시가 줄면서 띄어 쓴 엔대시가 늘어도 SWAP 경고다. 휴머나이저 리뷰가 묘사한 출력을 보고 이모지 유입, 세 단어 이하 단편문 유입, 소문자로 시작하는 문장 유입, 원문 고유명사 소실을 경고로 추가했다. 사람 코퍼스 각 문서를 자기 자신과 비교하면 경고가 없고, 엠대시를 쉼표로 바꾼 윤문도 경고가 없다. 엠대시를 마침표로 기계적으로 바꾸면 단편문 경고가 난다.
- **윤문 중 넣지 않는다 5개 규칙**: 같은 대상은 같은 단어로 쓴다. 버릇을 비슷한 버릇으로 바꾸지 않는다. 1인칭 일화, 슬랭, 일부러 넣은 오타를 더하지 않는다. 완곡을 단정으로 올리지 않는다(`up to 30% faster` → `much faster` 금지). 엠대시를 마침표로만 바꿔 문장을 토막 내지 않는다.
- **회귀 고정**: Claude 말버릇 fixture 29건을 넣었다. 말버릇이 든 글 23건과 반례 6건(글자 그대로 쓴 `load-bearing wall`·`quietly`, 대화문의 `honestly`와 `Great catch, that's on me`, 평범한 `stop being`, 구체적인 카피)이다. 게이트가 유입을 롤백하는지, 말버릇을 지운 교정은 통과시키는지, 엠대시를 세미콜론이나 엔대시로 바꾸면 경고하는지, 휴머나이저식 변형(이모지, 단편문, 소문자 시작, 브랜드명 치환)을 경고하는지도 테스트한다.

## 0.1.0 — 2026-08-21

- 최초 생성. 알려진 영어 AI 문체 패턴과 의미 기반 자연스러움 판정을 분리했다.
- 추상 연결·빈 흐름, 마찰 없음의 상투 수식, 추상 변환 동사, 결과 없는 광고 공식, 기계적 도입·반복 골격을 검출한다.
- 수치·부정·URL·보호어와 30%/50% 변경률을 지키는 `change_rate_en.py`를 추가했다.
- `detect_bilingual.py`로 한국어·영어 검출기를 한 번에 실행한다.
- 양성·정상 대조·한영 혼합·내용 불변·짧은 문구 변경률 회귀 fixture를 고정했다.
