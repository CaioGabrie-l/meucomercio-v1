
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.database.money import dinheiro
from app.models.movimentacao import Movimentacao
from app.models.pagamento import Pagamento


router = APIRouter(
    prefix="/movimentacoes",
    tags=["Movimentações financeiras"],
)


CENTAVO = Decimal("0.01")
VALOR_MAXIMO = Decimal("99999999.99")


def validar_valor_monetario(valor) -> Decimal:
    try:
        numero = Decimal(str(valor))

        if not numero.is_finite():
            raise ValueError

        if numero <= 0 or numero > VALOR_MAXIMO:
            raise ValueError

        valor_arredondado = numero.quantize(
            CENTAVO,
            rounding=ROUND_HALF_UP,
        )

        # Rejeita valores que precisariam ser arredondados.
        # Aceita zeros extras à direita, como 10.000.
        if numero != valor_arredondado:
            raise ValueError

        return valor_arredondado

    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(
            "Informe um valor positivo, válido e com até duas casas decimais."
        )


def obter_banco():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


class MovimentacaoCriacao(BaseModel):
    tipo: str
    descricao: str = Field(min_length=2, max_length=150)
    categoria: str = Field(min_length=2, max_length=50)
    valor: Decimal

    @field_validator("valor", mode="before")
    @classmethod
    def validar_valor(cls, valor):
        return validar_valor_monetario(valor)


class MovimentacaoAtualizacao(BaseModel):
    tipo: str | None = None
    descricao: str | None = Field(
        default=None,
        min_length=2,
        max_length=150,
    )
    categoria: str | None = Field(
        default=None,
        min_length=2,
        max_length=50,
    )
    valor: Decimal | None = None

    @field_validator("valor", mode="before")
    @classmethod
    def validar_valor(cls, valor):
        if valor is None:
            return valor

        return validar_valor_monetario(valor)


TIPOS_PERMITIDOS = {"entrada", "saida"}


def dados_movimentacao(movimentacao: Movimentacao):
    return {
        "id": movimentacao.id,
        "tipo": movimentacao.tipo,
        "descricao": movimentacao.descricao,
        "categoria": movimentacao.categoria,
        "valor": float(dinheiro(movimentacao.valor)),
        "data": movimentacao.data.isoformat(),
    }


@router.post("/")
def registrar_movimentacao(
    dados: MovimentacaoCriacao,
    db: Session = Depends(obter_banco),
):
    tipo = dados.tipo.strip().lower()
    descricao = dados.descricao.strip()
    categoria = dados.categoria.strip()

    if tipo not in TIPOS_PERMITIDOS:
        raise HTTPException(
            status_code=422,
            detail="Tipo inválido. Use 'entrada' ou 'saida'.",
        )

    if not descricao or not categoria:
        raise HTTPException(
            status_code=422,
            detail="Descrição e categoria não podem ficar vazias.",
        )

    movimentacao = Movimentacao(
        tipo=tipo,
        descricao=descricao,
        categoria=categoria,
        valor=dinheiro(dados.valor),
        data=datetime.now(),
    )

    try:
        db.add(movimentacao)
        db.commit()
        db.refresh(movimentacao)

        return {
            "mensagem": "Movimentação registrada com sucesso!",
            "movimentacao": dados_movimentacao(movimentacao),
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível registrar a movimentação.",
        )


@router.get("/")
def listar_movimentacoes(
    data_inicio: date | None = None,
    data_fim: date | None = None,
    tipo: str | None = None,
    db: Session = Depends(obter_banco),
):
    consulta = db.query(Movimentacao)

    if data_inicio and data_fim and data_inicio > data_fim:
        raise HTTPException(
            status_code=422,
            detail="A data inicial não pode ser posterior à data final.",
        )

    if data_inicio:
        inicio = datetime.combine(data_inicio, time.min)
        consulta = consulta.filter(Movimentacao.data >= inicio)

    if data_fim:
        fim_exclusivo = datetime.combine(
            data_fim + timedelta(days=1),
            time.min,
        )
        consulta = consulta.filter(
            Movimentacao.data < fim_exclusivo
        )

    if tipo:
        tipo = tipo.strip().lower()

        if tipo not in TIPOS_PERMITIDOS:
            raise HTTPException(
                status_code=422,
                detail="Tipo inválido. Use 'entrada' ou 'saida'.",
            )

        consulta = consulta.filter(Movimentacao.tipo == tipo)

    movimentacoes = (
        consulta
        .order_by(Movimentacao.data.desc())
        .all()
    )

    return [
        dados_movimentacao(movimentacao)
        for movimentacao in movimentacoes
    ]


