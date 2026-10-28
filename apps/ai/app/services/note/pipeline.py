"""노트 결과를 한 번에 만드는 함수들.

result = note_result([{"pageNo": 1, "read": ocr_json, "image": img}, ...])
result["pages"]        # ① 쪽별 원본 글자
result["lineResults"]  # ② 쪽별 OCR 줄 결과
"""

from typing import Any, NotRequired, TypedDict

from app.services.note.emphasis import Image, annotate_colors
from app.services.note.handoff import line_results, page_texts
from app.services.note.layout import layout_pages, lines_from_read
from app.services.note.models import Line, PageLayout, PageLines, PageText
from app.services.note.uncertain import UNCERTAIN_MEAN, mark_uncertain


class NotePage(TypedDict):
    pageNo: int  # 업로드 순서
    read: dict[str, Any]  # OCR(Read) 결과. 빈 쪽은 빈 dict
    image: NotRequired[Image]  # OCR에 넣은 것과 같은 크기 (색 · 형광펜 찾기)


class NoteResult(TypedDict):
    pages: list[PageText]  # ①
    lineResults: list[PageLines]  # ②


def page_lines(
    page: NotePage, threshold: float = UNCERTAIN_MEAN, known: frozenset[str] = frozenset()
) -> list[Line]:
    """한 쪽의 줄: OCR → 색 · 형광펜 → [?]. [?]는 강조 위치를 계산하기 전에 넣어야 함."""
    lines = lines_from_read(page["read"], page["pageNo"])
    if "image" in page:
        lines = annotate_colors(page["image"], lines)
    return mark_uncertain(lines, threshold, known)


def page_layouts(
    pages: list[NotePage], threshold: float = UNCERTAIN_MEAN, known: frozenset[str] = frozenset()
) -> list[PageLayout]:
    """쪽 번호 순서의 읽는 순서. 글이 없는 쪽도 남김(쪽 번호를 당기지 않음)."""
    lines = [
        ln
        for p in sorted(pages, key=lambda x: x["pageNo"])
        for ln in page_lines(p, threshold, known)
    ]
    laid = {p["pageNo"]: p for p in layout_pages(lines)}
    return [
        laid.get(n, {"pageNo": n, "twoColumn": False, "rows": []})
        for n in sorted({p["pageNo"] for p in pages})
    ]


def note_result(
    pages: list[NotePage], threshold: float = UNCERTAIN_MEAN, known: frozenset[str] = frozenset()
) -> NoteResult:
    """노트 한 개(여러 쪽)의 ① · ②."""
    layouts = page_layouts(pages, threshold, known)
    return {"pages": page_texts(layouts), "lineResults": line_results(layouts)}
