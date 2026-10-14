
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base
from app.database.money import Dinheiro


class Movimentacao(Base):
    __tablename__ = "movimentacoes_financeiras"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    tipo: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    descricao: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    categoria: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    valor: Mapped[Decimal] = mapped_column(
        Dinheiro(),
        nullable=False,
    )

    data: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now,
        nullable=False,
    )
