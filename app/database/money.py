
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from sqlalchemy import Integer
from sqlalchemy.types import TypeDecorator


CENTAVO = Decimal("0.01")
FATOR_CENTAVOS = Decimal("100")
VALOR_MAXIMO_CENTAVOS = 9_999_999_999


def dinheiro(valor: Decimal | int | float | str) -> Decimal:
    """Converte um valor para Decimal com precisão de centavos."""
    return Decimal(str(valor)).quantize(
        CENTAVO,
        rounding=ROUND_HALF_UP,
    )


class Dinheiro(TypeDecorator[Decimal]):
    """
    Trabalha com Decimal em reais no Python e armazena
    centavos inteiros no SQLite.
    """

    impl = Integer
    cache_ok = True

    def process_bind_param(self, valor, dialect):
        if valor is None:
            return None

        try:
            numero = Decimal(str(valor))

            if not numero.is_finite():
                raise ValueError("O valor monetário precisa ser finito.")

            numero = numero.quantize(
                CENTAVO,
                rounding=ROUND_HALF_UP,
            )

            centavos = numero * FATOR_CENTAVOS

            if centavos != centavos.to_integral_value():
                raise ValueError("O valor possui precisão inválida.")

            centavos = int(centavos)

            if abs(centavos) > VALOR_MAXIMO_CENTAVOS:
                raise ValueError("O valor monetário ultrapassa o limite.")

            return centavos

        except (InvalidOperation, TypeError) as erro:
            raise ValueError("Valor monetário inválido.") from erro

    def process_result_value(self, valor, dialect):
        if valor is None:
            return None

        try:
            centavos = Decimal(str(valor))
            reais = centavos / FATOR_CENTAVOS

            return reais.quantize(CENTAVO)

        except (InvalidOperation, TypeError) as erro:
            raise ValueError(
                "Não foi possível interpretar o valor monetário do banco."
            ) from erro
