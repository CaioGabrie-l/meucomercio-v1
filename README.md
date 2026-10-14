# MeuComércio

O MeuComércio é um sistema de gestão comercial que estou desenvolvendo para ajudar pequenos negócios a organizar melhor seus produtos, vendas e finanças.

A ideia é reunir essas informações em um só lugar, facilitando o controle do estoque, o acompanhamento das vendas e a visualização da movimentação financeira.

## O que o sistema faz

- Cadastro de produtos e fornecedores.
- Controle de estoque e registro de entradas de produtos.
- Registro de vendas com pagamentos em dinheiro, Pix e cartão.
- Cadastro de clientes e controle de vendas a prazo.
- Acompanhamento de pagamentos pendentes.
- Registro de recebimentos, despesas e retiradas.
- Painel com gráficos de vendas, formas de pagamento e situação do estoque.

## Tecnologias utilizadas

**Backend**
- Python
- FastAPI
- Pydantic
- SQLAlchemy

**Banco de dados**
- SQLite

**Frontend**
- HTML
- CSS
- JavaScript

## Como executar o projeto

Para rodar o MeuComércio localmente, é necessário ter o Python 3.10 ou superior instalado.

### Windows (PowerShell)

Clone o repositório e entre na pasta do projeto. Depois, execute os comandos:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

### macOS ou Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Com o servidor em execução, abra no navegador:

- **Sistema:** http://127.0.0.1:8000
- **Documentação da API:** http://127.0.0.1:8000/docs

A documentação permite visualizar e testar os endpoints disponibilizados pelo FastAPI.

## Testes

O projeto também conta com testes automatizados.

Para instalar as dependências de desenvolvimento e executar os testes, utilize:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

O comando exibirá o resultado da execução dos testes no terminal.

## Banco de dados

O sistema utiliza SQLite para armazenar os dados. Na primeira inicialização, o aplicativo cria o arquivo `meucomercio.db` na raiz do projeto e prepara as tabelas necessárias.

Os arquivos do banco de dados e as cópias de segurança são mantidos fora do versionamento do Git.

## Organização dos arquivos

O código está separado por responsabilidades para facilitar a manutenção e a evolução do sistema.

```text
app/
├── database/   # Conexão com o banco e tipos monetários
├── models/     # Modelos das entidades
├── routes/     # Rotas e endpoints da API
├── services/   # Regras compartilhadas da aplicação
├── static/     # CSS, JavaScript e ícones
└── templates/  # Páginas HTML

tests/          # Testes automatizados
```

## Sobre o projeto

O MeuComércio faz parte da minha jornada de aprendizado em desenvolvimento de software, enquanto curso Análise e Desenvolvimento de Sistemas.

Neste projeto, estou colocando em prática conhecimentos de Python, APIs, bancos de dados, organização de código e desenvolvimento web, construindo uma aplicação que pode evoluir conforme meus estudos.

## Autor

**Studio C.G. Cassemiro**

Projeto desenvolvido por Caio Gabriel.