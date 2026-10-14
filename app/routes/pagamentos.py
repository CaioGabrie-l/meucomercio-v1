
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.database.money import dinheiro
from app.models.venda import Venda
from app.models.pagamento import Pagamento
from app.models.cliente import Cliente
from app.services.movimentacoes import sincronizar_movimentacao_pagamento


router = APIRouter(
    prefix="/pagamentos",
    tags=["Pagamentos"],
)


CENTAVO = Decimal("0.01")


def obter_banco():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def validar_valor_monetario(valor):
    try:
        numero = Decimal(str(valor))

        if not numero.is_finite():
            raise ValueError

        return numero

    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Informe um valor monetário válido.")


class PagamentoCriacao(BaseModel):
    venda_id: int = Field(gt=0)
    forma_pagamento: str
    valor: Decimal = Field(gt=0, max_digits=10, decimal_places=2)

    @field_validator("valor", mode="before")
    @classmethod
    def validar_valor(cls, valor):
        return validar_valor_monetario(valor)


class PagamentoClienteCriacao(BaseModel):
    forma_pagamento: str
    valor: Decimal = Field(gt=0, max_digits=10, decimal_places=2)

    @field_validator("valor", mode="before")
    @classmethod
    def validar_valor(cls, valor):
        return validar_valor_monetario(valor)


FORMAS_PAGAMENTO = {
    "dinheiro",
    "pix",
    "cartao",
}


def obter_pagamentos_venda(venda_id: int, db: Session):
    return (
        db.query(Pagamento)
        .filter(Pagamento.venda_id == venda_id)
        .order_by(Pagamento.id.asc())
        .all()
    )


def calcular_resumo(venda: Venda, pagamentos: list[Pagamento]):
    total_pago = dinheiro(
        sum(
            (dinheiro(pagamento.valor) for pagamento in pagamentos),
            Decimal("0.00"),
        )
    )

    valor_pendente = dinheiro(
        max(
            dinheiro(venda.valor_total) - total_pago,
            Decimal("0.00"),
        )
    )

    if valor_pendente == 0:
        situacao = "pago"
    elif total_pago > 0:
        situacao = "parcial"
    else:
        situacao = "pendente"

    return {
        "venda_id": venda.id,
        "valor_total": float(dinheiro(venda.valor_total)),
        "valor_recebido": float(total_pago),
        "valor_pendente": float(valor_pendente),
        "situacao": situacao,
        "pagamentos": [
            {
                "id": pagamento.id,
                "forma_pagamento": pagamento.forma_pagamento,
                "valor": float(dinheiro(pagamento.valor)),
                "data": pagamento.data.isoformat(),
            }
            for pagamento in pagamentos
        ],
    }


def resumo_pagamento(venda: Venda, db: Session):
    pagamentos = obter_pagamentos_venda(venda.id, db)
    return calcular_resumo(venda, pagamentos)


def normalizar_forma_pagamento(forma_pagamento: str):
    forma = forma_pagamento.strip().lower()

    if forma not in FORMAS_PAGAMENTO:
        raise HTTPException(
            status_code=422,
            detail="Forma inválida. Use dinheiro, pix ou cartao.",
        )

    return forma


@router.post("/")
def registrar_pagamento(
    dados: PagamentoCriacao,
    db: Session = Depends(obter_banco),
):
    forma = normalizar_forma_pagamento(dados.forma_pagamento)

    venda = db.get(Venda, dados.venda_id)

    if venda is None:
        raise HTTPException(
            status_code=404,
            detail="Venda não encontrada.",
        )

    pagamentos_anteriores = obter_pagamentos_venda(venda.id, db)

    resumo_atual = calcular_resumo(venda, pagamentos_anteriores)
    valor_pendente = dinheiro(resumo_atual["valor_pendente"])
    valor = dinheiro(dados.valor)

    if valor_pendente <= 0:
        raise HTTPException(
            status_code=400,
            detail="Esta venda já está totalmente paga.",
        )

    if valor > valor_pendente:
        raise HTTPException(
            status_code=400,
            detail=(
                f"O pagamento excede o saldo pendente de "
                f"R$ {valor_pendente:.2f}."
            ),
        )

    pagamento = Pagamento(
        venda_id=venda.id,
        forma_pagamento=forma,
        valor=valor,
    )

    try:
        db.add(pagamento)
        db.flush()
        sincronizar_movimentacao_pagamento(db, pagamento)
        db.commit()
        db.refresh(pagamento)

        return {
            "mensagem": "Pagamento registrado com sucesso!",
            "pagamento": {
                "id": pagamento.id,
                "venda_id": pagamento.venda_id,
                "forma_pagamento": pagamento.forma_pagamento,
                "valor": float(dinheiro(pagamento.valor)),
                "data": pagamento.data.isoformat(),
            },
            "resumo": resumo_pagamento(venda, db),
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível registrar o pagamento.",
        )


