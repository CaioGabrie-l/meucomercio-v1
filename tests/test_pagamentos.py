
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database.connection import Base
from app.routes.produtos import obter_banco as obter_banco_produtos
from app.routes.movimentacoes import obter_banco as obter_banco_movimentacoes
from app.routes.vendas import obter_banco as obter_banco_vendas
from app.routes.pagamentos import obter_banco as obter_banco_pagamentos
from app.routes.financeiro import obter_banco as obter_banco_financeiro


@pytest.fixture
def cliente():
    engine_teste = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    SessaoTeste = sessionmaker(
        bind=engine_teste,
        autoflush=False,
        autocommit=False,
    )

    Base.metadata.create_all(bind=engine_teste)

    def obter_banco_teste():
        db = SessaoTeste()
        try:
            yield db
        finally:
            db.close()

    dependencias = [
        obter_banco_produtos,
        obter_banco_movimentacoes,
        obter_banco_vendas,
        obter_banco_pagamentos,
        obter_banco_financeiro,
    ]

    for dependencia in dependencias:
        app.dependency_overrides[dependencia] = obter_banco_teste

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine_teste)
        engine_teste.dispose()


def criar_venda(cliente, preco="100.00", quantidade=1):
    resposta_produto = cliente.post(
        "/produtos/",
        json={
            "nome": "Produto de teste",
            "preco": preco,
            "estoque": 20,
        },
    )

    assert resposta_produto.status_code == 200
    produto = resposta_produto.json()["produto"]

    resposta_venda = cliente.post(
        "/vendas/",
        json={
            "itens": [
                {
                    "produto_id": produto["id"],
                    "quantidade": quantidade,
                }
            ],
            "cliente_nome": "Cliente de teste",
            "cliente_whatsapp": "17999999999",
        },
    )

    assert resposta_venda.status_code == 200
    return resposta_venda.json()["venda"]


def pagar(cliente, venda_id, valor, forma="pix"):
    return cliente.post(
        "/pagamentos/",
        json={
            "venda_id": venda_id,
            "forma_pagamento": forma,
            "valor": valor,
        },
    )


def test_registra_pagamento_integral(cliente):
    venda = criar_venda(cliente, preco="50.00")

    resposta = pagar(cliente, venda["id"], "50.00")

    assert resposta.status_code == 200
    dados = resposta.json()

    assert dados["pagamento"]["venda_id"] == venda["id"]
    assert dados["pagamento"]["forma_pagamento"] == "pix"
    assert dados["pagamento"]["valor"] == 50.00
    assert dados["resumo"]["valor_recebido"] == 50.00
    assert dados["resumo"]["valor_pendente"] == 0.00
    assert dados["resumo"]["situacao"] == "pago"

    movimentos = cliente.get("/movimentacoes/").json()
    assert len(movimentos) == 1
    assert movimentos[0]["categoria"] == "Venda"
    assert movimentos[0]["valor"] == 50.00

    financeiro = cliente.get("/financeiro/resumo").json()
    assert financeiro["recebimentos"]["total_recebido_no_periodo"] == 50.00
    assert financeiro["movimentacoes_manuais"]["total_entradas"] == 0.00

    movimento_id = movimentos[0]["id"]
    edicao = cliente.put(
        f"/movimentacoes/{movimento_id}",
        json={"valor": "45.00"},
    )
    exclusao = cliente.delete(f"/movimentacoes/{movimento_id}")
    assert edicao.status_code == 409
    assert exclusao.status_code == 409


def test_pagamento_do_cliente_cria_entrada_para_cada_venda(cliente):
    primeira_venda = criar_venda(cliente, preco="100.00")
    criar_venda(cliente, preco="50.00")

    resposta = cliente.post(
        f"/pagamentos/cliente/{primeira_venda['cliente']['id']}",
        json={"forma_pagamento": "pix", "valor": "120.00"},
    )

    assert resposta.status_code == 200
    movimentos = cliente.get("/movimentacoes/").json()

    assert len(movimentos) == 2
    assert sum(movimento["valor"] for movimento in movimentos) == 120.00
    assert {movimento["categoria"] for movimento in movimentos} == {"Venda"}


