// Compara os importadores JS com os resultados do Python (mesmos arquivos reais).
// Uso: node tests/importers.test.mjs <pasta com dump/*.json> <estabelecimentos.csv>
// Os dumps são as linhas das planilhas em JSON; aqui a SheetJS é substituída por um leitor falso
// (a leitura real da planilha pela SheetJS só pode ser testada no navegador).
import fs from "node:fs";
import { readDocuments } from "../js/importers/documents.js";
import { readViasoft } from "../js/importers/viasoft.js";
import { Cadastro, parseCadastroCsv } from "../js/importers/cadastro.js";

const [dir, csv] = process.argv.slice(2);
const exp = JSON.parse(fs.readFileSync(`${dir}/expected.json`));
const cad = new Cadastro(parseCadastroCsv(fs.readFileSync(csv, "utf8")));
const fakeXLSX = (sheets) => ({
  read: () => ({ SheetNames: sheets.map((s) => s.name), Sheets: Object.fromEntries(sheets.map((s) => [s.name, s.rows])) }),
  utils: { sheet_to_json: (rows) => rows },
});
let fails = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fails++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `JS=${JSON.stringify(a)} PY=${JSON.stringify(b)}`); };

for (const k of Object.keys(exp)) {
  const sheets = JSON.parse(fs.readFileSync(`${dir}/${k}.json`));
  const X = fakeXLSX(sheets);
  if (k === "viasoft") {
    const r = readViasoft(X, null, k);
    eq(`${k} lançamentos (sem diretos)`, r.lancamentos.filter((p) => p.tipo !== "Outros").length, exp[k].post);
    eq(`${k} diretos`, r.direct, exp[k].direct);
    eq(`${k} ignoradas`, r.skipped.length, exp[k].skipped);
    eq(`${k} estabs`, r.estabs, exp[k].estabs);
    eq(`${k} período`, r.periodo, exp[k].period);
  } else {
    const r = readDocuments(X, null, cad, k);
    const tags = {}; r.docs.forEach((d) => d.tags.forEach((t) => (tags[t] = (tags[t] ?? 0) + 1)));
    eq(`${k} perfil`, r.perfil, exp[k].profile);
    eq(`${k} documentos`, r.docs.length, exp[k].docs);
    eq(`${k} ignorados`, r.skipped.length, exp[k].skipped);
    eq(`${k} cancelados`, r.cancelled, exp[k].cancelled);
    eq(`${k} tags`, tags, exp[k].tags);
    eq(`${k} sem estab.`, r.docs.filter((d) => d.estab == null).length, exp[k].sem_estab);
    eq(`${k} valor total`, Math.round(r.docs.reduce((s, d) => s + d.valor, 0) * 100) / 100, exp[k].value);
  }
}
console.log(fails ? `${fails} falha(s)` : "tudo igual ao Python");
process.exit(fails ? 1 : 0);
