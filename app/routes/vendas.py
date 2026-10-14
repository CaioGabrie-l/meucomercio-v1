
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import (
    BaseModel,
    Field,
    field_validator,
    model_validator,
)
from sqlalchemy import update
from sqlalchemy.orm import Session, joinedload

from app.database.connection import SessionLocal
from app.database.money import dinheiro
from app.models.produto import Produto
from app.models.venda import Venda, ItemVenda
from app.models.pagamento import Pagamento
from app.models.cliente import Cliente
from app.services.movimentacoes import sincronizar_movimentacao_pagamento


router = APIRouter(
    prefix="/vendas",
    tags=["Vendas"],
)


CENTAVO = Decimal("0.01")
ZERO = Decimal("0.00")

FormaPagamento = Literal["dinheiro", "pix", "cartao"]


def obter_banco():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def normalizar_whatsapp(valor: str) -> str:
    return "".join(caractere for caractere in valor if caractere.isdigit())


class ItemVendaCriacao(BaseModel):
    produto_id: int = Field(gt=0)
    quantidade: int = Field(gt=0)


class PagamentoCriacao(BaseModel):
    forma_pagamento: FormaPagamento
    valor: Decimal = Field(gt=0, max_digits=10, decimal_places=2)

    @field_validator("valor", mode="before")
    @classmethod
    def validar_valor(cls, valor):
        try:
            numero = Decimal(str(valor))

            if not numero.is_finite():
                raise ValueError

            return numero.quantize(
                CENTAVO,
                rounding=ROUND_HALF_UP,
            )
        except Exception:
            raise ValueError("Informe um valor de pagamento válido.")


class VendaCriacao(BaseModel):
    itens: list[ItemVendaCriacao] = Field(min_length=1)

    pagamentos: list[PagamentoCriacao] | None = Field(
        default=None,
        max_length=2,
    )

    # Compatibilidade com o formato antigo.
    forma_pagamento: FormaPagamento | None = None
    valor_pago: Decimal | None = Field(default=None, ge=0)

    # Identificação do cliente: necessária somente se houver dívida.
    cliente_nome: str | None = Field(default=None, max_length=150)
    cliente_whatsapp: str | None = Field(default=None, max_length=30)

    @field_validator("valor_pago", mode="before")
    @classmethod
    def validar_valor_pago(cls, valor):
        if valor is None:
            return valor

        try:
            numero = Decimal(str(valor))

            if not numero.is_finite():
                raise ValueError

            return numero.quantize(
                CENTAVO,
                rounding=ROUND_HALF_UP,
            )
        except Exception:
            raise ValueError("Informe um valor recebido válido.")

    @model_validator(mode="after")
    def validar_formato_pagamento(self):
        if self.pagamentos is not None and (
            self.forma_pagamento is not None
            or self.valor_pago is not None
        ):
            raise ValueError(
                "Use pagamentos ou os campos antigos de pagamento, "
                "não os dois formatos ao mesmo tempo."
            )

        if self.pagamentos is not None:
            formas = [
                pagamento.forma_pagamento
                for pagamento in self.pagamentos
            ]

            if len(formas) != len(set(formas)):
                raise ValueError(
                    "Escolha formas de pagamento diferentes."
                )

        return self


def dados_pagamento(pagamento: Pagamento):
    return {
        "id": pagamento.id,
        "forma_pagamento": pagamento.forma_pagamento,
        "valor": float(dinheiro(pagamento.valor)),
        "data": pagamento.data.isoformat(),
    }


def listar_pagamentos(db: Session, venda_id: int):
    return (
        db.query(Pagamento)
        .filter(Pagamento.venda_id == venda_id)
        .order_by(Pagamento.id.asc())
        .all()
    )


def dados_venda(
    venda: Venda,
    pagamentos: list[Pagamento] | None = None,
):
    pagamentos = pagamentos or []

    total = dinheiro(venda.valor_total)
    recebido = dinheiro(
        sum(
            (dinheiro(p.valor) for p in pagamentos),
            ZERO,
        )
    )
    pendente = dinheiro(max(total - recebido, ZERO))

    cliente = venda.cliente

    return {
        "id": venda.id,
        "data": venda.data.isoformat(),
        "valor_total": float(total),
        "itens": [
            {
                "produto_id": item.produto_id,
                "produto": item.produto.nome,
                "quantidade": item.quantidade,
                "preco_unitario": float(
                    dinheiro(item.preco_unitario)
                ),
                "subtotal": float(dinheiro(item.subtotal)),
            }
            for item in venda.itens
        ],
        "pagamentos": [
            dados_pagamento(pagamento)
            for pagamento in pagamentos
        ],
        "valor_recebido": float(recebido),
        "valor_pendente": float(pendente),
        "status_pagamento": (
            "pago"
            if pendente == ZERO
            else "parcial"
            if recebido > ZERO
            else "pendente"
        ),
        "cliente": (
            {
                "id": cliente.id,
                "nome": cliente.nome,
                "whatsapp": cliente.whatsapp,
            }
            if cliente is not None
            else None
        ),
    }


