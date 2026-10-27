// Documentos recebidos (SEFAZ-MT, Qive/Arquivei, portal nacional da NFS-e). Porta de fiscal/importers/documents.py.
import { digits, ieNorm, norm, money, isoDate, FormatError, allSheets } from "./util.js";

export const TAG_CTE_COMPLEMENTO = "CT-e complemento";
export const TAG_CTE_SUBSTITUTO = "CT-e substituto";
export const TAG_SEM_IE = "SEM IE";

const statusIn = (...ok) => { const s = new Set(ok.map(norm)); return (v) => s.has(norm(v)); };

export const PROFILES = [
  { name: "sefaz-mt-nfe", tipo: "NF-e", keyLen: 44,
    must: ["DATA EMISSÃO", "CHAVE DE ACESSO", "SITUAÇÃO", "VALR TOTAL NOTA FISCAL"],
    cols: { emissao: "DATA EMISSÃO", serie: "SÉRIE", numero: "NUMERO NOTA FISCAL", chave: "CHAVE DE ACESSO",
      natureza: "NATUREZA DE OPERAÇÃO", situacao: "SITUAÇÃO", forn_doc: "CNPJ/CPF", forn_nome: "NOME/RAZÃO SOCIAL",
      dest_doc: "CNPJ/CPF#2", dest_ie: "INSCRIÇÃO ESTADUAL#2", valor: "VALR TOTAL NOTA FISCAL" },
    ok: (s) => norm(s) === "AUTORIZADA" },
  { name: "arquivei-nfe", tipo: "NF-e", keyLen: 44,
    must: ["CHAVE DE ACESSO", "CNPJ DESTINATÁRIO", "VALOR TOTAL DA NOTA", "NATUREZA OPERAÇÃO"],
    cols: { emissao: "Data Emissão", serie: "Série", numero: "Número", chave: "Chave de Acesso",
      natureza: "Natureza Operação", situacao: "Status", forn_doc: ["CNPJ Emitente", "CPF Emitente"],
      forn_nome: ["Nome PJ Emitente", "Nome PF Emitente"], dest_doc: ["CNPJ Destinatário", "CPF Destinatário"],
      dest_ie: "IE Destinatário", valor: "Valor Total da Nota" },
    ok: statusIn("Autorizadas", "Autorizada") },
  { name: "arquivei-cte", tipo: "CT-e", keyLen: 44,
    must: ["CHAVE DE ACESSO", "CPF/CNPJ TOMADOR", "IE TOMADOR", "TIPO DO CTE"],
    cols: { emissao: "Emissão", serie: "Série do CT-e", numero: "Número", chave: "Chave de Acesso",
      natureza: "Tipo do CTe", situacao: "Status", forn_doc: "CPF/CNPJ Emitente", forn_nome: "Emitente",
      dest_doc: "CPF/CNPJ Tomador", dest_ie: "IE Tomador", valor: "Valor" },
    ok: statusIn("Autorizada", "Autorizado") },
  { name: "sefaz-mt-cte", tipo: "CT-e", keyLen: 44,
    must: ["DATA EMISSÃO", "NO. CONHECIMENTO", "CHAVE DE ACESSO", "VALOR DA PRESTAÇÃO", "TIPO TOMADOR"],
    cols: { emissao: "Data Emissão", serie: "Série", numero: "No. Conhecimento", chave: "Chave de Acesso",
      natureza: "Natureza da Prestação", situacao: "Situação", forn_doc: "CNPJ/CPF", forn_nome: "Nome/Razão Social",
      dest_doc: "CNPJ/CPF#2", dest_ie: "Inscrição Estadual#2", valor: "Valor da Prestação" },
    ok: statusIn("AUTORIZADO") },
  { name: "nfse-portal-nacional", tipo: "NFS-e", keyLen: 0,
    must: ["NÚMERO NFS-E", "CNPJ/CPF PRESTADOR", "CNPJ/CPF TOMADOR", "VALOR DO SERVIÇO (R$)"],
    cols: { emissao: "Data Geração", serie: "DPS Série", numero: "Número NFS-e", natureza: "Descrição do Serviço",
      situacao: "Situação", forn_doc: "CNPJ/CPF Prestador", forn_nome: "Nome Prestador",
      dest_doc: "CNPJ/CPF Tomador", valor: "Valor do Serviço (R$)" },
    ok: statusIn("Normal") },
];

