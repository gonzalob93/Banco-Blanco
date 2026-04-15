// ════════════════════════════════════════════════════════════════
//  BANCO BLANCO — app.js  (versión Firebase / Firestore)
//  Los datos se persisten en la nube y se sincronizan en tiempo real.
// ════════════════════════════════════════════════════════════════
 
// ─── CONFIGURACIÓN FIREBASE ──────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyA0TpXfQZ4MyeUESGk2Idy9d5UDrqy60_w",
  authDomain:        "banco-blanco.firebaseapp.com",
  projectId:         "banco-blanco",
  storageBucket:     "banco-blanco.firebasestorage.app",
  messagingSenderId: "160603200264",
  appId:             "1:160603200264:web:d51a413468d2be1d352abd",
};
 
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
 
// ─── CREDENCIALES ADMIN (solo en cliente — app de simulación) ────
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';
 
// ─── ESTADO LOCAL ────────────────────────────────────────────────
let currentUser   = null;   // objeto del usuario logueado (desde Firestore)
let localConfig   = null;   // configuración de tasas y TC
let unsubscribeUser = null; // listener en tiempo real del usuario activo
 
// ─── HELPERS DE FORMATO ──────────────────────────────────────────
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
function cuotaFrancesa(C, i, n) {
  if (i === 0) return C / n;
  return C * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1);
}
function today() { return new Date(); }
function todayStr() { return fmtDate(today()); }
 
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
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) btn.dataset.orig = btn.textContent, btn.textContent = 'Cargando...';
  else btn.textContent = btn.dataset.orig || btn.textContent;
}
 
// ─── INICIALIZACIÓN ───────────────────────────────────────────────
async function init() {
  showScreen('loading');
  await ensureConfig();
  updateFXLabels();
  document.getElementById('today-label').textContent = todayStr();
  showScreen('login');
}
 
// ─── CONFIG GLOBAL (tasas y TC) ──────────────────────────────────
// Se guarda en Firestore en la colección "config", documento "global"
async function ensureConfig() {
  const ref = db.collection('config').doc('global');
  const snap = await ref.get();
  if (!snap.exists) {
    const defaults = { tasaPF: 10, tasaPR: 15, tasaMora: 5, tcCompra: 1370, tcVenta: 1400, tasaDescubierto: 50 };
    await ref.set(defaults);
    localConfig = defaults;
  } else {
    localConfig = snap.data();
  }
}
 
async function reloadConfig() {
  const snap = await db.collection('config').doc('global').get();
  localConfig = snap.data();
}
 
function updateFXLabels() {
  if (!localConfig) return;
  ['fx-compra-strip', 'fx-compra-div'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtTC(localConfig.tcCompra);
  });
  ['fx-venta-strip', 'fx-venta-div'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtTC(localConfig.tcVenta);
  });
  const cl = document.getElementById('compra-tc-label');
  if (cl) cl.textContent = 'TC Vendedor (banco vende): ' + fmtTC(localConfig.tcVenta) + ' por USD.';
  const vl = document.getElementById('venta-tc-label');
  if (vl) vl.textContent = 'TC Comprador (banco compra): ' + fmtTC(localConfig.tcCompra) + ' por USD.';
}
 
// ─── AUTH ─────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'))
  );
  document.getElementById('tab-login').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('tab-register').style.display = tab === 'register' ? '' : 'none';
}
 
async function doLogin() {
  const u = document.getElementById('login-user').value.trim().toLowerCase();
  const p = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  err.classList.remove('show');
 
  if (!u || !p) { err.textContent = 'Completá usuario y contraseña.'; err.classList.add('show'); return; }
 
  setLoading('btn-login', true);
 
  // Admin
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    await reloadConfig();
    setLoading('btn-login', false);
    await renderAdmin();
    showScreen('admin');
    return;
  }
 
  // Usuario normal
  try {
    const snap = await db.collection('users').doc(u).get();
    if (!snap.exists || snap.data().password !== p) {
      err.textContent = 'Usuario o contraseña incorrectos.';
      err.classList.add('show');
      setLoading('btn-login', false);
      return;
    }
    currentUser = { id: u, ...snap.data() };
    await procesarVencimientos();
    // Recargar después de procesar vencimientos
    const snap2 = await db.collection('users').doc(u).get();
    currentUser = { id: u, ...snap2.data() };
    subscribeToUser(u);
    renderDashboard();
    showScreen('dashboard');
  } catch (e) {
    err.textContent = 'Error de conexión. Intentá de nuevo.';
    err.classList.add('show');
    console.error(e);
  }
  setLoading('btn-login', false);
}
 
async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-user').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const err = document.getElementById('reg-error');
  const suc = document.getElementById('reg-success');
  err.classList.remove('show'); suc.classList.remove('show');
 
  if (!name || !username || !pass) { err.textContent = 'Completá todos los campos.'; err.classList.add('show'); return; }
  if (!/^[a-z0-9_]+$/.test(username)) { err.textContent = 'El usuario solo puede tener letras minúsculas, números y guion bajo.'; err.classList.add('show'); return; }
  if (pass.length < 4) { err.textContent = 'La contraseña debe tener al menos 4 caracteres.'; err.classList.add('show'); return; }
  if (username === ADMIN_USER) { err.textContent = 'Ese nombre no está disponible.'; err.classList.add('show'); return; }
 
  setLoading('btn-register', true);
  try {
    const ref = db.collection('users').doc(username);
    const snap = await ref.get();
    if (snap.exists) { err.textContent = 'Ese usuario ya existe.'; err.classList.add('show'); setLoading('btn-register', false); return; }
 
    const num = String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0') + '-' + String(Math.floor(Math.random() * 9000) + 1000);
    await ref.set({
      name, password: pass, balance: 0, accountNum: num,
      balanceUSD: 0, accountNumUSD: null,
      transactions: [], txUSD: [], prestamos: [], plazos: [],
      createdAt: todayStr(),
    });
    suc.classList.add('show');
    ['reg-name', 'reg-user', 'reg-pass'].forEach(id => document.getElementById(id).value = '');
  } catch (e) {
    err.textContent = 'Error al crear la cuenta. Intentá de nuevo.';
    err.classList.add('show');
    console.error(e);
  }
  setLoading('btn-register', false);
}
 
