// ============================================================
//  Minha Barbearia - app para barbeiro autonomo
//  Login (Firebase Auth) + dados (Firebase Realtime Database)
// ============================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getDatabase, ref, onValue, set, push, update, remove } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

/* ---------------- utilidades ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

const money = (n) => {
  n = Number(n) || 0;
  return Number.isInteger(n)
    ? 'R$ ' + n.toLocaleString('pt-BR')
    : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};
const parseMoney = (s) => {
  s = String(s ?? '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const inputMoney = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekStart = (d) => addDays(startOfDay(d), -((startOfDay(d).getDay() + 6) % 7)); // segunda
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hhmm = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dtLocal = (ts) => { const d = new Date(ts); return `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDur = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
};

const PAGAMENTOS = ['Pix', 'Dinheiro', 'Débito', 'Crédito'];
const CATEGORIAS = ['Produtos', 'Aluguel', 'Equipamento', 'Transporte', 'Outros'];
const SERVICOS_PADRAO = [
  { nome: 'Corte', preco: 40 },
  { nome: 'Barba', preco: 30 },
  { nome: 'Corte + barba', preco: 65 },
  { nome: 'Sobrancelha', preco: 15 }
];

const ICON = {
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  play: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
  check: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  logout: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>'
};

/* ---------------- estado ---------------- */
const hojeIso = () => iso(new Date());
const state = {
  uid: null, email: '',
  servicos: {}, atendimentos: {}, despesas: {}, ativo: null,
  view: 'atender',
  sel: null, cliente: '',
  fin: { pagamento: 'Pix' },
  periodo: 'semana',
  aba: 'atendimentos',
  dia: hojeIso(),
  mes: hojeIso().slice(0, 7),
  seeded: false
};
let timerId = null;
let unsubs = [];

/* ---------------- Firebase ---------------- */
const configurado = firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith('COLE');
let auth = null, db = null;
if (configurado) {
  const fbApp = initializeApp(firebaseConfig);
  auth = getAuth(fbApp);
  db = getDatabase(fbApp);
}
const P = (path) => `users/${state.uid}/${path}`;

/* ---------------- dados derivados ---------------- */
const lista = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));
const servicosAtivos = () => lista(state.servicos).filter((s) => s.ativo !== false).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
const todosServicos = () => lista(state.servicos).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
const concluidos = () => lista(state.atendimentos).filter((a) => a.status === 'concluido').sort((a, b) => b.inicio - a.inicio);
const totalAt = (a) => (Number(a.valor) || 0) + (Number(a.gorjeta) || 0);
const somaAt = (arr) => arr.reduce((s, a) => s + totalAt(a), 0);
const noIntervalo = (a, from, to) => { const t = a.fim || a.inicio; return t >= from && t < to; };
const despesaTs = (d) => fromIso(d.data).getTime();

/* ---------------- navegação / render ---------------- */
function go(view) {
  state.view = view;
  render();
  $('#view').scrollTop = 0;
}

function render() {
  if (!state.uid) return;
  clearInterval(timerId);
  const fns = { atender: vAtender, andamento: vAndamento, finalizar: vFinalizar, dashboard: vDashboard, gestao: vGestao };
  $('#app').classList.toggle('focus', state.view === 'andamento' || state.view === 'finalizar');
  $('#view').innerHTML = (fns[state.view] || vAtender)();
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.view));
  if (state.view === 'andamento') startTimer();
}
// re-render quando chegam dados, sem atrapalhar quem esta digitando no "Finalizar"
const renderSoft = () => { if (state.view !== 'finalizar') render(); };

function startTimer() {
  const el = $('#timer');
  if (!el || !state.ativo) return;
  const tick = () => { if (state.ativo) el.textContent = fmtDur(Date.now() - state.ativo.inicio); };
  tick();
  timerId = setInterval(tick, 1000);
}

