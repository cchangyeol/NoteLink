import pytest

from app.clients.llm import LlmError
from app.services.note.chunking import split_rows
from app.services.note.models import Chunk
from app.services.note.tagging import options, parse_items, status, tag_concepts, title_core
from app.services.note.terms import TermDict
from tests.fakes import FakeLlm
from tests.services.note.helpers import row

TERMS = TermDict(["요코가와흡충", "간흡충", "폐흡충", "회충", "요충", "흡충류", "충란", "중간숙주"])


def chunks(*texts: str) -> list[Chunk]:
    return split_rows([row(t, lid=i) for i, t in enumerate(texts, 1)])


@pytest.mark.parametrize(
    ("title", "core"),
    [
        ("3. 로꼬가과 [?]훌륭", "로꼬가과훌륭"),
        ("2. 메닐 편모충 (비병원성)", "메닐편모충"),
        ("Ⅱ. 포자충류", "포자충류"),
        (None, ""),
    ],
)
def test_title_core(title: str | None, core: str) -> None:
    assert title_core(title) == core


def test_options_from_title_and_text() -> None:
    (c,) = chunks("3. 로꼬가과 [?]훌륭", "- 충란: 간흡충과 유사")
    opts = options(c, TERMS)
    assert opts[0] == "요코가와흡충"  # 제목 오타가 심해도 같은 글자 수 후보
    assert {"간흡충", "충란"} <= set(opts)  # 글에 그대로 나온 용어


def test_status_by_syllable_count() -> None:
    (c,) = chunks("3. 로꼬가과 [?]훌륭", "- 충란: 간흡충과 유사")
    assert status(c, "요코가와흡충") == "auto"
    assert status(c, "간흡충") == "review"  # 1차 실험의 '폐흡충' 오태그 같은 경우
    (d,) = chunks("1. 최통", "- 한국 기생률")
    assert status(d, "회충") == "auto"  # 2글자 = 2글자


def test_tag_concepts_one_call_and_untagged_without_options() -> None:
    cs = chunks("1. 최통", "- 내용", "2. 알 수 없는 말", "- 내용")
    llm = FakeLlm({"note_concepts": [{"items": [{"order": 1, "choice": 1}]}]})
    out = tag_concepts(llm, "gemma-4-26b", cs, TERMS)
    assert len(llm.named("note_concepts")) == 1
    assert "[문단 2]" not in llm.calls[0].user  # 후보 없는 문단은 묻지 않음
    assert (out[0]["concept"], out[0]["conceptStatus"]) == ("회충", "auto")
    assert (out[1]["concept"], out[1]["conceptStatus"]) == (None, None)


@pytest.mark.parametrize(
    "items",
    [[{"order": 1, "choice": 0}], [{"order": 1, "choice": 5}], [{"order": 9, "choice": 1}], ["x"]],
)
def test_bad_items_are_ignored(items: list[object]) -> None:
    assert parse_items({"items": items}, {1: ["회충"]}) == {}


def test_missing_items_raise() -> None:
    with pytest.raises(LlmError):
        parse_items({"concepts": []}, {1: ["회충"]})
