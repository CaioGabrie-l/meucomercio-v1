from app.models.movimentacao import Movimentacao
from app.models.pagamento import Pagamento


FORMAS_PAGAMENTO = {
    "dinheiro": "Dinheiro",
    "pix": "Pix",
    "cartao": "Cartão",
}


def criar_movimentacao_pagamento(pagamento: Pagamento) -> Movimentacao:
    forma = FORMAS_PAGAMENTO.get(
        (pagamento.forma_pagamento or "").strip().lower(),
        (pagamento.forma_pagamento or "").strip().capitalize() or "Pagamento",
    )
    return Movimentacao(
        tipo="entrada",
        descricao=f"Venda #{pagamento.venda_id} · {forma}",
        categoria="Venda",
        valor=pagamento.valor,
        data=pagamento.data,
    )


def sincronizar_movimentacao_pagamento(db, pagamento: Pagamento) -> Movimentacao:
    if pagamento.movimentacao_id:
        movimento = db.get(Movimentacao, pagamento.movimentacao_id)
        if movimento is not None:
            return movimento

    movimento = criar_movimentacao_pagamento(pagamento)
    db.add(movimento)
    db.flush()
    pagamento.movimentacao_id = movimento.id
    return movimento
