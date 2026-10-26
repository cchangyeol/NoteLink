from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()
