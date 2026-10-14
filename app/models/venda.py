
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base
from app.database.money import Dinheiro


class Venda(Base):
    __tablename__ = "vendas"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    data: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now,
        nullable=False,
    )

    valor_total: Mapped[Decimal] = mapped_column(
        Dinheiro(),
        default=Decimal("0.00"),
        nullable=False,
    )

    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id"),
        nullable=True,
        index=True,
    )

    cliente: Mapped["Cliente | None"] = relationship(
        "Cliente",
        back_populates="vendas",
    )

    itens: Mapped[list["ItemVenda"]] = relationship(
        back_populates="venda",
        cascade="all, delete-orphan",
    )


class ItemVenda(Base):
    __tablename__ = "itens_venda"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    venda_id: Mapped[int] = mapped_column(
        ForeignKey("vendas.id"),
        nullable=False,
    )

    produto_id: Mapped[int] = mapped_column(
        ForeignKey("produtos.id"),
        nullable=False,
    )

    quantidade: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    preco_unitario: Mapped[Decimal] = mapped_column(
        Dinheiro(),
        nullable=False,
    )

    subtotal: Mapped[Decimal] = mapped_column(
        Dinheiro(),
        nullable=False,
    )

    venda: Mapped["Venda"] = relationship(
        back_populates="itens",
    )

    produto: Mapped["Produto"] = relationship(
        "Produto",
    )
