// ════════════════════════════════════════════════════════════════
//  BANCO BLANCO — app.js
//  Toda la lógica de la aplicación: estado, renders, operaciones.
// ════════════════════════════════════════════════════════════════

// ─── FECHA BASE ──────────────────────────────────────────────────
// Cambiá esta fecha para simular distintos momentos en el tiempo.
const TODAY = new Date();

// ─── CONFIGURACIÓN INICIAL ───────────────────────────────────────
let config = {
  tasaPF:    10,    // Tasa Nominal Anual para Plazos Fijos (%)
  tasaPR:    15,    // Tasa Nominal Anual para Préstamos (%)
  tasaMora:   5,    // Tasa de mora mensual sobre saldo pendiente (%)
  tcCompra: 1370,   // Tipo de cambio comprador (banco compra USD / usuario vende)
  tcVenta:  1400,   // Tipo de cambio vendedor (banco vende USD / usuario compra)
};

// ─── BASE DE DATOS EN MEMORIA ─────────────────────────────────────
// En una implementación real esto vendría de un backend/base de datos.
let db = {
  users: [
    {
      username: 'juan',
      password: '1234',
      name: 'Juan Pérez',
      balance: 15000,
      accountNum: '0001-4823',
      balanceUSD: 0,
      accountNumUSD: null,
      transactions: [{ id: 1, type: 'credit', desc: 'Depósito inicial', amount: 15000, date: fmtDate(TODAY) }],
      txUSD: [],
      prestamos: [],
      plazos: [],
    },
    {
      username: 'maria',
      password: '1234',
      name: 'María García',
      balance: 28500,
      accountNum: '0001-7291',
      balanceUSD: 0,
      accountNumUSD: null,
      transactions: [{ id: 1, type: 'credit', desc: 'Depósito inicial', amount: 28500, date: fmtDate(TODAY) }],
      txUSD: [],
      prestamos: [],
      plazos: [],
    },
  ],
  allTransactions: [],
  txCounter: 100,
  adminBalance: 0,
};

const ADMIN = { username: 'admin', password: 'admin123', name: 'Administrador', isAdmin: true };
let currentUser = null;
let pendingDeleteUsername = null;

// ─── HELPERS ─────────────────────────────────────────────────────
function getUser(u) { return db.users.find(x => x.username === u.toLowerCase()); }

function fmtARS(n) {
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtUSD(n) {
  return 'USD ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtTC(n) {
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) { return d.toLocaleDateString('es-AR'); }

function addMonths(date, m) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + m);
  return d;
}
function dateFromStr(s) {
  const [d, m, y] = s.split('/');
  return new Date(+y, +m - 1, +d);
}

// Sistema francés: cuota fija dada capital C, tasa mensual i, n cuotas
function cuotaFrancesa(C, i, n) {
  if (i === 0) return C / n;
  return C * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1);
}

function showNotif(msg, type = 'success') {
  const n = document.getElementById('notif');
  n.textContent = msg;
  n.className = 'notification show ' + type;
  setTimeout(() => n.className = 'notification', 3800);
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}
function openModal(id) {
  document.querySelectorAll('.error-msg').forEach(e => e.classList.remove('show'));
  document.getElementById('modal-' + id).classList.add('open');
}
function closeModal(id) {
  document.getElementById('modal-' + id).classList.remove('open');
}

// ─── TIPO DE CAMBIO — labels ──────────────────────────────────────
function updateFXLabels() {
  ['fx-compra-strip', 'fx-compra-div'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtTC(config.tcCompra);
  });
  ['fx-venta-strip', 'fx-venta-div'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtTC(config.tcVenta);
  });
  const cl = document.getElementById('compra-tc-label');
  if (cl) cl.textContent = 'TC Vendedor (banco vende): ' + fmtTC(config.tcVenta) + ' por USD.';
  const vl = document.getElementById('venta-tc-label');
  if (vl) vl.textContent = 'TC Comprador (banco compra): ' + fmtTC(config.tcCompra) + ' por USD.';
  const ds = document.getElementById('today-date-strip');
  if (ds) ds.textContent = fmtDate(TODAY);
}

// Sincroniza TODOS los campos de saldo USD visibles de golpe
function syncUSDDisplay() {
  if (!currentUser) return;
  const hasUSD = !!currentUser.accountNumUSD;
  document.getElementById('dash-balance-usd').textContent = hasUSD ? fmtUSD(currentUser.balanceUSD) : '—';
  document.getElementById('usd-account-label').textContent = hasUSD
    ? 'Caja de ahorro USD · Nº ' + currentUser.accountNumUSD
    : 'Sin cuenta USD';
  if (document.getElementById('usd-balance-main'))
    document.getElementById('usd-balance-main').textContent = hasUSD ? fmtUSD(currentUser.balanceUSD) : 'USD 0,00';
  if (document.getElementById('usd-accnum-main'))
    document.getElementById('usd-accnum-main').textContent = hasUSD
      ? 'Caja de ahorro USD · Nº ' + currentUser.accountNumUSD : '';
  document.getElementById('usd-actions-home').style.display = hasUSD ? '' : 'none';
  document.getElementById('usd-closed-home').style.display = hasUSD ? 'none' : '';
}