@router.put("/{movimentacao_id}")
def editar_movimentacao(
    movimentacao_id: int,
    dados: MovimentacaoAtualizacao,
    db: Session = Depends(obter_banco),
):
    movimentacao = db.get(Movimentacao, movimentacao_id)

    if movimentacao is None:
        raise HTTPException(
            status_code=404,
            detail="Movimentação não encontrada.",
        )

    if db.query(Pagamento.id).filter(
        Pagamento.movimentacao_id == movimentacao_id
    ).first():
        raise HTTPException(
            status_code=409,
            detail="Esta entrada está vinculada a um recebimento de venda.",
        )

    alteracoes = dados.model_dump(exclude_unset=True)

    if not alteracoes:
        raise HTTPException(
            status_code=422,
            detail="Informe pelo menos um campo para alterar.",
        )

    if "tipo" in alteracoes:
        tipo = alteracoes["tipo"]

        if (
            tipo is None
            or tipo.strip().lower() not in TIPOS_PERMITIDOS
        ):
            raise HTTPException(
                status_code=422,
                detail="Tipo inválido. Use 'entrada' ou 'saida'.",
            )

        alteracoes["tipo"] = tipo.strip().lower()

    for campo in ("descricao", "categoria"):
        if campo in alteracoes:
            valor = alteracoes[campo]

            if valor is None or not valor.strip():
                raise HTTPException(
                    status_code=422,
                    detail=f"{campo.capitalize()} não pode ficar vazia.",
                )

            alteracoes[campo] = valor.strip()

    if "valor" in alteracoes:
        if alteracoes["valor"] is None:
            raise HTTPException(
                status_code=422,
                detail="O valor não pode ficar vazio.",
            )

        alteracoes["valor"] = dinheiro(alteracoes["valor"])

    try:
        for campo, valor in alteracoes.items():
            setattr(movimentacao, campo, valor)

        db.commit()
        db.refresh(movimentacao)

        return {
            "mensagem": "Movimentação atualizada com sucesso!",
            "movimentacao": dados_movimentacao(movimentacao),
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível atualizar a movimentação.",
        )


@router.delete("/{movimentacao_id}")
def excluir_movimentacao(
    movimentacao_id: int,
    db: Session = Depends(obter_banco),
):
    movimentacao = db.get(Movimentacao, movimentacao_id)

    if movimentacao is None:
        raise HTTPException(
            status_code=404,
            detail="Movimentação não encontrada.",
        )

    if db.query(Pagamento.id).filter(
        Pagamento.movimentacao_id == movimentacao_id
    ).first():
        raise HTTPException(
            status_code=409,
            detail="Esta entrada está vinculada a um recebimento de venda.",
        )

    try:
        db.delete(movimentacao)
        db.commit()

        return {
            "mensagem": "Movimentação excluída com sucesso!",
            "id": movimentacao_id,
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível excluir a movimentação.",
        )


@router.get("/resumo")
def resumo_movimentacoes(
    db: Session = Depends(obter_banco),
):
    movimentacoes = db.query(Movimentacao).all()

    total_entradas = dinheiro(
        sum(
            (
                dinheiro(m.valor)
                for m in movimentacoes
                if m.tipo == "entrada"
            ),
            Decimal("0.00"),
        )
    )

    total_saidas = dinheiro(
        sum(
            (
                dinheiro(m.valor)
                for m in movimentacoes
                if m.tipo == "saida"
            ),
            Decimal("0.00"),
        )
    )

    return {
        "quantidade_movimentacoes": len(movimentacoes),
        "total_entradas": float(total_entradas),
        "total_saidas": float(total_saidas),
        "saldo": float(dinheiro(total_entradas - total_saidas)),
    }
