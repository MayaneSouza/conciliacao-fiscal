// Confronto diário (layout aprovado na demonstração), calculado a partir de confronto_dados(): linhas agrupadas
// {e: estab, g: grupo, t: tipo, s: situacao, d: emissão (antes do mês = dia anterior ao início), l: data lançamento/recusa, q: qtd}.
export const SETS = {
  cf: { titulo: "Grupo Cavaco Forte", grupos: ["Cavaco Forte", "Leonardo", "Diones", "Dionas", "Reflorestar"], matriz: 100, matrizNome: "Matriz" },
  rn: { titulo: "Renova Bioenergia", grupos: ["Renova"], matriz: 700, matrizNome: "Renova Matriz" },
};
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const br = (n) => Number(n).toLocaleString("pt-BR");
const PEND = new Set(["pendente", "nao_confirmado"]);

export const diasDoMes = (mes) => { const [y, m] = mes.split("-").map(Number); return new Date(y, m, 0).getDate(); };

/** Converte datas ISO em número do dia dentro do mês (0 = antes do mês, 99 = depois). */
export function preparar(rows, mes) {
  const dia = (iso) => (iso == null ? null : iso.slice(0, 7) === mes ? Number(iso.slice(8, 10)) : iso < mes ? 0 : 99);
  return rows.map((r) => ({ ...r, dd: dia(r.d), ll: dia(r.l) }));
}
const pos = (z, t) => z.reduce((s, r) => s + (r.dd <= t && (PEND.has(r.s) || (r.s === "lancado" && (r.ll ?? r.dd) > t)) ? r.q : 0), 0);
const lan = (z, dt) => z.filter((r) => r.s === "lancado" && r.ll >= 1 && r.ll <= dt);
const soma = (z) => z.reduce((s, r) => s + r.q, 0);
const isN = (r) => r.t === "NF-e", isC = (r) => r.t === "CT-e", noS = (r) => r.t === "NF-e" || r.t === "CT-e";

export function diaPadrao(rows, mes, hojeIso) {
  const ls = rows.filter((r) => r.s === "lancado" && r.ll >= 1 && r.ll <= 31).map((r) => r.ll);
  if (ls.length) return Math.max(...ls);
  return hojeIso.slice(0, 7) === mes ? Number(hojeIso.slice(8, 10)) : diasDoMes(mes);
}

/** Todos os números da tela. `estabs` = [{cod,nome,grupo}]. */
export function calcular(rows, estabs, chave, { mes, dt, ti = "", ex = "all" }) {
  const set = SETS[chave], gs = set.grupos.filter((g) => !ti || g === ti);
  const nd = diasDoMes(mes);
  const es = estabs.filter((e) => gs.includes(e.grupo));
  const a = rows.filter((r) => gs.includes(r.g));
  const ln = lan(a, dt), dia = soma(ln.filter((r) => r.ll === dt));
  const dias = new Set(ln.map((r) => r.ll)).size, med = dias ? Math.round(soma(ln) / dias) : 0;
  const pn = pos(a.filter(isN), dt), pc = pos(a.filter(isC), dt), pAnt = pos(a.filter(noS), dt - 1), pAt = pn + pc;
  const temP = (cod, f) => pos(rows.filter((r) => r.e === cod && f(r)), dt) > 0;
  const en = es.filter((e) => temP(e.cod, isN)).length, ec = es.filter((e) => temP(e.cod, isC)).length;
  const T = { sv: 0, nf: 0, ct: 0, ou: 0, pn: 0, pc: 0, pa: 0, rc: 0 }, linhas = [];
  const alvo = [...es.map((e) => ({ cod: e.cod, nome: e.nome, grupo: e.grupo })),
    ...(rows.some((r) => r.e == null && gs.includes(r.g)) ? [{ cod: null, nome: "Sem estabelecimento definido", grupo: "" }] : [])];
  for (const e of alvo) {
    const z = rows.filter((r) => (e.cod == null ? r.e == null && gs.includes(r.g) : r.e === e.cod)), lz = lan(z, dt);
    const sv = soma(lz.filter((r) => r.t === "NFS-e")), nf = soma(lz.filter(isN)), ct = soma(lz.filter(isC)), ou = soma(lz.filter((r) => r.t === "Outros"));
    const a1 = pos(z.filter(isN), dt), a2 = pos(z.filter(isC), dt), pp = pos(z.filter(noS), dt - 1);
    const rc = soma(z.filter((r) => r.s === "recusado")), mov = z.some((r) => r.dd <= dt || (r.ll != null && r.ll <= dt));
    if ((ex === "mov" && !mov) || (ex === "pen" && a1 + a2 === 0)) continue;
    if (e.cod == null && !mov && a1 + a2 === 0) continue;
    Object.assign(T, { sv: T.sv + sv, nf: T.nf + nf, ct: T.ct + ct, ou: T.ou + ou, pn: T.pn + a1, pc: T.pc + a2, pa: T.pa + pp, rc: T.rc + rc });
    linhas.push({ ...e, sv, nf, ct, ou, a1, a2, pp, rc, sit: a1 + a2 > 0 ? ["Pendente", "pd"] : mov ? ["Em dia", "ok"] : ["SM", "sm"] });
  }
  const mz = rows.filter((r) => r.e === set.matriz && noS(r));
  const emv = Array.from({ length: nd }, (_, i) => (i + 1 <= dt ? soma(mz.filter((r) => r.dd === i + 1)) : null));
  const emd = emv.filter((x) => x != null && x > 0), emT = emd.reduce((x, y) => x + y, 0);
  return {
    set, gs, nd, dt, dia, med, dias, lnTot: soma(ln), pn, pc, pAnt, pAt, en, ec, T, linhas,
    rcm: soma(a.filter((r) => r.s === "recusado")), tl: T.sv + T.nf + T.ct + T.ou, matrizNome: set.matrizNome,
    emv, emM: emd.length ? Math.round(emT / emd.length) : 0, emT,
    serieLan: Array.from({ length: nd }, (_, i) => (i + 1 <= dt ? soma(a.filter((r) => r.s === "lancado" && r.ll === i + 1)) : null)),
    seriePend: Array.from({ length: nd }, (_, i) => (i + 1 <= dt ? pos(a.filter(noS), i + 1) : null)),
  };
}

