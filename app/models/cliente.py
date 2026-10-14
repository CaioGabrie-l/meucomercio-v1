
from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    nome: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        index=True,
    )

    whatsapp: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    data_cadastro: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now,
        nullable=False,
    )

    vendas: Mapped[list["Venda"]] = relationship(
        "Venda",
        back_populates="cliente",
    )
