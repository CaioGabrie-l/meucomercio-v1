
(() => {
    "use strict";

    let produtosDisponiveis = [];
    let itensVenda = [];
    let enviandoVenda = false;
    let modalVenda = null;
    let formularioVenda = null;
    let mensagemVenda = null;
    let clienteConfirmado = null;
    let modalCadastroCliente = null;

    const LIMITE_ESTOQUE_BAIXO = 5;

    const moeda = (valor) =>
        Number(valor ?? 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });

    function elemento(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    async function requisitar(url, opcoes = {}) {
        const resposta = await fetch(url, opcoes);
        const texto = await resposta.text();

        let dados = {};

        try {
            dados = texto ? JSON.parse(texto) : {};
        } catch {
            dados = { detail: texto };
        }

        if (!resposta.ok) {
            const detalhe = dados.detail;
            const mensagem = Array.isArray(detalhe)
                ? detalhe.map((erro) => erro.msg).join(" | ")
                : detalhe || "Não foi possível concluir a operação.";

            throw new Error(mensagem);
        }

        return dados;
    }

    function campo(rotulo, controle) {
        const grupo = elemento("label", "mc-sale-field");
        grupo.append(elemento("span", "", rotulo), controle);
        return grupo;
    }

    function botao(texto, classe, acao) {
        const el = elemento("button", classe, texto);
        el.type = "button";
        el.addEventListener("click", acao);
        return el;
    }

    function inicializar() {
        const secao = document.getElementById("vendas");

        if (!secao || document.getElementById("mc-abrir-nova-venda")) {
            return;
        }

        adicionarEstilos();

        const abrir = botao(
            "＋ Nova venda",
            "mc-sale-primary mc-sale-open",
            abrirModal
        );

        abrir.id = "mc-abrir-nova-venda";

        const barra = elemento("div", "mc-sale-toolbar");
        barra.appendChild(abrir);

        const historico = secao.querySelector("#lista-vendas");

        if (historico) {
            historico.insertAdjacentElement("beforebegin", barra);
        } else {
            secao.prepend(barra);
        }

        criarModal();
    }

    function adicionarEstilos() {
        if (document.getElementById("mc-sale-modal-styles")) return;

        const estilo = document.createElement("style");
        estilo.id = "mc-sale-modal-styles";

        estilo.textContent = `
            .mc-sale-toolbar {
                display: flex;
                justify-content: flex-start;
                margin: 0 0 22px;
            }

            .mc-sale-open {
                min-height: 46px;
                padding: 12px 21px;
                border: 1px solid #111;
                background: #111;
                color: #F3F0E8;
                font-family: 'Sora', sans-serif;
                font-size: 12px;
                font-weight: 700;
                box-shadow: 0 4px 12px rgb(17 17 17 / 10%);
                transition: background 180ms ease, transform 180ms ease;
            }

            .mc-sale-open:hover {
                border-color: #D94A32;
                background: #D94A32;
                color: #FFF;
                transform: translateY(-1px);
            }

            .mc-sale-overlay {
                position: fixed;
                inset: 0;
                z-index: 2000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
                background: rgb(17 17 17 / 76%);
                backdrop-filter: blur(4px);
            }

            .mc-sale-overlay[hidden] {
                display: none !important;
            }

            .mc-sale-dialog {
                display: flex;
                flex-direction: column;
                width: min(760px, 100%);
                max-height: 92vh;
                overflow: hidden;
                border: 1px solid #E4E0D7;
                background: #F3F0E8;
                box-shadow: 0 25px 90px rgb(0 0 0 / 30%);
                animation: mc-sale-enter 180ms ease-out;
            }

            .mc-sale-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 20px;
                padding: 22px 26px;
                border-bottom: 1px solid #E4E0D7;
                background: #111;
                color: #F3F0E8;
            }

            .mc-sale-modal-kicker {
                margin: 0 0 4px;
                color: #D94A32;
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 1.7px;
                text-transform: uppercase;
            }

            .mc-sale-modal-header h2 {
                margin: 0;
                color: #F3F0E8;
                font-size: 21px;
                font-weight: 800;
                letter-spacing: -.7px;
            }

            .mc-sale-modal-subtitle {
                margin: 5px 0 0;
                color: #B9B5AD;
                font-size: 11px;
            }

            .mc-sale-modal-close {
                display: grid;
                width: 40px;
                height: 40px;
                flex-shrink: 0;
                place-items: center;
                border: 1px solid #46433D;
                background: transparent;
                color: #F3F0E8;
                font-size: 25px;
                cursor: pointer;
                transition: background 180ms ease, border-color 180ms ease;
            }

            .mc-sale-modal-close:hover {
                border-color: #D94A32;
                background: #D94A32;
            }

            .mc-sale-modal-content {
                padding: 25px;
                overflow: auto;
                overscroll-behavior: contain;
            }

            .mc-sale-form {
                margin: 0;
                padding: 0;
                border: 0;
                background: transparent;
            }

            .mc-sale-form h3 {
                margin: 0;
                font-size: 17px;
                font-weight: 800;
            }

            .mc-sale-description {
                margin: 5px 0 20px;
                color: #77756F;
                font-size: 11px;
                line-height: 1.7;
            }

            .mc-sale-section-label {
                display: block;
                margin: 22px 0 11px;
                color: #77756F;
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 1.4px;
            }

            .mc-sale-items {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .mc-sale-item {
                display: grid;
                grid-template-columns: minmax(0, 1fr) 100px 38px;
                align-items: end;
                gap: 11px;
                padding: 13px;
                border: 1px solid #E4E0D7;
                background: #FAF9F6;
            }

            .mc-sale-field {
                display: flex;
                flex-direction: column;
                gap: 7px;
                min-width: 0;
                color: #111;
                font-size: 11px;
                font-weight: 600;
            }

            .mc-sale-field select,
            .mc-sale-field input {
                width: 100%;
                min-width: 0;
                min-height: 42px;
                padding: 10px;
                border: 1px solid #E4E0D7;
                border-radius: 0;
                background: #FFF;
                color: #111;
                font-family: 'Sora', sans-serif;
                font-size: 11px;
            }

            .mc-sale-field select:focus,
            .mc-sale-field input:focus {
                border-color: #D94A32;
                outline: 1px solid #D94A32;
            }

            .mc-sale-remove {
                display: grid;
                width: 38px;
                height: 42px;
                place-items: center;
                border: 1px solid #E8C9C1;
                background: transparent;
                color: #D94A32;
                font-size: 22px;
                cursor: pointer;
            }

            .mc-sale-remove:hover {
                background: #D94A32;
                color: #FFF;
            }

            .mc-sale-secondary {
                min-height: 40px;
                padding: 10px 14px;
                border: 1px solid #E4E0D7;
                background: transparent;
                color: #111;
                font-family: 'Sora', sans-serif;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: background 180ms ease, color 180ms ease;
            }

            .mc-sale-secondary:hover {
                border-color: #111;
                background: #111;
                color: #F3F0E8;
            }

            .mc-sale-items + .mc-sale-secondary {
                margin-top: 12px;
            }

            .mc-sale-total {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 15px;
                margin-top: 20px;
                padding: 18px;
                border-left: 3px solid #D94A32;
                background: #EAE6DE;
            }

            .mc-sale-total span {
                color: #77756F;
                font-size: 11px;
                font-weight: 600;
            }

            .mc-sale-total strong {
                color: #111;
                font-size: 25px;
                font-weight: 800;
                letter-spacing: -.8px;
            }

            .mc-sale-help {
                margin: 11px 0;
                color: #77756F;
                font-size: 10px;
                line-height: 1.7;
            }

            /* Aviso compacto de estoque baixo */
            .mc-sale-stock-warning {
                margin: 12px 0 0;
                padding: 10px 12px;
                border: 1px solid #E8C9C1;
                border-left: 3px solid #D94A32;
                background: #F8EFEB;
                color: #71372C;
                font-size: 11px;
                line-height: 1.5;
            }

            .mc-sale-stock-summary {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px 12px;
            }

            .mc-sale-stock-label {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                min-width: 0;
                font-weight: 600;
            }

            .mc-sale-stock-label::before {
                content: "!";
                display: inline-grid;
                flex: 0 0 18px;
                width: 18px;
                height: 18px;
                place-items: center;
                border-radius: 50%;
                background: #D94A32;
                color: #FFFFFF;
                font-size: 11px;
                font-weight: 800;
            }

            .mc-sale-stock-toggle {
                padding: 3px 0;
                border: 0;
                background: transparent;
                color: #A83222;
                font-family: 'Sora', sans-serif;
                font-size: 10px;
                font-weight: 700;
                cursor: pointer;
                text-decoration: underline;
                text-underline-offset: 3px;
            }

            .mc-sale-stock-toggle:hover {
                color: #71372C;
            }

            .mc-sale-stock-list {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 6px 18px;
                margin: 10px 0 0;
                padding: 10px 0 0 18px;
                border-top: 1px solid #E8C9C1;
                color: #71372C;
                font-size: 10px;
            }

            .mc-sale-stock-list[hidden] {
                display: none !important;
            }

            .mc-sale-payment-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .mc-sale-payment-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) minmax(110px, .7fr) 38px;
                gap: 10px;
                align-items: end;
                padding: 13px;
                border: 1px solid #E4E0D7;
                background: #FAF9F6;
            }

            .mc-sale-payment-row .mc-sale-field span {
                line-height: 1.4;
            }

            .mc-sale-pending {
                margin-top: 12px;
                padding: 12px 14px;
                border: 1px solid #E4D7BA;
                background: #F0E8D7;
                color: #8A6B30;
                font-size: 11px;
                font-weight: 600;
            }

            .mc-sale-pending.mc-sale-settled {
                border-color: #D5DFD0;
                background: #E5E9DF;
                color: #45664D;
            }

            .mc-sale-customer {
                display: none;
            }

            .mc-sale-message {
                margin: 15px 0 0;
                padding: 12px 14px;
                border: 1px solid #E4E0D7;
                background: #FAF9F6;
                font-size: 11px;
                line-height: 1.7;
                overflow-wrap: anywhere;
            }

            .mc-sale-message.mc-sale-success {
                border-color: #D5DFD0;
                background: #E5E9DF;
                color: #45664D;
            }

            .mc-sale-message.mc-sale-error {
                border-color: #E8C9C1;
                background: #F2DFD9;
                color: #A83222;
            }

            .mc-sale-actions {
                display: flex;
                justify-content: flex-end;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 22px;
                padding-top: 18px;
                border-top: 1px solid #E4E0D7;
            }

            .mc-sale-actions .mc-sale-primary {
                min-height: 42px;
                padding: 11px 19px;
                border: 1px solid #111;
                background: #111;
                color: #F3F0E8;
                font-family: 'Sora', sans-serif;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
            }

            .mc-sale-actions .mc-sale-primary:hover {
                border-color: #D94A32;
                background: #D94A32;
                color: #FFF;
            }

            .mc-sale-actions button:disabled {
                cursor: wait;
                opacity: .55;
            }

            .mc-client-popup-overlay {
                position: fixed;
                inset: 0;
                z-index: 2100;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                background: rgb(17 17 17 / 78%);
                backdrop-filter: blur(5px);
            }

            .mc-client-popup-overlay[hidden] {
                display: none !important;
            }

            .mc-client-popup {
                width: min(440px, 100%);
                max-height: 90vh;
                overflow: auto;
                padding: 25px;
                border: 1px solid #E4E0D7;
                background: #F3F0E8;
                box-shadow: 0 25px 90px rgb(0 0 0 / 30%);
                animation: mc-sale-enter 180ms ease-out;
            }

            .mc-client-popup h2 {
                margin: 0 0 8px;
                color: #111;
                font-size: 20px;
            }

            .mc-client-popup p {
                margin: 0 0 20px;
                color: #77756F;
                font-size: 11px;
                line-height: 1.7;
            }

            .mc-client-popup .mc-sale-field {
                margin-bottom: 15px;
            }

            .mc-client-popup-actions {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-top: 20px;
            }

            .mc-client-popup-actions button {
                width: 100%;
                min-height: 44px;
            }

            .mc-client-popup-error {
                margin-top: 10px !important;
                color: #A83222 !important;
            }

            .mc-client-popup .mc-sale-primary {
                padding: 12px;
                border: 1px solid #111;
                background: #111;
                color: #F3F0E8;
                font-family: 'Sora', sans-serif;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
            }

            .mc-client-popup .mc-sale-primary:hover {
                border-color: #D94A32;
                background: #D94A32;
            }

            @keyframes mc-sale-enter {
                from {
                    opacity: 0;
                    transform: translateY(8px) scale(.99);
                }

                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            @media (max-width: 600px) {
                .mc-sale-overlay {
                    align-items: flex-end;
                    padding: 0;
                }

                .mc-sale-dialog {
                    width: 100%;
                    max-height: 95vh;
                    border-right: 0;
                    border-bottom: 0;
                    border-left: 0;
                }

                .mc-sale-modal-header {
                    padding: 17px;
                }

                .mc-sale-modal-header h2 {
                    font-size: 18px;
                }

                .mc-sale-modal-content {
                    padding: 17px;
                }

                .mc-sale-item {
                    grid-template-columns: minmax(0, 1fr) 78px 32px;
                    gap: 7px;
                    padding: 9px;
                }

                .mc-sale-remove {
                    width: 32px;
                }

                .mc-sale-payment-row {
                    grid-template-columns: minmax(0, 1fr) minmax(90px, .8fr) 32px;
                    gap: 7px;
                    padding: 9px;
                }

                .mc-sale-field select,
                .mc-sale-field input {
                    padding: 8px 6px;
                    font-size: 10px;
                }

                .mc-sale-total {
                    padding: 14px 12px;
                }

                .mc-sale-total strong {
                    font-size: 21px;
                }

                .mc-sale-stock-list {
                    grid-template-columns: minmax(0, 1fr);
                }

                .mc-sale-actions {
                    flex-direction: column-reverse;
                }

                .mc-sale-actions button {
                    width: 100%;
                }

                .mc-client-popup {
                    padding: 20px;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .mc-sale-dialog,
                .mc-client-popup {
                    animation: none;
                }
            }
        `;

        document.head.appendChild(estilo);
    }

    function criarModal() {
        if (document.getElementById("mc-sale-overlay")) return;

        modalVenda = elemento("div", "mc-sale-overlay");
        modalVenda.id = "mc-sale-overlay";
        modalVenda.hidden = true;

        const dialogo = elemento("section", "mc-sale-dialog");
        dialogo.setAttribute("role", "dialog");
        dialogo.setAttribute("aria-modal", "true");
        dialogo.setAttribute("aria-labelledby", "mc-sale-modal-title");

        const cabecalho = elemento("header", "mc-sale-modal-header");
        const identificacao = elemento("div", "mc-sale-modal-identification");

        const titulo = elemento("h2", "", "Registrar nova venda");
        titulo.id = "mc-sale-modal-title";

        identificacao.append(
            elemento("p", "mc-sale-modal-kicker", "MEUCOMÉRCIO / VENDAS"),
            titulo,
            elemento(
                "p",
                "mc-sale-modal-subtitle",
                "Adicione os produtos e confira o pagamento."
            )
        );

        const fechar = botao("×", "mc-sale-modal-close", fecharModal);
        fechar.setAttribute("aria-label", "Fechar janela");

        cabecalho.append(identificacao, fechar);

        const conteudo = elemento("div", "mc-sale-modal-content");
        formularioVenda = criarFormulario();

        conteudo.appendChild(formularioVenda);
        dialogo.append(cabecalho, conteudo);
        modalVenda.appendChild(dialogo);
        document.body.appendChild(modalVenda);

        modalVenda.addEventListener("click", (evento) => {
            if (evento.target === modalVenda && !enviandoVenda) {
                fecharModal();
            }
        });

        document.addEventListener("keydown", (evento) => {
            if (
                evento.key === "Escape" &&
                modalCadastroCliente &&
                !enviandoVenda
            ) {
                fecharPopupCadastroCliente();
                return;
            }

            if (
                evento.key === "Escape" &&
                modalVenda &&
                !modalVenda.hidden &&
                !enviandoVenda
            ) {
                fecharModal();
            }
        });
    }

    function criarFormulario() {
        const formulario = elemento("form", "mc-sale-form");
        formulario.id = "mc-nova-venda";

        formulario.append(
            elemento("h3", "", "Produtos da venda"),
            elemento(
                "p",
                "mc-sale-description",
                "Escolha os produtos e as quantidades desejadas."
            ),
            elemento("div", "mc-sale-section-label", "ITENS")
        );

        const lista = elemento("div", "mc-sale-items");
        lista.id = "mc-sale-items";

        const adicionar = botao(
            "+ Adicionar produto",
            "mc-sale-secondary",
            adicionarItem
        );

        const total = elemento("div", "mc-sale-total");
        total.append(
            elemento("span", "", "Total da venda"),
            elemento("strong", "", moeda(0))
        );
        total.id = "mc-sale-total";

        const estoqueAviso = elemento("div", "mc-sale-stock-warning");
        estoqueAviso.id = "mc-sale-stock-warning";
        estoqueAviso.hidden = true;

        const pagamentos = elemento("div", "mc-sale-payment-list");
        pagamentos.id = "mc-sale-payment-list";

        const adicionarPagamento = botao(
            "+ Adicionar segunda forma de pagamento",
            "mc-sale-secondary",
            adicionarFormaPagamento
        );
        adicionarPagamento.id = "mc-sale-add-payment";

        const ajuda = elemento(
            "p",
            "mc-sale-help",
            "Você pode dividir o recebimento em até duas formas. " +
            "O valor que não for recebido ficará pendente. " +
            "Para uma venda totalmente a prazo, deixe os pagamentos vazios."
        );

        const pendente = elemento("div", "mc-sale-pending");
        pendente.id = "mc-sale-pending";
        pendente.textContent = "Falta receber: R$ 0,00";

        // Os dados do cliente são preenchidos no pop-up de venda a prazo.
        const cliente = elemento("section", "mc-sale-customer");
        cliente.id = "mc-sale-customer";
        cliente.hidden = true;

        const camposCliente = elemento("div", "mc-sale-customer-fields");
        camposCliente.id = "mc-sale-customer-fields";
        camposCliente.hidden = true;
        cliente.appendChild(camposCliente);

        mensagemVenda = elemento("p", "mc-sale-message");
        mensagemVenda.id = "mc-sale-message";
        mensagemVenda.hidden = true;
        mensagemVenda.setAttribute("role", "status");

        const acoes = elemento("div", "mc-sale-actions");

        const cancelar = botao(
            "Cancelar",
            "mc-sale-secondary",
            fecharModal
        );

        const salvar = elemento(
            "button",
            "mc-sale-primary",
            "Registrar venda"
        );
        salvar.type = "submit";
        salvar.id = "mc-sale-save";

        acoes.append(cancelar, salvar);

        formulario.append(
            lista,
            adicionar,
            total,
            estoqueAviso,
            elemento("div", "mc-sale-section-label", "PAGAMENTO"),
            pagamentos,
            adicionarPagamento,
            ajuda,
            pendente,
            cliente,
            mensagemVenda,
            acoes
        );

        formulario.addEventListener("submit", salvarVenda);

        itensVenda = [{ produto_id: "", quantidade: 1 }];
        renderizarItens();
        renderizarPagamentos();

        return formulario;
    }

    async function abrirModal() {
        if (!modalVenda) return;

        fecharPopupCadastroCliente();

        modalVenda.hidden = false;
        document.body.classList.add("mc-modal-aberto");

        itensVenda = [{ produto_id: "", quantidade: 1 }];
        formularioVenda.reset();
        limparDadosCliente();
        renderizarItens();
        renderizarPagamentos();

        mostrarMensagem("Carregando produtos...", "");

        await carregarProdutosVenda();

        modalVenda.querySelector(".mc-sale-modal-close")?.focus();
    }

    function fecharModal() {
        if (!modalVenda || enviandoVenda) return;

        fecharPopupCadastroCliente();

        modalVenda.hidden = true;
        document.body.classList.remove("mc-modal-aberto");

        formularioVenda.reset();
        limparDadosCliente();

        itensVenda = [{ produto_id: "", quantidade: 1 }];
        renderizarItens();
        renderizarPagamentos();

        mensagemVenda.hidden = true;
    }

    async function carregarProdutosVenda() {
        try {
            const dados = await requisitar("/produtos/");

            produtosDisponiveis = (
                Array.isArray(dados) ? dados : dados.produtos ?? []
            ).filter((produto) => produto.ativo);

            renderizarItens();
            atualizarAvisoEstoque();

            if (produtosDisponiveis.length === 0) {
                mostrarMensagem(
                    "Não há produtos ativos. Cadastre ou reative um produto antes de vender.",
                    "erro"
                );
            } else {
                mensagemVenda.hidden = true;
            }
        } catch (erro) {
            mostrarMensagem(erro.message, "erro");
        }
    }

    function adicionarItem() {
        itensVenda.push({ produto_id: "", quantidade: 1 });
        renderizarItens();
    }

    function renderizarItens() {
        const lista = document.getElementById("mc-sale-items");
        if (!lista) return;

        lista.replaceChildren();

        itensVenda.forEach((item, indice) => {
            const linha = elemento("div", "mc-sale-item");
            const produto = document.createElement("select");

            produto.required = true;
            produto.setAttribute("aria-label", "Produto");

            const instrucao = document.createElement("option");
            instrucao.value = "";
            instrucao.textContent = "Selecione um produto";
            produto.appendChild(instrucao);

            produtosDisponiveis.forEach((p) => {
                const opcao = document.createElement("option");
                opcao.value = String(p.id);

                const estoque = Number(p.estoque);
                const alerta = estoque <= LIMITE_ESTOQUE_BAIXO
                    ? " — ESTOQUE BAIXO"
                    : "";

                opcao.textContent =
                    `${p.nome} — ${moeda(p.preco)} ` +
                    `(estoque: ${estoque}${alerta})`;

                opcao.disabled = estoque <= 0;
                produto.appendChild(opcao);
            });

            produto.value = String(item.produto_id);

            produto.addEventListener("change", () => {
                item.produto_id = produto.value
                    ? Number(produto.value)
                    : "";

                atualizarResumo();
            });

            const quantidade = document.createElement("input");
            quantidade.type = "number";
            quantidade.min = "1";
            quantidade.step = "1";
            quantidade.required = true;
            quantidade.value = String(item.quantidade);
            quantidade.setAttribute("aria-label", "Quantidade");

            quantidade.addEventListener("input", () => {
                item.quantidade = Number(quantidade.value);
                atualizarResumo();
            });

            const remover = botao("×", "mc-sale-remove", () => {
                itensVenda.splice(indice, 1);

                if (itensVenda.length === 0) {
                    itensVenda.push({
                        produto_id: "",
                        quantidade: 1
                    });
                }

                renderizarItens();
            });

            remover.setAttribute("aria-label", "Remover produto");

            linha.append(
                campo("Produto", produto),
                campo("Quantidade", quantidade),
                remover
            );

            lista.appendChild(linha);
        });

        atualizarResumo();
    }

    function adicionarFormaPagamento() {
        const lista = document.getElementById("mc-sale-payment-list");
        if (!lista || lista.children.length >= 2) return;

        renderizarPagamentos(true);
    }

    function renderizarPagamentos(adicionarSegundo = false) {
        const lista = document.getElementById("mc-sale-payment-list");
        const adicionar = document.getElementById("mc-sale-add-payment");

        if (!lista) return;

        if (adicionarSegundo && lista.children.length === 1) {
            const atual = lista.firstElementChild;
            const valorAtual = atual.querySelector(".mc-sale-payment-value");
            const formaAtual = atual.querySelector(".mc-sale-payment-method");

            const valor = valorAtual?.value ?? "";
            const forma = formaAtual?.value ?? "";

            lista.replaceChildren();

            criarLinhaPagamento(lista, forma, valor);
            criarLinhaPagamento(lista, "", "");
        } else if (lista.children.length === 0) {
            criarLinhaPagamento(lista, "", "");
        }

        if (adicionar) {
            adicionar.hidden = lista.children.length >= 2;
        }

        atualizarResumo();
    }

    function criarLinhaPagamento(lista, formaInicial, valorInicial) {
        const linha = elemento("div", "mc-sale-payment-row");

        const forma = document.createElement("select");
        forma.className = "mc-sale-payment-method";
        forma.setAttribute("aria-label", "Forma de pagamento");

        [
            { valor: "", texto: "Não recebido / a prazo" },
            { valor: "dinheiro", texto: "Dinheiro" },
            { valor: "pix", texto: "Pix" },
            { valor: "cartao", texto: "Cartão" }
        ].forEach((item) => {
            const opcao = document.createElement("option");
            opcao.value = item.valor;
            opcao.textContent = item.texto;
            forma.appendChild(opcao);
        });

        forma.value = formaInicial || "";

        const valor = document.createElement("input");
        valor.className = "mc-sale-payment-value";
        valor.type = "number";
        valor.min = "0";
        valor.step = "0.01";
        valor.inputMode = "decimal";
        valor.placeholder = "0,00";
        valor.value = valorInicial ?? "";
        valor.setAttribute("aria-label", "Valor recebido");

        forma.addEventListener("change", () => {
            if (forma.value && Number(valor.value) <= 0) {
                const total = totalVenda();
                const jaRecebido = somarPagamentos(linha);

                valor.value = Math.max(0, total - jaRecebido).toFixed(2);
            }

            if (!forma.value) {
                valor.value = "0.00";
            }

            atualizarOpcoesFormas();
            atualizarResumo();
        });

        valor.addEventListener("input", atualizarResumo);

        const remover = botao("×", "mc-sale-remove", () => {
            if (lista.children.length <= 1) {
                forma.value = "";
                valor.value = "0.00";
            } else {
                linha.remove();
            }

            atualizarOpcoesFormas();
            atualizarResumo();

            const adicionar = document.getElementById("mc-sale-add-payment");
            if (adicionar) adicionar.hidden = lista.children.length >= 2;
        });

        remover.setAttribute("aria-label", "Remover forma de pagamento");

        linha.append(
            campo("Forma de pagamento", forma),
            campo("Valor recebido (R$)", valor),
            remover
        );

        lista.appendChild(linha);
        atualizarOpcoesFormas();
    }

    function atualizarOpcoesFormas() {
        const lista = document.getElementById("mc-sale-payment-list");
        if (!lista) return;

        const linhas = [...lista.querySelectorAll(".mc-sale-payment-row")];

        linhas.forEach((linha) => {
            const select = linha.querySelector(".mc-sale-payment-method");

            const outraForma = linhas
                .filter((outra) => outra !== linha)
                .map((outra) =>
                    outra.querySelector(".mc-sale-payment-method").value
                )
                .filter(Boolean);

            [...select.options].forEach((opcao) => {
                opcao.disabled = Boolean(
                    opcao.value && outraForma.includes(opcao.value)
                );
            });
        });
    }

    function totalVenda() {
        return itensVenda.reduce((total, item) => {
            const produto = produtosDisponiveis.find(
                (p) => Number(p.id) === Number(item.produto_id)
            );

            if (
                !produto ||
                !Number.isInteger(item.quantidade) ||
                item.quantidade < 1
            ) {
                return total;
            }

            return total +
                Math.round(Number(produto.preco) * 100) *
                item.quantidade / 100;
        }, 0);
    }

    function somarPagamentos(excluirLinha = null) {
        const linhas = document.querySelectorAll(
            "#mc-sale-payment-list .mc-sale-payment-row"
        );

        let centavos = 0;

        linhas.forEach((linha) => {
            if (linha === excluirLinha) return;

            const forma = linha.querySelector(".mc-sale-payment-method").value;
            const valor = Number(
                linha.querySelector(".mc-sale-payment-value").value
            );

            if (forma && Number.isFinite(valor) && valor > 0) {
                centavos += Math.round(valor * 100);
            }
        });

        return centavos / 100;
    }

    function atualizarResumo() {
        const totalCentavos = Math.round(totalVenda() * 100);
        const recebidoCentavos = Math.round(somarPagamentos() * 100);

        const pendenteCentavos = Math.max(
            0,
            totalCentavos - recebidoCentavos
        );

        const campoTotal = document.querySelector("#mc-sale-total strong");

        if (campoTotal) {
            campoTotal.textContent = moeda(totalCentavos / 100);
        }

        const campoPendente = document.getElementById("mc-sale-pending");

        if (campoPendente) {
            campoPendente.textContent = pendenteCentavos <= 0
                ? "Venda totalmente paga."
                : `Falta receber: ${moeda(pendenteCentavos / 100)}`;

            campoPendente.classList.toggle(
                "mc-sale-settled",
                pendenteCentavos <= 0
            );
        }

        atualizarCamposCliente();
        atualizarAvisoEstoque();
    }

    function atualizarCamposCliente() {
        const secao = document.getElementById("mc-sale-customer");
        const campos = document.getElementById("mc-sale-customer-fields");

        if (secao) secao.hidden = true;
        if (campos) campos.hidden = true;
    }

    function limparDadosCliente() {
        clienteConfirmado = null;

        const nome = document.getElementById("mc-sale-customer-name");
        const whatsapp = document.getElementById("mc-sale-customer-whatsapp");

        if (nome) nome.value = "";
        if (whatsapp) whatsapp.value = "";

        atualizarCamposCliente();
    }

    function abrirPopupCadastroCliente() {
        if (modalCadastroCliente) {
            modalCadastroCliente.remove();
        }

        const overlay = elemento("div", "mc-client-popup-overlay");
        overlay.id = "mc-client-popup-overlay";

        const popup = elemento("section", "mc-client-popup");
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-modal", "true");
        popup.setAttribute("aria-labelledby", "mc-client-popup-title");

        const titulo = elemento("h2", "", "Venda a prazo");
        titulo.id = "mc-client-popup-title";

        const descricao = elemento(
            "p",
            "",
            "Esta venda tem um valor pendente. Informe os dados do cliente para continuar."
        );

        const formulario = elemento("form", "");
        formulario.noValidate = true;

        const nome = document.createElement("input");
        nome.type = "text";
        nome.name = "cliente_nome";
        nome.autocomplete = "name";
        nome.maxLength = 150;
        nome.required = true;
        nome.placeholder = "Nome completo";

        const whatsapp = document.createElement("input");
        whatsapp.type = "tel";
        whatsapp.name = "cliente_whatsapp";
        whatsapp.autocomplete = "tel";
        whatsapp.inputMode = "tel";
        whatsapp.maxLength = 20;
        whatsapp.required = true;
        whatsapp.placeholder = "(18) 99999-9999";

        const erro = elemento("p", "mc-client-popup-error");
        erro.hidden = true;
        erro.setAttribute("role", "alert");

        const acoes = elemento("div", "mc-client-popup-actions");

        const confirmar = elemento(
            "button",
            "mc-sale-primary",
            "Confirmar e registrar venda"
        );
        confirmar.type = "submit";

        const cancelar = elemento(
            "button",
            "mc-sale-secondary",
            "Voltar para a venda"
        );
        cancelar.type = "button";

        cancelar.addEventListener("click", () => {
            fecharPopupCadastroCliente();
        });

        formulario.append(
            campo("Nome do cliente *", nome),
            campo("WhatsApp com DDD *", whatsapp),
            erro,
            acoes
        );

        acoes.append(confirmar, cancelar);
        popup.append(titulo, descricao, formulario);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        modalCadastroCliente = overlay;

        formulario.addEventListener("submit", (evento) => {
            evento.preventDefault();

            const nomeInformado = nome.value.trim();
            const whatsappInformado = whatsapp.value.trim();
            const digitos = whatsappInformado.replace(/\D/g, "");

            erro.hidden = true;

            if (!nomeInformado) {
                erro.textContent = "Informe o nome do cliente.";
                erro.hidden = false;
                nome.focus();
                return;
            }

            if (digitos.length < 10 || digitos.length > 15) {
                erro.textContent =
                    "Informe um WhatsApp válido, com DDD e número.";
                erro.hidden = false;
                whatsapp.focus();
                return;
            }

            clienteConfirmado = {
                nome: nomeInformado,
                whatsapp: whatsappInformado
            };

            overlay.remove();
            modalCadastroCliente = null;

            // O formulário original da venda é enviado novamente.
            formularioVenda.requestSubmit();
        });

        nome.focus();
    }

    function fecharPopupCadastroCliente() {
        if (modalCadastroCliente) {
            modalCadastroCliente.remove();
            modalCadastroCliente = null;
        }

        clienteConfirmado = null;
    }

    // ---------------- AVISO COMPACTO DE ESTOQUE ----------------

    function atualizarAvisoEstoque() {
        const aviso = document.getElementById("mc-sale-stock-warning");
        if (!aviso) return;

        const baixos = produtosDisponiveis.filter(
            (produto) =>
                Number(produto.estoque) > 0 &&
                Number(produto.estoque) <= LIMITE_ESTOQUE_BAIXO
        );

        aviso.replaceChildren();
        aviso.hidden = baixos.length === 0;

        if (baixos.length === 0) return;

        const resumo = elemento("div", "mc-sale-stock-summary");

        const rotulo = elemento(
            "span",
            "mc-sale-stock-label",
            `${baixos.length} ${
                baixos.length === 1
                    ? "produto com estoque baixo"
                    : "produtos com estoque baixo"
            }`
        );

        const listaId = "mc-sale-stock-list";
        const lista = elemento("ul", "mc-sale-stock-list");
        lista.id = listaId;
        lista.hidden = true;

        baixos.forEach((produto) => {
            lista.appendChild(
                elemento(
                    "li",
                    "",
                    `${produto.nome} — ${produto.estoque} un.`
                )
            );
        });

        const alternar = botao(
            "Ver produtos ↓",
            "mc-sale-stock-toggle",
            () => {
                const expandir = lista.hidden;

                lista.hidden = !expandir;

                alternar.textContent = expandir
                    ? "Ocultar produtos ↑"
                    : "Ver produtos ↓";

                alternar.setAttribute(
                    "aria-expanded",
                    String(expandir)
                );
            }
        );

        alternar.setAttribute("aria-controls", listaId);
        alternar.setAttribute("aria-expanded", "false");

        resumo.append(rotulo, alternar);
        aviso.append(resumo, lista);
    }

    function mostrarMensagem(texto, tipo = "") {
        if (!mensagemVenda) return;

        mensagemVenda.textContent = texto;

        mensagemVenda.classList.remove(
            "mc-sale-success",
            "mc-sale-error"
        );

        if (tipo === "sucesso") {
            mensagemVenda.classList.add("mc-sale-success");
        }

        if (tipo === "erro") {
            mensagemVenda.classList.add("mc-sale-error");
        }

        mensagemVenda.hidden = false;
    }

    async function salvarVenda(evento) {
        evento.preventDefault();

        if (enviandoVenda) return;

        if (itensVenda.length === 0) {
            mostrarMensagem("Adicione pelo menos um produto.", "erro");
            return;
        }

        for (const item of itensVenda) {
            const produto = produtosDisponiveis.find(
                (p) => Number(p.id) === Number(item.produto_id)
            );

            if (!produto) {
                mostrarMensagem("Selecione todos os produtos.", "erro");
                return;
            }

            if (!Number.isInteger(item.quantidade) || item.quantidade < 1) {
                mostrarMensagem(
                    "As quantidades devem ser números inteiros maiores que zero.",
                    "erro"
                );
                return;
            }

            if (item.quantidade > Number(produto.estoque)) {
                mostrarMensagem(
                    `Estoque insuficiente para ${produto.nome}. ` +
                    `Disponível: ${produto.estoque}.`,
                    "erro"
                );
                return;
            }
        }

        const totalCentavos = Math.round(totalVenda() * 100);

        const linhasPagamento = [
            ...document.querySelectorAll(
                "#mc-sale-payment-list .mc-sale-payment-row"
            )
        ];

        const pagamentos = [];

        for (const linha of linhasPagamento) {
            const forma = linha.querySelector(".mc-sale-payment-method").value;
            const campoValor = linha.querySelector(".mc-sale-payment-value");
            const textoValor = campoValor.value.trim();
            const valor = textoValor === "" ? 0 : Number(textoValor);

            if (!Number.isFinite(valor) || valor < 0) {
                mostrarMensagem("Informe valores de pagamento válidos.", "erro");
                return;
            }

            if (valor > 0 && !forma) {
                mostrarMensagem(
                    "Selecione uma forma para cada valor recebido.",
                    "erro"
                );
                return;
            }

            if (forma && valor > 0) {
                pagamentos.push({
                    forma_pagamento: forma,
                    valor: Math.round(valor * 100) / 100
                });
            }
        }

        const totalPagamentosCentavos = pagamentos.reduce(
            (soma, pagamento) =>
                soma + Math.round(pagamento.valor * 100),
            0
        );

        if (totalPagamentosCentavos > totalCentavos) {
            mostrarMensagem(
                "A soma dos pagamentos não pode ultrapassar o total da venda.",
                "erro"
            );
            return;
        }

        const pendenteCentavos = totalCentavos - totalPagamentosCentavos;

        let clienteNome = "";
        let clienteWhatsapp = "";

        if (pendenteCentavos > 0) {
            // O registro é interrompido até que o cliente seja informado.
            if (!clienteConfirmado) {
                abrirPopupCadastroCliente();
                return;
            }

            clienteNome = clienteConfirmado.nome;
            clienteWhatsapp = clienteConfirmado.whatsapp;
        }

        const botaoSalvar = document.getElementById("mc-sale-save");

        enviandoVenda = true;
        botaoSalvar.disabled = true;
        botaoSalvar.textContent = "Registrando...";

        try {
            const corpo = {
                itens: itensVenda.map((item) => ({
                    produto_id: Number(item.produto_id),
                    quantidade: item.quantidade
                })),
                pagamentos
            };

            if (pendenteCentavos > 0) {
                corpo.cliente_nome = clienteNome;
                corpo.cliente_whatsapp = clienteWhatsapp;
            }

            const resultado = await requisitar("/vendas/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(corpo)
            });

            const venda = resultado.venda ?? {};
            const recebido = totalPagamentosCentavos / 100;
            const pendente = pendenteCentavos / 100;

            mostrarMensagem(
                `Venda #${venda.id ?? ""} registrada! ` +
                `Total: ${moeda(venda.valor_total)}. ` +
                `Recebido: ${moeda(recebido)}. ` +
                `Pendente: ${moeda(pendente)}.` +
                (pendente > 0 ? ` Cliente: ${clienteNome}.` : ""),
                "sucesso"
            );

            itensVenda = [{ produto_id: "", quantidade: 1 }];
            formularioVenda.reset();
            limparDadosCliente();
            clienteConfirmado = null;
            renderizarItens();

            const listaPagamentos = document.getElementById(
                "mc-sale-payment-list"
            );

            if (listaPagamentos) {
                listaPagamentos.replaceChildren();
                criarLinhaPagamento(listaPagamentos, "", "");
            }

            await carregarProdutosVenda();

            if (typeof window.carregarProdutos === "function") {
                await window.carregarProdutos();
            }

            if (typeof window.carregarVendasRecentes === "function") {
                await window.carregarVendasRecentes();
            }

            if (typeof window.atualizarGraficos === "function") {
                await window.atualizarGraficos();
            }
        } catch (erro) {
            mostrarMensagem(
                erro.message || "Não foi possível registrar a venda.",
                "erro"
            );
        } finally {
            enviandoVenda = false;
            botaoSalvar.disabled = false;
            botaoSalvar.textContent = "Registrar venda";
        }
    }

    document.addEventListener("DOMContentLoaded", inicializar);
})();
