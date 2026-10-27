"""LLM이 만든 문제 초안의 코드 검사. 모델 검사(quality · 검수자)보다 먼저, 호출 없이 돌립니다.

code_check는 탈락 이유 목록과 정답 보기의 위치를 돌려줍니다. 이유가 없어야 다음 검사로 갑니다.
"""

import difflib
import re
from dataclasses import dataclass, field
from typing import Literal, NotRequired, TypedDict

from app.services.quiz.models import CHOICES, Draft, Question
from app.services.quiz.text import norm, same_item, short_answer, terms

NEGATIVE = re.compile(r"아닌|않은|틀린|옳지\s?않|잘못된|거리가 먼")
KO_TYPES = ("정의", "특징", "분류")  # 한국어 용어 과목 유형 (임상병리, 10/22)
_KO = re.compile(r"[가-힣]{2,}")


class Seen(TypedDict):
    """겹침 검사에 쓰는 이미 있는 문제. 저장된 문제는 q가 있고, 이번에 만든 문제는 answer가 있음."""

    all: str  # norm(문제 글 + 제시문)
    passage: str  # norm(제시문)
    answer: NotRequired[str]  # norm(정답)
    q: NotRequired[Question | None]


def seen_question(q: Question) -> Seen:
    return {
        "all": norm(q["prompt"] + (q.get("passage") or "")),
        "passage": norm(q.get("passage")),
        "q": q,
    }


def seen_draft(d: Draft) -> Seen:
    return {
        "all": norm(d["stem"] + d["passage"]),
        "passage": norm(d["passage"]),
        "answer": norm(d["answer"]),
    }


@dataclass
class Target:
    """무엇을 위해 만든 문제인지. 다시 보기는 원래 문제, 맞춤 퀴즈는 'new'."""

    reason: Literal["wrong", "right", "new"]
    answer: str = ""  # 원래 문제의 정답
    concept: str = ""
    used_answers: list[str] = field(default_factory=list)  # 이 세트에서 이미 쓴 정답


def too_close(d: Draft, seen: list[Seen]) -> bool:
    """이미 있는 문제와 문장이나 제시문이 85% 이상 같음."""
    me = norm(d["stem"] + d["passage"])
    mp = norm(d["passage"])
    for s in seen:
        if difflib.SequenceMatcher(None, me, s["all"]).ratio() >= 0.85:
            return True
        if mp and s["passage"] and difflib.SequenceMatcher(None, mp, s["passage"]).ratio() >= 0.85:
            return True
    return False


def reversed_of(d: Draft, seen: list[Seen]) -> bool:
    """이번에 만든 앞 문제를 거꾸로 물음 (미생 시험).

    '무산소성 세균 → 산소 없이 증식한다' 다음에 '산소 없이 증식하는 세균 → 무산소성 세균'.
    저장된 문제(q가 있음)는 보지 않습니다.
    """
    a, p = norm(d["answer"]), norm(d["passage"])
    for s in seen:
        if s.get("q") is not None or not s.get("answer"):
            continue
        sa = s.get("answer", "")
        if a and s["passage"] and difflib.SequenceMatcher(None, a, s["passage"]).ratio() >= 0.8:
            return True
        if p and difflib.SequenceMatcher(None, p, sa).ratio() >= 0.8:
            return True
    return False


def number_value(s: str | None) -> float | None:
    """보기가 말하는 수. 노트에 쓰이는 꼴을 모두 읽음: 350,000 · 3.5×10^5 · 3.5x10^5 · 1.5e3."""
    t = (s or "").replace(",", "").replace(" ", "")
    m = re.search(r"(\d+(?:\.\d+)?)[×xX*]10\^?(-?\d+)", t) or re.search(
        r"(\d+(?:\.\d+)?)e(-?\d+)", t
    )
    if m:
        return round(float(m.group(1)) * 10.0 ** int(m.group(2)), 6)
    m = re.search(r"\d+(?:\.\d+)?", t)
    return round(float(m.group(0)), 6) if m else None


def form(w: str | None) -> Literal["ing", "ed", "base"]:
    w = (w or "").strip().lower()
    return "ing" if w.endswith("ing") else "ed" if w.endswith("ed") else "base"


def form_giveaway(d: Draft) -> bool:
    """정답만 형태가 달라 문법만 보고 풀리는 빈칸 (오늘의 복습 10/23).

    'The staff is ____ the products'에 organizing / clothing / adjust / counter.
    오답 중 둘 이상이 정답과 같은 형태여야 합니다. 영어 한 낱말 보기만 봅니다
    ('String of pearl'은 -ing 형태가 아님).
    """
    opts = [o for o in d["options"] if o != d["answer"]]
    if not all(re.fullmatch(r"[A-Za-z][A-Za-z'\-]*", o.strip()) for o in [*opts, d["answer"]]):
        return False
    return sum(form(o) == form(d["answer"]) for o in opts) < 2


