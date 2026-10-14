
let produtosCarregados = [];
let produtoEmEdicao = null;
let salvandoProduto = false;
let modalProduto = null;

function formatarMoeda(valor) {
    return Number(valor ?? 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function atualizarTexto(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor ?? "";
}

function atualizarValor(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.value = valor ?? "";
}

function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined && texto !== null) {
        elemento.textContent = texto;
    }
    return elemento;
}

async function lerResposta(resposta) {
    const texto = await resposta.text();
    if (!texto) return {};

    try {
        return JSON.parse(texto);
    } catch {
        return { detail: texto };
    }
}

function mensagemDaResposta(dados, padrao) {
    if (typeof dados?.detail === "string") return dados.detail;

    if (Array.isArray(dados?.detail)) {
        return dados.detail.map((erro) => {
            const campo = Array.isArray(erro.loc)
                ? erro.loc.filter((parte) => parte !== "body").join(".")
                : "";
            return campo ? `${campo}: ${erro.msg}` : erro.msg;
        }).join(" | ");
    }

    return typeof dados?.mensagem === "string"
        ? dados.mensagem
        : padrao;
}

async function requisitarJSON(url, opcoes = {}) {
    const resposta = await fetch(url, opcoes);
    const dados = await lerResposta(resposta);

    if (!resposta.ok) {
        throw new Error(
            mensagemDaResposta(dados, "Não foi possível concluir a operação.")
        );
    }

    return dados;
}

/* =====================================================
   POP-UP DE PRODUTOS
   ===================================================== */

function adicionarEstilosModalProduto() {
    if (document.getElementById("mc-product-modal-styles")) return;

    const estilo = document.createElement("style");
    estilo.id = "mc-product-modal-styles";
    estilo.textContent = `
        #btn-novo-produto {
            background: #191919 !important;
            color: #fff !important;
            border: 1px solid #191919 !important;
            border-radius: 10px !important;
            padding: 12px 18px !important;
            font-weight: 600 !important;
            cursor: pointer;
        }

        #btn-novo-produto:hover {
            background: #353535 !important;
        }

        .mc-product-overlay {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(0, 0, 0, .62);
            backdrop-filter: blur(5px);
            overflow-y: auto;
        }

        .mc-product-overlay[hidden] {
            display: none !important;
        }

        .mc-product-dialog {
            width: min(680px, 100%);
            max-height: calc(100vh - 40px);
            overflow-y: auto;
            color: #191919;
            background: #fff;
            border-radius: 16px;
            box-shadow: 0 24px 80px rgba(0, 0, 0, .3);
        }

        .mc-product-dialog-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            padding: 24px;
            background: #191919;
            color: #fff;
        }

        .mc-product-dialog-header p {
            margin: 0 0 8px;
        }

        .mc-product-dialog-kicker {
            color: #c4c4c4;
            font-size: 10px;
            letter-spacing: 1.5px;
            font-weight: 700;
        }

        .mc-product-dialog-title {
            color: #fff;
            font-size: 25px;
            margin: 0;
        }

        .mc-product-dialog-subtitle {
            color: #d0d0d0;
            font-size: 13px;
            margin-top: 8px !important;
        }

        .mc-product-modal-close {
            flex-shrink: 0;
            width: 38px;
            height: 38px;
            border: 1px solid #444;
            border-radius: 9px;
            background: #292929;
            color: #fff;
            font-size: 25px;
            cursor: pointer;
        }

        .mc-product-dialog-body {
            padding: 26px;
        }

        .mc-product-dialog-body #formulario-produto {
            display: block !important;
            margin: 0;
        }

        .mc-product-dialog-body #formulario-produto[hidden] {
            display: none !important;
        }

        .mc-product-dialog-body .product-form-fields {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
        }

        .mc-product-dialog-body .form-group:first-child {
            grid-column: 1 / -1;
        }

        .mc-product-dialog-body .form-group label {
            display: block;
            margin-bottom: 8px;
            font-size: 13px;
            font-weight: 600;
        }

        .mc-product-dialog-body .form-group input {
            box-sizing: border-box;
            width: 100%;
            min-height: 45px;
            padding: 11px 12px;
            border: 1px solid #ddd;
            border-radius: 9px;
            font: inherit;
        }

        .mc-product-dialog-body .form-group input:focus {
            outline: 2px solid #777;
            outline-offset: 1px;
        }

        .mc-product-dialog-body .product-form-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }

        .mc-product-dialog-body .product-form-actions button {
            min-height: 43px;
            padding: 10px 16px;
            border-radius: 9px;
            font: inherit;
            font-weight: 600;
            cursor: pointer;
        }

        .mc-product-dialog-body #btn-salvar-produto {
            background: #191919;
            color: #fff;
            border: 1px solid #191919;
        }

        .mc-product-dialog-body #btn-cancelar-produto {
            background: #fff;
            color: #222;
            border: 1px solid #ddd;
        }

        .mc-product-dialog-body button:disabled {
            opacity: .6;
            cursor: wait;
        }

        @media (max-width: 560px) {
            .mc-product-overlay {
                align-items: flex-start;
                padding: 12px;
            }

            .mc-product-dialog {
                max-height: calc(100vh - 24px);
            }

            .mc-product-dialog-header,
            .mc-product-dialog-body {
                padding: 20px;
            }

            .mc-product-dialog-body .product-form-fields {
                grid-template-columns: 1fr;
            }

            .mc-product-dialog-body .form-group:first-child {
                grid-column: auto;
            }

            .mc-product-dialog-body .product-form-actions {
                flex-direction: column;
            }

            .mc-product-dialog-body .product-form-actions button {
                width: 100%;
            }
        }
    `;

    document.head.appendChild(estilo);
}

