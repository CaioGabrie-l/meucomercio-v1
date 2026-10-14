
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session, selectinload

from app.database.connection import SessionLocal
from app.database.money import dinheiro
from app.models.entrada_estoque import EntradaEstoque, ItemEntradaEstoque
from app.models.movimentacao import Movimentacao
from app.models.produto import Produto


router = APIRouter(
    prefix="/produtos",
    tags=["Produtos"],
)


CENTAVO = Decimal("0.01")


def obter_banco():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


class ProdutoCriacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    fornecedor: str | None = Field(default=None, max_length=150)
    preco: Decimal = Field(
        gt=0,
        max_digits=10,
        decimal_places=2,
    )
    estoque: int = Field(ge=0)

    @field_validator("preco", mode="before")
    @classmethod
    def validar_preco(cls, valor):
        try:
            preco = Decimal(str(valor))

            if not preco.is_finite():
                raise ValueError

            return preco.quantize(
                CENTAVO,
                rounding=ROUND_HALF_UP,
            )
        except Exception:
            raise ValueError("Informe um preço válido.")


class ProdutoAtualizacao(BaseModel):
    nome: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    fornecedor: str | None = Field(default=None, max_length=150)
    preco: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=10,
        decimal_places=2,
    )
    estoque: int | None = Field(default=None, ge=0)
    ativo: bool | None = None

    @field_validator("preco", mode="before")
    @classmethod
    def validar_preco(cls, valor):
        if valor is None:
            return valor

        try:
            preco = Decimal(str(valor))

            if not preco.is_finite():
                raise ValueError

            return preco.quantize(
                CENTAVO,
                rounding=ROUND_HALF_UP,
            )
        except Exception:
            raise ValueError("Informe um preço válido.")


def dados_produto(produto: Produto):
    return {
        "id": produto.id,
        "nome": produto.nome,
        "fornecedor": produto.fornecedor or "",
        "preco": float(dinheiro(produto.preco)),
        "estoque": produto.estoque,
        "ativo": produto.ativo,
    }


@router.post("/")
def cadastrar_produto(
    dados: ProdutoCriacao,
    db: Session = Depends(obter_banco),
):
    nome = dados.nome.strip()

    if not nome:
        raise HTTPException(
            status_code=422,
            detail="O nome do produto não pode ficar vazio.",
        )

    produto = Produto(
        nome=nome,
        fornecedor=(dados.fornecedor or "").strip() or None,
        preco=dinheiro(dados.preco),
        estoque=dados.estoque,
    )

    try:
        db.add(produto)
        db.commit()
        db.refresh(produto)

        return {
            "mensagem": "Produto cadastrado com sucesso!",
            "produto": dados_produto(produto),
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível cadastrar o produto.",
        )


@router.get("/")
def listar_produtos(
    db: Session = Depends(obter_banco),
):
    produtos = (
        db.query(Produto)
        .order_by(Produto.id.asc())
        .all()
    )

    return [dados_produto(produto) for produto in produtos]


def dados_entrada(entrada: EntradaEstoque):
    return {
        "id": entrada.id,
        "fornecedor": entrada.fornecedor,
        "valor_total_pago": float(dinheiro(entrada.valor_total_pago)),
        "data": entrada.data.isoformat(),
        "itens": [
            {
                "produto_id": item.produto_id,
                "produto": item.produto.nome,
                "quantidade": item.quantidade,
            }
            for item in entrada.itens
        ],
    }


@router.get("/entradas")
def listar_entradas_estoque(
    db: Session = Depends(obter_banco),
):
    entradas = (
        db.query(EntradaEstoque)
        .options(
            selectinload(EntradaEstoque.itens).selectinload(
                ItemEntradaEstoque.produto
            )
        )
        .order_by(EntradaEstoque.data.desc(), EntradaEstoque.id.desc())
        .all()
    )
    return [dados_entrada(entrada) for entrada in entradas]


@router.get("/{produto_id}")
def consultar_produto(
    produto_id: int,
    db: Session = Depends(obter_banco),
):
    produto = db.get(Produto, produto_id)

    if produto is None:
        raise HTTPException(
            status_code=404,
            detail="Produto não encontrado.",
        )

    return dados_produto(produto)