function doLogout() {
  if (unsubscribeUser) { unsubscribeUser(); unsubscribeUser = null; }
  currentUser = null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showScreen('login');
}
 
// ─── LISTENER EN TIEMPO REAL ──────────────────────────────────────
// Cuando otro usuario (o el admin) modifica los datos, la pantalla
// se actualiza automáticamente sin necesidad de recargar.
function subscribeToUser(username) {
  if (unsubscribeUser) unsubscribeUser();
  unsubscribeUser = db.collection('users').doc(username).onSnapshot(snap => {
    if (!snap.exists) return;
    currentUser = { id: username, ...snap.data() };
    renderDashboard();
  });
}
 
// ─── VENCIMIENTOS ─────────────────────────────────────────────────
async function procesarVencimientos() {
  if (!currentUser) return;
  const now = today();
  const data = currentUser;
  let changed = false;
  const txs = [...(data.transactions || [])];
  const plazos = [...(data.plazos || [])];
  const prestamos = [...(data.prestamos || [])];
  let balance = data.balance;
  let txCounter = data.txCounter || 200;
 
  // Plazos fijos vencidos
  plazos.forEach(pf => {
    if (!pf.acreditado && dateFromStr(pf.fechaVenc) <= now) {
      const total = pf.capital + pf.interes;
      balance += total;
      pf.acreditado = true;
      changed = true;
      txs.push({ id: ++txCounter, type: 'credit', desc: 'Vencimiento plazo fijo – capital + interés', amount: total, date: todayStr() });
    }
  });
 
  // Cuotas de préstamos vencidas
  prestamos.forEach(pr => {
    if (pr.cuotasPagas < pr.cuotas) {
      const fechaCuota = dateFromStr(pr.proximaFecha);
      if (fechaCuota <= now) {
        const cuotaAdeudada = pr.cuotaMensual + (pr.montoMora || 0);
        if (balance >= cuotaAdeudada) {
          balance -= cuotaAdeudada;
          pr.cuotasPagas++;
          pr.montoMora = 0;
          pr.proximaFecha = fmtDate(addMonths(fechaCuota, 1));
          changed = true;
          txs.push({ id: ++txCounter, type: 'debit', desc: `Cuota préstamo ${pr.cuotasPagas}/${pr.cuotas}`, amount: cuotaAdeudada, date: todayStr() });
        } else {
          const mora = pr.cuotaMensual * (pr.cuotas - pr.cuotasPagas) * (localConfig.tasaMora / 100);
          pr.montoMora = (pr.montoMora || 0) + mora;
          changed = true;
          txs.push({ id: ++txCounter, type: 'debit', desc: `Mora – saldo insuficiente (cuota ${pr.cuotasPagas + 1})`, amount: mora, date: todayStr() });
        }
      }
    }
  });
 
  if (changed) {
    await db.collection('users').doc(currentUser.id).update({
      balance, plazos, prestamos, transactions: txs, txCounter,
    });
  }
}
 
// ─── DASHBOARD ────────────────────────────────────────────────────
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
  if (!currentUser) return;
  document.getElementById('topbar-avatar').textContent = currentUser.name[0].toUpperCase();
  document.getElementById('topbar-uname').textContent = currentUser.name;
  const balEl = document.getElementById('dash-balance-ars');
  const bal = currentUser.balance || 0;
  balEl.textContent = fmtARS(bal);
  balEl.style.color = bal < 0 ? '#ef5350' : '#ffffff';
  const descInfoEl = document.getElementById('dash-descubierto-info');
  if (descInfoEl) {
    if (bal < 0) {
      const limite = limiteDescubierto(currentUser);
      const intereses = calcularInteresesDescubierto(currentUser);
      const disponible = limite + bal;
      descInfoEl.style.display = '';
      descInfoEl.innerHTML = 'Giro en descubierto · Disponible: ' + fmtARS(Math.max(0, disponible)) + ' · Int. acumulados: ' + fmtARS(intereses);
    } else {
      descInfoEl.style.display = 'none';
    }
  }
  document.getElementById('dash-accnum').textContent = currentUser.accountNum;
  syncUSDDisplay();
  updateFXLabels();
  renderTxList();
}
 
function syncUSDDisplay() {
  if (!currentUser) return;
  const hasUSD = !!currentUser.accountNumUSD;
  document.getElementById('dash-balance-usd').textContent = hasUSD ? fmtUSD(currentUser.balanceUSD) : '—';
  document.getElementById('usd-account-label').textContent = hasUSD
    ? 'Caja de ahorro USD · Nº ' + currentUser.accountNumUSD : 'Sin cuenta USD';
  const m = document.getElementById('usd-balance-main');
  if (m) m.textContent = hasUSD ? fmtUSD(currentUser.balanceUSD) : 'USD 0,00';
  const a = document.getElementById('usd-accnum-main');
  if (a) a.textContent = hasUSD ? 'Caja de ahorro USD · Nº ' + currentUser.accountNumUSD : '';
  document.getElementById('usd-actions-home').style.display = hasUSD ? '' : 'none';
  document.getElementById('usd-closed-home').style.display = hasUSD ? 'none' : '';
}
 