function prepararModalProduto() {
    const formulario = document.getElementById("formulario-produto");
    if (!formulario) {
        console.error("MeuComércio: formulário de produtos não encontrado.");
        return;
    }

    adicionarEstilosModalProduto();

    const modalExistente = document.getElementById("mc-product-overlay");
    if (modalExistente) {
        modalProduto = modalExistente;
        return;
    }

    modalProduto = criarElemento("div", "mc-product-overlay");
    modalProduto.id = "mc-product-overlay";
    modalProduto.hidden = true;

    const dialogo = criarElemento("section", "mc-product-dialog");
    dialogo.setAttribute("role", "dialog");
    dialogo.setAttribute("aria-modal", "true");
    dialogo.setAttribute("aria-labelledby", "mc-product-modal-title");

    const cabecalho = criarElemento("header", "mc-product-dialog-header");
    const blocoTitulo = document.createElement("div");

    blocoTitulo.append(
        criarElemento("p", "mc-product-dialog-kicker", "MEUCOMÉRCIO / CATÁLOGO")
    );

    const titulo = criarElemento("h2", "mc-product-dialog-title", "Novo produto");
    titulo.id = "mc-product-modal-title";

    const subtitulo = criarElemento(
        "p",
        "mc-product-dialog-subtitle",
        "Cadastre e organize os produtos do seu negócio."
    );

    blocoTitulo.append(titulo, subtitulo);

    const fechar = criarElemento("button", "mc-product-modal-close", "×");
    fechar.type = "button";
    fechar.setAttribute("aria-label", "Fechar janela");

    cabecalho.append(blocoTitulo, fechar);

    const corpo = criarElemento("div", "mc-product-dialog-body");
    corpo.appendChild(formulario);
    dialogo.append(cabecalho, corpo);
    modalProduto.appendChild(dialogo);
    document.body.appendChild(modalProduto);

    fechar.addEventListener("click", () => {
        definirModoFormulario("novo");
        fecharFormularioProduto();
    });

    modalProduto.addEventListener("click", (evento) => {
        if (evento.target === modalProduto) {
            definirModoFormulario("novo");
            fecharFormularioProduto();
        }
    });

    document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape" && modalProduto && !modalProduto.hidden) {
            definirModoFormulario("novo");
            fecharFormularioProduto();
        }
    });
}

function abrirFormularioProduto() {
    const formulario = document.getElementById("formulario-produto");

    if (!formulario) return;

    // Tenta preparar o pop-up caso a página tenha inicializado tardiamente.
    if (!modalProduto || !document.body.contains(modalProduto)) {
        prepararModalProduto();
    }

    if (!modalProduto) {
        alert("Não foi possível abrir o formulário de produtos. Atualize a página.");
        return;
    }

    formulario.hidden = false;
    modalProduto.hidden = false;
    document.body.classList.add("mc-modal-aberto");

    const botao = document.getElementById("btn-novo-produto");
    if (botao) botao.setAttribute("aria-expanded", "true");

    document.getElementById("produto-nome")?.focus({ preventScroll: true });
}

