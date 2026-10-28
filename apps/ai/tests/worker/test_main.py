import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.worker import __main__ as entry


def test_worker_refuses_to_start_without_db_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "mongodb_uri", SecretStr(""))
    with pytest.raises(SystemExit, match="MONGODB_URI"):
        entry.main()


def test_worker_with_jobs_refuses_to_start_without_llm_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "mongodb_uri", SecretStr("mongodb://127.0.0.1:27017"))
    monkeypatch.setattr(settings, "school_llm_base_url", "")
    monkeypatch.setitem(entry.HANDLERS, "quiz_generate", lambda inp, report: {})
    with pytest.raises(SystemExit, match="SCHOOL_LLM_BASE_URL"):
        entry.main()
