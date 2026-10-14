
from decimal import Decimal

import pytest

from app.database.money import Dinheiro, dinheiro
from app.routes.movimentacoes import validar_valor_monetario


@pytest.fixture
def tipo_dinheiro():
    return Dinheiro()


def test_converte_reais_em_centavos(tipo_dinheiro):
    resultado = tipo_dinheiro.process_bind_param(
        Decimal("10.50"),
        None,
    )
    assert resultado == 1050


def test_normaliza_valor_monetario_com_arredondamento_padrao():
    assert dinheiro("10.555") == Decimal("10.56")


def test_converte_centavos_em_reais(tipo_dinheiro):
    resultado = tipo_dinheiro.process_result_value(
        1050,
        None,
    )
    assert resultado == Decimal("10.50")


def test_preserva_valores_com_centavos(tipo_dinheiro):
    valores = [
        (Decimal("0.01"), 1),
        (Decimal("1.99"), 199),
        (Decimal("13.50"), 1350),
        (Decimal("999.99"), 99999),
    ]

    for reais, centavos_esperados in valores:
        resultado = tipo_dinheiro.process_bind_param(reais, None)
        assert resultado == centavos_esperados


def test_aceita_valor_zero(tipo_dinheiro):
    resultado = tipo_dinheiro.process_bind_param(
        Decimal("0.00"),
        None,
    )
    assert resultado == 0


@pytest.mark.parametrize(
    "valor",
    [
        Decimal("NaN"),
        Decimal("Infinity"),
        Decimal("-Infinity"),
    ],
)
def test_rejeita_valores_nao_finitos(tipo_dinheiro, valor):
    with pytest.raises(ValueError):
        tipo_dinheiro.process_bind_param(valor, None)


def test_rejeita_valor_acima_do_limite(tipo_dinheiro):
    with pytest.raises(ValueError):
        tipo_dinheiro.process_bind_param(
            Decimal("100000000.00"),
            None,
        )


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [
        ("10.00", Decimal("10.00")),
        ("10.50", Decimal("10.50")),
        ("0.01", Decimal("0.01")),
        ("10.000", Decimal("10.00")),
        ("10.500", Decimal("10.50")),
        ("10.999", None),
        ("10.001", None),
        ("NaN", None),
        ("Infinity", None),
        ("0", None),
        ("-5.00", None),
        ("100000000.00", None),
    ],
)
def test_validacao_monetaria(valor, esperado):
    if esperado is None:
        with pytest.raises(ValueError):
            validar_valor_monetario(valor)
    else:
        assert validar_valor_monetario(valor) == esperado