function fecharFormularioProduto() {
    if (salvandoProduto) return;

    if (modalProduto) modalProduto.hidden = true;

    document.body.classList.remove("mc-modal-aberto");

    const botao = document.getElementById("btn-novo-produto");
    if (botao) {
        botao.setAttribute("aria-expanded", "false");
        botao.textContent = "+ Novo produto";
    }
}

function definirMensagemFormulario(mensagem, tipo = "") {
    const elemento = document.getElementById("mensagem-formulario-produto");
    if (!elemento) return;

    elemento.textContent = mensagem;
    elemento.classList.remove("form-feedback-success", "form-feedback-error");

    if (tipo === "sucesso") elemento.classList.add("form-feedback-success");
    if (tipo === "erro") elemento.classList.add("form-feedback-error");

    elemento.hidden = !mensagem;
}

function exibirMensagemAcoesProdutos(mensagem, tipo = "") {
    const elemento = document.getElementById("mensagem-acoes-produtos");
    if (!elemento) return;

    elemento.textContent = mensagem;
    elemento.classList.remove("form-feedback-success", "form-feedback-error");

    if (tipo === "sucesso") elemento.classList.add("form-feedback-success");
    if (tipo === "erro") elemento.classList.add("form-feedback-error");

    elemento.hidden = !mensagem;
}

function definirModoFormulario(modo, produto = null) {
    produtoEmEdicao = modo === "edicao" && produto ? produto.id : null;

    const etiqueta = document.getElementById("produto-formulario-etiqueta");
    const titulo = document.getElementById("produto-formulario-titulo");
    const descricao = document.getElementById("produto-formulario-descricao");
    const botaoSalvar = document.getElementById("btn-salvar-produto");
    const tituloModal = document.getElementById("mc-product-modal-title");
    const formulario = document.getElementById("formulario-produto");

    if (modo === "edicao" && produto) {
        if (etiqueta) etiqueta.textContent = "EDIÇÃO DE CADASTRO";
        if (titulo) titulo.textContent = "Editar produto";
        if (descricao) descricao.textContent = "Altere os dados do produto e salve as mudanças.";
        if (botaoSalvar) botaoSalvar.textContent = "Salvar alterações";
        if (tituloModal) tituloModal.textContent = "Editar produto";

        atualizarValor("produto-nome", produto.nome ?? "");
        atualizarValor("produto-fornecedor", produto.fornecedor ?? "");
        atualizarValor("produto-preco", produto.preco ?? "");
        atualizarValor("produto-estoque", produto.estoque ?? 0);
    } else {
        if (etiqueta) etiqueta.textContent = "NOVO CADASTRO";
        if (titulo) titulo.textContent = "Cadastrar produto";
        if (descricao) descricao.textContent = "Preencha os dados para adicionar um produto ao estoque.";
        if (botaoSalvar) botaoSalvar.textContent = "Salvar produto";
        if (tituloModal) tituloModal.textContent = "Novo produto";

        formulario?.reset();
        atualizarValor("produto-fornecedor", "");
        atualizarValor("produto-estoque", "0");
    }

    definirMensagemFormulario("");
}

/* =====================================================
   LISTAGEM, BUSCA E FILTROS DE PRODUTOS
   ===================================================== */

function criarCelula(texto) {
    return criarElemento("td", "", texto);
}

function exibirMensagemProdutos(mensagem) {
    const lista = document.getElementById("lista-produtos");
    if (!lista) return;

    lista.replaceChildren();

    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    celula.colSpan = 7;
    celula.textContent = mensagem;

    linha.appendChild(celula);
    lista.appendChild(linha);
}

function obterFiltroProdutos() {
    return document.getElementById("filtro-produtos")?.value ?? "ativos";
}

function obterBuscaProdutos() {
    return (document.getElementById("pesquisa-produtos")?.value ?? "")
        .trim()
        .toLocaleLowerCase("pt-BR");
}

function atualizarResumoProdutos() {
    const ativos = produtosCarregados.filter((produto) => produto.ativo);
    const estoqueBaixo = ativos.filter((produto) => Number(produto.estoque) <= 5);

    atualizarTexto("total-produtos", ativos.length);
    atualizarTexto("total-estoque-baixo", estoqueBaixo.length);
}

