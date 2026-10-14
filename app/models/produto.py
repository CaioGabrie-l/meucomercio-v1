
from decimal import Decimal

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base
from app.database.money import Dinheiro


class Produto(Base):
    __tablename__ = "produtos"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    nome: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    fornecedor: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    preco: Mapped[Decimal] = mapped_column(
        Dinheiro(),
        nullable=False,
    )

    estoque: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    ativo: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
