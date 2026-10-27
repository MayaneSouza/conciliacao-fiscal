// Servidor de mentira, só para testar a interface sem Supabase (abrir com ?mock). Dados FICTÍCIOS.
const papel = new URLSearchParams(location.search).get("papel") || "administrador";
const estabs = [
  { cod: 100, nome: "Matriz", grupo: "Cavaco Forte", titular: "T", documento: "30045533000150", ie: "137274831" },
  { cod: 101, nome: "Barra do Alegre", grupo: "Cavaco Forte", titular: "T", documento: "30045533000231", ie: "1" },
  { cod: 700, nome: "Renova Sorriso", grupo: "Renova", titular: "R", documento: "33810685000106", ie: "2" },
];
let n = 0;
const mk = (estab, grupo, tipo, sit, extra = {}) => ({
  id: ++n, chave: tipo === "NFS-e" ? "" : String(n).padStart(44, "5"), tipo, estab, grupo, numero: String(1000 + n), serie: "1",
  emissao: `2026-10-${String(1 + (n % 25)).padStart(2, "0")}`, fornecedor_nome: `Fornecedor ${n % 7}`, fornecedor_doc: "1111111100" + (n % 7),
  valor: 100 + n * 10.5, natureza: ["VENDA", "TRANSPORTE", "SERVICO"][n % 3], tags: [], situacao: sit, ...extra,
});
let docs = [];
for (let i = 0; i < 12; i++) docs.push(mk(100, "Cavaco Forte", ["NF-e", "CT-e", "NFS-e"][i % 3], "pendente"));
for (let i = 0; i < 6; i++) docs.push(mk(101, "Cavaco Forte", "NF-e", "lancado", { origem: i % 2 ? "Manual" : "Viasoft", metodo: "chave", data_lancamento: "2026-10-09" }));
for (let i = 0; i < 5; i++) docs.push(mk(700, "Renova", "NF-e", "pendente"));
docs.push(mk(null, "Cavaco Forte", "NF-e", "pendente", { tags: ["SEM IE"], natureza: "VENDA" }));
docs.push(mk(100, "Cavaco Forte", "CT-e", "pendente", { tags: ["CT-e complemento"] }));
docs.push(mk(100, "Cavaco Forte", "NF-e", "nao_confirmado", { origem: "Manual", marcado_em: "2026-10-06T10:00:00Z" }));
docs.push(mk(100, "Cavaco Forte", "NF-e", "recusado", { recusa_motivo: "Duplicidade", recusa_observacao: "ja lancada", recusado_em: "2026-10-07T10:00:00Z" }));
docs.push(mk(700, "Renova", "NF-e", "pessoal"));
let perfis = [
  { user_id: "u1", nome: "Mayane", email: "m@x", papel: "administrador", grupos: null, ativo: true },
  { user_id: "u2", nome: "Novo", email: "n@x", papel: "consulta", grupos: [], ativo: false },
];
let logado = !location.search.includes("deslogado");
export const api = {
  mock: true, log: (window.__log = []),
  async sessao() { return logado ? { user: { id: "u1" } } : null; },
  onAuth() {},
  async entrar(e, s) { if (s !== "ok") throw new Error("Invalid login credentials"); logado = true; },
  async sair() { logado = false; },
  async esqueciSenha() {}, async definirSenha() {},
  async perfil() { return { user_id: "u1", nome: "Teste", papel, ativo: !location.search.includes("inativo"), grupos: null }; },
  async estabs() { return estabs; },
  async docs(sits, prog, per = {}) { return docs.filter((d) => sits.includes(d.situacao) && (!per.ini || d.emissao >= per.ini) && (!per.fim || d.emissao <= per.fim)).map((d) => ({ ...d })); },
  async pessoais() { return docs.filter((d) => d.situacao === "pessoal").map((d) => ({ ...d })); },
  async resumo(ini, fim) {
    const m = {};
    for (const d of docs) if (d.emissao >= ini && d.emissao <= fim && d.situacao !== "pessoal") { const k = [d.grupo, d.estab, d.tipo, d.situacao].join("|"); m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).map(([k, q]) => { const [g, e, t, s] = k.split("|"); return { grupo: g, estab: e === "" || e === "null" ? null : Number(e), tipo: t, situacao: s, qtd: q, valor: 0 }; });
  },
  async diretos() { return [{ estab: 100, qtd: 3 }]; },
  async divergencias() { return [{ documento_id: 1, estab: 100, tipo: "NF-e", emissao: "2026-10-02", numero: "9", fornecedor_nome: "F", valor_documento: 100, valor_lancado: 130, divergencia_valor: true, divergencia_cnpj: false, metodo: "chave" }]; },
  async revisao() { return [{ id: 1, tipo: "ambigua", estab: 100, lanc_numero: "77", lanc_fornecedor: "F4", lanc_entrada: "2026-10-09", lanc_valor: 50, doc_tipo: "NFS-e", doc_numero: "77", doc_emissao: "2026-10-04", doc_valor: 50 }]; },
  async importacoes() { return []; },
  async marcarLancado(id) { api.log.push(["lancar", id]); docs.find((d) => d.id === id).situacao = "lancado"; },
  async desfazerMarca(id) { api.log.push(["desfazer", id]); docs.find((d) => d.id === id).situacao = "pendente"; },
  async recusar(id, motivo, obs) { api.log.push(["recusar", id, motivo, obs]); docs.find((d) => d.id === id).situacao = "recusado"; },
  async reverterRecusa(id) { api.log.push(["rev_rec", id]); docs.find((d) => d.id === id).situacao = "pendente"; },
  async marcarPessoal(id) { api.log.push(["pessoal", id]); docs.find((d) => d.id === id).situacao = "pessoal"; },
  async reverterPessoal(id) { api.log.push(["rev_pes", id]); docs.find((d) => d.id === id).situacao = "pendente"; },
  async perfis() { return perfis.map((p) => ({ ...p })); },
  async salvarPerfil(p) { api.log.push(["perfil", p]); },
};