// ─── VENCIMIENTOS AUTOMÁTICOS ─────────────────────────────────────
function procesarVencimientos() {
  db.users.forEach(user => {
    // Plazos fijos
    user.plazos.forEach(pf => {
      if (!pf.acreditado && dateFromStr(pf.fechaVenc) <= TODAY) {
        const total = pf.capital + pf.interes;
        user.balance += total;
        pf.acreditado = true;
        const id = ++db.txCounter, d = fmtDate(TODAY);
        user.transactions.push({ id, type: 'credit', desc: 'Vencimiento plazo fijo – capital + interés', amount: total, date: d });
        db.allTransactions.push({ id, from: 'Plazo fijo', to: user.name, amount: total, date: d, type: 'pf_venc' });
      }
    });
    // Cuotas de préstamos
    user.prestamos.forEach(pr => {
      if (pr.cuotasPagas < pr.cuotas) {
        const fechaCuota = dateFromStr(pr.proximaFecha);
        if (fechaCuota <= TODAY) {
          const cuotaAdeudada = pr.cuotaMensual + (pr.montoMora || 0);
          if (user.balance >= cuotaAdeudada) {
            user.balance -= cuotaAdeudada;
            db.adminBalance += cuotaAdeudada;
            pr.cuotasPagas++;
            pr.montoMora = 0;
            pr.proximaFecha = fmtDate(addMonths(fechaCuota, 1));
            const id = ++db.txCounter, d = fmtDate(TODAY);
            user.transactions.push({ id, type: 'debit', desc: `Cuota préstamo ${pr.cuotasPagas}/${pr.cuotas}`, amount: cuotaAdeudada, date: d });
            db.allTransactions.push({ id, from: user.name, to: 'Banco (admin)', amount: cuotaAdeudada, date: d, type: 'cuota' });
          } else {
            // Mora: interés sobre saldo de capital pendiente
            const saldoPendiente = pr.cuotaMensual * (pr.cuotas - pr.cuotasPagas);
            const mora = saldoPendiente * (config.tasaMora / 100);
            pr.montoMora = (pr.montoMora || 0) + mora;
            const id = ++db.txCounter, d = fmtDate(TODAY);
            user.transactions.push({ id, type: 'debit', desc: `Mora – saldo insuficiente (cuota ${pr.cuotasPagas + 1})`, amount: mora, date: d });
            db.allTransactions.push({ id, from: user.name, to: 'Banco (mora)', amount: mora, date: d, type: 'mora' });
          }
        }
      }
    });
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'))
  );
  document.getElementById('tab-login').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('tab-register').style.display = tab === 'register' ? '' : 'none';
}

function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  document.getElementById('login-error').classList.remove('show');
  if (u === ADMIN.username && p === ADMIN.password) {
    currentUser = ADMIN;
    procesarVencimientos();
    renderAdmin();
    showScreen('admin');
    return;
  }
  const user = getUser(u);
  if (!user || user.password !== p) {
    document.getElementById('login-error').classList.add('show');
    return;
  }
  currentUser = user;
  procesarVencimientos();
  renderDashboard();
  showScreen('dashboard');
}

function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-user').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const err = document.getElementById('reg-error');
  const suc = document.getElementById('reg-success');
  err.classList.remove('show');
  suc.classList.remove('show');
  if (!name || !username || !pass) { err.textContent = 'Completá todos los campos'; err.classList.add('show'); return; }
  if (pass.length < 4) { err.textContent = 'La contraseña debe tener al menos 4 caracteres'; err.classList.add('show'); return; }
  if (username === 'admin') { err.textContent = 'Ese nombre no está disponible'; err.classList.add('show'); return; }
  if (getUser(username)) { err.textContent = 'Ese usuario ya existe'; err.classList.add('show'); return; }
  const num = String(db.users.length + 2).padStart(4, '0') + '-' + String(Math.floor(Math.random() * 9000) + 1000);
  db.users.push({ username, password: pass, name, balance: 0, accountNum: num, balanceUSD: 0, accountNumUSD: null, transactions: [], txUSD: [], prestamos: [], plazos: [] });
  suc.classList.add('show');
  ['reg-name', 'reg-user', 'reg-pass'].forEach(id => document.getElementById(id).value = '');
}

function doLogout() {
  currentUser = null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showScreen('login');
}

// ─── DASHBOARD USUARIO ────────────────────────────────────────────
function userTab(tab) {
  document.querySelectorAll('.user-nav-tab').forEach((t, i) =>
    t.classList.toggle('active', ['home', 'divisas', 'prestamos', 'plazos'][i] === tab)
  );
  ['home', 'divisas', 'prestamos', 'plazos'].forEach(t =>
    document.getElementById('utab-' + t).style.display = t === tab ? '' : 'none'
  );
  if (tab === 'divisas') renderDivisasTab();
  if (tab === 'prestamos') renderPrestamosUser();
  if (tab === 'plazos') renderPlazosUser();
}

function renderDashboard() {
  const u = currentUser;
  document.getElementById('topbar-avatar').textContent = u.name[0].toUpperCase();
  document.getElementById('topbar-uname').textContent = u.name;
  document.getElementById('dash-balance-ars').textContent = fmtARS(u.balance);
  document.getElementById('dash-accnum').textContent = u.accountNum;
  syncUSDDisplay();
  updateFXLabels();
  renderTxList();
}