function renderTxList() {
  const el = document.getElementById('tx-list');
  const txs = [...(currentUser.transactions || [])].reverse();
  if (!txs.length) { el.innerHTML = '<div class="empty-state">No hay movimientos aún.</div>'; return; }
  el.innerHTML = txs.slice(0, 15).map(tx => {
    const cls = tx.type === 'credit' ? 'credit' : 'debit';
    const icon = tx.type === 'credit' ? '↙' : '↗';
    return `<div class="tx-item">
      <div class="tx-left"><div class="tx-icon ${cls}">${icon}</div>
      <div><div class="tx-desc">${tx.desc}</div><div class="tx-date">${tx.date}</div></div></div>
      <div class="tx-amount ${cls}">${tx.type === 'credit' ? '+ ' : '− '}${fmtARS(tx.amount)}</div>
    </div>`;
  }).join('');
}
 
// ─── CUENTA USD ───────────────────────────────────────────────────
async function abrirCuentaUSD() {
  if (currentUser.accountNumUSD) return;
  const numUSD = 'USD-' + String(Math.floor(Math.random() * 90000) + 10000);
  await db.collection('users').doc(currentUser.id).update({ accountNumUSD: numUSD });
  showNotif('✓ Cuenta en USD abierta: ' + numUSD, 'info');
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
    return `<div class="tx-item">
      <div class="tx-left"><div class="tx-icon ${cls}">${tx.type === 'credit' ? '↙' : '↗'}</div>
      <div><div class="tx-desc">${tx.desc}</div><div class="tx-date">${tx.date}</div></div></div>
      <div class="tx-amount ${cls}">${tx.type === 'credit' ? '+ ' : '− '}${fmtUSD(tx.amount)}</div>
    </div>`;
  }).join('');
}
 
// ─── FX SIMULACIONES ─────────────────────────────────────────────
function simCompra() {
  const usd = parseFloat(document.getElementById('buy-usd-amt').value);
  const sim = document.getElementById('buy-sim');
  if (!usd || usd <= 0) { sim.style.display = 'none'; return; }
  sim.style.display = '';
  document.getElementById('buy-sim-usd').textContent = fmtUSD(usd);
  document.getElementById('buy-sim-tc').textContent = fmtTC(localConfig.tcVenta) + ' / USD';
  document.getElementById('buy-sim-ars').textContent = fmtARS(usd * localConfig.tcVenta);
}
function simVenta() {
  const usd = parseFloat(document.getElementById('sell-usd-amt').value);
  const sim = document.getElementById('sell-sim');
  if (!usd || usd <= 0) { sim.style.display = 'none'; return; }
  sim.style.display = '';
  document.getElementById('sell-sim-usd').textContent = fmtUSD(usd);
  document.getElementById('sell-sim-tc').textContent = fmtTC(localConfig.tcCompra) + ' / USD';
  document.getElementById('sell-sim-ars').textContent = fmtARS(usd * localConfig.tcCompra);
}
 
