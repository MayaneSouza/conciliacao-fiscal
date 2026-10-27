import { Cadastro } from "./importers/cadastro.js";
import { readViasoft } from "./importers/viasoft.js";
import { readDocuments } from "./importers/documents.js";
import { FormatError } from "./importers/util.js";
import { preparar, calcular, html as confHtml, diaPadrao, diasDoMes } from "./confronto.js";

const api = (await import(new URLSearchParams(location.search).has("mock") ? "./api.mock.js" : "./api.js")).api;
const XLSX = window.XLSX;
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const num = (n) => Number(n || 0).toLocaleString("pt-BR");

const S = { perfil: null, estabs: [], cache: {}, conf: {}, aba: "cf", f: {}, lim: {}, mes: new Date().toISOString().slice(0, 7), grupo: "" };
const pode = () => S.perfil && ["operador", "administrador"].includes(S.perfil.papel);
const admin = () => S.perfil?.papel === "administrador";
const estabNome = (c) => { if (c == null) return "Sem estabelecimento"; const e = S.estabs.find((x) => x.cod === c); return e ? `${c} - ${e.nome}` : String(c); };
const grupos = () => [...new Set(S.estabs.map((e) => e.grupo))].sort();

const ABAS = [
  { id: "cf", nome: "Confronto CF" },
  { id: "rn", nome: "Confronto Renova" },
  { id: "pendencias", nome: "Pendências", sits: ["pendente"], acoes: ["lancar", "recusar", "pessoal"], exporta: true },
  { id: "lancamentos", nome: "Lançamentos", sits: ["lancado"], acoes: ["desfazer"], periodo: true },
  { id: "nao_confirmados", nome: "Lançamentos não confirmados", sits: ["nao_confirmado"], acoes: ["desfazer"] },
  { id: "divergencias", nome: "Divergências de lançamentos" },
  { id: "recusadas", nome: "Recusadas", sits: ["recusado"], acoes: ["reverter_recusa"], extra: "recusa" },
  { id: "importacoes", nome: "Importações", op: true },
  { id: "revisao", nome: "Revisão" },
  { id: "pessoais", nome: "Pessoais", pessoais: true, acoes: ["reverter_pessoal"] },
  { id: "usuarios", nome: "Usuários", adm: true },
];

// ---------------------------------------------------------------- entrada
const app = $("#app");
function msg(el, texto, tipo = "e") { el.innerHTML = texto ? `<div class="msg ${tipo}" role="alert">${esc(texto)}</div>` : ""; }

function telaLogin() {
  app.innerHTML = `<div class="login"><section><h1>Conciliação fiscal</h1>
    <form id="fl"><label for="em">E-mail</label><input id="em" type="email" autocomplete="username" required>
    <label for="sn">Senha</label><input id="sn" type="password" autocomplete="current-password" required>
    <div id="lm"></div><div class="row" style="margin-top:12px"><button class="btn p" type="submit">Entrar</button>
    <button class="btn" type="button" id="esq">Esqueci a senha</button></div></form></section></div>`;
  $("#fl").onsubmit = async (e) => {
    e.preventDefault(); msg($("#lm"), "");
    try { await api.entrar($("#em").value.trim(), $("#sn").value); await iniciar(); }
    catch (err) { msg($("#lm"), /Invalid login/i.test(err.message) ? "E-mail ou senha incorretos." : err.message); }
  };
  $("#esq").onclick = async () => {
    const em = $("#em").value.trim(); if (!em) return msg($("#lm"), "Digite o e-mail primeiro.");
    try { await api.esqueciSenha(em); msg($("#lm"), "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.", "o"); }
    catch (err) { msg($("#lm"), err.message); }
  };
}

function telaSenha() {
  app.innerHTML = `<div class="login"><section><h1>Definir senha</h1>
    <form id="fs"><label for="s1">Nova senha (mínimo 8 caracteres)</label><input id="s1" type="password" autocomplete="new-password" minlength="8" required>
    <label for="s2">Repita a senha</label><input id="s2" type="password" autocomplete="new-password" minlength="8" required>
    <div id="sm"></div><div class="row" style="margin-top:12px"><button class="btn p" type="submit">Salvar e entrar</button></div></form></section></div>`;
  $("#fs").onsubmit = async (e) => {
    e.preventDefault();
    if ($("#s1").value !== $("#s2").value) return msg($("#sm"), "As senhas não são iguais.");
    try { await api.definirSenha($("#s1").value); history.replaceState(null, "", location.pathname + location.search); await iniciar(); }
    catch (err) { msg($("#sm"), err.message); }
  };
}

