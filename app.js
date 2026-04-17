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
  if (typeof actualizarSelectoresCuenta === 'function') actualizarSelectoresCuenta();
  // Poblar lista de países en el modal de transferencia exterior
  if (id === 'new-transf-ext') {
    const sel = document.getElementById('txe-pais');
    if (sel && sel.options.length <= 1) {
      PAISES.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
    }
    // Ocultar opción USD si el usuario no tiene cuenta USD
    const optUSD = document.querySelector('#txe-cuenta option[value="usd"]');
    if (optUSD) optUSD.disabled = !currentUser.accountNumUSD;
  }
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
    const defaults = { tasaPF: 10, tasaPFUSD: 2, tasaPR: 15, tasaMora: 5, tasaDescubierto: 50, tasaCA: 4, tcCompra: 1370, tcVenta: 1400, topeDeposito: 1000000, saldoMaxARS: 50000000 };
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
  const txsCA = [...(data.txCajaAhorro || [])];
  const txsUSD = [...(data.txUSD || [])];
  const plazos = [...(data.plazos || [])];
  const plazosUSD = [...(data.plazosUSD || [])];
  const prestamos = [...(data.prestamos || [])];
  let balance = data.balance;
  let balanceCA = data.balanceCajaAhorro || 0;
  let balanceUSD = data.balanceUSD || 0;
  let txCounter = data.txCounter || 200;

  // Plazos fijos ARS vencidos — acreditar en la cuenta de origen
  plazos.forEach(pf => {
    if (!pf.acreditado && dateFromStr(pf.fechaVenc) <= now) {
      const total = pf.capital + pf.interes;
      pf.acreditado = true;
      changed = true;
      if (pf.cuentaOrigen === 'ca' && data.accountNumCajaAhorro) {
        balanceCA += total;
        txsCA.push({ id: ++txCounter, type: 'credit', desc: 'Vencimiento plazo fijo – capital + interés (Caja Ahorro)', amount: total, date: todayStr() });
      } else {
        balance += total;
        txs.push({ id: ++txCounter, type: 'credit', desc: 'Vencimiento plazo fijo – capital + interés', amount: total, date: todayStr() });
      }
    }
  });

  // Plazos fijos USD vencidos — acreditar en Caja de Ahorro USD
  if (data.accountNumUSD) {
    plazosUSD.forEach(pf => {
      if (!pf.acreditado && dateFromStr(pf.fechaVenc) <= now) {
        const total = pf.capital + pf.interes;
        pf.acreditado = true;
        changed = true;
        balanceUSD += total;
        txsUSD.push({ id: ++txCounter, type: 'credit', desc: 'Vencimiento plazo fijo USD – capital + interés (' + pf.tna + '% TNA)', amount: total, date: todayStr() });
      }
    });
  }

  // Cuotas de préstamos vencidas — debitar de la cuenta de origen
  prestamos.forEach(pr => {
    if (pr.cuotasPagas < pr.cuotas) {
      const fechaCuota = dateFromStr(pr.proximaFecha);
      if (fechaCuota <= now) {
        const cuotaAdeudada = pr.cuotaMensual + (pr.montoMora || 0);
        const usaCA = pr.cuentaOrigen === 'ca' && data.accountNumCajaAhorro;
        const saldoDisponible = usaCA ? balanceCA : balance;
        if (saldoDisponible >= cuotaAdeudada) {
          if (usaCA) {
            balanceCA -= cuotaAdeudada;
            txsCA.push({ id: ++txCounter, type: 'debit', desc: `Cuota préstamo ${pr.cuotasPagas + 1}/${pr.cuotas} (Caja Ahorro)`, amount: cuotaAdeudada, date: todayStr() });
          } else {
            balance -= cuotaAdeudada;
            txs.push({ id: ++txCounter, type: 'debit', desc: `Cuota préstamo ${pr.cuotasPagas}/${pr.cuotas}`, amount: cuotaAdeudada, date: todayStr() });
          }
          pr.cuotasPagas++;
          pr.montoMora = 0;
          pr.proximaFecha = fmtDate(addMonths(fechaCuota, 1));
          changed = true;
        } else {
          // Saldo insuficiente: aplicar mora sobre balance general (CC) como fallback
          const mora = pr.cuotaMensual * (pr.cuotas - pr.cuotasPagas) * (localConfig.tasaMora / 100);
          pr.montoMora = (pr.montoMora || 0) + mora;
          changed = true;
          txs.push({ id: ++txCounter, type: 'debit', desc: `Mora – saldo insuficiente (cuota ${pr.cuotasPagas + 1})`, amount: mora, date: todayStr() });
        }
      }
    }
  });
 
  // Cheques recibidos vencidos — expirar si pasaron 30 días sin depositar
  const chequesRecibidos = [...(data.chequesRecibidos || [])];
  chequesRecibidos.forEach(ch => {
    if (ch.estado === 'pendiente') {
      const emision = dateFromStr(ch.fechaEmision);
      const diasTranscurridos = Math.floor((now - emision) / 86400000);
      if (diasTranscurridos > 30) {
        ch.estado = 'vencido';
        changed = true;
      }
    }
  });
  if (chequesRecibidos.some((ch, i) => ch.estado !== (data.chequesRecibidos || [])[i]?.estado)) {
    changed = true;
  }
  if (data.accountNumCajaAhorro) {
    const hoy = now;
    const esdia1 = hoy.getDate() === 1;
    const mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
    const ultimaAcreditacion = data.ultimaAcreditacionCA || '';
    if (esdia1 && ultimaAcreditacion !== mesActual && (data.interesesCAacumulados || 0) > 0) {
      const intCA = parseFloat((data.interesesCAacumulados || 0).toFixed(2));
      balanceCA += intCA;
      changed = true;
      txsCA.push({ id: ++txCounter, type: 'credit', desc: 'Intereses caja de ahorro – ' + (localConfig.tasaCA || 4) + '% TNA', amount: intCA, date: todayStr() });
    }
    // Acumular interés diario (silencioso, no genera transacción)
    const ultimoCalculo = data.ultimoCalculoCA || '';
    const hoyStr = todayStr();
    if (ultimoCalculo !== hoyStr && balanceCA > 0) {
      const intDiario = parseFloat((balanceCA * ((localConfig.tasaCA || 4) / 100) / 365).toFixed(6));
      const nuevosAcumulados = parseFloat(((data.interesesCAacumulados || 0) + intDiario).toFixed(6));
      changed = true;
      data._nuevosInteresesCA = nuevosAcumulados;
      data._hoyStr = hoyStr;
    }
  }

  if (changed) {
    const upd = { balance, plazos, prestamos, transactions: txs, txCounter, chequesRecibidos };
    if (data.accountNumCajaAhorro) {
      upd.balanceCajaAhorro = balanceCA;
      upd.txCajaAhorro = txsCA;
      upd.ultimoCalculoCA = data._hoyStr || todayStr();
      if (data._nuevosInteresesCA !== undefined) upd.interesesCAacumulados = data._nuevosInteresesCA;
      const hoy = now;
      const esdia1 = hoy.getDate() === 1;
      const mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
      if (esdia1 && (data.ultimaAcreditacionCA || '') !== mesActual && (data.interesesCAacumulados || 0) > 0) {
        upd.interesesCAacumulados = 0;
        upd.ultimaAcreditacionCA = mesActual;
      }
    }
    if (data.accountNumUSD) {
      upd.balanceUSD = balanceUSD;
      upd.txUSD = txsUSD;
      upd.plazosUSD = plazosUSD;
    }
    await db.collection('users').doc(currentUser.id).update(upd);
  }
}
 
// ─── DASHBOARD ────────────────────────────────────────────────────
function userTab(tab) {
  document.querySelectorAll('.user-nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  ['home','divisas','prestamos','plazos','inversiones','historial','cheques','transferencias-ext'].forEach(t => {
    document.getElementById('utab-' + t).style.display = t === tab ? '' : 'none';
  });
  if (tab === 'divisas')            renderDivisasTab();
  if (tab === 'prestamos')          renderPrestamosUser();
  if (tab === 'plazos')             renderPlazosUser();
  if (tab === 'inversiones')        renderInversiones();
  if (tab === 'historial')          renderHistorial();
  if (tab === 'cheques')            renderChequesUser();
  if (tab === 'transferencias-ext') renderTransferenciasExt();
}
 

// ════════════════════════════════════════════════════════════════
//  MÓDULO SLIDER DE CUENTAS
// ════════════════════════════════════════════════════════════════

let _sliderIndex = 0;
let _sliderSlides = [];

function initSlider() {
  _sliderSlides = [];
  if (currentUser.accountNumCajaAhorro) _sliderSlides.push('ca');
  _sliderSlides.push('cc');
  if (currentUser.accountNumUSD) _sliderSlides.push('usd');

  ['ca','cc','usd'].forEach(id => {
    const el = document.getElementById('slide-' + id);
    if (el) el.style.display = 'none';
  });
  _sliderSlides.forEach(id => {
    const el = document.getElementById('slide-' + id);
    if (el) el.style.display = '';
  });

  if (_sliderIndex >= _sliderSlides.length) _sliderIndex = 0;

  const dotsEl = document.getElementById('slider-dots');
  if (dotsEl) {
    dotsEl.innerHTML = _sliderSlides.map((id, i) =>
      `<div class="slider-dot ${i === _sliderIndex ? 'active' : ''}" onclick="goToSlide(${i})"></div>`
    ).join('');
  }

  renderSlider();
}

function renderSlider() {
  const activeId = _sliderSlides[_sliderIndex];

  _sliderSlides.forEach((id, i) => {
    const el = document.getElementById('slide-' + id);
    if (el) el.style.display = i === _sliderIndex ? '' : 'none';
  });

  document.querySelectorAll('.slider-dot').forEach((d, i) => {
    d.classList.toggle('active', i === _sliderIndex);
  });

  const prev = document.getElementById('slider-prev');
  const next = document.getElementById('slider-next');
  if (prev) prev.disabled = _sliderIndex === 0;
  if (next) next.disabled = _sliderIndex === _sliderSlides.length - 1;

  const opCC  = document.getElementById('ops-cc-home');
  const opCA  = document.getElementById('ca-actions-home');
  const opUSD = document.getElementById('ops-usd-home');

  if (opCC)  opCC.style.display  = activeId === 'cc'  ? '' : 'none';
  if (opCA)  opCA.style.display  = activeId === 'ca'  ? '' : 'none';
  if (opUSD) opUSD.style.display = activeId === 'usd' ? '' : 'none';
}

function sliderNav(dir) {
  const newIdx = _sliderIndex + dir;
  if (newIdx < 0 || newIdx >= _sliderSlides.length) return;
  _sliderIndex = newIdx;
  renderSlider();
}

function goToSlide(idx) {
  if (idx < 0 || idx >= _sliderSlides.length) return;
  _sliderIndex = idx;
  renderSlider();
}

function renderDashboard() {
  if (!currentUser) return;
  document.getElementById('topbar-avatar').textContent = currentUser.name[0].toUpperCase();
  document.getElementById('topbar-uname').textContent = currentUser.name;
  const _bal = currentUser.balance || 0;
  const _balEl = document.getElementById('dash-balance-ars');
  _balEl.textContent = fmtARS(_bal);
  _balEl.style.color = _bal < 0 ? '#ef5350' : '#ffffff';
  const _descEl = document.getElementById('dash-descubierto-info');
  if (_descEl) {
    if (_bal < 0) {
      const _lim = (currentUser.limiteDescubierto != null) ? currentUser.limiteDescubierto : 50000;
      const _tna = (localConfig.tasaDescubierto || 50) / 100;
      const _int = currentUser.descubierto && currentUser.descubierto.fechaInicio
        ? (function() {
            const parts = currentUser.descubierto.fechaInicio.split('/');
            const dias = Math.max(0, Math.floor((new Date() - new Date(+parts[2], +parts[1]-1, +parts[0])) / 86400000));
            return Math.abs(_bal) * _tna * (dias / 365);
          })() : 0;
      _descEl.style.display = '';
      _descEl.innerHTML = 'Giro en descubierto · Disponible: ' + fmtARS(Math.max(0, _lim + _bal)) + ' · Int. acumulados: ' + fmtARS(_int);
    } else {
      _descEl.style.display = 'none';
    }
  }
  document.getElementById('dash-accnum').textContent = currentUser.accountNum;
  syncCADisplay();
  syncUSDDisplay();
  initSlider();
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
  // usd-actions-home lo controla el slider; solo actualizamos el banner de apertura
  document.getElementById('usd-closed-home').style.display = hasUSD ? 'none' : '';
}
 