@router.post("/cliente/{cliente_id}")
def registrar_pagamento_cliente(
    cliente_id: int,
    dados: PagamentoClienteCriacao,
    db: Session = Depends(obter_banco),
):
    """
    Recebe um pagamento pelo perfil do cliente.

    O valor é distribuído entre as dívidas mais antigas primeiro.
    Cada parcela é registrada na venda correspondente.
    """
    forma = normalizar_forma_pagamento(dados.forma_pagamento)
    valor_recebido = dinheiro(dados.valor)

    cliente = db.get(Cliente, cliente_id)

    if cliente is None:
        raise HTTPException(
            status_code=404,
            detail="Cliente não encontrado.",
        )

    vendas = (
        db.query(Venda)
        .filter(Venda.cliente_id == cliente_id)
        .order_by(Venda.data.asc(), Venda.id.asc())
        .all()
    )

    vendas_pendentes = []
    saldo_total = Decimal("0.00")

    for venda in vendas:
        resumo = resumo_pagamento(venda, db)
        pendente = dinheiro(resumo["valor_pendente"])

        if pendente > 0:
            vendas_pendentes.append((venda, pendente))
            saldo_total += pendente

    saldo_total = dinheiro(saldo_total)

    if saldo_total <= 0:
        raise HTTPException(
            status_code=400,
            detail="Este cliente não possui dívidas pendentes.",
        )

    if valor_recebido > saldo_total:
        raise HTTPException(
            status_code=400,
            detail=(
                f"O pagamento excede a dívida total de "
                f"R$ {saldo_total:.2f}."
            ),
        )

    restante = valor_recebido
    distribuicao = []
    pagamentos_criados = []

    try:
        for venda, pendente in vendas_pendentes:
            if restante <= 0:
                break

            valor_parcela = dinheiro(min(restante, pendente))

            if valor_parcela <= 0:
                continue

            pagamento = Pagamento(
                venda_id=venda.id,
                forma_pagamento=forma,
                valor=valor_parcela,
            )

            db.add(pagamento)
            pagamentos_criados.append(pagamento)

            distribuicao.append({
                "venda_id": venda.id,
                "valor_recebido_nesta_venda": float(valor_parcela),
            })

            restante = dinheiro(restante - valor_parcela)

        if restante != Decimal("0.00"):
            raise ValueError(
                "Não foi possível distribuir integralmente o pagamento."
            )

        db.flush()
        for pagamento in pagamentos_criados:
            sincronizar_movimentacao_pagamento(db, pagamento)

        # Um único commit mantém o recebimento como uma operação só.
        db.commit()

        vendas_atualizadas = []

        for venda, _ in vendas_pendentes:
            resumo = resumo_pagamento(venda, db)

            vendas_atualizadas.append({
                "venda_id": venda.id,
                "valor_total": resumo["valor_total"],
                "valor_recebido": resumo["valor_recebido"],
                "valor_pendente": resumo["valor_pendente"],
                "situacao": resumo["situacao"],
            })

        novo_saldo = dinheiro(
            sum(
                (
                    dinheiro(item["valor_pendente"])
                    for item in vendas_atualizadas
                ),
                Decimal("0.00"),
            )
        )

        return {
            "mensagem": "Pagamento do cliente registrado com sucesso!",
            "cliente_id": cliente_id,
            "valor_recebido": float(valor_recebido),
            "forma_pagamento": forma,
            "saldo_anterior": float(saldo_total),
            "saldo_atual": float(novo_saldo),
            "distribuicao": distribuicao,
            "vendas_atualizadas": vendas_atualizadas,
        }

    except Exception as erro:
        db.rollback()

        if isinstance(erro, HTTPException):
            raise

        raise HTTPException(
            status_code=500,
            detail="Não foi possível registrar o pagamento do cliente.",
        )


@router.get("/pendentes")
def listar_pagamentos_pendentes(
    db: Session = Depends(obter_banco),
):
    vendas = (
        db.query(Venda)
        .order_by(Venda.id.desc())
        .all()
    )

    contas_pendentes = []

    for venda in vendas:
        resumo = resumo_pagamento(venda, db)

        if resumo["valor_pendente"] > 0:
            contas_pendentes.append({
                "venda_id": venda.id,
                "data_venda": venda.data.isoformat(),
                "valor_total": resumo["valor_total"],
                "valor_recebido": resumo["valor_recebido"],
                "valor_pendente": resumo["valor_pendente"],
                "situacao": resumo["situacao"],
            })

    return {
        "quantidade": len(contas_pendentes),
        "valor_total_pendente": float(
            dinheiro(
                sum(
                    (
                        dinheiro(conta["valor_pendente"])
                        for conta in contas_pendentes
                    ),
                    Decimal("0.00"),
                )
            )
        ),
        "vendas": contas_pendentes,
    }


@router.get("/venda/{venda_id}")
def consultar_pagamentos_venda(
    venda_id: int,
    db: Session = Depends(obter_banco),
):
    venda = db.get(Venda, venda_id)

    if venda is None:
        raise HTTPException(
            status_code=404,
            detail="Venda não encontrada.",
        )

    return resumo_pagamento(venda, db)