function telaEspera(texto) {
  app.innerHTML = `<div class="login"><section><h1>Conciliação fiscal</h1><p>${esc(texto)}</p>
    <div class="row"><button class="btn" id="sai">Sair</button></div></section></div>`;
  $("#sai").onclick = async () => { await api.sair(); telaLogin(); };
}

async function iniciar() {
  const sessao = await api.sessao();
  if (!sessao) return telaLogin();
  try { S.perfil = await api.perfil(); } catch (e) { return telaEspera("Não foi possível carregar seu perfil: " + e.message); }
  if (!S.perfil) return telaEspera("Seu usuário ainda não tem perfil. Peça ao administrador.");
  if (!S.perfil.ativo) return telaEspera("Seu acesso ainda não foi liberado. Peça ao administrador para ativar seu usuário.");
  S.estabs = await api.estabs();
  S.cache = {};
  desenharApp();
}

// ---------------------------------------------------------------- estrutura
function desenharApp() {
  const abas = ABAS.filter((a) => (!a.op || pode()) && (!a.adm || admin()));
  if (!abas.some((a) => a.id === S.aba)) S.aba = "cf";
  app.innerHTML = `<header>${api.mock ? '<div class="demo">Dados fictícios de teste. Nada aqui é real.</div>' : ""}<div class="bar hd"><h1>Conciliação fiscal</h1>
      <span class="who">${esc(S.perfil.nome)} · ${esc(S.perfil.papel)}</span><button class="btn" id="sai">Sair</button></div>
      <nav role="tablist">${abas.map((a) => `<button role="tab" data-aba="${a.id}" aria-selected="${a.id === S.aba}">${esc(a.nome)}</button>`).join("")}</nav></header>
    <main id="main"></main>
    <dialog id="dlg"></dialog>`;
  $("#sai").onclick = async () => { await api.sair(); S.perfil = null; telaLogin(); };
  $("nav").onclick = (e) => { const b = e.target.closest("[data-aba]"); if (b) { S.aba = b.dataset.aba; desenharApp(); } };
  desenharAba();
}

async function desenharAba() {
  const a = ABAS.find((x) => x.id === S.aba), main = $("#main");
  main.innerHTML = `<section><p class="mu">Carregando…</p></section>`;
  try {
    if (a.id === "cf" || a.id === "rn") await abaConf(main, a.id);
    else if (a.id === "divergencias") await abaDivergencias(main);
    else if (a.id === "revisao") await abaRevisao(main);
    else if (a.id === "importacoes") await abaImportacoes(main);
    else if (a.id === "usuarios") await abaUsuarios(main);
    else await abaDocs(main, a);
  } catch (e) { main.innerHTML = `<section><div class="msg e">Erro: ${esc(e.message)}</div></section>`; }
}

// ---------------------------------------------------------------- Confronto diário (CF e Renova)
async function abaConf(main, chave) {
  const mes = S.mes, ini = `${mes}-01`, fim = `${mes}-${String(diasDoMes(mes)).padStart(2, "0")}`;
  const ck = "conf" + mes;
  S.cache[ck] ??= preparar(await api.confrontoDados(ini, fim), mes);
  const rows = S.cache[ck], st = (S.conf[chave] ??= { ti: "", ex: "all", dt: null, mes: null });
  if (st.mes !== mes || st.dt == null) { st.mes = mes; st.dt = diaPadrao(rows, mes, new Date().toISOString().slice(0, 10)); }
  const c = calcular(rows, S.estabs, chave, { mes, dt: st.dt, ti: st.ti, ex: st.ex });
  main.innerHTML = confHtml(c, { mes, ti: st.ti, ex: st.ex });
  $("#fmes").onchange = (e) => { if (e.target.value) { S.mes = e.target.value; desenharAba(); } };
  $("#fdt").onchange = (e) => { st.dt = Number(e.target.value); desenharAba(); };
  $("#fti").onchange = (e) => { st.ti = e.target.value; desenharAba(); };
  $("#fex").onchange = (e) => { st.ex = e.target.value; desenharAba(); };
}

