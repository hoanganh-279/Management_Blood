from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, SessionLocal, engine, upgrade_sqlite_schema
from app import models  # noqa: F401 — register metadata
from app.routers.api import router as api_router
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    upgrade_sqlite_schema()
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Management Blood DSS API",
    version="2.3.0",
    description=(
        "API DSS điều phối máu BV ↔ ngân hàng máu — hỗ trợ quyết định và theo dõi "
        "giao nhận (TT26-min). Không thay thẩm quyền chuyên môn hay pháp lý."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok", "service": "management-blood-api"}
