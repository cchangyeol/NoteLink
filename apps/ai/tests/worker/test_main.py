import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.worker import __main__ as entry


def test_worker_refuses_to_start_without_db_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "mongodb_uri", SecretStr(""))
    with pytest.raises(SystemExit, match="MONGODB_URI"):
        entry.main()
