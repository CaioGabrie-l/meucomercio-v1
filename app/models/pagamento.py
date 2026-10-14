
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base
from app.database.money import Dinheiro


class Pagamento(Base):
    __tablename__ = "pagamentos"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    venda_id: Mapped[int] = mapped_column(
        ForeignKey("vendas.id"),
        nullable=False,
        index=True,
    )

    forma_pagamento: Mapped[str] = mapped_column(
        String(20),
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

    movimentacao_id: Mapped[int | None] = mapped_column(
        ForeignKey("movimentacoes_financeiras.id"),
        nullable=True,
    )

    venda: Mapped["Venda"] = relationship(
        "Venda",
    )