function renderTxList() {
  const el = document.getElementById('tx-list');
  const txs = [...(currentUser.transactions || [])].reverse();
  if (!txs.length) { el.innerHTML = '<div class="empty-state">No hay movimientos aún.</div>'; return; }
  el.innerHTML = txs.slice(0, 15).map(tx => {
    const cls = tx.type === 'credit' ? 'credit' : 'debit';
    const icon = tx.type === 'credit' ? '↙' : '↗';
    const amtStr = tx.type === 'credit' ? '+ ' + fmtARS(tx.amount) : '− ' + fmtARS(tx.amount);
    return `<div class="tx-item">
      <div class="tx-left">
        <div class="tx-icon ${cls}">${icon}</div>
        <div><div class="tx-desc">${tx.desc}</div><div class="tx-date">${tx.date}</div></div>
      </div>
      <div class="tx-amount ${cls}">${amtStr}</div>
    </div>`;
  }).join('');
}

// ─── CUENTA USD ───────────────────────────────────────────────────
function abrirCuentaUSD() {
  if (currentUser.accountNumUSD) return;
  currentUser.accountNumUSD = 'USD-' + String(Math.floor(Math.random() * 90000) + 10000);
  syncUSDDisplay();
  showNotif('✓ Cuenta en USD abierta: ' + currentUser.accountNumUSD, 'info');
  userTab('divisas');
}

function renderDivisasTab() {
  const hasUSD = !!currentUser.accountNumUSD;
  document.getElementById('divisas-sin-cuenta').style.display = hasUSD ? 'none' : '';
  document.getElementById('divisas-con-cuenta').style.display = hasUSD ? '' : 'none';
  if (hasUSD) { syncUSDDisplay(); updateFXLabels(); renderUSDTxList(); }
}

function renderUSDTxList() {
  const el = document.getElementById('usd-tx-list');
  const txs = [...(currentUser.txUSD || [])].reverse();
  if (!txs.length) { el.innerHTML = '<div class="empty-state">No hay movimientos en USD aún.</div>'; return; }
  el.innerHTML = txs.map(tx => {
    const cls = tx.type === 'credit' ? 'credit' : 'debit';
    const icon = tx.type === 'credit' ? '↙' : '↗';
    return `<div class="tx-item">
      <div class="tx-left">
        <div class="tx-icon ${cls}">${icon}</div>
        <div><div class="tx-desc">${tx.desc}</div><div class="tx-date">${tx.date}</div></div>
      </div>
      <div class="tx-amount ${cls}">${tx.type === 'credit' ? '+ ' : '− '}${fmtUSD(tx.amount)}</div>
    </div>`;
  }).join('');
}

// ─── SIMULACIONES FX ─────────────────────────────────────────────
function simCompra() {
  const usd = parseFloat(document.getElementById('buy-usd-amt').value);
  const sim = document.getElementById('buy-sim');
  if (!usd || usd <= 0) { sim.style.display = 'none'; return; }
  sim.style.display = '';
  document.getElementById('buy-sim-usd').textContent = fmtUSD(usd);
  document.getElementById('buy-sim-tc').textContent = fmtTC(config.tcVenta) + ' / USD';
  document.getElementById('buy-sim-ars').textContent = fmtARS(usd * config.tcVenta);
}
function simVenta() {
  const usd = parseFloat(document.getElementById('sell-usd-amt').value);
  const sim = document.getElementById('sell-sim');
  if (!usd || usd <= 0) { sim.style.display = 'none'; return; }
  sim.style.display = '';
  document.getElementById('sell-sim-usd').textContent = fmtUSD(usd);
  document.getElementById('sell-sim-tc').textContent = fmtTC(config.tcCompra) + ' / USD';
  document.getElementById('sell-sim-ars').textContent = fmtARS(usd * config.tcCompra);
}

// ─── OPERACIONES FX ──────────────────────────────────────────────
function doComprarUSD() {
  const usd = parseFloat(document.getElementById('buy-usd-amt').value);
  const err = document.getElementById('buy-error');
  err.classList.remove('show');
  if (!currentUser.accountNumUSD) { err.textContent = 'Primero abrí tu cuenta en USD'; err.classList.add('show'); return; }
  if (!usd || usd <= 0) { err.textContent = 'Ingresá un monto válido'; err.classList.add('show'); return; }
  const ars = usd * config.tcVenta;
  if (ars > currentUser.balance) { err.textContent = 'Saldo ARS insuficiente (necesitás ' + fmtARS(ars) + ')'; err.classList.add('show'); return; }
  const id = ++db.txCounter, d = fmtDate(TODAY);
  currentUser.balance -= ars;
  currentUser.balanceUSD += usd;
  currentUser.transactions.push({ id, type: 'debit', desc: 'Compra de ' + fmtUSD(usd) + ' al TC ' + fmtTC(config.tcVenta), amount: ars, date: d });
  currentUser.txUSD.push({ id, type: 'credit', desc: 'Compra de divisas al TC ' + fmtTC(config.tcVenta) + '/USD', amount: usd, date: d });
  db.allTransactions.push({ id, from: currentUser.name + ' (ARS)', to: currentUser.name + ' (USD)', amount: ars, date: d, type: 'fx_compra' });
  document.getElementById('dash-balance-ars').textContent = fmtARS(currentUser.balance);
  syncUSDDisplay(); renderTxList(); renderUSDTxList(); closeModal('comprar-usd');
  document.getElementById('buy-usd-amt').value = '';
  document.getElementById('buy-sim').style.display = 'none';
  showNotif('✓ Compraste ' + fmtUSD(usd) + ' por ' + fmtARS(ars), 'info');
}

