from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def upgrade_sqlite_schema(bind=None) -> None:
    """Add columns missing from existing local SQLite tables (create_all never alters).

    PostgreSQL / Supabase uses the SQL files in supabase/migrations instead.
    """
    bind = bind or engine
    if bind.dialect.name != "sqlite":
        return
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())
    with bind.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in present:
                    continue
                col_type = col.type.compile(dialect=bind.dialect)
                default = ""
                if col.default is not None and col.default.is_scalar:
                    val = col.default.arg
                    if isinstance(val, bool):
                        default = f" DEFAULT {int(val)}"
                    elif isinstance(val, (int, float)):
                        default = f" DEFAULT {val}"
                    elif isinstance(val, str):
                        default = " DEFAULT '" + val.replace("'", "''") + "'"
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}{default}'))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
