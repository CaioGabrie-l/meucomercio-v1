import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.init_db as inicializador


@pytest.fixture(autouse=True)
def isolar_banco_da_inicializacao(monkeypatch):
    engine_teste = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessao_teste = sessionmaker(
        bind=engine_teste,
        autoflush=False,
        autocommit=False,
    )

    monkeypatch.setattr(inicializador, "engine", engine_teste)
    monkeypatch.setattr(inicializador, "SessionLocal", sessao_teste)

    yield

    engine_teste.dispose()