function doVenderUSD() {
  const usd = parseFloat(document.getElementById('sell-usd-amt').value);
  const err = document.getElementById('sell-error');
  err.classList.remove('show');
  if (!currentUser.accountNumUSD) { err.textContent = 'Primero abrí tu cuenta en USD'; err.classList.add('show'); return; }
  if (!usd || usd <= 0) { err.textContent = 'Ingresá un monto válido'; err.classList.add('show'); return; }
  if (usd > currentUser.balanceUSD) { err.textContent = 'Saldo USD insuficiente'; err.classList.add('show'); return; }
  const ars = usd * config.tcCompra, id = ++db.txCounter, d = fmtDate(TODAY);
  currentUser.balanceUSD -= usd;
  currentUser.balance += ars;
  currentUser.transactions.push({ id, type: 'credit', desc: 'Venta de ' + fmtUSD(usd) + ' al TC ' + fmtTC(config.tcCompra), amount: ars, date: d });
  currentUser.txUSD.push({ id, type: 'debit', desc: 'Venta de divisas al TC ' + fmtTC(config.tcCompra) + '/USD', amount: usd, date: d });
  db.allTransactions.push({ id, from: currentUser.name + ' (USD)', to: currentUser.name + ' (ARS)', amount: ars, date: d, type: 'fx_venta' });
  document.getElementById('dash-balance-ars').textContent = fmtARS(currentUser.balance);
  syncUSDDisplay(); renderTxList(); renderUSDTxList(); closeModal('vender-usd');
  document.getElementById('sell-usd-amt').value = '';
  document.getElementById('sell-sim').style.display = 'none';
  showNotif('✓ Vendiste ' + fmtUSD(usd) + ' y recibiste ' + fmtARS(ars), 'info');
}

function doTransferUSD() {
  const dest = document.getElementById('tf-usd-dest').value.trim().toLowerCase();
  const usd = parseFloat(document.getElementById('tf-usd-amt').value);
  const err = document.getElementById('tf-usd-error');
  err.classList.remove('show');
  if (!dest) { err.textContent = 'Ingresá el usuario destinatario'; err.classList.add('show'); return; }
  if (dest === currentUser.username) { err.textContent = 'No podés transferirte a vos mismo'; err.classList.add('show'); return; }
  const target = getUser(dest);
  if (!target) { err.textContent = 'Usuario "' + dest + '" no encontrado'; err.classList.add('show'); return; }
  if (!target.accountNumUSD) { err.textContent = target.name + ' no tiene cuenta en USD'; err.classList.add('show'); return; }
  if (!usd || usd <= 0) { err.textContent = 'Ingresá un monto válido'; err.classList.add('show'); return; }
  if (usd > currentUser.balanceUSD) { err.textContent = 'Saldo USD insuficiente'; err.classList.add('show'); return; }
  const id = ++db.txCounter, d = fmtDate(TODAY);
  currentUser.balanceUSD -= usd;
  target.balanceUSD += usd;
  currentUser.txUSD.push({ id, type: 'debit', desc: 'Transferencia USD a ' + target.name, amount: usd, date: d });
  target.txUSD.push({ id, type: 'credit', desc: 'Transferencia USD de ' + currentUser.name, amount: usd, date: d });
  db.allTransactions.push({ id, from: currentUser.name, to: target.name, amount: usd, date: d, type: 'transfer_usd' });
  syncUSDDisplay(); renderUSDTxList(); closeModal('transfer-usd');
  document.getElementById('tf-usd-dest').value = '';
  document.getElementById('tf-usd-amt').value = '';
  showNotif('✓ Transferiste ' + fmtUSD(usd) + ' a ' + target.name, 'info');
}

// ─── OPERACIONES ARS ─────────────────────────────────────────────
function doTransfer() {
  const dest = document.getElementById('tf-dest').value.trim().toLowerCase();
  const amount = parseFloat(document.getElementById('tf-amount').value);
  const err = document.getElementById('tf-error');
  err.classList.remove('show');
  if (!dest) { err.textContent = 'Ingresá el usuario destinatario'; err.classList.add('show'); return; }
  if (dest === currentUser.username) { err.textContent = 'No podés transferirte a vos mismo'; err.classList.add('show'); return; }
  const target = getUser(dest);
  if (!target) { err.textContent = 'Usuario "' + dest + '" no encontrado'; err.classList.add('show'); return; }
  if (!amount || amount <= 0) { err.textContent = 'Ingresá un monto válido'; err.classList.add('show'); return; }
  if (amount > currentUser.balance) { err.textContent = 'Saldo insuficiente'; err.classList.add('show'); return; }
  const id = ++db.txCounter, d = fmtDate(TODAY);
  currentUser.balance -= amount;
  target.balance += amount;
  currentUser.transactions.push({ id, type: 'debit', desc: 'Transferencia a ' + target.name, amount, date: d });
  target.transactions.push({ id, type: 'credit', desc: 'Transferencia de ' + currentUser.name, amount, date: d });
  db.allTransactions.push({ id, from: currentUser.name, to: target.name, amount, date: d, type: 'transfer' });
  document.getElementById('dash-balance-ars').textContent = fmtARS(currentUser.balance);
  renderTxList(); closeModal('transfer');
  document.getElementById('tf-dest').value = '';
  document.getElementById('tf-amount').value = '';
  showNotif('✓ Transferiste ' + fmtARS(amount) + ' a ' + target.name);
}

