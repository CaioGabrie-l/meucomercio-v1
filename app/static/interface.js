(() => {
    "use strict";
    let janela;
    let conteudoJanela;
    let tituloJanela;
    let descricaoJanela;
    let elementoMovido = null;
    let localOriginal = null;
    let focoAnterior = null;
    const CORES = {
        verde: "#45664D",
        amarelo: "#D9A441",
        vermelho: "#D94A32",
        cinza: "#77756F",
        borda: "#E4E0D7",
        preto: "#111111"
    };
    const CORES_ROSCA_FINANCEIRA = {
        vendido: "#1E1E1E",
        recebido: "#19A76B",
        aReceber: "#3984E8",
        despesas: "#F0922E",
        retiradas: "#EA4654",
        entradas: "#F2C536",
        saldo: "#E566AD"
    };
    const CORES_VENDAS = {
        prazo: "#3984E8",
        pix: "#19A76B",
        dinheiro: "#F0922E",
        cartao: "#E566AD"
    };
    const moeda = (valor) =>
        Number(valor ?? 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    async function buscarJSON(url, opcoes = {}) {
        const resposta = await fetch(url, opcoes);
        if (!resposta.ok) {
            let mensagem = `Erro ao consultar ${url}`;
            try {
                const dados = await resposta.json();
                mensagem = dados.detail || mensagem;
            } catch (_) {}
            throw new Error(mensagem);
        }
        return resposta.json();
    }
    function criarElemento(tag, classe, texto) {
        const elemento = document.createElement(tag);
        if (classe) elemento.className = classe;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    }
    function criarBotao(texto, acao, classe = "mc-action-button") {
        const botao = criarElemento("button", classe, texto);
        botao.type = "button";
        botao.addEventListener("click", acao);
        return botao;
    }
    // ---------------- ENTRADA DE PRODUTOS ----------------
    function criarCampoEntradaEstoque(rotulo, tipo, nome, placeholder = "") {
        const grupo = criarElemento("label", "mc-stock-field");
        grupo.appendChild(criarElemento("span", "", rotulo));
        const campo = document.createElement("input");
        campo.type = tipo;
        campo.name = nome;
        campo.className = "mc-stock-input";
        campo.placeholder = placeholder;
        campo.required = true;
        campo.autocomplete = nome === "fornecedor" ? "organization" : "off";
        grupo.appendChild(campo);
        return { grupo, campo };
    }
    async function carregarHistoricoEntradas() {
        try {
            return await buscarJSON("/produtos/entradas");
        } catch (erro) {
            console.error("Erro ao carregar entradas de produtos:", erro);
            return null;
        }
    }
    function renderizarHistoricoEntradas(lista, entradas) {
        lista.replaceChildren();
        if (!Array.isArray(entradas)) {
            lista.appendChild(
                criarElemento("p", "mc-stock-empty", "O histórico de entradas não pôde ser carregado.")
            );
            return;
        }
        if (!entradas.length) {
            lista.appendChild(
                criarElemento("p", "mc-stock-empty", "As entradas registradas aparecerão aqui.")
            );
            return;
        }
        entradas.forEach((entrada) => {
            const cartao = criarElemento("article", "mc-stock-history-item");
            const detalhes = criarElemento("div", "mc-stock-history-copy");
            detalhes.append(
                criarElemento("strong", "", entrada.fornecedor || "Fornecedor"),
                criarElemento("span", "", (entrada.itens || []).map((item) =>
                    `${item.quantidade} × ${item.produto}`
                ).join(" · ")),
                criarElemento("small", "", entrada.data
                    ? new Date(entrada.data).toLocaleString("pt-BR")
                    : "Data indisponível")
            );
            cartao.append(
                detalhes,
                criarElemento("strong", "mc-stock-history-total", moeda(entrada.valor_total_pago))
            );
            lista.appendChild(cartao);
        });
    }
    async function abrirEntradaProdutos(aviso = "", fornecedorInicial = "") {
        abrirJanela(
            "Entrada de produtos",
            "Monte o carrinho de reposição, atualize o estoque e registre o valor pago como despesa financeira."
        );
        conteudoJanela.appendChild(
            criarElemento("p", "mc-loading", "Carregando produtos disponíveis...")
        );
        try {
            const [dadosProdutos, entradasIniciais] = await Promise.all([
                buscarJSON("/produtos/"),
                carregarHistoricoEntradas()
            ]);
            if (janela.hidden || tituloJanela.textContent !== "Entrada de produtos") return;
            const produtos = (Array.isArray(dadosProdutos) ? dadosProdutos : [])
                .filter((produto) => produto.ativo !== false);
            const carrinho = [];

            const pagina = criarElemento("div", "mc-stock-page");
            const cabecalho = criarElemento("section", "mc-stock-intro");
            const textoCabecalho = criarElemento("div", "");
            textoCabecalho.append(
                criarElemento("p", "mc-stock-eyebrow", "REPOSIÇÃO DE ESTOQUE"),
                criarElemento("h3", "", "Nova entrada de produtos"),
                criarElemento("p", "", "Adicione os itens recebidos e informe o total pago ao fornecedor.")
            );
            cabecalho.append(textoCabecalho);
            const formulario = document.createElement("form");
            formulario.className = "mc-stock-form";
            const fornecedor = criarCampoEntradaEstoque(
                "Fornecedor da compra *",
                "text",
                "fornecedor",
                "Ex.: Distribuidora Central"
            );
            fornecedor.campo.maxLength = 150;
            fornecedor.campo.value = fornecedorInicial;
            const grade = criarElemento("div", "mc-stock-form-grid");
            grade.appendChild(fornecedor.grupo);

            const secaoAdicionar = criarElemento("section", "mc-stock-add-panel");
            secaoAdicionar.append(
                criarElemento("h4", "", "Adicionar produtos ao carrinho"),
                criarElemento("p", "", "A quantidade será somada ao estoque atual de cada item.")
            );
            const linhaAdicionar = criarElemento("div", "mc-stock-add-row");
            const grupoProduto = criarElemento("label", "mc-stock-field");
            grupoProduto.appendChild(criarElemento("span", "", "Produto"));
            const seletorProduto = document.createElement("select");
            seletorProduto.className = "mc-stock-input";
            seletorProduto.setAttribute("aria-label", "Produto para adicionar");
            if (produtos.length) {
                seletorProduto.appendChild(new Option("Selecione um produto", ""));
                produtos.forEach((produto) => {
                    const opcao = new Option(
                        `${produto.nome} · estoque ${Number(produto.estoque || 0)}`,
                        String(produto.id)
                    );
                    seletorProduto.appendChild(opcao);
                });
            } else {
                seletorProduto.appendChild(new Option("Nenhum produto ativo cadastrado", ""));
                seletorProduto.disabled = true;
            }
            grupoProduto.appendChild(seletorProduto);
            seletorProduto.addEventListener("change", () => {
                if (fornecedor.campo.value.trim()) return;
                const produtoSelecionado = produtos.find(
                    (produto) => String(produto.id) === seletorProduto.value
                );
                if (produtoSelecionado?.fornecedor) {
                    fornecedor.campo.value = produtoSelecionado.fornecedor;
                }
            });
            const grupoQuantidade = criarCampoEntradaEstoque(
                "Quantidade",
                "number",
                "quantidade",
                "1"
            );
            grupoQuantidade.campo.min = "1";
            grupoQuantidade.campo.step = "1";
            grupoQuantidade.campo.value = "1";
            grupoQuantidade.campo.inputMode = "numeric";
            grupoQuantidade.campo.max = "999999999";
            const adicionarItem = criarBotao("Adicionar ao carrinho", () => {}, "mc-stock-add-button");
            adicionarItem.disabled = produtos.length === 0;
            linhaAdicionar.append(grupoProduto, grupoQuantidade.grupo, adicionarItem);
            secaoAdicionar.appendChild(linhaAdicionar);
            if (!produtos.length) {
                secaoAdicionar.append(
                    criarElemento(
                        "p",
                        "mc-stock-empty",
                        "Cadastre um produto ativo antes de montar uma entrada."
                    ),
                    criarBotao("Cadastrar produto", () => {
                        fecharJanela();
                        document.getElementById("btn-novo-produto")?.click();
                    }, "mc-stock-secondary-button")
                );
            }
            grade.appendChild(secaoAdicionar);

            const carrinhoPainel = criarElemento("section", "mc-stock-cart-panel");
            const carrinhoTopo = criarElemento("div", "mc-stock-cart-heading");
            const carrinhoTitulo = criarElemento("div", "");
            carrinhoTitulo.append(
                criarElemento("h4", "", "Carrinho de entrada"),
                criarElemento("p", "", "Revise as quantidades antes de registrar a compra.")
            );
            const contadorItens = criarElemento("span", "mc-stock-count", "0 produtos");
            carrinhoTopo.append(carrinhoTitulo, contadorItens);
            const listaCarrinho = criarElemento("div", "mc-stock-cart-list");
            carrinhoPainel.append(carrinhoTopo, listaCarrinho);

            const rodape = criarElemento("div", "mc-stock-checkout");
            const campoTotal = criarCampoEntradaEstoque(
                "Valor total pago (R$) *",
                "number",
                "valor_total_pago",
                "0,00"
            );
            campoTotal.campo.min = "0.01";
            campoTotal.campo.max = "99999999.99";
            campoTotal.campo.step = "0.01";
            campoTotal.campo.inputMode = "decimal";
            const explicacao = criarElemento(
                "p",
                "mc-stock-expense-note",
                "O total será lançado uma vez como despesa financeira. O preço de venda dos produtos não será alterado."
            );
            const feedback = criarElemento("p", "mc-stock-feedback");
            feedback.hidden = true;
            feedback.setAttribute("role", "status");
            const botoes = criarElemento("div", "mc-stock-actions");
            const voltar = criarBotao("Voltar para produtos", () => {
                const produtosSection = document.getElementById("produtos");
                abrirJanela(
                    "Produtos",
                    "Cadastre, pesquise e gerencie os produtos do seu estoque.",
                    produtosSection
                );
            }, "mc-stock-secondary-button");
            const registrar = document.createElement("button");
            registrar.type = "submit";
            registrar.className = "mc-stock-submit-button";
            registrar.textContent = "Registrar entrada";
            botoes.append(voltar, registrar);
            rodape.append(campoTotal.grupo, explicacao);
            formulario.append(grade, carrinhoPainel, rodape, feedback, botoes);

            function mostrarCarrinho() {
                listaCarrinho.replaceChildren();
                const quantidadeTotal = carrinho.reduce((soma, item) => soma + item.quantidade, 0);
                contadorItens.textContent = `${quantidadeTotal} ${quantidadeTotal === 1 ? "unidade" : "unidades"} · ${carrinho.length} ${carrinho.length === 1 ? "produto" : "produtos"}`;
                registrar.disabled = carrinho.length === 0;
                if (!carrinho.length) {
                    listaCarrinho.appendChild(
                        criarElemento("p", "mc-stock-empty", "Seu carrinho está vazio. Adicione os produtos recebidos acima.")
                    );
                    return;
                }
                carrinho.forEach((item, indice) => {
                    const linha = criarElemento("article", "mc-stock-cart-item");
                    const info = criarElemento("div", "mc-stock-cart-copy");
                    info.append(
                        criarElemento("strong", "", item.produto.nome),
                        criarElemento("span", "", `Estoque atual: ${Number(item.produto.estoque || 0)} unidades`)
                    );
                    const controles = criarElemento("div", "mc-stock-cart-controls");
                    const menos = criarBotao("−", () => {
                        item.quantidade = Math.max(1, item.quantidade - 1);
                        mostrarCarrinho();
                    }, "mc-stock-quantity-button");
                    menos.setAttribute("aria-label", `Diminuir quantidade de ${item.produto.nome}`);
                    menos.disabled = item.quantidade <= 1;
                    const qtd = criarElemento("strong", "mc-stock-quantity", String(item.quantidade));
                    const mais = criarBotao("+", () => {
                        if (item.quantidade < 999999999) item.quantidade += 1;
                        mostrarCarrinho();
                    }, "mc-stock-quantity-button");
                    mais.setAttribute("aria-label", `Aumentar quantidade de ${item.produto.nome}`);
                    const remover = criarBotao("Remover", () => {
                        carrinho.splice(indice, 1);
                        mostrarCarrinho();
                    }, "mc-stock-remove-button");
                    controles.append(menos, qtd, mais, remover);
                    linha.append(info, controles);
                    listaCarrinho.appendChild(linha);
                });
            }

            adicionarItem.addEventListener("click", (evento) => {
                evento.preventDefault();
                const produto = produtos.find((item) => String(item.id) === seletorProduto.value);
                const quantidade = Number(grupoQuantidade.campo.value);
                if (!produto) {
                    feedback.textContent = "Selecione um produto para adicionar.";
                    feedback.className = "mc-stock-feedback is-error";
                    feedback.hidden = false;
                    return;
                }
                if (!Number.isInteger(quantidade) || quantidade < 1) {
                    feedback.textContent = "Informe uma quantidade inteira maior que zero.";
                    feedback.className = "mc-stock-feedback is-error";
                    feedback.hidden = false;
                    return;
                }
                const existente = carrinho.find((item) => Number(item.produto.id) === Number(produto.id));
                if (existente) {
                    existente.quantidade = Math.min(999999999, existente.quantidade + quantidade);
                } else {
                    carrinho.push({ produto, quantidade });
                }
                seletorProduto.value = "";
                grupoQuantidade.campo.value = "1";
                feedback.hidden = true;
                mostrarCarrinho();
            });

            formulario.addEventListener("submit", async (evento) => {
                evento.preventDefault();
                if (!carrinho.length) return;
                const valorTotal = Number(campoTotal.campo.value);
                if (!fornecedor.campo.value.trim()) {
                    feedback.textContent = "Informe o fornecedor da compra.";
                    feedback.className = "mc-stock-feedback is-error";
                    feedback.hidden = false;
                    fornecedor.campo.focus();
                    return;
                }
                if (!Number.isFinite(valorTotal) || valorTotal <= 0 || valorTotal > 99999999.99) {
                    feedback.textContent = "Informe um valor total válido e maior que zero.";
                    feedback.className = "mc-stock-feedback is-error";
                    feedback.hidden = false;
                    campoTotal.campo.focus();
                    return;
                }
                registrar.disabled = true;
                registrar.textContent = "Registrando...";
                feedback.hidden = true;
                try {
                    await buscarJSON("/produtos/entradas", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            fornecedor: fornecedor.campo.value.trim(),
                            valor_total_pago: valorTotal,
                            itens: carrinho.map((item) => ({
                                produto_id: item.produto.id,
                                quantidade: item.quantidade
                            }))
                        })
                    });
                    carrinho.forEach((item) => {
                        item.produto.estoque = Number(item.produto.estoque || 0) + item.quantidade;
                        item.produto.fornecedor = fornecedor.campo.value.trim();
                        const opcao = Array.from(seletorProduto.options).find(
                            (option) => option.value === String(item.produto.id)
                        );
                        if (opcao) {
                            opcao.textContent = `${item.produto.nome} · estoque ${item.produto.estoque}`;
                        }
                    });
                    carrinho.length = 0;
                    campoTotal.campo.value = "";
                    feedback.textContent = "Entrada registrada. Estoque atualizado e despesa lançada no financeiro.";
                    feedback.className = "mc-stock-feedback is-success";
                    feedback.hidden = false;
                    mostrarCarrinho();
                    registrar.disabled = true;
                    const atualizacoes = [
                        window.carregarProdutos?.(),
                        window.carregarResumoFinanceiro?.(),
                        window.atualizarGraficos?.()
                    ].filter(Boolean);
                    await Promise.allSettled(atualizacoes);
                    renderizarHistoricoEntradas(listaHistorico, await carregarHistoricoEntradas());
                } catch (erro) {
                    feedback.textContent = erro.message || "Não foi possível registrar a entrada.";
                    feedback.className = "mc-stock-feedback is-error";
                    feedback.hidden = false;
                    registrar.disabled = false;
                } finally {
                    registrar.textContent = "Registrar entrada";
                }
            });
            mostrarCarrinho();

            const historico = criarElemento("section", "mc-stock-history-panel");
            const topoHistorico = criarElemento("div", "mc-stock-history-heading");
            topoHistorico.append(
                criarElemento("h4", "", "Histórico de entradas"),
                criarElemento("span", "", "Compras registradas")
            );
            const listaHistorico = criarElemento("div", "mc-stock-history-list");
            historico.append(topoHistorico, listaHistorico);
            renderizarHistoricoEntradas(listaHistorico, entradasIniciais);

            const gerenciarRodape = criarElemento("div", "mc-stock-manage-footer");
            gerenciarRodape.append(
                criarElemento(
                    "p",
                    "",
                    "Precisa corrigir uma compra já registrada? Consulte e edite o histórico de entradas."
                ),
                criarBotao(
                    "Editar entrada de produtos",
                    () => abrirGerenciadorEntradas(),
                    "mc-stock-manage-button"
                )
            );
            pagina.append(cabecalho, formulario, historico, gerenciarRodape);
            if (aviso) {
                const sucesso = criarElemento("p", "mc-stock-feedback is-success", aviso);
                sucesso.setAttribute("role", "status");
                pagina.prepend(sucesso);
            }
            conteudoJanela.replaceChildren(pagina);
            fornecedor.campo.focus();
        } catch (erro) {
            console.error("Erro ao abrir entrada de produtos:", erro);
            conteudoJanela.replaceChildren(
                criarAviso("Não foi possível carregar os produtos. " + erro.message, true),
                criarBotaoCliente("Tentar novamente", () => abrirEntradaProdutos(aviso, fornecedorInicial))
            );
        }
    }
    async function abrirGerenciadorEntradas(aviso = "") {
        abrirJanela(
            "Editar entradas de produtos",
            "Confira as compras realizadas e escolha uma entrada para editar."
        );
        conteudoJanela.appendChild(
            criarElemento("p", "mc-loading", "Carregando compras realizadas...")
        );
        const entradas = await carregarHistoricoEntradas();
        if (janela.hidden || tituloJanela.textContent !== "Editar entradas de produtos") return;

        const pagina = criarElemento("div", "mc-stock-manager-page");
        if (aviso) {
            const sucesso = criarElemento("p", "mc-stock-feedback is-success", aviso);
            sucesso.setAttribute("role", "status");
            pagina.appendChild(sucesso);
        }
        const topo = criarElemento("div", "mc-stock-manager-heading");
        topo.append(
            criarElemento("h3", "", "Compras realizadas"),
            criarElemento(
                "p",
                "",
                Array.isArray(entradas)
                    ? `${entradas.length} entrada(s) registrada(s)`
                    : "Não foi possível carregar as entradas."
            )
        );
        pagina.appendChild(topo);

        if (!Array.isArray(entradas)) {
            pagina.appendChild(
                criarBotao("Tentar novamente", () => abrirGerenciadorEntradas(aviso), "mc-stock-manage-button")
            );
        } else if (!entradas.length) {
            pagina.appendChild(
                criarElemento("p", "mc-stock-empty", "Ainda não há compras registradas para editar.")
            );
        } else {
            const lista = criarElemento("div", "mc-stock-manager-list");
            entradas.forEach((entrada) => {
                const cartao = criarElemento("article", "mc-stock-purchase-entry");
                const detalhes = criarElemento("div", "mc-stock-purchase-copy");
                const data = entrada.data
                    ? new Date(entrada.data).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short"
                    })
                    : "Data indisponível";
                detalhes.append(
                    criarElemento("span", "mc-stock-purchase-id", `ENTRADA #${entrada.id}`),
                    criarElemento("strong", "", entrada.fornecedor || "Fornecedor não informado"),
                    criarElemento(
                        "span",
                        "",
                        (entrada.itens || []).map((item) => `${item.quantidade} × ${item.produto}`).join(" · ")
                    ),
                    criarElemento("small", "", data)
                );
                const acao = criarElemento("div", "mc-stock-purchase-action");
                acao.append(
                    criarElemento("strong", "mc-stock-history-total", moeda(entrada.valor_total_pago)),
                    criarBotao(
                        "Editar compra",
                        () => abrirFormularioEdicaoEntrada(entrada),
                        "mc-stock-edit-button"
                    )
                );
                cartao.append(detalhes, acao);
                lista.appendChild(cartao);
            });
            pagina.appendChild(lista);
        }

        pagina.appendChild(
            criarBotao("Voltar à entrada de produtos", () => abrirEntradaProdutos(), "mc-stock-secondary-button")
        );
        conteudoJanela.replaceChildren(pagina);
    }
    async function abrirFormularioEdicaoEntrada(entrada) {
        abrirJanela(
            `Editar compra #${entrada.id}`,
            "As alterações ajustam o estoque e atualizam a despesa registrada no financeiro."
        );
        conteudoJanela.appendChild(
            criarElemento("p", "mc-loading", "Carregando os dados da compra...")
        );
        try {
            const dadosProdutos = await buscarJSON("/produtos/");
            if (janela.hidden || tituloJanela.textContent !== `Editar compra #${entrada.id}`) return;
            const produtos = Array.isArray(dadosProdutos) ? dadosProdutos : [];
            const produtosPorId = new Map(produtos.map((produto) => [Number(produto.id), produto]));
            const itens = (entrada.itens || []).map((item) => ({
                produto_id: Number(item.produto_id),
                quantidade: Number(item.quantidade),
                nome: item.produto || produtosPorId.get(Number(item.produto_id))?.nome || "Produto",
                estoque: Number(produtosPorId.get(Number(item.produto_id))?.estoque || 0)
            }));

            const pagina = criarElemento("div", "mc-stock-edit-page");
            const formulario = document.createElement("form");
            formulario.className = "mc-stock-form";
            const fornecedor = criarCampoEntradaEstoque(
                "Fornecedor da compra *",
                "text",
                "fornecedor",
                "Nome do fornecedor"
            );
            fornecedor.campo.maxLength = 150;
            fornecedor.campo.value = entrada.fornecedor || "";
            const valorTotal = criarCampoEntradaEstoque(
                "Valor total pago (R$) *",
                "number",
                "valor_total_pago",
                "0,00"
            );
            valorTotal.campo.min = "0.01";
            valorTotal.campo.max = "99999999.99";
            valorTotal.campo.step = "0.01";
            valorTotal.campo.inputMode = "decimal";
            valorTotal.campo.value = Number(entrada.valor_total_pago || 0).toFixed(2);
            const itensPainel = criarElemento("section", "mc-stock-edit-items");
            const cabecalhoItens = criarElemento("div", "mc-stock-cart-heading");
            cabecalhoItens.append(
                criarElemento("h4", "", "Produtos desta compra"),
                criarElemento("span", "mc-stock-count", "Ajuste quantidades ou remova itens")
            );
            const listaItens = criarElemento("div", "mc-stock-edit-list");
            const adicionarLinha = criarElemento("div", "mc-stock-add-row mc-stock-edit-add");
            const grupoProduto = criarElemento("label", "mc-stock-field");
            grupoProduto.appendChild(criarElemento("span", "", "Adicionar outro produto"));
            const seletor = document.createElement("select");
            seletor.className = "mc-stock-input";
            seletor.appendChild(new Option("Selecione um produto", ""));
            produtos.filter((produto) => produto.ativo !== false).forEach((produto) => {
                seletor.appendChild(new Option(`${produto.nome} · estoque ${produto.estoque}`, String(produto.id)));
            });
            grupoProduto.appendChild(seletor);
            const quantidadeNova = criarCampoEntradaEstoque("Quantidade", "number", "quantidade", "1");
            quantidadeNova.campo.min = "1";
            quantidadeNova.campo.max = "999999999";
            quantidadeNova.campo.step = "1";
            quantidadeNova.campo.value = "1";
            const adicionar = criarBotao("Adicionar item", () => {}, "mc-stock-add-button");
            adicionarLinha.append(grupoProduto, quantidadeNova.grupo, adicionar);
            const feedback = criarElemento("p", "mc-stock-feedback");
            feedback.hidden = true;
            feedback.setAttribute("role", "status");
            const acoes = criarElemento("div", "mc-stock-actions");
            acoes.append(
                criarBotao("Voltar às compras", () => abrirGerenciadorEntradas(), "mc-stock-secondary-button")
            );
            const salvar = document.createElement("button");
            salvar.type = "submit";
            salvar.className = "mc-stock-submit-button";
            salvar.textContent = "Salvar alterações";
            acoes.appendChild(salvar);
            formulario.append(
                fornecedor.grupo,
                valorTotal.grupo,
                itensPainel,
                feedback,
                acoes
            );
            itensPainel.append(cabecalhoItens, listaItens, adicionarLinha);

            function renderizarItens() {
                listaItens.replaceChildren();
                if (!itens.length) {
                    listaItens.appendChild(
                        criarElemento("p", "mc-stock-empty", "Adicione pelo menos um produto para salvar a compra.")
                    );
                    return;
                }
                itens.forEach((item, indice) => {
                    const linha = criarElemento("div", "mc-stock-edit-row");
                    const produtoInfo = criarElemento("div", "mc-stock-cart-copy");
                    produtoInfo.append(
                        criarElemento("strong", "", item.nome),
                        criarElemento("span", "", `Estoque atual: ${item.estoque} unidades`)
                    );
                    const quantidade = document.createElement("input");
                    quantidade.type = "number";
                    quantidade.className = "mc-stock-input mc-stock-edit-quantity";
                    quantidade.min = "1";
                    quantidade.max = "999999999";
                    quantidade.step = "1";
                    quantidade.required = true;
                    quantidade.value = String(item.quantidade);
                    quantidade.setAttribute("aria-label", `Quantidade de ${item.nome}`);
                    quantidade.addEventListener("change", () => {
                        const valor = Number(quantidade.value);
                        if (Number.isInteger(valor) && valor > 0 && valor <= 999999999) {
                            item.quantidade = valor;
                        } else {
                            quantidade.value = String(item.quantidade);
                        }
                    });
                    const remover = criarBotao("Remover", () => {
                        itens.splice(indice, 1);
                        renderizarItens();
                    }, "mc-stock-remove-button");
                    linha.append(produtoInfo, quantidade, remover);
                    listaItens.appendChild(linha);
                });
            }
            renderizarItens();

            adicionar.addEventListener("click", (evento) => {
                evento.preventDefault();
                const produtoId = Number(seletor.value);
                const produto = produtosPorId.get(produtoId);
                const quantidade = Number(quantidadeNova.campo.value);
                if (!produto || !Number.isInteger(quantidade) || quantidade < 1) {
                    feedback.textContent = "Selecione um produto ativo e informe uma quantidade válida.";
                    feedback.className = "mc-stock-feedback is-error";
                    feedback.hidden = false;
                    return;
                }
                const existente = itens.find((item) => item.produto_id === produtoId);
                if (existente) {
                    existente.quantidade = Math.min(999999999, existente.quantidade + quantidade);
                } else {
                    itens.push({
                        produto_id: produtoId,
                        quantidade,
                        nome: produto.nome,
                        estoque: Number(produto.estoque || 0)
                    });
                }
                seletor.value = "";
                quantidadeNova.campo.value = "1";
                feedback.hidden = true;
                renderizarItens();
            });

            formulario.addEventListener("submit", async (evento) => {
                evento.preventDefault();
                listaItens.querySelectorAll(".mc-stock-edit-quantity").forEach((campo, indice) => {
                    itens[indice].quantidade = Number(campo.value);
                });
                if (!itens.length) {
                    feedback.textContent = "A compra precisa ter pelo menos um produto.";
                    feedback.className = "mc-stock-feedback is-error";
                    feedback.hidden = false;
                    return;
                }
                salvar.disabled = true;
                salvar.textContent = "Salvando...";
                try {
                    await buscarJSON(`/produtos/entradas/${entrada.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            fornecedor: fornecedor.campo.value.trim(),
                            valor_total_pago: Number(valorTotal.campo.value),
                            itens: itens.map((item) => ({
                                produto_id: item.produto_id,
                                quantidade: item.quantidade
                            }))
                        })
                    });
                    const atualizacoes = [
                        window.carregarProdutos?.(),
                        window.carregarResumoFinanceiro?.(),
                        window.atualizarGraficos?.()
                    ].filter(Boolean);
                    await Promise.allSettled(atualizacoes);
                    await abrirGerenciadorEntradas("Compra atualizada; estoque e despesa financeira ajustados.");
                } catch (erro) {
                    feedback.textContent = erro.message || "Não foi possível atualizar a compra.";
                    feedback.className = "mc-stock-feedback is-error";
                    feedback.hidden = false;
                    salvar.disabled = false;
                    salvar.textContent = "Salvar alterações";
                }
            });

            pagina.appendChild(formulario);
            conteudoJanela.replaceChildren(pagina);
            fornecedor.campo.focus();
        } catch (erro) {
            conteudoJanela.replaceChildren(
                criarAviso("Não foi possível abrir esta compra. " + erro.message, true),
                criarBotaoCliente("Voltar às compras", () => abrirGerenciadorEntradas())
            );
        }
    }
    // ---------------- PÁGINA INICIAL ----------------
    function prepararPaginaInicial() {
        if (!document.getElementById("mc-estilo-pagina-inicial")) {
            const estilo = document.createElement("style");
            estilo.id = "mc-estilo-pagina-inicial";
            estilo.textContent = `
                body #financeiro,
                body .content-grid {
                    display: none !important;
                }
                body #produtos {
                    display: none !important;
                }
                body .mc-modal-content #produtos {
                    display: block !important;
                }
                #mc-abrir-nova-venda-topbar {
                    white-space: nowrap;
                    flex-shrink: 0;
                    margin-right: 10px;
                }
                @media (max-width: 600px) {
                    #mc-abrir-nova-venda-topbar {
                        margin-right: 6px;
                        padding: 8px 10px;
                        font-size: 12px;
                    }
                }
            `;
            document.head.appendChild(estilo);
        }
        adicionarBotaoNovaVendaTopo();
    }
    function adicionarBotaoNovaVendaTopo() {
        const status = document.querySelector(".topbar-status");
        if (
            !status ||
            document.getElementById("mc-abrir-nova-venda-topbar")
        ) {
            return;
        }
        const botao = criarElemento(
            "button",
            "mc-sale-primary mc-sale-open",
            "+ Nova venda"
        );
        botao.id = "mc-abrir-nova-venda-topbar";
        botao.type = "button";
        botao.setAttribute("aria-label", "Abrir formulário de nova venda");
        botao.addEventListener("click", () => {
            const botaoExistente = document.getElementById(
                "mc-abrir-nova-venda"
            );
            if (botaoExistente) {
                botaoExistente.click();
                return;
            }
            console.error(
                "O botão original de nova venda ainda não foi inicializado."
            );
            alert(
                "O formulário de vendas ainda está carregando. " +
                "Aguarde um instante e tente novamente."
            );
        });
        status.prepend(botao);
    }
    // ---------------- JANELAS MODAIS ----------------
    function criarJanela() {
        janela = criarElemento("div", "mc-modal-overlay");
        janela.hidden = true;
        janela.setAttribute("role", "presentation");
        const caixa = criarElemento("section", "mc-modal");
        caixa.setAttribute("role", "dialog");
        caixa.setAttribute("aria-modal", "true");
        caixa.setAttribute("aria-labelledby", "mc-modal-titulo");
        caixa.setAttribute("aria-describedby", "mc-modal-descricao");
        const cabecalho = criarElemento("header", "mc-modal-header");
        const textos = criarElemento("div", "mc-modal-heading");
        tituloJanela = criarElemento("h2", "", "MeuComércio");
        tituloJanela.id = "mc-modal-titulo";
        descricaoJanela = criarElemento(
            "p",
            "",
            "Gerencie seu negócio."
        );
        descricaoJanela.id = "mc-modal-descricao";
        textos.append(tituloJanela, descricaoJanela);
        const botaoFechar = criarElemento("button", "mc-modal-close", "×");
        botaoFechar.type = "button";
        botaoFechar.setAttribute("aria-label", "Fechar janela");
        botaoFechar.addEventListener("click", fecharJanela);
        cabecalho.append(textos, botaoFechar);
        conteudoJanela = criarElemento("div", "mc-modal-content");
        caixa.append(cabecalho, conteudoJanela);
        janela.appendChild(caixa);
        document.body.appendChild(janela);
        janela.addEventListener("click", (evento) => {
            if (evento.target === janela) fecharJanela();
        });
        document.addEventListener("keydown", (evento) => {
            if (evento.key === "Escape" && !janela.hidden) {
                fecharJanela();
            }
            if (evento.key === "Tab" && !janela.hidden) {
                manterFocoNaJanela(evento);
            }
        });
    }
    function manterFocoNaJanela(evento) {
        const focaveis = janela.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), ' +
            'select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
        );
        if (!focaveis.length) {
            evento.preventDefault();
            return;
        }
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (evento.shiftKey && document.activeElement === primeiro) {
            evento.preventDefault();
            ultimo.focus();
        } else if (
            !evento.shiftKey &&
            document.activeElement === ultimo
        ) {
            evento.preventDefault();
            primeiro.focus();
        }
    }
    function devolverElementoMovido() {
        if (!elementoMovido || !localOriginal) return;
        const { pai, proximo } = localOriginal;
        if (proximo && proximo.parentNode === pai) {
            pai.insertBefore(elementoMovido, proximo);
        } else {
            pai.appendChild(elementoMovido);
        }
        elementoMovido = null;
        localOriginal = null;
    }
    function fecharJanela() {
        if (!janela || janela.hidden) return;
        devolverElementoMovido();
        janela.hidden = true;
        document.body.classList.remove("mc-modal-aberto");
        if (focoAnterior && document.contains(focoAnterior)) {
            focoAnterior.focus({ preventScroll: true });
        }
    }
    function abrirJanela(titulo, descricao, elemento = null) {
        if (!janela) return;
        if (!janela.hidden) fecharJanela();
        focoAnterior = document.activeElement;
        tituloJanela.textContent = titulo;
        descricaoJanela.textContent = descricao;
        conteudoJanela.replaceChildren();
        if (elemento) {
            localOriginal = {
                pai: elemento.parentNode,
                proximo: elemento.nextSibling
            };
            elementoMovido = elemento;
            conteudoJanela.appendChild(elemento);
        }
        janela.hidden = false;
        document.body.classList.add("mc-modal-aberto");
        const botaoFechar = janela.querySelector(".mc-modal-close");
        if (botaoFechar) botaoFechar.focus();
    }
    function criarCartaoFinanceiro(rotulo, valor, observacao = "") {
        const cartao = criarElemento("article", "mc-finance-card");
        cartao.appendChild(
            criarElemento("span", "mc-finance-label", rotulo)
        );
        cartao.appendChild(
            criarElemento("strong", "mc-finance-value", moeda(valor))
        );
        if (observacao) {
            cartao.appendChild(
                criarElemento("span", "mc-finance-note", observacao)
            );
        }
        return cartao;
    }
    // ---------------- FINANCEIRO ----------------
    async function abrirFinanceiro(aviso = "") {
        abrirJanela(
            "Financeiro",
            "Consulte os valores disponíveis no sistema."
        );
        conteudoJanela.appendChild(
            criarElemento("p", "mc-loading", "Carregando resumo financeiro...")
        );
        try {
            const [dados, listaMovimentacoes] = await Promise.all([
                buscarJSON("/financeiro/resumo"),
                buscarJSON("/movimentacoes/")
            ]);
            if (janela.hidden || tituloJanela.textContent !== "Financeiro") {
                return;
            }
            const vendas = dados.vendas ?? {};
            const recebimentos = dados.recebimentos ?? {};
            const movimentacoes = dados.movimentacoes_manuais ?? {};
            const movimentacoesLista = normalizarLista(
                listaMovimentacoes,
                "movimentacoes"
            );
            const totalSaidas = Number(movimentacoes.total_saidas ?? 0);
            const totalRetiradas = Math.min(
                totalSaidas,
                movimentacoesLista
                    .filter((item) =>
                        String(item.tipo ?? "").trim().toLowerCase() === "saida"
                    )
                    .reduce((soma, item) => {
                        const categoria = String(item.categoria ?? "")
                            .normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "")
                            .toLowerCase();
                        const valor = Number(item.valor ?? 0);
                        return categoria.includes("retirad") && Number.isFinite(valor)
                            ? soma + valor
                            : soma;
                    }, 0)
            );
            const totalDespesas = Math.max(0, totalSaidas - totalRetiradas);
            const totalEntradasManuais = Number(
                movimentacoes.total_entradas ?? 0
            );
            const totalVendido = Number(vendas.total_vendido ?? 0);
            const totalRecebido = Number(
                recebimentos.total_recebido_no_periodo ?? 0
            );
            const totalAReceber = Number(
                vendas.total_a_receber_dessas_vendas ?? 0
            );
            const saldoMovimentacoes = Number(
                movimentacoes.saldo ?? totalEntradasManuais - totalSaidas
            );
            const partesRosca = [
                {
                    nome: "Total vendido",
                    valor: totalVendido,
                    cor: CORES_ROSCA_FINANCEIRA.vendido
                },
                {
                    nome: "Recebido",
                    valor: totalRecebido,
                    cor: CORES_ROSCA_FINANCEIRA.recebido
                },
                {
                    nome: "A receber",
                    valor: totalAReceber,
                    cor: CORES_ROSCA_FINANCEIRA.aReceber
                },
                {
                    nome: "Despesas registradas",
                    valor: totalDespesas,
                    cor: CORES_ROSCA_FINANCEIRA.despesas
                },
                {
                    nome: "Retiradas registradas",
                    valor: totalRetiradas,
                    cor: CORES_ROSCA_FINANCEIRA.retiradas
                },
                {
                    nome: "Entradas manuais",
                    valor: totalEntradasManuais,
                    cor: CORES_ROSCA_FINANCEIRA.entradas
                },
                {
                    nome: "Saldo das movimentações",
                    valor: Math.abs(saldoMovimentacoes),
                    valorExibido: moeda(saldoMovimentacoes),
                    detalhe: saldoMovimentacoes < 0
                        ? "Saldo negativo; a fatia representa o valor absoluto."
                        : undefined,
                    cor: CORES_ROSCA_FINANCEIRA.saldo
                }
            ];
            const somaIndicadores = partesRosca.reduce(
                (soma, parte) => soma + Math.max(0, Number(parte.valor) || 0),
                0
            );
            const grafico = criarGraficoRosca(
                "Todos os resumos financeiros",
                "Cada fatia representa um indicador; alguns valores se sobrepõem.",
                partesRosca,
                somaIndicadores,
                "R$",
                "da soma dos indicadores exibidos; há valores sobrepostos"
            );
            grafico.classList.add("mc-finance-overview-chart");
            const quantidadeResumos = grafico.querySelector(
                ".mc-donut-center strong"
            );
            const rotuloCentro = grafico.querySelector(
                ".mc-donut-center span"
            );
            if (quantidadeResumos) quantidadeResumos.textContent = "7";
            if (rotuloCentro) rotuloCentro.textContent = "resumos";

            const indicadores = criarElemento("section", "mc-finance-indicators");
            indicadores.appendChild(
                criarElemento("h3", "", "Resumo financeiro")
            );
            const listaIndicadores = criarElemento(
                "div",
                "mc-finance-indicator-list"
            );
            [
                ["Total vendido", totalVendido, "Vendas registradas"],
                ["Recebido", totalRecebido, "Recebimentos contabilizados"],
                ["A receber", totalAReceber, "Valores pendentes das vendas"],
                ["Despesas registradas", totalDespesas, "Custos e despesas manuais"],
                ["Retiradas registradas", totalRetiradas, "Retiradas manuais"],
                ["Entradas manuais", totalEntradasManuais, "Fora dos recebimentos de vendas"],
                ["Saldo das movimentações", saldoMovimentacoes, "Entradas menos saídas manuais"]
            ].forEach(([rotulo, valor, observacao]) => {
                const linha = criarElemento("div", "mc-finance-indicator");
                const texto = criarElemento("div", "mc-finance-indicator-copy");
                texto.append(
                    criarElemento("span", "mc-finance-indicator-label", rotulo),
                    criarElemento("span", "mc-finance-indicator-note", observacao)
                );
                linha.append(
                    texto,
                    criarElemento("strong", "mc-finance-indicator-value", moeda(valor))
                );
                listaIndicadores.appendChild(linha);
            });
            indicadores.appendChild(listaIndicadores);

            const resumo = criarElemento("div", "mc-finance-overview");
            resumo.append(grafico, indicadores);

            const gerenciamento = document.createElement("details");
            gerenciamento.className = "mc-finance-management";
            const gerenciamentoCabecalho = document.createElement("summary");
            gerenciamentoCabecalho.append(
                criarElemento("strong", "", "Gerenciar movimentações"),
                criarElemento(
                    "span",
                    "mc-finance-management-count",
                    `${movimentacoesLista.length} lançamento(s)`
                )
            );
            const gerenciamentoConteudo = criarElemento(
                "div",
                "mc-finance-management-content"
            );
            gerenciamentoConteudo.append(
                criarAcoesFinanceiras(),
                criarListaMovimentacoes(movimentacoesLista)
            );
            gerenciamento.append(gerenciamentoCabecalho, gerenciamentoConteudo);
            conteudoJanela.replaceChildren();
            if (aviso) {
                const mensagem = criarElemento(
                    "p",
                    "mc-finance-feedback mc-finance-feedback-success",
                    aviso
                );
                mensagem.setAttribute("role", "status");
                conteudoJanela.appendChild(mensagem);
            }
            conteudoJanela.append(resumo);
            conteudoJanela.appendChild(
                criarElemento(
                    "p",
                    "mc-finance-disclaimer",
                    "Atenção: estes indicadores não representam lucro. " +
                    "O sistema ainda não calcula custos dos produtos nem margem de lucro."
                )
            );
            conteudoJanela.appendChild(gerenciamento);
        } catch (erro) {
            console.error("Erro ao carregar o resumo financeiro:", erro);
            conteudoJanela.replaceChildren(
                criarElemento(
                    "p",
                    "mc-error",
                    "Não foi possível carregar o financeiro. Feche a janela e tente novamente."
                )
            );
        }
    }
    function criarAcoesFinanceiras() {
        const acoes = criarElemento("section", "mc-finance-actions");
        const texto = criarElemento("div", "mc-finance-actions-copy");
        texto.append(
            criarElemento("strong", "", "Organize suas saídas"),
            criarElemento(
                "span",
                "",
                "Registre despesas e retiradas separadamente."
            )
        );
        const botoes = criarElemento("div", "mc-finance-action-buttons");
        botoes.append(
            criarBotao(
                "+ Despesa",
                () => abrirFormularioMovimentacao("Despesa"),
                "mc-finance-action mc-finance-action-expense"
            ),
            criarBotao(
                "+ Retirada",
                () => abrirFormularioMovimentacao("Retirada"),
                "mc-finance-action mc-finance-action-withdrawal"
            )
        );
        acoes.append(texto, botoes);
        return acoes;
    }
    function criarListaMovimentacoes(movimentacoes, origem = "financeiro") {
        const secao = criarElemento("section", "mc-finance-movements");
        const cabecalho = criarElemento("div", "mc-finance-movements-header");
        cabecalho.append(
            criarElemento(
                "h3",
                "",
                origem === "movimentacoes" ? "Lançamentos" : "Movimentações financeiras"
            ),
            criarElemento("span", "", `${movimentacoes.length} registro(s)`)
        );
        secao.appendChild(cabecalho);

        if (!movimentacoes.length) {
            secao.appendChild(
                criarElemento(
                    "p",
                    "mc-finance-movements-empty",
                    origem === "movimentacoes"
                        ? "Nenhum lançamento encontrado com esses filtros."
                        : "Nenhuma movimentação financeira registrada ainda."
                )
            );
            return secao;
        }

        const lista = criarElemento("div", "mc-finance-movement-list");
        movimentacoes.forEach((movimentacao) => {
            const item = criarElemento("article", "mc-finance-movement");
            const informacoes = criarElemento("div", "mc-finance-movement-info");
            const titulo = criarElemento(
                "strong",
                "mc-finance-movement-title",
                movimentacao.descricao || "Movimentação sem descrição"
            );
            const tipo = String(movimentacao.tipo ?? "").toLowerCase();
            const categoriaNormalizada = String(movimentacao.categoria ?? "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            const entradaDeVenda = tipo === "entrada" && categoriaNormalizada === "venda";
            const classeValor = tipo === "entrada"
                ? "is-entry"
                : categoriaNormalizada.includes("retirad")
                    ? "is-exit"
                    : "is-expense";
            const tipoLegivel = tipo === "entrada" ? "Entrada" : "Saída";
            const data = new Date(movimentacao.data);
            const dataLegivel = Number.isNaN(data.getTime())
                ? "Data indisponível"
                : data.toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short"
                });
            const detalhes = criarElemento(
                "span",
                "mc-finance-movement-meta",
                `${tipoLegivel} · ${movimentacao.categoria || "Sem categoria"} · ${dataLegivel}`
            );
            informacoes.append(titulo, detalhes);

            const lado = criarElemento("div", "mc-finance-movement-side");
            const valor = criarElemento(
                "strong",
                `mc-finance-movement-value ${classeValor}`,
                `${tipo === "entrada" ? "+ " : "− "}${moeda(movimentacao.valor)}`
            );
            const acoes = criarElemento("div", "mc-finance-movement-actions");
            if (entradaDeVenda) {
                acoes.appendChild(
                    criarElemento("span", "mc-finance-movement-meta", "Vinculado à venda")
                );
            } else {
                acoes.append(
                    criarBotao(
                        "Editar",
                        () => abrirFormularioEdicaoMovimentacao(movimentacao, origem),
                        "mc-finance-small-action"
                    ),
                    criarBotao(
                        "Excluir",
                        () => excluirMovimentacao(movimentacao, origem),
                        "mc-finance-small-action mc-finance-delete-action"
                    )
                );
            }
            lado.append(valor, acoes);
            item.append(informacoes, lado);
            lista.appendChild(item);
        });
        secao.appendChild(lista);
        return secao;
    }
    function criarResumoMovimentacoes(movimentacoes) {
        const valores = movimentacoes.reduce((totais, item) => {
            const valor = Math.max(0, Number(item.valor) || 0);
            const tipo = String(item.tipo ?? "").trim().toLowerCase();
            const categoria = String(item.categoria ?? "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            if (tipo === "entrada") {
                totais.entradas += valor;
                totais.quantidadeEntradas += 1;
            } else if (tipo === "saida") {
                totais.saidas += valor;
                if (categoria.includes("retirad")) {
                    totais.retiradas += valor;
                    totais.quantidadeRetiradas += 1;
                } else {
                    totais.despesas += valor;
                    totais.quantidadeDespesas += 1;
                }
            }
            return totais;
        }, {
            entradas: 0,
            saidas: 0,
            despesas: 0,
            retiradas: 0,
            quantidadeEntradas: 0,
            quantidadeDespesas: 0,
            quantidadeRetiradas: 0
        });
        valores.saldo = valores.entradas - valores.saidas;
        return valores;
    }
    function criarCartaoResumoMovimentacoes(rotulo, valor, detalhe, variacao) {
        const cartao = criarElemento("article", `mc-movements-summary-card is-${variacao}`);
        cartao.append(
            criarElemento("span", "mc-movements-summary-label", rotulo),
            criarElemento("strong", "mc-movements-summary-value", moeda(valor)),
            criarElemento("span", "mc-movements-summary-note", detalhe)
        );
        return cartao;
    }
    function filtrarMovimentacoes(movimentacoes, filtros) {
        const consulta = filtros.pesquisa.value
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
        const tipo = filtros.tipo.value;
        const inicio = filtros.inicio.value;
        const fim = filtros.fim.value;
        return movimentacoes.filter((item) => {
            const descricao = `${item.descricao ?? ""} ${item.categoria ?? ""}`
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            const data = String(item.data ?? "").slice(0, 10);
            return (!consulta || descricao.includes(consulta)) &&
                (!tipo || String(item.tipo ?? "").toLowerCase() === tipo) &&
                (!inicio || data >= inicio) &&
                (!fim || data <= fim);
        });
    }
    function criarFiltroMovimentacao(rotulo, tipo, nome, placeholder = "") {
        const rotuloCampo = criarElemento("label", "mc-movements-filter");
        rotuloCampo.appendChild(criarElemento("span", "", rotulo));
        const campo = document.createElement(tipo === "select" ? "select" : "input");
        campo.className = "mc-finance-input";
        campo.name = nome;
        if (tipo === "select") {
            [
                ["", "Todos os tipos"],
                ["entrada", "Entradas"],
                ["saida", "Saídas"]
            ].forEach(([valor, texto]) => {
                const opcao = document.createElement("option");
                opcao.value = valor;
                opcao.textContent = texto;
                campo.appendChild(opcao);
            });
        } else {
            campo.type = tipo;
            campo.placeholder = placeholder;
            if (tipo === "search") campo.autocomplete = "off";
        }
        rotuloCampo.appendChild(campo);
        return { grupo: rotuloCampo, campo };
    }
    function renderizarGerenciadorMovimentacoes(movimentacoes, aviso = "") {
        const totais = criarResumoMovimentacoes(movimentacoes);
        const resumo = criarElemento("section", "mc-movements-summary-grid");
        resumo.setAttribute("aria-label", "Resumo das movimentações manuais");
        resumo.append(
            criarCartaoResumoMovimentacoes(
                "Entradas",
                totais.entradas,
                `${totais.quantidadeEntradas} lançamento(s)`,
                "entry"
            ),
            criarCartaoResumoMovimentacoes(
                "Despesas",
                totais.despesas,
                `${totais.quantidadeDespesas} lançamento(s)`,
                "expense"
            ),
            criarCartaoResumoMovimentacoes(
                "Retiradas",
                totais.retiradas,
                `${totais.quantidadeRetiradas} lançamento(s)`,
                "withdrawal"
            ),
            criarCartaoResumoMovimentacoes(
                "Saldo manual",
                totais.saldo,
                "Entradas menos saídas",
                totais.saldo < 0 ? "negative" : "balance"
            )
        );

        const acoes = criarElemento("section", "mc-movements-toolbar");
        const textoAcoes = criarElemento("div", "mc-movements-toolbar-copy");
        textoAcoes.append(
            criarElemento("strong", "", "Novo lançamento"),
            criarElemento("span", "", "Registre entradas, despesas ou retiradas.")
        );
        const botoesAcoes = criarElemento("div", "mc-movements-action-buttons");
        botoesAcoes.append(
            criarBotao(
                "+ Entrada",
                () => abrirFormularioMovimentacao("Entrada", "movimentacoes"),
                "mc-finance-action mc-finance-action-entry"
            ),
            criarBotao(
                "+ Despesa",
                () => abrirFormularioMovimentacao("Despesa", "movimentacoes"),
                "mc-finance-action mc-finance-action-expense"
            ),
            criarBotao(
                "+ Retirada",
                () => abrirFormularioMovimentacao("Retirada", "movimentacoes"),
                "mc-finance-action mc-finance-action-withdrawal"
            )
        );
        acoes.append(textoAcoes, botoesAcoes);

        const filtros = criarElemento("section", "mc-movements-filters");
        filtros.setAttribute("aria-label", "Filtros do histórico de movimentações");
        const pesquisa = criarFiltroMovimentacao(
            "Buscar lançamento",
            "search",
            "busca-movimentacao",
            "Descrição ou categoria"
        );
        const tipo = criarFiltroMovimentacao(
            "Tipo",
            "select",
            "tipo-movimentacao"
        );
        const inicio = criarFiltroMovimentacao(
            "Data inicial",
            "date",
            "data-inicial"
        );
        const fim = criarFiltroMovimentacao(
            "Data final",
            "date",
            "data-final"
        );
        filtros.append(pesquisa.grupo, tipo.grupo, inicio.grupo, fim.grupo);

        const lista = criarElemento("div", "mc-movements-list-panel");
        const filtrosAtivos = { pesquisa: pesquisa.campo, tipo: tipo.campo, inicio: inicio.campo, fim: fim.campo };
        const renderizarLista = () => {
            lista.replaceChildren(criarListaMovimentacoes(
                filtrarMovimentacoes(movimentacoes, filtrosAtivos),
                "movimentacoes"
            ));
        };
        Object.values(filtrosAtivos).forEach((campo) => {
            campo.addEventListener("input", renderizarLista);
            campo.addEventListener("change", renderizarLista);
        });
        renderizarLista();

        conteudoJanela.replaceChildren();
        if (aviso) {
            const feedback = criarElemento(
                "p",
                "mc-finance-feedback mc-finance-feedback-success",
                aviso
            );
            feedback.setAttribute("role", "status");
            conteudoJanela.appendChild(feedback);
        }
        conteudoJanela.append(resumo, acoes, filtros, lista);
    }
    async function abrirMovimentacoes(aviso = "") {
        abrirJanela(
            "Movimentações",
            "Consulte os totais gerais e filtre o histórico por tipo, período ou descrição."
        );
        conteudoJanela.replaceChildren(
            criarElemento("p", "mc-loading", "Carregando movimentações...")
        );
        try {
            const resposta = await buscarJSON("/movimentacoes/");
            if (janela.hidden || tituloJanela.textContent !== "Movimentações") return;
            renderizarGerenciadorMovimentacoes(
                normalizarLista(resposta, "movimentacoes"),
                aviso
            );
        } catch (erro) {
            if (janela.hidden || tituloJanela.textContent !== "Movimentações") return;
            conteudoJanela.replaceChildren(
                criarElemento(
                    "p",
                    "mc-error",
                    erro.message || "Não foi possível carregar as movimentações."
                )
            );
        }
    }
    function criarCampoTipoMovimentacao(tipoAtual) {
        const grupo = criarElemento("label", "mc-finance-field");
        grupo.appendChild(criarElemento("span", "", "Tipo de movimentação"));
        const campo = document.createElement("select");
        campo.name = "tipo";
        campo.required = true;
        campo.className = "mc-finance-input";
        [
            { valor: "entrada", rotulo: "Entrada" },
            { valor: "saida", rotulo: "Saída" }
        ].forEach((opcao) => {
            const elemento = document.createElement("option");
            elemento.value = opcao.valor;
            elemento.textContent = opcao.rotulo;
            elemento.selected = opcao.valor === tipoAtual;
            campo.appendChild(elemento);
        });
        grupo.appendChild(campo);
        return { grupo, campo };
    }
    function abrirFormularioEdicaoMovimentacao(movimentacao, origem = "financeiro") {
        abrirJanela(
            "Editar movimentação",
            "Atualize o tipo, a categoria, a descrição ou o valor."
        );
        const formulario = document.createElement("form");
        formulario.className = "mc-finance-form";
        const tipo = criarCampoTipoMovimentacao(movimentacao.tipo);
        const categoria = criarCampoMovimentacao(
            "Categoria",
            "text",
            "categoria",
            "Ex.: Despesa, Retirada ou Venda"
        );
        categoria.campo.maxLength = 50;
        categoria.campo.value = movimentacao.categoria ?? "";
        const descricao = criarCampoMovimentacao(
            "Descrição",
            "text",
            "descricao",
            "Descrição da movimentação"
        );
        descricao.campo.value = movimentacao.descricao ?? "";
        const valor = criarCampoMovimentacao("Valor", "number", "valor", "0,00");
        valor.campo.value = Number(movimentacao.valor ?? 0).toFixed(2);
        const feedback = criarElemento("p", "mc-finance-feedback");
        feedback.hidden = true;
        feedback.setAttribute("role", "alert");

        const botoes = criarElemento("div", "mc-finance-form-actions");
        botoes.appendChild(
            criarBotao(
                origem === "movimentacoes" ? "Voltar às movimentações" : "Voltar ao financeiro",
                () => origem === "movimentacoes" ? abrirMovimentacoes() : abrirFinanceiro(),
                "mc-finance-action mc-finance-action-secondary"
            )
        );
        const salvar = document.createElement("button");
        salvar.type = "submit";
        salvar.className = "mc-finance-action mc-finance-action-expense";
        salvar.textContent = "Salvar alterações";
        botoes.appendChild(salvar);

        formulario.append(
            tipo.grupo,
            categoria.grupo,
            descricao.grupo,
            valor.grupo,
            feedback,
            botoes
        );
        formulario.addEventListener("submit", async (evento) => {
            evento.preventDefault();
            salvar.disabled = true;
            feedback.hidden = true;
            try {
                await buscarJSON(`/movimentacoes/${movimentacao.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        tipo: tipo.campo.value,
                        categoria: categoria.campo.value.trim(),
                        descricao: descricao.campo.value.trim(),
                        valor: Number(valor.campo.value)
                    })
                });
                if (origem === "movimentacoes") {
                    await abrirMovimentacoes("Movimentação atualizada com sucesso.");
                } else {
                    await abrirFinanceiro("Movimentação atualizada com sucesso.");
                }
            } catch (erro) {
                feedback.textContent = erro.message ||
                    "Não foi possível salvar. Confira os dados e tente novamente.";
                feedback.classList.add("mc-finance-feedback-error");
                feedback.hidden = false;
                salvar.disabled = false;
            }
        });
        conteudoJanela.appendChild(formulario);
        tipo.campo.focus();
    }
    async function excluirMovimentacao(movimentacao, origem = "financeiro") {
        const confirmacao = window.confirm(
            `Excluir a movimentação “${movimentacao.descricao}”? Essa ação não pode ser desfeita.`
        );
        if (!confirmacao) return;
        try {
            await buscarJSON(`/movimentacoes/${movimentacao.id}`, {
                method: "DELETE"
            });
            if (origem === "movimentacoes") {
                await abrirMovimentacoes("Movimentação excluída com sucesso.");
            } else {
                await abrirFinanceiro("Movimentação excluída com sucesso.");
            }
        } catch (erro) {
            const aviso = criarElemento(
                "p",
                "mc-finance-feedback mc-finance-feedback-error",
                erro.message || "Não foi possível excluir a movimentação."
            );
            aviso.setAttribute("role", "alert");
            conteudoJanela.prepend(aviso);
        }
    }
    function criarCampoMovimentacao(rotulo, tipo, nome, placeholder) {
        const grupo = criarElemento("label", "mc-finance-field");
        grupo.appendChild(criarElemento("span", "", rotulo));
        const campo = document.createElement("input");
        campo.type = tipo;
        campo.name = nome;
        campo.required = true;
        campo.className = "mc-finance-input";
        campo.placeholder = placeholder;
        if (tipo === "text") {
            campo.maxLength = nome === "categoria" ? 50 : 150;
        }
        if (tipo === "number") {
            campo.min = "0.01";
            campo.max = "99999999.99";
            campo.step = "0.01";
            campo.inputMode = "decimal";
        }
        grupo.appendChild(campo);
        return { grupo, campo };
    }
    function abrirFormularioMovimentacao(categoria, origem = "financeiro") {
        const retirada = categoria === "Retirada";
        const entrada = categoria === "Entrada";
        const gerenciador = origem === "movimentacoes";
        abrirJanela(
            gerenciador
                ? "Novo lançamento"
                : entrada
                    ? "Registrar entrada manual"
                    : retirada ? "Registrar retirada" : "Registrar despesa",
            gerenciador
                ? "Escolha o tipo e preencha os detalhes do lançamento."
                : entrada
                    ? "Informe a origem e o valor recebido."
                    : retirada
                        ? "Informe o motivo e o valor retirado."
                        : "Informe a descrição e o valor da despesa."
        );

        const formulario = document.createElement("form");
        formulario.className = "mc-finance-form";
        const tipo = gerenciador
            ? criarCampoTipoMovimentacao(entrada ? "entrada" : "saida")
            : null;
        const categoriaCampo = gerenciador
            ? criarCampoMovimentacao(
                "Categoria",
                "text",
                "categoria",
                entrada ? "Ex.: Reforço de caixa" : "Ex.: Conta de energia"
            )
            : null;
        if (categoriaCampo) {
            categoriaCampo.campo.value = entrada ? "Entrada manual" : categoria;
        }
        const descricao = criarCampoMovimentacao(
            entrada
                ? "Descrição da entrada"
                : retirada ? "Motivo da retirada" : "Descrição da despesa",
            "text",
            "descricao",
            entrada
                ? "Ex.: recebimento de outra atividade"
                : retirada ? "Ex.: retirada para uso pessoal" : "Ex.: conta de energia"
        );
        const valor = criarCampoMovimentacao(
            "Valor",
            "number",
            "valor",
            "0,00"
        );
        const feedback = criarElemento("p", "mc-finance-feedback");
        feedback.hidden = true;
        feedback.setAttribute("role", "alert");

        const botoes = criarElemento("div", "mc-finance-form-actions");
        botoes.appendChild(
            criarBotao(
                gerenciador ? "Voltar às movimentações" : "Voltar ao financeiro",
                () => gerenciador ? abrirMovimentacoes() : abrirFinanceiro(),
                "mc-finance-action mc-finance-action-secondary"
            )
        );
        const salvar = document.createElement("button");
        salvar.type = "submit";
        salvar.className = entrada
            ? "mc-finance-action mc-finance-action-entry"
            : retirada
                ? "mc-finance-action mc-finance-action-withdrawal"
                : "mc-finance-action mc-finance-action-expense";
        salvar.textContent = entrada
            ? "Salvar entrada"
            : retirada ? "Salvar retirada" : "Salvar despesa";
        if (gerenciador) {
            const atualizarBotaoSalvar = () => {
                const tipoSelecionado = tipo.campo.value;
                const categoriaSelecionada = categoriaCampo.campo.value
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase();
                const retiradaSelecionada =
                    tipoSelecionado === "saida" && categoriaSelecionada.includes("retirad");
                salvar.textContent = tipoSelecionado === "entrada"
                    ? "Salvar entrada"
                    : retiradaSelecionada ? "Salvar retirada" : "Salvar despesa";
                salvar.classList.remove(
                    "mc-finance-action-entry",
                    "mc-finance-action-expense",
                    "mc-finance-action-withdrawal"
                );
                salvar.classList.add(tipoSelecionado === "entrada"
                    ? "mc-finance-action-entry"
                    : retiradaSelecionada
                        ? "mc-finance-action-withdrawal"
                        : "mc-finance-action-expense");
            };
            tipo.campo.addEventListener("change", atualizarBotaoSalvar);
            categoriaCampo.campo.addEventListener("input", atualizarBotaoSalvar);
        }
        botoes.appendChild(salvar);

        if (tipo && categoriaCampo) {
            formulario.append(tipo.grupo, categoriaCampo.grupo);
        }
        formulario.append(descricao.grupo, valor.grupo, feedback, botoes);
        formulario.addEventListener("submit", async (evento) => {
            evento.preventDefault();
            salvar.disabled = true;
            feedback.hidden = true;
            try {
                await buscarJSON("/movimentacoes/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        tipo: tipo?.campo.value ?? "saida",
                        categoria: categoriaCampo?.campo.value.trim() ?? categoria,
                        descricao: descricao.campo.value.trim(),
                        valor: Number(valor.campo.value)
                    })
                });
                const categoriaNormalizada = (categoriaCampo?.campo.value ?? categoria)
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase();
                const nomeMovimentacao = (tipo?.campo.value ?? "saida") === "entrada"
                    ? "Entrada manual"
                    : categoriaNormalizada.includes("retirad")
                        ? "Retirada"
                        : "Despesa";
                if (gerenciador) {
                    await abrirMovimentacoes(`${nomeMovimentacao} registrada com sucesso.`);
                } else {
                    await abrirFinanceiro(`${nomeMovimentacao} registrada com sucesso.`);
                }
            } catch (erro) {
                feedback.textContent = erro.message ||
                    "Não foi possível salvar. Confira os dados e tente novamente.";
                feedback.classList.add("mc-finance-feedback-error");
                feedback.hidden = false;
                salvar.disabled = false;
            }
        });
        conteudoJanela.appendChild(formulario);
        descricao.campo.focus();
    }
    // ---------------- CLIENTES ----------------
    function criarCampo(rotulo, tipo, nome, obrigatorio = true) {
        const grupo = criarElemento("label", "mc-client-field");
        grupo.appendChild(criarElemento("span", "", rotulo));
        const campo = document.createElement("input");
        campo.type = tipo;
        campo.name = nome;
        campo.required = obrigatorio;
        campo.autocomplete = nome === "nome" ? "name" : "tel";
        campo.style.width = "100%";
        campo.style.boxSizing = "border-box";
        campo.style.padding = "10px";
        campo.style.marginTop = "5px";
        grupo.appendChild(campo);
        return { grupo, campo };
    }
    function criarAviso(texto, erro = false) {
        const aviso = criarElemento(
            "p",
            erro ? "mc-error" : "mc-client-message",
            texto
        );
        aviso.setAttribute("role", erro ? "alert" : "status");
        return aviso;
    }
    function criarBotaoCliente(texto, acao, estilo = "secondary") {
        return criarBotao(
            texto,
            acao,
            `mc-client-button mc-client-button-${estilo}`
        );
    }
    async function abrirClientes() {
        abrirJanela(
            "Clientes e vendas a prazo",
            "Consulte os clientes, seus saldos e o histórico de compras."
        );
        await carregarClientes();
    }
    async function carregarClientes() {
        conteudoJanela.replaceChildren(
            criarElemento("p", "mc-loading", "Carregando clientes...")
        );
        try {
            const clientes = await buscarJSON("/clientes/");
            if (
                janela.hidden ||
                tituloJanela.textContent !== "Clientes e vendas a prazo"
            ) {
                return;
            }
            mostrarListaClientes(Array.isArray(clientes) ? clientes : []);
        } catch (erro) {
            console.error("Erro ao carregar clientes:", erro);
            conteudoJanela.replaceChildren(
                criarAviso(
                    "Não foi possível carregar os clientes. " + erro.message,
                    true
                ),
                criarBotaoCliente("Tentar novamente", carregarClientes)
            );
        }
    }
    function mostrarListaClientes(clientes) {
        conteudoJanela.replaceChildren();
        const topo = criarElemento("div", "mc-clients-toolbar");
        topo.appendChild(
            criarElemento(
                "p",
                "",
                "Cadastre clientes para acompanhar suas compras e valores pendentes."
            )
        );
        topo.appendChild(
            criarBotaoCliente(
                "＋ Cadastrar cliente",
                mostrarFormularioCliente,
                "primary"
            )
        );
        conteudoJanela.appendChild(topo);
        const resumo = criarElemento("div", "mc-finance-grid");
        const totalDevido = clientes.reduce(
            (soma, cliente) => soma + Number(cliente.total_pendente || 0),
            0
        );
        const totalClientesDevedores = clientes.filter(
            (cliente) => Number(cliente.total_pendente || 0) > 0
        ).length;
        resumo.append(
            criarCartaoFinanceiro(
                "Clientes cadastrados",
                clientes.length,
                "Clientes registrados no sistema"
            ),
            criarCartaoFinanceiro(
                "Total a receber",
                totalDevido,
                "Saldo pendente dos clientes cadastrados"
            ),
            criarCartaoFinanceiro(
                "Clientes com saldo",
                totalClientesDevedores,
                "Clientes com valores em aberto"
            )
        );
        conteudoJanela.appendChild(resumo);
        if (!clientes.length) {
            conteudoJanela.appendChild(
                criarElemento(
                    "p",
                    "mc-client-empty",
                    "Nenhum cliente cadastrado ainda. Use “Cadastrar cliente” para começar."
                )
            );
            return;
        }
        const lista = criarElemento("div", "mc-client-list");
        clientes.forEach((cliente) => {
            const cartao = criarElemento("article", "mc-client-card");
            cartao.style.padding = "14px";
            cartao.style.marginTop = "12px";
            cartao.style.border = "1px solid var(--borda)";
            cartao.style.borderRadius = "4px";
            const cabecalho = criarElemento("div", "mc-client-card-header");
            cabecalho.append(
                criarElemento("h3", "", cliente.nome),
                criarElemento("span", "", cliente.whatsapp)
            );
            const dados = criarElemento("div", "mc-client-card-values");
            dados.append(
                criarElemento("p", "", `Compras: ${moeda(cliente.total_comprado)}`),
                criarElemento("p", "", `Pago: ${moeda(cliente.total_pago)}`),
                criarElemento("p", "", `Em aberto: ${moeda(cliente.total_pendente)}`)
            );
            const acoes = criarElemento("div", "mc-client-actions");
            acoes.appendChild(
                criarBotaoCliente(
                    "Ver perfil e histórico",
                    () => mostrarHistoricoCliente(cliente.id)
                )
            );
            if (Number(cliente.total_pendente || 0) > 0) {
                acoes.appendChild(
                    criarBotaoCliente(
                        "Abrir WhatsApp",
                        () => abrirWhatsApp(cliente),
                        "whatsapp"
                    )
                );
            }
            cartao.append(cabecalho, dados, acoes);
            lista.appendChild(cartao);
        });
        conteudoJanela.appendChild(lista);
    }
    function mostrarFormularioCliente() {
        conteudoJanela.replaceChildren();
        conteudoJanela.appendChild(criarElemento("h3", "", "Cadastrar cliente"));
        const formulario = document.createElement("form");
        formulario.style.display = "grid";
        formulario.style.gap = "14px";
        const nome = criarCampo("Nome do cliente", "text", "nome");
        const whatsapp = criarCampo("WhatsApp com DDD", "tel", "whatsapp");
        whatsapp.campo.placeholder = "Ex.: 18999998888";
        const aviso = criarElemento("div", "mc-client-form-message");
        const botoes = criarElemento("div", "mc-client-actions");
        const salvar = criarElemento("button", "", "Salvar cliente");
        salvar.className = "mc-client-button mc-client-button-primary";
        salvar.type = "submit";
        botoes.append(
            salvar,
            criarBotaoCliente("Voltar", carregarClientes)
        );
        formulario.append(nome.grupo, whatsapp.grupo, aviso, botoes);
        formulario.addEventListener("submit", async (evento) => {
            evento.preventDefault();
            salvar.disabled = true;
            salvar.textContent = "Salvando...";
            try {
                await buscarJSON("/clientes/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        nome: nome.campo.value.trim(),
                        whatsapp: whatsapp.campo.value.trim()
                    })
                });
                await carregarClientes();
            } catch (erro) {
                aviso.replaceChildren(criarAviso(erro.message, true));
                salvar.disabled = false;
                salvar.textContent = "Salvar cliente";
            }
        });
        conteudoJanela.appendChild(formulario);
        nome.campo.focus();
    }
    async function mostrarFormularioPagamentoCliente(clienteId) {
        try {
            const cliente = await buscarJSON(`/clientes/${clienteId}`);
            const saldo = Number(cliente.total_pendente || 0);
            if (saldo <= 0) {
                await mostrarHistoricoCliente(clienteId);
                return;
            }
            conteudoJanela.replaceChildren(
                criarBotaoCliente("← Voltar ao perfil", () =>
                    mostrarHistoricoCliente(clienteId)
                ),
                criarElemento("h3", "", `Receber pagamento — ${cliente.nome}`),
                criarElemento("p", "", `Dívida total: ${moeda(saldo)}`)
            );
            const formulario = document.createElement("form");
            formulario.style.display = "grid";
            formulario.style.gap = "14px";
            const campoValor = criarCampo("Valor recebido (R$)", "number", "valor");
            campoValor.campo.min = "0.01";
            campoValor.campo.max = saldo.toFixed(2);
            campoValor.campo.step = "0.01";
            campoValor.campo.placeholder = "Ex.: 40.00";
            const grupoForma = criarElemento("label", "mc-client-field");
            grupoForma.appendChild(
                criarElemento("span", "", "Forma de pagamento")
            );
            const forma = document.createElement("select");
            forma.name = "forma_pagamento";
            forma.required = true;
            forma.style.width = "100%";
            forma.style.boxSizing = "border-box";
            forma.style.padding = "10px";
            forma.style.marginTop = "5px";
            [
                ["pix", "Pix"],
                ["dinheiro", "Dinheiro"],
                ["cartao", "Cartão"]
            ].forEach(([valor, rotulo]) => {
                const opcao = document.createElement("option");
                opcao.value = valor;
                opcao.textContent = rotulo;
                forma.appendChild(opcao);
            });
            grupoForma.appendChild(forma);
            const aviso = criarElemento("div", "mc-client-form-message");
            const botoes = criarElemento("div", "mc-client-actions");
            const confirmar = criarElemento("button", "", "Confirmar recebimento");
            confirmar.className = "mc-client-button mc-client-button-success";
            confirmar.type = "submit";
            const quitar = criarBotaoCliente("Quitar dívida total", () => {
                campoValor.campo.value = saldo.toFixed(2);
                formulario.requestSubmit();
            }, "highlight");
            botoes.append(confirmar, quitar);
            formulario.append(campoValor.grupo, grupoForma, aviso, botoes);
            formulario.addEventListener("submit", async (evento) => {
                evento.preventDefault();
                const valor = Number(campoValor.campo.value);
                if (!Number.isFinite(valor) || valor <= 0) {
                    aviso.replaceChildren(
                        criarAviso("Informe um valor maior que zero.", true)
                    );
                    return;
                }
                if (valor > saldo + 0.000001) {
                    aviso.replaceChildren(
                        criarAviso(
                            `O valor não pode ultrapassar ${moeda(saldo)}.`,
                            true
                        )
                    );
                    return;
                }
                confirmar.disabled = true;
                quitar.disabled = true;
                confirmar.textContent = "Registrando...";
                try {
                    const resultado = await buscarJSON(
                        `/pagamentos/cliente/${clienteId}`,
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                valor: valor.toFixed(2),
                                forma_pagamento: forma.value
                            })
                        }
                    );
                    await mostrarHistoricoCliente(clienteId);
                    conteudoJanela.prepend(
                        criarAviso(
                            `${resultado.mensagem} Recebido: ` +
                            `${moeda(resultado.valor_recebido)}. ` +
                            `Saldo restante: ${moeda(resultado.saldo_atual)}.`
                        )
                    );
                    await atualizarGraficos();
                } catch (erro) {
                    aviso.replaceChildren(criarAviso(erro.message, true));
                    confirmar.disabled = false;
                    quitar.disabled = false;
                    confirmar.textContent = "Confirmar recebimento";
                }
            });
            conteudoJanela.appendChild(formulario);
            campoValor.campo.focus();
        } catch (erro) {
            conteudoJanela.replaceChildren(
                criarAviso(
                    "Não foi possível abrir o recebimento: " + erro.message,
                    true
                ),
                criarBotaoCliente("Voltar ao perfil", () =>
                    mostrarHistoricoCliente(clienteId)
                )
            );
        }
    }
    async function mostrarHistoricoCliente(clienteId) {
        conteudoJanela.replaceChildren(
            criarElemento("p", "mc-loading", "Carregando histórico...")
        );
        try {
            const cliente = await buscarJSON(`/clientes/${clienteId}`);
            if (
                janela.hidden ||
                tituloJanela.textContent !== "Clientes e vendas a prazo"
            ) {
                return;
            }
            conteudoJanela.replaceChildren();
            conteudoJanela.appendChild(
                criarBotaoCliente("← Voltar para clientes", carregarClientes)
            );
            conteudoJanela.appendChild(criarElemento("h3", "", cliente.nome));
            conteudoJanela.appendChild(
                criarElemento("p", "", `WhatsApp: ${cliente.whatsapp}`)
            );
            const resumo = criarElemento("div", "mc-finance-grid");
            resumo.append(
                criarCartaoFinanceiro("Total comprado", cliente.total_comprado),
                criarCartaoFinanceiro("Total pago", cliente.total_pago),
                criarCartaoFinanceiro("Saldo em aberto", cliente.total_pendente)
            );
            conteudoJanela.appendChild(resumo);
            if (Number(cliente.total_pendente || 0) > 0) {
                conteudoJanela.append(
                    criarBotaoCliente(
                        "Receber pagamento",
                        () => mostrarFormularioPagamentoCliente(clienteId),
                        "success"
                    ),
                    criarBotaoCliente(
                        "Abrir WhatsApp para cobrança",
                        () => abrirWhatsApp(cliente),
                        "whatsapp"
                    )
                );
            }
            conteudoJanela.appendChild(
                criarElemento("h3", "", "Histórico de compras")
            );
            const historico = cliente.historico || [];
            if (!historico.length) {
                conteudoJanela.appendChild(
                    criarElemento(
                        "p",
                        "",
                        "Este cliente ainda não possui vendas vinculadas."
                    )
                );
                return;
            }
            historico.forEach((venda) => {
                const cartao = criarElemento("article", "mc-client-card");
                cartao.style.padding = "14px";
                cartao.style.marginTop = "12px";
                cartao.style.border = "1px solid var(--borda)";
                cartao.style.borderRadius = "4px";
                const data = venda.data
                    ? new Date(venda.data).toLocaleString("pt-BR")
                    : "Data não informada";
                cartao.append(
                    criarElemento("h4", "", `Venda #${venda.venda_id}`),
                    criarElemento("p", "", `Data: ${data}`),
                    criarElemento("p", "", `Total: ${moeda(venda.valor_total)}`),
                    criarElemento("p", "", `Recebido: ${moeda(venda.valor_recebido)}`),
                    criarElemento("p", "", `Pendente: ${moeda(venda.valor_pendente)}`),
                    criarElemento("p", "", `Situação: ${rotuloSituacao(venda.situacao)}`)
                );
                const detalhes = criarElemento("div", "mc-sale-details");
                detalhes.hidden = true;
                detalhes.style.marginTop = "12px";
                detalhes.appendChild(
                    criarElemento("strong", "", "Itens comprados")
                );
                const listaItens = criarElemento("ul", "");
                (venda.itens || []).forEach((item) => {
                    listaItens.appendChild(
                        criarElemento(
                            "li",
                            "",
                            `${item.quantidade} × ${item.produto} — ${moeda(item.subtotal)}`
                        )
                    );
                });
                if (!listaItens.children.length) {
                    listaItens.appendChild(
                        criarElemento(
                            "li",
                            "",
                            "Os itens não estão disponíveis neste histórico."
                        )
                    );
                }
                detalhes.appendChild(listaItens);
                detalhes.appendChild(
                    criarElemento("strong", "", "Histórico de pagamentos")
                );
                const pagamentos = venda.pagamentos || [];
                if (!pagamentos.length) {
                    detalhes.appendChild(
                        criarElemento("p", "", "Nenhum pagamento registrado.")
                    );
                } else {
                    const listaPagamentos = criarElemento("ul", "");
                    pagamentos.forEach((pagamento) => {
                        const dataPagamento = pagamento.data
                            ? new Date(pagamento.data).toLocaleString("pt-BR")
                            : "Data não informada";
                        listaPagamentos.appendChild(
                            criarElemento(
                                "li",
                                "",
                                `${pagamento.forma_pagamento}: ${moeda(pagamento.valor)} — ${dataPagamento}`
                            )
                        );
                    });
                    detalhes.appendChild(listaPagamentos);
                }
                const botaoDetalhes = criarBotaoCliente(
                    "Ver detalhes da venda",
                    () => {
                        detalhes.hidden = !detalhes.hidden;
                        botaoDetalhes.textContent = detalhes.hidden
                            ? "Ver detalhes da venda"
                            : "Ocultar detalhes";
                    }
                );
                cartao.append(botaoDetalhes, detalhes);
                conteudoJanela.appendChild(cartao);
            });
        } catch (erro) {
            console.error("Erro ao carregar histórico do cliente:", erro);
            conteudoJanela.replaceChildren(
                criarAviso(
                    "Não foi possível carregar o histórico. " + erro.message,
                    true
                ),
                criarBotaoCliente("Voltar para clientes", carregarClientes)
            );
        }
    }
    function rotuloSituacao(situacao) {
        const rotulos = {
            pago: "Pago",
            parcial: "Parcialmente pago",
            pendente: "Pendente"
        };
        return rotulos[situacao] || situacao || "Não informado";
    }
    function abrirWhatsApp(cliente) {
        const telefone = String(cliente.whatsapp || "").replace(/\D/g, "");
        if (!telefone) {
            alert("Este cliente não possui um WhatsApp válido cadastrado.");
            return;
        }
        const mensagem =
            `Olá, ${cliente.nome}! Tudo bem? Estou entrando em contato ` +
            `sobre o saldo pendente de ${moeda(cliente.total_pendente)} ` +
            `no MeuComércio. Quando puder, me avise sobre a previsão de pagamento. Obrigado!`;
        const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }
    function adicionarLinkClientes() {
        const navegacao = document.querySelector(".navigation");
        if (!navegacao || navegacao.querySelector('[href="#clientes"]')) {
            return;
        }
        const link = criarElemento("a", "nav-link", "Clientes e prazo");
        link.href = "#clientes";
        const linkVendas = navegacao.querySelector('[href="#vendas"]');
        if (linkVendas) {
            linkVendas.insertAdjacentElement("afterend", link);
        } else {
            navegacao.appendChild(link);
        }
    }
    // ---------------- GRÁFICOS ----------------
    function criarCabecalhoGrafico(titulo, descricao) {
        const cabecalho = criarElemento("div", "mc-chart-heading");
        cabecalho.append(
            criarElemento("h3", "", titulo),
            criarElemento("p", "", descricao)
        );
        return cabecalho;
    }
    const GRAFICO_SVG_NS = "http://www.w3.org/2000/svg";
    const GRAFICO_TOOLTIP_ID = "mc-chart-tooltip";
    let proximoGraficoRoscaId = 0;
    let temporizadorLimpezaTooltip = null;
    function criarElementoSVG(tag, atributos = {}) {
        const elemento = document.createElementNS(GRAFICO_SVG_NS, tag);
        Object.entries(atributos).forEach(([nome, valor]) => {
            elemento.setAttribute(nome, String(valor));
        });
        return elemento;
    }
    function obterTooltipGrafico() {
        let tooltip = document.getElementById(GRAFICO_TOOLTIP_ID);
        if (!tooltip) {
            tooltip = criarElemento("div", "mc-chart-tooltip");
            tooltip.id = GRAFICO_TOOLTIP_ID;
            tooltip.setAttribute("role", "tooltip");
            tooltip.hidden = true;
            document.body.appendChild(tooltip);
        }
        return tooltip;
    }
    function obterValorParte(parte) {
        const valor = Number(parte.valor);
        return Number.isFinite(valor) ? Math.max(0, valor) : 0;
    }
    function formatarValorParte(parte, unidade) {
        if (parte.valorExibido !== undefined) return parte.valorExibido;
        const valor = obterValorParte(parte);
        if (unidade === "R$") return moeda(valor);
        return `${valor.toLocaleString("pt-BR")} ${
            valor === 1 ? "produto" : "produtos"
        }`;
    }
    function textoPercentualParte(parte, total, rotuloPercentual) {
        if (!Number.isFinite(total) || total <= 0) {
            return "Sem base para calcular o percentual: total igual a zero.";
        }
        const valor = obterValorParte(parte);
        const percentualNumerico = valor / total * 100;
        if (!Number.isFinite(percentualNumerico)) {
            return "Percentual indisponível para esses valores.";
        }
        const percentual = percentualNumerico.toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        });
        return `${percentual}% ${rotuloPercentual}`;
    }
    function posicionarTooltipGrafico(tooltip, alvo, evento) {
        const area = alvo.getBoundingClientRect();
        const rolagemX = window.scrollX || document.documentElement.scrollLeft;
        const rolagemY = window.scrollY || document.documentElement.scrollTop;
        const x = evento && Number.isFinite(evento.clientX)
            ? evento.clientX + rolagemX + 14
            : area.left + rolagemX + area.width / 2 + 14;
        const y = evento && Number.isFinite(evento.clientY)
            ? evento.clientY + rolagemY + 14
            : area.top + rolagemY + area.height / 2 + 14;
        tooltip.hidden = false;
        const caixa = tooltip.getBoundingClientRect();
        const direitaVisivel = rolagemX + window.innerWidth;
        const baseVisivel = rolagemY + window.innerHeight;
        tooltip.style.left = `${Math.max(
            rolagemX + 12,
            Math.min(x, direitaVisivel - caixa.width - 12)
        )}px`;
        tooltip.style.top = `${Math.max(rolagemY + 12, Math.min(
            y + caixa.height > baseVisivel ? y - caixa.height - 20 : y,
            baseVisivel - caixa.height - 12
        ))}px`;
    }
    function criarCaminhoRosca(inicio, fim, raioExterno = 75, raioInterno = 58) {
        const cx = 80;
        const cy = 80;
        const ponto = (raio, angulo) => {
            const radianos = angulo * Math.PI / 180;
            return {
                x: cx + raio * Math.cos(radianos),
                y: cy + raio * Math.sin(radianos)
            };
        };
        const externoInicio = ponto(raioExterno, inicio);
        const internoInicio = ponto(raioInterno, inicio);
        if (fim - inicio >= 359.999) {
            const externoMeio = ponto(raioExterno, inicio + 180);
            const internoMeio = ponto(raioInterno, inicio + 180);
            const externoFim = ponto(raioExterno, inicio + 360);
            const internoFim = ponto(raioInterno, inicio + 360);
            return [
                `M ${externoInicio.x} ${externoInicio.y}`,
                `A ${raioExterno} ${raioExterno} 0 1 1 ${externoMeio.x} ${externoMeio.y}`,
                `A ${raioExterno} ${raioExterno} 0 1 1 ${externoFim.x} ${externoFim.y}`,
                `L ${internoFim.x} ${internoFim.y}`,
                `A ${raioInterno} ${raioInterno} 0 1 0 ${internoMeio.x} ${internoMeio.y}`,
                `A ${raioInterno} ${raioInterno} 0 1 0 ${internoInicio.x} ${internoInicio.y} Z`
            ].join(" ");
        }
        const externoFim = ponto(raioExterno, fim);
        const internoFim = ponto(raioInterno, fim);
        const grandeArco = fim - inicio > 180 ? 1 : 0;
        return [
            `M ${externoInicio.x} ${externoInicio.y}`,
            `A ${raioExterno} ${raioExterno} 0 ${grandeArco} 1 ${externoFim.x} ${externoFim.y}`,
            `L ${internoFim.x} ${internoFim.y}`,
            `A ${raioInterno} ${raioInterno} 0 ${grandeArco} 0 ${internoInicio.x} ${internoInicio.y} Z`
        ].join(" ");
    }
    function criarLegenda(
        parte,
        indice,
        unidade,
        total,
        rotuloPercentual,
        idGrafico,
        aoAtivar,
        aoLimpar
    ) {
        const item = criarElemento("button", "mc-chart-legend-item");
        item.type = "button";
        item.dataset.chartId = idGrafico;
        item.dataset.partIndex = String(indice);
        item.setAttribute("aria-describedby", GRAFICO_TOOLTIP_ID);
        item.setAttribute(
            "aria-label",
            `${parte.nome}. ${formatarValorParte(parte, unidade)}. ` +
            `${textoPercentualParte(parte, total, rotuloPercentual)}` +
            `${parte.detalhe ? `. ${parte.detalhe}` : ""}`
        );
        const marcador = criarElemento("span", "mc-chart-dot");
        marcador.style.backgroundColor = parte.cor;
        item.append(
            marcador,
            criarElemento("span", "mc-chart-legend-name", parte.nome),
            criarElemento(
                "strong",
                "mc-chart-legend-value",
                parte.valorExibido !== undefined
                    ? parte.valorExibido
                    : unidade === "R$"
                        ? moeda(obterValorParte(parte))
                        : obterValorParte(parte).toLocaleString("pt-BR")
            )
        );
        item.addEventListener("pointerenter", (evento) =>
            aoAtivar(indice, item, "pointer", evento)
        );
        item.addEventListener("pointermove", (evento) =>
            aoAtivar(indice, item, "pointer", evento)
        );
        item.addEventListener("pointerleave", () => aoLimpar(indice, item, "pointer"));
        item.addEventListener("focus", () => aoAtivar(indice, item, "focus"));
        item.addEventListener("blur", (evento) => aoLimpar(indice, item, "focus", evento));
        return item;
    }
    function renderizarRosca(painel, partes, total, unidade, rotuloPercentual) {
        const rosca = painel.querySelector(".mc-donut-chart");
        const svg = painel.querySelector(".mc-donut-svg");
        const centro = painel.querySelector(".mc-donut-center strong");
        const legenda = painel.querySelector(".mc-chart-legend");
        if (!rosca || !svg || !legenda) return;
        const valores = partes.map(obterValorParte);
        const soma = valores.reduce(
            (acumulado, valor) => acumulado + valor,
            0
        );
        const idGrafico = rosca.dataset.chartId;
        const tooltip = obterTooltipGrafico();
        tooltip.hidden = true;
        const alvos = [];
        let indiceAtivo = -1;
        let origemAtiva = "";
        if (centro) {
            centro.textContent = unidade === "R$" ? moeda(total) : String(total);
        }
        svg.setAttribute(
            "aria-label",
            `Gráfico de rosca. ${partes.map((parte) =>
                `${parte.nome}: ${formatarValorParte(parte, unidade)}`
            ).join("; ")}.`
        );
        legenda.replaceChildren();
        svg.replaceChildren(
            criarElementoSVG("circle", {
                class: "mc-donut-track",
                cx: 80,
                cy: 80,
                r: 66.5
            })
        );
        rosca.classList.toggle("mc-donut-empty", soma === 0);
        const atualizarDestaque = (indice) => {
            alvos.forEach((alvo) => {
                alvo.classList.toggle("is-active", Number(alvo.dataset.partIndex) === indice);
            });
        };
        const ativar = (indice, alvo, origem, evento) => {
            if (temporizadorLimpezaTooltip !== null) {
                window.clearTimeout(temporizadorLimpezaTooltip);
                temporizadorLimpezaTooltip = null;
            }
            const parte = partes[indice];
            if (!parte) return;
            if (
                indiceAtivo === indice &&
                origemAtiva === origem &&
                origem === "pointer"
            ) {
                posicionarTooltipGrafico(tooltip, alvo, evento);
                return;
            }
            indiceAtivo = indice;
            origemAtiva = origem;
            atualizarDestaque(indice);
            tooltip.replaceChildren(
                criarElemento("span", "mc-chart-tooltip-name", parte.nome),
                criarElemento(
                    "strong",
                    "mc-chart-tooltip-value",
                    formatarValorParte(parte, unidade)
                ),
                criarElemento(
                    "span",
                    "mc-chart-tooltip-percent",
                    textoPercentualParte(parte, soma, rotuloPercentual)
                )
            );
            tooltip.style.borderLeftColor = parte.cor;
            if (parte.detalhe) {
                tooltip.appendChild(criarElemento("span", "mc-chart-tooltip-detail", parte.detalhe));
            }
            posicionarTooltipGrafico(tooltip, alvo, evento);
        };
        const limparImediatamente = (indice, alvo, origem, evento) => {
            if (indiceAtivo !== indice || origemAtiva !== origem) return;
            if (origem === "pointer" && document.activeElement === alvo) {
                origemAtiva = "focus";
                posicionarTooltipGrafico(tooltip, alvo);
                return;
            }
            if (origem === "pointer") {
                const focado = alvos.find((item) => item === document.activeElement);
                if (focado) {
                    ativar(Number(focado.dataset.partIndex), focado, "focus");
                    return;
                }
            }
            if (
                origem === "focus" &&
                evento?.relatedTarget &&
                alvos.includes(evento.relatedTarget)
            ) {
                return;
            }
            indiceAtivo = -1;
            origemAtiva = "";
            atualizarDestaque(-1);
            tooltip.hidden = true;
        };
        const limpar = (indice, alvo, origem, evento) => {
            if (origem !== "pointer") {
                limparImediatamente(indice, alvo, origem, evento);
                return;
            }
            if (temporizadorLimpezaTooltip !== null) {
                window.clearTimeout(temporizadorLimpezaTooltip);
            }
            temporizadorLimpezaTooltip = window.setTimeout(() => {
                temporizadorLimpezaTooltip = null;
                limparImediatamente(indice, alvo, origem, evento);
            }, 120);
        };
        let inicio = -90;
        partes.forEach((parte, indice) => {
            const valor = valores[indice];
            if (soma > 0 && valor > 0) {
                const fim = indice === valores.length - 1
                    ? 270
                    : inicio + valor / soma * 360;
                const fatia = criarElementoSVG("path", {
                    class: "mc-donut-slice",
                    d: criarCaminhoRosca(inicio, fim),
                    fill: parte.cor,
                    "fill-rule": "evenodd",
                    tabindex: 0,
                    role: "img",
                    "aria-describedby": GRAFICO_TOOLTIP_ID,
                    "aria-label":
                        `${parte.nome}. ${formatarValorParte(parte, unidade)}. ` +
                        `${textoPercentualParte(parte, soma, rotuloPercentual)}` +
                        `${parte.detalhe ? `. ${parte.detalhe}` : ""}`
                });
                fatia.dataset.chartId = idGrafico;
                fatia.dataset.partIndex = String(indice);
                fatia.addEventListener("pointerenter", (evento) =>
                    ativar(indice, fatia, "pointer", evento)
                );
                fatia.addEventListener("pointermove", (evento) =>
                    ativar(indice, fatia, "pointer", evento)
                );
                fatia.addEventListener("pointerleave", () => limpar(indice, fatia, "pointer"));
                fatia.addEventListener("focus", () => ativar(indice, fatia, "focus"));
                fatia.addEventListener("blur", (evento) => limpar(indice, fatia, "focus", evento));
                fatia.addEventListener("keydown", (evento) => {
                    if (evento.key === " " || evento.key === "Spacebar") evento.preventDefault();
                });
                const expansao = criarElementoSVG("path", {
                    class: "mc-donut-slice-expanded",
                    d: criarCaminhoRosca(inicio, fim, 78, 58),
                    fill: parte.cor,
                    "fill-rule": "evenodd",
                    "aria-hidden": "true"
                });
                expansao.dataset.chartId = idGrafico;
                expansao.dataset.partIndex = String(indice);
                expansao.addEventListener("pointerenter", (evento) =>
                    ativar(indice, expansao, "pointer", evento)
                );
                expansao.addEventListener("pointermove", (evento) =>
                    ativar(indice, expansao, "pointer", evento)
                );
                expansao.addEventListener("pointerleave", () =>
                    limpar(indice, expansao, "pointer")
                );
                svg.appendChild(fatia);
                svg.appendChild(expansao);
                alvos.push(fatia, expansao);
                inicio = fim;
            }
            const item = criarLegenda(
                parte,
                indice,
                unidade,
                soma,
                rotuloPercentual,
                idGrafico,
                ativar,
                limpar
            );
            legenda.appendChild(item);
            alvos.push(item);
        });
        const nota = painel.querySelector(".mc-chart-empty-note");
        if (soma === 0 && !nota) {
            painel.appendChild(criarElemento(
                "p",
                "mc-chart-empty-note",
                "Ainda não há dados suficientes para formar este gráfico."
            ));
        } else if (soma > 0 && nota) {
            nota.remove();
        }
    }
    function criarGraficoRosca(
        titulo,
        descricao,
        partes,
        total,
        unidade = "",
        rotuloPercentual = "do total representado no gráfico"
    ) {
        const painel = criarElemento("article", "mc-chart-panel");
        const area = criarElemento("div", "mc-chart-layout");
        const rosca = criarElemento("div", "mc-donut-chart");
        const idGrafico = `mc-donut-${++proximoGraficoRoscaId}`;
        rosca.dataset.chartId = idGrafico;
        const svg = criarElementoSVG("svg", {
            class: "mc-donut-svg",
            viewBox: "0 0 160 160",
            role: "group"
        });
        rosca.appendChild(svg);
        const centro = criarElemento("div", "mc-donut-center");
        centro.append(
            criarElemento(
                "strong",
                "",
                unidade === "R$" ? moeda(total) : String(total)
            ),
            criarElemento("span", "", unidade === "R$" ? "valores" : "produtos")
        );
        rosca.appendChild(centro);
        const legenda = criarElemento("div", "mc-chart-legend");
        area.append(rosca, legenda);
        painel.append(criarCabecalhoGrafico(titulo, descricao), area);
        renderizarRosca(painel, partes, total, unidade, rotuloPercentual);
        return painel;
    }
    function prepararEstruturaVendas(secao) {
        let area = secao.querySelector(".mc-sales-overview");
        if (area) {
            return {
                area,
                grafico: area.querySelector(".mc-sales-chart"),
                historico: secao.querySelector(".mc-sales-history"),
                quantidade: secao.querySelector(".mc-sales-history-count")
            };
        }

        const lista = secao.querySelector("#lista-vendas");
        if (!lista) return null;

        area = criarElemento("section", "mc-sales-overview");
        area.setAttribute("aria-label", "Resumo de vendas por forma de pagamento");
        const grafico = criarElemento("div", "mc-sales-chart");
        area.appendChild(grafico);

        const historico = criarElemento("details", "mc-sales-history");
        const resumo = criarElemento("summary", "mc-sales-history-summary");
        const titulo = criarElemento("span", "mc-sales-history-title", "Histórico de vendas");
        const quantidade = criarElemento("span", "mc-sales-history-count", "Carregando");
        resumo.append(titulo, quantidade);
        historico.append(resumo, lista);

        const cabecalho = secao.querySelector(":scope > .panel-heading");
        if (cabecalho) {
            cabecalho.insertAdjacentElement("afterend", area);
        } else {
            secao.prepend(area);
        }
        area.insertAdjacentElement("afterend", historico);
        return { area, grafico, historico, quantidade };
    }
    function formaPagamentoVenda(valor) {
        const forma = String(valor || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
        if (forma.includes("prazo") || forma.includes("penden")) return "prazo";
        if (forma.includes("pix")) return "pix";
        if (forma.includes("cart")) return "cartao";
        if (forma.includes("dinheir")) return "dinheiro";
        return null;
    }
    function montarGraficoFormasPagamento(vendas, destino) {
        const valores = { prazo: 0, pix: 0, dinheiro: 0, cartao: 0 };
        vendas.forEach((venda) => {
            const pagamentos = Array.isArray(venda.pagamentos) ? venda.pagamentos : [];
            pagamentos.forEach((pagamento) => {
                const forma = formaPagamentoVenda(pagamento.forma_pagamento);
                if (forma) valores[forma] += Number(pagamento.valor) || 0;
            });

            const pendente = Math.max(0, Number(venda.valor_pendente) || 0);
            valores.prazo += pendente;

            if (!pagamentos.length) {
                const recebido = Math.max(0, Number(venda.valor_recebido) || 0);
                if (recebido > 0) {
                    const forma = formaPagamentoVenda(venda.forma_pagamento) || "dinheiro";
                    valores[forma] += recebido;
                }
            }
        });

        const partes = [
            { nome: "A prazo", valor: valores.prazo, cor: CORES_VENDAS.prazo },
            { nome: "Pix", valor: valores.pix, cor: CORES_VENDAS.pix },
            { nome: "Dinheiro", valor: valores.dinheiro, cor: CORES_VENDAS.dinheiro },
            { nome: "Cartões", valor: valores.cartao, cor: CORES_VENDAS.cartao }
        ];
        const total = partes.reduce((soma, parte) => soma + parte.valor, 0);
        const painel = criarGraficoRosca(
            "Vendas por forma de pagamento",
            "Veja como os valores das vendas estão distribuídos.",
            partes,
            total,
            "R$",
            "das vendas representadas"
        );
        const areaVisual = criarElemento("div", "mc-sales-visual-grid");
        const rosca = painel.querySelector(".mc-chart-layout");
        rosca.replaceWith(areaVisual);
        areaVisual.append(rosca, montarGraficoVendasDiarias(vendas));
        destino.replaceChildren(painel);
    }
    function montarGraficoVendasDiarias(vendas) {
        const painel = criarElemento("section", "mc-sales-daily-chart");
        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = agora.getMonth();
        const diasNoMes = new Date(ano, mes + 1, 0).getDate();
        const valoresPorDia = Array.from({ length: diasNoMes }, () => 0);
        vendas.forEach((venda) => {
            const data = new Date(venda.data ?? venda.data_venda);
            if (
                Number.isNaN(data.getTime()) ||
                data.getFullYear() !== ano ||
                data.getMonth() !== mes
            ) {
                return;
            }
            const valor = Number(venda.valor_total ?? venda.total ?? 0);
            if (Number.isFinite(valor) && valor > 0) {
                valoresPorDia[data.getDate() - 1] += valor;
            }
        });

        const nomeMes = agora.toLocaleDateString("pt-BR", { month: "long" });
        const cabecalho = criarElemento("div", "mc-sales-daily-heading");
        cabecalho.append(
            criarElemento("h4", "", "Vendas diárias"),
            criarElemento("span", "", `${nomeMes} de ${ano}`)
        );
        painel.appendChild(cabecalho);

        const svg = criarElementoSVG("svg", {
            class: "mc-sales-daily-svg",
            viewBox: "0 0 640 270",
            role: "img",
            "aria-label": `Vendas por dia em ${nomeMes} de ${ano}`
        });
        const margem = { esquerda: 68, direita: 12, topo: 15, baixo: 228 };
        const larguraGrafico = 640 - margem.esquerda - margem.direita;
        const alturaGrafico = margem.baixo - margem.topo;
        const maiorValor = Math.max(...valoresPorDia);
        const referencia = maiorValor > 0 ? maiorValor / 3 : 1;
        const magnitude = 10 ** Math.floor(Math.log10(referencia));
        const normalizado = referencia / magnitude;
        const passo = (normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10) * magnitude;
        const teto = passo * 3;
        const formatadorEixo = new Intl.NumberFormat("pt-BR", {
            maximumFractionDigits: teto < 10 ? 1 : 0
        });
        const pontoX = (indice) => margem.esquerda +
            indice / Math.max(diasNoMes - 1, 1) * larguraGrafico;
        const pontoY = (valor) => margem.baixo - valor / teto * alturaGrafico;

        for (let indice = 0; indice <= 3; indice += 1) {
            const valor = teto * indice / 3;
            const y = pontoY(valor);
            svg.appendChild(criarElementoSVG("line", {
                class: "mc-sales-daily-gridline",
                x1: margem.esquerda,
                x2: 640 - margem.direita,
                y1: y,
                y2: y
            }));
            const rotulo = criarElementoSVG("text", {
                class: "mc-sales-daily-axis-label",
                x: margem.esquerda - 9,
                y: y + 4,
                "text-anchor": "end"
            });
            rotulo.textContent = `R$ ${formatadorEixo.format(valor)}`;
            svg.appendChild(rotulo);
        }

        const pontos = valoresPorDia.map((valor, indice) => ({
            x: pontoX(indice),
            y: pontoY(valor),
            valor,
            dia: indice + 1
        }));
        const caminhoLinha = pontos.map((ponto, indice) =>
            `${indice === 0 ? "M" : "L"} ${ponto.x} ${ponto.y}`
        ).join(" ");
        const ultimoPonto = pontos[pontos.length - 1];
        const caminhoArea = `${caminhoLinha} L ${ultimoPonto.x} ${margem.baixo} ` +
            `L ${pontos[0].x} ${margem.baixo} Z`;
        svg.appendChild(criarElementoSVG("path", {
            class: "mc-sales-daily-area",
            d: caminhoArea
        }));
        svg.appendChild(criarElementoSVG("path", {
            class: "mc-sales-daily-line",
            d: caminhoLinha
        }));

        const passoRotulo = diasNoMes > 29 ? 5 : 4;
        pontos.forEach((ponto, indice) => {
            const classePonto = ponto.dia === agora.getDate()
                ? "mc-sales-daily-point is-today"
                : ponto.valor > 0
                    ? "mc-sales-daily-point"
                    : "mc-sales-daily-point is-empty";
            const circulo = criarElementoSVG("circle", {
                class: classePonto,
                cx: ponto.x,
                cy: ponto.y,
                r: ponto.valor > 0 ? 4 : 2.5,
                tabindex: 0,
                role: "img",
                "aria-label": `${ponto.dia} de ${nomeMes}: ${moeda(ponto.valor)}`
            });
            const titulo = criarElementoSVG("title");
            titulo.textContent = `${ponto.dia} de ${nomeMes}: ${moeda(ponto.valor)}`;
            circulo.appendChild(titulo);
            svg.appendChild(circulo);

            if (
                ponto.dia === 1 ||
                ponto.dia % passoRotulo === 0 ||
                ponto.dia === diasNoMes
            ) {
                const rotuloDia = criarElementoSVG("text", {
                    class: "mc-sales-daily-axis-label mc-sales-daily-day-label",
                    x: ponto.x,
                    y: margem.baixo + 21,
                    "text-anchor": "middle"
                });
                rotuloDia.textContent = String(ponto.dia);
                svg.appendChild(rotuloDia);
            }
        });

        if (maiorValor === 0) {
            const aviso = criarElementoSVG("text", {
                class: "mc-sales-daily-empty",
                x: margem.esquerda + larguraGrafico / 2,
                y: margem.topo + alturaGrafico / 2,
                "text-anchor": "middle"
            });
            aviso.textContent = "Sem vendas neste mês";
            svg.appendChild(aviso);
        }
        painel.appendChild(svg);
        painel.appendChild(criarElemento("p", "mc-sales-daily-caption", "Valor total vendido em cada dia"));
        return painel;
    }
    async function abrirVendas(secao) {
        abrirJanela(
            "Vendas",
            "Acompanhe as formas de pagamento e consulte o histórico completo.",
            secao
        );
        const estrutura = prepararEstruturaVendas(secao);
        if (!estrutura) return;
        estrutura.grafico.replaceChildren(criarElemento("p", "mc-sales-chart-loading", "Carregando formas de pagamento…"));

        try {
            const resposta = await buscarJSON("/vendas/");
            const vendas = Array.isArray(resposta)
                ? resposta
                : Array.isArray(resposta.vendas) ? resposta.vendas : [];
            montarGraficoFormasPagamento(vendas, estrutura.grafico);
            estrutura.quantidade.textContent = `${vendas.length} ${vendas.length === 1 ? "venda" : "vendas"}`;
            if (typeof window.carregarVendasRecentes === "function") {
                await window.carregarVendasRecentes(vendas);
            }
        } catch (erro) {
            console.error("Erro ao carregar resumo de vendas:", erro);
            estrutura.grafico.replaceChildren(criarElemento(
                "p",
                "mc-sales-chart-error",
                "Não foi possível carregar o resumo de pagamentos."
            ));
            estrutura.quantidade.textContent = "Histórico";
            if (typeof window.carregarVendasRecentes === "function") {
                await window.carregarVendasRecentes();
            }
        }
    }
    function criarGraficoVendasMensais() {
        const painel = criarElemento("article", "mc-chart-panel");
        painel.classList.add("mc-weekly-sales-panel");
        const grafico = criarElemento("div", "mc-weekly-chart");
        grafico.id = "mc-grafico-vendas-mensais";
        grafico.setAttribute("role", "img");
        grafico.setAttribute(
            "aria-label",
            "Gráfico de vendas da semana, de segunda a domingo"
        );
        grafico.style.width = "100%";
        grafico.style.minWidth = "0";
        grafico.style.height = "320px";
        grafico.style.position = "relative";
        painel.append(
            criarCabecalhoGrafico(
                "Vendas durante a semana",
                "Acompanhe as vendas de segunda a domingo"
            ),
            grafico,
            criarElemento(
                "p",
                "mc-chart-empty-note",
                "Os valores são calculados a partir das vendas registradas."
            )
        );
        return painel;
    }
    function criarAreaGraficos() {
        if (document.getElementById("mc-graficos-iniciais")) return;
        const secao = criarElemento("section", "mc-dashboard-charts");
        secao.id = "mc-graficos-iniciais";
        const titulo = criarElemento("div", "mc-charts-section-heading");
        titulo.append(
            criarElemento("p", "eyebrow", "VISÃO DO NEGÓCIO"),
            criarElemento("h2", "", "Indicadores do seu comércio")
        );
        const grade = criarElemento("div", "mc-charts-grid");
        grade.append(
            criarGraficoRosca(
                "Entradas, custos e retiradas",
                "Entradas e saídas separadas entre custos e retiradas",
                [
                    { nome: "Entradas", valor: 0, cor: CORES.verde },
                    { nome: "Custos", valor: 0, cor: CORES.amarelo },
                    { nome: "Retiradas", valor: 0, cor: CORES.vermelho }
                ],
                0,
                "R$",
                "do total de entradas, custos e retiradas"
            ),
            criarGraficoRosca(
                "Situação das vendas",
                "Valores recebidos e pendentes",
                [
                    { nome: "Recebido", valor: 0, cor: CORES.verde },
                    { nome: "Pendente", valor: 0, cor: CORES.amarelo }
                ],
                0,
                "R$",
                "dos valores recebidos e pendentes"
            ),
            criarGraficoRosca(
                "Situação do estoque",
                "Produtos ativos e níveis de estoque",
                [
                    {
                        nome: "Estoque adequado",
                        valor: 0,
                        cor: CORES.verde,
                        detalhe: "Mais de 5 unidades disponíveis."
                    },
                    {
                        nome: "Estoque baixo",
                        valor: 0,
                        cor: CORES.amarelo,
                        detalhe: "De 1 a 5 unidades disponíveis."
                    },
                    {
                        nome: "Sem estoque",
                        valor: 0,
                        cor: CORES.vermelho,
                        detalhe: "Zero unidades ou menos."
                    }
                ],
                0,
                "",
                "dos produtos ativos"
            ),
            criarGraficoVendasMensais()
        );
        secao.append(titulo, grade);
        const topbar = document.querySelector(".topbar");
        const main = document.querySelector(".main-content");
        if (topbar) {
            topbar.insertAdjacentElement("afterend", secao);
        } else if (main) {
            main.prepend(secao);
        }
    }
    function atualizarRosca(
        painel,
        partes,
        total,
        unidade = "",
        rotuloPercentual = "do total representado no gráfico"
    ) {
        if (!painel) return;
        renderizarRosca(painel, partes, total, unidade, rotuloPercentual);
    }
    function normalizarLista(dados, propriedade) {
        if (Array.isArray(dados)) return dados;
        if (propriedade && Array.isArray(dados?.[propriedade])) {
            return dados[propriedade];
        }
        return [];
    }
    function obterValorVenda(venda) {
        return Number(venda.valor_total ?? venda.total ?? 0) || 0;
    }
    function obterDataVenda(venda) {
        return venda.data ?? venda.data_venda ?? null;
    }
    function obterDiaDaVenda(valorData) {
        if (!valorData) return null;
        const iso = String(valorData).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) {
            return {
                ano: Number(iso[1]),
                mes: Number(iso[2]),
                dia: Number(iso[3])
            };
        }
        const data = new Date(valorData);
        if (Number.isNaN(data.getTime())) return null;
        return {
            ano: data.getFullYear(),
            mes: data.getMonth() + 1,
            dia: data.getDate()
        };
    }
    function formatarDataLocal(data) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, "0");
        const dia = String(data.getDate()).padStart(2, "0");
        return `${ano}-${mes}-${dia}`;
    }
    // ---------------- GRÁFICO DE VENDAS DA SEMANA ----------------
    function atualizarGraficoVendasMensais(vendas) {
        const grafico = document.getElementById("mc-grafico-vendas-mensais");
        if (!grafico) return;
        grafico.replaceChildren();
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        // Descobre a segunda-feira da semana atual.
        const deslocamento = (hoje.getDay() + 6) % 7;
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - deslocamento);
        const nomesDias = [
            "SEG",
            "TER",
            "QUA",
            "QUI",
            "SEX",
            "SÁB",
            "DOM"
        ];
        const dias = [];
        // Sempre mostra segunda-feira até domingo.
        for (let indice = 0; indice < 7; indice += 1) {
            const data = new Date(inicioSemana);
            data.setDate(inicioSemana.getDate() + indice);
            dias.push({
                chave: formatarDataLocal(data),
                rotulo: nomesDias[indice],
                data,
                total: 0
            });
        }
        const totaisPorData = new Map(
            dias.map((dia) => [dia.chave, dia])
        );
        // Soma as vendas correspondentes a cada dia da semana atual.
        vendas.forEach((venda) => {
            const partesData = obterDiaDaVenda(obterDataVenda(venda));
            if (!partesData) return;
            const chave =
                `${partesData.ano}-` +
                `${String(partesData.mes).padStart(2, "0")}-` +
                `${String(partesData.dia).padStart(2, "0")}`;
            const dia = totaisPorData.get(chave);
            if (dia) {
                dia.total += obterValorVenda(venda);
            }
        });
        const totalSemana = dias.reduce(
            (soma, dia) => soma + dia.total,
            0
        );
        // Área de desenho maior para deixar datas e valores legíveis.
        const largura = 700;
        const altura = 320;
        const margemEsquerda = 88;
        const margemDireita = 24;
        const margemSuperior = 48;
        const margemInferior = 68;
        const larguraUtil = largura - margemEsquerda - margemDireita;
        const alturaUtil = altura - margemSuperior - margemInferior;
        const maiorValor = Math.max(1, ...dias.map((dia) => dia.total));
        const teto = maiorValor * 1.35;
        const criarSVG = (tag, atributos = {}) => {
            const elemento = document.createElementNS(
                "http://www.w3.org/2000/svg",
                tag
            );
            Object.entries(atributos).forEach(([chave, valor]) => {
                elemento.setAttribute(chave, String(valor));
            });
            return elemento;
        };
        const svg = criarSVG("svg", {
            viewBox: `0 0 ${largura} ${altura}`,
            width: "100%",
            height: "100%",
            preserveAspectRatio: "xMidYMid meet",
            role: "img",
            "aria-label": "Vendas da semana atual, de segunda a domingo"
        });
        svg.style.display = "block";
        svg.style.overflow = "visible";
        const tituloSVG = criarSVG("title");
        tituloSVG.textContent = "Vendas durante a semana";
        svg.appendChild(tituloSVG);
        // Formata os valores do eixo vertical.
        const formatarEixo = (valor) => {
            if (valor >= 1000) {
                return `R$${(valor / 1000).toLocaleString("pt-BR", {
                    maximumFractionDigits: 1
                })} mil`;
            }
            return `R$${Math.round(valor).toLocaleString("pt-BR")}`;
        };
        // Linhas horizontais e valores do eixo.
        for (let indice = 0; indice <= 4; indice += 1) {
            const fracao = indice / 4;
            const y = margemSuperior + alturaUtil * fracao;
            const valorEixo = teto * (1 - fracao);
            svg.appendChild(
                criarSVG("line", {
                    x1: margemEsquerda,
                    y1: y,
                    x2: largura - margemDireita,
                    y2: y,
                    stroke: CORES.borda,
                    "stroke-width": 1,
                    "stroke-dasharray": "4 5"
                })
            );
            const rotulo = criarSVG("text", {
                // Afasta os rótulos do eixo vertical para criar mais espaço.
                x: margemEsquerda - 42,
                y: y + 1,
                fill: CORES.cinza,
                "font-size": 18,
                "font-family": "Arial, sans-serif",
                "text-anchor": "end"
            });
            rotulo.textContent = formatarEixo(valorEixo);
            svg.appendChild(rotulo);
        }
        // Posição dos sete pontos do gráfico.
        const pontos = dias.map((dia, indice) => {
            const x = margemEsquerda +
                (larguraUtil / (dias.length - 1)) * indice;
            const y = margemSuperior +
                alturaUtil * (1 - dia.total / teto);
            return { x, y, dia };
        });
        const primeiro = pontos[0];
        const ultimo = pontos[pontos.length - 1];
        const baseGrafico = margemSuperior + alturaUtil;
        // Área preenchida sob a linha.
        const caminhoArea = [
            `M ${primeiro.x} ${baseGrafico}`,
            ...pontos.map((ponto) => `L ${ponto.x} ${ponto.y}`),
            `L ${ultimo.x} ${baseGrafico}`,
            "Z"
        ].join(" ");
        svg.appendChild(
            criarSVG("path", {
                d: caminhoArea,
                fill: CORES.vermelho,
                "fill-opacity": 0.10,
                stroke: "none"
            })
        );
        // Linha que liga os pontos.
        const caminhoLinha = pontos
            .map((ponto, indice) =>
                `${indice === 0 ? "M" : "L"} ${ponto.x} ${ponto.y}`
            )
            .join(" ");
        svg.appendChild(
            criarSVG("path", {
                d: caminhoLinha,
                fill: "none",
                stroke: CORES.vermelho,
                "stroke-width": 3.5,
                "stroke-linecap": "round",
                "stroke-linejoin": "round"
            })
        );
        // Pontos, valores das vendas e datas.
        pontos.forEach((ponto) => {
            const circulo = criarSVG("circle", {
                cx: ponto.x,
                cy: ponto.y,
                r: 5,
                fill: CORES.vermelho,
                stroke: "#FFFFFF",
                "stroke-width": 2.5
            });
            const dica = criarSVG("title");
            dica.textContent =
                `${ponto.dia.rotulo} ` +
                `${ponto.dia.data.toLocaleDateString("pt-BR")}: ` +
                moeda(ponto.dia.total);
            circulo.appendChild(dica);
            svg.appendChild(circulo);
            // Valor de todos os dias centralizado acima do ponto.
            // Os rótulos do eixo foram deslocados para a esquerda
            // para evitar que o valor de segunda-feira se sobreponha.
            const rotuloValor = criarSVG("text", {
                x: ponto.x,
                y: ponto.y - 15,
                fill: CORES.preto,
                "font-size": 14,
                "font-family": "Arial, sans-serif",
                "font-weight": "700",
                "text-anchor": "middle",
                "paint-order": "stroke",
                stroke: "#FFFFFF",
                "stroke-width": 4,
                "stroke-linejoin": "round"
            });
            rotuloValor.textContent = moeda(ponto.dia.total);
            svg.appendChild(rotuloValor);
            // Nome do dia da semana.
            const rotuloDia = criarSVG("text", {
                x: ponto.x,
                y: altura - 37,
                fill: CORES.preto,
                "font-size": 14,
                "font-family": "Arial, sans-serif",
                "font-weight": "700",
                "text-anchor": "middle"
            });
            rotuloDia.textContent = ponto.dia.rotulo;
            svg.appendChild(rotuloDia);
            // Data no formato DD/MM abaixo do nome do dia.
            const rotuloData = criarSVG("text", {
                x: ponto.x,
                y: altura - 14,
                fill: CORES.cinza,
                "font-size": 13,
                "font-family": "Arial, sans-serif",
                "text-anchor": "middle"
            });
            rotuloData.textContent =
                ponto.dia.data.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit"
                });
            svg.appendChild(rotuloData);
        });
        grafico.appendChild(svg);
        const nota = grafico.parentElement.querySelector(
            ".mc-chart-empty-note"
        );
        if (nota) {
            nota.textContent = totalSemana > 0
                ? `Total vendido nesta semana: ${moeda(totalSemana)}.`
                : "Ainda não há vendas registradas nesta semana.";
        }
    }
    async function atualizarGraficos() {
        criarAreaGraficos();
        try {
            const [financeiro, produtos, dadosVendas, dadosMovimentacoes] = await Promise.all([
                buscarJSON("/financeiro/resumo"),
                buscarJSON("/produtos/"),
                buscarJSON("/vendas/"),
                buscarJSON("/movimentacoes/")
            ]);
            const vendasFinanceiras = financeiro.vendas ?? {};
            const recebimentos = financeiro.recebimentos ?? {};
            const movimentacoes = financeiro.movimentacoes_manuais ?? {};
            const recebido = Number(
                recebimentos.total_recebido_no_periodo ?? 0
            );
            const pendente = Number(
                vendasFinanceiras.total_a_receber_dessas_vendas ?? 0
            );
            const movimentacoesDetalhadas = normalizarLista(
                dadosMovimentacoes,
                "movimentacoes"
            );
            const entradas = movimentacoesDetalhadas.reduce((soma, item) => {
                if (String(item.tipo ?? "").trim().toLowerCase() !== "entrada") {
                    return soma;
                }
                const valor = Number(item.valor ?? 0);
                return soma + (Number.isFinite(valor) ? valor : 0);
            }, 0);
            const saidas = Number(movimentacoes.total_saidas ?? 0);
            const saidasDetalhadas = movimentacoesDetalhadas.filter(
                (item) => String(item.tipo ?? "").trim().toLowerCase() === "saida"
            );
            const retiradas = Math.min(
                saidas,
                saidasDetalhadas.reduce((soma, item) => {
                    const categoria = String(item.categoria ?? "")
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .toLowerCase();
                    if (!categoria.includes("retirad")) return soma;
                    const valor = Number(item.valor ?? 0);
                    return soma + (Number.isFinite(valor) ? valor : 0);
                }, 0)
            );
            const custos = Math.max(0, saidas - retiradas);
            const listaProdutos = normalizarLista(produtos, "produtos");
            const ativos = listaProdutos.filter(
                (produto) => produto.ativo !== false
            );
            const estoqueZerado = ativos.filter(
                (produto) => Number(produto.estoque ?? 0) <= 0
            ).length;
            const estoqueBaixo = ativos.filter((produto) => {
                const estoque = Number(produto.estoque ?? 0);
                return estoque > 0 && estoque <= 5;
            }).length;
            const estoqueAdequado = ativos.filter(
                (produto) => Number(produto.estoque ?? 0) > 5
            ).length;
            const vendas = normalizarLista(dadosVendas, "vendas");
            const paineis = document.querySelectorAll(
                "#mc-graficos-iniciais .mc-chart-panel"
            );
            atualizarRosca(
                paineis[0],
                [
                    { nome: "Entradas", valor: entradas, cor: CORES.verde },
                    { nome: "Custos", valor: custos, cor: CORES.amarelo },
                    { nome: "Retiradas", valor: retiradas, cor: CORES.vermelho }
                ],
                entradas + custos + retiradas,
                "R$",
                "do total de entradas, custos e retiradas"
            );
            atualizarRosca(
                paineis[1],
                [
                    { nome: "Recebido", valor: recebido, cor: CORES.verde },
                    { nome: "Pendente", valor: pendente, cor: CORES.amarelo }
                ],
                recebido + pendente,
                "R$",
                "dos valores recebidos e pendentes"
            );
            atualizarRosca(
                paineis[2],
                [
                    {
                        nome: "Estoque adequado",
                        valor: estoqueAdequado,
                        cor: CORES.verde,
                        detalhe: "Mais de 5 unidades disponíveis."
                    },
                    {
                        nome: "Estoque baixo",
                        valor: estoqueBaixo,
                        cor: CORES.amarelo,
                        detalhe: "De 1 a 5 unidades disponíveis."
                    },
                    {
                        nome: "Sem estoque",
                        valor: estoqueZerado,
                        cor: CORES.vermelho,
                        detalhe: "Zero unidades ou menos."
                    }
                ],
                ativos.length,
                "",
                "dos produtos ativos"
            );
            atualizarGraficoVendasMensais(vendas);
        } catch (erro) {
            console.error("Erro ao atualizar os gráficos:", erro);
            const secao = document.getElementById("mc-graficos-iniciais");
            if (secao) {
                secao.setAttribute(
                    "aria-label",
                    "Não foi possível carregar todos os gráficos. Verifique se o servidor está funcionando."
                );
            }
        }
    }
    window.atualizarGraficos = atualizarGraficos;
    // ---------------- NAVEGAÇÃO ----------------
    function configurarMenu() {
        adicionarLinkClientes();
        const botaoEntradaProdutos = document.getElementById("btn-entrada-produtos");
        botaoEntradaProdutos?.addEventListener("click", () => abrirEntradaProdutos());
        document.querySelectorAll(".navigation .nav-link").forEach((link) => {
            link.addEventListener("click", (evento) => {
                const destino = link.getAttribute("href");
                if (!destino || !destino.startsWith("#")) return;
                evento.preventDefault();
                document.querySelectorAll(".navigation .nav-link").forEach((item) => {
                    item.classList.remove("active");
                });
                link.classList.add("active");
                if (destino === "#produtos") {
                    const secao = document.getElementById("produtos");
                    if (secao) {
                        abrirJanela(
                            "Produtos",
                            "Cadastre, pesquise e gerencie os produtos do seu estoque.",
                            secao
                        );
                    }
                } else if (destino === "#vendas") {
                    const secao = document.getElementById("vendas");
                    if (secao) {
                        abrirVendas(secao);
                    }
                } else if (destino === "#clientes") {
                    abrirClientes();
                } else if (destino === "#financeiro") {
                    abrirFinanceiro();
                } else if (destino === "#movimentacoes") {
                    abrirMovimentacoes();
                }
            });
        });
    }
    document.addEventListener("DOMContentLoaded", () => {
        criarJanela();
        criarAreaGraficos();
        prepararPaginaInicial();
        configurarMenu();
        atualizarGraficos();
    });
})();