function obterSituacaoProduto(produto) {
    if (!produto.ativo) return { texto: "Inativo", classe: "status-inactive" };

    const estoque = Number(produto.estoque);
    if (estoque <= 0) return { texto: "Sem estoque", classe: "status-out" };
    if (estoque <= 5) return { texto: "Estoque baixo", classe: "status-low" };
    if (estoque <= 10) return { texto: "Estoque médio", classe: "status-medium" };

    return { texto: "Estoque alto", classe: "status-high" };
}

function criarBotaoAcaoProduto(texto, acao, produto, classeExtra = "") {
    const botao = criarElemento(
        "button",
        `product-action-button ${classeExtra}`.trim(),
        texto
    );

    botao.type = "button";
    botao.dataset.acaoProduto = acao;
    botao.dataset.produtoId = String(produto.id);

    return botao;
}

function criarCelulaAcoes(produto) {
    const celula = criarElemento("td", "product-actions");

    celula.appendChild(criarBotaoAcaoProduto("Editar", "editar", produto));

    if (produto.ativo) {
        celula.appendChild(
            criarBotaoAcaoProduto("Desativar", "desativar", produto, "product-action-danger")
        );
    } else {
        celula.appendChild(criarBotaoAcaoProduto("Reativar", "reativar", produto));
    }

    return celula;
}

function criarIndicadorSituacao(produto) {
    const situacao = obterSituacaoProduto(produto);
    const celula = document.createElement("td");

    celula.appendChild(
        criarElemento("span", `stock-badge ${situacao.classe}`, situacao.texto)
    );

    return celula;
}

function renderizarProdutos() {
    const lista = document.getElementById("lista-produtos");
    if (!lista) return;

    const filtro = obterFiltroProdutos();
    const busca = obterBuscaProdutos();

    let filtrados = [...produtosCarregados];

    if (filtro === "ativos") {
        filtrados = filtrados.filter((produto) => produto.ativo);
    } else if (filtro === "inativos") {
        filtrados = filtrados.filter((produto) => !produto.ativo);
    } else if (filtro === "estoque-baixo") {
        filtrados = filtrados.filter(
            (produto) => produto.ativo &&
                Number(produto.estoque) > 0 &&
                Number(produto.estoque) <= 5
        );
    }

    if (busca) {
        filtrados = filtrados.filter((produto) =>
            `${produto.nome ?? ""} ${produto.fornecedor ?? ""}`
                .toLocaleLowerCase("pt-BR")
                .includes(busca)
        );
    }

    atualizarTexto("contador-produtos", filtrados.length);

    if (filtrados.length === 0) {
        exibirMensagemProdutos(
            produtosCarregados.length === 0
                ? "Nenhum produto cadastrado."
                : "Nenhum produto encontrado com esses filtros."
        );
        return;
    }

    const fragmento = document.createDocumentFragment();

    filtrados.forEach((produto) => {
        const linha = document.createElement("tr");
        linha.append(
            criarCelula(produto.id),
            criarCelula(produto.nome),
            criarCelula(produto.fornecedor || "—"),
            criarCelula(formatarMoeda(produto.preco)),
            criarCelula(produto.estoque),
            criarIndicadorSituacao(produto),
            criarCelulaAcoes(produto)
        );
        fragmento.appendChild(linha);
    });

    lista.replaceChildren(fragmento);
}

async function carregarProdutos() {
    try {
        const dados = await requisitarJSON("/produtos/");
        produtosCarregados = Array.isArray(dados)
            ? dados
            : Array.isArray(dados.produtos) ? dados.produtos : [];

        atualizarResumoProdutos();
        renderizarProdutos();
    } catch (erro) {
        console.error("Erro ao carregar produtos:", erro);
        exibirMensagemProdutos("Não foi possível carregar os produtos.");
    }
}

