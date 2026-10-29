import copy
import re
from datetime import datetime, timedelta
from typing import Any

import pytest

from app.clients.llm import JsonObject, LlmError
from app.services.quiz import review
from tests.fakes import FakeLlm

PAGE = """요청 동사 뒤에는 동사원형을 쓴다
request that he be informed
쌓다 = stack
# stock
fasten - 고정하다"""
DONE = datetime(2026, 10, 29, 6, 30)  # UTC
TODAY = datetime(2026, 10, 29)


def q(qid: str, order: int, answer: str, concept: str, **more: Any) -> JsonObject:
    return {
        "id": qid,
        "order": order,
        "type": "규칙",
        "prompt": f"{concept}에 알맞은 것은?",
        "choices": [answer, "w1", "w2", "w3", "w4"],
        "answer": answer,
        "conceptTags": [concept],
        **more,
    }


def job_input() -> JsonObject:
    """q1(be) · q2(stack)을 틀리고 q3(fasten)을 맞힘. 지난 풀이에서 stack을 한 번 더 틀림."""
    return {
        "attemptId": "a1",
        "quizSetId": "s1",
        "finishedAt": "2026-10-29T06:30:00Z",
        "answers": [
            {"questionId": "q1", "answer": "is", "correct": False},
            {"questionId": "q2", "answer": "stock", "correct": False},
            {"questionId": "q3", "answer": "fasten", "correct": True},
        ],
        "sets": [
            {
                "id": "s1",
                "materialId": "m1",
                "questions": [
                    q("q1", 1, "be", "요청 동사 뒤 동사원형"),
                    q("q2", 2, "stack", "stack의 뜻"),
                    q("q3", 3, "fasten", "fasten의 뜻", srs={}),
                ],
            }
        ],
        "history": [
            {
                "id": "a0",
                "quizSetId": "s1",
                "finishedAt": DONE - timedelta(days=3),
                "answers": [
                    {"questionId": "q2", "correct": False},
                    {"questionId": "q1", "correct": False, "void": True},  # 무효: 세지 않음
                ],
            },
            {  # 30일보다 오래됨
                "id": "old",
                "quizSetId": "s1",
                "finishedAt": DONE - timedelta(days=31),
                "answers": [{"questionId": "q1", "correct": False}],
            },
            {  # 이번 풀이가 같이 와도 한 번만 셈
                "id": "a1",
                "quizSetId": "s1",
                "finishedAt": DONE,
                "answers": [{"questionId": "q1", "correct": False}],
            },
        ],
        "notes": {"m1": [{"pageNo": 1, "ocrText": PAGE}, {"pageNo": 2, "ocrText": "[?] 흐린 줄"}]},
    }


def gen(
    answer: str, options: list[str], passage: str = "상자를 창고에 차곡차곡 두는 장면"
) -> JsonObject:
    return {
        "question": {
            "stem": "알맞은 것을 고르시오.",
            "passage": passage,
            "options": options,
            "answer": answer,
            "explanation": "노트 설명",
            "difficulty": "쉬움",
        }
    }


def ok(letter: str) -> JsonObject:
    return {"answer": letter, "only_one": True, "supported": True}


STACK = gen("stack", ["stack", "fasten", "request", "inform", "order"])
# 제시문이 앞 문제와 같으면 '이미 있는 문제와 거의 같음'으로 떨어짐
BE = gen("be", ["be", "is", "are", "was", "been"], "고객이 정보를 받게 해 달라고 부탁하는 상황")


def happy_llm() -> FakeLlm:
    return FakeLlm(
        {
            # stack이 먼저(지난 풀이까지 2번), 정답 자리는 slot 0 → A, slot 1 → B
            "Review": [STACK, BE],
            "Check": [ok("A"), ok("B")],
            "Line": [{"line": "쌓다 = stack / 노트에 없는 말"}, {"line": "노트에 없는 줄"}],
        }
    )


def run(llm: FakeLlm, inp: JsonObject) -> tuple[JsonObject, list[tuple[int, str | None]]]:
    steps: list[tuple[int, str | None]] = []
    result = review.run(llm, inp, lambda v, step=None: steps.append((v, step)))
    return result, steps