/* ---------------- tela: Atender ---------------- */
function vAtender() {
  const servs = servicosAtivos();
  if (state.sel && state.sel.id && !servs.find((s) => s.id === state.sel.id)) state.sel = null;
  if (!state.sel && servs.length) state.sel = { id: servs[0].id, nome: servs[0].nome, preco: servs[0].preco };

  const s0 = startOfDay(new Date()).getTime();
  const hoje = concluidos().filter((a) => a.inicio >= s0);
  const fat = somaAt(hoje), n = hoje.length;
  const dataTxt = cap(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace('-feira', ''));

  const chips = servs.map((s) => `
    <button class="chip ${state.sel && state.sel.id === s.id ? 'sel' : ''}" data-act="sel" data-id="${s.id}">
      <span class="n">${esc(s.nome)}</span><span class="p">${money(s.preco)}</span>
    </button>`).join('');
  const custom = state.sel && !state.sel.id ? `
    <button class="chip sel" data-act="outro">
      <span class="n">${esc(state.sel.nome)}</span><span class="p">${money(state.sel.preco)}</span>
    </button>` : '';

  return `
    <div class="top">
      <div>
        <div class="date">${dataTxt}</div>
        <h1 class="title">Pronto para atender?</h1>
      </div>
      <button class="icon-btn" data-act="sair" aria-label="Sair da conta">${ICON.logout}</button>
    </div>

    <div class="stats">
      <div class="stat"><div class="k">Hoje</div><div class="v brass">${money(fat)}</div></div>
      <div class="stat"><div class="k">Atendimentos</div><div class="v">${n}</div></div>
      <div class="stat"><div class="k">Ticket médio</div><div class="v">${money(n ? Math.round(fat / n) : 0)}</div></div>
    </div>

    <div>
      <div class="label" style="margin-bottom:10px">Qual serviço?</div>
      <div class="grid2">
        ${chips}${custom}
        <button class="chip dashed" data-act="outro">${ICON.plus} Outro serviço (valor livre)</button>
      </div>
    </div>

    <label class="field">
      <span>Cliente</span>
      <input id="cliente" type="text" placeholder="Nome (opcional)" value="${esc(state.cliente)}" data-inp="cliente" autocomplete="off">
    </label>

    <div class="spacer"></div>
    <button class="btn-primary" data-act="iniciar" ${state.sel ? '' : 'disabled'}>${ICON.play} Iniciar atendimento</button>
  `;
}

/* ---------------- tela: Em atendimento ---------------- */
function vAndamento() {
  const a = state.ativo;
  if (!a) { queueMicrotask(() => go('atender')); return ''; }
  return `
    <div class="top">
      <span class="pill"><i></i> Em atendimento</span>
      <span class="date">Iniciado às ${hhmm(a.inicio)}</span>
    </div>

    <div class="timer-wrap">
      <div class="k">Tempo de atendimento</div>
      <div class="timer" id="timer">00:00</div>
      <div class="date">min : seg</div>
    </div>

    <div class="card info">
      <div class="r"><span>Cliente</span><b>${esc(a.cliente || 'Sem nome')}</b></div>
      <div class="r"><span>Serviço</span><b>${esc(a.servicoNome)}</b></div>
      <div class="r"><span>Valor da tabela</span><b class="big">${money(a.preco)}</b></div>
    </div>

    <div class="spacer"></div>
    <div class="col">
      <button class="btn-primary" data-act="ir-finalizar">${ICON.check} Finalizar atendimento</button>
      <div class="row2">
        <button class="btn-ghost" data-act="trocar">Trocar serviço</button>
        <button class="btn-ghost btn-danger" data-act="cancelar">Cancelar</button>
      </div>
    </div>
  `;
}

/* ---------------- tela: Finalizar ---------------- */
function vFinalizar() {
  const a = state.ativo;
  if (!a) { queueMicrotask(() => go('atender')); return ''; }
  const mins = Math.max(1, Math.round((Date.now() - a.inicio) / 60000));
  const p = Number(a.preco) || 0;
  const opcoes = [p, p - 5, p + 5].filter((v, i) => v > 0 && [p, p - 5, p + 5].indexOf(v) === i);

  return `
    <div class="head">
      <button class="icon-btn" data-act="voltar-andamento" aria-label="Voltar" style="color:var(--text)">${ICON.back}</button>
      <h1>Finalizar atendimento</h1>
    </div>

    <div class="card summary">
      <div><b>${esc(a.servicoNome)}</b><small>${esc(a.cliente || 'Sem nome')}</small></div>
      <div style="text-align:right"><small>Duração</small><b>${mins} min</b></div>
    </div>

    <div>
      <label class="label" for="f-valor" style="display:block;margin-bottom:10px">Valor cobrado</label>
      <div class="valor-box"><span>R$</span><input id="f-valor" type="text" inputmode="decimal" value="${inputMoney(state.fin.valor)}" autocomplete="off"></div>
      <div class="quick">
        ${opcoes.map((v) => `<button type="button" data-act="fval" data-v="${v}" class="${v === Number(state.fin.valor) ? 'sel' : ''}">${v === p ? 'Tabela ' : ''}${money(v)}</button>`).join('')}
      </div>
    </div>

    <label class="inline-field">
      <span>Gorjeta <em>(opcional)</em></span>
      <input id="f-gorjeta" type="text" inputmode="decimal" value="${inputMoney(state.fin.gorjeta)}" aria-label="Valor da gorjeta" autocomplete="off">
    </label>

    <div>
      <div class="label" style="margin-bottom:10px">Forma de pagamento</div>
      <div class="grid2">
        ${PAGAMENTOS.map((m) => `<button class="pay ${state.fin.pagamento === m ? 'sel' : ''}" data-act="pay" data-v="${m}">${m}</button>`).join('')}
      </div>
    </div>

    <div class="spacer"></div>
    <button class="btn-primary" data-act="confirmar">${ICON.check} Confirmar e registrar</button>
  `;
}