async function salvarProduto(evento) {
    evento.preventDefault();
    if (salvandoProduto) return;

    const nome = document.getElementById("produto-nome")?.value.trim() ?? "";
    const fornecedor = document.getElementById("produto-fornecedor")?.value.trim() ?? "";
    const precoTexto = document.getElementById("produto-preco")?.value.trim() ?? "";
    const estoqueTexto = document.getElementById("produto-estoque")?.value.trim() ?? "";

    if (!nome) {
        definirMensagemFormulario("Informe o nome do produto.", "erro");
        return;
    }

    if (nome.length > 100) {
        definirMensagemFormulario("O nome do produto deve ter no máximo 100 caracteres.", "erro");
        return;
    }

    const preco = Number(precoTexto);
    const estoque = Number(estoqueTexto);

    if (!precoTexto || !Number.isFinite(preco) || preco <= 0) {
        definirMensagemFormulario("Informe um preço válido.", "erro");
        return;
    }

    if (!estoqueTexto || !Number.isInteger(estoque) || estoque < 0) {
        definirMensagemFormulario("Informe um estoque inteiro igual ou maior que zero.", "erro");
        return;
    }

    const botaoSalvar = document.getElementById("btn-salvar-produto");
    const editando = produtoEmEdicao !== null;

    salvandoProduto = true;
    if (botaoSalvar) {
        botaoSalvar.disabled = true;
        botaoSalvar.textContent = "Salvando...";
    }

    try {
        const url = editando ? `/produtos/${produtoEmEdicao}` : "/produtos/";

        const dados = await requisitarJSON(url, {
            method: editando ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, fornecedor, preco, estoque })
        });

        exibirMensagemAcoesProdutos(
            mensagemDaResposta(
                dados,
                editando ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso."
            ),
            "sucesso"
        );

        definirModoFormulario("novo");
        fecharFormularioProduto();
        await carregarProdutos();
    } catch (erro) {
        console.error("Erro ao salvar produto:", erro);
        definirMensagemFormulario(
            erro instanceof Error ? erro.message : "Não foi possível salvar o produto.",
            "erro"
        );
    } finally {
        salvandoProduto = false;
        if (botaoSalvar) {
            botaoSalvar.disabled = false;
            botaoSalvar.textContent = produtoEmEdicao !== null
                ? "Salvar alterações"
                : "Salvar produto";
        }
    }
}

function iniciarEdicaoProduto(produto) {
    if (!produto) {
        exibirMensagemAcoesProdutos("Produto não encontrado.", "erro");
        return;
    }

    definirModoFormulario("edicao", produto);
    abrirFormularioProduto();
    exibirMensagemAcoesProdutos("");
}

async function alterarSituacaoProduto(produto, acao) {
    if (!produto) {
        exibirMensagemAcoesProdutos("Produto não encontrado.", "erro");
        return;
    }

    if (acao === "desativar" && !window.confirm(
        `Deseja realmente desativar o produto "${produto.nome}"?`
    )) {
        return;
    }

    try {
        exibirMensagemAcoesProdutos("Atualizando produto...");

        const dados = await requisitarJSON(
            `/produtos/${produto.id}/${acao}`,
            { method: "PATCH" }
        );

        exibirMensagemAcoesProdutos(
            mensagemDaResposta(
                dados,
                acao === "desativar"
                    ? "Produto desativado com sucesso."
                    : "Produto reativado com sucesso."
            ),
            "sucesso"
        );

        await carregarProdutos();
    } catch (erro) {
        console.error("Erro ao alterar situação do produto:", erro);
        exibirMensagemAcoesProdutos(
            erro instanceof Error ? erro.message : "Não foi possível alterar o produto.",
            "erro"
        );
    }
}

function configurarAcoesProdutos() {
    const lista = document.getElementById("lista-produtos");
    if (!lista) return;

    lista.addEventListener("click", async (evento) => {
        const botao = evento.target.closest("button[data-acao-produto]");
        if (!botao || !lista.contains(botao)) return;

        const id = Number(botao.dataset.produtoId);
        const acao = botao.dataset.acaoProduto;
        const produto = produtosCarregados.find((item) => Number(item.id) === id);

        if (!produto) {
            exibirMensagemAcoesProdutos("Produto não encontrado. Atualize a lista e tente novamente.", "erro");
            return;
        }

        if (acao === "editar") iniciarEdicaoProduto(produto);
        if (acao === "desativar" || acao === "reativar") {
            await alterarSituacaoProduto(produto, acao);
        }
    });
}

/* =====================================================
   RESUMO FINANCEIRO
   ===================================================== */

async function carregarResumoFinanceiro() {
    try {
        const dados = await requisitarJSON("/financeiro/resumo");
        const recebimentos = dados.recebimentos ?? {};
        const vendas = dados.vendas ?? {};
        const movimentacoes = dados.movimentacoes_manuais ?? {};

        atualizarTexto(
            "total-recebido",
            formatarMoeda(recebimentos.total_recebido_no_periodo ?? dados.total_recebido ?? 0)
        );

        atualizarTexto(
            "total-pendente",
            formatarMoeda(vendas.total_a_receber_dessas_vendas ?? dados.total_pendente ?? 0)
        );

        atualizarTexto(
            "total-despesas",
            formatarMoeda(movimentacoes.total_saidas ?? dados.total_despesas ?? 0)
        );
    } catch (erro) {
        console.error("Erro ao carregar resumo financeiro:", erro);
    }
}

