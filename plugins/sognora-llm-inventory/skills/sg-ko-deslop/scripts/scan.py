#!/usr/bin/env python3
"""AI 슬롭 문구 검사기 — 제안서·발표자료·대본·영상 대본·화면 문구·작업 보고·일반 글·유튜브 댓글.

    scan.py <파일·폴더 ...> [--genre 제안서|발표|대본|영상|화면|보고|글|댓글] [--level 보수|기본|적극]
            [--rule P1,P3] [--summary] [--json]
    scan.py gate <고치기 전> <고친 뒤> [--genre ...]

- 규칙 표는 아래 RULES. 설명은 references/rules.md(P·B·C)와 references/patterns.md(G).
- 잡히는 것은 「볼 곳」이지 판정이 아니다. 오탐은 에이전트가 rules.md 「오탐」으로 거른다.
- 종료 코드: 0 = 🔴 없음 · 1 = 🔴 남음 · 2 = 검사하지 못한 파일이 있음(없는 파일·지원하지 않는 형식).
  2를 통과로 읽지 않는다. 판정되지 않은 상태다.
- gate: 고치기 전·뒤를 대조한다. 숫자·단위·ID·버전이 하나라도 달라지거나, 🔴🟡 규칙이
  하나라도 늘면 종료 코드 1(고친 쪽이 틀린 것이다). 댓글은 날짜를 덜어내는 게 처방(C3)이라
  빠지기만 한 숫자는 알리고 넘어간다. 바뀌거나 새로 생긴 숫자는 그대로 실패다.
"""
import argparse
import collections
import json
import os
import re
import subprocess
import sys

GENRES = ('제안서', '발표', '대본', '영상', '화면', '보고', '글', '댓글')
SEV = {'R': '🔴', 'Y': '🟡', 'W': '⚪'}
RANK = {'🔴': 1, '🟡': 2, '⚪': 3}
LEVELS = {'보수': 1, '기본': 2, '적극': 3}
TEXT_EXT = ('.md', '.markdown', '.mdx', '.txt')
SUPPORTED = TEXT_EXT + ('.html', '.htm', '.tsx', '.jsx', '.ts', '.js', '.json', '.pdf', '.srt', '.vtt')
# 받침이 ㄴ인 글자 전부. 관형형 어미(물은·따지는·나온·했던)는 모두 이 받침으로 끝난다
NIEUN_FINAL = ''.join(chr(c) for c in range(0xAC00, 0xD7A4) if (c - 0xAC00) % 28 == 4)