/* ---------------- tela: Dashboard ---------------- */
function intervalo(per, now = new Date()) {
  const d0 = startOfDay(now);
  if (per === 'hoje') return { from: d0, to: addDays(d0, 1), prev: addDays(d0, -1), prevLabel: 'ontem' };
  if (per === 'semana') { const ws = weekStart(now); return { from: ws, to: addDays(ws, 7), prev: addDays(ws, -7), prevLabel: 'semana passada' }; }
  const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: m0, to: new Date(now.getFullYear(), now.getMonth() + 1, 1), prev: new Date(now.getFullYear(), now.getMonth() - 1, 1), prevLabel: 'mês passado' };
}

function buckets(per, now = new Date()) {
  const H = 3600000;
  const list = [];
  if (per === 'hoje') {
    const d0 = startOfDay(now).getTime();
    [['Manhã', 0, 12], ['Tarde', 12, 18], ['Noite', 18, 24]].forEach(([label, a, b]) => list.push({ label, from: d0 + a * H, to: d0 + b * H }));
  } else if (per === 'semana') {
    const ws = weekStart(now);
    ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].forEach((label, i) => list.push({ label, from: addDays(ws, i).getTime(), to: addDays(ws, i + 1).getTime() }));
  } else {
    const y = now.getFullYear(), m = now.getMonth(), dim = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= dim; d += 7) list.push({ label: `${d}-${Math.min(d + 6, dim)}`, from: new Date(y, m, d).getTime(), to: new Date(y, m, d + 7).getTime() });
  }
  const t = now.getTime();
  return list.map((b) => ({ ...b, atual: t >= b.from && t < b.to, futuro: b.from > t }));
}

function chartSvg(items) {
  const W = 318, base = 124, maxH = 96, n = items.length;
  const slot = W / n, bw = Math.min(30, slot * 0.62);
  const max = Math.max(1, ...items.map((i) => i.value));
  let out = '';
  items.forEach((it, i) => {
    const x = i * slot + (slot - bw) / 2, cx = x + bw / 2;
    if (it.value > 0) {
      const h = Math.max(6, (it.value / max) * maxH);
      out += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${it.atual ? '#E0A93B' : '#9A7630'}"/>`;
      out += `<text x="${cx.toFixed(1)}" y="${(base - h - 5).toFixed(1)}" font-size="12" font-weight="600" fill="#F4EFE6" text-anchor="middle">${Math.round(it.value)}</text>`;
    } else {
      out += `<rect x="${x.toFixed(1)}" y="${base - 4}" width="${bw.toFixed(1)}" height="4" rx="2" fill="#3A352A"/>`;
    }
    out += `<text x="${cx.toFixed(1)}" y="143" font-size="12" fill="#B0A896" text-anchor="middle">${esc(it.label)}</text>`;
  });
  return `<svg viewBox="0 0 318 150" role="img" aria-label="Gráfico de faturamento" font-family="Inter, sans-serif">${out}</svg>`;
}