def code_check(
    d: Draft, t: Target, page_text: str, ty: str, seen: list[Seen]
) -> tuple[list[str], int | None]:
    """(탈락 이유, 정답 보기 위치). 이유가 비어 있으면 통과."""
    why: list[str] = []
    opts = d["options"]
    if len(opts) != CHOICES or len({norm(o) for o in opts}) != CHOICES:
        why.append(f"보기 {CHOICES}개가 아니거나 겹침")
    vals = [v for v in (number_value(o) for o in opts) if v is not None]
    if len(vals) != len(set(vals)):  # 350,000 CFU/mL과 3.5×10^5 CFU/mL (미생 시험)
        why.append("값이 같은 숫자 보기")
    hits = [i for i, o in enumerate(opts) if norm(o) == norm(d["answer"])]
    if len(hits) != 1:
        why.append("정답 글이 보기와 안 맞음")
    p = d["passage"].strip()
    if ty == "빈칸" and "____" not in p:
        why.append("빈칸 문장 없음")
    # 요청한 유형이 아니라 모양으로 판단: '어휘' 초안이 빈칸 문장으로 오기도 함
    # ('The rope was ____ to the post'에 fastened와 -ing 낱말 넷, 10/26)
    if "____" in p and form_giveaway(d):
        why.append("형태만 보고 정답이 보임(오답 보기를 정답과 같은 형태로)")
    # 토익 유형만: 한국어 문장의 빈칸은 정상적인 정의 문제 (React Native 강의, 10/25)
    if "____" in p and ty not in KO_TYPES and _KO.search(p):
        why.append("빈칸 문장에 한국어 뜻 노출")
    if ty == "묘사" and not _KO.search(p):
        why.append("장면 설명 없음")
    if ty == "묘사" and re.search(r"[A-Za-z]+(?:\s+[A-Za-z']+){2,}", p):
        why.append("장면 설명에 영어 문장이 섞임")
    if ty == "어휘" and len(p) < 2:
        why.append("물을 뜻 없음")
    if ty == "정의" and len(re.findall(r"[가-힣]", p)) < 10:
        why.append("설명 문장 없음")
    if ty in ("특징", "분류") and not (1 <= len(p) <= 40):
        why.append("물을 용어 없음")
    if ty == "정의" and p and norm(d["answer"]) in norm(p):
        why.append("설명에 정답 용어 노출")
    if NEGATIVE.search(d["stem"]):
        why.append("부정 질문")
    if not _KO.search(d["stem"]):
        why.append("문제 글이 한국어가 아님")
    # 특징 · 분류도: '____는 산소가 없는 환경에서 살아가는 세균'에
    # 정답 '산소가 없는 환경에서 살아간다' (미생, 10/25)
    # 한국어 어미(살아간다 / 살아가는)를 떼고 비교
    a = norm(d["answer"])
    if (
        ty in ("어휘", "빈칸", "묘사", "특징", "분류")
        and p
        and a
        and (a in norm(p) or (len(a) >= 8 and re.search(r"[가-힣]$", a) and a[:-2] in norm(p)))
    ):
        why.append("제시문에 정답 노출")
    # 한국어 규칙 문장은 원래 말을 바꿔 쓰므로 낱말 대조 대신 검수자 검사에 맡김
    if short_answer(d["answer"]) or not _KO.search(d["answer"]):
        ts = terms(d["answer"])
        if ts and sum(norm(x) in norm(page_text) for x in ts) / len(ts) < 0.5:
            why.append("정답이 노트에 없음")
    # 개념 이름에 적힌 낱말은 같은 개념을 묻는 것으로 봄
    # ('divide, separate, arrange의 유의어'에서 organizing 대신 arranging)
    in_concept = any(
        same_item(d["answer"], w) for w in re.findall(r"[A-Za-z][A-Za-z\-']+", t.concept)
    )
    if (
        t.reason == "wrong"
        and short_answer(t.answer)
        and not same_item(d["answer"], t.answer)
        and not in_concept
    ):
        why.append(f"틀린 낱말('{t.answer}')을 다시 묻지 않음")
    if any(same_item(d["answer"], u) for u in t.used_answers):
        why.append("세트 안에서 정답이 겹침")
    if too_close(d, seen):
        why.append("이미 있는 문제와 거의 같음")
    if reversed_of(d, seen):
        why.append("앞 문제를 거꾸로 물음(겹침)")
    return why, (hits[0] if len(hits) == 1 else None)