# id, 이름, 정규식, 장르별 심각도, 어디(any|title|body)
# 심각도 글자는 GENRES 순서다: R=🔴 Y=🟡 W=⚪ -=안 봄
#                                                                 제발대영화보글댓
RULES = [
    # ── 사용자 규칙(P): 사용자가 직접 「AI 슬롭」이라고 짚은 것 ──
    ('P1', '조작 안내 말투',
     r'버튼을\s*누르|버튼으로\s*들어|누르면|누르고|눌러\s*(?:주|보|봐|볼)|클릭(?:하면|하고|해)|고르면|선택하면'
     r'|들어가기|들어가서|둘러보기|둘러보|살펴보세요|확인해\s*보세요|해\s*보(?:세요|기)|떠올려\s*보',
     'RRRWY-WW', 'any'),
    ('P2', '숫자 포장·쉬움 과장',
     r'단\s*\d+\s*(?:초|분|번|단계|클릭)|클릭\s*(?:한|몇)\s*번|한\s*번의\s*클릭|한눈에|손쉽게|간편하게|누구나\s*쉽게'
     r'|몇\s*분\s*만에|\d+\s*(?:초|분)\s*(?:만에|안에)\s*[^.\n]{0,15}?(?:봅|보실|볼\s*수|확인|파악|이해|끝|완성|둘러)',
     'RRRYY-WY', 'any'),
    ('P3', '서술문 제목', None, 'RR--Y---', 'title'),
    ('P4', '구어체 카피 동사',
     r'(?:이미|지금|벌써)\s*(?:동작|돌아|작동|구현|씁|됩)\S*니다|돌아갑니다|잡았습니다|재\s*봤습니다|만들어\s*왔습니다'
     r'|해냈습니다|숫자로\s*약속|(?:어|아|해|여)\s*(?:두었|뒀)습니다',
     'RRR-R---', 'any'),
    ('P5', '모호한 약속',
     r'가능합니다|가능하다|가능함|검토하겠|노력하겠|힘쓰겠|최대한|최선을\s*다하',
     'RRR-----', 'any'),
    ('P5b', '약한 약속',
     r'할\s*수\s*있(?:습니다|다|음)|될\s*수\s*있|예정입니다|예정이다|지향합니다|도모',
     'YYY-----', 'any'),
    ('P6', '「1인·혼자」', r'(?<![\d.])1\s*인(?!당|칭|분|용)|혼자|나\s*홀로|단독\s*수행', 'RRR-----', 'any'),
    ('P7', '화면이 자기를 해설', None, '----Y---', 'body'),
    ('P8', '화살표 대응', r'→|➔|->', 'YY--Y---', 'title'),
    ('P9', '개조식 자리의 「~합니다」', None, 'RR----W-', 'body'),
    ('P10', '풀지 않은 업무 용어',
     r'(?:앞|이전|직전)\s*기간\s*대비|증감|(?<![계환])산식|원시\s*(?:DB|데이터)|배치\s*오류율|인수\s*기준|런북'
     r'|적재(?:했|합|한|하|된|되|해)|경계\s*\d+\s*(?:개|건)|산출(?:합니다|했|하고|해)',
     'YYRYWYY-', 'any'),
    # ── 보고(B): 에이전트 작업 보고·채팅 답변에서 사용자가 짚은 것 ──
    ('B1', '성실함 예고',
     r'넘기지\s*않고[^.!?\n]*|직접\s*(?:확인|비교|열어|살펴)\S*(?:게요|겠습니다)|빈틈부터|꼼꼼(?:히|하게)',
     '-----YW-', 'any'),
    ('B2', '자책 고백', r'(?<![가-힣])제\s*(?:설계|판단)?\s*(?:실수|탓|잘못|불찰)|제가\s*(?:놓쳤|잘못|실수)',
     '-----Y--', 'any'),
    ('B3', '예고편 훅', r'이게\s*맞으면[^.!?\n]*|(?:결말|답|정체)이\s*나옵니다', '---W-YWW', 'any'),
    ('B4', '개수 예고',
     r'(?:두|세|네|다섯)\s*가지(?=[가는를도]|\s*(?:있|생|모두|입니다|예요|이다))|(?<![가-힣])(?:둘|셋|넷)(?:입니다|이다|이에요|예요)',
     '-----YW-', 'any'),
    ('B5', '문서식 답변: 제목', r'\S.*', '-----Y--', 'title'),
    ('B5b', '문서식 답변: 굵은 머리말', r'\*\*[^*\n]{1,24}[:：]\*\*|\*\*[^*\n]{1,24}\*\*\s*[:：]', '-----Y--', 'any'),
    # ── 댓글(C): 유튜브 댓글·채널 설명에서 사용자가 짚은 것. 말투(어미)는 일부러 보지 않는다 ──
    # 「물은·따지는·나온 장면이에요」처럼 관형형 뒤만 잡는다. 「이 장면이에요」 「가짜 영상이에요」 「풀영상입니다」 「장면 전체입니다」는
    # 소개가 아니고, 반말 끝 「~장면임」은 감상일 때가 많아 보지 않는다
    ('C1', '소개 문장',
     r'(?<=[' + NIEUN_FINAL + r']\s)(?:장면|영상|클립|쇼츠|내용)(?:이에요|이예요|예요|입니다)(?![가-힣])',
     '-------R', 'any'),
    ('C2', '머리말',
     r'(?:^\s*|[.!?]\s+)(?:배경|용어)(?:은|는|:)(?=\s|$)|(?:배경|용어|맥락)[을를은는]?\s*(?:말씀드리|설명하|설명드리|풀이하|정리하)'
     r'|(?:설명|말씀)\s*드리(?:면(?!서)|자면)|설명하자면',
     '-------R', 'any'),
    # 「~에서」로 문장을 여는 것만 잡는다. 「10월 27일 외통위 국감, ~」 같은 영상 설명 표기는 사용자가 좋은 예로 둔 것이다
    ('C3', '날짜·회의 나열',
     r'(?<!\d)\d{1,2}일[^.!?\n]{0,12}?(?:국정감사|국감|청문회|공청회|간담회|기자회견|토론회|대정부\s*질문|상임위'
     r'|외통위|법사위|국방위|행안위|정무위|기재위|과방위|복지위|환노위|산자위|국토위|문체위|교육위|농해수위|운영위|예결위|정보위'
     r'|[가-힣]*회의|[가-힣]*위원회)에서',
     '-------Y', 'any'),
    ('C4', '안내문 톤',
     r'올립니다|올려\s*드립니다|(?:장면|영상|쇼츠|클립|소식)[을를]?\s*(?:\S+\s+)?올려요|다룹니다|소개합니다|소개해\s*드립니다|전해\s*드립니다'
     r'|보여\s*드립니다|담았습니다|(?:장면|영상|쇼츠|클립|소식|이슈)[을를만들]*\s*모았습니다|정리했습니다|정리합니다|정리해\s*드립니다'
     r'|살펴봅니다|짚어봅니다|짚어\s*드립니다|알아봅니다'
     r'|채널(?:입니다|이에요|이예요)|확인해\s*보세요|끝까지\s*보세요|살펴보세요',
     '-------R', 'any'),
    ('C5', '한 줄이 김', None, '-------Y', 'any'),
    # 「이 말 좋아요 감사합니다」 「구독자」 「국정감사」는 부탁이 아니다. 한 줄에 한 번만 센다
    ('C6', '구독·좋아요 부탁',
     r'(?:구독(?!자|료|권|경제)[\s,·이랑과와도]*(?:좋아요|알림)'
     r'|구독(?!자|료|권|경제)[^.!?\n]{0,25}?(?:부탁|눌러|해\s*주|감사(?:합|하겠|해요|드))'
     r'|좋아요[\s,·이랑과와도]*(?:구독(?!자|료|권|경제)|알림)'
     r'|좋아요[^.!?\n]{0,15}?(?:부탁|눌러|꾹|해\s*주)'
     r'|알림[^.!?\n]{0,15}?(?:부탁|눌러|켜\s*주|해\s*주))[^\n]*',
     '-------R', 'any'),
    # ── 일반 패턴(G): korean-humanizer·Humanize KR 분류를 업무 글에 맞춰 줄임(references/sources.md) ──
    ('G-A2', '「~을 통해」', r'[을를]\s*통(?:해|하여)', 'YYYYYWYY', 'any'),
    ('G-A3', '「~에 있어」', r'에\s*있어(?:서)?(?=[\s,])', 'RRRRRYRY', 'any'),
    ('G-A7', '「가지다」 직역',
     r'(?:의미|중요성|영향력|경쟁력|가치|특징|장점|역할|강점)[을를]\s*(?:가지|갖)', 'RRRRRYRY', 'any'),
    ('G-A8', '이중 피동', r'되어지|되어진|보여지|보여진|여겨지|여겨진|지게\s*됩', 'RRRRRYRY', 'any'),
    ('G-A9', '「~에 의해」', r'에\s*의해', 'YYYYYWYY', 'any'),
    ('G-A19', '겹조사', r'에서의|으로의|(?<![가-힣])로의|에의|으로부터의|로부터의', 'YYYYYWYY', 'any'),
    # 판정 표지 동그라미·네모(🔴🔵 U+1F534-5, 🟠~🟫 U+1F7E0-EB)는 이 무기고의 판정 표기라 세지 않는다
    ('G-C5', '이모지', '[\U0001F300-\U0001F533\U0001F536-\U0001F7DF\U0001F7EC-\U0001FAFF✨✅❌⭐]', 'RRRWRYYY', 'any'),
    ('G-C10', '콜론 부제 제목', r'\S\s*:\s+\S', 'YY--Y-Y-', 'title'),
    ('G-C11', '연결어미 뒤 쉼표', r'[가-힣]+(?:지만|면서|아서|어서|해서|하여|으며|는데|으나|며|고),\s', 'YYWWYWWW', 'any'),
    ('G-C8', '대구·넘어서기', r'(?:이|가|것이)\s*아니라|뿐만\s*아니라|[을를]\s*넘어(?!야)|단순한\s*\S+\s*아닌', 'YYYYYYYW', 'any'),
    ('G-D1', '결산 피벗', r'결론적으로|요약하(?:면|자면)|정리하(?:면|자면)|종합하면|종합해\s*보면|이를\s*통해|이처럼|이와\s*같이',
     'RRRRRRRR', 'any'),
    ('G-D2', '의의 과장', r'시사하는\s*바|주목할\s*만|주목할\s*점|본질적으로|핵심적으로|새로운\s*지평|이정표|한\s*획|패러다임|게임\s*체인저',
     'RRRYRRRY', 'any'),
    ('G-D4', '홍보 어휘',
     r'혁신적|획기적|파격적|압도적|독보적|차별화된|최첨단|극대화|선도적|다채로운|풍부한|진정한|궁극적|중추적|필수적|원스톱'
     r'|원활한|탁월한|강력한|완벽(?:한|하게|히)|스마트한|효율적인|체계적인|효과적인|고도화된|자리매김|발돋움|선사|녹여\s*내|담아내|담아낸|아우르|방증|향연|시너지',
     'YYYYYYYY', 'any'),
    ('G-D6', '결말 공식', r'기대됩니다|지금이야말로|할\s*때입니다|귀추|무한한\s*가능성|밝은\s*미래|첫걸음|앞장서|동반자|든든한',
     'RRRYRRRY', 'any'),
    ('G-D7', '「X에서 Y로」 제목', r'에서\s*\S+?(?:으로|로)(?=$|[\s,.(])', 'YY----Y-', 'title'),
    ('G-I1', '「~인 것이다」', r'(?:인|한|는|된)\s*것(?:입니다|이다)', 'RRRYRYYY', 'any'),
    ('G-I4', '설교·예고', r'하는\s*것이\s*중요|할\s*필요가\s*있|명심해야|살펴보겠습니다|살펴보자|알아보겠습니다|알아보자|들어가기에\s*앞서',
     'YYYYYYYY', 'any'),
    ('G-J2', '줄표', r'[—–]', 'YYYYYYYY', 'any'),
    ('G-K1', '챗봇 잔재', r'물론이죠|좋은\s*질문|도움이\s*되(?:었|셨)으면|도움이\s*되길|궁금한\s*점이\s*있으면|말씀해\s*주세요',
     'RRRRRRRR', 'any'),
    ('G-H1', '문두 접속사', r'(?:^|[.!?]\s+)(?:또한|따라서|아울러|나아가|게다가|더욱이|더불어|즉)[,\s]', 'YYYYYWYY', 'any'),
]
for _r in RULES:
    assert len(_r[3]) == len(GENRES), _r[0]
