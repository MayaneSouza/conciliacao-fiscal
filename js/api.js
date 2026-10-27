// Acesso ao Supabase. Toda a comunicação com o servidor passa por aqui (a interface não conhece o Supabase).
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const ok = ({ data, error }) => { if (error) throw new Error(error.message || String(error)); return data; };

async function allPages(build, onProgress) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = ok(await build(from, from + 999));
    out.push(...rows);
    onProgress?.(out.length);
    if (rows.length < 1000) break;
  }
  return out;
}

const DOC_COLS = "id,chave,tipo,estab,grupo,numero,serie,emissao,fornecedor_nome,fornecedor_doc,valor,natureza,tags,destinatario_doc,destinatario_ie,situacao,origem,metodo,data_lancamento,marcado_em,recusa_motivo,recusa_observacao,recusado_em";
let uid = null;
const evento = (documento_id, acao, detalhe = null) =>
  sb.from("evento").insert({ documento_id, acao, detalhe, usuario: uid }).then(() => {}, () => {});

export const api = {
  mock: false,
  async sessao() { const { data } = await sb.auth.getSession(); uid = data.session?.user?.id ?? null; return data.session; },
  onAuth(cb) { sb.auth.onAuthStateChange((ev, s) => { uid = s?.user?.id ?? null; cb(ev, s); }); },
  async entrar(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); },
  async sair() { await sb.auth.signOut(); },
  async esqueciSenha(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
  async definirSenha(senha) { ok(await sb.auth.updateUser({ password: senha, data: { trocar_senha: false } })); },
  async trocarSenhaPendente() { const { data } = await sb.auth.getUser(); return data?.user?.user_metadata?.trocar_senha === true; },
  async perfil() { return ok(await sb.from("perfil").select("*").eq("user_id", uid).maybeSingle()); },
  async estabs() { return ok(await sb.from("estabelecimento").select("*").order("cod")); },

  docs(situacoes, onProgress, per = {}) {
    return allPages((a, b) => {
      let q = sb.from("situacao_documento").select(DOC_COLS).in("situacao", situacoes);
      if (per.ini) q = q.gte("emissao", per.ini);
      if (per.fim) q = q.lte("emissao", per.fim);
      return q.order("emissao", { ascending: false }).order("id").range(a, b);
    }, onProgress);
  },
  async confrontoDados(ini, fim) { return ok(await sb.rpc("confronto_dados", { p_ini: ini, p_fim: fim })); },
  async resumo(ini, fim) { return ok(await sb.rpc("resumo_confronto", { p_ini: ini, p_fim: fim })); },
  async diretos(ini, fim) { return ok(await sb.rpc("resumo_diretos", { p_ini: ini, p_fim: fim })); },
  divergencias() { return allPages((a, b) => sb.from("divergencia").select("*").order("emissao", { ascending: false }).order("documento_id").range(a, b)); },
  revisao() { return allPages((a, b) => sb.from("revisao_detalhe").select("*").order("id").range(a, b)); },
  pessoais() {
    return allPages((a, b) => sb.from("situacao_documento").select(DOC_COLS).eq("situacao", "pessoal").order("emissao", { ascending: false }).order("id").range(a, b));
  },
  async importacoes() { return ok(await sb.from("importacao").select("*").order("criado_em", { ascending: false }).limit(50)); },

  // ações do operador
  async marcarLancado(id) {
    ok(await sb.from("conciliacao").upsert({ documento_id: id, situacao: "lancado", origem: "Manual", metodo: "manual", marcado_por: uid, marcado_em: new Date().toISOString() }, { onConflict: "documento_id" }));
    evento(id, "marcado_lancado");
  },
  async desfazerMarca(id) {
    ok(await sb.from("conciliacao").delete().eq("documento_id", id).eq("origem", "Manual"));
    evento(id, "marca_desfeita");
  },
  async recusar(id, motivo, observacao) {
    ok(await sb.from("recusa").upsert({ documento_id: id, motivo, observacao, recusado_por: uid, recusado_em: new Date().toISOString() }, { onConflict: "documento_id" }));
    evento(id, "recusado", { motivo });
  },
  async reverterRecusa(id) { ok(await sb.from("recusa").delete().eq("documento_id", id)); evento(id, "recusa_revertida"); },
  async marcarPessoal(id, observacao = "") {
    ok(await sb.from("pessoal").upsert({ documento_id: id, observacao, marcado_por: uid, marcado_em: new Date().toISOString() }, { onConflict: "documento_id" }));
    evento(id, "marcado_pessoal");
  },
  async reverterPessoal(id) { ok(await sb.from("pessoal").delete().eq("documento_id", id)); evento(id, "pessoal_revertido"); },

  // importação
  async criarImportacao(o) {
    const { data, error } = await sb.from("importacao").insert({ ...o, criado_por: uid }).select("id").single();
    if (error) throw new Error(error.code === "23505" ? "Este arquivo já foi importado antes." : error.message);
    return data.id;
  },
  async enviarDocs(imp, docs) { return ok(await sb.rpc("importar_documentos", { p_importacao: imp, p_docs: docs })); },
  async enviarLancamentos(imp, lanc) { return ok(await sb.rpc("importar_lancamentos", { p_importacao: imp, p_lanc: lanc })); },
  async fecharImportacao(id, campos) { ok(await sb.from("importacao").update(campos).eq("id", id)); },
  async conciliar(estab) { return ok(await sb.rpc("conciliar", { p_estab: estab })); },

  // administração
  async gerirUsuarios(body) {
    const { data, error } = await sb.functions.invoke("gerir-usuarios", { body });
    if (error) {
      let m = error.message;
      try { const j = await error.context.json(); if (j?.erro) m = j.erro; } catch { /* mantém a mensagem */ }
      throw new Error(m);
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  },
  criarUsuario(d) { return this.gerirUsuarios({ acao: "criar", ...d }); },
  redefinirSenha(user_id, senha) { return this.gerirUsuarios({ acao: "senha", user_id, senha }); },
  async perfis() { return ok(await sb.from("perfil").select("*").order("nome")); },
  async salvarPerfil(p) { ok(await sb.from("perfil").update({ nome: p.nome, papel: p.papel, grupos: p.grupos, ativo: p.ativo }).eq("user_id", p.user_id)); },
};