// ---------------------------------------------------------------- abas de documentos
const COLS = [
  ["estab", "Estabelecimento", (r) => esc(estabNome(r.estab) + (r.estab == null ? ` (${r.grupo})` : ""))],
  ["tipo", "Tipo", (r) => esc(r.tipo)],
  ["tags", "Tag", (r) => (r.tags ?? []).map((t) => `<span class="tag ${t.startsWith("CT-e") ? "cte" : ""}">${esc(t)}</span>`).join("")],
  ["emissao", "Emissão", (r) => dt(r.emissao)],
  ["numero", "Número", (r) => esc(r.numero)],
  ["fornecedor_nome", "Fornecedor", (r) => esc(r.fornecedor_nome)],
  ["valor", "Valor", (r) => brl(r.valor), "n"],
  ["natureza", "Natureza", (r) => esc(r.natureza)],
];
const COLS_EXTRA = {
  lancamentos: [["origem", "Situação", (r) => `<span class="chip ${r.origem === "Manual" ? "c-wn" : "c-ok"}">${esc(r.origem)}</span>`], ["data_lancamento", "Lançado em", (r) => dt(r.data_lancamento)]],
  nao_confirmados: [["marcado_em", "Marcado em", (r) => dt(r.marcado_em)]],
  recusadas: [["recusa_motivo", "Motivo", (r) => esc(r.recusa_motivo)], ["recusa_observacao", "Observação", (r) => esc(r.recusa_observacao)], ["recusado_em", "Recusada em", (r) => dt(r.recusado_em)]],
};
const CHAVE = ["chave", "Chave / identificação", (r) => `<span class="kc">${esc(r.chave || "(sem chave)")}</span>`];
const ROTULO = { lancar: "Marcar como lançado", recusar: "Recusar documento", pessoal: "Marcar como pessoal", desfazer: "Voltar para pendente", reverter_recusa: "Reverter", reverter_pessoal: "Reverter" };

function filtrar(rows, f) {
  const q = (f.q || "").toLowerCase(), forn = (f.forn || "").toLowerCase();
  return rows.filter((r) =>
    (!f.estab || (f.estab === "x" ? r.estab == null : String(r.estab) === f.estab)) && (!f.tipo || r.tipo === f.tipo) &&
    (!f.nat || r.natureza === f.nat) && (!f.tag || (r.tags ?? []).includes(f.tag)) &&
    (!forn || (r.fornecedor_nome || "").toLowerCase().includes(forn) || (r.fornecedor_doc || "").includes(forn)) &&
    (!q || (r.chave || "").includes(q) || String(r.numero).toLowerCase().includes(q)) &&
    (!f.ini || r.emissao >= f.ini) && (!f.fim || r.emissao <= f.fim));
}

