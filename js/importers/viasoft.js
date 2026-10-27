// Relatório de lançamentos do Viasoft (uma filial por arquivo). Porta de fiscal/importers/viasoft.py.
import { digits, isoDate, FormatError, readRows } from "./util.js";

const REQUIRED = ["Estab.", "Entrada", "Emissão", "Espécie", "Número Doc.", "Chave da NF-e",
  "Nome", "CNPJ", "ValorContabil", "Cancelado?", "Usuário"];
const SPECIES = { "NF-E": "NF-e", NFE: "NF-e", "CT-E": "CT-e", CTE: "CT-e", NFSE: "NFS-e", "NFS-E": "NFS-e" };
const DIRECT = new Set(["NF3E", "21"]);           // contam direto em Lançados
const KEY_LEN = { "NF-e": 44, "CT-e": 44, "NFS-e": 50 };

export function readViasoft(XLSX, buf, fileName = "") {
  const rows = readRows(XLSX, buf);
  if (!rows.length) throw new FormatError("Arquivo vazio.");
  const header = rows[0].map((c) => String(c ?? "").trim());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw new FormatError(`Colunas ausentes no relatório: ${missing.join(", ")}`);
  const ix = Object.fromEntries([...REQUIRED, "Série"].filter((c) => header.includes(c)).map((c) => [c, header.indexOf(c)]));
  const res = { file: fileName, lancamentos: [], skipped: [], estabs: [], direct: 0, periodo: null };
  const estabs = new Set();
  rows.slice(1).forEach((r, i) => {
    const n = i + 2, g = (c) => r[ix[c]];
    if (g("Estab.") == null || g("Estab.") === "") { res.skipped.push([n, "sem estabelecimento (linha de total?)"]); return; }
    const species = String(g("Espécie") ?? "").trim().toUpperCase();
    const estab = parseInt(g("Estab."), 10);
    let tipo = SPECIES[species], chave = digits(g("Chave da NF-e"));
    const base = {
      estab, numero: String(g("Número Doc.") ?? "").replace(/\.0$/, ""), serie: ix["Série"] != null ? String(g("Série") ?? "").trim() : "",
      emissao: isoDate(g("Emissão")), entrada: isoDate(g("Entrada")),
      fornecedor_nome: String(g("Nome") ?? ""), fornecedor_doc: digits(g("CNPJ")),
      valor: Number(g("ValorContabil") || 0), cancelado: String(g("Cancelado?")).toUpperCase() === "S",
      usuario_viasoft: String(g("Usuário") ?? ""),
    };
    if (DIRECT.has(species)) {
      estabs.add(estab); res.direct += base.cancelado ? 0 : 1;
      res.lancamentos.push({ ...base, chave, tipo: "Outros" });
      return;
    }
    if (!tipo) { res.skipped.push([n, `espécie fora de NF-e/CT-e/NFS-e: ${species || "vazia"}`]); return; }
    if (chave.length !== KEY_LEN[tipo] && tipo === "NFS-e") chave = "";   // NFS-e nem sempre tem chave
    if (chave !== "" && chave.length !== KEY_LEN[tipo]) { res.skipped.push([n, `chave com ${chave.length} dígitos (esperado ${KEY_LEN[tipo]})`]); return; }
    estabs.add(estab);
    res.lancamentos.push({ ...base, chave, tipo });
  });
  res.estabs = [...estabs].sort((a, b) => a - b);
  const d = res.lancamentos.filter((p) => p.tipo !== "Outros" && p.entrada).map((p) => p.entrada).sort();
  res.periodo = d.length ? [d[0], d[d.length - 1]] : null;
  return res;
}
