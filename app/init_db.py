
from sqlalchemy import inspect, text

from app.database.connection import Base, SessionLocal, engine

# Importa os modelos para registrar todas as tabelas.
from app.models.produto import Produto
from app.models.cliente import Cliente
from app.models.venda import Venda, ItemVenda
from app.models.pagamento import Pagamento
from app.models.movimentacao import Movimentacao
from app.models.entrada_estoque import EntradaEstoque, ItemEntradaEstoque
from app.services.movimentacoes import sincronizar_movimentacao_pagamento


def inicializar_banco():
    # Cria somente as tabelas que ainda não existem.
    # Não apaga nem substitui os registros existentes.
    Base.metadata.create_all(bind=engine)

    # Confere se a coluna cliente_id já existe na tabela vendas.
    inspetor = inspect(engine)

    if inspetor.has_table("vendas"):
        colunas_vendas = {
            coluna["name"]
            for coluna in inspetor.get_columns("vendas")
        }

        # Migração compatível com bancos criados anteriormente.
        if "cliente_id" not in colunas_vendas:
            with engine.begin() as conexao:
                conexao.execute(
                    text(
                        "ALTER TABLE vendas "
                        "ADD COLUMN cliente_id INTEGER "
                        "REFERENCES clientes(id)"
                    )
                )

            print("Migração concluída: coluna cliente_id adicionada.")

    # Produtos existentes recebem fornecedor vazio sem afetar os registros.
    inspetor = inspect(engine)
    if inspetor.has_table("produtos"):
        colunas_produtos = {
            coluna["name"]
            for coluna in inspetor.get_columns("produtos")
        }
        if "fornecedor" not in colunas_produtos:
            with engine.begin() as conexao:
                conexao.execute(
                    text("ALTER TABLE produtos ADD COLUMN fornecedor VARCHAR(150)")
                )
            print("Migração concluída: coluna fornecedor adicionada aos produtos.")

    inspetor = inspect(engine)
    if inspetor.has_table("entradas_estoque"):
        colunas_entradas = {
            coluna["name"]
            for coluna in inspetor.get_columns("entradas_estoque")
        }
        if "movimentacao_id" not in colunas_entradas:
            with engine.begin() as conexao:
                conexao.execute(
                    text(
                        "ALTER TABLE entradas_estoque "
                        "ADD COLUMN movimentacao_id INTEGER "
                        "REFERENCES movimentacoes_financeiras(id)"
                    )
                )
            print("Migração concluída: vínculo financeiro das entradas adicionado.")

    inspetor = inspect(engine)
    if inspetor.has_table("pagamentos"):
        colunas_pagamentos = {
            coluna["name"]
            for coluna in inspetor.get_columns("pagamentos")
        }
        if "movimentacao_id" not in colunas_pagamentos:
            with engine.begin() as conexao:
                conexao.execute(
                    text(
                        "ALTER TABLE pagamentos "
                        "ADD COLUMN movimentacao_id INTEGER "
                        "REFERENCES movimentacoes_financeiras(id)"
                    )
                )
            print("Migração concluída: vínculo financeiro dos pagamentos adicionado.")

    # Pagamentos já existentes também passam a aparecer como entradas.
    db = SessionLocal()
    try:
        pagamentos_sem_movimentacao = (
            db.query(Pagamento)
            .filter(Pagamento.movimentacao_id.is_(None))
            .order_by(Pagamento.id.asc())
            .all()
        )
        for pagamento in pagamentos_sem_movimentacao:
            sincronizar_movimentacao_pagamento(db, pagamento)
        if pagamentos_sem_movimentacao:
            db.commit()
            print(
                "Movimentações de vendas sincronizadas: "
                f"{len(pagamentos_sem_movimentacao)} recebimento(s)."
            )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("Banco de dados inicializado.")
    print("Os registros existentes foram preservados.")


if __name__ == "__main__":
    inicializar_banco()