const arr = (n, p) => (n > p ? `<b class="up">▲ ${n - p}</b>` : n < p ? `<b class="dw">▼ ${p - n}</b>` : "=");
const nc = (v, c) => `<td class="n${v ? "" : " z"}${c && v ? " " + c : ""}">${br(v)}</td>`;

function ch(v, o) {
  const N = v.length, W = 420, H = 200, L = 34, R = 8, T = 8, B = 22, iw = W - L - R, ih = H - T - B, bw = iw / N;
  const mx = Math.max(1, ...v.filter((x) => x != null)), step = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000].find((s) => mx / s <= 5) || 10000;
  const top = Math.ceil(mx / step) * step || step, X = (i) => L + bw * i + bw / 2, Y = (x) => T + ih - (x / top) * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.a)}">`;
  for (let t = 0; t <= top; t += step) s += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--ln)"/><text x="${L - 5}" y="${Y(t) + 3}" text-anchor="end">${t}</text>`;
  if (o.line) {
    s += `<polyline fill="none" stroke="#D4A017" stroke-width="2" points="${v.map((x, i) => (x == null ? "" : X(i) + "," + Y(x))).filter(Boolean).join(" ")}"/>`;
    v.forEach((x, i) => { if (x != null) s += `<circle cx="${X(i)}" cy="${Y(x)}" r="3.5" fill="#FFF200" stroke="#B8860B"/>`; });
  } else v.forEach((x, i) => { if (x != null && x > 0) s += `<rect x="${X(i) - bw * 0.34}" y="${Y(x)}" width="${bw * 0.68}" height="${T + ih - Y(x)}" rx="1" fill="${o.c}"/>`; });
  if (o.avg != null) s += `<line x1="${L}" x2="${W - R}" y1="${Y(o.avg)}" y2="${Y(o.avg)}" stroke="var(--ink)" stroke-dasharray="4 3"/>`;
  for (let i = 0; i < N; i += 2) s += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${i + 1}</text>`;
  return s + "</svg>";
}

export function html(c, { mes, ti, ex, dias }) {
  const kp = (cl, t, b, s, red) => `<div class="${cl}"><div class="kh">${t}</div><div class="kb"><b${red ? ' style="color:#C00000"' : ""}>${br(b)}</b><span>${s}</span></div></div>`;
  const [y, m] = mes.split("-");
  const dd = `${pad(c.dt)}/${m}/${y}`;
  let o = `<div class="cx"><h3>Confronto diário</h3><p class="sub">${esc(c.set.titulo)} em ${dd}: <b>${c.dia}</b> lançados no dia, <b>${br(c.lnTot)}</b> no acumulado do mês, e <b>${c.pAt}</b> notas pendentes (${arr(c.pAt, c.pAnt)} vs dia anterior).</p>`;
  o += `<div class="flt"><label class="fl"><span>MÊS</span><input type="month" id="fmes" value="${mes}"></label>
    <label class="fl"><span>DATA</span><select id="fdt">${Array.from({ length: c.nd }, (_, i) => c.nd - i).map((n) => `<option value="${n}"${n === c.dt ? " selected" : ""}>${pad(n)}/${m}/${y}</option>`).join("")}</select></label>
    <label class="fl"><span>TITULAR</span><select id="fti"><option value="">Todos</option>${c.set.grupos.map((g) => `<option${ti === g ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
    <label class="fl"><span>EXIBIR</span><select id="fex">${[["all", "Todos os estabelecimentos"], ["mov", "Só com movimento"], ["pen", "Só com pendência"]].map(([v, l]) => `<option value="${v}"${ex === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>`;
  o += `<div class="kp">${kp("g", "LANÇADOS NO DIA", c.dia, c.med ? (c.dia >= c.med ? "▲ " : "▼ ") + Math.abs(Math.round((c.dia / c.med - 1) * 100)) + "% vs média do mês" : "sem média ainda")}
    ${kp("g", "MÉDIA DIÁRIA", c.med, c.dias + " dias com lançamento")}
    ${kp("g", "LANÇADOS NO MÊS", c.lnTot, (c.lnTot + c.pAt ? Math.round((c.lnTot / (c.lnTot + c.pAt)) * 100) : 0) + "% do movimento já lançado")}
    ${kp("y", "NF-E PENDENTES", c.pn, "em " + c.en + " estabelecimentos", 1)}${kp("y", "CT-E PENDENTES", c.pc, "em " + c.ec + " estabelecimentos", 1)}
    ${kp("b", "RECUSAS NO MÊS", c.rcm, "fora das pendências")}</div>`;
  const rowsH = c.linhas.map((x) => `<tr><td>${x.cod ?? "—"}</td><td>${esc(x.nome)}${["Leonardo", "Diones", "Dionas"].includes(x.grupo) ? " · " + esc(x.grupo) : ""}</td><td class="sit ${x.sit[1]}">${x.sit[0]}</td>${nc(x.sv)}${nc(x.nf)}${nc(x.ct)}${nc(x.ou)}${nc(x.a1, "rd")}${nc(x.a2, "rd")}<td class="n">${arr(x.a1 + x.a2, x.pp)}</td>${nc(x.rc)}<td class="n"><b>${br(x.sv + x.nf + x.ct + x.ou)}</b></td></tr>`).join("");
  const T = c.T;
  const tb = `<section><h2>Situação por estabelecimento</h2><p class="mu">Lançadas = acumulado do mês. Pendentes = posição do dia (NF-e e CT-e, inclui as de meses anteriores). SM = sem movimento. NFS-e pendentes aparecem na aba Pendências.</p><div class="cxt"><table><thead><tr class="h1"><th colspan="3" class="te">ESTABELECIMENTO</th><th colspan="4" class="tl">LANÇADAS NO MÊS</th><th colspan="3" class="tp">PENDENTES</th><th colspan="2" class="tt">TOTAIS</th></tr>
    <tr class="h2"><th class="te">COD</th><th class="te">NOME</th><th class="te">SITUAÇÃO</th><th class="tl n">SERVIÇO</th><th class="tl n">NF-E</th><th class="tl n">CT-E</th><th class="tl n">NF3E/21</th><th class="tp n">NF-E</th><th class="tp n">CT-E</th><th class="tp n">VS DIA ANT.</th><th class="tt n">RECUSAS</th><th class="tt n">LANÇADOS</th></tr></thead>
    <tbody>${rowsH || '<tr><td colspan="12" class="mu">Nenhum estabelecimento neste filtro.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3">TOTAL DO GRUPO</td>${[T.sv, T.nf, T.ct, T.ou, T.pn, T.pc].map((v) => `<td class="n">${br(v)}</td>`).join("")}<td class="n">${arr(T.pn + T.pc, T.pa)}</td><td class="n">${T.rc}</td><td class="n">${br(c.tl)}</td></tr></tfoot></table></div></section>`;
  const rt = `<section><h2>Status dos pedidos das pendências NF-e</h2><p class="mu">Aguardando a integração da planilha de pedidos (SLA). Enquanto isso, as pendências NF-e estão na aba Pendências.</p></section>
    <section><h2>Notas emitidas pela ${esc(c.matrizNome)}</h2><p class="mu">NF-e + CT-e emitidas por dia corrido.</p><table class="rt t2"><thead><tr><th colspan="2">NO MÊS ATÉ A DATA</th></tr></thead><tbody>
    <tr><td>No dia</td><td class="n"><b>${c.emv[c.dt - 1] || 0}</b></td></tr><tr><td>Média por dia</td><td class="n"><b>${c.emM}</b></td></tr><tr><td>Total no mês</td><td class="n"><b>${br(c.emT)}</b></td></tr></tbody></table></section>`;
  o += `<div class="cxg"><div>${tb}</div><div>${rt}</div></div>`;
  const cd = (t, s, h) => `<section><h2>${t}</h2><p class="mu">${s}</p>${h}</section>`;
  o += `<div class="cxc">${cd("Lançamentos por dia", "Barras = lançado no dia · tracejado = média do mês", ch(c.serieLan, { c: "#6FA8DC", avg: c.med, a: "Lançamentos por dia" }))}
    ${cd("Pendentes ao fim de cada dia", "NF-e + CT-e pendentes em cada data", ch(c.seriePend, { line: 1, a: "Pendentes ao fim de cada dia" }))}
    ${cd("Notas emitidas pela " + esc(c.matrizNome) + " por dia", "Barras = emitidas no dia · tracejado = média do mês", ch(c.emv, { c: "#3B7F95", avg: c.emM, a: "Notas emitidas por dia" }))}</div>`;
  o += `<p class="mu" style="text-align:center;margin-top:18px">Contabilidade Cavaco Forte · contabilidade@cavacoforte.com.br · 65 9.9643-5074</p></div>`;
  return o;
}