@router.patch("/{produto_id}")
def atualizar_produto(
    produto_id: int,
    dados: ProdutoAtualizacao,
    db: Session = Depends(obter_banco),
):
    produto = db.get(Produto, produto_id)

    if produto is None:
        raise HTTPException(
            status_code=404,
            detail="Produto não encontrado.",
        )

    alteracoes = dados.model_dump(exclude_unset=True)

    if not alteracoes:
        raise HTTPException(
            status_code=422,
            detail="Informe pelo menos um campo para alterar.",
        )

    if "nome" in alteracoes:
        nome = alteracoes["nome"]

        if nome is None or not nome.strip():
            raise HTTPException(
                status_code=422,
                detail="O nome do produto não pode ficar vazio.",
            )

        produto.nome = nome.strip()

    if "fornecedor" in alteracoes:
        fornecedor = alteracoes["fornecedor"]
        produto.fornecedor = (fornecedor or "").strip() or None

    if "preco" in alteracoes:
        if alteracoes["preco"] is None:
            raise HTTPException(
                status_code=422,
                detail="O preço não pode ficar vazio.",
            )

        produto.preco = dinheiro(alteracoes["preco"])

    if "estoque" in alteracoes:
        if alteracoes["estoque"] is None:
            raise HTTPException(
                status_code=422,
                detail="O estoque não pode ficar vazio.",
            )

        produto.estoque = alteracoes["estoque"]

    if "ativo" in alteracoes:
        if alteracoes["ativo"] is None:
            raise HTTPException(
                status_code=422,
                detail="O campo ativo não pode ficar vazio.",
            )

        produto.ativo = alteracoes["ativo"]

    try:
        db.commit()
        db.refresh(produto)

        return {
            "mensagem": "Produto atualizado com sucesso!",
            "produto": dados_produto(produto),
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível atualizar o produto.",
        )


class ItemEntradaCriacao(BaseModel):
    produto_id: int = Field(gt=0)
    quantidade: int = Field(gt=0, le=999999999)


class EntradaEstoqueCriacao(BaseModel):
    fornecedor: str = Field(min_length=1, max_length=150)
    valor_total_pago: Decimal = Field(
        gt=0,
        max_digits=10,
        decimal_places=2,
    )
    itens: list[ItemEntradaCriacao] = Field(min_length=1)

    @field_validator("fornecedor")
    @classmethod
    def validar_fornecedor(cls, valor):
        fornecedor = valor.strip()
        if not fornecedor:
            raise ValueError("Informe o fornecedor.")
        return fornecedor

    @field_validator("valor_total_pago", mode="before")
    @classmethod
    def validar_valor_total(cls, valor):
        try:
            total = Decimal(str(valor))
            if not total.is_finite() or total <= 0:
                raise ValueError
            total_centavos = total.quantize(CENTAVO, rounding=ROUND_HALF_UP)
            if total != total_centavos:
                raise ValueError
            return total_centavos
        except Exception:
            raise ValueError(
                "Informe um valor total positivo e com até duas casas decimais."
            )

    @model_validator(mode="after")
    def validar_produtos_sem_repeticao(self):
        ids = [item.produto_id for item in self.itens]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada produto deve aparecer apenas uma vez na entrada.")
        return self


@router.post("/entradas")
def registrar_entrada_estoque(
    dados: EntradaEstoqueCriacao,
    db: Session = Depends(obter_banco),
):
    ids_produtos = [item.produto_id for item in dados.itens]
    produtos = (
        db.query(Produto)
        .filter(Produto.id.in_(ids_produtos))
        .all()
    )
    produtos_por_id = {produto.id: produto for produto in produtos}
    ausentes = [
        produto_id
        for produto_id in ids_produtos
        if produto_id not in produtos_por_id
    ]
    if ausentes:
        raise HTTPException(
            status_code=404,
            detail="Um ou mais produtos não foram encontrados.",
        )
    if any(not produtos_por_id[produto_id].ativo for produto_id in ids_produtos):
        raise HTTPException(
            status_code=422,
            detail="A entrada só pode incluir produtos ativos.",
        )

    entrada = EntradaEstoque(
        fornecedor=dados.fornecedor,
        valor_total_pago=dinheiro(dados.valor_total_pago),
        data=datetime.now(),
    )
    for item in dados.itens:
        produto = produtos_por_id[item.produto_id]
        produto.estoque += item.quantidade
        produto.fornecedor = dados.fornecedor
        entrada.itens.append(
            ItemEntradaEstoque(
                produto_id=produto.id,
                quantidade=item.quantidade,
            )
        )

    movimentacao = Movimentacao(
        tipo="saida",
        descricao=f"Compra de produtos - {dados.fornecedor}"[:150],
        categoria="Despesa",
        valor=dinheiro(dados.valor_total_pago),
        data=entrada.data,
    )

    try:
        db.add(movimentacao)
        db.flush()
        entrada.movimentacao_id = movimentacao.id
        db.add(entrada)
        db.commit()
        db.refresh(entrada)
        return {
            "mensagem": "Entrada de produtos registrada e despesa lançada no financeiro.",
            "entrada": dados_entrada(entrada),
        }
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível registrar a entrada de produtos.",
        )