COMPILED = [(rid, name, re.compile(rx) if rx else None,
             {g: SEV.get(c) for g, c in zip(GENRES, sev)}, where)
            for rid, name, rx, sev, where in RULES]

# 제목에 걸린 🟡⚪는 한 단계 올린다(제목은 읽는 사람이 가장 먼저 본다). 말로 하는 글과 보고의 제목은 그대로
ESCALATE_TITLE = {'제안서', '발표', '화면', '글'}
HANGUL = re.compile(r'[가-힣]')
# 「고,」로 끝나도 연결어미가 아닌 명사
NOUN_GO = ('보고', '참고', '경고', '재고', '광고', '공고', '신고', '최고', '사고', '창고', '원고', '비고', '등고', '잔고', '제고')
TITLE_SENTENCE = re.compile(r'(?:니다|[가-힣]다|어요|아요|해요)[.!]?\s*$')
GREETING = re.compile(r'^\s*(?:감사합니다|고맙습니다)[.!]?\s*$')
# 화면 문구 중 남겨도 되는 것: 끝난 일 알림, 오류·검증 문구
UI_NOTICE = re.compile(r'(?:했|됐|었|았|였|웠|렸|졌)습니다[.]?$|못했|수\s*없|맞지\s*않|해야\s*합니다|있어야|시도해\s*주세요')
QUOTED = re.compile(r'「[^」]*」')
# 개조식 자리: 목록 항목·표 칸·마침표 없는 줄(표지·카드·제목 밑 한 줄·캡션)
LIST_ITEM = re.compile(r'^(?:[-*+•▪]|\d+[.)]|[①-⑳])\s+')
# 메시지 키가 이 이름이면 알림·오류·검증·확인 문구로 본다
UI_KEY = re.compile(r'(?i)confirm|error|invalid|forbidden|denied|fail|wrong|toolong|toolarge|need|required|^errors'
                    r'|missing|unavailable|done|created|updated|deleted|saved|applied|enabled|disabled|changed'
                    r'|rolledback|lock|blocked|rejected')