function vDashboard() {
  const per = state.periodo, now = new Date();
  const r = intervalo(per, now);
  const f = r.from.getTime(), t = r.to.getTime();
  const atends = concluidos().filter((a) => noIntervalo(a, f, t));
  const fat = somaAt(atends), n = atends.length;

  // comparacao com o mesmo trecho do periodo anterior
  const decorrido = Math.min(now.getTime(), t) - f;
  const pf = r.prev.getTime(), pt = pf + decorrido;
  const fatPrev = somaAt(concluidos().filter((a) => noIntervalo(a, pf, pt)));
  let delta = '';
  if (fatPrev > 0) {
    const pct = Math.round(((fat - fatPrev) / fatPrev) * 100);
    delta = `<span class="delta ${pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'}">${pct > 0 ? '+' : ''}${pct}% vs ${r.prevLabel}</span>`;
  }

  const desp = lista(state.despesas).filter((d) => d.data && despesaTs(d) >= f && despesaTs(d) < t).reduce((s, d) => s + (Number(d.valor) || 0), 0);
  const lucro = fat - desp;

  const items = buckets(per, now).map((b) => ({ label: b.label, atual: b.atual, value: somaAt(atends.filter((a) => noIntervalo(a, b.from, b.to))) }));
  const tituloGraf = { hoje: 'por turno', semana: 'por dia', mes: 'por semana do mês' }[per];

  const cont = {};
  atends.forEach((a) => { cont[a.servicoNome] = (cont[a.servicoNome] || 0) + 1; });
  const top = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxC = top.length ? top[0][1] : 1;

  return `
    <h1 class="title" style="margin-top:0">Dashboard</h1>

    <div class="seg" role="group" aria-label="Período">
      ${[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês']].map(([v, l]) => `<button class="${per === v ? 'on' : ''}" data-act="per" data-v="${v}">${l}</button>`).join('')}
    </div>

    <div class="card big-card">
      <div class="k">Faturamento ${{ hoje: 'de hoje', semana: 'da semana', mes: 'do mês' }[per]}</div>
      <div class="line"><span class="v">${money(fat)}</span>${delta}</div>
    </div>

    <div class="stats two">
      <div class="stat"><div class="k">Atendimentos</div><div class="v">${n}</div></div>
      <div class="stat"><div class="k">Ticket médio</div><div class="v">${money(n ? Math.round(fat / n) : 0)}</div></div>
      <div class="stat"><div class="k">Despesas</div><div class="v">${money(desp)}</div></div>
      <div class="stat"><div class="k">Lucro</div><div class="v" style="color:${lucro < 0 ? 'var(--red)' : 'var(--green)'}">${money(lucro)}</div></div>
    </div>

    <div class="card chart">
      <div class="label">Faturamento ${tituloGraf} (R$)</div>
      ${chartSvg(items)}
    </div>

    <div class="card">
      <div class="label">Serviços mais feitos</div>
      ${top.length ? top.map(([nome, c]) => `
        <div class="bar-row"><span class="n">${esc(nome)}</span><div class="t"><i style="width:${Math.round((c / maxC) * 100)}%"></i></div><span class="c">${c}</span></div>`).join('')
        : '<div class="empty">Nenhum atendimento neste período.</div>'}
    </div>
  `;
}

/* ---------------- tela: Gestao ---------------- */
function vGestao() {
  const abas = [['atendimentos', 'Atendimentos'], ['servicos', 'Serviços'], ['despesas', 'Despesas']];
  const seg = `<div class="seg" role="group" aria-label="Seção">${abas.map(([v, l]) => `<button class="${state.aba === v ? 'on' : ''}" data-act="aba" data-v="${v}">${l}</button>`).join('')}</div>`;
  const corpo = { atendimentos: gAtendimentos, servicos: gServicos, despesas: gDespesas }[state.aba]();
  return `<h1 class="title" style="margin-top:0">Gestão</h1>${seg}${corpo}`;
}