@router.put("/entradas/{entrada_id}")
def atualizar_entrada_estoque(
    entrada_id: int,
    dados: EntradaEstoqueCriacao,
    db: Session = Depends(obter_banco),
):
    entrada = (
        db.query(EntradaEstoque)
        .options(
            selectinload(EntradaEstoque.itens).selectinload(
                ItemEntradaEstoque.produto
            )
        )
        .filter(EntradaEstoque.id == entrada_id)
        .first()
    )
    if entrada is None:
        raise HTTPException(status_code=404, detail="Entrada não encontrada.")

    movimentacao = (
        db.get(Movimentacao, entrada.movimentacao_id)
        if entrada.movimentacao_id
        else None
    )
    if movimentacao is None:
        # Reconhece entradas antigas pelo padrão exato gerado no registro inicial.
        candidatas = (
            db.query(Movimentacao)
            .filter(
                Movimentacao.tipo == "saida",
                Movimentacao.categoria == "Despesa",
                Movimentacao.descricao
                == f"Compra de produtos - {entrada.fornecedor}"[:150],
                Movimentacao.valor == dinheiro(entrada.valor_total_pago),
                Movimentacao.data == entrada.data,
            )
            .all()
        )
        if len(candidatas) != 1:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Não foi possível identificar com segurança a despesa desta compra. "
                    "Ela continua no histórico, mas não pode ser editada."
                ),
            )
        movimentacao = candidatas[0]
        entrada.movimentacao_id = movimentacao.id

    itens_anteriores = {
        item.produto_id: item.quantidade
        for item in entrada.itens
    }
    quantidades_novas = {
        item.produto_id: item.quantidade
        for item in dados.itens
    }
    ids_afetados = set(itens_anteriores) | set(quantidades_novas)
    produtos = (
        db.query(Produto)
        .filter(Produto.id.in_(ids_afetados))
        .all()
    )
    produtos_por_id = {produto.id: produto for produto in produtos}
    if ids_afetados - produtos_por_id.keys():
        raise HTTPException(
            status_code=409,
            detail="Um produto desta compra não está mais disponível no cadastro.",
        )

    for produto_id in quantidades_novas:
        produto = produtos_por_id[produto_id]
        if not produto.ativo and produto_id not in itens_anteriores:
            raise HTTPException(
                status_code=422,
                detail="A edição não pode adicionar um produto inativo.",
            )

    for produto_id in ids_afetados:
        produto = produtos_por_id[produto_id]
        estoque_atualizado = (
            produto.estoque
            - itens_anteriores.get(produto_id, 0)
            + quantidades_novas.get(produto_id, 0)
        )
        if estoque_atualizado < 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Não é possível reduzir a quantidade de {produto.nome}: "
                    "o estoque atual já considera unidades vendidas."
                ),
            )
        produto.estoque = estoque_atualizado

    fornecedor_anterior = entrada.fornecedor
    entrada.fornecedor = dados.fornecedor
    entrada.valor_total_pago = dinheiro(dados.valor_total_pago)
    entrada.itens.clear()
    entrada.itens.extend(
        ItemEntradaEstoque(
            produto_id=item.produto_id,
            quantidade=item.quantidade,
        )
        for item in dados.itens
    )

    for produto_id in quantidades_novas:
        produto = produtos_por_id[produto_id]
        if produto.fornecedor != fornecedor_anterior:
            continue
        ultima_entrada = (
            db.query(ItemEntradaEstoque.entrada_id)
            .join(
                EntradaEstoque,
                EntradaEstoque.id == ItemEntradaEstoque.entrada_id,
            )
            .filter(ItemEntradaEstoque.produto_id == produto_id)
            .order_by(EntradaEstoque.data.desc(), EntradaEstoque.id.desc())
            .first()
        )
        if ultima_entrada and ultima_entrada[0] == entrada.id:
            produto.fornecedor = dados.fornecedor

    movimentacao.tipo = "saida"
    movimentacao.categoria = "Despesa"
    movimentacao.descricao = f"Compra de produtos - {dados.fornecedor}"[:150]
    movimentacao.valor = dinheiro(dados.valor_total_pago)

    try:
        db.commit()
        db.refresh(entrada)
        return {
            "mensagem": "Entrada atualizada; estoque e despesa financeira ajustados.",
            "entrada": dados_entrada(entrada),
        }
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível atualizar a entrada de produtos.",
        )


@router.patch("/{produto_id}/desativar")
def desativar_produto(
    produto_id: int,
    db: Session = Depends(obter_banco),
):
    produto = db.get(Produto, produto_id)

    if produto is None:
        raise HTTPException(
            status_code=404,
            detail="Produto não encontrado.",
        )

    if not produto.ativo:
        raise HTTPException(
            status_code=400,
            detail="Este produto já está desativado.",
        )

    produto.ativo = False

    try:
        db.commit()
        db.refresh(produto)

        return {
            "mensagem": "Produto desativado com sucesso!",
            "produto": dados_produto(produto),
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível desativar o produto.",
        )


@router.patch("/{produto_id}/reativar")
def reativar_produto(
    produto_id: int,
    db: Session = Depends(obter_banco),
):
    produto = db.get(Produto, produto_id)

    if produto is None:
        raise HTTPException(
            status_code=404,
            detail="Produto não encontrado.",
        )

    if produto.ativo:
        raise HTTPException(
            status_code=400,
            detail="Este produto já está ativo.",
        )

    produto.ativo = True

    try:
        db.commit()
        db.refresh(produto)

        return {
            "mensagem": "Produto reativado com sucesso!",
            "produto": dados_produto(produto),
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Não foi possível reativar o produto.",
        )