# 정의: 이 길이를 넘는 「~니다」 문장을 화면 설명문으로 본다. 「저장했습니다」 같은 짧은 알림과 가르는 값이다
P7_EXPLAIN_LEN = 15
# 정의: 이 길이(공백 포함, 링크·해시태그 제외)를 넘는 줄을 한 줄 반응이 아니라 설명으로 본다.
# 사용자 기준 「30자 안팎, 길어도 두 줄」의 두 줄 값이다. 게시 댓글(최장 55자)과 참고 예(최장 35자)는 넘기고, 예전 나쁜 예(62자)는 잡는다
COMMENT_LINE_MAX = 60
# 댓글에서 따옴표 안은 영상 속 사람 말이라 쓴 사람의 문체가 아니다
QUOTED_COMMENT = re.compile(r'「[^」]*」|"[^"]*"|“[^”]*”|\'[^\']*\'|‘[^’]*’')
TIMECODE = re.compile(r'^\s*(?:\d+|WEBVTT.*|\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->.*)\s*$')


def guess_genre(path):
    p = path.replace('\\', '/').lower()
    ext = os.path.splitext(p)[1]
    if ext in TEXT_EXT and re.search(r'댓글|채널\s*설명|channel[_-]?desc', p):
        return '댓글'
    if ext in ('.srt', '.vtt') or re.search(r'영상|유튜브|쇼츠|youtube|shorts|narration|내레이션|자막', p):
        return '영상'
    if ext in ('.tsx', '.jsx', '.ts', '.js') or (ext == '.json' and re.search(r'/(?:messages|locales?|i18n|lang)/', p)):
        return '화면'
    if re.search(r'대본|예상질문|script', p):
        return '대본'
    if re.search(r'발표|deck|slides?', p) and ext in ('.html', '.htm', '.pdf'):
        return '발표'
    if ext == '.pdf' or re.search(r'제안서|proposal|사업계획', p):
        return '제안서'
    return '글'