// ─── OPERACIONES FX ──────────────────────────────────────────────
async function doComprarUSD() {
  const usd = parseFloat(document.getElementById('buy-usd-amt').value);
  const err = document.getElementById('buy-error'); err.classList.remove('show');
  if (!currentUser.accountNumUSD) { err.textContent = 'Primero abrí tu cuenta en USD.'; err.classList.add('show'); return; }
  if (!usd || usd <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  const ars = usd * localConfig.tcVenta;
  if (ars > currentUser.balance) { err.textContent = 'Saldo ARS insuficiente (necesitás ' + fmtARS(ars) + ').'; err.classList.add('show'); return; }
  const txId = (currentUser.txCounter || 200) + 1;
  await db.collection('users').doc(currentUser.id).update({
    balance: currentUser.balance - ars,
    balanceUSD: currentUser.balanceUSD + usd,
    txCounter: txId,
    transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Compra de ' + fmtUSD(usd) + ' al TC ' + fmtTC(localConfig.tcVenta), amount: ars, date: todayStr() }),
    txUSD: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Compra de divisas al TC ' + fmtTC(localConfig.tcVenta) + '/USD', amount: usd, date: todayStr() }),
  });
  closeModal('comprar-usd');
  document.getElementById('buy-usd-amt').value = '';
  document.getElementById('buy-sim').style.display = 'none';
  showNotif('✓ Compraste ' + fmtUSD(usd) + ' por ' + fmtARS(ars), 'info');
}
 
async function doVenderUSD() {
  const usd = parseFloat(document.getElementById('sell-usd-amt').value);
  const err = document.getElementById('sell-error'); err.classList.remove('show');
  if (!usd || usd <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  if (usd > currentUser.balanceUSD) { err.textContent = 'Saldo USD insuficiente.'; err.classList.add('show'); return; }
  const ars = usd * localConfig.tcCompra;
  const txId = (currentUser.txCounter || 200) + 1;
  await db.collection('users').doc(currentUser.id).update({
    balance: currentUser.balance + ars,
    balanceUSD: currentUser.balanceUSD - usd,
    txCounter: txId,
    transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Venta de ' + fmtUSD(usd) + ' al TC ' + fmtTC(localConfig.tcCompra), amount: ars, date: todayStr() }),
    txUSD: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Venta de divisas al TC ' + fmtTC(localConfig.tcCompra) + '/USD', amount: usd, date: todayStr() }),
  });
  closeModal('vender-usd');
  document.getElementById('sell-usd-amt').value = '';
  document.getElementById('sell-sim').style.display = 'none';
  showNotif('✓ Vendiste ' + fmtUSD(usd) + ' y recibiste ' + fmtARS(ars), 'info');
}
 
async function doTransferUSD() {
  const dest = document.getElementById('tf-usd-dest').value.trim().toLowerCase();
  const usd = parseFloat(document.getElementById('tf-usd-amt').value);
  const err = document.getElementById('tf-usd-error'); err.classList.remove('show');
  if (!dest) { err.textContent = 'Ingresá el usuario destinatario.'; err.classList.add('show'); return; }
  if (dest === currentUser.id) { err.textContent = 'No podés transferirte a vos mismo.'; err.classList.add('show'); return; }
  if (!usd || usd <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  if (usd > currentUser.balanceUSD) { err.textContent = 'Saldo USD insuficiente.'; err.classList.add('show'); return; }
  const targetSnap = await db.collection('users').doc(dest).get();
  if (!targetSnap.exists) { err.textContent = 'Usuario "' + dest + '" no encontrado.'; err.classList.add('show'); return; }
  const target = targetSnap.data();
  if (!target.accountNumUSD) { err.textContent = target.name + ' no tiene cuenta en USD.'; err.classList.add('show'); return; }
  const txId = (currentUser.txCounter || 200) + 1;
  const d = todayStr();
  const batch = db.batch();
  batch.update(db.collection('users').doc(currentUser.id), {
    balanceUSD: currentUser.balanceUSD - usd, txCounter: txId,
    txUSD: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Transferencia USD a ' + target.name, amount: usd, date: d }),
  });
  batch.update(db.collection('users').doc(dest), {
    balanceUSD: target.balanceUSD + usd,
    txUSD: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Transferencia USD de ' + currentUser.name, amount: usd, date: d }),
  });
  await batch.commit();
  closeModal('transfer-usd');
  document.getElementById('tf-usd-dest').value = '';
  document.getElementById('tf-usd-amt').value = '';
  showNotif('✓ Transferiste ' + fmtUSD(usd) + ' a ' + target.name, 'info');
}
 
// ─── OPERACIONES ARS ─────────────────────────────────────────────
 
// ════════════════════════════════════════════════════════════════
//  MÓDULO DE GIRO EN DESCUBIERTO
// ════════════════════════════════════════════════════════════════
 
// Convierte string dd/mm/yyyy → Date
function parseDateStr(s) {
  const [d, m, y] = s.split('/');
  return new Date(+y, +m - 1, +d);
}
 
// Límite de descubierto del usuario (con fallback al default de $50.000)
function limiteDescubierto(user) {
  return user.limiteDescubierto != null ? user.limiteDescubierto : 50000;
}
 
// Saldo disponible real = balance + límite de descubierto
function saldoDisponibleDescubierto(user) {
  return (user.balance || 0) + limiteDescubierto(user);
}
 
// Calcula intereses acumulados de descubierto hasta hoy
// Se cobran solo si el saldo es negativo
function calcularInteresesDescubierto(user) {
  if (!user.descubierto || !user.descubierto.fechaInicio) return 0;
  if ((user.balance || 0) >= 0) return 0;
  const inicio = parseDateStr(user.descubierto.fechaInicio);
  const ahora = today();
  const dias = Math.max(0, Math.floor((ahora - inicio) / (1000 * 60 * 60 * 24)));
  const saldoNeg = Math.abs(user.balance);
  const tna = localConfig.tasaDescubierto / 100;
  return saldoNeg * tna * (dias / 365);
}
 
// Construye el objeto descubierto actualizado cuando el saldo pasa a negativo
function descubiertoInicio(user) {
  if (user.descubierto && user.descubierto.fechaInicio) return user.descubierto;
  return { fechaInicio: todayStr() };
}
 
// Genera las updates de Firestore al aplicar un crédito sobre cuenta en descubierto.
// Devuelve { nuevoBalance, txsExtra, descubiertoUpdate }
function procesarCobertura(user, montoCredito) {
  const balanceActual = user.balance || 0;
  // Solo aplica si estaba en descubierto
  if (balanceActual >= 0) return { nuevoBalance: balanceActual + montoCredito, txsExtra: [], descubiertoUpdate: null };
 
  const intereses = calcularInteresesDescubierto(user);
  const txsExtra = [];
  let restante = montoCredito;
  let nuevoBalance = balanceActual;
 
  // Cobrar intereses primero si hay fondos
  if (intereses > 0 && restante > 0) {
    const intCobrado = Math.min(intereses, restante);
    nuevoBalance -= intCobrado;
    restante -= intCobrado;
    txsExtra.push({
      id: Date.now(),
      type: 'debit',
      desc: 'Intereses por giro en descubierto (' + localConfig.tasaDescubierto + '% TNA)',
      amount: parseFloat(intCobrado.toFixed(2)),
      date: todayStr()
    });
  }
 
  // Aplicar el resto del crédito
  nuevoBalance += restante;
 
  // Si todavía queda en negativo, reiniciar fecha del descubierto
  let descubiertoUpdate = null;
  if (nuevoBalance < 0) {
    descubiertoUpdate = { fechaInicio: todayStr() };
  } else {
    descubiertoUpdate = null; // ya salió del descubierto
  }
 
  return { nuevoBalance: parseFloat(nuevoBalance.toFixed(2)), txsExtra, descubiertoUpdate };
}
 
async function doTransfer() {
  const dest = document.getElementById('tf-dest').value.trim().toLowerCase();
  const amount = parseFloat(document.getElementById('tf-amount').value);
  const err = document.getElementById('tf-error'); err.classList.remove('show');
  if (!dest) { err.textContent = 'Ingresá el usuario destinatario.'; err.classList.add('show'); return; }
  if (dest === currentUser.id) { err.textContent = 'No podés transferirte a vos mismo.'; err.classList.add('show'); return; }
  if (!amount || amount <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  // Verificar límite considerando descubierto
  const disponible = saldoDisponibleDescubierto(currentUser);
  if (amount > disponible) {
    err.textContent = 'Superás el límite disponible. Máximo a transferir: ' + fmtARS(disponible) + '.';
    err.classList.add('show'); return;
  }
  const targetSnap = await db.collection('users').doc(dest).get();
  if (!targetSnap.exists) { err.textContent = 'Usuario "' + dest + '" no encontrado.'; err.classList.add('show'); return; }
  const target = targetSnap.data();
  const txId = (currentUser.txCounter || 200) + 1;
  const d = todayStr();
  const nuevoBalance = parseFloat(((currentUser.balance || 0) - amount).toFixed(2));
  // Si el nuevo saldo es negativo, registrar inicio del descubierto
  const descubiertoUpdate = nuevoBalance < 0 ? descubiertoInicio(currentUser) : null;
  const updateData = {
    balance: nuevoBalance,
    txCounter: txId,
    transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Transferencia a ' + target.name, amount, date: d }),
  };
  if (descubiertoUpdate) updateData.descubierto = descubiertoUpdate;
  if (nuevoBalance >= 0) updateData.descubierto = null;
  const batch = db.batch();
  batch.update(db.collection('users').doc(currentUser.id), updateData);
  batch.update(db.collection('users').doc(dest), {
    balance: (target.balance || 0) + amount,
    transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Transferencia de ' + currentUser.name, amount, date: d }),
  });
  await batch.commit();
  closeModal('transfer');
  document.getElementById('tf-dest').value = '';
  document.getElementById('tf-amount').value = '';
  if (nuevoBalance < 0) showNotif('✓ Transferencia realizada. Saldo en descubierto: ' + fmtARS(nuevoBalance), 'warn');
  else showNotif('✓ Transferiste ' + fmtARS(amount) + ' a ' + target.name);
}
 
async function doDeposit() {
  const amount = parseFloat(document.getElementById('dep-amount').value);
  const err = document.getElementById('dep-error'); err.classList.remove('show');
  if (!amount || amount <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  const txId = (currentUser.txCounter || 200) + 1;
  const { nuevoBalance, txsExtra, descubiertoUpdate } = procesarCobertura(currentUser, amount);
  const txPrincipal = { id: txId, type: 'credit', desc: 'Depósito propio', amount, date: todayStr() };
  const todasTxs = [txPrincipal, ...txsExtra];
  const updateData = { balance: nuevoBalance, txCounter: txId };
  todasTxs.forEach(tx => {
    updateData.transactions = firebase.firestore.FieldValue.arrayUnion(tx);
  });
  if (descubiertoUpdate !== undefined) updateData.descubierto = descubiertoUpdate;
  await db.collection('users').doc(currentUser.id).update(updateData);
  closeModal('deposit');
  document.getElementById('dep-amount').value = '';
  if (txsExtra.length) showNotif('✓ Depósito realizado. Se cobraron intereses por descubierto: ' + fmtARS(txsExtra[0].amount), 'warn');
  else showNotif('✓ Depósito de ' + fmtARS(amount) + ' realizado');
}
 
// ─── PRÉSTAMOS ────────────────────────────────────────────────────
function simPrestamo() {
  const C = parseFloat(document.getElementById('pr-capital').value);
  const n = parseInt(document.getElementById('pr-plazo').value);
  const sim = document.getElementById('pr-sim');
  if (!C || !n || C <= 0 || n < 1 || n > 72) { sim.style.display = 'none'; return; }
  const i = localConfig.tasaPR / 100 / 12;
  const cuota = cuotaFrancesa(C, i, n);
  sim.style.display = '';
  document.getElementById('pr-sim-tna').textContent = localConfig.tasaPR + '% TNA';
  document.getElementById('pr-sim-cuota').textContent = fmtARS(cuota);
  document.getElementById('pr-sim-total').textContent = fmtARS(cuota * n);
  document.getElementById('pr-sim-fecha1').textContent = fmtDate(addMonths(today(), 1));
}
 
async function doSolicitarPrestamo() {
  const C = parseFloat(document.getElementById('pr-capital').value);
  const n = parseInt(document.getElementById('pr-plazo').value);
  const err = document.getElementById('pr-error'); err.classList.remove('show');
  if (!C || C <= 0) { err.textContent = 'Ingresá un capital válido.'; err.classList.add('show'); return; }
  if (!n || n < 1 || n > 72) { err.textContent = 'El plazo debe ser entre 1 y 72 meses.'; err.classList.add('show'); return; }
  const i = localConfig.tasaPR / 100 / 12;
  const cuota = cuotaFrancesa(C, i, n);
  const txId = (currentUser.txCounter || 200) + 1;
  const d = todayStr();
  const nuevoPrestamo = { id: txId, capital: C, cuotas: n, cuotaMensual: cuota, cuotasPagas: 0, tna: localConfig.tasaPR, fechaOrigen: d, proximaFecha: fmtDate(addMonths(today(), 1)), montoMora: 0 };
  await db.collection('users').doc(currentUser.id).update({
    balance: currentUser.balance + C, txCounter: txId,
    prestamos: firebase.firestore.FieldValue.arrayUnion(nuevoPrestamo),
    transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Préstamo acreditado – ' + n + ' cuotas de ' + fmtARS(cuota), amount: C, date: d }),
  });
  closeModal('new-prestamo');
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
    const badge = term ? '<span class="producto-badge badge-plazo">✓ Cancelado</span>'
      : mora ? '<span class="producto-badge badge-vencido">⚠ Mora</span>'
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
  const interes = M * (localConfig.tasaPF / 100) * (n / 12);
  sim.style.display = '';
  document.getElementById('pf-sim-tna').textContent = localConfig.tasaPF + '% TNA';
  document.getElementById('pf-sim-interes').textContent = fmtARS(interes);
  document.getElementById('pf-sim-total').textContent = fmtARS(M + interes);
  document.getElementById('pf-sim-fecha').textContent = fmtDate(addMonths(today(), n));
}
 
async function doConstitutirPlazo() {
  const M = parseFloat(document.getElementById('pf-monto').value);
  const n = parseInt(document.getElementById('pf-plazo').value);
  const err = document.getElementById('pf-error'); err.classList.remove('show');
  if (!M || M <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  if (!n || n < 1 || n > 12) { err.textContent = 'El plazo debe ser entre 1 y 12 meses.'; err.classList.add('show'); return; }
  if (M > currentUser.balance) { err.textContent = 'Saldo insuficiente.'; err.classList.add('show'); return; }
  const interes = M * (localConfig.tasaPF / 100) * (n / 12);
  const txId = (currentUser.txCounter || 200) + 1;
  const d = todayStr();
  const nuevoPlazo = { id: txId, capital: M, meses: n, tna: localConfig.tasaPF, interes, fechaInicio: d, fechaVenc: fmtDate(addMonths(today(), n)), acreditado: false };
  await db.collection('users').doc(currentUser.id).update({
    balance: currentUser.balance - M, txCounter: txId,
    plazos: firebase.firestore.FieldValue.arrayUnion(nuevoPlazo),
    transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Constitución plazo fijo – ' + n + ' meses al ' + localConfig.tasaPF + '% TNA', amount: M, date: d }),
  });
  closeModal('new-plazo');
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
    const badge = pf.acreditado ? '<span class="producto-badge badge-plazo">✓ Acreditado</span>' : '<span class="producto-badge badge-prestamo">En curso</span>';
    return `<div class="producto-item"><div class="prod-info">
      <div class="prod-title">Plazo Fijo ${fmtARS(pf.capital)} – ${pf.meses} meses ${badge}</div>
      <div class="prod-detail">Tasa: ${pf.tna}% TNA · Interés: ${fmtARS(pf.interes)} · Total: ${fmtARS(pf.capital + pf.interes)}</div>
      <div class="prod-detail">Inicio: ${pf.fechaInicio} · Vencimiento: ${pf.fechaVenc}</div>
    </div></div>`;
  }).join('');
}
 
// ─── ADMIN ────────────────────────────────────────────────────────
let allUsers = [];
 
async function renderAdmin() {
  const snap = await db.collection('users').get();
  allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAdminStats();
  renderAdminUsers();
}
 
function adminTab(tab) {
  const tabs = ['users', 'productos', 'divisas', 'transactions', 'config'];
  document.querySelectorAll('.nav-tab').forEach((t, i) => t.classList.toggle('active', tabs[i] === tab));
  tabs.forEach(t => document.getElementById('apanel-' + t).style.display = t === tab ? '' : 'none');
  if (tab === 'productos') renderAdminProductos();
  if (tab === 'divisas') renderAdminDivisas();
  if (tab === 'transactions') renderAdminTx();
  if (tab === 'config') loadConfigUI();
  if (tab === 'users') renderAdmin();
}
 
function renderAdminStats() {
  const total = allUsers.reduce((s, u) => s + (u.balance || 0), 0);
  const totalUSD = allUsers.reduce((s, u) => s + (u.accountNumUSD ? (u.balanceUSD || 0) : 0), 0);
  const totalPr = allUsers.reduce((s, u) => s + (u.prestamos || []).filter(p => p.cuotasPagas < p.cuotas).length, 0);
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value stat-accent">${allUsers.length}</div><div class="stat-label">USUARIOS</div></div>
    <div class="stat-card"><div class="stat-value">${fmtARS(total)}</div><div class="stat-label">SALDO TOTAL ARS</div></div>
    <div class="stat-card"><div class="stat-value stat-blue">${fmtUSD(totalUSD)}</div><div class="stat-label">SALDO TOTAL USD</div></div>
    <div class="stat-card"><div class="stat-value stat-accent">${totalPr}</div><div class="stat-label">PRÉSTAMOS ACTIVOS</div></div>`;
}
 
function renderAdminUsers() {
  document.getElementById('admin-users-body').innerHTML = allUsers.map(u => {
    const bal = u.balance || 0;
    const limite = u.limiteDescubierto != null ? u.limiteDescubierto : 50000;
    const enDesc = bal < 0;
    const balColor = enDesc ? 'color:var(--red)' : 'color:var(--green)';
    const descInfo = enDesc
      ? `<div style="font-size:10px;color:var(--red);margin-top:2px;">Descubierto · ${calcularInteresesDescubierto(u) > 0 ? 'Int. acum: ' + fmtARS(calcularInteresesDescubierto(u)) : 'sin intereses aún'}</div>`
      : '';
    return `<tr>
      <td><strong>${u.id}</strong></td>
      <td>${u.name}</td>
      <td><strong style="${balColor}">${fmtARS(bal)}</strong>${descInfo}</td>
      <td><div class="amount-input-row">
        <input type="number" id="adj-ars-${u.id}" placeholder="Monto" min="0"/>
        <button class="btn-sm btn-add" onclick="adminAdjustARS('${u.id}','add')">+ ARS</button>
        <button class="btn-sm btn-sub" onclick="adminAdjustARS('${u.id}','sub')">− ARS</button>
      </div></td>
      <td>
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Límite: ${fmtARS(limite)}</div>
        <div class="amount-input-row">
          <input type="number" id="adj-lim-${u.id}" placeholder="Nuevo límite" min="0"/>
          <button class="btn-sm btn-add" onclick="adminSetLimite('${u.id}')">Setear</button>
        </div>
      </td>
      <td>${u.accountNumUSD ? '<strong style="color:var(--blue)">' + fmtUSD(u.balanceUSD || 0) + '</strong>' : '<span style="color:var(--text3)">Sin cuenta</span>'}</td>
      <td>${u.accountNumUSD ? `<div class="amount-input-row">
        <input type="number" id="adj-usd-${u.id}" placeholder="Monto" min="0"/>
        <button class="btn-sm btn-add-blue" onclick="adminAdjustUSD('${u.id}','add')">+ USD</button>
        <button class="btn-sm btn-sub-blue" onclick="adminAdjustUSD('${u.id}','sub')">− USD</button>
      </div>` : '<span style="color:var(--text3);font-size:11px;">—</span>'}</td>
      <td><button class="btn-delete" onclick="askDelete('${u.id}')">Eliminar</button></td>
    </tr>`;
  }).join('');
}
 
async function adminSetLimite(uid) {
  const inp = document.getElementById('adj-lim-' + uid);
  const limite = parseFloat(inp.value);
  if (isNaN(limite) || limite < 0) { showNotif('Ingresá un límite válido (0 o más).', 'error'); return; }
  await db.collection('users').doc(uid).update({ limiteDescubierto: limite });
  inp.value = '';
  showNotif('✓ Límite de descubierto actualizado a ' + fmtARS(limite));
  await renderAdmin();
}
 
async function adminAdjustARS(uid, mode) {
  const inp = document.getElementById('adj-ars-' + uid);
  const amount = parseFloat(inp.value);
  if (!amount || amount <= 0) { showNotif('Ingresá un monto válido.', 'error'); return; }
  const snap = await db.collection('users').doc(uid).get();
  const u = snap.data();
  if (mode === 'add') {
    // Crédito: procesar cobertura de descubierto si aplica
    const { nuevoBalance, txsExtra, descubiertoUpdate } = procesarCobertura(u, amount);
    const txPrincipal = { id: Date.now(), type: 'credit', desc: 'Ajuste ARS por administrador (+)', amount, date: todayStr() };
    const updateData = { balance: nuevoBalance };
    [txPrincipal, ...txsExtra].forEach(tx => { updateData.transactions = firebase.firestore.FieldValue.arrayUnion(tx); });
    if (descubiertoUpdate !== undefined) updateData.descubierto = descubiertoUpdate;
    await db.collection('users').doc(uid).update(updateData);
    showNotif('✓ Se agregaron ' + fmtARS(amount) + ' a ' + u.name + (txsExtra.length ? ' (intereses cobrados)' : ''));
  } else {
    // Débito: verificar límite de descubierto
    const disponible = saldoDisponibleDescubierto(u);
    if (amount > disponible) { showNotif('Supera el límite de descubierto del usuario.', 'error'); return; }
    const nuevoBalance = parseFloat(((u.balance || 0) - amount).toFixed(2));
    const descubiertoUpdate = nuevoBalance < 0 ? (u.descubierto && u.descubierto.fechaInicio ? u.descubierto : { fechaInicio: todayStr() }) : null;
    const updateData = {
      balance: nuevoBalance,
      transactions: firebase.firestore.FieldValue.arrayUnion({ id: Date.now(), type: 'debit', desc: 'Ajuste ARS por administrador (−)', amount, date: todayStr() }),
    };
    if (descubiertoUpdate !== undefined) updateData.descubierto = descubiertoUpdate;
    await db.collection('users').doc(uid).update(updateData);
    showNotif('✓ Se quitaron ' + fmtARS(amount) + ' de ' + u.name + (nuevoBalance < 0 ? ' (en descubierto)' : ''));
  }
  inp.value = '';
  await renderAdmin();
}
 
async function adminAdjustUSD(uid, mode) {
  const inp = document.getElementById('adj-usd-' + uid);
  const amount = parseFloat(inp.value);
  if (!amount || amount <= 0) { showNotif('Ingresá un monto válido.', 'error'); return; }
  const snap = await db.collection('users').doc(uid).get();
  const u = snap.data();
  if (!u.accountNumUSD) { showNotif('El usuario no tiene cuenta USD.', 'error'); return; }
  if (mode === 'add') {
    await db.collection('users').doc(uid).update({
      balanceUSD: u.balanceUSD + amount,
      txUSD: firebase.firestore.FieldValue.arrayUnion({ id: Date.now(), type: 'credit', desc: 'Ajuste USD por administrador (+)', amount, date: todayStr() }),
    });
    showNotif('✓ Se agregaron ' + fmtUSD(amount) + ' a ' + u.name, 'info');
  } else {
    if (amount > u.balanceUSD) { showNotif('Saldo USD insuficiente.', 'error'); return; }
    await db.collection('users').doc(uid).update({
      balanceUSD: u.balanceUSD - amount,
      txUSD: firebase.firestore.FieldValue.arrayUnion({ id: Date.now(), type: 'debit', desc: 'Ajuste USD por administrador (−)', amount, date: todayStr() }),
    });
    showNotif('✓ Se quitaron ' + fmtUSD(amount) + ' de ' + u.name, 'info');
  }
  inp.value = '';
  await renderAdmin();
}
 
function renderAdminProductos() {
  const prs = [];
  allUsers.forEach(u => (u.prestamos || []).filter(p => p.cuotasPagas < p.cuotas).forEach(p => prs.push({ user: u, pr: p })));
  document.getElementById('admin-prestamos-body').innerHTML = prs.length
    ? prs.map(({ user, pr }) => `<tr>
        <td>${user.name}</td><td>${fmtARS(pr.capital)}</td><td>${fmtARS(pr.cuotaMensual)}</td>
        <td>${pr.cuotas - pr.cuotasPagas}/${pr.cuotas}</td><td>${pr.proximaFecha}</td>
        <td>${pr.montoMora > 0 ? '<span style="color:var(--red);font-weight:700">' + fmtARS(pr.montoMora) + '</span>' : '—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text3)">No hay préstamos activos</td></tr>';
 
  const pfs = [];
  allUsers.forEach(u => (u.plazos || []).filter(p => !p.acreditado).forEach(p => pfs.push({ user: u, pf: p })));
  document.getElementById('admin-plazos-body').innerHTML = pfs.length
    ? pfs.map(({ user, pf }) => `<tr>
        <td>${user.name}</td><td>${fmtARS(pf.capital)}</td><td>${pf.tna}% TNA</td>
        <td>${fmtARS(pf.interes)}</td><td>${pf.fechaVenc}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text3)">No hay plazos fijos activos</td></tr>';
}
 
function renderAdminDivisas() {
  document.getElementById('admin-divisas-body').innerHTML = allUsers.map(u => `
    <tr>
      <td><strong>${u.id}</strong></td><td>${u.name}</td>
      <td>${u.accountNumUSD || '<span style="color:var(--text3)">No abierta</span>'}</td>
      <td>${u.accountNumUSD ? '<strong style="color:var(--blue)">' + fmtUSD(u.balanceUSD || 0) + '</strong>' : '—'}</td>
      <td>${u.accountNumUSD ? fmtARS((u.balanceUSD || 0) * localConfig.tcCompra) : '—'}</td>
    </tr>`).join('');
}
 
function renderAdminTx() {
  const el = document.getElementById('admin-tx-list');
  const allTx = [];
  allUsers.forEach(u => {
    (u.transactions || []).forEach(tx => allTx.push({ ...tx, userName: u.name, userId: u.id }));
  });
  allTx.sort((a, b) => b.id - a.id);
  if (!allTx.length) { el.innerHTML = '<div class="empty-state">No hay transacciones.</div>'; return; }
  el.innerHTML = allTx.slice(0, 50).map(tx => `
    <div class="admin-tx-item">
      <div>
        <div style="font-size:13px;color:var(--text);font-weight:600">${tx.userName}: ${tx.desc}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${tx.date} · ID #${tx.id}</div>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--navy)">${tx.type === 'credit' ? '+ ' : '− '}${fmtARS(tx.amount)}</div>
    </div>`).join('');
}
 
function loadConfigUI() {
  document.getElementById('cfg-tasa-pf').value = localConfig.tasaPF;
  document.getElementById('cfg-tasa-pr').value = localConfig.tasaPR;
  document.getElementById('cfg-tasa-mora').value = localConfig.tasaMora;
  document.getElementById('cfg-tasa-desc').value = localConfig.tasaDescubierto || 50;
  document.getElementById('cfg-tc-compra').value = localConfig.tcCompra;
  document.getElementById('cfg-tc-venta').value = localConfig.tcVenta;
}
 
async function saveConfig() {
  const pf   = parseFloat(document.getElementById('cfg-tasa-pf').value);
  const pr   = parseFloat(document.getElementById('cfg-tasa-pr').value);
  const mora = parseFloat(document.getElementById('cfg-tasa-mora').value);
  const desc = parseFloat(document.getElementById('cfg-tasa-desc').value);
  const tcc  = parseFloat(document.getElementById('cfg-tc-compra').value);
  const tcv  = parseFloat(document.getElementById('cfg-tc-venta').value);
  if ([pf, pr, mora, desc, tcc, tcv].some(v => isNaN(v) || v < 0)) { showNotif('Verificá que todos los valores sean válidos.', 'error'); return; }
  if (tcc >= tcv) { showNotif('El TC comprador debe ser menor al TC vendedor.', 'error'); return; }
  const newConfig = { tasaPF: pf, tasaPR: pr, tasaMora: mora, tasaDescubierto: desc, tcCompra: tcc, tcVenta: tcv };
  await db.collection('config').doc('global').set(newConfig);
  localConfig = newConfig;
  updateFXLabels();
  showNotif('✓ Configuración guardada en la nube.');
}
 
// ─── ELIMINAR USUARIO ─────────────────────────────────────────────
let pendingDeleteId = null;
function askDelete(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  pendingDeleteId = uid;
  document.getElementById('confirm-desc').innerHTML =
    `Estás por eliminar la cuenta de <strong>${u.name}</strong> (@${uid}).<br>Esta acción no se puede deshacer.`;
  openModal('confirm-delete');
}
async function confirmDelete() {
  if (!pendingDeleteId) return;
  await db.collection('users').doc(pendingDeleteId).delete();
  pendingDeleteId = null;
  closeModal('confirm-delete');
  await renderAdmin();
  showNotif('Usuario eliminado correctamente.');
}
 
// ─── CIERRE DE MODALES ────────────────────────────────────────────
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });
});
 
// ─── ARRANQUE ─────────────────────────────────────────────────────
init();