def obter_ou_criar_cliente(
    db: Session,
    nome: str | None,
    whatsapp: str | None,
) -> Cliente:
    nome = (nome or "").strip()
    whatsapp_original = (whatsapp or "").strip()
    whatsapp_limpo = normalizar_whatsapp(whatsapp_original)

    if not nome:
        raise HTTPException(
            status_code=422,
            detail="Informe o nome do cliente para uma venda a prazo.",
        )

    if len(nome) > 150:
        raise HTTPException(
            status_code=422,
            detail="O nome do cliente deve ter até 150 caracteres.",
        )

    if len(whatsapp_limpo) < 10 or len(whatsapp_limpo) > 15:
        raise HTTPException(
            status_code=422,
            detail="Informe um WhatsApp válido com DDD.",
        )

    clientes = db.query(Cliente).all()

    for cliente in clientes:
        if normalizar_whatsapp(cliente.whatsapp) == whatsapp_limpo:
            # Reutiliza o cadastro existente, evitando duplicidade.
            return cliente

    cliente = Cliente(
        nome=nome,
        whatsapp=whatsapp_limpo,
    )

    db.add(cliente)
    db.flush()

    return cliente


@router.post("/")
def registrar_venda(
    dados: VendaCriacao,
    db: Session = Depends(obter_banco),
):
    quantidades = {}

    for item in dados.itens:
        quantidades[item.produto_id] = (
            quantidades.get(item.produto_id, 0)
            + item.quantidade
        )

    itens_calculados = []
    valor_total = ZERO

    try:
        # 1. Validar produtos e calcular o total.
        for produto_id, quantidade in quantidades.items():
            produto = db.get(Produto, produto_id)

            if produto is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Produto {produto_id} não encontrado.",
                )

            if not produto.ativo:
                raise HTTPException(
                    status_code=400,
                    detail=f"O produto '{produto.nome}' está desativado.",
                )

            if produto.estoque < quantidade:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Estoque insuficiente para '{produto.nome}'. "
                        f"Disponível: {produto.estoque}; "
                        f"solicitado: {quantidade}."
                    ),
                )

            preco = dinheiro(produto.preco)
            subtotal = dinheiro(preco * quantidade)
            valor_total = dinheiro(valor_total + subtotal)

            itens_calculados.append({
                "produto_id": produto.id,
                "quantidade": quantidade,
                "preco_unitario": preco,
                "subtotal": subtotal,
            })

        # 2. Normalizar os pagamentos recebidos.
        pagamentos_recebidos = []

        if dados.pagamentos is not None:
            pagamentos_recebidos = [
                {
                    "forma_pagamento": pagamento.forma_pagamento,
                    "valor": dinheiro(pagamento.valor),
                }
                for pagamento in dados.pagamentos
            ]
        else:
            valor_pago = None

            if dados.valor_pago is not None:
                valor_pago = dinheiro(dados.valor_pago)
            elif dados.forma_pagamento is not None:
                valor_pago = valor_total

            if valor_pago is not None:
                if valor_pago < ZERO:
                    raise HTTPException(
                        status_code=422,
                        detail="O valor pago não pode ser negativo.",
                    )

                if valor_pago > valor_total:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "O valor recebido não pode ser maior "
                            "que o total da venda."
                        ),
                    )

                if valor_pago > ZERO:
                    if dados.forma_pagamento is None:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Informe a forma de pagamento para "
                                "registrar um recebimento."
                            ),
                        )

                    pagamentos_recebidos.append({
                        "forma_pagamento": dados.forma_pagamento,
                        "valor": valor_pago,
                    })

        total_recebido = dinheiro(
            sum(
                (pagamento["valor"] for pagamento in pagamentos_recebidos),
                ZERO,
            )
        )

        if total_recebido > valor_total:
            raise HTTPException(
                status_code=400,
                detail=(
                    "A soma dos pagamentos não pode ser maior "
                    "que o total da venda."
                ),
            )

        # 3. Identificar o cliente somente quando houver saldo pendente.
        valor_pendente = dinheiro(
            max(valor_total - total_recebido, ZERO)
        )

        cliente = None

        if valor_pendente > ZERO:
            cliente = obter_ou_criar_cliente(
                db,
                dados.cliente_nome,
                dados.cliente_whatsapp,
            )

        # 4. Criar a venda e associar o cliente, quando necessário.
        venda = Venda(
            data=datetime.now(),
            valor_total=valor_total,
            cliente_id=cliente.id if cliente else None,
        )

        db.add(venda)
        db.flush()

        # 5. Registrar os itens e atualizar o estoque.
        for item in itens_calculados:
            db.add(
                ItemVenda(
                    venda_id=venda.id,
                    produto_id=item["produto_id"],
                    quantidade=item["quantidade"],
                    preco_unitario=item["preco_unitario"],
                    subtotal=item["subtotal"],
                )
            )

            resultado = db.execute(
                update(Produto)
                .where(
                    Produto.id == item["produto_id"],
                    Produto.ativo.is_(True),
                    Produto.estoque >= item["quantidade"],
                )
                .values(
                    estoque=Produto.estoque - item["quantidade"]
                )
                .execution_options(synchronize_session=False)
            )

            if resultado.rowcount != 1:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Não foi possível atualizar o estoque. "
                        "Confira a disponibilidade do produto."
                    ),
                )

        # 6. Registrar cada recebimento uma única vez.
        for pagamento in pagamentos_recebidos:
            pagamento_salvo = Pagamento(
                venda_id=venda.id,
                forma_pagamento=pagamento["forma_pagamento"],
                valor=pagamento["valor"],
                data=datetime.now(),
            )
            db.add(pagamento_salvo)
            db.flush()
            sincronizar_movimentacao_pagamento(db, pagamento_salvo)

        venda_id = venda.id
        db.commit()

        venda_salva = (
            db.query(Venda)
            .options(
                joinedload(Venda.itens).joinedload(ItemVenda.produto),
                joinedload(Venda.cliente),
            )
            .filter(Venda.id == venda_id)
            .first()
        )

        pagamentos_salvos = listar_pagamentos(db, venda_id)

        return {
            "mensagem": "Venda registrada com sucesso!",
            "venda": dados_venda(
                venda_salva,
                pagamentos_salvos,
            ),
            "pagamento": {
                "pagamentos": [
                    dados_pagamento(p)
                    for p in pagamentos_salvos
                ],
                "valor_recebido": float(total_recebido),
                "valor_pendente": float(valor_pendente),
            },
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível registrar a venda.",
        )