# ── 글 뽑기: (위치, 글, 제목 여부, 화면 문구 쓰임 — 'notice' 면 알림·오류·확인) ──

def units_md(text):
    fence = False
    for i, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith('```'):
            fence = not fence
            continue
        if fence:
            continue
        for m in re.finditer(r'<!--\s*(?:page|chapter|slide):.*?title=([^|>]+?)\s*(?:\||-->)', line):
            yield i, m.group(1).strip(), True, None
        line = re.sub(r'<!--.*?-->', '', line)
        h = re.match(r'\s*#{1,6}\s+(.*)', line)
        if h:
            yield i, h.group(1).strip(), True, None
        elif line.strip():
            yield i, re.sub(r'<[^>]+>', ' ', line), False, None


def units_subtitle(text):
    for i, line in enumerate(text.splitlines(), 1):
        if line.strip() and not TIMECODE.match(line):
            yield i, re.sub(r'<[^>]+>', ' ', line), False, None


def units_html(text):
    text = re.sub(r'<(script|style)\b.*?</\1>|<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)
    for i, line in enumerate(text.splitlines(), 1):
        for m in re.finditer(r'<h[1-3][^>]*>(.*?)</h[1-3]>', line):
            yield i, re.sub(r'<[^>]+>', ' ', m.group(1)).strip(), True, None
        body = re.sub(r'<h[1-3][^>]*>.*?</h[1-3]>', ' ', line)
        body = re.sub(r'<[^>]+>', ' ', body)
        if HANGUL.search(body):
            yield i, body, False, None


def units_code(text):
    text = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)
    for i, line in enumerate(text.splitlines(), 1):
        line = re.sub(r'(^|\s)//.*', '', line)
        for m in re.finditer(r'"([^"\n]*[가-힣][^"\n]*)"|\'([^\'\n]*[가-힣][^\'\n]*)\'|`([^`\n]*[가-힣][^`\n]*)`|>([^<>{}\n]*[가-힣][^<>{}\n]*)<', line):
            s = next(g for g in m.groups() if g)
            yield i, s.strip(), False, None