def test_wrong_answers_become_similar_questions() -> None:
    result, steps = run(happy_llm(), job_input())
    assert [a["reason"] for a in result["answers"]] == ["wrong", "wrong", None]
    assert [(w["concept"], w["total"], w["thisAttempt"]) for w in result["weakConcepts"]] == [
        ("stack의 뜻", 2, 1),
        ("요청 동사 뒤 동사원형", 1, 1),
    ]
    assert result["weakConcepts"][0]["attempts"] == 2  # 이번 + 30일 안의 지난 풀이 1번
    assert [t["questionId"] for t in result["targets"]] == ["q2", "q1"]
    assert all(t["made"] and t["tries"] == 1 for t in result["targets"])
    assert (result["targets"][0]["materialId"], result["targets"][0]["pageNo"]) == ("m1", 1)
    new = result["reviewQuestions"]
    assert [(x["order"], x["answer"], x["choices"].index(x["answer"])) for x in new] == [
        (1, "stack", 0),
        (2, "be", 1),
    ]
    assert new[0]["conceptTags"] == ["stack의 뜻"] and new[0]["type"] == "규칙"
    assert all(re.fullmatch(r"[0-9a-f]{24}", x["id"]) for x in new)
    assert result["nextReview"] == "2026-10-30"
    assert [v for v, _ in steps] == [15, 25, 52, 80, 90]


def test_review_dates_hand_over_to_the_new_questions() -> None:
    result, _ = run(happy_llm(), job_input())
    srs = {u["questionId"]: u["srs"] for u in result["srsUpdates"]}
    assert {u["quizSetId"] for u in result["srsUpdates"]} == {"s1"}
    # 맞힌 문제: 처음 푼 문제({}도 처음으로 셈) → 1일 뒤
    assert (srs["q3"]["dueAt"], srs["q3"]["lastResult"], srs["q3"]["state"]) == (
        TODAY + timedelta(days=1),
        "right",
        "active",
    )
    # 틀린 문제는 새 문제로 넘어감: 되돌릴 수 있게 원래 날짜를 dueBefore에
    new = {x["answer"]: x for x in result["reviewQuestions"]}
    assert srs["q2"]["state"] == "moved" and srs["q2"]["movedTo"] == new["stack"]["id"]
    assert (srs["q2"]["dueAt"], srs["q2"]["dueBefore"]) == (None, TODAY + timedelta(days=1))
    fresh = new["stack"]["srs"]
    assert (fresh["state"], fresh["checked"], fresh["reviews"], fresh["dueAt"]) == (
        "active",
        True,
        1,
        TODAY + timedelta(days=1),
    )


def test_note_lines_keep_only_what_is_really_in_the_note() -> None:
    result, _ = run(happy_llm(), job_input())
    found, missing = result["noteLines"]
    assert (found["line"], found["pageNo"], found["kept"]) == ("쌓다 = stack", 1, "1/2")
    assert (missing["line"], missing["raw"]) == (None, "노트에 없는 줄")


def test_failed_note_line_call_is_recorded_not_raised() -> None:
    llm = happy_llm()
    llm.answers["Line"] = [LlmError("HTTP 503"), {"line": ""}]
    result, _ = run(llm, job_input())
    assert [n["raw"] for n in result["noteLines"]] == ["HTTP 503", None]


def test_question_the_model_keeps_copying_is_asked_again_and_handed_over_once() -> None:
    inp = job_input()
    inp["answers"] = inp["answers"][:1]  # q1만 틀림
    inp["history"] = []
    copy_of_q1 = gen("be", ["be", "is", "are", "was", "been"])
    copy_of_q1["question"].update(stem="요청 동사 뒤 동사원형에 알맞은 것은?", passage="")
    llm = FakeLlm({"Review": [copy_of_q1] * 3, "Line": [{"line": "x"}]})
    result, _ = run(llm, inp)
    t = result["targets"][0]
    assert t["made"] and t["reusedFrom"] == "q1"
    assert "이미 있는 문제와 거의 같음" in t["why"]
    srs = result["srsUpdates"][0]["srs"]
    # 두 번 넘기면 dueBefore가 None으로 지워짐(로컬 agent.py)
    assert srs["state"] == "moved" and srs["dueBefore"] == TODAY + timedelta(days=1)
    assert result["reviewQuestions"][0]["prompt"] == "요청 동사 뒤 동사원형에 알맞은 것은?"


