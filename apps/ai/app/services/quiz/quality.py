"""정답이 둘인 문제 검사.

10/22 다시 보기 · 맞춤 퀴즈의 약 절반이 '오답 보기도 정답이 될 수 있음'이었습니다.

  group_conflict   코드: 정답과 같은 노트 묶음에 적힌 낱말을 오답 보기로 씀
                   (쌓다 = stack / # stock: '=' · '#'로 이어지는 줄은 한 묶음)
  natural_options  LLM: 오답 보기를 넣어도 자연스러운 문장 · 같은 뜻이 되는지.
                   노트가 아니라 일반 실력으로 묻습니다.
                   '노트상 정답인가'로 물으면 결함 2개 중 0개를 잡았습니다.

LLM 호출이 실패하면 그 보기는 표시하지 않고 넘어갑니다(로컬 원본과 같은 동작).
"""

import re
from collections.abc import Callable
from typing import TypedDict

from app.clients.llm import JsonObject, Llm, LlmError
from app.core.config import settings
from app.services.quiz.models import Draft
from app.services.quiz.text import norm, same_item, short_answer

# '='와 '#'는 유의어 묶음을 잇고, '-'는 보통 대비('installation - 설치' / 'instalment - 할부')라
# 묶음에 넣지 않음. 대비 짝은 좋은 문제가 물어야 할 바로 그것
CONT = re.compile(r"^\s*[=#]")
GLOSS = re.compile(r"^\s*([A-Za-z][A-Za-z\s\-']*?)\s+-\s+[가-힣]")
_PHRASE = re.compile(
    r"[A-Za-z][A-Za-z\-]+(?:\s(?:up|out|down|off|over|to|of|in|on|with|for|away))?"
)


class _Item(TypedDict):
    answer: str
    choices: list[str]
    passage: str
    type: str | None


def _has(line: str, word: str) -> bool:
    w = norm(word)
    if not w:
        return False
    if len(w) <= 3:  # 'be'가 'be being V+ed' 안에서 걸리면 안 됨
        pat = re.escape(word.strip())
        return re.search(
            rf"(?<![A-Za-z]){pat}(?![A-Za-z])", line, re.I
        ) is not None and not re.search(rf"{pat}\s+being", line, re.I)
    # 어미만 접음(stacked ~ stack, organizing ~ organiz-e). 앞부분만 같은 것은 아님
    # ('insta'는 노트가 대비로 가르치는 installation과 instalment를 묶어 버림)
    stem = re.sub(r"(ing|ed|es|s)$", "", w)
    return w in norm(line) or (len(stem) >= 4 and stem in norm(line))


def groups(page_text: str) -> list[list[str]]:
    """쪽을 노트 묶음으로 나눔: 한 줄과 그 줄을 잇는 줄들."""
    out: list[list[str]] = []
    cur: list[str] = []
    for line in (ln for ln in page_text.split("\n") if ln.strip()):
        if cur and CONT.match(line):
            cur.append(line)
        else:
            if cur:
                out.append(cur)
            cur = [line]
    if cur:
        out.append(cur)
    return out


def group_words(answer: str, page_text: str) -> list[str]:
    """정답과 같은 노트 묶음에 적힌 짧은 영어 낱말(유의어): 오답 보기로 피할 것."""
    out: list[str] = []
    for g in groups(page_text):
        if any(_has(ln, answer) for ln in g):
            for ln in g:
                for w in _PHRASE.findall(ln):
                    if not same_item(w, answer) and w.lower() not in out and len(w) > 2:
                        out.append(w.lower())
    return out


def contrasts(answer: str, page_text: str) -> list[str]:
    """노트가 정답과 대비 짝으로 적은 낱말: 정답의 '낱말 - 한국어 뜻' 줄 앞뒤 2줄 안의 같은 꼴 줄.

    ('installation - 설치' / 'instalment - 할부'). 노트가 가르치는 짝이라 natural_options가
    버리면 안 됩니다(10/25-26에 버렸음).
    """
    lines = [ln for ln in page_text.split("\n") if ln.strip()]
    at = [
        i for i, ln in enumerate(lines) if (m := GLOSS.match(ln)) and same_item(m.group(1), answer)
    ]
    out = []
    for i in at:
        for ln in lines[max(0, i - 2) : i + 3]:
            m = GLOSS.match(ln)
            if m and not same_item(m.group(1), answer):
                out.append(m.group(1).strip().lower())
    return out


def group_conflict(answer: str, choices: list[str], page_text: str) -> list[str]:
    """정답과 같은 노트 묶음에 있는 오답 보기. 짧은 답만 봅니다."""
    if not short_answer(answer):
        return []
    hits = set()
    for g in groups(page_text):
        if any(_has(ln, answer) for ln in g):
            for o in choices:
                if o != answer and short_answer(o) and any(_has(ln, o) for ln in g):
                    hits.add(o)
    return sorted(hits)