/* =====================================================
   VENDAS RECENTES
   ===================================================== */

function formatarDataVenda(data) {
    if (!data) return "Data não informada";

    const convertida = new Date(data);
    if (Number.isNaN(convertida.getTime())) return String(data);

    return convertida.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function exibirEstadoVendas(mensagem) {
    const lista = document.getElementById("lista-vendas");
    if (!lista) return;

    lista.replaceChildren(
        criarElemento("div", "sale-empty-state", mensagem)
    );
}

function exibirVenda(venda) {
    const cartao = criarElemento("article", "sale-entry");
    const cabecalho = criarElemento("div", "sale-entry-header");

    cabecalho.append(
        criarElemento("strong", "sale-entry-title", `Venda #${venda.id}`),
        criarElemento(
            "strong",
            "sale-entry-value",
            formatarMoeda(venda.valor_total ?? venda.total ?? 0)
        )
    );

    cartao.append(
        cabecalho,
        criarElemento(
            "div",
            "sale-entry-date",
            formatarDataVenda(venda.data ?? venda.data_venda)
        )
    );

    const itens = Array.isArray(venda.itens) ? venda.itens : [];

    if (itens.length) {
        const resumo = itens.map((item) => {
            const nome = item.produto ?? `Produto #${item.produto_id}`;
            return `${nome} × ${item.quantidade}`;
        }).join(", ");

        cartao.appendChild(criarElemento("div", "sale-entry-items", resumo));
    }

    return cartao;
}

async function carregarVendasRecentes(dadosCarregados) {
    const lista = document.getElementById("lista-vendas");
    if (!lista) return;

    try {
        const dados = dadosCarregados ?? await requisitarJSON("/vendas/");
        const vendas = Array.isArray(dados)
            ? dados
            : Array.isArray(dados.vendas) ? dados.vendas : [];

        if (!vendas.length) {
            exibirEstadoVendas("Nenhuma venda registrada ainda.");
            return;
        }

        const fragmento = document.createDocumentFragment();
        vendas.forEach((venda) => {
            fragmento.appendChild(exibirVenda(venda));
        });

        lista.replaceChildren(fragmento);
    } catch (erro) {
        console.error("Erro ao carregar vendas recentes:", erro);
        exibirEstadoVendas("Não foi possível carregar as vendas recentes.");
    }
}

/* =====================================================
   INICIALIZAÇÃO SEGURA
   ===================================================== */

function inicializarMeuComercio() {
    const formulario = document.getElementById("formulario-produto");
    const botaoNovo = document.getElementById("btn-novo-produto");
    const botaoCancelar = document.getElementById("btn-cancelar-produto");
    const busca = document.getElementById("pesquisa-produtos");
    const filtro = document.getElementById("filtro-produtos");

    prepararModalProduto();
    configurarAcoesProdutos();

    busca?.addEventListener("input", renderizarProdutos);
    filtro?.addEventListener("change", renderizarProdutos);

    if (botaoNovo && !botaoNovo.dataset.modalProdutoConfigurado) {
        botaoNovo.dataset.modalProdutoConfigurado = "true";
        botaoNovo.textContent = "+ Novo produto";

        botaoNovo.addEventListener("click", () => {
            definirModoFormulario("novo");
            exibirMensagemAcoesProdutos("");
            abrirFormularioProduto();
        });
    }

    if (botaoCancelar && !botaoCancelar.dataset.modalProdutoConfigurado) {
        botaoCancelar.dataset.modalProdutoConfigurado = "true";

        botaoCancelar.addEventListener("click", () => {
            definirModoFormulario("novo");
            fecharFormularioProduto();
        });
    }

    if (formulario && !formulario.dataset.produtoSubmitConfigurado) {
        formulario.dataset.produtoSubmitConfigurado = "true";
        formulario.addEventListener("submit", salvarProduto);
    }

    carregarResumoFinanceiro();
    carregarProdutos();
    carregarVendasRecentes();
}

// Funciona tanto se o script carregar antes quanto depois do DOM estar pronto.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarMeuComercio, { once: true });
} else {
    inicializarMeuComercio();
}