def units_json(text):
    lines = text.splitlines()

    def flat(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                yield from flat(v, f'{path}.{k}' if path else k)
        elif isinstance(o, list):
            for k, v in enumerate(o):
                yield from flat(v, f'{path}.{k}')
        elif isinstance(o, str):
            yield path, o

    try:
        data = json.loads(text)
    except ValueError:
        return
    for path, v in flat(data, ''):
        if not HANGUL.search(v):
            continue
        enc = json.dumps(v, ensure_ascii=False)
        i = next((n for n, l in enumerate(lines, 1) if enc in l), 0)
        leaf = path.rsplit('.', 1)[-1].lower()
        yield i, v, leaf in ('title', 'heading', 'h1') or leaf.endswith('title'), 'notice' if UI_KEY.search(path) else None


def units_pdf(path):
    try:
        info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
        n = int(re.search(r'Pages:\s+(\d+)', info).group(1))
    except Exception:
        print('PDF는 pdfinfo·pdftotext 가 있어야 읽는다(macOS: brew install poppler). 판정하지 못했다.', file=sys.stderr)
        raise SystemExit(2)
    for p in range(1, n + 1):
        out = subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), path, '-'], capture_output=True, text=True).stdout
        for i, line in enumerate(out.splitlines(), 1):
            if HANGUL.search(line):
                yield f'p.{p}:{i}', line, False, None


