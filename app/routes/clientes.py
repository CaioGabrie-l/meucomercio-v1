
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, joinedload

from app.database.connection import SessionLocal
from app.database.money import dinheiro
from app.models.cliente import Cliente
from app.models.venda import Venda, ItemVenda
from app.models.pagamento import Pagamento


router = APIRouter(
    prefix="/clientes",
    tags=["Clientes"],
)

ZERO = Decimal("0.00")


def obter_banco():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def limpar_whatsapp(valor: str) -> str:
    return "".join(caractere for caractere in valor if caractere.isdigit())


class ClienteCriacao(BaseModel):
    nome: str = Field(min_length=2, max_length=150)
    whatsapp: str = Field(min_length=8, max_length=25)

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor):
        valor = valor.strip()
        if len(valor) < 2:
            raise ValueError("Informe o nome do cliente.")
        return valor

    @field_validator("whatsapp")
    @classmethod
    def validar_whatsapp(cls, valor):
        numeros = limpar_whatsapp(valor)
        if len(numeros) < 8 or len(numeros) > 15:
            raise ValueError("Informe um WhatsApp válido.")
        return numeros


def resumo_cliente(cliente: Cliente, db: Session):
    vendas = (
        db.query(Venda)
        .filter(Venda.cliente_id == cliente.id)
        .order_by(Venda.data.desc(), Venda.id.desc())
        .all()
    )

    pagamentos = (
        db.query(Pagamento)
        .join(Venda, Pagamento.venda_id == Venda.id)
        .filter(Venda.cliente_id == cliente.id)
        .all()
    )

    recebido_por_venda = {}

    for pagamento in pagamentos:
        recebido_por_venda[pagamento.venda_id] = dinheiro(
            recebido_por_venda.get(pagamento.venda_id, ZERO)
            + dinheiro(pagamento.valor)
        )

    total_comprado = ZERO
    total_pago = ZERO
    total_pendente = ZERO
    historico = []

    for venda in vendas:
        total = dinheiro(venda.valor_total)
        recebido = recebido_por_venda.get(venda.id, ZERO)
        pendente = dinheiro(max(total - recebido, ZERO))

        total_comprado += total
        total_pago += recebido
        total_pendente += pendente

        historico.append({
            "venda_id": venda.id,
            "data": venda.data.isoformat(),
            "valor_total": float(total),
            "valor_recebido": float(recebido),
            "valor_pendente": float(pendente),
            "situacao": (
                "pago"
                if pendente == ZERO
                else "parcial"
                if recebido > ZERO
                else "pendente"
            ),
            "itens": [
                {
                    "produto": item.produto.nome,
                    "quantidade": item.quantidade,
                    "preco_unitario": float(
                        dinheiro(item.preco_unitario)
                    ),
                    "subtotal": float(dinheiro(item.subtotal)),
                }
                for item in venda.itens
            ],
            "pagamentos": [
                {
                    "forma_pagamento": pagamento.forma_pagamento,
                    "valor": float(dinheiro(pagamento.valor)),
                    "data": pagamento.data.isoformat(),
                }
                for pagamento in sorted(
                    pagamentos,
                    key=lambda p: p.data,
                )
                if pagamento.venda_id == venda.id
            ],
        })

    return {
        "id": cliente.id,
        "nome": cliente.nome,
        "whatsapp": cliente.whatsapp,
        "data_cadastro": cliente.data_cadastro.isoformat(),
        "quantidade_vendas": len(vendas),
        "total_comprado": float(dinheiro(total_comprado)),
        "total_pago": float(dinheiro(total_pago)),
        "total_pendente": float(dinheiro(total_pendente)),
        "historico": historico,
    }


@router.post("/")
def cadastrar_cliente(
    dados: ClienteCriacao,
    db: Session = Depends(obter_banco),
):
    whatsapp = limpar_whatsapp(dados.whatsapp)

    cliente_existente = (
        db.query(Cliente)
        .filter(Cliente.whatsapp == whatsapp)
        .first()
    )

    if cliente_existente:
        raise HTTPException(
            status_code=409,
            detail="Já existe um cliente com esse WhatsApp.",
        )

    cliente = Cliente(
        nome=dados.nome,
        whatsapp=whatsapp,
    )

    try:
        db.add(cliente)
        db.commit()
        db.refresh(cliente)

        return {
            "mensagem": "Cliente cadastrado com sucesso!",
            "cliente": {
                "id": cliente.id,
                "nome": cliente.nome,
                "whatsapp": cliente.whatsapp,
                "data_cadastro": cliente.data_cadastro.isoformat(),
            },
        }
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível cadastrar o cliente.",
        )


@router.get("/")
def listar_clientes(
    db: Session = Depends(obter_banco),
):
    clientes = db.query(Cliente).order_by(Cliente.nome.asc()).all()

    return [
        resumo_cliente(cliente, db)
        for cliente in clientes
    ]


@router.get("/{cliente_id}")
def consultar_cliente(
    cliente_id: int,
    db: Session = Depends(obter_banco),
):
    cliente = db.get(Cliente, cliente_id)

    if cliente is None:
        raise HTTPException(
            status_code=404,
            detail="Cliente não encontrado.",
        )

    return resumo_cliente(cliente, db)