function doDeposit() {
  const amount = parseFloat(document.getElementById('dep-amount').value);
  const err = document.getElementById('dep-error');
  err.classList.remove('show');
  if (!amount || amount <= 0) { err.textContent = 'Ingresá un monto válido'; err.classList.add('show'); return; }
  const id = ++db.txCounter, d = fmtDate(TODAY);
  currentUser.balance += amount;
  currentUser.transactions.push({ id, type: 'credit', desc: 'Depósito propio', amount, date: d });
  db.allTransactions.push({ id, from: 'Depósito', to: currentUser.name, amount, date: d, type: 'deposit' });
  document.getElementById('dash-balance-ars').textContent = fmtARS(currentUser.balance);
  renderTxList(); closeModal('deposit');
  document.getElementById('dep-amount').value = '';
  showNotif('✓ Depósito de ' + fmtARS(amount) + ' realizado');
}

// ─── PRÉSTAMOS ────────────────────────────────────────────────────
function simPrestamo() {
  const C = parseFloat(document.getElementById('pr-capital').value);
  const n = parseInt(document.getElementById('pr-plazo').value);
  const sim = document.getElementById('pr-sim');
  if (!C || !n || C <= 0 || n < 1 || n > 72) { sim.style.display = 'none'; return; }
  const i = config.tasaPR / 100 / 12;
  const cuota = cuotaFrancesa(C, i, n);
  const total = cuota * n;
  const fecha1 = addMonths(TODAY, 1);
  sim.style.display = '';
  document.getElementById('pr-sim-tna').textContent = config.tasaPR + '% TNA';
  document.getElementById('pr-sim-cuota').textContent = fmtARS(cuota);
  document.getElementById('pr-sim-total').textContent = fmtARS(total);
  document.getElementById('pr-sim-fecha1').textContent = fmtDate(fecha1);
}

function doSolicitarPrestamo() {
  const C = parseFloat(document.getElementById('pr-capital').value);
  const n = parseInt(document.getElementById('pr-plazo').value);
  const err = document.getElementById('pr-error');
  err.classList.remove('show');
  if (!C || C <= 0) { err.textContent = 'Ingresá un capital válido'; err.classList.add('show'); return; }
  if (!n || n < 1 || n > 72) { err.textContent = 'El plazo debe ser entre 1 y 72 meses'; err.classList.add('show'); return; }
  const i = config.tasaPR / 100 / 12;
  const cuota = cuotaFrancesa(C, i, n);
  const id = ++db.txCounter, d = fmtDate(TODAY);
  currentUser.prestamos.push({
    id, capital: C, cuotas: n, cuotaMensual: cuota, cuotasPagas: 0,
    tna: config.tasaPR, fechaOrigen: d, proximaFecha: fmtDate(addMonths(TODAY, 1)), montoMora: 0,
  });
  currentUser.balance += C;
  currentUser.transactions.push({ id, type: 'credit', desc: 'Préstamo acreditado – ' + n + ' cuotas de ' + fmtARS(cuota), amount: C, date: d });
  db.allTransactions.push({ id, from: 'Banco', to: currentUser.name, amount: C, date: d, type: 'prestamo' });
  document.getElementById('dash-balance-ars').textContent = fmtARS(currentUser.balance);
  renderTxList(); closeModal('new-prestamo');
  document.getElementById('pr-capital').value = '';
  document.getElementById('pr-plazo').value = '';
  document.getElementById('pr-sim').style.display = 'none';
  showNotif('✓ Préstamo de ' + fmtARS(C) + ' acreditado en tu cuenta');
}

function renderPrestamosUser() {
  const el = document.getElementById('prestamos-list');
  const prs = currentUser.prestamos || [];
  if (!prs.length) { el.innerHTML = '<div class="empty-state">No tenés préstamos activos.</div>'; return; }
  el.innerHTML = prs.map(pr => {
    const term = pr.cuotasPagas >= pr.cuotas, mora = pr.montoMora > 0;
    const badge = term
      ? '<span class="producto-badge badge-plazo">✓ Cancelado</span>'
      : mora
        ? '<span class="producto-badge badge-vencido">⚠ Mora</span>'
        : '<span class="producto-badge badge-prestamo">Activo</span>';
    return `<div class="producto-item"><div class="prod-info">
      <div class="prod-title">Préstamo ${fmtARS(pr.capital)} – ${pr.cuotas} cuotas ${badge}</div>
      <div class="prod-detail">Cuota: ${fmtARS(pr.cuotaMensual)}${mora ? ' + mora ' + fmtARS(pr.montoMora) : ''} · Pagadas: ${pr.cuotasPagas}/${pr.cuotas}${!term ? ' · Próx: ' + pr.proximaFecha : ''}</div>
      <div class="prod-detail">Tasa: ${pr.tna}% TNA · Sistema francés · Originado: ${pr.fechaOrigen}</div>
    </div></div>`;
  }).join('');
}

