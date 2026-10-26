from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    res = client.get("/internal/v1/health")
    assert res.status_code == 200
    assert res.json() == {"data": {"status": "ok"}}
