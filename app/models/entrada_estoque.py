from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base
from app.database.money import Dinheiro
from app.models.produto import Produto


class EntradaEstoque(Base):
    __tablename__ = "entradas_estoque"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fornecedor: Mapped[str] = mapped_column(String(150), nullable=False)
    valor_total_pago: Mapped[Decimal] = mapped_column(Dinheiro(), nullable=False)
    data: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now,
        nullable=False,
    )
    movimentacao_id: Mapped[int | None] = mapped_column(
        ForeignKey("movimentacoes_financeiras.id"),
        nullable=True,
    )
    itens: Mapped[list["ItemEntradaEstoque"]] = relationship(
        back_populates="entrada",
        cascade="all, delete-orphan",
    )


class ItemEntradaEstoque(Base):
    __tablename__ = "itens_entrada_estoque"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entrada_id: Mapped[int] = mapped_column(
        ForeignKey("entradas_estoque.id"),
        nullable=False,
    )
    produto_id: Mapped[int] = mapped_column(
        ForeignKey("produtos.id"),
        nullable=False,
    )
    quantidade: Mapped[int] = mapped_column(Integer, nullable=False)

    entrada: Mapped[EntradaEstoque] = relationship(back_populates="itens")
    produto: Mapped["Produto"] = relationship()