async function abaDocs(main, a) {
  const per = a.periodo ? { ini: `${S.mes}-01`, fim: `${S.mes}-31` } : {};
  const chave = a.id + (a.periodo ? S.mes : "");
  if (!S.cache[chave]) {
    main.innerHTML = `<section><p class="mu" id="prog">Carregando…</p></section>`;
    S.cache[chave] = a.pessoais ? await api.pessoais() : await api.docs(a.sits, (n) => { const p = $("#prog"); if (p) p.textContent = `Carregando… ${num(n)}`; }, per);
  }
  const rows = S.cache[chave], f = (S.f[a.id] ??= {});
  const uniq = (k) => [...new Set(rows.map((r) => r[k]).filter((x) => x != null && x !== ""))].sort();
  const sel = (id, lbl, opts) => `<select id="f_${id}" aria-label="${lbl}"><option value="">${lbl}</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(f[id]) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const cods = [...new Set(rows.map((r) => r.estab))].sort((x, y) => (x ?? 1e9) - (y ?? 1e9));
  main.innerHTML = `<section><h2>${esc(a.nome)} <span class="mu" id="cnt"></span></h2>
    ${a.periodo ? `<div class="row"><label>Mês de emissão <input type="month" id="mes2" value="${S.mes}"></label></div>` : ""}
    <div class="flt2">${sel("estab", "Estabelecimento", cods.map((c) => [c == null ? "x" : c, estabNome(c)]))}
      ${sel("tipo", "Tipo", uniq("tipo").map((x) => [x, x]))} ${sel("nat", "Natureza", uniq("natureza").slice(0, 300).map((x) => [x, x]))}
      ${sel("tag", "Tag", ["CT-e complemento", "CT-e substituto", "SEM IE"].map((x) => [x, x]))}
      <input id="f_forn" type="search" placeholder="Fornecedor (nome ou CNPJ)" value="${esc(f.forn || "")}">
      <input id="f_q" type="search" placeholder="Número ou chave" value="${esc(f.q || "")}">
      <label class="mu">de <input id="f_ini" type="date" value="${f.ini || ""}"></label><label class="mu">até <input id="f_fim" type="date" value="${f.fim || ""}"></label>
      ${a.exporta ? `<button class="btn" id="xls">Exportar Excel</button>` : ""}</div>
    <div id="res"></div><div id="am"></div></section>`;
  for (const id of ["estab", "tipo", "nat", "tag", "forn", "q", "ini", "fim"]) {
    $("#f_" + id).oninput = (e) => { f[id] = e.target.value; S.lim[a.id] = 300; tabela(a, rows); };
  }
  if (a.periodo) $("#mes2").onchange = (e) => { if (e.target.value) { S.mes = e.target.value; desenharAba(); } };
  if (a.exporta) $("#xls").onclick = () => exportar(a, filtrar(rows, f));
  $("#res").onclick = (e) => agir(e, a, chave);
  tabela(a, rows);
}

function tabela(a, rows) {
  const f = S.f[a.id], vis = filtrar(rows, f), lim = (S.lim[a.id] ??= 300);
  const cols = [...COLS, ...(COLS_EXTRA[a.id] ?? []), CHAVE];
  const acoes = pode() ? a.acoes ?? [] : [];
  const soma = vis.reduce((s, r) => s + Number(r.valor), 0);
  $("#cnt").textContent = `· ${num(vis.length)} de ${num(rows.length)} · ${brl(soma)}`;
  $("#res").innerHTML = vis.length ? `<div class="pw" id="pw"><table><thead><tr>${cols.map((c) => `<th class="${c[3] || ""}">${c[1]}</th>`).join("")}${acoes.length ? "<th>Ações</th>" : ""}</tr><tr class="sb"><th colspan="${cols.length + (acoes.length ? 1 : 0)}"><div class="sbs" id="sbs"><i id="sbi"></i></div></th></tr></thead><tbody>
    ${vis.slice(0, lim).map((r) => `<tr>${cols.map((c) => `<td class="${c[3] || ""}">${c[2](r)}</td>`).join("")}${acoes.length ? `<td class="ac">${acoes.map((x) => {
      if (x === "desfazer" && r.origem !== "Manual" && a.id === "lancamentos") return "";
      return `<button class="btn" data-act="${x}" data-id="${r.id}">${ROTULO[x]}</button> `;
    }).join("")}</td>` : ""}</tr>`).join("")}</tbody></table></div>
    ${vis.length > lim ? `<p><button class="btn" data-more="1">Mostrar mais (${num(vis.length - lim)} restantes)</button></p>` : ""}` : `<p class="mu">Nada para mostrar com estes filtros.</p>`;
  sbar();
}

// Congela o cabeçalho e coloca uma barra de rolagem horizontal logo abaixo dele, sincronizada com a tabela
function sbar() {
  try {
    const w = $("#pw"), s = $("#sbs"); if (!w || !s) return;
    const t = w.querySelector("table"), th = w.querySelector("thead th");
    w.style.setProperty("--hh", th.offsetHeight + "px");
    const fit = () => { s.style.width = w.clientWidth + "px"; $("#sbi").style.width = t.scrollWidth + "px"; };
    fit(); let a = 0;
    s.onscroll = () => { if (a) { a = 0; return; } if (w.scrollLeft !== s.scrollLeft) { a = 1; w.scrollLeft = s.scrollLeft; } };
    w.onscroll = () => { if (a) { a = 0; return; } if (s.scrollLeft !== w.scrollLeft) { a = 1; s.scrollLeft = w.scrollLeft; } };
    window.addEventListener("resize", fit);
  } catch (e) { /* sem barra extra: a tabela continua rolando normalmente */ }
}

async function agir(e, a, chave) {
  if (e.target.closest("[data-more]")) { S.lim[a.id] += 300; return tabela(a, S.cache[chave]); }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = Number(b.dataset.id), act = b.dataset.act, rows = S.cache[chave], r = rows.find((x) => x.id === id);
  const fim = () => { S.cache = {}; S.cache[chave] = rows.filter((x) => x.id !== id); tabela(a, S.cache[chave]); };
  try {
    b.disabled = true;
    if (act === "lancar") { await api.marcarLancado(id); fim(); }
    else if (act === "desfazer") { await api.desfazerMarca(id); fim(); }
    else if (act === "reverter_recusa") { await api.reverterRecusa(id); fim(); }
    else if (act === "reverter_pessoal") { await api.reverterPessoal(id); fim(); }
    else if (act === "pessoal") {
      if (!confirm("Marcar como pessoal? O documento sai das listas de conferência.")) { b.disabled = false; return; }
      await api.marcarPessoal(id); fim();
    } else if (act === "recusar") {
      b.disabled = false; const d = await pedirRecusa(r); if (!d) return;
      await api.recusar(id, d.motivo, d.obs); fim();
    }
  } catch (err) { b.disabled = false; msg($("#am"), err.message); }
}

function pedirRecusa(r) {
  const dlg = $("#dlg");
  dlg.innerHTML = `<form method="dialog"><h2>Recusar documento</h2><p class="mu">Controle interno: nada é enviado à SEFAZ.<br>${esc(r.fornecedor_nome)} · nº ${esc(r.numero)} · ${brl(r.valor)}</p>
    <label>Motivo</label><select id="rm" required><option value="">Escolha…</option><option>Operação não reconhecida</option><option>Mercadoria/serviço não recebido</option>
    <option>Valor divergente</option><option>Duplicidade</option><option>Outro</option></select>
    <label>Observação</label><textarea id="ro"></textarea>
    <div class="row" style="margin-top:12px"><button class="btn p" value="ok">Recusar</button><button class="btn" value="x" formnovalidate>Cancelar</button></div></form>`;
  return new Promise((res) => {
    dlg.onclose = () => res(dlg.returnValue === "ok" ? { motivo: $("#rm").value, obs: $("#ro").value.trim() } : null);
    dlg.returnValue = ""; dlg.showModal();
  });
}

function exportar(a, rows) {
  const dados = rows.map((r) => ({
    Estabelecimento: estabNome(r.estab), Tipo: r.tipo, Tag: (r.tags ?? []).join(", "), Emissão: dt(r.emissao), Número: r.numero, Série: r.serie,
    Fornecedor: r.fornecedor_nome, "CNPJ/CPF fornecedor": r.fornecedor_doc, Valor: Number(r.valor), Natureza: r.natureza, Chave: r.chave,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), "Pendências");
  XLSX.writeFile(wb, `pendencias-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------------------------------------------------------------- Divergências e Revisão
async function abaDivergencias(main) {
  const rows = (S.cache.div ??= await api.divergencias());
  main.innerHTML = `<section><h2>Divergências de lançamentos <span class="mu">· ${num(rows.length)}</span></h2>
    <p class="mu">Documento e lançamento conferem pela chave ou número, mas o valor ou o CNPJ do fornecedor é diferente.</p>
    ${rows.length ? `<div class="pw"><table><thead><tr><th>Estabelecimento</th><th>Tipo</th><th>Emissão</th><th>Número</th><th>Fornecedor</th><th class="n">Valor do documento</th><th class="n">Valor lançado</th><th>Divergência</th><th>Cruzou por</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(estabNome(r.estab))}</td><td>${esc(r.tipo)}</td><td>${dt(r.emissao)}</td><td>${esc(r.numero)}</td><td>${esc(r.fornecedor_nome)}</td>
      <td class="n">${brl(r.valor_documento)}</td><td class="n">${brl(r.valor_lancado)}</td>
      <td>${r.divergencia_valor ? '<span class="chip c-bd">valor</span> ' : ""}${r.divergencia_cnpj ? '<span class="chip c-wn">CNPJ</span>' : ""}</td><td>${esc(r.metodo)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="mu">Nenhuma divergência.</p>'}</section>`;
}

async function abaRevisao(main) {
  const rows = (S.cache.rev ??= await api.revisao());
  main.innerHTML = `<section><h2>Revisão <span class="mu">· ${num(rows.length)}</span></h2>
    <p class="mu">Casos que não se confirmam sozinhos. <b>Ambígua</b>: mais de um documento serve para o mesmo lançamento. <b>Provável</b>: fornecedor, valor e emissão batem, mas o número não.
    Depois de decidir, marque o documento como lançado na aba Pendências ou ajuste o cadastro.</p>
    ${rows.length ? `<div class="pw"><table><thead><tr><th>Caso</th><th>Estabelecimento</th><th>Lançamento (Viasoft)</th><th>Entrada</th><th class="n">Valor</th><th>Documento recebido</th><th>Emissão</th><th class="n">Valor</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><span class="chip ${r.tipo === "ambigua" ? "c-wn" : "c-in"}">${r.tipo === "ambigua" ? "ambígua" : "provável"}</span></td><td>${esc(estabNome(r.estab))}</td>
      <td>nº ${esc(r.lanc_numero)} · ${esc(r.lanc_fornecedor)}</td><td>${dt(r.lanc_entrada)}</td><td class="n">${brl(r.lanc_valor)}</td>
      <td>${esc(r.doc_tipo)} nº ${esc(r.doc_numero)}</td><td>${dt(r.doc_emissao)}</td><td class="n">${brl(r.doc_valor)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="mu">Nada para revisar.</p>'}</section>`;
}

// ---------------------------------------------------------------- Importações
let PREP = null;
async function abaImportacoes(main) {
  const hist = await api.importacoes();
  main.innerHTML = `<section><h2>Importar arquivo</h2>
    <p class="mu">Relatório de lançamentos do Viasoft (um arquivo por filial)${admin() ? ", ou documentos recebidos (Qive/Arquivei, SEFAZ-MT, portal nacional da NFS-e)" : ""}. Formatos: .xlsx, .xls, .csv.</p>
    <label class="dz" id="dz" style="display:block">Arraste o arquivo aqui ou <input type="file" id="arq" accept=".xlsx,.xls,.csv"></label>
    <div id="pv" class="pv"></div></section>
    <section><h2>Últimas importações</h2>${hist.length ? `<div class="w"><table><thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Arquivo</th><th>Filial</th><th>Período</th><th class="n">Linhas</th><th class="n">Ignoradas</th></tr></thead><tbody>
    ${hist.map((h) => `<tr><td>${dt(h.criado_em)}</td><td>${h.natureza === "lancamentos" ? "Lançamentos" : "Documentos"}</td><td>${esc(h.perfil_origem)}</td><td>${esc(h.arquivo)}</td>
    <td>${h.estab ?? ""}</td><td>${dt(h.periodo_ini)}${h.periodo_fim ? " a " + dt(h.periodo_fim) : ""}</td><td class="n">${num(h.linhas_lidas)}</td><td class="n">${num(h.linhas_ignoradas)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="mu">Nenhuma importação ainda.</p>'}</section>`;
  const dz = $("#dz");
  $("#arq").onchange = (e) => e.target.files[0] && ler(e.target.files[0]);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("on"); };
  dz.ondragleave = () => dz.classList.remove("on");
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove("on"); e.dataTransfer.files[0] && ler(e.dataTransfer.files[0]); };
}

async function sha256(buf) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join(""); }

async function ler(file) {
  const pv = $("#pv"); PREP = null;
  pv.innerHTML = `<p class="mu">Lendo ${esc(file.name)}…</p>`;
  try {
    const buf = await file.arrayBuffer(), hash = await sha256(buf);
    let r, tipo, e1;
    try { r = readViasoft(XLSX, buf, file.name); tipo = "lancamentos"; } catch (e) { if (!(e instanceof FormatError)) throw e; e1 = e; }
    if (!r) {
      try { r = readDocuments(XLSX, buf, new Cadastro(S.estabs), file.name); tipo = "documentos"; }
      catch (e) { if (e instanceof FormatError) throw new Error(`Arquivo não reconhecido. Relatório Viasoft: ${e1.message} | Documentos: ${e.message}`); throw e; }
    }
    if (tipo === "documentos" && !admin()) throw new Error("Só o administrador importa documentos recebidos. Este arquivo é de documentos.");
    if (tipo === "lancamentos") {
      if (r.estabs.length !== 1) throw new Error(`O relatório do Viasoft deve ter uma filial só; este tem: ${r.estabs.join(", ") || "nenhuma"}.`);
      if (!S.estabs.some((x) => x.cod === r.estabs[0])) throw new Error(`Você não tem acesso à filial ${r.estabs[0]}.`);
    }
    PREP = { tipo, r, hash, nome: file.name };
    const ign = (tipo === "lancamentos" ? r.skipped : r.skipped).slice(0, 8);
    pv.innerHTML = tipo === "lancamentos"
      ? `<table><tbody><tr><th>Tipo</th><td>Relatório de lançamentos (Viasoft)</td></tr><tr><th>Filial</th><td>${esc(estabNome(r.estabs[0]))}</td></tr>
         <tr><th>Período (entrada)</th><td>${r.periodo ? dt(r.periodo[0]) + " a " + dt(r.periodo[1]) : "—"}</td></tr><tr><th>Lançamentos</th><td>${num(r.lancamentos.length - r.direct)} (+ ${num(r.direct)} NF3E/21 direto)</td></tr>
         <tr><th>Ignoradas</th><td>${num(r.skipped.length)}</td></tr></tbody></table>`
      : `<table><tbody><tr><th>Tipo</th><td>Documentos recebidos (${esc(r.perfil)})</td></tr><tr><th>Documentos autorizados</th><td>${num(r.docs.length)}</td></tr>
         <tr><th>Cancelados/não autorizados (ignorados)</th><td>${num(r.cancelled)}</td></tr><tr><th>Fora do cadastro</th><td>${num(r.skipped.length)}</td></tr>
         <tr><th>Com tag</th><td>${num(r.docs.filter((d) => d.tags.length).length)} · sem estabelecimento definido: ${num(r.docs.filter((d) => d.estab == null).length)}</td></tr></tbody></table>`;
    if (ign.length) pv.innerHTML += `<ul class="ul">${ign.map(([n, m]) => `<li>linha ${n}: ${esc(m)}</li>`).join("")}${r.skipped.length > 8 ? `<li>… e mais ${r.skipped.length - 8}</li>` : ""}</ul>`;
    pv.innerHTML += `<div class="row" style="margin-top:12px"><button class="btn p" id="go">Importar e conciliar</button></div><div id="pg" class="mu"></div>`;
    $("#go").onclick = executar;
  } catch (err) { pv.innerHTML = `<div class="msg e">${esc(err.message)}</div>`; }
}

async function executar() {
  const { tipo, r, hash, nome } = PREP, pg = $("#pg"), go = $("#go"); go.disabled = true;
  const say = (t) => (pg.textContent = t);
  try {
    const itens = tipo === "lancamentos" ? r.lancamentos : r.docs;
    const datas = (tipo === "lancamentos" ? r.periodo : (() => { const d = r.docs.map((x) => x.emissao).sort(); return d.length ? [d[0], d[d.length - 1]] : null; })());
    const imp = await api.criarImportacao({
      natureza: tipo, perfil_origem: tipo === "lancamentos" ? "viasoft" : r.perfil, arquivo: nome, hash_arquivo: hash,
      estab: tipo === "lancamentos" ? r.estabs[0] : null, periodo_ini: datas?.[0] ?? null, periodo_fim: datas?.[1] ?? null,
      linhas_lidas: itens.length, linhas_ignoradas: r.skipped.length,
    });
    for (let i = 0; i < itens.length; i += 500) {
      say(`Enviando ${Math.min(i + 500, itens.length)} de ${itens.length}…`);
      const lote = itens.slice(i, i + 500);
      if (tipo === "lancamentos") await api.enviarLancamentos(imp, lote); else await api.enviarDocs(imp, lote);
    }
    const alvo = tipo === "lancamentos" ? r.estabs : S.estabs.map((e) => e.cod);
    const tot = { por_chave: 0, por_numero_valor: 0, manuais_confirmados: 0, nao_confirmados: 0, ambiguos: 0, provaveis: 0 };
    for (let i = 0; i < alvo.length; i++) {
      say(`Conciliando filial ${alvo[i]} (${i + 1}/${alvo.length})…`);
      const c = await api.conciliar(alvo[i]);
      for (const k of Object.keys(tot)) tot[k] += c[k] ?? 0;
    }
    S.cache = {};
    pg.innerHTML = `<div class="msg o">Importação concluída. Casados por chave: ${num(tot.por_chave)} · por número+valor: ${num(tot.por_numero_valor)} · marcações manuais confirmadas: ${num(tot.manuais_confirmados)} · não confirmadas: ${num(tot.nao_confirmados)} · ambíguos: ${num(tot.ambiguos)} · prováveis: ${num(tot.provaveis)}.</div>`;
    PREP = null;
  } catch (err) { go.disabled = false; pg.innerHTML = `<div class="msg e">${esc(err.message)}</div>`; }
}

// ---------------------------------------------------------------- Usuários
async function abaUsuarios(main) {
  const ps = await api.perfis(), gs = grupos();
  main.innerHTML = `<section><h2>Usuários</h2>
    <p class="mu">Para criar um usuário novo: Supabase → Authentication → Users → Add user (ou "Invite user"). Ele aparece aqui como <b>inativo</b>; defina o papel e os grupos e ative.</p>
    <div class="w"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Grupos</th><th>Ativo</th><th></th></tr></thead><tbody>
    ${ps.map((p) => `<tr data-u="${esc(p.user_id)}"><td><input class="f-nome" value="${esc(p.nome)}" aria-label="Nome"></td><td>${esc(p.email)}</td>
      <td><select class="f-papel" aria-label="Papel">${["consulta", "operador", "administrador"].map((x) => `<option ${p.papel === x ? "selected" : ""}>${x}</option>`).join("")}</select></td>
      <td class="gp"><label><input type="checkbox" class="f-todos" ${p.grupos == null ? "checked" : ""}> Todos</label>${gs.map((g) => `<label><input type="checkbox" class="f-grupo" value="${esc(g)}" ${p.grupos?.includes(g) ? "checked" : ""}> ${esc(g)}</label>`).join("")}</td>
      <td><input type="checkbox" class="f-ativo" ${p.ativo ? "checked" : ""} aria-label="Ativo"></td><td><button class="btn" data-save="1">Salvar</button></td></tr>`).join("")}
    </tbody></table></div><div id="um"></div></section>`;
  $("main").onclick = async (e) => {
    const b = e.target.closest("[data-save]"); if (!b) return;
    const tr = b.closest("tr"), todos = $(".f-todos", tr).checked;
    const p = { user_id: tr.dataset.u, nome: $(".f-nome", tr).value.trim(), papel: $(".f-papel", tr).value, ativo: $(".f-ativo", tr).checked,
      grupos: todos ? null : [...tr.querySelectorAll(".f-grupo:checked")].map((x) => x.value) };
    try { await api.salvarPerfil(p); msg($("#um"), "Salvo.", "o"); } catch (err) { msg($("#um"), err.message); }
  };
}

// ---------------------------------------------------------------- início
api.onAuth?.((ev) => { if (ev === "PASSWORD_RECOVERY") telaSenha(); });
if (/type=(invite|recovery)/.test(location.hash)) {
  // link de convite/recuperação: o Supabase abre a sessão a partir do link; pede para definir a senha
  setTimeout(telaSenha, 600);
} else {
  iniciar().catch((e) => { app.innerHTML = `<div class="login"><section><div class="msg e">${esc(e.message)}</div></section></div>`; });
}
