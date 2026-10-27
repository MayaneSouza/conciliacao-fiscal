import { digits, ieNorm } from "./util.js";

/** Cadastro de estabelecimentos [{cod,nome,grupo,titular,documento,ie}] (vem da tabela estabelecimento). */
export class Cadastro {
  constructor(estabs) {
    this.estabs = estabs.map((e) => ({ ...e, documento: digits(e.documento), ie: ieNorm(e.ie) }));
    this.byDoc = new Map();
    for (const e of this.estabs) {
      if (!this.byDoc.has(e.documento)) this.byDoc.set(e.documento, []);
      this.byDoc.get(e.documento).push(e);
    }
  }
  resolve(documento, ie) {
    const c = this.byDoc.get(digits(documento)) ?? [];
    if (c.length === 1) return c[0];
    const n = ieNorm(ie);
    return c.find((e) => e.ie === n) ?? null;
  }
  /** Grupo do titular quando o CNPJ/CPF é do cadastro mas o estabelecimento não é identificável. */
  grupoDe(documento) {
    const g = new Set((this.byDoc.get(digits(documento)) ?? []).map((e) => e.grupo));
    return g.size === 1 ? [...g][0] : null;
  }
}

/** Lê config/estabelecimentos.csv (cod;nome;grupo;titular;documento;ie) — usado nos testes. */
export function parseCadastroCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(";");
  return lines.map((l) => {
    const v = l.split(";");
    const o = Object.fromEntries(cols.map((c, i) => [c, v[i]]));
    return { ...o, cod: parseInt(o.cod, 10) };
  });
}
