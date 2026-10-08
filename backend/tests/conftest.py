"""Isolated SQLite DB per test, seeded with the prototype synthetic dataset.

Seed facts the tests rely on:
- c-dong-da: hospital, allowed_to_supply_others=False (u-hospital belongs here)
- c-huyet-hoc: bank, allowed + contract (u-bank and u-admin belong here)
- c-viet-duc: hospital, allowed, NO contract (leadership confirmation required)
- req-1: c-dong-da, O- PRBC, qty 15, fulfilled 2
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401
from app.database import Base, get_db
from app.main import app
from app.models import BloodUnit, BloodUnitStatus
from app.security import create_access_token
from app.seed import seed_if_empty


@pytest.fixture()
def session_factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = factory()
    seed_if_empty(db)
    db.close()
    yield factory
    engine.dispose()


@pytest.fixture()
def db(session_factory):
    s = session_factory()
    yield s
    s.close()


@pytest.fixture()
def client(session_factory):
    def _get_db():
        s = session_factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _headers(user_id: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


@pytest.fixture()
def admin():
    return _headers("u-admin")


@pytest.fixture()
def bank():
    return _headers("u-bank")


@pytest.fixture()
def hospital():
    return _headers("u-hospital")


@pytest.fixture()
def pick_unit(db):
    """Return id of a ready, unexpired unit matching filters (fresh query each call)."""

    def _pick(center_id: str, blood_type: str = "O-", product_type: str = "PRBC", exclude=()):
        db.expire_all()
        q = (
            db.query(BloodUnit)
            .filter(
                BloodUnit.center_id == center_id,
                BloodUnit.blood_type == blood_type,
                BloodUnit.product_type == product_type,
                BloodUnit.status == BloodUnitStatus.ready,
                BloodUnit.expires_at > datetime.utcnow() + timedelta(hours=1),
            )
            .order_by(BloodUnit.id)
        )
        for u in q.all():
            if u.id not in exclude:
                return u.id
        raise AssertionError(f"no ready unit at {center_id} {blood_type} {product_type}")

    return _pick
