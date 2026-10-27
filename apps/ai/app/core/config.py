from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"

    # 학교 LLM(OpenAI 호환). Claude 키를 받기 전까지 퀴즈 · 에이전트는 이 서버를 씁니다(10/21).
    school_llm_base_url: str = ""
    school_llm_api_key: SecretStr = SecretStr("")
    quiz_gen_model: str = "gemma-4-26b"  # 문제 만들기
    quiz_check_model: str = "qwen-27b"  # 만든 문제를 직접 풀어 보는 검사
    llm_call_gap_sec: float = 2.2  # 분당 30회 한도 아래로 유지

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()
