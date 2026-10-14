
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.database.money import dinheiro
from app.models.venda import Venda
from app.models.pagamento import Pagamento
from app.models.movimentacao import Movimentacao


router = APIRouter(
    prefix="/financeiro",
    tags=["Financeiro geral"],
)


def obter_banco():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def calcular_resumo_financeiro(
    db: Session,
    data_inicio: date | None = None,
    data_fim: date | None = None,
):
    if data_inicio and data_fim and data_inicio > data_fim:
        raise HTTPException(
            status_code=422,
            detail="A data inicial não pode ser posterior à data final.",
        )

    inicio = (
        datetime.combine(data_inicio, time.min)
        if data_inicio
        else None
    )

    fim_exclusivo = (
        datetime.combine(
            data_fim + timedelta(days=1),
            time.min,
        )
        if data_fim
        else None
    )

    consulta_movimentacoes = db.query(Movimentacao)

    if inicio:
        consulta_movimentacoes = consulta_movimentacoes.filter(
            Movimentacao.data >= inicio
        )

    if fim_exclusivo:
        consulta_movimentacoes = consulta_movimentacoes.filter(
            Movimentacao.data < fim_exclusivo
        )

    movimentacoes = consulta_movimentacoes.all()
    ids_movimentacoes_recebimentos = {
        movimentacao_id
        for (movimentacao_id,) in (
            db.query(Pagamento.movimentacao_id)
            .filter(Pagamento.movimentacao_id.is_not(None))
            .all()
        )
    }
    movimentacoes_manuais = [
        movimentacao
        for movimentacao in movimentacoes
        if movimentacao.id not in ids_movimentacoes_recebimentos
    ]

    entradas_manuais = dinheiro(
        sum(
            (
                dinheiro(m.valor)
                for m in movimentacoes_manuais
                if m.tipo == "entrada"
            ),
            Decimal("0.00"),
        )
    )

    saidas_manuais = dinheiro(
        sum(
            (
                dinheiro(m.valor)
                for m in movimentacoes_manuais
                if m.tipo == "saida"
            ),
            Decimal("0.00"),
        )
    )

    consulta_pagamentos = db.query(Pagamento)

    if inicio:
        consulta_pagamentos = consulta_pagamentos.filter(
            Pagamento.data >= inicio
        )

    if fim_exclusivo:
        consulta_pagamentos = consulta_pagamentos.filter(
            Pagamento.data < fim_exclusivo
        )

    pagamentos_periodo = consulta_pagamentos.all()

    total_recebido_periodo = dinheiro(
        sum(
            (
                dinheiro(p.valor)
                for p in pagamentos_periodo
            ),
            Decimal("0.00"),
        )
    )

    consulta_vendas = db.query(Venda)

    if inicio:
        consulta_vendas = consulta_vendas.filter(
            Venda.data >= inicio
        )

    if fim_exclusivo:
        consulta_vendas = consulta_vendas.filter(
            Venda.data < fim_exclusivo
        )

    vendas_periodo = consulta_vendas.all()

    total_vendido_periodo = dinheiro(
        sum(
            (
                dinheiro(v.valor_total)
                for v in vendas_periodo
            ),
            Decimal("0.00"),
        )
    )

    pagamentos_por_venda = {}

    for pagamento in db.query(Pagamento).all():
        pagamentos_por_venda[pagamento.venda_id] = dinheiro(
            pagamentos_por_venda.get(
                pagamento.venda_id,
                Decimal("0.00"),
            )
            + dinheiro(pagamento.valor)
        )

    total_a_receber_periodo = dinheiro(
        sum(
            (
                max(
                    dinheiro(venda.valor_total)
                    - pagamentos_por_venda.get(
                        venda.id,
                        Decimal("0.00"),
                    ),
                    Decimal("0.00"),
                )
                for venda in vendas_periodo
            ),
            Decimal("0.00"),
        )
    )

    saldo_manual = dinheiro(
        entradas_manuais - saidas_manuais
    )

    return {
        "periodo": {
            "data_inicio": (
                data_inicio.isoformat() if data_inicio else None
            ),
            "data_fim": (
                data_fim.isoformat() if data_fim else None
            ),
        },
        "vendas": {
            "quantidade": len(vendas_periodo),
            "total_vendido": float(total_vendido_periodo),
            "total_a_receber_dessas_vendas": float(
                total_a_receber_periodo
            ),
        },
        "recebimentos": {
            "total_recebido_no_periodo": float(
                total_recebido_periodo
            ),
        },
        "movimentacoes_manuais": {
            "quantidade": len(movimentacoes_manuais),
            "total_entradas": float(entradas_manuais),
            "total_saidas": float(saidas_manuais),
            "saldo": float(saldo_manual),
        },
    }


@router.get("/resumo")
def resumo_financeiro_geral(
    db: Session = Depends(obter_banco),
):
    return calcular_resumo_financeiro(db)


@router.get("/resumo-periodo")
def resumo_financeiro_periodo(
    data_inicio: date | None = None,
    data_fim: date | None = None,
    db: Session = Depends(obter_banco),
):
    return calcular_resumo_financeiro(
        db=db,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )
