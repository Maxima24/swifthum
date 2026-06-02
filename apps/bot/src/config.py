"""Bot configuration loaded from environment / .env via pydantic-settings.

Required at startup: TELEGRAM_BOT_TOKEN, MINIAPP_URL, INTERNAL_API_SECRET.
Missing or empty values trigger a clear ValidationError before the bot connects.
"""
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    telegram_bot_token: str = Field(..., alias="TELEGRAM_BOT_TOKEN", min_length=1)
    redis_url: str = Field("redis://localhost:6379", alias="REDIS_URL")
    miniapp_url: str = Field(..., alias="MINIAPP_URL", min_length=8)
    api_base_url: str = Field("http://localhost:3000", alias="API_BASE_URL")
    internal_api_secret: str = Field(..., alias="INTERNAL_API_SECRET", min_length=16)
    log_level: str = Field("INFO", alias="LOG_LEVEL")


def load() -> Settings:
    """Load + validate settings. Raises pydantic.ValidationError on missing required fields."""
    return Settings()  # type: ignore[call-arg]
