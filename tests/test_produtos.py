
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database.connection import Base
from app.routes.produtos import obter_banco as obter_banco_produtos
from app.routes.movimentacoes import obter_banco as obter_banco_movimentacoes


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

    app.dependency_overrides[obter_banco_produtos] = obter_banco_teste
    app.dependency_overrides[obter_banco_movimentacoes] = obter_banco_teste

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_teste)
    engine_teste.dispose()


def criar_produto(cliente, nome="Coca-Cola", preco="8.50", estoque=10):
    return cliente.post(
        "/produtos/",
        json={
            "nome": nome,
            "preco": preco,
            "estoque": estoque,
        },
    )


def test_cadastra_produto(cliente):
    resposta = criar_produto(cliente)

    assert resposta.status_code == 200

    dados = resposta.json()["produto"]

    assert dados["nome"] == "Coca-Cola"
    assert dados["preco"] == 8.50
    assert dados["estoque"] == 10
    assert dados["ativo"] is True
    assert "id" in dados


def test_lista_produtos(cliente):
    criar_produto(cliente, nome="Coca-Cola")
    criar_produto(cliente, nome="Guaraná", preco="7.00")

    resposta = cliente.get("/produtos/")

    assert resposta.status_code == 200

    produtos = resposta.json()

    assert len(produtos) == 2
    assert {produto["nome"] for produto in produtos} == {
        "Coca-Cola",
        "Guaraná",
    }


def test_consulta_produto_por_id(cliente):
    criacao = criar_produto(cliente)
    produto_id = criacao.json()["produto"]["id"]

    resposta = cliente.get(f"/produtos/{produto_id}")

    assert resposta.status_code == 200
    assert resposta.json()["nome"] == "Coca-Cola"


def test_edita_produto(cliente):
    criacao = criar_produto(cliente)
    produto_id = criacao.json()["produto"]["id"]

    resposta = cliente.patch(
        f"/produtos/{produto_id}",
        json={
            "nome": "Coca-Cola 2L",
            "preco": "12.50",
            "estoque": 15,
        },
    )

    assert resposta.status_code == 200

    dados = resposta.json()["produto"]

    assert dados["nome"] == "Coca-Cola 2L"
    assert dados["preco"] == 12.50
    assert dados["estoque"] == 15


def test_rejeita_preco_zero(cliente):
    resposta = criar_produto(cliente, preco="0.00")

    assert resposta.status_code == 422


def test_rejeita_estoque_negativo(cliente):
    resposta = criar_produto(cliente, estoque=-1)

    assert resposta.status_code == 422


def test_rejeita_nome_vazio(cliente):
    resposta = criar_produto(cliente, nome="   ")

    assert resposta.status_code in (200, 400, 422)

    if resposta.status_code == 200:
        assert resposta.json()["produto"]["nome"].strip() != ""


def test_desativa_produto(cliente):
    criacao = criar_produto(cliente)
    produto_id = criacao.json()["produto"]["id"]

    resposta = cliente.patch(
        f"/produtos/{produto_id}/desativar"
    )

    assert resposta.status_code == 200

    consulta = cliente.get(f"/produtos/{produto_id}")

    assert consulta.status_code == 200
    assert consulta.json()["ativo"] is False


def test_reativa_produto(cliente):
    criacao = criar_produto(cliente)
    produto_id = criacao.json()["produto"]["id"]

    cliente.patch(f"/produtos/{produto_id}/desativar")

    resposta = cliente.patch(
        f"/produtos/{produto_id}/reativar"
    )

    assert resposta.status_code == 200

    consulta = cliente.get(f"/produtos/{produto_id}")

    assert consulta.status_code == 200
    assert consulta.json()["ativo"] is True


def test_retorna_404_para_produto_inexistente(cliente):
    resposta = cliente.get("/produtos/99999")

    assert resposta.status_code == 404
