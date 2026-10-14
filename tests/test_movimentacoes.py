
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database.connection import Base
from app.routes.movimentacoes import obter_banco


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

    app.dependency_overrides[obter_banco] = obter_banco_teste

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_teste)
    engine_teste.dispose()


def test_api_inicial_funcionando(cliente):
    resposta = cliente.get("/")

    assert resposta.status_code == 200
    assert "text/html" in resposta.headers["content-type"]
    assert "MeuComércio" in resposta.text


def test_registra_movimentacao(cliente):
    resposta = cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "entrada",
            "descricao": "Venda do dia",
            "categoria": "Vendas",
            "valor": "150.50",
        },
    )

    assert resposta.status_code == 200

    dados = resposta.json()["movimentacao"]

    assert dados["tipo"] == "entrada"
    assert dados["descricao"] == "Venda do dia"
    assert dados["categoria"] == "Vendas"
    assert dados["valor"] == 150.50


def test_rejeita_tipo_invalido(cliente):
    resposta = cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "transferencia",
            "descricao": "Teste",
            "categoria": "Outros",
            "valor": "10.00",
        },
    )

    assert resposta.status_code == 422


def test_rejeita_valor_com_fracao_invalida(cliente):
    resposta = cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "entrada",
            "descricao": "Teste",
            "categoria": "Outros",
            "valor": "10.001",
        },
    )

    assert resposta.status_code == 422


def test_lista_movimentacoes(cliente):
    cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "entrada",
            "descricao": "Venda",
            "categoria": "Vendas",
            "valor": "100.00",
        },
    )

    resposta = cliente.get("/movimentacoes/")

    assert resposta.status_code == 200
    assert len(resposta.json()) == 1
    assert resposta.json()[0]["valor"] == 100.00


def test_edita_movimentacao(cliente):
    criacao = cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "entrada",
            "descricao": "Venda inicial",
            "categoria": "Vendas",
            "valor": "100.00",
        },
    )

    movimentacao_id = criacao.json()["movimentacao"]["id"]

    resposta = cliente.put(
        f"/movimentacoes/{movimentacao_id}",
        json={
            "descricao": "Venda atualizada",
            "valor": "125.50",
        },
    )

    assert resposta.status_code == 200

    dados = resposta.json()["movimentacao"]

    assert dados["descricao"] == "Venda atualizada"
    assert dados["valor"] == 125.50


def test_exclui_movimentacao(cliente):
    criacao = cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "saida",
            "descricao": "Compra de material",
            "categoria": "Compras",
            "valor": "25.00",
        },
    )

    movimentacao_id = criacao.json()["movimentacao"]["id"]

    resposta = cliente.delete(
        f"/movimentacoes/{movimentacao_id}"
    )

    assert resposta.status_code == 200

    listagem = cliente.get("/movimentacoes/")

    assert listagem.status_code == 200
    assert listagem.json() == []


def test_resumo_movimentacoes(cliente):
    cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "entrada",
            "descricao": "Venda",
            "categoria": "Vendas",
            "valor": "200.00",
        },
    )

    cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "saida",
            "descricao": "Compra",
            "categoria": "Compras",
            "valor": "75.50",
        },
    )

    resposta = cliente.get("/movimentacoes/resumo")

    assert resposta.status_code == 200

    dados = resposta.json()

    assert dados["quantidade_movimentacoes"] == 2
    assert dados["total_entradas"] == 200.00
    assert dados["total_saidas"] == 75.50
    assert dados["saldo"] == 124.50


def test_lista_movimentacoes_por_tipo(cliente):
    cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "entrada",
            "descricao": "Venda",
            "categoria": "Vendas",
            "valor": "100.00",
        },
    )

    cliente.post(
        "/movimentacoes/",
        json={
            "tipo": "saida",
            "descricao": "Compra",
            "categoria": "Compras",
            "valor": "30.00",
        },
    )

    resposta = cliente.get(
        "/movimentacoes/",
        params={"tipo": "entrada"},
    )

    assert resposta.status_code == 200
    assert len(resposta.json()) == 1
    assert resposta.json()[0]["tipo"] == "entrada"


def test_retorna_404_ao_editar_movimentacao_inexistente(cliente):
    resposta = cliente.put(
        "/movimentacoes/99999",
        json={"descricao": "Não existe"},
    )

    assert resposta.status_code == 404


def test_retorna_404_ao_excluir_movimentacao_inexistente(cliente):
    resposta = cliente.delete("/movimentacoes/99999")

    assert resposta.status_code == 404
