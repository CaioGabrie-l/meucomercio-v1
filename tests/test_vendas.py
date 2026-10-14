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


def criar_produto(
    cliente,
    nome="Refrigerante",
    preco="8.50",
    estoque=10,
):
    resposta = cliente.post(
        "/produtos/",
        json={
            "nome": nome,
            "preco": preco,
            "estoque": estoque,
        },
    )

    assert resposta.status_code == 200
    return resposta.json()["produto"]


def registrar_venda(cliente, produto_id, quantidade=2):
    return cliente.post(
        "/vendas/",
        json={
            "itens": [
                {
                    "produto_id": produto_id,
                    "quantidade": quantidade,
                }
            ],
            "cliente_nome": "Cliente de teste",
            "cliente_whatsapp": "17999999999",
        },
    )


def test_registra_venda_e_calcula_total(cliente):
    produto = criar_produto(cliente, preco="8.50", estoque=10)

    resposta = registrar_venda(cliente, produto["id"], 2)

    assert resposta.status_code == 200
    venda = resposta.json()["venda"]
    assert venda["valor_total"] == 17.00
    assert len(venda["itens"]) == 1
    assert venda["itens"][0]["quantidade"] == 2
    assert venda["itens"][0]["subtotal"] == 17.00


def test_venda_com_pagamentos_cria_entradas_financeiras(cliente):
    produto = criar_produto(cliente, preco="8.50", estoque=10)

    resposta = cliente.post(
        "/vendas/",
        json={
            "itens": [{"produto_id": produto["id"], "quantidade": 1}],
            "pagamentos": [
                {"forma_pagamento": "pix", "valor": "3.50"},
                {"forma_pagamento": "dinheiro", "valor": "5.00"},
            ],
        },
    )

    assert resposta.status_code == 200
    movimentos = cliente.get("/movimentacoes/").json()

    assert len(movimentos) == 2
    assert {movimento["categoria"] for movimento in movimentos} == {"Venda"}
    assert {movimento["tipo"] for movimento in movimentos} == {"entrada"}
    assert sum(movimento["valor"] for movimento in movimentos) == 8.50


def test_venda_diminui_estoque(cliente):
    produto = criar_produto(cliente, estoque=10)

    resposta = registrar_venda(cliente, produto["id"], 3)
    assert resposta.status_code == 200

    consulta = cliente.get(f"/produtos/{produto['id']}")
    assert consulta.status_code == 200
    assert consulta.json()["estoque"] == 7


def test_rejeita_venda_com_estoque_insuficiente(cliente):
    produto = criar_produto(cliente, estoque=2)

    resposta = registrar_venda(cliente, produto["id"], 3)

    assert resposta.status_code == 400
    assert "Estoque insuficiente" in resposta.json()["detail"]


def test_rejeita_produto_inexistente(cliente):
    resposta = registrar_venda(cliente, 9999, 1)

    assert resposta.status_code == 404


def test_rejeita_produto_desativado(cliente):
    produto = criar_produto(cliente)

    desativacao = cliente.patch(
        f"/produtos/{produto['id']}",
        json={"ativo": False},
    )
    assert desativacao.status_code == 200

    resposta = registrar_venda(cliente, produto["id"], 1)
    assert resposta.status_code == 400
    assert "desativado" in resposta.json()["detail"]


def test_rejeita_quantidade_zero(cliente):
    produto = criar_produto(cliente)

    resposta = registrar_venda(cliente, produto["id"], 0)

    assert resposta.status_code == 422


def test_rejeita_lista_de_itens_vazia(cliente):
    resposta = cliente.post("/vendas/", json={"itens": []})

    assert resposta.status_code == 422


def test_soma_itens_duplicados_do_mesmo_produto(cliente):
    produto = criar_produto(cliente, preco="5.00", estoque=10)

    resposta = cliente.post(
        "/vendas/",
        json={
            "itens": [
                {"produto_id": produto["id"], "quantidade": 2},
                {"produto_id": produto["id"], "quantidade": 3},
            ],
            "cliente_nome": "Cliente de teste",
            "cliente_whatsapp": "17999999999",
        },
    )

    assert resposta.status_code == 200
    assert resposta.json()["venda"]["valor_total"] == 25.00

    consulta = cliente.get(f"/produtos/{produto['id']}")
    assert consulta.json()["estoque"] == 5


def test_lista_vendas(cliente):
    produto = criar_produto(cliente)
    registrar_venda(cliente, produto["id"], 1)

    resposta = cliente.get("/vendas/")

    assert resposta.status_code == 200
    assert len(resposta.json()) == 1


def test_consulta_venda_por_id(cliente):
    produto = criar_produto(cliente)
    criacao = registrar_venda(cliente, produto["id"], 1)
    assert criacao.status_code == 200

    venda_id = criacao.json()["venda"]["id"]

    resposta = cliente.get(f"/vendas/{venda_id}")

    assert resposta.status_code == 200
    assert resposta.json()["id"] == venda_id


def test_retorna_404_para_venda_inexistente(cliente):
    resposta = cliente.get("/vendas/9999")

    assert resposta.status_code == 404


def test_resumo_financeiro_sem_vendas(cliente):
    resposta = cliente.get("/vendas/resumo-financeiro")

    assert resposta.status_code == 200
    dados = resposta.json()
    assert dados["quantidade_vendas"] == 0
    assert dados["total_vendido"] == 0.0
    assert dados["total_recebido"] == 0.0
    assert dados["total_a_receber"] == 0.0
    assert dados["vendas_pagas"] == 0
    assert dados["vendas_parciais"] == 0
    assert dados["vendas_pendentes"] == 0