function locate(rows, prof) {
  for (let i = 0; i < rows.length; i++) {
    const labels = rows[i].map(norm);
    if (!prof.must.every((h) => labels.includes(h))) continue;
    const idx = {};
    for (const [field, label] of Object.entries(prof.cols)) {
      const alts = [];
      for (const one of Array.isArray(label) ? label : [label]) {
        const [lab, nth] = one.split("#");
        const hits = labels.reduce((a, x, j) => (x === norm(lab) ? [...a, j] : a), []);
        const n = parseInt(nth || "1", 10) - 1;
        if (hits.length > n) alts.push(hits[n]);
      }
      if (!alts.length) throw new FormatError(`Coluna ausente: ${label}`);
      idx[field] = alts;
    }
    return [i, idx];
  }
  throw new FormatError(`Cabeçalho do perfil ${prof.name} não encontrado: arquivo de outra origem?`);
}

const intStr = (v) => String(v ?? "").replace(/\.0+$/, "").split(".")[0];

function readWith(rows, hdr, ix, prof, cad, fileName) {
  const res = { file: fileName, perfil: prof.name, docs: [], skipped: [], cancelled: 0 };
  const seen = new Set();
  rows.slice(hdr + 1).forEach((r, k) => {
    const n = hdr + 2 + k;
    const g = (f) => { for (const j of ix[f] ?? []) if (j < r.length && r[j] != null && r[j] !== "") return r[j]; return null; };
    if (!r.some((x) => x != null && x !== "")) return;
    const chave = "chave" in ix ? digits(g("chave")) : "";
    if (!prof.ok(g("situacao"))) { res.cancelled++; return; }
    const emissao = isoDate(g("emissao"));
    const destIe = "dest_ie" in ix ? ieNorm(g("dest_ie")) : "";
    const est = cad.resolve(g("dest_doc"), g("dest_ie"));
    const grupo = est ? est.grupo : cad.grupoDe(g("dest_doc"));
    if (!emissao || grupo == null || chave.length !== prof.keyLen) {
      res.skipped.push([n, !emissao ? "data inválida" : grupo == null ? "destinatário fora do cadastro" : `chave com ${chave.length} dígitos`]);
      return;
    }
    const cod = est ? est.cod : null;
    const numero = intStr(g("numero"));
    const dkey = chave || `${cod}|${digits(g("forn_doc"))}|${numero}|${money(g("valor"))}`;
    if (seen.has(dkey)) return;     // mesmo documento em várias linhas (um CT-e por NF-e referenciada)
    seen.add(dkey);
    const tags = [];
    if (prof.tipo === "CT-e") {
      const t = norm(g("natureza"));
      if (t.startsWith("COMPLEMENT")) tags.push(TAG_CTE_COMPLEMENTO);
      else if (t.startsWith("SUBSTITU")) tags.push(TAG_CTE_SUBSTITUTO);
    }
    if ("dest_ie" in ix && !destIe) tags.push(TAG_SEM_IE);      // perfil sem coluna de IE (NFS-e): sem tag
    res.docs.push({
      chave, tipo: prof.tipo, estab: cod, grupo, numero, serie: intStr(g("serie")), emissao,
      fornecedor_nome: String(g("forn_nome") ?? "").trim(), fornecedor_doc: digits(g("forn_doc")),
      valor: money(g("valor")), natureza: String(g("natureza") ?? "").trim(), tags,
      destinatario_doc: digits(g("dest_doc")), destinatario_ie: destIe,
    });
  });
  return res;
}

/** Descobre o perfil pelo cabeçalho (varre todas as abas) e lê o arquivo. */
export function readDocuments(XLSX, buf, cad, fileName = "") {
  let err = null;
  for (const sh of allSheets(XLSX, buf)) {
    for (const prof of PROFILES) {
      try { const [h, ix] = locate(sh.rows, prof); return readWith(sh.rows, h, ix, prof, cad, fileName); }
      catch (e) { if (e instanceof FormatError) err = e; else throw e; }
    }
  }
  throw err ?? new FormatError("Nenhum perfil reconhece este arquivo.");
}
