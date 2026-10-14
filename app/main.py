
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# Rotas do sistema
from app.routes.produtos import router as produtos_router
from app.routes.vendas import router as vendas_router
from app.routes.pagamentos import router as pagamentos_router
from app.routes.movimentacoes import router as movimentacoes_router
from app.routes.financeiro import router as financeiro_router
from app.routes.clientes import router as clientes_router
from app.init_db import inicializar_banco


@asynccontextmanager
async def lifespan(_app: FastAPI):
    inicializar_banco()
    yield


# Configuração principal da aplicação
app = FastAPI(
    title="MeuComércio",
    description="Sistema de gestão para pequenos comerciantes",
    version="1.0.0",
    lifespan=lifespan,
)


# Caminho da pasta app
BASE_DIR = Path(__file__).resolve().parent


# Arquivos estáticos: CSS, JavaScript e imagens
app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR / "static"),
    name="static",
)


# Templates HTML
templates = Jinja2Templates(
    directory=BASE_DIR / "templates",
)


# Registro das rotas
app.include_router(produtos_router)
app.include_router(vendas_router)
app.include_router(pagamentos_router)
app.include_router(movimentacoes_router)
app.include_router(financeiro_router)
app.include_router(clientes_router)


# Página inicial
@app.get("/")
def inicio(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={},
    )


# Verificação da aplicação
@app.get("/saude")
def verificar_saude():
    return {
        "status": "funcionando",
        "sistema": "MeuComércio",
    }
