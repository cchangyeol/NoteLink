"""ai_jobs 처리기 실행: python -m app.worker

API 서버(uvicorn)와 따로 띄웁니다. 여러 개를 띄워도 같은 작업을 함께 가져가지 않습니다.
SIGINT · SIGTERM을 받으면 처리 중인 작업을 끝낸 뒤 멈춥니다.
"""

import logging
import os
import signal
import socket
import threading

from pymongo import MongoClient

from app.clients.llm import JsonObject
from app.core.config import settings
from app.worker.handlers import HANDLERS
from app.worker.jobs import JobStore
from app.worker.runner import run_forever

log = logging.getLogger("app.worker")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    uri = settings.mongodb_uri.get_secret_value()
    if not uri:
        raise SystemExit("MONGODB_URI가 비어 있습니다(.env.example 참고)")
    if not HANDLERS:
        log.warning("등록된 작업 종류가 없습니다. 6~8번 PR에서 app/worker/handlers.py에 추가합니다")
    client: MongoClient[JsonObject] = MongoClient(uri, tz_aware=True)
    store = JobStore(
        client[settings.mongodb_db]["ai_jobs"],
        f"{socket.gethostname()}:{os.getpid()}",
        lock_sec=settings.ai_job_lock_sec,
        max_attempts=settings.ai_job_max_attempts,
        retry_delay_sec=settings.ai_job_retry_delay_sec,
    )
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    log.info("ai_jobs 처리기 시작: %s", ", ".join(HANDLERS) or "-")
    try:
        run_forever(store, HANDLERS, poll_sec=settings.ai_job_poll_sec, stop=stop)
    finally:
        client.close()


if __name__ == "__main__":
    main()