def units(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == '.pdf':
        yield from units_pdf(path)
        return
    with open(path, encoding='utf-8', errors='replace') as f:
        text = f.read()
    if ext in TEXT_EXT:
        yield from units_md(text)
    elif ext in ('.srt', '.vtt'):
        yield from units_subtitle(text)
    elif ext in ('.html', '.htm'):
        yield from units_html(text)
    elif ext in ('.tsx', '.jsx', '.ts', '.js'):
        yield from units_code(text)
    elif ext == '.json':
        yield from units_json(text)


def comment_lines(rows):
    """댓글은 줄마다 본다. JSON 한 값에 여러 줄이 들어 있어도 나눈다."""
    for loc, s, is_title, tag in rows:
        for line in s.splitlines():
            if line.strip():
                yield loc, line, is_title, tag


def scan_file(path, genre):
    hits = []
    rows = comment_lines(units(path)) if genre == '댓글' else units(path)
    quote_rx = QUOTED_COMMENT if genre == '댓글' else QUOTED
    for loc, s, is_title, tag in rows:
        for rid, name, rx, sev, where in COMPILED:
            level = sev.get(genre)
            if not level or (where == 'title' and not is_title) or (where == 'body' and is_title):
                continue
            if rid == 'P3':
                if TITLE_SENTENCE.search(s) and not GREETING.match(s) and not (genre == '화면' and (tag or UI_NOTICE.search(s.strip()))):
                    hits.append((loc, level, rid, name, s, s))
                continue
            if rid == 'P7':
                t = s.strip()
                if tag or UI_NOTICE.search(t):
                    continue
                if (len(t) > P7_EXPLAIN_LEN and re.search(r'니다[.]?$', t)) or re.search(r'[하으]면\s.*니다', t) or '해 주세요' in t:
                    hits.append((loc, level, rid, name, t, t))
                continue
            if rid == 'P9':
                for cell in (s.split('|') if '|' in s else (s,)):
                    t = re.sub(r'^>\s*', '', cell.strip())
                    if GREETING.match(t):
                        continue
                    if re.search(r'니다$', t) or (LIST_ITEM.match(t) and re.search(r'니다[.]$', t)):
                        hits.append((loc, level, rid, name, t, t))
                continue
            if rid == 'C5':
                t = re.sub(r'https?://\S+|#\S+', '', s).strip()
                if HANGUL.search(t) and len(t) > COMMENT_LINE_MAX:
                    hits.append((loc, level, rid, name, t, s))
                continue
            quoted = [m.span() for m in quote_rx.finditer(s)]
            for m in rx.finditer(s):
                # 「」 안은 말을 가리키는 것(「가능합니다」는 쓰지 않는다)이지 쓰는 것이 아니다
                if any(a <= m.start() < b for a, b in quoted):
                    continue
                if rid == 'G-C11' and m.group(0)[:-2].endswith(NOUN_GO):
                    continue
                lv = level
                if is_title and where == 'any' and genre in ESCALATE_TITLE and lv != '🔴':
                    lv = '🔴' if lv == '🟡' else '🟡'
                hits.append((loc, lv, rid, name, m.group(0), s))
    return hits


def snippet(s, frag, width=46):
    s = re.sub(r'\s+', ' ', s).strip()
    k = s.find(frag.strip())
    if len(s) <= width or k < 0:
        return s[:width] + ('…' if len(s) > width else '')
    a = max(0, k - (width - len(frag)) // 2)
    return ('…' if a else '') + s[a:a + width] + ('…' if a + width < len(s) else '')


def walk(paths):
    """(경로, 직접 지정 여부)를 낸다. 폴더는 지원하는 형식만 줍는다."""
    skip = {'node_modules', '.git', '.next', 'dist', 'build', '.sognora', '__pycache__', '.venv', 'venv'}
    for p in paths:
        if os.path.isdir(p):
            for root, dirs, files in os.walk(p):
                dirs[:] = sorted(d for d in dirs if d not in skip)
                for f in sorted(files):
                    if f.lower().endswith(SUPPORTED):
                        yield os.path.join(root, f), False
        else:
            yield p, True


def loc_key(loc):
    return tuple(int(n) for n in re.findall(r'\d+', str(loc)))


def cmd_scan(args):
    max_rank = LEVELS[args.level]
    only = set(args.rule.split(',')) if args.rule else None
    total = collections.Counter()
    by_rule = collections.Counter()
    unscanned = []
    rows = []
    for path, explicit in walk(args.paths):
        if not os.path.isfile(path):
            unscanned.append((path, '없는 파일'))
            continue
        if not path.lower().endswith(SUPPORTED):
            unscanned.append((path, '지원하지 않는 형식'))
            continue
        genre = args.genre or guess_genre(path)
        hits = [h for h in scan_file(path, genre)
                if RANK[h[1]] <= max_rank and (not only or h[2] in only)]
        for h in hits:
            total[h[1]] += 1
            by_rule[(h[2], h[3], h[1])] += 1
        hits.sort(key=lambda h: (RANK[h[1]], loc_key(h[0])))
        rows.append((path, genre, hits))
    if args.json:
        print(json.dumps({
            'files': [{'path': p, 'genre': g, 'guessed': not args.genre,
                       'hits': [{'loc': str(loc), 'sev': lv, 'rule': rid, 'name': name, 'match': frag, 'text': s.strip()}
                                for loc, lv, rid, name, frag, s in hits]} for p, g, hits in rows],
            'unscanned': [{'path': p, 'reason': r} for p, r in unscanned],
            'total': {k: total[k] for k in ('🔴', '🟡', '⚪')},
        }, ensure_ascii=False, indent=1))
    else:
        mark = '' if args.genre else ' (경로로 짐작)'
        for path, genre, hits in rows:
            if not hits:
                continue
            if args.summary:
                c = collections.Counter(h[1] for h in hits)
                print(f'{path}  [{genre}{mark}]  ' + ' '.join(f'{k}{c[k]}' for k in ('🔴', '🟡', '⚪') if c[k]))
                continue
            print(f'\n{path}  [{genre}{mark}]')
            for loc, lv, rid, name, frag, s in hits:
                print(f'  {str(loc):>8}  {lv}  {rid:<6} {name:<14} {snippet(s, frag)}')
        print('\n── 규칙별 ──')
        for (rid, name, lv), n in sorted(by_rule.items(), key=lambda x: (RANK[x[0][2]], -x[1])):
            print(f'  {lv}  {rid:<6} {name:<16} {n}')
        print(f'\n합계  🔴{total["🔴"]}  🟡{total["🟡"]}  ⚪{total["⚪"]}  (검사한 파일 {len(rows)}개)')
        for p, r in unscanned:
            print(f'검사 못 함: {p} ({r})', file=sys.stderr)
    if unscanned or not rows:
        if not rows and not unscanned:
            print('검사할 파일이 없다.', file=sys.stderr)
        return 2
    return 1 if total['🔴'] else 0


# 요구사항 ID(SFR-002) · 버전(v1.2) · 숫자+단위
FACT = re.compile(
    r'[A-Z]{2,5}-\d{2,3}(?:-\d{2})?'
    r'|v\d+(?:\.\d+)*'
    r'|\d[\d,]*(?:\.\d+)?\s*(?:%p|%|건|개|일|분|초|시간|명|곳|쪽|회|종|항목|만|억|천|원|mm|GB|MB|TB|배|단계|년|월|주|차|부|대|줄|자|pt|px)?')


def facts(path):
    text = ''.join(u[1] + '\n' for u in units(path))
    return collections.Counter(re.sub(r'\s+', '', m.group(0)).rstrip(',') for m in FACT.finditer(text))


def fact_values(counter):
    # 보고는 같은 설명을 한 번만 남기는 게 처방이라 겹친 숫자가 줄어도 된다. 값만 대조하고,
    # 단위 표기(「18개」 「18항목」)와 목록 번호·M1 같은 한 자리 맨숫자는 보지 않는다
    out = set()
    for k in counter:
        if re.fullmatch(r'\d', k):
            continue
        out.add(k if re.match(r'[A-Z]{2,5}-|v\d', k) else re.match(r'[\d,.]+', k).group(0).rstrip(',.'))
    return collections.Counter(out)


def rule_counts(path, genre):
    return collections.Counter(h[2] for h in scan_file(path, genre) if RANK[h[1]] <= LEVELS['기본'])


def cmd_gate(args):
    for p in (args.before, args.after):
        if not os.path.isfile(p):
            print(f'없는 파일: {p}', file=sys.stderr)
            return 2
    genre = args.genre or guess_genre(args.after)
    failed = False
    a, b = facts(args.before), facts(args.after)
    if genre == '보고':
        a, b = fact_values(a), fact_values(b)
    lost, added = a - b, b - a
    if genre == '댓글' and lost and not added:
        print('⚠️ 덜어낸 숫자(댓글은 날짜를 덜어낼 수 있다. 사실이 빠지지 않았는지 본다): ' + ', '.join(f'{k}×{v}' for k, v in sorted(lost.items())))
    elif lost or added:
        failed = True
        if lost:
            print('🔴 고친 뒤 없어진 숫자·ID: ' + ', '.join(f'{k}×{v}' for k, v in sorted(lost.items())))
        if added:
            print('🔴 고친 뒤 새로 생긴 숫자·ID: ' + ', '.join(f'{k}×{v}' for k, v in sorted(added.items())))
    else:
        print('✅ 숫자·단위·ID·버전이 모두 같다.')
    rb, ra = rule_counts(args.before, genre), rule_counts(args.after, genre)
    grew = {r: (rb[r], ra[r]) for r in ra if ra[r] > rb[r]}
    if grew:
        failed = True
        print(f'🔴 고친 뒤 늘어난 흔적 [{genre}]: ' + ', '.join(f'{r} {x}→{y}' for r, (x, y) in sorted(grew.items())))
    else:
        print(f'✅ 늘어난 흔적 없음 [{genre}]: 🔴🟡 {sum(rb.values())} → {sum(ra.values())}')
    return 1 if failed else 0


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ('gate', 'facts'):
        ap = argparse.ArgumentParser(prog='scan.py gate')
        ap.add_argument('before')
        ap.add_argument('after')
        ap.add_argument('--genre', choices=GENRES)
        return cmd_gate(ap.parse_args(sys.argv[2:]))
    ap = argparse.ArgumentParser(description='AI 슬롭 문구 검사')
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--genre', choices=GENRES, help='장르(기본: 경로로 짐작)')
    ap.add_argument('--level', default='기본', choices=tuple(LEVELS), help='보수=🔴만 · 기본=🔴🟡 · 적극=⚪까지')
    ap.add_argument('--rule', help='이 규칙만(쉼표로 여럿: P1,P3)')
    ap.add_argument('--summary', action='store_true', help='파일별 개수만')
    ap.add_argument('--json', action='store_true', help='JSON으로')
    return cmd_scan(ap.parse_args())


if __name__ == '__main__':
    sys.exit(main())