function gAtendimentos() {
  const d0 = fromIso(state.dia), f = d0.getTime(), t = addDays(d0, 1).getTime();
  const arr = concluidos().filter((a) => noIntervalo(a, f, t));
  const total = somaAt(arr);
  const por = (fn) => somaAt(arr.filter(fn));
  const ehHoje = state.dia === hojeIso();
  const titulo = (ehHoje ? 'Hoje, ' : cap(d0.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')) + ', ') + d0.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });

  return `
    <div class="day-head">
      <span class="label">${titulo}</span>
      <input type="date" value="${state.dia}" data-chg="dia" aria-label="Escolher o dia">
    </div>
    <div class="date" style="margin-top:-8px">${arr.length} ${arr.length === 1 ? 'atendimento' : 'atendimentos'}</div>

    ${arr.length ? `<div class="list">${arr.map((a) => `
      <div class="item">
        <span class="t">${hhmm(a.inicio)}</span>
        <div class="m"><b>${esc(a.cliente || 'Sem nome')}</b><small>${esc(a.servicoNome)} · ${esc(a.pagamento)}${a.gorjeta ? ' · gorjeta ' + money(a.gorjeta) : ''}</small></div>
        <span class="val">${money(totalAt(a))}</span>
        <button class="icon-btn" data-act="del-at" data-id="${a.id}" aria-label="Excluir atendimento">${ICON.trash}</button>
      </div>`).join('')}</div>`
      : '<div class="card empty">Nenhum atendimento neste dia.</div>'}

    <div class="total"><span>Total do dia</span><b>${money(total)}</b></div>

    <div class="stats">
      <div class="stat"><div class="k">Pix</div><div class="v">${money(por((a) => a.pagamento === 'Pix'))}</div></div>
      <div class="stat"><div class="k">Dinheiro</div><div class="v">${money(por((a) => a.pagamento === 'Dinheiro'))}</div></div>
      <div class="stat"><div class="k">Cartão</div><div class="v">${money(por((a) => a.pagamento === 'Débito' || a.pagamento === 'Crédito'))}</div></div>
    </div>

    <div class="spacer"></div>
    <button class="btn-ghost" data-act="manual">${ICON.plus} Lançar atendimento manual</button>
  `;
}

function gServicos() {
  const arr = todosServicos();
  return `
    ${arr.length ? `<div class="list">${arr.map((s) => `
      <div class="item ${s.ativo === false ? 'off' : ''}">
        <div class="m"><b>${esc(s.nome)}</b><small>${s.ativo === false ? 'Desativado' : 'Ativo'}</small></div>
        <span class="val">${money(s.preco)}</span>
        <button class="mini" data-act="edit-serv" data-id="${s.id}">Editar</button>
      </div>`).join('')}</div>` : '<div class="card empty">Nenhum serviço cadastrado.</div>'}
    <div class="spacer"></div>
    <button class="btn-ghost" data-act="novo-serv">${ICON.plus} Novo serviço</button>
  `;
}

function gDespesas() {
  const [y, m] = state.mes.split('-').map(Number);
  const f = new Date(y, m - 1, 1).getTime(), t = new Date(y, m, 1).getTime();
  const arr = lista(state.despesas).filter((d) => d.data && despesaTs(d) >= f && despesaTs(d) < t).sort((a, b) => despesaTs(b) - despesaTs(a));
  const total = arr.reduce((s, d) => s + (Number(d.valor) || 0), 0);
  return `
    <div class="day-head">
      <span class="label">${cap(new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</span>
      <input type="month" value="${state.mes}" data-chg="mes" aria-label="Escolher o mês">
    </div>
    ${arr.length ? `<div class="list">${arr.map((d) => `
      <div class="item">
        <span class="t">${pad(fromIso(d.data).getDate())}/${pad(fromIso(d.data).getMonth() + 1)}</span>
        <div class="m"><b>${esc(d.descricao)}</b><small>${esc(d.categoria || 'Outros')}</small></div>
        <span class="val">${money(d.valor)}</span>
        <button class="icon-btn" data-act="del-desp" data-id="${d.id}" aria-label="Excluir despesa">${ICON.trash}</button>
      </div>`).join('')}</div>` : '<div class="card empty">Nenhuma despesa neste mês.</div>'}
    <div class="total"><span>Total do mês</span><b>${money(total)}</b></div>
    <div class="spacer"></div>
    <button class="btn-ghost" data-act="nova-desp">${ICON.plus} Lançar despesa</button>
  `;
}

/* ---------------- folha (formularios) ---------------- */
function fieldHtml(f) {
  const val = f.value ?? '';
  let input;
  if (f.type === 'select') {
    input = `<select name="${f.name}">${f.options.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(val) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
  } else if (f.type === 'money') {
    input = `<input name="${f.name}" type="text" inputmode="decimal" value="${esc(val)}" placeholder="0,00" autocomplete="off">`;
  } else {
    input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} autocomplete="off">`;
  }
  return `<label class="field"><span>${esc(f.label)}</span>${input}</label>`;
}

function openSheet({ title, fields, submit = 'Salvar', extra = '', onSubmit }) {
  const f = $('#sheet-form');
  f.innerHTML = `<h2>${esc(title)}</h2>${fields.map(fieldHtml).join('')}${extra}
    <div class="sheet-actions">
      <button type="button" class="btn-ghost" data-act="fechar-sheet">Cancelar</button>
      <button type="submit" class="btn-primary sm">${esc(submit)}</button>
    </div>`;
  f.onsubmit = (e) => {
    e.preventDefault();
    const vals = Object.fromEntries(new FormData(f).entries());
    if (onSubmit(vals) !== false) closeSheet();
  };
  $('#sheet').hidden = false;
  const first = f.querySelector('input,select');
  if (first && first.type !== 'date' && first.type !== 'datetime-local') setTimeout(() => first.focus(), 50);
  return f;
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-form').innerHTML = ''; }

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}
const falhou = () => toast('Não foi possível salvar. Confira a conexão e as regras do banco.');

/* ---------------- acoes ---------------- */
const acoes = {
  nav: (d) => go(d.v === 'atender' && state.ativo ? 'andamento' : d.v),
  sair: () => { if (confirm('Sair da conta?')) signOut(auth); },

  // --- atender
  sel: (d) => {
    const s = state.servicos[d.id];
    if (s) { state.sel = { id: d.id, nome: s.nome, preco: s.preco }; renderSoft(); }
  },
  outro: () => openSheet({
    title: 'Outro serviço',
    fields: [
      { name: 'nome', label: 'Nome do serviço', placeholder: 'Ex.: Pigmentação', value: state.sel && !state.sel.id ? state.sel.nome : '' },
      { name: 'preco', label: 'Valor', type: 'money', value: state.sel && !state.sel.id ? inputMoney(state.sel.preco) : '' }
    ],
    submit: 'Usar',
    onSubmit: (v) => {
      const nome = v.nome.trim(), preco = parseMoney(v.preco);
      if (!nome || !(preco > 0)) { toast('Informe o nome e o valor'); return false; }
      state.sel = { id: null, nome, preco };
      renderSoft();
    }
  }),
  iniciar: () => {
    const s = state.sel;
    if (!s) return;
    const cliente = ($('#cliente')?.value || state.cliente || '').trim();
    const ativo = { servicoId: s.id || null, servicoNome: s.nome, preco: s.preco, cliente, inicio: Date.now() };
    state.ativo = ativo; state.cliente = '';
    set(ref(db, P('ativo')), ativo).catch(falhou);
    go('andamento');
  },

  // --- em atendimento
  'ir-finalizar': () => {
    state.fin = { valor: state.ativo.preco, gorjeta: 0, pagamento: 'Pix' };
    go('finalizar');
  },
  trocar: () => {
    const servs = servicosAtivos();
    if (!servs.length) { toast('Cadastre um serviço na Gestão'); return; }
    openSheet({
      title: 'Trocar serviço',
      fields: [{ name: 'id', label: 'Serviço', type: 'select', value: state.ativo.servicoId, options: servs.map((s) => ({ v: s.id, t: `${s.nome} (${money(s.preco)})` })) }],
      submit: 'Trocar',
      onSubmit: (v) => {
        const s = state.servicos[v.id];
        if (!s) return false;
        const novo = { servicoId: v.id, servicoNome: s.nome, preco: s.preco };
        state.ativo = { ...state.ativo, ...novo };
        update(ref(db, P('ativo')), novo).catch(falhou);
        render();
      }
    });
  },
  cancelar: () => {
    if (!confirm('Cancelar este atendimento? Ele não será registrado.')) return;
    state.ativo = null;
    remove(ref(db, P('ativo'))).catch(falhou);
    go('atender');
  },

  // --- finalizar
  'voltar-andamento': () => go('andamento'),
  fval: (d, el) => {
    $('#f-valor').value = inputMoney(Number(d.v));
    $$('.quick button').forEach((b) => b.classList.toggle('sel', b === el));
  },
  pay: (d, el) => {
    state.fin.pagamento = d.v;
    $$('.pay').forEach((b) => b.classList.toggle('sel', b === el));
  },
  confirmar: () => {
    const a = state.ativo;
    if (!a) return;
    const valor = parseMoney($('#f-valor').value);
    if (!(valor > 0)) { toast('Informe o valor cobrado'); return; }
    const rec = {
      servicoId: a.servicoId || null, servicoNome: a.servicoNome, cliente: a.cliente || '',
      inicio: a.inicio, fim: Date.now(), valor, gorjeta: parseMoney($('#f-gorjeta').value),
      pagamento: state.fin.pagamento, status: 'concluido'
    };
    push(ref(db, P('atendimentos')), rec).catch(falhou);
    state.ativo = null;
    remove(ref(db, P('ativo'))).catch(falhou);
    state.dia = hojeIso(); state.aba = 'atendimentos';
    go('gestao');
    toast('Atendimento registrado');
  },

  // --- dashboard
  per: (d) => { state.periodo = d.v; render(); },

  // --- gestao
  aba: (d) => { state.aba = d.v; render(); },
  'del-at': (d) => { if (confirm('Excluir este atendimento?')) remove(ref(db, P(`atendimentos/${d.id}`))).catch(falhou); },
  manual: () => {
    const servs = servicosAtivos();
    if (!servs.length) { toast('Cadastre um serviço primeiro'); return; }
    const f = openSheet({
      title: 'Lançar atendimento',
      fields: [
        { name: 'servico', label: 'Serviço', type: 'select', value: servs[0].id, options: servs.map((s) => ({ v: s.id, t: s.nome })) },
        { name: 'valor', label: 'Valor', type: 'money', value: inputMoney(servs[0].preco) },
        { name: 'gorjeta', label: 'Gorjeta (opcional)', type: 'money', value: '' },
        { name: 'cliente', label: 'Cliente (opcional)', placeholder: 'Nome' },
        { name: 'quando', label: 'Data e hora', type: 'datetime-local', value: dtLocal(state.dia === hojeIso() ? Date.now() : fromIso(state.dia).getTime() + 12 * 3600000) },
        { name: 'pagamento', label: 'Pagamento', type: 'select', value: 'Pix', options: PAGAMENTOS.map((p) => ({ v: p, t: p })) }
      ],
      submit: 'Registrar',
      onSubmit: (v) => {
        const s = state.servicos[v.servico], valor = parseMoney(v.valor), ts = new Date(v.quando).getTime();
        if (!s || !(valor > 0) || !Number.isFinite(ts)) { toast('Confira serviço, valor e data'); return false; }
        push(ref(db, P('atendimentos')), {
          servicoId: v.servico, servicoNome: s.nome, cliente: v.cliente.trim(), inicio: ts, fim: ts,
          valor, gorjeta: parseMoney(v.gorjeta), pagamento: v.pagamento, status: 'concluido'
        }).catch(falhou);
        state.dia = iso(new Date(ts));
        toast('Atendimento lançado');
      }
    });
    f.querySelector('[name=servico]').onchange = (e) => {
      const s = state.servicos[e.target.value];
      if (s) f.querySelector('[name=valor]').value = inputMoney(s.preco);
    };
  },
  'novo-serv': () => openSheet({
    title: 'Novo serviço',
    fields: [{ name: 'nome', label: 'Nome', placeholder: 'Ex.: Degradê' }, { name: 'preco', label: 'Preço', type: 'money' }],
    onSubmit: (v) => {
      const nome = v.nome.trim(), preco = parseMoney(v.preco);
      if (!nome || !(preco > 0)) { toast('Informe o nome e o preço'); return false; }
      push(ref(db, P('servicos')), { nome, preco, ativo: true, ordem: Date.now() }).catch(falhou);
    }
  }),
  'edit-serv': (d) => {
    const s = state.servicos[d.id];
    if (!s) return;
    const off = s.ativo === false;
    const f = openSheet({
      title: 'Editar serviço',
      fields: [{ name: 'nome', label: 'Nome', value: s.nome }, { name: 'preco', label: 'Preço', type: 'money', value: inputMoney(s.preco) }],
      extra: `<button type="button" class="btn-ghost ${off ? '' : 'btn-danger'}" data-act="toggle-serv" data-id="${d.id}">${off ? 'Reativar serviço' : 'Desativar serviço'}</button>`,
      onSubmit: (v) => {
        const nome = v.nome.trim(), preco = parseMoney(v.preco);
        if (!nome || !(preco > 0)) { toast('Informe o nome e o preço'); return false; }
        update(ref(db, P(`servicos/${d.id}`)), { nome, preco }).catch(falhou);
      }
    });
    return f;
  },
  'toggle-serv': (d) => {
    const s = state.servicos[d.id];
    if (!s) return;
    update(ref(db, P(`servicos/${d.id}`)), { ativo: s.ativo === false }).catch(falhou);
    closeSheet();
  },
  'nova-desp': () => openSheet({
    title: 'Lançar despesa',
    fields: [
      { name: 'descricao', label: 'Descrição', placeholder: 'Ex.: Lâminas e navalhas' },
      { name: 'valor', label: 'Valor', type: 'money' },
      { name: 'categoria', label: 'Categoria', type: 'select', value: 'Produtos', options: CATEGORIAS.map((c) => ({ v: c, t: c })) },
      { name: 'data', label: 'Data', type: 'date', value: hojeIso() }
    ],
    onSubmit: (v) => {
      const valor = parseMoney(v.valor);
      if (!v.descricao.trim() || !(valor > 0) || !v.data) { toast('Informe descrição, valor e data'); return false; }
      push(ref(db, P('despesas')), { descricao: v.descricao.trim(), valor, categoria: v.categoria, data: v.data }).catch(falhou);
      state.mes = v.data.slice(0, 7);
    }
  }),
  'del-desp': (d) => { if (confirm('Excluir esta despesa?')) remove(ref(db, P(`despesas/${d.id}`))).catch(falhou); },
  'fechar-sheet': () => closeSheet()
};

document.addEventListener('click', (e) => {
  if (e.target === $('#sheet')) { closeSheet(); return; }
  const el = e.target.closest('[data-act]');
  if (el && acoes[el.dataset.act]) acoes[el.dataset.act](el.dataset, el);
});
document.addEventListener('input', (e) => {
  if (e.target.dataset.inp === 'cliente') state.cliente = e.target.value;
});
document.addEventListener('change', (e) => {
  const k = e.target.dataset.chg;
  if (k === 'dia' && e.target.value) { state.dia = e.target.value; render(); }
  if (k === 'mes' && e.target.value) { state.mes = e.target.value; render(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

/* ---------------- dados em tempo real ---------------- */
function conectar() {
  desconectar();
  const ouvir = (caminho, fn) => unsubs.push(onValue(ref(db, P(caminho)), fn, () => toast('Sem permissão para ler os dados. Veja as regras do banco.')));

  ouvir('servicos', (snap) => {
    const v = snap.val();
    if (!v && !state.seeded) {
      state.seeded = true;
      SERVICOS_PADRAO.forEach((s, i) => push(ref(db, P('servicos')), { ...s, ativo: true, ordem: i }));
      return;
    }
    state.servicos = v || {};
    renderSoft();
  });
  ouvir('atendimentos', (snap) => { state.atendimentos = snap.val() || {}; renderSoft(); });
  ouvir('despesas', (snap) => { state.despesas = snap.val() || {}; renderSoft(); });
  ouvir('ativo', (snap) => {
    const antes = state.ativo;
    state.ativo = snap.val();
    if (state.ativo && !antes && state.view === 'atender') state.view = 'andamento';
    if (!state.ativo && (state.view === 'andamento' || state.view === 'finalizar')) state.view = 'atender';
    renderSoft();
  });
}
function desconectar() {
  unsubs.forEach((u) => { try { u(); } catch (_) { /* ignora */ } });
  unsubs = [];
}

/* ---------------- login ---------------- */
const loginEl = $('#login'), appEl = $('#app');
let modoCriar = false;

function mostrarLogin() {
  appEl.hidden = true; loginEl.hidden = false;
  clearInterval(timerId);
}
function mostrarApp() {
  loginEl.hidden = true; appEl.hidden = false;
}
function erroLogin(msg) {
  const el = $('#login-erro');
  el.textContent = msg || ''; el.hidden = !msg;
}
function traduzErro(err) {
  const c = err && err.code;
  const mapa = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/missing-password': 'Digite a senha.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Já existe uma conta com esse e-mail.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/operation-not-allowed': 'Ative o login por e-mail/senha no Firebase (Authentication).'
  };
  return mapa[c] || 'Não foi possível entrar. Tente novamente.';
}
function aplicarModo() {
  $('#login-btn').textContent = modoCriar ? 'Criar conta' : 'Entrar';
  $('#login-toggle').textContent = modoCriar ? 'Já tenho conta' : 'Criar conta';
  $('#login-sub').textContent = modoCriar ? 'Crie sua conta para começar.' : 'Entre para registrar seus atendimentos.';
  $('#login-conf-wrap').hidden = !modoCriar;
  $('#login-senha').autocomplete = modoCriar ? 'new-password' : 'current-password';
  erroLogin('');
}

$('#login-toggle').addEventListener('click', () => { modoCriar = !modoCriar; aplicarModo(); });

$('#login-reset').addEventListener('click', async () => {
  if (!configurado) return;
  const email = $('#login-email').value.trim();
  if (!email) { erroLogin('Digite seu e-mail para receber o link de redefinição.'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    erroLogin('');
    toast('Enviamos um link de redefinição para o seu e-mail');
  } catch (err) { erroLogin(traduzErro(err)); }
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!configurado) return;
  const email = $('#login-email').value.trim(), senha = $('#login-senha').value;
  if (!email || !senha) { erroLogin('Preencha e-mail e senha.'); return; }
  if (modoCriar && senha !== $('#login-conf').value) { erroLogin('As senhas não são iguais.'); return; }
  const btn = $('#login-btn');
  btn.disabled = true; erroLogin('');
  try {
    if (modoCriar) await createUserWithEmailAndPassword(auth, email, senha);
    else await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    erroLogin(traduzErro(err));
  } finally {
    btn.disabled = false;
  }
});

if (!configurado) {
  mostrarLogin();
  $('#login-aviso').hidden = false;
  $('#login-btn').disabled = true;
} else {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.uid = user.uid; state.email = user.email || '';
      state.seeded = false; state.view = 'atender'; state.sel = null;
      mostrarApp();
      conectar();
      render();
    } else {
      desconectar();
      Object.assign(state, { uid: null, servicos: {}, atendimentos: {}, despesas: {}, ativo: null });
      $('#login-senha').value = ''; $('#login-conf').value = '';
      mostrarLogin();
    }
  });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* --------------- Instalação PWA (Banner Personalizado) --------------- */
const installBanner = $('#install-banner');
const btnInstalar = $('#btn-instalar');
const installText = $('#install-text');
let promptInstalacao = null;

// Verifica se o app já está instalado (rodando de forma autônoma)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

if (!isStandalone && installBanner) {
  // Detecta se é um dispositivo iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  if (isIOS) {
    // No iOS não existe botão nativo. Ensinamos o caminho manual.
    installBanner.style.display = 'block';
    btnInstalar.style.display = 'none'; // Esconde o botão
    installText.innerHTML = `
      Para instalar no iPhone:<br><br>
      1. Toque em <b>Compartilhar</b> (quadrado com a seta no rodapé)<br>
      2. Role para baixo e toque em <b>Adicionar à Tela de Início</b>
    `;
  } else {
    // No Android / Chrome, o navegador dispara um evento quando o PWA está pronto
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // Impede o banner padrão do navegador
      promptInstalacao = e;
      installBanner.style.display = 'block'; // Mostra nosso banner customizado
    });

    btnInstalar.addEventListener('click', async () => {
      if (!promptInstalacao) return;
      promptInstalacao.prompt(); // Mostra a janela nativa do Android
      
      const { outcome } = await promptInstalacao.userChoice;
      if (outcome === 'accepted') {
        installBanner.style.display = 'none'; // Esconde após instalar
      }
      promptInstalacao = null;
    });
  }
}