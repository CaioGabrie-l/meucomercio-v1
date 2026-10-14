
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


# Caminho do arquivo do banco de dados
BASE_DIR = Path(__file__).resolve().parents[2]
DATABASE_URL = f"sqlite:///{BASE_DIR / 'meucomercio.db'}"


# Cria a conexão com o banco
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)


# Prepara as sessões para consultar e salvar dados
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False
)


# Classe base dos modelos do sistema
class Base(DeclarativeBase):
    pass