N_SCHEMA: JsonObject = {
    "type": "object",
    "additionalProperties": False,
    "required": ["natural"],
    "properties": {"natural": {"type": "boolean"}},
}
BLANK_SYS = (
    "너는 영어 문장 감수자다. 노트는 보지 않고 일반적인 영어 실력으로만 판단한다. "
    "주어진 영어 문장의 빈칸(____)에 주어진 표현을 넣었을 때, 문법이 맞고 뜻도 자연스러워서 "
    "원어민이 실제로 쓸 만한 문장이 되면 natural=true, 문법이 틀리거나 뜻이 어색하면 false. "
    "JSON으로만 답한다."
)
MEAN_SYS = (
    "너는 영어 어휘 감수자다. 노트는 보지 않고 일반적인 영어 실력으로만 판단한다. "
    "주어진 영어 표현이 주어진 한국어 뜻으로 흔히 쓰이면 natural=true, 아니면 false. "
    "JSON으로만 답한다."
)
_KO = "너는 해당 분야 전공 감수자다. 노트는 보지 않고 일반적인 전공 지식으로만 판단한다. "
_JSON = " JSON으로만 답한다."
KO_SYS = {
    "정의": _KO
    + "주어진 설명이 주어진 용어에도 해당하면(그 용어도 정답이 될 수 있으면) natural=true, "
    + "아니면 false."
    + _JSON,
    "특징": _KO
    + "주어진 문장이 주어진 용어에 대해 사실이면 natural=true, 틀린 내용이면 false."
    + _JSON,
    "분류": _KO
    + "주어진 용어가 주어진 분류(상위 개념)에 속하면 natural=true, 아니면 false."
    + _JSON,
}
_KO_LABELS = {"정의": ("설명", "용어"), "특징": ("용어", "문장"), "분류": ("용어", "분류")}


def _ko_make(qtype: str, passage: str) -> Callable[[str], str]:
    first, second = _KO_LABELS[qtype]
    return lambda o: f"{first}: {passage}\n{second}: {o}"


def _natural(llm: Llm, model: str, system: str, user: str) -> bool | None:
    """True · False, 호출이 실패하면 None."""
    try:
        r = llm.call(model, system, user, N_SCHEMA, "Natural", max_tokens=60)
    except LlmError:
        return None
    v = r.get("natural")
    return v if isinstance(v, bool) else None


def natural_options(llm: Llm, item: _Item, model: str) -> list[str] | None:
    """모델이 자연스럽다고 본 오답 보기. 이 검사를 하지 않는 유형(장면 · 규칙)이면 None."""
    p = item["passage"].strip()
    wrong = [o for o in item["choices"] if o != item["answer"]]
    ty = item["type"]
    if ty in KO_SYS:  # 한국어 용어 과목: 같은 생각을 일반 전공 지식으로
        system, make = KO_SYS[ty], _ko_make(ty, p)
    elif "____" in p or re.search(r"_{3,}", p):
        system, make = BLANK_SYS, (lambda o: f"문장: {p}\n빈칸에 넣을 표현: {o}")
    elif re.search(r"[가-힣]", p) and short_answer(item["answer"]) and ty == "어휘":
        system, make = MEAN_SYS, (lambda o: f"한국어 뜻: {p}\n영어 표현: {o}")
    else:
        return None
    return [o for o in wrong if _natural(llm, model, system, make(o)) is True]


def two_answers(
    llm: Llm,
    d: Draft,
    page_text: str,
    qtype: str | None = None,
    hits: list[str] | None = None,
) -> list[str]:
    """초안에 두 검사를 모두 돌려 탈락 이유를 돌려줍니다. 비어 있으면 통과.

    hits에는 걸린 보기를 모읍니다(다음 시도에서 피할 낱말).
    채점한 61문제(10/22)에서 나쁜 문제 21개 중 14개를 잡고 좋은 문제 40개 중 4개를 버렸습니다
    (검사 모델만). 결함 문제 2개가 다시 보기까지 간 뒤 10/25에 생성 모델을 2차 판정으로 더했습니다.
    """
    item: _Item = {
        "answer": d["answer"],
        "choices": d["options"],
        "passage": d["passage"],
        "type": qtype,
    }
    why = []
    g = group_conflict(d["answer"], d["options"], page_text)
    if g:
        why.append(f"노트에서 정답과 같은 묶음인 보기: {', '.join(g)}")
    pair = contrasts(d["answer"], page_text)
    item["choices"] = [o for o in item["choices"] if o.strip().lower() not in pair]
    n = natural_options(llm, item, settings.quiz_check_model)
    if n == [] and qtype not in KO_SYS:
        # 검사 모델 혼자서는 'extended'를 두 번 놓침. 생성 모델을 2차 판정으로:
        # 빈칸 39문제(10/22 채점) 나쁜 것 10/14 → 13/14, 좋은 것 버림 3/25 → 8/25
        # (좋은 초안을 버려도 재시도 한 번 비용)
        n = natural_options(llm, item, settings.quiz_gen_model)
    if n:
        why.append(f"빈칸에 넣어도 말이 되는 오답 보기: {', '.join(n)}")
    if hits is not None:
        hits.extend(g + (n or []))
    p = item["passage"].strip()
    if not why and qtype not in KO_SYS and "____" in p:
        # 정답 자체도 맞아야 함: 'The construction team will ____ the road'에
        # 정답 'resurfacing' (10/26)
        user = f"문장: {p}\n빈칸에 넣을 표현: {item['answer']}"
        if _natural(llm, settings.quiz_check_model, BLANK_SYS, user) is False:
            why.append("정답을 빈칸에 넣으면 문장이 틀림")
    if qtype in KO_SYS and not why:
        # 용어 과목: 정답도 맞아야 함 — OCR 오류로 노트 자체가 틀릴 수 있음
        # (미생 시험의 '항산성균은 보통 염색으로 쉽게 염색되며')
        user = _ko_make(qtype, p)(item["answer"])
        if _natural(llm, settings.quiz_check_model, KO_SYS[qtype], user) is False:
            why.append("정답이 일반 전공 지식과 맞지 않음(노트 OCR 오류 가능)")
    return why
