from pathlib import Path

from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

_ROOT = Path(__file__).resolve().parents[2]  # Management_Blood/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: int = 8000
    database_url: str = "sqlite:///./management_blood.db"
    jwt_secret: str = "dev_change_me_management_blood_jwt_secret_32chars"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"

    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None

    google_client_id: str | None = None
    google_client_secret: str | None = None

    # Prototype thresholds (not clinical)
    coverage_warn: float = 0.85
    coverage_critical: float = 0.40
    matching_top_k: int = 20
    weight_b: float = 0.35
    weight_d: float = 0.25
    weight_t: float = 0.15
    weight_a: float = 0.15
    weight_r: float = 0.10

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Root .env thắng process env (Cursor/shell có thể giữ GOOGLE_CLIENT_ID cũ).
        return init_settings, dotenv_settings, env_settings, file_secret_settings

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def load_settings() -> Settings:
    """Đọc lại .env (hữu ích khi xoay vòng GOOGLE_CLIENT_ID)."""
    return Settings()


settings = load_settings()
