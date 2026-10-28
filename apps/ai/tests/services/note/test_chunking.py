import pytest

from app.services.note.chunking import heading_level, pages_of, split_rows
from tests.services.note.helpers import row, rows


@pytest.mark.parametrize(
    ("text", "level"),
    [
        ("I. 근동충류", 1),
        ("Ⅱ. 편모충류", 1),
        ("Ⅲ 탐촉자", 1),
        ("1. 이질 아메바", 2),
        ("12.장트리코모나스", 2),
        ("1) 영양형", 3),
        ("(1) 위축 atrophy", 3),
        ("① 생리적 위축", 4),
        ("가. 정의", 4),
        ("- 포낭형 : 4핵", None),
        ("· 초음파 : 음파", None),
        ("1.5 mL를 넣는다", None),  # 소수는 제목이 아님
        ("I am a student", None),  # 영어 문장의 I
        ("Vitamin C", None),
        ("", None),
    ],
)
def test_heading_level(text: str, level: int | None) -> None:
    assert heading_level(text) == level


def test_split_follows_numbered_concepts_and_keeps_parent_path() -> None:
    chunks = split_rows(
        rows(
            "I. 근동충류",
            "1. 이질 아메바",
            "- 영양형 : 위족이 있어 운동성 O",
            "2. 대장 아메바",
            "- 포낭형 : 8핵성",
            "3. 요오드아메바",  # 짧아도 따로
            "Ⅱ. 편모충류",
            "1. 람블편모충",
            "- 영양형 : 서양배",
        )
    )
    assert [c["title"] for c in chunks] == [
        "1. 이질 아메바",
        "2. 대장 아메바",
        "3. 요오드아메바",
        "1. 람블편모충",
    ]
    assert [c["path"] for c in chunks] == [["I. 근동충류"]] * 3 + [["Ⅱ. 편모충류"]]
    assert [c["order"] for c in chunks] == [1, 2, 3, 4]
    assert chunks[0]["text"] == "1. 이질 아메바\n- 영양형 : 위족이 있어 운동성 O"
    assert not any(c["needsLlm"] for c in chunks)


def test_long_chunk_is_split_at_the_next_heading_level() -> None:
    body = "가" * 200
    chunks = split_rows(
        rows("6. 자극에 의한 세포의 적응", "(1) 위축", body, "(2) 비대", body, "(3) 과형성", body)
    )
    assert [c["title"] for c in chunks] == [
        "6. 자극에 의한 세포의 적응",
        "(1) 위축",
        "(2) 비대",
        "(3) 과형성",
    ]
    assert chunks[1]["path"] == ["6. 자극에 의한 세포의 적응"]


def test_long_chunk_without_headings_needs_llm() -> None:
    (c,) = split_rows(rows(*["· 글머리표 줄 " + "나" * 60 for _ in range(10)]))
    assert c["needsLlm"] and c["title"] is None


def test_short_untitled_start_joins_the_next_chunk() -> None:
    chunks = split_rows(rows("날짜 10/3", "1. 첫 개념", "내용"))
    assert len(chunks) == 1
    assert chunks[0]["text"].startswith("날짜 10/3\n1. 첫 개념")


def test_lines_follow_text_rows_and_pages_merge_ids() -> None:
    (c,) = split_rows(
        [row("1. 제목", page=1, lid=4), row("내용", page=1, lid=2), row("다음 쪽", page=2, lid=1)]
    )
    assert len(c["lines"]) == len(c["text"].split("\n")) == 3
    assert pages_of(c) == [{"pageNo": 1, "lineIds": [2, 4]}, {"pageNo": 2, "lineIds": [1]}]


def test_uncertain_words_are_counted() -> None:
    (c,) = split_rows(rows("1. 로[?]드아메바", "포[?]형"))
    assert c["uncertainCount"] == 2


def test_empty_rows_give_no_chunks() -> None:
    assert split_rows([]) == []