// ─── PLAZOS FIJOS ─────────────────────────────────────────────────
function simPlazo() {
  const M = parseFloat(document.getElementById('pf-monto').value);
  const n = parseInt(document.getElementById('pf-plazo').value);
  const sim = document.getElementById('pf-sim');
  if (!M || !n || M <= 0 || n < 1 || n > 12) { sim.style.display = 'none'; return; }
  const interes = M * (config.tasaPF / 100) * (n / 12);
  const venc = addMonths(TODAY, n);
  sim.style.display = '';
  document.getElementById('pf-sim-tna').textContent = config.tasaPF + '% TNA';
  document.getElementById('pf-sim-interes').textContent = fmtARS(interes);
  document.getElementById('pf-sim-total').textContent = fmtARS(M + interes);
  document.getElementById('pf-sim-fecha').textContent = fmtDate(venc);
}

function doConstitutirPlazo() {
  const M = parseFloat(document.getElementById('pf-monto').value);
  const n = parseInt(document.getElementById('pf-plazo').value);
  const err = document.getElementById('pf-error');
  err.classList.remove('show');
  if (!M || M <= 0) { err.textContent = 'Ingresá un monto válido'; err.classList.add('show'); return; }
  if (!n || n < 1 || n > 12) { err.textContent = 'El plazo debe ser entre 1 y 12 meses'; err.classList.add('show'); return; }
  if (M > currentUser.balance) { err.textContent = 'Saldo insuficiente'; err.classList.add('show'); return; }
  const interes = M * (config.tasaPF / 100) * (n / 12);
  const venc = addMonths(TODAY, n);
  const id = ++db.txCounter, d = fmtDate(TODAY);
  currentUser.plazos.push({ id, capital: M, meses: n, tna: config.tasaPF, interes, fechaInicio: d, fechaVenc: fmtDate(venc), acreditado: false });
  currentUser.balance -= M;
  currentUser.transactions.push({ id, type: 'debit', desc: 'Constitución plazo fijo – ' + n + ' meses al ' + config.tasaPF + '% TNA', amount: M, date: d });
  db.allTransactions.push({ id, from: currentUser.name, to: 'Plazo fijo', amount: M, date: d, type: 'plazo' });
  document.getElementById('dash-balance-ars').textContent = fmtARS(currentUser.balance);
  renderTxList(); closeModal('new-plazo');
  document.getElementById('pf-monto').value = '';
  document.getElementById('pf-plazo').value = '';
  document.getElementById('pf-sim').style.display = 'none';
  showNotif('✓ Plazo fijo de ' + fmtARS(M) + ' constituido por ' + n + ' meses');
}

function renderPlazosUser() {
  const el = document.getElementById('plazos-list');
  const pfs = currentUser.plazos || [];
  if (!pfs.length) { el.innerHTML = '<div class="empty-state">No tenés plazos fijos.</div>'; return; }
  el.innerHTML = pfs.map(pf => {
    const badge = pf.acreditado
      ? '<span class="producto-badge badge-plazo">✓ Acreditado</span>'
      : '<span class="producto-badge badge-prestamo">En curso</span>';
    return `<div class="producto-item"><div class="prod-info">
      <div class="prod-title">Plazo Fijo ${fmtARS(pf.capital)} – ${pf.meses} meses ${badge}</div>
      <div class="prod-detail">Tasa: ${pf.tna}% TNA · Interés: ${fmtARS(pf.interes)} · Total: ${fmtARS(pf.capital + pf.interes)}</div>
      <div class="prod-detail">Inicio: ${pf.fechaInicio} · Vencimiento: ${pf.fechaVenc}</div>
    </div></div>`;
  }).join('');
}

// ─── ADMIN ────────────────────────────────────────────────────────
function adminTab(tab) {
  const tabs = ['users', 'productos', 'divisas', 'transactions', 'config'];
  document.querySelectorAll('.nav-tab').forEach((t, i) => t.classList.toggle('active', tabs[i] === tab));
  tabs.forEach(t => document.getElementById('apanel-' + t).style.display = t === tab ? '' : 'none');
  if (tab === 'productos') renderAdminProductos();
  if (tab === 'divisas') renderAdminDivisas();
  if (tab === 'transactions') renderAdminTx();
  if (tab === 'config') loadConfigUI();
}

function renderAdmin() { renderAdminStats(); renderAdminUsers(); }

