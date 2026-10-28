from typing import Any

from app.services.note.handoff import line_results, page_texts
from app.services.note.models import PageLayout
from app.services.note.pipeline import NotePage, note_chunks, note_result
from tests.services.note.helpers import row, word


def layout(page: int, *texts: str, two: bool = False) -> PageLayout:
    return {"pageNo": page, "twoColumn": two, "rows": [row(t, page=page) for t in texts]}


def test_page_texts_join_rows_in_reading_order() -> None:
    out = page_texts([layout(1, "1. 제목", "내용"), layout(3)])
    assert out == [{"pageNo": 1, "ocrText": "1. 제목\n내용"}, {"pageNo": 3, "ocrText": ""}]


def test_line_results_shape_for_exam_import() -> None:
    r = row(
        "1 선극",
        words=[
            word("1", 0, confidence=0.99),
            word("선", 2, confidence=0.4),
            word("극", 3, confidence=0.6),
        ],
    )
    (page,) = line_results([{"pageNo": 2, "twoColumn": True, "rows": [r]}])
    assert page["pageNo"] == 2 and page["twoColumn"]
    assert page["marks"] == [] and page["marksChecked"] is False  # '표시 없음'이 아니라 '찾지 않음'
    (ln,) = page["lines"]
    assert set(ln) == {"text", "x0", "x1", "y", "handwritten", "conf"}
    assert ln["y"] == 0.11 and ln["conf"] == 0.5  # '선극' 평균 0.5 (음절 최솟값 0.4가 아님)


def read(*lines: tuple[str, float]) -> dict[str, Any]:
    """줄마다 (글, 신뢰도). 글자 하나가 단어 하나인 작은 Read 결과."""
    content = "\n".join(t for t, _ in lines)
    page_lines, words = [], []
    off = 0
    for i, (text, conf) in enumerate(lines):
        y = 10 + i * 5
        page_lines.append(
            {
                "content": text,
                "polygon": [5, y, 60, y, 60, y + 2, 5, y + 2],
                "spans": [{"offset": off, "length": len(text)}],
            }
        )
        for j, ch in enumerate(text):
            if ch != " ":
                words.append(
                    {
                        "content": ch,
                        "polygon": [5, y, 6, y, 6, y + 2, 5, y + 2],
                        "confidence": conf,
                        "span": {"offset": off + j, "length": 1},
                    }
                )
        off += len(text) + 1
    return {
        "content": content,
        "styles": [{"isHandwritten": True, "spans": [{"offset": 0, "length": len(content)}]}],
        "pages": [
            {"pageNumber": 1, "width": 100, "height": 100, "lines": page_lines, "words": words}
        ],
    }


def test_note_result_uses_upload_page_numbers_not_ocr_page_numbers() -> None:
    pages: list[NotePage] = [
        {"pageNo": 3, "read": read(("2. 대장 아메바", 0.9), ("- 포낭형 : 8핵성", 0.9))},
        {"pageNo": 1, "read": read(("1. 이질 아메바", 0.9), ("- 영양형 ★", 0.9))},
        {"pageNo": 2, "read": {}},  # 빈 쪽: 번호는 남기고 당기지 않음
    ]
    res = note_result(pages)
    assert [p["pageNo"] for p in res["pages"]] == [1, 2, 3]  # OCR pageNumber는 모두 1
    assert res["pages"][1]["ocrText"] == ""
    assert [c["title"] for c in res["chunks"]] == ["1. 이질 아메바", "2. 대장 아메바"]
    assert res["chunks"][1]["lines"][0]["pageNo"] == 3
    assert [p["pageNo"] for p in res["lineResults"]] == [1, 2, 3]


def test_blurry_words_get_marks_in_every_output() -> None:
    res = note_result([{"pageNo": 1, "read": read(("1. 로로드아메바", 0.3), ("포낭형 ★", 0.95))}])
    assert res["pages"][0]["ocrText"] == "1. [?]로로드아메바\n포낭형 ★"
    (c,) = res["chunks"]
    assert c["uncertainCount"] == 1
    (m,) = c["emphasis"]["marks"]
    assert c["text"][m["start"] : m["end"]] == "★"  # [?]를 넣은 뒤의 위치


def test_note_chunks_takes_a_page_number() -> None:
    (c,) = note_chunks(read(("1. 이질 아메바", 0.9), ("내용", 0.9)), page_no=7)
    assert c["lines"][0]["pageNo"] == 7
