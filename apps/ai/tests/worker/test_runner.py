import threading
from datetime import UTC, datetime
from typing import Any

import mongomock
import pytest
from pymongo.errors import AutoReconnect

from app.clients.llm import JsonObject, LlmError
from app.worker.jobs import JobStore
from app.worker.runner import Handler, JobInputError, Report, run_forever, run_once

T0 = datetime(2026, 10, 28, 9, 0, tzinfo=UTC)


@pytest.fixture
def col() -> Any:
    c = mongomock.MongoClient(tz_aware=True).db.ai_jobs
    c.insert_one(
        {
            "_id": "j1",
            "type": "quiz_generate",
            "status": "queued",
            "input": {"materialId": "m1", "count": 2},
            "progress": 0,
            "attempts": 0,
            "result": None,
            "error": None,
            "createdAt": T0,
        }
    )
    return c


def store(col: Any) -> JobStore:
    return JobStore(col, "w1", lock_sec=60, max_attempts=3, retry_delay_sec=30, now=lambda: T0)


def run(col: Any, handler: Handler) -> dict[str, Any]:
    assert run_once(store(col), {"quiz_generate": handler})
    doc: dict[str, Any] = col.find_one({"_id": "j1"})
    return doc


def test_handler_gets_input_reports_progress_and_result_is_saved(col: Any) -> None:
    seen: list[JsonObject] = []

    def handler(inp: JsonObject, report: Report) -> JsonObject:
        seen.append(inp)
        report(50, "문제 만드는 중")
        assert col.find_one({"_id": "j1"})["step"] == "문제 만드는 중"
        return {"questions": inp["count"]}

    doc = run(col, handler)
    assert seen == [{"materialId": "m1", "count": 2}]
    assert (doc["status"], doc["result"], doc["progress"]) == ("succeeded", {"questions": 2}, 100)


def test_nothing_to_do_returns_false(col: Any) -> None:
    assert not run_once(store(col), {"explain": lambda inp, report: {}})


def test_llm_error_is_retried_later(col: Any) -> None:
    def handler(inp: JsonObject, report: Report) -> JsonObject:
        raise LlmError("HTTP 503")

    doc = run(col, handler)
    assert (doc["status"], doc["error"]) == ("queued", "AI 응답을 받지 못함(HTTP 503)")


def test_bad_input_fails_without_retry(col: Any) -> None:
    def handler(inp: JsonObject, report: Report) -> JsonObject:
        raise JobInputError("questions 없음")

    doc = run(col, handler)
    assert (doc["status"], doc["error"]) == ("failed", "입력 오류: questions 없음")


def test_input_that_is_not_an_object_fails(col: Any) -> None:
    col.update_one({"_id": "j1"}, {"$set": {"input": None}})
    called: list[bool] = []

    def handler(inp: JsonObject, report: Report) -> JsonObject:
        called.append(True)
        return {}

    doc = run(col, handler)
    assert (doc["status"], doc["error"]) == ("failed", "입력 오류: input이 객체가 아님")
    assert called == []


def test_code_error_fails_without_details_in_the_job(col: Any) -> None:
    def handler(inp: JsonObject, report: Report) -> JsonObject:
        raise KeyError("secret-looking detail")

    doc = run(col, handler)
    assert (doc["status"], doc["error"]) == ("failed", "처리 중 오류")


def test_canceled_while_running_discards_the_result(col: Any) -> None:
    def handler(inp: JsonObject, report: Report) -> JsonObject:
        col.update_one({"_id": "j1"}, {"$set": {"status": "canceled"}})  # 앱에서 취소
        return {"questions": 2}

    doc = run(col, handler)
    assert (doc["status"], doc["result"]) == ("canceled", None)


def test_canceled_job_stops_at_the_next_progress_report(col: Any) -> None:
    steps: list[int] = []

    def handler(inp: JsonObject, report: Report) -> JsonObject:
        for p in (10, 20, 30):
            if p == 20:
                col.update_one({"_id": "j1"}, {"$set": {"status": "canceled"}})
            report(p)
            steps.append(p)
        return {}

    doc = run(col, handler)
    assert steps == [10]
    assert doc["status"] == "canceled"


def test_canceled_while_failing_is_left_canceled(col: Any) -> None:
    def handler(inp: JsonObject, report: Report) -> JsonObject:
        col.update_one({"_id": "j1"}, {"$set": {"status": "canceled"}})
        raise LlmError("HTTP 503")

    doc = run(col, handler)
    assert (doc["status"], doc["error"]) == ("canceled", None)


def test_run_forever_keeps_going_after_db_error_and_stops_on_request(col: Any) -> None:
    stop = threading.Event()
    calls: list[str] = []

    class FlakyStore(JobStore):
        def claim(self, types: Any) -> Any:
            calls.append("claim")
            if len(calls) == 1:
                raise AutoReconnect("연결 끊김")
            stop.set()
            return super().claim(types)

    flaky = FlakyStore(col, "w1", lock_sec=60, max_attempts=3, retry_delay_sec=30, now=lambda: T0)
    run_forever(flaky, {"quiz_generate": lambda inp, report: {"ok": True}}, poll_sec=0, stop=stop)
    assert calls == ["claim", "claim"]
    assert col.find_one({"_id": "j1"})["status"] == "succeeded"