function renderAdminStats() {
  const total = db.users.reduce((s, u) => s + u.balance, 0);
  const totalUSD = db.users.reduce((s, u) => s + (u.accountNumUSD ? u.balanceUSD : 0), 0);
  const totalPr = db.users.reduce((s, u) => s + u.prestamos.filter(p => p.cuotasPagas < p.cuotas).length, 0);
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value stat-accent">${db.users.length}</div><div class="stat-label">USUARIOS</div></div>
    <div class="stat-card"><div class="stat-value">${fmtARS(total)}</div><div class="stat-label">SALDO TOTAL ARS</div></div>
    <div class="stat-card"><div class="stat-value stat-blue">${fmtUSD(totalUSD)}</div><div class="stat-label">SALDO TOTAL USD</div></div>
    <div class="stat-card"><div class="stat-value stat-accent">${totalPr}</div><div class="stat-label">PRÉSTAMOS ACTIVOS</div></div>`;
}

function renderAdminUsers() {
  document.getElementById('admin-users-body').innerHTML = db.users.map(u => `
    <tr>
      <td><strong>${u.username}</strong></td>
      <td>${u.name}</td>
      <td><strong style="color:var(--red)">${fmtARS(u.balance)}</strong></td>
      <td><div class="amount-input-row">
        <input type="number" id="adj-ars-${u.username}" placeholder="Monto" min="0"/>
        <button class="btn-sm btn-add" onclick="adminAdjustARS('${u.username}','add')">+ ARS</button>
        <button class="btn-sm btn-sub" onclick="adminAdjustARS('${u.username}','sub')">− ARS</button>
      </div></td>
      <td>${u.accountNumUSD ? '<strong style="color:var(--blue)">' + fmtUSD(u.balanceUSD) + '</strong>' : '<span style="color:var(--text3)">Sin cuenta</span>'}</td>
      <td>${u.accountNumUSD ? `<div class="amount-input-row">
        <input type="number" id="adj-usd-${u.username}" placeholder="Monto" min="0"/>
        <button class="btn-sm btn-add-blue" onclick="adminAdjustUSD('${u.username}','add')">+ USD</button>
        <button class="btn-sm btn-sub-blue" onclick="adminAdjustUSD('${u.username}','sub')">− USD</button>
      </div>` : '<span style="color:var(--text3);font-size:11px;">—</span>'}</td>
      <td><button class="btn-delete" onclick="askDelete('${u.username}')">Eliminar</button></td>
    </tr>`).join('');
}

function adminAdjustARS(username, mode) {
  const inp = document.getElementById('adj-ars-' + username);
  const amount = parseFloat(inp.value);
  if (!amount || amount <= 0) { showNotif('Ingresá un monto válido', 'error'); return; }
  const user = getUser(username);
  if (!user) return;
  const id = ++db.txCounter, d = fmtDate(TODAY);
  if (mode === 'add') {
    user.balance += amount;
    user.transactions.push({ id, type: 'credit', desc: 'Ajuste ARS por administrador (+)', amount, date: d });
    db.allTransactions.push({ id, from: 'Admin', to: user.name, amount, date: d, type: 'admin_add' });
    showNotif('✓ Se agregaron ' + fmtARS(amount) + ' a ' + user.name);
  } else {
    if (amount > user.balance) { showNotif('Saldo ARS insuficiente', 'error'); return; }
    user.balance -= amount;
    user.transactions.push({ id, type: 'debit', desc: 'Ajuste ARS por administrador (−)', amount, date: d });
    db.allTransactions.push({ id, from: user.name, to: 'Admin', amount, date: d, type: 'admin_sub' });
    showNotif('✓ Se quitaron ' + fmtARS(amount) + ' de ' + user.name);
  }
  inp.value = '';
  renderAdminStats();
  renderAdminUsers();
}

function adminAdjustUSD(username, mode) {
  const inp = document.getElementById('adj-usd-' + username);
  const amount = parseFloat(inp.value);
  if (!amount || amount <= 0) { showNotif('Ingresá un monto válido', 'error'); return; }
  const user = getUser(username);
  if (!user || !user.accountNumUSD) { showNotif('El usuario no tiene cuenta USD', 'error'); return; }
  const id = ++db.txCounter, d = fmtDate(TODAY);
  if (mode === 'add') {
    user.balanceUSD += amount;
    user.txUSD.push({ id, type: 'credit', desc: 'Ajuste USD por administrador (+)', amount, date: d });
    db.allTransactions.push({ id, from: 'Admin', to: user.name, amount, date: d, type: 'admin_add_usd' });
    showNotif('✓ Se agregaron ' + fmtUSD(amount) + ' a ' + user.name, 'info');
  } else {
    if (amount > user.balanceUSD) { showNotif('Saldo USD insuficiente', 'error'); return; }
    user.balanceUSD -= amount;
    user.txUSD.push({ id, type: 'debit', desc: 'Ajuste USD por administrador (−)', amount, date: d });
    db.allTransactions.push({ id, from: user.name, to: 'Admin', amount, date: d, type: 'admin_sub_usd' });
    showNotif('✓ Se quitaron ' + fmtUSD(amount) + ' de ' + user.name, 'info');
  }
  inp.value = '';
  renderAdminStats();
  renderAdminUsers();
}

function renderAdminDivisas() {
  document.getElementById('admin-divisas-body').innerHTML = db.users.map(u => `
    <tr>
      <td><strong>${u.username}</strong></td>
      <td>${u.name}</td>
      <td>${u.accountNumUSD || '<span style="color:var(--text3)">No abierta</span>'}</td>
      <td>${u.accountNumUSD ? '<strong style="color:var(--blue)">' + fmtUSD(u.balanceUSD) + '</strong>' : '—'}</td>
      <td>${u.accountNumUSD ? fmtARS(u.balanceUSD * config.tcCompra) : '—'}</td>
    </tr>`).join('');
}

function renderAdminProductos() {
  const pb = document.getElementById('admin-prestamos-body');
  const prs = [];
  db.users.forEach(u => u.prestamos.filter(p => p.cuotasPagas < p.cuotas).forEach(p => prs.push({ user: u, pr: p })));
  pb.innerHTML = prs.length
    ? prs.map(({ user, pr }) => `<tr>
        <td>${user.name}</td>
        <td>${fmtARS(pr.capital)}</td>
        <td>${fmtARS(pr.cuotaMensual)}</td>
        <td>${pr.cuotas - pr.cuotasPagas}/${pr.cuotas}</td>
        <td>${pr.proximaFecha}</td>
        <td>${pr.montoMora > 0 ? '<span style="color:var(--red);font-weight:700">' + fmtARS(pr.montoMora) + '</span>' : '—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text3)">No hay préstamos activos</td></tr>';

  const pfb = document.getElementById('admin-plazos-body');
  const pfs = [];
  db.users.forEach(u => u.plazos.filter(p => !p.acreditado).forEach(p => pfs.push({ user: u, pf: p })));
  pfb.innerHTML = pfs.length
    ? pfs.map(({ user, pf }) => `<tr>
        <td>${user.name}</td>
        <td>${fmtARS(pf.capital)}</td>
        <td>${pf.tna}% TNA</td>
        <td>${fmtARS(pf.interes)}</td>
        <td>${pf.fechaVenc}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text3)">No hay plazos fijos activos</td></tr>';
}

function renderAdminTx() {
  const el = document.getElementById('admin-tx-list');
  const all = [...db.allTransactions].reverse();
  if (!all.length) { el.innerHTML = '<div class="empty-state">No hay transacciones.</div>'; return; }
  const lbl = {
    transfer: '↗ Transferencia ARS', deposit: '↙ Depósito', prestamo: '$ Préstamo acreditado',
    plazo: '% Plazo fijo', cuota: '✓ Cuota préstamo', mora: '⚠ Mora', pf_venc: '% PF vencido',
    admin_add: '+ Ajuste ARS admin', admin_sub: '− Ajuste ARS admin',
    admin_add_usd: '+ Ajuste USD admin', admin_sub_usd: '− Ajuste USD admin',
    delete: '✕ Eliminación', fx_compra: '$ Compra USD', fx_venta: '$ Venta USD',
    transfer_usd: '↗ Transferencia USD',
  };
  el.innerHTML = all.map(tx => {
    const isUSD = ['transfer_usd', 'admin_add_usd', 'admin_sub_usd', 'fx_compra', 'fx_venta'].includes(tx.type);
    return `<div class="admin-tx-item">
      <div>
        <div style="font-size:13px;color:var(--text);font-weight:600">${lbl[tx.type] || tx.type}: ${tx.from} → ${tx.to}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${tx.date} · ID #${tx.id}</div>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--navy)">${tx.amount ? (isUSD ? fmtUSD(tx.amount) : fmtARS(tx.amount)) : '—'}</div>
    </div>`;
  }).join('');
}

function loadConfigUI() {
  document.getElementById('cfg-tasa-pf').value = config.tasaPF;
  document.getElementById('cfg-tasa-pr').value = config.tasaPR;
  document.getElementById('cfg-tasa-mora').value = config.tasaMora;
  document.getElementById('cfg-tc-compra').value = config.tcCompra;
  document.getElementById('cfg-tc-venta').value = config.tcVenta;
}

function saveConfig() {
  const pf = parseFloat(document.getElementById('cfg-tasa-pf').value);
  const pr = parseFloat(document.getElementById('cfg-tasa-pr').value);
  const mora = parseFloat(document.getElementById('cfg-tasa-mora').value);
  const tcc = parseFloat(document.getElementById('cfg-tc-compra').value);
  const tcv = parseFloat(document.getElementById('cfg-tc-venta').value);
  if ([pf, pr, mora, tcc, tcv].some(v => isNaN(v) || v < 0)) { showNotif('Verificá que todos los valores sean válidos', 'error'); return; }
  if (tcc >= tcv) { showNotif('El TC comprador debe ser menor al TC vendedor', 'error'); return; }
  config = { tasaPF: pf, tasaPR: pr, tasaMora: mora, tcCompra: tcc, tcVenta: tcv };
  updateFXLabels();
  showNotif('✓ Configuración guardada correctamente');
}

function askDelete(username) {
  const user = getUser(username);
  if (!user) return;
  pendingDeleteUsername = username;
  document.getElementById('confirm-desc').innerHTML =
    `Estás por eliminar la cuenta de <strong>${user.name}</strong> (@${user.username}).<br>Esta acción no se puede deshacer.`;
  openModal('confirm-delete');
}

function confirmDelete() {
  if (!pendingDeleteUsername) return;
  const user = getUser(pendingDeleteUsername);
  if (user) {
    db.allTransactions.push({ id: ++db.txCounter, from: 'Admin', to: '—', amount: 0, date: fmtDate(TODAY), type: 'delete' });
    db.users = db.users.filter(u => u.username !== pendingDeleteUsername);
  }
  pendingDeleteUsername = null;
  closeModal('confirm-delete');
  renderAdmin();
  showNotif('Usuario eliminado correctamente');
}

// ─── CIERRE DE MODALES AL CLICK FUERA ────────────────────────────
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('open');
  });
});