function buildTxRow(tx, fmtFn, cuentaLabel) {
  const cls = tx.type === 'credit' ? 'credit' : 'debit';
  const icon = tx.type === 'credit' ? '↙' : '↗';
  const label = cuentaLabel ? `<span style="font-size:10px;color:var(--text3);font-weight:700;margin-left:6px;background:var(--gray2);padding:1px 6px;border-radius:8px;">${cuentaLabel}</span>` : '';
  return `<div class="tx-item">
    <div class="tx-left"><div class="tx-icon ${cls}">${icon}</div>
    <div><div class="tx-desc">${tx.desc}${label}</div><div class="tx-date">${tx.date}</div></div></div>
    <div class="tx-amount ${cls}">${tx.type === 'credit' ? '+ ' : '− '}${fmtFn(tx.amount)}</div>
  </div>`;
}

function renderTxList() {
  const el = document.getElementById('tx-list');
  // Mezclar últimos movimientos de CC y CA con etiqueta de cuenta
  const txsCC = (currentUser.transactions || []).map(tx => ({ ...tx, _cuenta: 'Cta. Cte.' }));
  const txsCA = (currentUser.txCajaAhorro || []).map(tx => ({ ...tx, _cuenta: 'Caja Ahorro' }));
  const todos = [...txsCC, ...txsCA].sort((a, b) => b.id - a.id);
  if (!todos.length) { el.innerHTML = '<div class="empty-state">No hay movimientos aún.</div>'; return; }
  el.innerHTML = todos.slice(0, 5).map(tx => buildTxRow(tx, fmtARS, tx._cuenta)).join('');
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

// Abre el modal de compra USD preseleccionando la cuenta de débito.
// Llamado desde los botones de CC y CA en el inicio.
// Los botones de OPERACIONES USD siguen usando openModal directamente (sin preselección).
function abrirComprarUSD(cuentaOrigen) {
  openModal('comprar-usd');
  const sel = document.getElementById('buy-usd-cuenta');
  if (sel) sel.value = cuentaOrigen;
}

async function doComprarUSD() {
  const usd = parseFloat(document.getElementById('buy-usd-amt').value);
  const err = document.getElementById('buy-error'); err.classList.remove('show');
  if (!currentUser.accountNumUSD) { err.textContent = 'Primero abrí tu cuenta en USD.'; err.classList.add('show'); return; }
  if (!usd || usd <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  const ars = usd * localConfig.tcVenta;
  const cuentaOrigen = getCuentaElegida('buy-usd-cuenta');
  const balOrigen = cuentaOrigen === 'ca' ? (currentUser.balanceCajaAhorro || 0) : (currentUser.balance || 0);
  if (ars > balOrigen) { err.textContent = 'Saldo insuficiente en ' + (cuentaOrigen === 'ca' ? 'caja de ahorro' : 'cuenta corriente') + ' (necesitás ' + fmtARS(ars) + ').'; err.classList.add('show'); return; }
  const _saldoMaxUSD = (localConfig.saldoMaxARS || 50000000) / (localConfig.tcVenta || 1400);
  const _balUSD = currentUser.balanceUSD || 0;
  if (_balUSD + usd > _saldoMaxUSD) { err.textContent = 'Superás el saldo máximo en USD (' + fmtUSD(_saldoMaxUSD) + '). Podés comprar hasta ' + fmtUSD(Math.max(0, _saldoMaxUSD - _balUSD)) + '.'; err.classList.add('show'); return; }
  const txId = (currentUser.txCounter || 200) + 1;
  const cuentaLabelBuy = cuentaOrigen === 'ca' ? ' (desde Caja Ahorro)' : '';
  const updBuy = { balanceUSD: (currentUser.balanceUSD || 0) + usd, txCounter: txId,
    txUSD: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Compra de divisas al TC ' + fmtTC(localConfig.tcVenta) + '/USD', amount: usd, date: todayStr() }) };
  if (cuentaOrigen === 'ca') {
    updBuy.balanceCajaAhorro = (currentUser.balanceCajaAhorro || 0) - ars;
    updBuy.txCajaAhorro = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Compra de ' + fmtUSD(usd) + ' al TC ' + fmtTC(localConfig.tcVenta), amount: ars, date: todayStr() });
  } else {
    updBuy.balance = (currentUser.balance || 0) - ars;
    updBuy.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Compra de ' + fmtUSD(usd) + ' al TC ' + fmtTC(localConfig.tcVenta), amount: ars, date: todayStr() });
  }
  await db.collection('users').doc(currentUser.id).update(updBuy);
  closeModal('comprar-usd');
  document.getElementById('buy-usd-amt').value = '';
  document.getElementById('buy-sim').style.display = 'none';
  showNotif('✓ Compraste ' + fmtUSD(usd) + ' por ' + fmtARS(ars) + cuentaLabelBuy, 'info');
}
 
async function doVenderUSD() {
  const usd = parseFloat(document.getElementById('sell-usd-amt').value);
  const err = document.getElementById('sell-error'); err.classList.remove('show');
  if (!usd || usd <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  if (usd > currentUser.balanceUSD) { err.textContent = 'Saldo USD insuficiente.'; err.classList.add('show'); return; }
  const ars = usd * localConfig.tcCompra;
  const cuentaDestSell = getCuentaElegida('sell-usd-cuenta');
  const txId = (currentUser.txCounter || 200) + 1;
  const cuentaLabelSell = cuentaDestSell === 'ca' ? ' (a Caja Ahorro)' : '';
  const updSell = { balanceUSD: (currentUser.balanceUSD || 0) - usd, txCounter: txId,
    txUSD: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Venta de divisas al TC ' + fmtTC(localConfig.tcCompra) + '/USD', amount: usd, date: todayStr() }) };
  if (cuentaDestSell === 'ca') {
    updSell.balanceCajaAhorro = (currentUser.balanceCajaAhorro || 0) + ars;
    updSell.txCajaAhorro = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Venta de ' + fmtUSD(usd) + ' al TC ' + fmtTC(localConfig.tcCompra), amount: ars, date: todayStr() });
  } else {
    updSell.balance = (currentUser.balance || 0) + ars;
    updSell.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Venta de ' + fmtUSD(usd) + ' al TC ' + fmtTC(localConfig.tcCompra), amount: ars, date: todayStr() });
  }
  await db.collection('users').doc(currentUser.id).update(updSell);
  closeModal('vender-usd');
  document.getElementById('sell-usd-amt').value = '';
  document.getElementById('sell-sim').style.display = 'none';
  showNotif('✓ Vendiste ' + fmtUSD(usd) + ' y recibiste ' + fmtARS(ars) + cuentaLabelSell, 'info');
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
async function doTransfer() {
  const dest = document.getElementById('tf-dest').value.trim().toLowerCase();
  const amount = parseFloat(document.getElementById('tf-amount').value);
  const err = document.getElementById('tf-error'); err.classList.remove('show');
  if (!dest) { err.textContent = 'Ingresá el usuario destinatario.'; err.classList.add('show'); return; }
  if (dest === currentUser.id) { err.textContent = 'No podés transferirte a vos mismo.'; err.classList.add('show'); return; }
  if (!amount || amount <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  const _limDesc = (currentUser.limiteDescubierto != null) ? currentUser.limiteDescubierto : 50000;
  const _disponible = (currentUser.balance || 0) + _limDesc;
  if (amount > _disponible) {
    err.textContent = 'Superás el límite disponible. Máximo: ' + fmtARS(Math.max(0, _disponible)) + '.';
    err.classList.add('show'); return;
  }
  const targetSnap = await db.collection('users').doc(dest).get();
  if (!targetSnap.exists) { err.textContent = 'Usuario "' + dest + '" no encontrado.'; err.classList.add('show'); return; }
  const target = targetSnap.data();
  // Validar saldo máximo de la cuenta destino del receptor
  const _saldoMaxTf = localConfig.saldoMaxARS || 50000000;
  const cuentaDestTf = getCuentaElegida('tf-dest-cuenta');
  const _balDestTf = (cuentaDestTf === 'ca' && target.accountNumCajaAhorro)
    ? (target.balanceCajaAhorro || 0) : (target.balance || 0);
  const _cuentaNombreTf = (cuentaDestTf === 'ca' && target.accountNumCajaAhorro) ? 'caja de ahorro' : 'cuenta corriente';
  if (_balDestTf + amount > _saldoMaxTf) {
    const _disponibleDest = Math.max(0, _saldoMaxTf - _balDestTf);
    err.textContent = target.name + ' no puede recibir ese monto: su ' + _cuentaNombreTf + ' alcanzaría el saldo máximo. Máximo que puede recibir: ' + fmtARS(_disponibleDest) + '.';
    err.classList.add('show'); return;
  }
  const txId = (currentUser.txCounter || 200) + 1;
  const d = todayStr();
  const _nuevoBalTf = parseFloat(((currentUser.balance || 0) - amount).toFixed(2));
  const _tfUpdate = {
    balance: _nuevoBalTf, txCounter: txId,
    transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Transferencia a ' + target.name, amount, date: d }),
  };
  if (_nuevoBalTf < 0 && !(currentUser.descubierto && currentUser.descubierto.fechaInicio)) {
    _tfUpdate.descubierto = { fechaInicio: todayStr() };
  }
  if (_nuevoBalTf >= 0) _tfUpdate.descubierto = null;
  const batch = db.batch();
  batch.update(db.collection('users').doc(currentUser.id), _tfUpdate);
  const destUpdTf = {};
  if (cuentaDestTf === 'ca' && target.accountNumCajaAhorro) {
    destUpdTf.balanceCajaAhorro = (target.balanceCajaAhorro || 0) + amount;
    destUpdTf.txCajaAhorro = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Transferencia de ' + currentUser.name + ' (a tu Caja Ahorro)', amount, date: d });
  } else {
    destUpdTf.balance = (target.balance || 0) + amount;
    destUpdTf.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Transferencia de ' + currentUser.name, amount, date: d });
  }
  batch.update(db.collection('users').doc(dest), destUpdTf);
  await batch.commit();
  closeModal('transfer');
  document.getElementById('tf-dest').value = '';
  document.getElementById('tf-amount').value = '';
  if (_nuevoBalTf < 0) showNotif('✓ Transferencia realizada. Saldo en descubierto: ' + fmtARS(_nuevoBalTf), 'warn');
  else showNotif('✓ Transferiste ' + fmtARS(amount) + ' a ' + target.name + (cuentaDestTf === 'ca' ? ' (Caja Ahorro)' : ''));
}
 
async function doDeposit() {
  const amount = parseFloat(document.getElementById('dep-amount').value);
  const err = document.getElementById('dep-error'); err.classList.remove('show');
  if (!amount || amount <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  const _topeD = localConfig.topeDeposito || 1000000;
  const _saldoMax = localConfig.saldoMaxARS || 50000000;
  if (amount > _topeD) { err.textContent = 'El monto máximo por depósito es ' + fmtARS(_topeD) + '.'; err.classList.add('show'); return; }
  const _balCC = currentUser.balance || 0;
  if (_balCC >= _saldoMax) { err.textContent = 'Tu cuenta corriente alcanzó el saldo máximo permitido (' + fmtARS(_saldoMax) + ').'; err.classList.add('show'); return; }
  if (_balCC + amount > _saldoMax) { err.textContent = 'Este depósito supera el saldo máximo (' + fmtARS(_saldoMax) + '). Podés depositar hasta ' + fmtARS(_saldoMax - _balCC) + '.'; err.classList.add('show'); return; }
  const txId = (currentUser.txCounter || 200) + 1;
  const _balAntes = currentUser.balance || 0;
  // Calcular intereses si venía en descubierto
  let _intereses = 0;
  if (_balAntes < 0 && currentUser.descubierto && currentUser.descubierto.fechaInicio) {
    const _parts = currentUser.descubierto.fechaInicio.split('/');
    const _dias = Math.max(0, Math.floor((new Date() - new Date(+_parts[2], +_parts[1]-1, +_parts[0])) / 86400000));
    _intereses = parseFloat((Math.abs(_balAntes) * ((localConfig.tasaDescubierto || 50) / 100) * (_dias / 365)).toFixed(2));
  }
  // El crédito primero cubre intereses, luego el saldo negativo
  const _intCobrado = Math.min(_intereses, Math.max(0, amount));
  const _nuevoBalDep = parseFloat((_balAntes - _intCobrado + amount).toFixed(2));
  const _depUpdate = { balance: _nuevoBalDep, txCounter: txId };
  // Tx principal
  _depUpdate.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Depósito propio', amount, date: todayStr() });
  // Tx de intereses cobrados (si aplica)
  if (_intCobrado > 0) {
    _depUpdate.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Intereses por giro en descubierto (' + (localConfig.tasaDescubierto || 50) + '% TNA)', amount: _intCobrado, date: todayStr() });
  }
  // Actualizar estado del descubierto
  if (_nuevoBalDep >= 0) { _depUpdate.descubierto = null; }
  else if (_intCobrado > 0) { _depUpdate.descubierto = { fechaInicio: todayStr() }; } // reiniciar contador
  await db.collection('users').doc(currentUser.id).update(_depUpdate);
  closeModal('deposit');
  document.getElementById('dep-amount').value = '';
  if (_intCobrado > 0) showNotif('✓ Depósito realizado. Intereses cobrados: ' + fmtARS(_intCobrado), 'warn');
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
  const cuentaDestPr = getCuentaElegida('pr-cuenta');
  const nuevoPrestamo = { id: txId, capital: C, cuotas: n, cuotaMensual: cuota, cuotasPagas: 0, tna: localConfig.tasaPR, fechaOrigen: d, proximaFecha: fmtDate(addMonths(today(), 1)), montoMora: 0, cuentaOrigen: cuentaDestPr };
  const cuentaLabelPr = cuentaDestPr === 'ca' ? ' (a Caja Ahorro)' : '';
  const updPr = { txCounter: txId, prestamos: firebase.firestore.FieldValue.arrayUnion(nuevoPrestamo) };
  if (cuentaDestPr === 'ca') {
    updPr.balanceCajaAhorro = (currentUser.balanceCajaAhorro || 0) + C;
    updPr.txCajaAhorro = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Préstamo acreditado – ' + n + ' cuotas de ' + fmtARS(cuota), amount: C, date: d });
  } else {
    updPr.balance = (currentUser.balance || 0) + C;
    updPr.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Préstamo acreditado – ' + n + ' cuotas de ' + fmtARS(cuota), amount: C, date: d });
  }
  await db.collection('users').doc(currentUser.id).update(updPr);
  closeModal('new-prestamo');
  document.getElementById('pr-capital').value = '';
  document.getElementById('pr-plazo').value = '';
  document.getElementById('pr-sim').style.display = 'none';
  showNotif('✓ Préstamo de ' + fmtARS(C) + ' acreditado' + cuentaLabelPr);
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
 
// ─── PLAZOS FIJOS ARS ─────────────────────────────────────────────
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
  const cuentaOrigenPF = getCuentaElegida('pf-cuenta');
  const balOrigenPF = cuentaOrigenPF === 'ca' ? (currentUser.balanceCajaAhorro || 0) : (currentUser.balance || 0);
  if (M > balOrigenPF) { err.textContent = 'Saldo insuficiente en ' + (cuentaOrigenPF === 'ca' ? 'caja de ahorro' : 'cuenta corriente') + '.'; err.classList.add('show'); return; }
  const interes = M * (localConfig.tasaPF / 100) * (n / 12);
  const txId = (currentUser.txCounter || 200) + 1;
  const d = todayStr();
  const nuevoPlazo = { id: txId, capital: M, meses: n, tna: localConfig.tasaPF, interes, fechaInicio: d, fechaVenc: fmtDate(addMonths(today(), n)), acreditado: false, cuentaOrigen: cuentaOrigenPF };
  const cuentaLabelPF = cuentaOrigenPF === 'ca' ? ' (desde Caja Ahorro)' : '';
  const updPF = { txCounter: txId, plazos: firebase.firestore.FieldValue.arrayUnion(nuevoPlazo) };
  if (cuentaOrigenPF === 'ca') {
    updPF.balanceCajaAhorro = (currentUser.balanceCajaAhorro || 0) - M;
    updPF.txCajaAhorro = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Constitución plazo fijo – ' + n + ' meses al ' + localConfig.tasaPF + '% TNA', amount: M, date: d });
  } else {
    updPF.balance = (currentUser.balance || 0) - M;
    updPF.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Constitución plazo fijo – ' + n + ' meses al ' + localConfig.tasaPF + '% TNA', amount: M, date: d });
  }
  await db.collection('users').doc(currentUser.id).update(updPF);
  closeModal('new-plazo');
  document.getElementById('pf-monto').value = '';
  document.getElementById('pf-plazo').value = '';
  document.getElementById('pf-sim').style.display = 'none';
  showNotif('✓ Plazo fijo de ' + fmtARS(M) + ' constituido por ' + n + ' meses' + cuentaLabelPF);
}
 
function renderPlazosUser() {
  // ── Listado ARS ──
  const elARS = document.getElementById('plazos-list-ars');
  const pfs = currentUser.plazos || [];
  if (!pfs.length) {
    elARS.innerHTML = '<div class="empty-state">No tenés plazos fijos en ARS.</div>';
  } else {
    elARS.innerHTML = pfs.map(pf => {
      const badge = pf.acreditado ? '<span class="producto-badge badge-plazo">✓ Acreditado</span>' : '<span class="producto-badge badge-prestamo">En curso</span>';
      return `<div class="producto-item"><div class="prod-info">
        <div class="prod-title">Plazo Fijo ${fmtARS(pf.capital)} – ${pf.meses} meses ${badge}</div>
        <div class="prod-detail">Tasa: ${pf.tna}% TNA · Interés: ${fmtARS(pf.interes)} · Total: ${fmtARS(pf.capital + pf.interes)}</div>
        <div class="prod-detail">Inicio: ${pf.fechaInicio} · Vencimiento: ${pf.fechaVenc}</div>
      </div></div>`;
    }).join('');
  }
  // ── Listado USD ──
  const elUSD = document.getElementById('plazos-list-usd');
  const pfsUSD = currentUser.plazosUSD || [];
  if (!currentUser.accountNumUSD) {
    elUSD.innerHTML = '<div class="empty-state">Necesitás cuenta en USD para constituir plazos fijos en dólares.</div>';
  } else if (!pfsUSD.length) {
    elUSD.innerHTML = '<div class="empty-state">No tenés plazos fijos en USD.</div>';
  } else {
    elUSD.innerHTML = pfsUSD.map(pf => {
      const badge = pf.acreditado ? '<span class="producto-badge badge-plazo">✓ Acreditado</span>' : '<span class="producto-badge badge-prestamo">En curso</span>';
      return `<div class="producto-item"><div class="prod-info">
        <div class="prod-title">Plazo Fijo ${fmtUSD(pf.capital)} – ${pf.meses} meses ${badge}</div>
        <div class="prod-detail">Tasa: ${pf.tna}% TNA · Interés: ${fmtUSD(pf.interes)} · Total: ${fmtUSD(pf.capital + pf.interes)}</div>
        <div class="prod-detail">Inicio: ${pf.fechaInicio} · Vencimiento: ${pf.fechaVenc}</div>
      </div></div>`;
    }).join('');
  }
}

// ─── PLAZOS FIJOS USD ─────────────────────────────────────────────
function simPlazoUSD() {
  const M = parseFloat(document.getElementById('pf-usd-monto').value);
  const n = parseInt(document.getElementById('pf-usd-plazo').value);
  const sim = document.getElementById('pf-usd-sim');
  if (!M || !n || M <= 0 || n < 1 || n > 12) { sim.style.display = 'none'; return; }
  const tna = localConfig.tasaPFUSD || 2;
  const interes = M * (tna / 100) * (n / 12);
  sim.style.display = '';
  document.getElementById('pf-usd-sim-tna').textContent = tna + '% TNA';
  document.getElementById('pf-usd-sim-interes').textContent = fmtUSD(interes);
  document.getElementById('pf-usd-sim-total').textContent = fmtUSD(M + interes);
  document.getElementById('pf-usd-sim-fecha').textContent = fmtDate(addMonths(today(), n));
}

async function doConstituirPlazoUSD() {
  const M = parseFloat(document.getElementById('pf-usd-monto').value);
  const n = parseInt(document.getElementById('pf-usd-plazo').value);
  const err = document.getElementById('pf-usd-error'); err.classList.remove('show');
  if (!currentUser.accountNumUSD) { err.textContent = 'Necesitás cuenta en USD para esta operación.'; err.classList.add('show'); return; }
  if (!M || M <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  if (!n || n < 1 || n > 12) { err.textContent = 'El plazo debe ser entre 1 y 12 meses.'; err.classList.add('show'); return; }
  const balUSD = currentUser.balanceUSD || 0;
  if (M > balUSD) { err.textContent = 'Saldo USD insuficiente. Disponible: ' + fmtUSD(balUSD) + '.'; err.classList.add('show'); return; }
  const tna = localConfig.tasaPFUSD || 2;
  const interes = M * (tna / 100) * (n / 12);
  const txId = (currentUser.txCounter || 200) + 1;
  const d = todayStr();
  const nuevoPlazoUSD = { id: txId, capital: M, meses: n, tna, interes, fechaInicio: d, fechaVenc: fmtDate(addMonths(today(), n)), acreditado: false };
  await db.collection('users').doc(currentUser.id).update({
    balanceUSD: parseFloat((balUSD - M).toFixed(8)),
    txCounter: txId,
    plazosUSD: firebase.firestore.FieldValue.arrayUnion(nuevoPlazoUSD),
    txUSD: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Constitución plazo fijo USD – ' + n + ' meses al ' + tna + '% TNA', amount: M, date: d }),
  });
  closeModal('new-plazo-usd');
  document.getElementById('pf-usd-monto').value = '';
  document.getElementById('pf-usd-plazo').value = '';
  document.getElementById('pf-usd-sim').style.display = 'none';
  showNotif('✓ Plazo fijo de ' + fmtUSD(M) + ' constituido por ' + n + ' meses', 'info');
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
    const lim = u.limiteDescubierto != null ? u.limiteDescubierto : 50000;
    const enDesc = bal < 0;
    const balColor = enDesc ? 'color:#e53935' : 'color:var(--green)';
    const descExtra = enDesc ? `<div style="font-size:10px;color:#e53935;margin-top:2px;">En descubierto desde ${u.descubierto && u.descubierto.fechaInicio ? u.descubierto.fechaInicio : '—'}</div>` : '';
    return `<tr>
      <td><strong>${u.id}</strong></td>
      <td>${u.name}</td>
      <td><strong style="${balColor}">${fmtARS(bal)}</strong>${descExtra}</td>
      <td><div class="amount-input-row">
        <input type="number" id="adj-ars-${u.id}" placeholder="Monto" min="0"/>
        <button class="btn-sm btn-add" onclick="adminAdjustARS('${u.id}','add')">+ ARS</button>
        <button class="btn-sm btn-sub" onclick="adminAdjustARS('${u.id}','sub')">− ARS</button>
      </div></td>
      <td>
        <div style="font-size:11px;color:var(--text3);margin-bottom:3px;">Límite: <strong>${fmtARS(lim)}</strong></div>
        <div class="amount-input-row">
          <input type="number" id="adj-lim-${u.id}" placeholder="Nuevo límite" min="0"/>
          <button class="btn-sm btn-add" onclick="adminSetLimite('${u.id}')">Setear</button>
        </div>
      </td>
      <td>${u.accountNumCajaAhorro ? '<strong style="color:var(--green)">' + fmtARS(u.balanceCajaAhorro || 0) + '</strong>' : '<span style="color:var(--text3)">Sin cuenta</span>'}</td>
      <td>${u.accountNumCajaAhorro ? `<div class="amount-input-row">
        <input type="number" id="adj-ca-${u.id}" placeholder="Monto" min="0"/>
        <button class="btn-sm btn-add" onclick="adminAdjustCA('${u.id}','add')">+ CA</button>
        <button class="btn-sm btn-sub" onclick="adminAdjustCA('${u.id}','sub')">− CA</button>
      </div>` : '<span style="color:var(--text3);font-size:11px;">—</span>'}</td>
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
  const lim = parseFloat(inp.value);
  if (isNaN(lim) || lim < 0) { showNotif('Ingresá un límite válido (0 o más).', 'error'); return; }
  await db.collection('users').doc(uid).update({ limiteDescubierto: lim });
  inp.value = '';
  showNotif('✓ Límite de descubierto actualizado a ' + fmtARS(lim));
  await renderAdmin();
}
 
async function adminAdjustARS(uid, mode) {
  const inp = document.getElementById('adj-ars-' + uid);
  const amount = parseFloat(inp.value);
  if (!amount || amount <= 0) { showNotif('Ingresá un monto válido.', 'error'); return; }
  const snap = await db.collection('users').doc(uid).get();
  const u = snap.data();
  const _uBal = u.balance || 0;
  const _uLim = (u.limiteDescubierto != null) ? u.limiteDescubierto : 50000;
  if (mode === 'add') {
    // Calcular intereses si venía en descubierto
    let _int = 0;
    if (_uBal < 0 && u.descubierto && u.descubierto.fechaInicio) {
      const _p = u.descubierto.fechaInicio.split('/');
      const _dias = Math.max(0, Math.floor((new Date() - new Date(+_p[2], +_p[1]-1, +_p[0])) / 86400000));
      _int = parseFloat((Math.abs(_uBal) * ((localConfig.tasaDescubierto || 50) / 100) * (_dias / 365)).toFixed(2));
    }
    const _intCob = Math.min(_int, Math.max(0, amount));
    const _nuevoB = parseFloat((_uBal - _intCob + amount).toFixed(2));
    const _upd = { balance: _nuevoB };
    _upd.transactions = firebase.firestore.FieldValue.arrayUnion({ id: Date.now(), type: 'credit', desc: 'Ajuste ARS por administrador (+)', amount, date: todayStr() });
    if (_intCob > 0) _upd.transactions = firebase.firestore.FieldValue.arrayUnion({ id: Date.now()+1, type: 'debit', desc: 'Intereses por giro en descubierto (' + (localConfig.tasaDescubierto||50) + '% TNA)', amount: _intCob, date: todayStr() });
    if (_nuevoB >= 0) _upd.descubierto = null;
    else if (_intCob > 0) _upd.descubierto = { fechaInicio: todayStr() };
    await db.collection('users').doc(uid).update(_upd);
    showNotif('✓ Se agregaron ' + fmtARS(amount) + ' a ' + u.name + (_intCob > 0 ? '. Intereses cobrados: ' + fmtARS(_intCob) : ''));
  } else {
    // Débito: verificar límite de descubierto
    if (amount > _uBal + _uLim) { showNotif('Supera el límite de descubierto (' + fmtARS(_uLim) + ').', 'error'); return; }
    const _nuevoB = parseFloat((_uBal - amount).toFixed(2));
    const _upd = {
      balance: _nuevoB,
      transactions: firebase.firestore.FieldValue.arrayUnion({ id: Date.now(), type: 'debit', desc: 'Ajuste ARS por administrador (−)', amount, date: todayStr() }),
    };
    if (_nuevoB < 0 && !(u.descubierto && u.descubierto.fechaInicio)) _upd.descubierto = { fechaInicio: todayStr() };
    if (_nuevoB >= 0) _upd.descubierto = null;
    await db.collection('users').doc(uid).update(_upd);
    showNotif('✓ Se quitaron ' + fmtARS(amount) + ' de ' + u.name + (_nuevoB < 0 ? ' (en descubierto)' : ''));
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

  const pfsUSD = [];
  allUsers.forEach(u => (u.plazosUSD || []).filter(p => !p.acreditado).forEach(p => pfsUSD.push({ user: u, pf: p })));
  document.getElementById('admin-plazos-usd-body').innerHTML = pfsUSD.length
    ? pfsUSD.map(({ user, pf }) => `<tr>
        <td>${user.name}</td><td>${fmtUSD(pf.capital)}</td><td>${pf.tna}% TNA</td>
        <td>${fmtUSD(pf.interes)}</td><td>${pf.fechaVenc}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text3)">No hay plazos fijos USD activos</td></tr>';
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
  document.getElementById('cfg-tasa-pf-usd').value = localConfig.tasaPFUSD || 2;
  document.getElementById('cfg-tasa-pr').value = localConfig.tasaPR;
  document.getElementById('cfg-tasa-mora').value = localConfig.tasaMora;
  document.getElementById('cfg-tasa-desc').value = localConfig.tasaDescubierto || 50;
  document.getElementById('cfg-tasa-ca').value = localConfig.tasaCA || 4;
  document.getElementById('cfg-tc-compra').value = localConfig.tcCompra;
  document.getElementById('cfg-tc-venta').value = localConfig.tcVenta;
  document.getElementById('cfg-tope-dep').value = localConfig.topeDeposito || 1000000;
  document.getElementById('cfg-saldo-max').value = localConfig.saldoMaxARS || 50000000;
}
 
async function saveConfig() {
  const pf    = parseFloat(document.getElementById('cfg-tasa-pf').value);
  const pfusd = parseFloat(document.getElementById('cfg-tasa-pf-usd').value);
  const pr   = parseFloat(document.getElementById('cfg-tasa-pr').value);
  const mora = parseFloat(document.getElementById('cfg-tasa-mora').value);
  const desc = parseFloat(document.getElementById('cfg-tasa-desc').value);
  const ca   = parseFloat(document.getElementById('cfg-tasa-ca').value);
  const tcc     = parseFloat(document.getElementById('cfg-tc-compra').value);
  const tcv     = parseFloat(document.getElementById('cfg-tc-venta').value);
  const topeDep = parseFloat(document.getElementById('cfg-tope-dep').value);
  const saldoMax = parseFloat(document.getElementById('cfg-saldo-max').value);
  if ([pf, pfusd, pr, mora, desc, ca, tcc, tcv, topeDep, saldoMax].some(v => isNaN(v) || v < 0)) { showNotif('Verificá que todos los valores sean válidos.', 'error'); return; }
  if (tcc >= tcv) { showNotif('El TC comprador debe ser menor al TC vendedor.', 'error'); return; }
  if (topeDep > saldoMax) { showNotif('El tope por depósito no puede superar el saldo máximo.', 'error'); return; }
  const newConfig = { tasaPF: pf, tasaPFUSD: pfusd, tasaPR: pr, tasaMora: mora, tasaDescubierto: desc, tasaCA: ca, tcCompra: tcc, tcVenta: tcv, topeDeposito: topeDep, saldoMaxARS: saldoMax };
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
 
 
// ════════════════════════════════════════════════════════════════
//  MÓDULO DE INVERSIONES
// ════════════════════════════════════════════════════════════════
 
const PROXY = 'https://byma-proxy.gonzalob1993.workers.dev';
 
const ACCIONES_LIDERES = [
  { ticker: 'GGAL.BA',  nombre: 'Grupo Financiero Galicia' },
  { ticker: 'YPFD.BA',  nombre: 'YPF S.A.' },
  { ticker: 'PAMP.BA',  nombre: 'Pampa Energía' },
  { ticker: 'BMA.BA',   nombre: 'Banco Macro' },
  { ticker: 'BBAR.BA',  nombre: 'BBVA Argentina' },
  { ticker: 'TECO2.BA', nombre: 'Telecom Argentina' },
  { ticker: 'LOMA.BA',  nombre: 'Loma Negra' },
  { ticker: 'ALUA.BA',  nombre: 'Aluar Aluminio' },
  { ticker: 'TXAR.BA',  nombre: 'Ternium Argentina' },
  { ticker: 'CRES.BA',  nombre: 'Cresud' },
];
 
const CEDEARS_DESTACADOS = [
  { ticker: 'AAPL',  nombre: 'Apple Inc.' },
  { ticker: 'MSFT',  nombre: 'Microsoft Corp.' },
  { ticker: 'GOOGL', nombre: 'Alphabet (Google)' },
  { ticker: 'TSLA',  nombre: 'Tesla Inc.' },
  { ticker: 'AMZN',  nombre: 'Amazon.com Inc.' },
  { ticker: 'NVDA',  nombre: 'NVIDIA Corp.' },
];
 
let cotizaciones = {};
let pendingInvAccion = null;
 
// ─── CUENTA COMITENTE ─────────────────────────────────────────────
async function abrirCuentaComitente() {
  if (currentUser.accountNumComitente) return;
  const num = 'CC-' + String(Math.floor(Math.random() * 900000) + 100000);
  await db.collection('users').doc(currentUser.id).update({ accountNumComitente: num });
  showNotif('✓ Cuenta Comitente abierta: ' + num, 'success');
  renderInversiones();
}
 
// ─── FETCH COTIZACIÓN ─────────────────────────────────────────────
async function fetchCotizacion(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
  const proxyUrl = `${PROXY}/?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const result = data.chart.result[0];
  const meta = result.meta;
  const closes = result.indicators.quote[0].close.filter(Boolean);
  const lastPrice = closes.slice(-1)[0] || meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose || closes.slice(-2)[0] || lastPrice;
  const change = lastPrice - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  return {
    price: lastPrice, prevClose, change, changePct,
    name: meta.longName || meta.shortName || ticker,
    currency: meta.currency,
    volume: result.indicators.quote[0].volume?.slice(-1)[0] || 0,
    exchange: meta.exchangeName,
  };
}
 
// ─── RENDER LISTA DE COTIZACIONES ────────────────────────────────
async function cargarCotizaciones(lista, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = '<div class="loading-quotes">⏳ Cargando cotizaciones...</div>';
  const cards = [];
  for (const item of lista) {
    try {
      const q = await fetchCotizacion(item.ticker);
      cotizaciones[item.ticker] = q;
      cards.push(buildQuoteCard(item.ticker, q));
    } catch(e) {
      cards.push(`<div class="quote-card"><div class="quote-left"><div class="quote-ticker">${item.ticker.replace('.BA','')}</div><div class="quote-name">${item.nombre}</div></div><div style="font-size:12px;color:var(--text3)">Sin datos disponibles</div></div>`);
    }
  }
  el.innerHTML = cards.join('');
}
 
function buildQuoteCard(ticker, q) {
  const pos = q.changePct >= 0;
  const sign = pos ? '+' : '';
  const tenencia = (currentUser.inversiones || []).find(i => i.ticker === ticker);
  const nombreSeguro = (q.name || ticker).replace(/'/g, '&#39;');
  return `<div class="quote-card">
    <div class="quote-left">
      <div class="quote-ticker">${ticker.replace('.BA','')}</div>
      <div class="quote-name">${q.name}${q.exchange ? ' · ' + q.exchange : ''}</div>
      <div class="quote-vol">Vol: ${Number(q.volume).toLocaleString('es-AR')}</div>
    </div>
    <div class="quote-center">
      <div class="quote-price">${fmtARS(q.price)}</div>
      <div class="quote-change ${pos?'pos':'neg'}">${sign}${fmtARS(q.change)} (${sign}${q.changePct.toFixed(2)}%)</div>
      ${tenencia ? `<div style="font-size:10px;color:var(--blue);margin-top:2px;">Tenés ${tenencia.cantidad} acc.</div>` : ''}
    </div>
    <div class="quote-right">
      <button class="btn-comprar" onclick="abrirCompra('${ticker}','${nombreSeguro}')">Comprar</button>
      ${tenencia ? `<button class="btn-vender" onclick="abrirVenta('${ticker}','${nombreSeguro}')">Vender</button>` : ''}
    </div>
  </div>`;
}
 
// ─── BÚSQUEDA LIBRE (no toca la lista de líderes) ────────────────
async function buscarTicker() {
  let input = document.getElementById('inv-search-input').value.trim().toUpperCase();
  if (!input) return;
  // Si parece ticker local (sin punto, ≤6 chars), agrega .BA
  if (!input.includes('.') && input.length <= 6) input += '.BA';
 
  const resDiv = document.getElementById('inv-resultado');
  const resEl  = document.getElementById('quotes-resultado');
  resDiv.style.display = '';
  resEl.innerHTML = `<div class="loading-quotes">⏳ Buscando ${input}...</div>`;
 
  try {
    const q = await fetchCotizacion(input);
    cotizaciones[input] = q;
    resEl.innerHTML = buildQuoteCard(input, q);
  } catch(e) {
    resEl.innerHTML = `<div class="empty-state">No se encontró el ticker <strong>${input}</strong>. Verificá que sea correcto.</div>`;
  }
}
 
function limpiarBusqueda() {
  document.getElementById('inv-resultado').style.display = 'none';
  document.getElementById('inv-search-input').value = '';
}
 
// ─── SUB-TABS ─────────────────────────────────────────────────────
function invSubTab(tab) {
  document.querySelectorAll('.inv-tab').forEach((t, i) =>
    t.classList.toggle('active', ['mercado', 'portafolio'][i] === tab)
  );
  document.getElementById('inv-mercado').style.display   = tab === 'mercado'   ? '' : 'none';
  document.getElementById('inv-portafolio').style.display = tab === 'portafolio' ? '' : 'none';
  if (tab === 'portafolio') renderPortafolio();
}
 
// ─── RENDER PESTAÑA PRINCIPAL ─────────────────────────────────────
function renderInversiones() {
  const hasComitente = !!currentUser.accountNumComitente;
  document.getElementById('comitente-cerrado').style.display  = hasComitente ? 'none' : '';
  document.getElementById('comitente-abierto').style.display  = hasComitente ? '' : 'none';
  if (!hasComitente) return;
  invSubTab('mercado');
  cargarCotizaciones(ACCIONES_LIDERES, 'quotes-lideres');
  cargarCotizaciones(CEDEARS_DESTACADOS, 'quotes-cedears');
}
 
// ─── PORTAFOLIO ───────────────────────────────────────────────────
async function renderPortafolio() {
  const el = document.getElementById('port-list');
  const inversiones = currentUser.inversiones || [];
  if (!inversiones.length) {
    el.innerHTML = '<div class="empty-state">No tenés posiciones abiertas.</div>';
    return;
  }
  el.innerHTML = '<div class="loading-quotes">⏳ Actualizando precios...</div>';
  const cards = [];
  let totalActual = 0, totalCosto = 0;
  for (const inv of inversiones) {
    let precioActual = cotizaciones[inv.ticker]?.price;
    if (!precioActual) {
      try { const q = await fetchCotizacion(inv.ticker); cotizaciones[inv.ticker] = q; precioActual = q.price; }
      catch(e) { precioActual = inv.precioPromedio; }
    }
    const valorActual = precioActual * inv.cantidad;
    const costo = inv.precioPromedio * inv.cantidad;
    const pnl = valorActual - costo;
    const pnlPct = (pnl / costo) * 100;
    totalActual += valorActual; totalCosto += costo;
    const pos = pnl >= 0;
    const nombreSeguro = (inv.nombre||inv.ticker).replace(/'/g, '&#39;');
    cards.push(`<div class="port-card">
      <div class="port-left">
        <div class="port-ticker">${inv.ticker.replace('.BA','')} <span style="font-weight:400;font-size:11px;color:var(--text3)">× ${inv.cantidad} acc.</span></div>
        <div class="port-detail">P. promedio: ${fmtARS(inv.precioPromedio)} · Actual: ${fmtARS(precioActual)}</div>
      </div>
      <div class="port-right">
        <div class="port-valor">${fmtARS(valorActual)}</div>
        <div class="port-pnl ${pos?'pos':'neg'}">${pos?'+':''}${fmtARS(pnl)} (${pos?'+':''}${pnlPct.toFixed(2)}%)</div>
        <button class="btn-vender" style="margin-top:4px" onclick="abrirVenta('${inv.ticker}','${nombreSeguro}')">Vender</button>
      </div>
    </div>`);
  }
  const pnlTotal = totalActual - totalCosto;
  const pnlTotalPos = pnlTotal >= 0;
  el.innerHTML = `
    <div style="background:var(--navy);border-radius:12px;padding:1rem 1.25rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="font-size:10px;color:rgba(255,255,255,.5);letter-spacing:2px;font-weight:700;">VALOR TOTAL</div>
      <div style="font-size:24px;color:#fff;font-weight:700;">${fmtARS(totalActual)}</div></div>
      <div style="text-align:right;">
        <div style="font-size:13px;font-weight:700;color:${pnlTotalPos?'#81c784':'#e57373'};">${pnlTotalPos?'+':''}${fmtARS(pnlTotal)}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.4);">resultado total</div>
      </div>
    </div>${cards.join('')}`;
}
 
// ─── MODALES COMPRA / VENTA ───────────────────────────────────────
function abrirCompra(ticker, nombre) {
  pendingInvAccion = { ticker, nombre };
  const q = cotizaciones[ticker];
  document.getElementById('modal-comprar-title').textContent = 'Comprar ' + ticker.replace('.BA','');
  document.getElementById('modal-comprar-info').innerHTML =
    `<strong>${nombre}</strong><br>Precio actual: <strong>${q ? fmtARS(q.price) : '...'}</strong> · Saldo disponible: <strong>${fmtARS(currentUser.balance)}</strong>`;
  document.getElementById('comprar-qty').value = '';
  document.getElementById('comprar-sim').style.display = 'none';
  document.getElementById('comprar-error').classList.remove('show');
  openModal('comprar-accion');
}
 
function simCompraAccion() {
  const qty = parseInt(document.getElementById('comprar-qty').value);
  const sim = document.getElementById('comprar-sim');
  if (!qty || qty <= 0 || !pendingInvAccion) { sim.style.display = 'none'; return; }
  const q = cotizaciones[pendingInvAccion.ticker];
  if (!q) return;
  sim.style.display = '';
  document.getElementById('comprar-sim-precio').textContent = fmtARS(q.price);
  document.getElementById('comprar-sim-qty').textContent = qty + ' acciones';
  document.getElementById('comprar-sim-total').textContent = fmtARS(q.price * qty);
}
 
async function doComprarAccion() {
  const qty = parseInt(document.getElementById('comprar-qty').value);
  const err = document.getElementById('comprar-error'); err.classList.remove('show');
  if (!qty || qty <= 0) { err.textContent = 'Ingresá una cantidad válida.'; err.classList.add('show'); return; }
  const q = cotizaciones[pendingInvAccion.ticker];
  if (!q) { err.textContent = 'Sin precio disponible.'; err.classList.add('show'); return; }
  const total = q.price * qty;
  const cuentaOrigenAcc = getCuentaElegida('comprar-acc-cuenta');
  const balOrigenAcc = cuentaOrigenAcc === 'ca' ? (currentUser.balanceCajaAhorro || 0) : (currentUser.balance || 0);
  if (total > balOrigenAcc) { err.textContent = 'Saldo insuficiente en ' + (cuentaOrigenAcc === 'ca' ? 'caja de ahorro' : 'cuenta corriente') + ' (necesitás ' + fmtARS(total) + ').'; err.classList.add('show'); return; }
  const txId = (currentUser.txCounter || 200) + 1;
  let inversiones = [...(currentUser.inversiones || [])];
  const idx = inversiones.findIndex(i => i.ticker === pendingInvAccion.ticker);
  if (idx >= 0) {
    const prev = inversiones[idx];
    const nuevaCantidad = prev.cantidad + qty;
    inversiones[idx] = { ...prev, cantidad: nuevaCantidad, precioPromedio: ((prev.precioPromedio * prev.cantidad) + (q.price * qty)) / nuevaCantidad };
  } else {
    inversiones.push({ ticker: pendingInvAccion.ticker, nombre: pendingInvAccion.nombre, cantidad: qty, precioPromedio: q.price });
  }
  const cuentaLabelAcc = cuentaOrigenAcc === 'ca' ? ' (desde Caja Ahorro)' : '';
  const updAcc = { inversiones, txCounter: txId };
  if (cuentaOrigenAcc === 'ca') {
    updAcc.balanceCajaAhorro = (currentUser.balanceCajaAhorro || 0) - total;
    updAcc.txCajaAhorro = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: `Compra ${qty} acc. ${pendingInvAccion.ticker.replace('.BA','')} a ${fmtARS(q.price)}`, amount: total, date: todayStr() });
  } else {
    updAcc.balance = (currentUser.balance || 0) - total;
    updAcc.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: `Compra ${qty} acc. ${pendingInvAccion.ticker.replace('.BA','')} a ${fmtARS(q.price)}`, amount: total, date: todayStr() });
  }
  await db.collection('users').doc(currentUser.id).update(updAcc);
  closeModal('comprar-accion');
  showNotif(`✓ Compraste ${qty} acc. de ${pendingInvAccion.ticker.replace('.BA','')} por ${fmtARS(total)}${cuentaLabelAcc}`);
}
 
function abrirVenta(ticker, nombre) {
  pendingInvAccion = { ticker, nombre };
  const q = cotizaciones[ticker];
  const tenencia = (currentUser.inversiones || []).find(i => i.ticker === ticker);
  document.getElementById('modal-vender-title').textContent = 'Vender ' + ticker.replace('.BA','');
  document.getElementById('modal-vender-info').innerHTML =
    `<strong>${nombre}</strong><br>Precio actual: <strong>${q ? fmtARS(q.price) : '...'}</strong> · Tenés: <strong>${tenencia?.cantidad || 0} acciones</strong>`;
  document.getElementById('vender-qty').value = '';
  document.getElementById('vender-sim').style.display = 'none';
  document.getElementById('vender-error').classList.remove('show');
  openModal('vender-accion');
}
 
function simVentaAccion() {
  const qty = parseInt(document.getElementById('vender-qty').value);
  const sim = document.getElementById('vender-sim');
  if (!qty || qty <= 0 || !pendingInvAccion) { sim.style.display = 'none'; return; }
  const q = cotizaciones[pendingInvAccion.ticker];
  if (!q) return;
  sim.style.display = '';
  document.getElementById('vender-sim-precio').textContent = fmtARS(q.price);
  document.getElementById('vender-sim-qty').textContent = qty + ' acciones';
  document.getElementById('vender-sim-total').textContent = fmtARS(q.price * qty);
}
 
async function doVenderAccion() {
  const qty = parseInt(document.getElementById('vender-qty').value);
  const err = document.getElementById('vender-error'); err.classList.remove('show');
  if (!qty || qty <= 0) { err.textContent = 'Ingresá una cantidad válida.'; err.classList.add('show'); return; }
  const tenencia = (currentUser.inversiones || []).find(i => i.ticker === pendingInvAccion.ticker);
  if (!tenencia || qty > tenencia.cantidad) { err.textContent = `Solo tenés ${tenencia?.cantidad || 0} acciones.`; err.classList.add('show'); return; }
  const q = cotizaciones[pendingInvAccion.ticker];
  if (!q) { err.textContent = 'Sin precio disponible.'; err.classList.add('show'); return; }
  const total = q.price * qty;
  const txId = (currentUser.txCounter || 200) + 1;
  let inversiones = [...(currentUser.inversiones || [])];
  const idx = inversiones.findIndex(i => i.ticker === pendingInvAccion.ticker);
  if (tenencia.cantidad - qty <= 0) { inversiones.splice(idx, 1); }
  else { inversiones[idx] = { ...tenencia, cantidad: tenencia.cantidad - qty }; }
  const cuentaDestVenta = getCuentaElegida('vender-acc-cuenta');
  const cuentaLabelVenta = cuentaDestVenta === 'ca' ? ' (a Caja Ahorro)' : '';
  const updVenta = { inversiones, txCounter: txId };
  if (cuentaDestVenta === 'ca') {
    updVenta.balanceCajaAhorro = (currentUser.balanceCajaAhorro || 0) + total;
    updVenta.txCajaAhorro = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: `Venta ${qty} acc. ${pendingInvAccion.ticker.replace('.BA','')} a ${fmtARS(q.price)}`, amount: total, date: todayStr() });
  } else {
    updVenta.balance = (currentUser.balance || 0) + total;
    updVenta.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: `Venta ${qty} acc. ${pendingInvAccion.ticker.replace('.BA','')} a ${fmtARS(q.price)}`, amount: total, date: todayStr() });
  }
  await db.collection('users').doc(currentUser.id).update(updVenta);
  closeModal('vender-accion');
  showNotif(`✓ Vendiste ${qty} acc. de ${pendingInvAccion.ticker.replace('.BA','')} por ${fmtARS(total)}${cuentaLabelVenta}`);
}
 
// ─── HISTORIAL DE TRANSACCIONES ───────────────────────────────────
function renderHistorial() {
  const TRES_MESES = 90 * 24 * 60 * 60 * 1000;
  const ahora = new Date();
  function dentroDeVentana(str) {
    const [d,m,y] = str.split('/');
    return (ahora - new Date(+y,+m-1,+d)) <= TRES_MESES;
  }
  function renderLista(txs, elId, fmtFn) {
    const el = document.getElementById(elId);
    if (!el) return;
    const lista = [...txs].reverse().filter(t => dentroDeVentana(t.date));
    if (!lista.length) { el.innerHTML = '<div class="empty-state">No hay movimientos en los últimos 3 meses.</div>'; return; }
    el.innerHTML = lista.map(tx => buildTxRow(tx, fmtFn, null)).join('');
  }
  function renderListaConCuenta(txs, elId, fmtFn, cuentaLabel) {
    const el = document.getElementById(elId);
    if (!el) return;
    const lista = [...txs].reverse().filter(t => dentroDeVentana(t.date));
    if (!lista.length) { el.innerHTML = '<div class="empty-state">No hay movimientos en los últimos 3 meses.</div>'; return; }
    el.innerHTML = lista.map(tx => buildTxRow(tx, fmtFn, cuentaLabel)).join('');
  }
  renderListaConCuenta(currentUser.transactions || [], 'hist-ars-list', fmtARS, 'Cta. Cte.');
  renderListaConCuenta(currentUser.txCajaAhorro || [], 'hist-ca-list', fmtARS, 'Caja Ahorro');
  renderLista(currentUser.txUSD || [], 'hist-usd-list', fmtUSD);
}
 


// ─── HELPERS SELECCIÓN DE CUENTA ─────────────────────────────────

function actualizarSelectoresCuenta() {
  const hasCA = !!currentUser?.accountNumCajaAhorro;
  const grupos = [
    'buy-usd-cuenta-group','sell-usd-cuenta-group',
    'pr-cuenta-group','pf-cuenta-group',
    'comprar-acc-cuenta-group','vender-acc-cuenta-group',
    'tf-dest-cuenta-group','tf-ca-dest-cuenta-group',
  ];
  grupos.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = hasCA ? 'block' : 'none'; });
  const btnMover = document.getElementById('btn-mover-fondos-home');
  if (btnMover) btnMover.style.display = hasCA ? '' : 'none';
}

let _checkDestinoTimer = null;
function checkDestinoCA(inputId, groupId) {
  clearTimeout(_checkDestinoTimer);
  const dest = document.getElementById(inputId)?.value.trim().toLowerCase();
  const group = document.getElementById(groupId);
  if (!group) return;
  // Si el usuario no tiene CA, nunca mostrar el selector
  if (!currentUser?.accountNumCajaAhorro) { group.style.display = 'none'; return; }
  // Mientras escribe (menos de 2 chars), dejar el selector visible como default CC
  if (!dest || dest.length < 2) { group.style.display = 'block'; return; }
  // Con 2+ caracteres, consultar Firestore con debounce
  _checkDestinoTimer = setTimeout(async () => {
    try {
      const snap = await db.collection('users').doc(dest).get();
      // Mostrar solo si el destinatario también tiene CA; si no, ocultar
      group.style.display = (snap.exists && snap.data().accountNumCajaAhorro) ? 'block' : 'none';
    } catch(e) { group.style.display = 'none'; }
  }, 600);
}

function getCuentaElegida(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return 'cc';
  const group = el.closest('.cuenta-selector-group');
  if (group && group.style.display === 'none') return 'cc';
  return el.value || 'cc';
}

// ════════════════════════════════════════════════════════════════
//  MÓDULO CAJA DE AHORRO ARS
// ════════════════════════════════════════════════════════════════

function syncCADisplay() {
  if (!currentUser) return;
  const hasCA = !!currentUser.accountNumCajaAhorro;
  const balCA = currentUser.balanceCajaAhorro || 0;
  // Datos de la tarjeta CA en el slider
  const balEl = document.getElementById('dash-balance-ca');
  if (balEl) balEl.textContent = fmtARS(balCA);
  const numEl = document.getElementById('dash-accnum-ca');
  if (numEl) numEl.textContent = currentUser.accountNumCajaAhorro || '';
  // Banner abrir CA
  const bannerEl = document.getElementById('ca-closed-home');
  if (bannerEl) bannerEl.style.display = hasCA ? 'none' : '';
  actualizarSelectoresCuenta();
}

async function abrirCajaAhorro() {
  if (currentUser.accountNumCajaAhorro) return;
  const num = 'CA-' + String(Math.floor(Math.random() * 900000) + 100000);
  await db.collection('users').doc(currentUser.id).update({
    accountNumCajaAhorro: num,
    balanceCajaAhorro: 0,
    txCajaAhorro: [],
    interesesCAacumulados: 0,
    ultimoCalculoCA: todayStr(),
    ultimaAcreditacionCA: '',
  });
  showNotif('✓ Caja de ahorro ARS abierta: ' + num);
}

// Depósito en caja de ahorro
async function doDepositCA() {
  const amount = parseFloat(document.getElementById('dep-ca-amount').value);
  const err = document.getElementById('dep-ca-error'); err.classList.remove('show');
  if (!amount || amount <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  const _topeDCA = localConfig.topeDeposito || 1000000;
  const _saldoMaxCA = localConfig.saldoMaxARS || 50000000;
  if (amount > _topeDCA) { err.textContent = 'El monto máximo por depósito es ' + fmtARS(_topeDCA) + '.'; err.classList.add('show'); return; }
  const _balCA = currentUser.balanceCajaAhorro || 0;
  if (_balCA >= _saldoMaxCA) { err.textContent = 'Tu caja de ahorro alcanzó el saldo máximo permitido (' + fmtARS(_saldoMaxCA) + ').'; err.classList.add('show'); return; }
  if (_balCA + amount > _saldoMaxCA) { err.textContent = 'Este depósito supera el saldo máximo (' + fmtARS(_saldoMaxCA) + '). Podés depositar hasta ' + fmtARS(_saldoMaxCA - _balCA) + '.'; err.classList.add('show'); return; }
  const txId = (currentUser.txCounter || 200) + 1;
  await db.collection('users').doc(currentUser.id).update({
    balanceCajaAhorro: _balCA + amount,
    txCounter: txId,
    txCajaAhorro: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Depósito caja de ahorro', amount, date: todayStr() }),
  });
  closeModal('deposit-ca');
  document.getElementById('dep-ca-amount').value = '';
  showNotif('✓ Depósito de ' + fmtARS(amount) + ' en caja de ahorro');
}

// Transferencia saliente desde caja de ahorro
async function doTransferCA() {
  const dest = document.getElementById('tf-ca-dest').value.trim().toLowerCase();
  const amount = parseFloat(document.getElementById('tf-ca-amount').value);
  const err = document.getElementById('tf-ca-error'); err.classList.remove('show');
  if (!dest) { err.textContent = 'Ingresá el usuario destinatario.'; err.classList.add('show'); return; }
  if (dest === currentUser.id) { err.textContent = 'No podés transferirte a vos mismo.'; err.classList.add('show'); return; }
  if (!amount || amount <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  if (amount > (currentUser.balanceCajaAhorro || 0)) { err.textContent = 'Saldo insuficiente en caja de ahorro.'; err.classList.add('show'); return; }
  const targetSnap = await db.collection('users').doc(dest).get();
  if (!targetSnap.exists) { err.textContent = 'Usuario "' + dest + '" no encontrado.'; err.classList.add('show'); return; }
  const target = targetSnap.data();
  // Validar saldo máximo de la cuenta destino del receptor
  const _saldoMaxCA = localConfig.saldoMaxARS || 50000000;
  const cuentaDestCA = getCuentaElegida('tf-ca-dest-cuenta');
  const _balDestCA = (cuentaDestCA === 'ca' && target.accountNumCajaAhorro)
    ? (target.balanceCajaAhorro || 0) : (target.balance || 0);
  const _cuentaNombreCA = (cuentaDestCA === 'ca' && target.accountNumCajaAhorro) ? 'caja de ahorro' : 'cuenta corriente';
  if (_balDestCA + amount > _saldoMaxCA) {
    const _disponibleDestCA = Math.max(0, _saldoMaxCA - _balDestCA);
    err.textContent = target.name + ' no puede recibir ese monto: su ' + _cuentaNombreCA + ' alcanzaría el saldo máximo. Máximo que puede recibir: ' + fmtARS(_disponibleDestCA) + '.';
    err.classList.add('show'); return;
  }
  const txId = (currentUser.txCounter || 200) + 1;
  const d = todayStr();
  const batch = db.batch();
  batch.update(db.collection('users').doc(currentUser.id), {
    balanceCajaAhorro: (currentUser.balanceCajaAhorro || 0) - amount,
    txCounter: txId,
    txCajaAhorro: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Transferencia a ' + target.name, amount, date: d }),
  });
  const destUpdCA = {};
  if (cuentaDestCA === 'ca' && target.accountNumCajaAhorro) {
    destUpdCA.balanceCajaAhorro = (target.balanceCajaAhorro || 0) + amount;
    destUpdCA.txCajaAhorro = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Transferencia de ' + currentUser.name + ' (a tu Caja Ahorro)', amount, date: d });
  } else {
    destUpdCA.balance = (target.balance || 0) + amount;
    destUpdCA.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Transferencia de ' + currentUser.name + ' (desde Caja Ahorro)', amount, date: d });
  }
  batch.update(db.collection('users').doc(dest), destUpdCA);
  await batch.commit();
  closeModal('transfer-ca');
  document.getElementById('tf-ca-dest').value = '';
  document.getElementById('tf-ca-amount').value = '';
  showNotif('✓ Transferiste ' + fmtARS(amount) + ' desde tu caja de ahorro a ' + target.name + (cuentaDestCA === 'ca' ? ' (Caja Ahorro)' : ''));
}

// Mover fondos entre cuentas propias
async function doMoverFondos() {
  const origen = document.getElementById('mover-origen').value;
  const amount = parseFloat(document.getElementById('mover-amount').value);
  const err = document.getElementById('mover-error'); err.classList.remove('show');
  if (!amount || amount <= 0) { err.textContent = 'Ingresá un monto válido.'; err.classList.add('show'); return; }
  const balCC = currentUser.balance || 0;
  const balCA = currentUser.balanceCajaAhorro || 0;
  if (origen === 'cc') {
    // CC → CA: permite descubierto igual que una transferencia normal
    const _limDesc = (currentUser.limiteDescubierto != null) ? currentUser.limiteDescubierto : 50000;
    if (amount > balCC + _limDesc) { err.textContent = 'Superás el límite disponible en cuenta corriente.'; err.classList.add('show'); return; }
    const nuevoBalCC = parseFloat((balCC - amount).toFixed(2));
    const txId = (currentUser.txCounter || 200) + 1;
    const upd = {
      balance: nuevoBalCC,
      balanceCajaAhorro: balCA + amount,
      txCounter: txId,
      transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Movimiento a caja de ahorro propia', amount, date: todayStr() }),
      txCajaAhorro: firebase.firestore.FieldValue.arrayUnion({ id: txId + 1, type: 'credit', desc: 'Movimiento desde cuenta corriente propia', amount, date: todayStr() }),
    };
    if (nuevoBalCC < 0 && !(currentUser.descubierto && currentUser.descubierto.fechaInicio)) upd.descubierto = { fechaInicio: todayStr() };
    if (nuevoBalCC >= 0) upd.descubierto = null;
    await db.collection('users').doc(currentUser.id).update(upd);
  } else {
    // CA → CC: sin descubierto
    if (amount > balCA) { err.textContent = 'Saldo insuficiente en caja de ahorro.'; err.classList.add('show'); return; }
    const txId = (currentUser.txCounter || 200) + 1;
    await db.collection('users').doc(currentUser.id).update({
      balance: balCC + amount,
      balanceCajaAhorro: parseFloat((balCA - amount).toFixed(2)),
      txCounter: txId,
      txCajaAhorro: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Movimiento a cuenta corriente propia', amount, date: todayStr() }),
      transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId + 1, type: 'credit', desc: 'Movimiento desde caja de ahorro propia', amount, date: todayStr() }),
    });
  }
  closeModal('mover-fondos');
  document.getElementById('mover-amount').value = '';
  showNotif('✓ Fondos movidos entre tus cuentas');
}

// Admin: ajustar saldo de caja de ahorro
async function adminAdjustCA(uid, mode) {
  const inp = document.getElementById('adj-ca-' + uid);
  const amount = parseFloat(inp.value);
  if (!amount || amount <= 0) { showNotif('Ingresá un monto válido.', 'error'); return; }
  const snap = await db.collection('users').doc(uid).get();
  const u = snap.data();
  if (!u.accountNumCajaAhorro) { showNotif('El usuario no tiene caja de ahorro.', 'error'); return; }
  const balCA = u.balanceCajaAhorro || 0;
  if (mode === 'sub' && amount > balCA) { showNotif('Saldo insuficiente en caja de ahorro.', 'error'); return; }
  const nuevoBalCA = mode === 'add' ? balCA + amount : balCA - amount;
  await db.collection('users').doc(uid).update({
    balanceCajaAhorro: nuevoBalCA,
    txCajaAhorro: firebase.firestore.FieldValue.arrayUnion({ id: Date.now(), type: mode === 'add' ? 'credit' : 'debit', desc: 'Ajuste caja de ahorro por administrador (' + (mode === 'add' ? '+' : '−') + ')', amount, date: todayStr() }),
  });
  inp.value = '';
  showNotif('✓ Saldo de caja de ahorro actualizado');
  await renderAdmin();
}

// ════════════════════════════════════════════════════════════════
//  MÓDULO CHEQUES
// ════════════════════════════════════════════════════════════════

// Genera número de cheque único
function generarNroCheque() {
  return String(Math.floor(Math.random() * 90000000) + 10000000);
}

// Parsea fecha de input date (YYYY-MM-DD) a Date local
function parseFechaInput(s) {
  const [y, m, d] = s.split('-');
  return new Date(+y, +m - 1, +d);
}

function renderChequesUser() {
  const emitidos   = (currentUser.chequesEmitidos   || []).slice().reverse();
  const recibidos  = (currentUser.chequesRecibidos  || []).slice().reverse();

  // ── Emitidos ──
  const elE = document.getElementById('cheques-emitidos-list');
  if (!emitidos.length) {
    elE.innerHTML = '<div class="empty-state">No emitiste cheques.</div>';
  } else {
    elE.innerHTML = emitidos.map(ch => {
      const badge = badgeCheque(ch.estado);
      const esDiferido = ch.fechaPago !== ch.fechaEmision;
      return `<div class="producto-item"><div class="prod-info">
        <div class="prod-title">Cheque Nº ${ch.nro} — ${fmtARS(ch.monto)} ${badge}</div>
        <div class="prod-detail">Para: <strong>${ch.destinatario}</strong> · Emitido: ${ch.fechaEmision}${esDiferido ? ' · Pago desde: <strong>' + ch.fechaPago + '</strong>' : ''}</div>
        ${ch.estado === 'rechazado' ? '<div class="prod-detail" style="color:var(--red)">Rechazado por falta de fondos</div>' : ''}
      </div></div>`;
    }).join('');
  }

  // ── Recibidos ──
  const elR = document.getElementById('cheques-recibidos-list');
  if (!recibidos.length) {
    elR.innerHTML = '<div class="empty-state">No tenés cheques recibidos.</div>';
  } else {
    elR.innerHTML = recibidos.map(ch => {
      const badge = badgeCheque(ch.estado);
      const esDiferido = ch.fechaPago !== ch.fechaEmision;
      const now = today();
      const fechaPagoDate = dateFromStr(ch.fechaPago);
      const puedeDepositar = ch.estado === 'pendiente' && fechaPagoDate <= now;
      const noDisponibleAun = ch.estado === 'pendiente' && fechaPagoDate > now;
      return `<div class="producto-item" style="align-items:flex-start;flex-direction:column;gap:8px;">
        <div class="prod-info">
          <div class="prod-title">Cheque Nº ${ch.nro} — ${fmtARS(ch.monto)} ${badge}</div>
          <div class="prod-detail">De: <strong>${ch.emisor}</strong> · Emitido: ${ch.fechaEmision}${esDiferido ? ' · Disponible desde: <strong>' + ch.fechaPago + '</strong>' : ''}</div>
          ${ch.estado === 'rechazado' ? '<div class="prod-detail" style="color:var(--red)">Rechazado por falta de fondos del emisor</div>' : ''}
          ${ch.estado === 'vencido' ? '<div class="prod-detail" style="color:var(--text3)">Venció sin ser depositado (30 días)</div>' : ''}
          ${noDisponibleAun ? '<div class="prod-detail" style="color:var(--amber)">Cheque diferido — disponible el ' + ch.fechaPago + '</div>' : ''}
        </div>
        ${puedeDepositar ? `<button class="btn-sm btn-add" style="font-size:12px;padding:6px 14px;" onclick="depositarCheque('${ch.nro}')">Depositar</button>` : ''}
      </div>`;
    }).join('');
  }
}

function badgeCheque(estado) {
  const map = {
    pendiente:  '<span class="producto-badge badge-prestamo">Pendiente</span>',
    cobrado:    '<span class="producto-badge badge-plazo">✓ Cobrado</span>',
    rechazado:  '<span class="producto-badge badge-vencido">✕ Rechazado</span>',
    vencido:    '<span class="producto-badge" style="background:var(--gray2);color:var(--text3)">Vencido</span>',
  };
  return map[estado] || '';
}

async function emitirCheque() {
  const destinatario = document.getElementById('ch-dest').value.trim().toLowerCase();
  const monto        = parseFloat(document.getElementById('ch-monto').value);
  const fechaPagoRaw = document.getElementById('ch-fecha').value;
  const err          = document.getElementById('ch-error'); err.classList.remove('show');

  if (!destinatario)      { err.textContent = 'Ingresá el usuario destinatario.';        err.classList.add('show'); return; }
  if (destinatario === currentUser.id) { err.textContent = 'No podés emitir un cheque a tu propio nombre.'; err.classList.add('show'); return; }
  if (!monto || monto <= 0) { err.textContent = 'Ingresá un monto válido.';              err.classList.add('show'); return; }
  if (!fechaPagoRaw)      { err.textContent = 'Ingresá la fecha de pago.';               err.classList.add('show'); return; }

  const fechaPago    = parseFechaInput(fechaPagoRaw);
  const hoy          = today(); hoy.setHours(0,0,0,0);
  if (fechaPago < hoy) { err.textContent = 'La fecha de pago no puede ser anterior a hoy.'; err.classList.add('show'); return; }

  // Verificar que el destinatario existe
  setLoading('btn-emitir-cheque', true);
  try {
    const destSnap = await db.collection('users').doc(destinatario).get();
    if (!destSnap.exists) { err.textContent = 'Usuario "' + destinatario + '" no encontrado.'; err.classList.add('show'); setLoading('btn-emitir-cheque', false); return; }

    const nro        = generarNroCheque();
    const fechaHoy   = todayStr();
    const fechaPagoStr = fmtDate(fechaPago);

    const chequeEmitido = {
      nro, monto, destinatario,
      fechaEmision: fechaHoy,
      fechaPago: fechaPagoStr,
      estado: 'pendiente',
    };
    const chequeRecibido = {
      nro, monto,
      emisor: currentUser.id,
      fechaEmision: fechaHoy,
      fechaPago: fechaPagoStr,
      estado: 'pendiente',
    };

    // Guardar en emisor y receptor usando batch
    const batch = db.batch();
    batch.update(db.collection('users').doc(currentUser.id), {
      chequesEmitidos: firebase.firestore.FieldValue.arrayUnion(chequeEmitido),
    });
    batch.update(db.collection('users').doc(destinatario), {
      chequesRecibidos: firebase.firestore.FieldValue.arrayUnion(chequeRecibido),
    });
    await batch.commit();

    closeModal('new-cheque');
    document.getElementById('ch-dest').value  = '';
    document.getElementById('ch-monto').value = '';
    document.getElementById('ch-fecha').value = '';
    showNotif('✓ Cheque Nº ' + nro + ' emitido a ' + destinatario);
  } catch(e) {
    err.textContent = 'Error al emitir el cheque. Intentá de nuevo.';
    err.classList.add('show');
    console.error(e);
  }
  setLoading('btn-emitir-cheque', false);
}

async function depositarCheque(nro) {
  const cheque = (currentUser.chequesRecibidos || []).find(ch => ch.nro === nro);
  if (!cheque || cheque.estado !== 'pendiente') { showNotif('Cheque no disponible.', 'error'); return; }

  // Verificar fecha de pago
  const fechaPago = dateFromStr(cheque.fechaPago);
  const now = today(); now.setHours(0,0,0,0);
  if (fechaPago > now) { showNotif('Este cheque no está disponible aún. Fecha de pago: ' + cheque.fechaPago, 'warn'); return; }

  // Leer datos actuales del emisor
  const emisorSnap = await db.collection('users').doc(cheque.emisor).get();
  if (!emisorSnap.exists) { showNotif('No se encontró la cuenta del emisor.', 'error'); return; }
  const emisor = emisorSnap.data();

  const limDescEmisor  = (emisor.limiteDescubierto != null) ? emisor.limiteDescubierto : 50000;
  const disponibleEmisor = (emisor.balance || 0) + limDescEmisor;
  const txId = (currentUser.txCounter || 200) + 1;
  const d    = todayStr();

  if (disponibleEmisor >= cheque.monto) {
    // ── CHEQUE APROBADO ──
    const nuevoBalEmisor = parseFloat(((emisor.balance || 0) - cheque.monto).toFixed(2));
    const updEmisor = {
      balance: nuevoBalEmisor,
      transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Cheque Nº ' + nro + ' cobrado por ' + currentUser.id, amount: cheque.monto, date: d }),
    };
    if (nuevoBalEmisor < 0 && !(emisor.descubierto && emisor.descubierto.fechaInicio)) updEmisor.descubierto = { fechaInicio: d };
    if (nuevoBalEmisor >= 0) updEmisor.descubierto = null;

    // Actualizar estado del cheque en el emisor
    const emitidosActualizados = (emisor.chequesEmitidos || []).map(ch =>
      ch.nro === nro ? { ...ch, estado: 'cobrado' } : ch
    );
    updEmisor.chequesEmitidos = emitidosActualizados;

    // Actualizar cheque recibido del receptor
    const recibidosActualizados = (currentUser.chequesRecibidos || []).map(ch =>
      ch.nro === nro ? { ...ch, estado: 'cobrado' } : ch
    );
    const nuevoBalReceptor = parseFloat(((currentUser.balance || 0) + cheque.monto).toFixed(2));
    const updReceptor = {
      balance: nuevoBalReceptor,
      txCounter: txId,
      chequesRecibidos: recibidosActualizados,
      transactions: firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'credit', desc: 'Depósito cheque Nº ' + nro + ' de ' + cheque.emisor, amount: cheque.monto, date: d }),
    };
    if (nuevoBalReceptor >= 0 && currentUser.balance < 0) updReceptor.descubierto = null;

    const batch = db.batch();
    batch.update(db.collection('users').doc(cheque.emisor), updEmisor);
    batch.update(db.collection('users').doc(currentUser.id), updReceptor);
    await batch.commit();

    showNotif('✓ Cheque Nº ' + nro + ' depositado — ' + fmtARS(cheque.monto) + ' acreditados en tu cuenta');
  } else {
    // ── CHEQUE RECHAZADO ──
    const emitidosActualizados = (emisor.chequesEmitidos || []).map(ch =>
      ch.nro === nro ? { ...ch, estado: 'rechazado' } : ch
    );
    const recibidosActualizados = (currentUser.chequesRecibidos || []).map(ch =>
      ch.nro === nro ? { ...ch, estado: 'rechazado' } : ch
    );
    const batch = db.batch();
    batch.update(db.collection('users').doc(cheque.emisor), { chequesEmitidos: emitidosActualizados });
    batch.update(db.collection('users').doc(currentUser.id), { chequesRecibidos: recibidosActualizados });
    await batch.commit();

    showNotif('✕ Cheque Nº ' + nro + ' rechazado — fondos insuficientes del emisor', 'error');
  }
}

// ════════════════════════════════════════════════════════════════
//  MÓDULO TRANSFERENCIAS AL EXTERIOR
// ════════════════════════════════════════════════════════════════

const PAISES = [
  'Alemania','Argentina','Australia','Austria','Bélgica','Bolivia','Brasil','Canadá',
  'Chile','China','Colombia','Corea del Sur','Dinamarca','Ecuador','España','Estados Unidos',
  'Francia','Grecia','Hong Kong','India','Irlanda','Israel','Italia','Japón','México',
  'Noruega','Nueva Zelanda','Países Bajos','Panamá','Paraguay','Perú','Polonia',
  'Portugal','Reino Unido','Singapur','Sudáfrica','Suecia','Suiza','Uruguay','Venezuela',
];

function renderTransferenciasExt() {
  const el  = document.getElementById('tx-ext-list');
  const txs = (currentUser.transferenciasExt || []).slice().reverse();
  if (!txs.length) {
    el.innerHTML = '<div class="empty-state">No realizaste transferencias al exterior.</div>';
    return;
  }
  el.innerHTML = txs.map(t => `
    <div class="producto-item" style="flex-direction:column;align-items:flex-start;gap:4px;">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <div class="prod-title">${fmtUSD(t.importeUSD)} → ${t.beneficiario}</div>
        <span class="producto-badge badge-plazo">✓ Enviada</span>
      </div>
      <div class="prod-detail">País: ${t.pais} · Cta: ${t.numeroCuenta}</div>
      <div class="prod-detail">
        Banco benef.: ${t.tipoCodBenef.toUpperCase()} ${t.codBenef}
        · Banco corresp.: ${t.tipoCodCorresp.toUpperCase()} ${t.codCorresp}
      </div>
      <div class="prod-detail">Debitado: ${fmtUSD(t.importeUSD)} ${t.cuentaOrigen === 'usd' ? 'desde Caja Ahorro USD' : t.cuentaOrigen === 'ca' ? '(equiv. ' + fmtARS(t.importeARS) + ' desde Caja Ahorro ARS · TC ' + fmtTC(t.tc) + ')' : '(equiv. ' + fmtARS(t.importeARS) + ' desde Cta. Cte. · TC ' + fmtTC(t.tc) + ')'} · ${t.fecha}</div>
    </div>`).join('');
}

// Actualiza el label de simulación en tiempo real
function simTransfExt() {
  const usd    = parseFloat(document.getElementById('txe-importe').value);
  const origen = document.getElementById('txe-cuenta').value;
  const sim    = document.getElementById('txe-sim');
  if (!usd || usd <= 0) { sim.style.display = 'none'; return; }
  sim.style.display = '';
  if (origen === 'usd') {
    document.getElementById('txe-sim-debito').textContent = fmtUSD(usd) + ' desde Caja Ahorro USD';
    document.getElementById('txe-sim-tc').style.display   = 'none';
    document.getElementById('txe-sim-tc-row').style.display = 'none';
  } else {
    const ars = usd * localConfig.tcVenta;
    document.getElementById('txe-sim-debito').textContent = fmtARS(ars) + (origen === 'ca' ? ' desde Caja Ahorro ARS' : ' desde Cta. Cte.');
    document.getElementById('txe-sim-tc-row').style.display = '';
    document.getElementById('txe-sim-tc').textContent = fmtTC(localConfig.tcVenta) + ' / USD';
  }
}

async function doTransferenciaExt() {
  const beneficiario   = document.getElementById('txe-beneficiario').value.trim();
  const pais           = document.getElementById('txe-pais').value;
  const tipoCodBenef   = document.getElementById('txe-tipo-benef').value;
  const codBenef       = document.getElementById('txe-cod-benef').value.trim().toUpperCase();
  const tipoCodCorresp = document.getElementById('txe-tipo-corresp').value;
  const codCorresp     = document.getElementById('txe-cod-corresp').value.trim().toUpperCase();
  const numeroCuenta   = document.getElementById('txe-cuenta-num').value.trim();
  const usd            = parseFloat(document.getElementById('txe-importe').value);
  const origen         = document.getElementById('txe-cuenta').value;
  const err            = document.getElementById('txe-error'); err.classList.remove('show');

  // Validaciones
  if (!beneficiario)  { err.textContent = 'Ingresá el nombre del beneficiario.';          err.classList.add('show'); return; }
  if (!pais)          { err.textContent = 'Seleccioná el país de destino.';               err.classList.add('show'); return; }
  if (!codBenef)      { err.textContent = 'Ingresá el código del banco beneficiario.';    err.classList.add('show'); return; }
  if (!numeroCuenta)  { err.textContent = 'Ingresá el número de cuenta del beneficiario.'; err.classList.add('show'); return; }
  if (!usd || usd <= 0) { err.textContent = 'Ingresá un importe válido.';                err.classList.add('show'); return; }

  // Validar SWIFT (8 u 11 caracteres alfanuméricos) o ABA (9 dígitos)
  const swiftRegex = /^[A-Z0-9]{8,11}$/;
  const abaRegex   = /^\d{9}$/;
  if (tipoCodBenef === 'swift'   && !swiftRegex.test(codBenef))                        { err.textContent = 'El SWIFT del banco beneficiario debe tener 8 u 11 caracteres alfanuméricos.';   err.classList.add('show'); return; }
  if (tipoCodBenef === 'aba'     && !abaRegex.test(codBenef))                          { err.textContent = 'El ABA del banco beneficiario debe tener exactamente 9 dígitos.';                err.classList.add('show'); return; }
  if (codCorresp && tipoCodCorresp === 'swift' && !swiftRegex.test(codCorresp))        { err.textContent = 'El SWIFT del banco corresponsal debe tener 8 u 11 caracteres alfanuméricos.';  err.classList.add('show'); return; }
  if (codCorresp && tipoCodCorresp === 'aba'   && !abaRegex.test(codCorresp))          { err.textContent = 'El ABA del banco corresponsal debe tener exactamente 9 dígitos.';               err.classList.add('show'); return; }

  setLoading('btn-txe-confirmar', true);
  try {
    const txId = (currentUser.txCounter || 200) + 1;
    const d    = todayStr();
    const upd  = { txCounter: txId };
    let importeARS = 0;

    if (origen === 'usd') {
      // Debitar USD directo
      const balUSD = currentUser.balanceUSD || 0;
      if (usd > balUSD) { err.textContent = 'Saldo USD insuficiente. Disponible: ' + fmtUSD(balUSD) + '.'; err.classList.add('show'); setLoading('btn-txe-confirmar', false); return; }
      upd.balanceUSD = parseFloat((balUSD - usd).toFixed(8));
      upd.txUSD = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Transferencia al exterior – ' + beneficiario + ' (' + pais + ')', amount: usd, date: d });
    } else {
      // Convertir USD → ARS al TC Vendedor y debitar cuenta ARS
      importeARS = parseFloat((usd * localConfig.tcVenta).toFixed(2));
      if (origen === 'ca') {
        const balCA = currentUser.balanceCajaAhorro || 0;
        if (importeARS > balCA) { err.textContent = 'Saldo insuficiente en Caja de Ahorro ARS. Necesitás ' + fmtARS(importeARS) + ' (equiv. al TC Vendedor ' + fmtTC(localConfig.tcVenta) + ').'; err.classList.add('show'); setLoading('btn-txe-confirmar', false); return; }
        upd.balanceCajaAhorro = parseFloat((balCA - importeARS).toFixed(2));
        upd.txCajaAhorro = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Transferencia al exterior – ' + beneficiario + ' (' + pais + ') · ' + fmtUSD(usd) + ' al TC ' + fmtTC(localConfig.tcVenta), amount: importeARS, date: d });
      } else {
        // Cuenta corriente — respeta descubierto
        const balCC = currentUser.balance || 0;
        const lim   = (currentUser.limiteDescubierto != null) ? currentUser.limiteDescubierto : 50000;
        if (importeARS > balCC + lim) { err.textContent = 'Superás el límite disponible en Cta. Cte. Disponible: ' + fmtARS(Math.max(0, balCC + lim)) + '.'; err.classList.add('show'); setLoading('btn-txe-confirmar', false); return; }
        const nuevoBalCC = parseFloat((balCC - importeARS).toFixed(2));
        upd.balance = nuevoBalCC;
        upd.transactions = firebase.firestore.FieldValue.arrayUnion({ id: txId, type: 'debit', desc: 'Transferencia al exterior – ' + beneficiario + ' (' + pais + ') · ' + fmtUSD(usd) + ' al TC ' + fmtTC(localConfig.tcVenta), amount: importeARS, date: d });
        if (nuevoBalCC < 0 && !(currentUser.descubierto && currentUser.descubierto.fechaInicio)) upd.descubierto = { fechaInicio: d };
        if (nuevoBalCC >= 0) upd.descubierto = null;
      }
    }

    // Registrar la transferencia en el historial propio
    const registro = {
      id: txId, fecha: d, beneficiario, pais,
      tipoCodBenef, codBenef, tipoCodCorresp, codCorresp,
      numeroCuenta, importeUSD: usd, importeARS, tc: localConfig.tcVenta,
      cuentaOrigen: origen,
    };
    upd.transferenciasExt = firebase.firestore.FieldValue.arrayUnion(registro);

    await db.collection('users').doc(currentUser.id).update(upd);

    closeModal('new-transf-ext');
    // Limpiar formulario
    ['txe-beneficiario','txe-cod-benef','txe-cod-corresp','txe-cuenta-num','txe-importe'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('txe-pais').selectedIndex = 0;
    document.getElementById('txe-sim').style.display = 'none';

    showNotif('✓ Transferencia al exterior enviada — ' + fmtUSD(usd) + ' a ' + beneficiario, 'info');
  } catch(e) {
    err.textContent = 'Error al procesar la transferencia. Intentá de nuevo.';
    err.classList.add('show');
    console.error(e);
  }
  setLoading('btn-txe-confirmar', false);
}

// ─── CIERRE DE MODALES ────────────────────────────────────────────
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });
});
 
// ─── ARRANQUE ─────────────────────────────────────────────────────
init();