def test_registra_pagamento_parcial(cliente):
    venda = criar_venda(cliente, preco="100.00")

    resposta = pagar(cliente, venda["id"], "30.00")

    assert resposta.status_code == 200
    resumo = resposta.json()["resumo"]

    assert resumo["valor_recebido"] == 30.00
    assert resumo["valor_pendente"] == 70.00
    assert resumo["situacao"] == "parcial"


def test_aceita_formas_de_pagamento_validas(cliente):
    for forma in ["dinheiro", "pix", "cartao"]:
        venda = criar_venda(cliente, preco="30.00")

        resposta = pagar(
            cliente,
            venda["id"],
            "30.00",
            forma,
        )

        assert resposta.status_code == 200
        assert resposta.json()["pagamento"]["forma_pagamento"] == forma


def test_normaliza_forma_de_pagamento(cliente):
    venda = criar_venda(cliente, preco="20.00")

    resposta = pagar(
        cliente,
        venda["id"],
        "20.00",
        " PIX ",
    )

    assert resposta.status_code == 200
    assert resposta.json()["pagamento"]["forma_pagamento"] == "pix"


def test_rejeita_forma_de_pagamento_invalida(cliente):
    venda = criar_venda(cliente)

    resposta = pagar(
        cliente,
        venda["id"],
        "10.00",
        "boleto",
    )

    assert resposta.status_code == 422


def test_rejeita_venda_inexistente(cliente):
    resposta = pagar(cliente, 9999, "10.00")

    assert resposta.status_code == 404


def test_rejeita_pagamento_acima_do_saldo(cliente):
    venda = criar_venda(cliente, preco="100.00")

    resposta = pagar(cliente, venda["id"], "100.01")

    assert resposta.status_code == 400
    assert "excede" in resposta.json()["detail"]


def test_rejeita_pagamento_de_venda_ja_paga(cliente):
    venda = criar_venda(cliente, preco="40.00")

    primeira = pagar(cliente, venda["id"], "40.00")
    assert primeira.status_code == 200

    segunda = pagar(cliente, venda["id"], "1.00")

    assert segunda.status_code == 400
    assert "totalmente paga" in segunda.json()["detail"]


def test_rejeita_valor_zero(cliente):
    venda = criar_venda(cliente)

    resposta = pagar(cliente, venda["id"], "0.00")

    assert resposta.status_code == 422


def test_consulta_pagamentos_da_venda(cliente):
    venda = criar_venda(cliente, preco="100.00")

    pagar(cliente, venda["id"], "25.00", "dinheiro")
    pagar(cliente, venda["id"], "25.00", "pix")

    resposta = cliente.get(
        f"/pagamentos/venda/{venda['id']}"
    )

    assert resposta.status_code == 200
    dados = resposta.json()

    assert dados["valor_total"] == 100.00
    assert dados["valor_recebido"] == 50.00
    assert dados["valor_pendente"] == 50.00
    assert dados["situacao"] == "parcial"
    assert len(dados["pagamentos"]) == 2


def test_consulta_venda_inexistente(cliente):
    resposta = cliente.get("/pagamentos/venda/9999")

    assert resposta.status_code == 404


def test_lista_vendas_com_saldo_pendente(cliente):
    venda1 = criar_venda(cliente, preco="100.00")
    venda2 = criar_venda(cliente, preco="50.00")

    pagar(cliente, venda1["id"], "30.00")

    resposta = cliente.get("/pagamentos/pendentes")

    assert resposta.status_code == 200
    dados = resposta.json()

    assert dados["quantidade"] == 2
    assert dados["valor_total_pendente"] == 120.00

    vendas_por_id = {
        venda["venda_id"]: venda
        for venda in dados["vendas"]
    }

    assert vendas_por_id[venda1["id"]]["situacao"] == "parcial"
    assert vendas_por_id[venda1["id"]]["valor_pendente"] == 70.00
    assert vendas_por_id[venda2["id"]]["situacao"] == "pendente"


def test_lista_pendentes_exclui_venda_paga(cliente):
    venda = criar_venda(cliente, preco="25.00")
    pagar(cliente, venda["id"], "25.00")

    resposta = cliente.get("/pagamentos/pendentes")

    assert resposta.status_code == 200
    assert resposta.json()["quantidade"] == 0
    assert resposta.json()["valor_total_pendente"] == 0.00
    assert resposta.json()["vendas"] == []