@router.get("/resumo-financeiro")
def resumo_financeiro(
    db: Session = Depends(obter_banco),
):
    vendas = db.query(Venda).all()
    pagamentos = db.query(Pagamento).all()

    total_vendido = dinheiro(
        sum(
            (dinheiro(venda.valor_total) for venda in vendas),
            ZERO,
        )
    )

    recebimentos_por_venda = {}

    for pagamento in pagamentos:
        venda_id = pagamento.venda_id
        recebimentos_por_venda[venda_id] = dinheiro(
            recebimentos_por_venda.get(venda_id, ZERO)
            + dinheiro(pagamento.valor)
        )

    total_recebido = dinheiro(
        sum(
            (dinheiro(pagamento.valor) for pagamento in pagamentos),
            ZERO,
        )
    )

    total_a_receber = ZERO
    vendas_pagas = 0
    vendas_parciais = 0
    vendas_pendentes = 0

    for venda in vendas:
        recebido = recebimentos_por_venda.get(venda.id, ZERO)
        pendente = dinheiro(
            max(dinheiro(venda.valor_total) - recebido, ZERO)
        )

        total_a_receber = dinheiro(total_a_receber + pendente)

        if pendente == ZERO:
            vendas_pagas += 1
        elif recebido > ZERO:
            vendas_parciais += 1
        else:
            vendas_pendentes += 1

    return {
        "quantidade_vendas": len(vendas),
        "total_vendido": float(total_vendido),
        "total_recebido": float(total_recebido),
        "total_a_receber": float(total_a_receber),
        "vendas_pagas": vendas_pagas,
        "vendas_parciais": vendas_parciais,
        "vendas_pendentes": vendas_pendentes,
    }


@router.get("/")
def listar_vendas(
    db: Session = Depends(obter_banco),
):
    vendas = (
        db.query(Venda)
        .options(
            joinedload(Venda.itens).joinedload(ItemVenda.produto),
            joinedload(Venda.cliente),
        )
        .order_by(Venda.id.desc())
        .all()
    )

    pagamentos = db.query(Pagamento).order_by(Pagamento.id.asc()).all()
    pagamentos_por_venda = {}

    for pagamento in pagamentos:
        pagamentos_por_venda.setdefault(
            pagamento.venda_id, []
        ).append(pagamento)

    return [
        dados_venda(
            venda,
            pagamentos_por_venda.get(venda.id, []),
        )
        for venda in vendas
    ]


@router.get("/{venda_id}")
def consultar_venda(
    venda_id: int,
    db: Session = Depends(obter_banco),
):
    venda = (
        db.query(Venda)
        .options(
            joinedload(Venda.itens).joinedload(ItemVenda.produto),
            joinedload(Venda.cliente),
        )
        .filter(Venda.id == venda_id)
        .first()
    )

    if venda is None:
        raise HTTPException(
            status_code=404,
            detail="Venda não encontrada.",
        )

    pagamentos = listar_pagamentos(db, venda_id)

    return dados_venda(venda, pagamentos)