def test_reused_question_in_another_set_is_handed_over_there() -> None:
    inp = job_input()
    inp["answers"] = inp["answers"][:1]
    inp["history"] = []
    before = {"step": 1, "streak": 1, "reviews": 2, "state": "active", "checked": True,
              "lastResult": "right", "dueAt": "2026-10-31T00:00:00Z"}  # fmt: skip
    other = q("q7", 1, "be", "요청 동사 뒤 동사원형", srs=before)
    other["prompt"] = "알맞은 것을 고르시오."
    inp["sets"].append({"id": "s2", "materialId": "m1", "questions": [other]})
    near = gen("be", ["be", "is", "are", "was", "been"])
    near["question"]["passage"] = ""
    llm = FakeLlm({"Review": [near] * 3, "Line": [{"line": "x"}]})
    result, _ = run(llm, inp)
    assert result["targets"][0]["reusedFrom"] == "q7"
    moved = {(u["quizSetId"], u["questionId"]): u["srs"] for u in result["srsUpdates"]}
    assert moved[("s2", "q7")]["state"] == "moved"
    assert moved[("s2", "q7")]["dueBefore"] == datetime(2026, 10, 31)


def test_all_right_answers_make_nothing() -> None:
    inp = job_input()
    for a in inp["answers"]:
        a["correct"] = True
    inp["history"] = []
    result, _ = run(FakeLlm(), inp)
    assert result["targets"] == [] and result["reviewQuestions"] == []
    assert result["weakConcepts"] == [] and result["noteLines"] == []


def test_llm_down_for_every_question_raises_so_the_job_is_retried() -> None:
    llm = FakeLlm({"Review": [LlmError("HTTP 503")] * 6})
    with pytest.raises(LlmError):
        run(llm, job_input())


def test_one_question_failing_does_not_fail_the_job() -> None:
    llm = happy_llm()
    llm.answers["Review"] = [LlmError("HTTP 503")] * 3 + [BE]
    llm.answers["Check"] = [ok("B")]
    result, _ = run(llm, job_input())
    assert [t["made"] for t in result["targets"]] == [False, True]
    assert result["targets"][0]["why"] == ["HTTP 503"]
    assert [x["order"] for x in result["reviewQuestions"]] == [2]


# ---------- input 확인 ----------


def broken(change: str) -> JsonObject:
    inp = copy.deepcopy(job_input())
    if change == "no sets":
        inp["sets"] = []
    elif change == "question id":
        del inp["sets"][0]["questions"][0]["id"]
    elif change == "bool order":
        inp["sets"][0]["questions"][0]["order"] = True
    elif change == "unknown answer":
        inp["answers"][0]["questionId"] = "zz"
    elif change == "bad date":
        inp["finishedAt"] = "어제"
    elif change == "srs without step":
        inp["sets"][0]["questions"][0]["srs"] = {"state": "active"}
    elif change == "choices":
        inp["sets"][0]["questions"][0]["choices"] = "be"
    elif change == "page":
        inp["notes"]["m1"][0]["pageNo"] = "첫 쪽"
    elif change == "no notes":
        inp["notes"] = {}
    return inp


@pytest.mark.parametrize(
    "change",
    [
        "no sets",
        "question id",
        "bool order",
        "unknown answer",
        "bad date",
        "srs without step",
        "choices",
        "page",
        "no notes",
    ],
)
def test_bad_input_fails_at_once(change: str) -> None:
    with pytest.raises(review.InputError):
        run(happy_llm(), broken(change))


def test_input_accepts_dates_and_page_numbers_as_written_by_other_tools() -> None:
    inp = job_input()
    inp["finishedAt"] = DONE  # pymongo가 주는 Date
    inp["notes"]["m1"][0]["pageNo"] = "1"  # 녹음 정리 시제품
    result, _ = run(happy_llm(), inp)
    assert result["targets"][0]["pageNo"] == 1


def test_finished_time_counts_in_utc_days() -> None:
    inp = job_input()
    inp["finishedAt"] = "2026-10-30T01:00:00+09:00"  # 서울 10/30 새벽 = UTC 10/29
    result, _ = run(happy_llm(), inp)
    assert result["nextReview"] == "2026-10-30"


def test_new_id_looks_like_an_object_id() -> None:
    a, b = review.new_id(), review.new_id()
    assert re.fullmatch(r"[0-9a-f]{24}", a) and a != b
