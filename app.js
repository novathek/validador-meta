/* ================================================================
   app.js — Lógica App de Asistencia · Capacitación META 2026
   Firebase Firestore + datos embebidos (data.js)
   ================================================================ */

'use strict';

// ── Firebase init ───────────────────────────────────────────────
let db;
try {
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
  console.log('[Firebase] conectado');
} catch (e) {
  console.warn('[Firebase] error de configuración:', e.message);
  db = null;
}

// ── Utilidades ──────────────────────────────────────────────────
function hoyISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function horaLocal() {
  return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function normalize(str) {
  if (!str) return '';
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function fuzzyMatch(text, query) {
  const t = normalize(text);
  const words = normalize(query).split(' ').filter(Boolean);
  return words.every(w => t.includes(w));
}

// ── Labels en español para mostrar datos ────────────────────────
const LABELS_DIR = {
  ROL: 'Rol', NOMBRE: 'Nombre', APELLIDO: 'Apellido',
  NACIONALIDAD: 'Nacionalidad', DOCUMENTO: 'Tipo doc.',
  DNI: 'DNI', EMAIL: 'Email', EMAIL_2: 'Email 2',
  SEXO: 'Sexo', NACIMIENTO: 'Nacimiento', POSTAL: 'Cód. Postal',
  PAIS: 'País', CELULAR: 'Celular', CUIT: 'CUIT',
  DEPARTAMENTO: 'Departamento', NIVEL: 'Nivel', NODO: 'Nodo',
  INSTITUCION: 'Institución',
};

const LABELS_DOC = {
  NOMBRE: 'Nombre', APELLIDO: 'Apellido', NACIONALIDAD: 'Nacionalidad',
  DOCUMENTO: 'Tipo doc.', DNI: 'DNI', EMAIL: 'Email',
  SEXO: 'Sexo', NACIMIENTO: 'Nacimiento', DOMICILIO: 'Domicilio',
  CODIGO_POSTAL: 'Cód. Postal', PAIS: 'País', PROVINCIA: 'Provincia',
  DEPARTAMENTO: 'Departamento', CELULAR: 'Celular', CUIT: 'CUIT',
  ESCUELA: 'Escuela', GRADO_ANO: 'Grado/Año', MATERIA: 'Materia',
  CURSO: 'Curso',
};

// ── Estado global ───────────────────────────────────────────────
const State = {
  dia:           null,   // 'viernes7' | 'sabado8'
  criteria:      'dni',  // criterio de búsqueda actual
  persona:       null,   // objeto del DB
  registroActual: null,  // registro Firestore existente (o null)
  panelTab:      'todos',
  panelRecords:  [],
  returnScreen:  'screen-busqueda',
};

// ── Navegación ──────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Alertas ─────────────────────────────────────────────────────
function setAlert(containerId, type, msg) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!msg) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="alert ${type}">${msg}</div>`;
}

// ── Spinners ─────────────────────────────────────────────────────
function setLoading(btnId, spinnerId, textElId, loading) {
  const btn  = document.getElementById(btnId);
  const sp   = document.getElementById(spinnerId);
  const txt  = document.getElementById(textElId);
  if (btn) btn.disabled = loading;
  if (sp)  sp.style.display  = loading ? 'block' : 'none';
  if (txt) txt.style.display = loading ? 'none'  : 'inline';
}

// ── Búsqueda en el dataset ───────────────────────────────────────
function searchPersonas(dataset, criteria, query) {
  const q = query.trim();
  if (!q) return [];
  const qNum = q.replace(/\D/g, '');

  return dataset.filter(p => {
    let fieldValue = '';
    switch (criteria) {
      case 'dni':      fieldValue = p.DNI      || ''; break;
      case 'nombre':   fieldValue = p.NOMBRE   || ''; break;
      case 'apellido': fieldValue = p.APELLIDO || ''; break;
      case 'cuit':     fieldValue = p.CUIT     || ''; break;
      case 'celular':  fieldValue = p.CELULAR  || ''; break;
      case 'mail':     fieldValue = p.EMAIL    || ''; break;
    }
    if (!fieldValue) return false;

    if (criteria === 'dni' || criteria === 'cuit' || criteria === 'celular') {
      const fvNum = fieldValue.replace(/\D/g, '');
      return qNum.length >= 3 && fvNum.includes(qNum);
    } else if (criteria === 'mail') {
      return fieldValue.toLowerCase().includes(q.toLowerCase());
    } else {
      return fuzzyMatch(fieldValue, q);
    }
  });
}

// ── Config de criterio ───────────────────────────────────────────
const CRITERIA_CONFIG = {
  dni:      { label: 'Número de DNI',  type: 'tel',   inputmode: 'numeric', placeholder: 'Ingresá el DNI' },
  nombre:   { label: 'Nombre',          type: 'text',  inputmode: 'text',    placeholder: 'Ej: Jorge' },
  apellido: { label: 'Apellido',        type: 'text',  inputmode: 'text',    placeholder: 'Ej: Ramírez' },
  cuit:     { label: 'Número de CUIT',  type: 'tel',   inputmode: 'numeric', placeholder: 'Ingresá el CUIT' },
  celular:  { label: 'Número de celular', type: 'tel', inputmode: 'numeric', placeholder: 'Ej: 3834000000' },
  mail:     { label: 'Dirección de mail', type: 'email', inputmode: 'email', placeholder: 'ejemplo@mail.com' },
};

// ================================================================
//   App — objeto principal
// ================================================================
const App = {

  // ── Pantalla principal ──────────────────────────────────────
  selectDay(dia) {
    State.dia      = dia;
    State.criteria = 'dni';
    State.persona  = null;

    // Actualizar labels de la pantalla de búsqueda
    const esViernes = dia === 'viernes7';
    document.getElementById('topbar-busqueda').textContent =
      esViernes ? 'Viernes 7 de Agosto' : 'Sábado 8 de Agosto';
    document.getElementById('chip-busqueda').textContent =
      esViernes ? 'Directivos' : 'Docentes';
    document.getElementById('chip-busqueda').className =
      'screen-header-label' + (esViernes ? ' directivos' : ' secondary');
    document.getElementById('titulo-busqueda').textContent =
      esViernes ? 'Buscar directivo' : 'Buscar docente';

    // Resetear chips al primero (DNI)
    this.selectCriteria('dni', false);

    // Resetear campo y resultados
    document.getElementById('input-busqueda').value = '';
    document.getElementById('results-busqueda').innerHTML = '';
    setAlert('alert-busqueda', '', '');
    document.getElementById('btn-buscar').disabled = true;

    showScreen('screen-busqueda');
    setTimeout(() => document.getElementById('input-busqueda').focus(), 350);
  },

  goExcepcional() {
    // Limpiar formulario
    ['exc-dia','exc-rol','exc-nombre','exc-apellido','exc-dni','exc-cuit',
     'exc-celular','exc-mail','exc-escuela','exc-nacimiento',
     'exc-departamento','exc-nivel','exc-nodo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    setAlert('alert-excepcional', '', '');
    showScreen('screen-excepcional');
    setTimeout(() => document.getElementById('exc-nombre').focus(), 350);
  },

  goHome() {
    State.dia      = null;
    State.persona  = null;
    State.criteria = 'dni';
    showScreen('screen-home');
  },

  // ── Búsqueda: selección de criterio ────────────────────────
  selectCriteria(type, focusInput = true) {
    State.criteria = type;

    // Actualizar chips
    document.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', c.dataset.type === type);
    });

    // Actualizar input
    const cfg = CRITERIA_CONFIG[type];
    const input = document.getElementById('input-busqueda');
    const label = document.getElementById('label-busqueda');
    input.type        = cfg.type;
    input.inputMode   = cfg.inputmode;
    input.placeholder = cfg.placeholder;
    label.textContent = cfg.label;
    input.value = '';

    // Clase especial para DNI (monospace grande)
    input.classList.toggle('input-busqueda-dni',
      type === 'dni' || type === 'cuit' || type === 'celular');

    document.getElementById('results-busqueda').innerHTML = '';
    setAlert('alert-busqueda', '', '');
    document.getElementById('btn-buscar').disabled = true;

    if (focusInput) setTimeout(() => input.focus(), 50);
  },

  onBusquedaInput() {
    const val = document.getElementById('input-busqueda').value;
    // Para numéricos, filtrar caracteres no numéricos
    if (['dni','cuit','celular'].includes(State.criteria)) {
      const clean = val.replace(/\D/g, '');
      document.getElementById('input-busqueda').value = clean;
      document.getElementById('btn-buscar').disabled = clean.length < 3;
    } else {
      document.getElementById('btn-buscar').disabled = val.trim().length < 2;
    }
    document.getElementById('results-busqueda').innerHTML = '';
    setAlert('alert-busqueda', '', '');
  },

  onBusquedaKey(event) {
    if (event.key === 'Enter') this.buscar();
  },

  // ── Búsqueda ─────────────────────────────────────────────
  async buscar() {
    const query = document.getElementById('input-busqueda').value.trim();
    if (!query) return;

    setLoading('btn-buscar', 'spinner-buscar', 'btn-buscar-text', true);
    setAlert('alert-busqueda', '', '');
    document.getElementById('results-busqueda').innerHTML = '';

    const dataset = State.dia === 'viernes7' ? DB.directivos : DB.docentes;
    const resultados = searchPersonas(dataset, State.criteria, query);

    await new Promise(r => setTimeout(r, 200)); // pequeño delay UX

    setLoading('btn-buscar', 'spinner-buscar', 'btn-buscar-text', false);

    if (resultados.length === 0) {
      setAlert('alert-busqueda', 'warning',
        'No se encontró ninguna persona con ese criterio de búsqueda.');
      return;
    }

    if (resultados.length === 1) {
      // Un único resultado → ir directo al popup
      await this._seleccionarPersona(resultados[0]);
      return;
    }

    // Múltiples resultados → mostrar lista
    App._tempResults = resultados;
    const lista = document.getElementById('results-busqueda');
    lista.innerHTML = resultados.slice(0, 10).map((p, i) => `
      <div class="result-item" id="result-item-${i}" onclick="App._seleccionarPersona(App._tempResults[${i}])">
        <div>
          <div class="name">${p.NOMBRE || ''} ${p.APELLIDO || ''}</div>
          <div class="meta">DNI: ${p.DNI || '—'} · ${p.ROL || p.ESCUELA || '—'}</div>
        </div>
        <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>`).join('');

    if (resultados.length > 10) {
      setAlert('alert-busqueda', 'info',
        `Se encontraron ${resultados.length} personas. Mostrando las primeras 10. Refiná la búsqueda para ver más.`);
    }
  },

  _tempResults: [],

  // ── Seleccionar persona de la lista → mostrar popup ────────
  async _seleccionarPersona(persona) {
    State.persona = persona;

    // Consultar si ya tiene registro en Firestore
    const registro = await this._checkRegistro(persona);
    State.registroActual = registro;

    this._mostrarConfirmacion(persona, registro);
  },

  // ── Verificar registro existente en Firestore ───────────────
  async _checkRegistro(persona) {
    if (!db) return null;
    const idKey = persona.DNI || persona.CUIT || '';
    if (!idKey) return null;
    try {
      const snap = await db.collection('asistencia_meta')
        .where('dia',   '==', State.dia)
        .where('idKey', '==', idKey)
        .limit(1).get();
      if (snap.empty) return null;
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (e) {
      console.warn('Firestore error:', e);
      return null;
    }
  },

  // ── Mostrar modal de confirmación ───────────────────────────
  _mostrarConfirmacion(persona, registro) {
    // Determinar estado: ENTRADA o SALIDA o COMPLETO
    let estado = 'entrada';
    if (registro && registro.entrada && registro.salida) {
      estado = 'completo';
    } else if (registro && registro.entrada && !registro.salida) {
      estado = 'salida';
    }

    // Banner de estado
    const banner = document.getElementById('confirm-status-banner');
    const statusText = document.getElementById('confirm-status-text');
    const statusIcon = document.getElementById('confirm-status-icon');
    banner.className = 'confirm-status-banner';

    if (estado === 'entrada') {
      banner.classList.add('banner-entrada');
      statusIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`;
      statusText.textContent = 'Vas a marcar ENTRADA';
    } else if (estado === 'salida') {
      banner.classList.add('banner-salida');
      statusIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
      statusText.textContent = `Vas a marcar SALIDA — Entrada: ${registro.entrada}`;
    } else {
      banner.classList.add('banner-completo');
      statusIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      statusText.textContent = `Asistencia completa — Entrada: ${registro.entrada} · Salida: ${registro.salida}`;
    }

    // Nombre
    document.getElementById('confirm-person-name').textContent =
      `${persona.NOMBRE || ''} ${persona.APELLIDO || ''}`.trim();

    // Todos los datos
    const labels = State.dia === 'viernes7' ? LABELS_DIR : LABELS_DOC;
    const campos = HEADERS
      ? (State.dia === 'viernes7' ? HEADERS.directivos : HEADERS.docentes)
      : Object.keys(persona);

    const rows = campos
      .filter(key => labels[key] && persona[key] != null && persona[key] !== '')
      .map(key => `
        <div class="detail-row">
          <span class="label">${labels[key] || key}</span>
          <span class="value">${persona[key]}</span>
        </div>`).join('');

    document.getElementById('confirm-details').innerHTML = rows || '<p style="color:var(--md-outline)">Sin datos adicionales</p>';

    // Botón de confirmar
    const btnConfirmar = document.getElementById('btn-confirmar');
    const btnText = document.getElementById('btn-confirmar-text');
    if (estado === 'completo') {
      btnConfirmar.disabled = true;
      btnText.textContent = 'Asistencia ya registrada';
      btnConfirmar.className = 'btn btn-outlined';
    } else {
      btnConfirmar.disabled = false;
      btnText.textContent = estado === 'entrada' ? 'Confirmar entrada' : 'Confirmar salida';
      btnConfirmar.className = estado === 'entrada' ? 'btn btn-filled-success' : 'btn btn-filled-salida';
    }

    setAlert('alert-confirmar', '', '');

    // Abrir modal
    document.getElementById('modal-confirm').classList.add('open');
    // Resetear scroll
    setTimeout(() => {
      const scroll = document.querySelector('.confirm-details-scroll');
      if (scroll) scroll.scrollTop = 0;
    }, 50);
  },

  closeConfirm() {
    document.getElementById('modal-confirm').classList.remove('open');
  },

  closeConfirmIfOutside(e) {
    if (e.target === document.getElementById('modal-confirm')) this.closeConfirm();
  },

  // ── Confirmar asistencia ─────────────────────────────────────
  async confirmar() {
    const persona  = State.persona;
    const registro = State.registroActual;
    if (!persona) return;

    const estado = !registro ? 'entrada'
      : (registro.entrada && !registro.salida) ? 'salida' : 'completo';
    if (estado === 'completo') return;

    setLoading('btn-confirmar', 'spinner-confirmar', 'btn-confirmar-text', true);
    setAlert('alert-confirmar', '', '');

    const idKey = persona.DNI || persona.CUIT || '';
    const ahora = horaLocal();
    const hoja  = State.dia === 'viernes7' ? 'DIRECTIVOS' : 'DOCENTES';

    try {
      if (estado === 'entrada') {
        // Primera vez: crear registro con entrada
        const record = {
          dia:    State.dia,
          hoja,
          idKey,
          nombre:   persona.NOMBRE   || '',
          apellido: persona.APELLIDO || '',
          entrada:  ahora,
          salida:   null,
          esNuevo:  false,
          timestamp_entrada: firebase.firestore.FieldValue.serverTimestamp(),
          timestamp_salida:  null,
          datos: persona,
        };
        if (db) await db.collection('asistencia_meta').add(record);
      } else {
        // Segunda vez: actualizar con salida
        if (db) await db.collection('asistencia_meta').doc(registro.id).update({
          salida: ahora,
          timestamp_salida: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }

      this.closeConfirm();
      this._mostrarExito(
        `${persona.NOMBRE || ''} ${persona.APELLIDO || ''}`.trim(),
        estado,
        ahora
      );
    } catch (e) {
      console.error(e);
      setLoading('btn-confirmar', 'spinner-confirmar', 'btn-confirmar-text', false);
      setAlert('alert-confirmar', 'error',
        'Error al guardar. Verificá la conexión e intentá de nuevo.');
    }
  },

  // ── Inscribir caso excepcional ───────────────────────────────
  async inscribirExcepcional() {
    const campos = {
      dia:         document.getElementById('exc-dia').value,
      rol:         document.getElementById('exc-rol').value,
      nombre:      document.getElementById('exc-nombre').value.trim(),
      apellido:    document.getElementById('exc-apellido').value.trim(),
      dni:         document.getElementById('exc-dni').value.trim(),
      cuit:        document.getElementById('exc-cuit').value.trim(),
      celular:     document.getElementById('exc-celular').value.trim(),
      mail:        document.getElementById('exc-mail').value.trim(),
      escuela:     document.getElementById('exc-escuela').value.trim(),
    };

    // Validar obligatorios
    const obligatorios = ['dia','rol','nombre','apellido','dni','cuit','celular','mail','escuela'];
    const faltantes = obligatorios.filter(k => !campos[k]);
    if (faltantes.length > 0) {
      setAlert('alert-excepcional', 'error',
        'Completá todos los campos obligatorios (marcados con *).');
      return;
    }

    // Validar mail
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campos.mail)) {
      setAlert('alert-excepcional', 'error', 'El mail ingresado no es válido.');
      return;
    }

    setLoading('btn-inscribir-exc', 'spinner-excepcional', 'btn-inscribir-exc-text', true);
    setAlert('alert-excepcional', '', '');

    const idKey = campos.dni || campos.cuit;
    const ahora = horaLocal();

    const record = {
      dia:    campos.dia,
      hoja:   'EXCEPCIONAL',
      idKey,
      nombre:   campos.nombre,
      apellido: campos.apellido,
      entrada:  ahora,
      salida:   null,
      esNuevo:  true,
      timestamp_entrada: firebase.firestore.FieldValue.serverTimestamp(),
      timestamp_salida:  null,
      datos: {
        ROL:         campos.rol,
        NOMBRE:      campos.nombre,
        APELLIDO:    campos.apellido,
        DNI:         campos.dni,
        CUIT:        campos.cuit,
        CELULAR:     campos.celular,
        EMAIL:       campos.mail,
        ESCUELA:     campos.escuela,
        NACIMIENTO:  document.getElementById('exc-nacimiento').value  || null,
        DEPARTAMENTO:document.getElementById('exc-departamento').value.trim() || null,
        NIVEL:       document.getElementById('exc-nivel').value        || null,
        NODO:        document.getElementById('exc-nodo').value.trim()  || null,
      },
    };

    try {
      if (db) await db.collection('asistencia_meta').add(record);
      setLoading('btn-inscribir-exc', 'spinner-excepcional', 'btn-inscribir-exc-text', false);
      State.returnScreen = 'screen-home';
      this._mostrarExito(
        `${campos.nombre} ${campos.apellido}`,
        'entrada',
        ahora,
        true
      );
    } catch (e) {
      console.error(e);
      setLoading('btn-inscribir-exc', 'spinner-excepcional', 'btn-inscribir-exc-text', false);
      setAlert('alert-excepcional', 'error',
        'Error al guardar. Verificá la conexión e intentá de nuevo.');
    }
  },

  // ── Pantalla de éxito ────────────────────────────────────────
  _mostrarExito(nombreCompleto, tipo, hora, esNuevo = false) {
    document.getElementById('success-name').textContent = nombreCompleto;

    const sub  = document.getElementById('success-sub');
    const badge = document.getElementById('success-badge');
    const det   = document.getElementById('success-details');

    if (esNuevo) {
      sub.textContent = 'Inscripción y asistencia registradas';
      badge.innerHTML = `<span class="status-badge badge-excepcional">Caso excepcional</span>`;
      det.innerHTML   = `Entrada registrada a las <strong>${hora}</strong>`;
    } else if (tipo === 'entrada') {
      sub.textContent = 'Entrada registrada correctamente';
      badge.innerHTML = `<span class="status-badge badge-entrada">Entrada · ${hora}</span>`;
      det.innerHTML   = `Hora de entrada: <strong>${hora}</strong>`;
    } else {
      sub.textContent = 'Salida registrada correctamente';
      badge.innerHTML = `<span class="status-badge badge-salida">Salida · ${hora}</span>`;
      det.innerHTML   = `Hora de salida: <strong>${hora}</strong>`;
    }

    // Restart countdown animation
    const fill = document.getElementById('countdown-fill');
    fill.style.animation = 'none';
    fill.offsetHeight; // reflow
    fill.style.animation = '';

    showScreen('screen-success');

    // Volver a la pantalla correspondiente tras 4s
    const returnTo = esNuevo ? 'screen-home' : 'screen-busqueda';
    setTimeout(() => {
      if (returnTo === 'screen-busqueda' && State.dia) {
        // Limpiar búsqueda y volver
        document.getElementById('input-busqueda').value = '';
        document.getElementById('results-busqueda').innerHTML = '';
        setAlert('alert-busqueda', '', '');
        document.getElementById('btn-buscar').disabled = true;
      }
      showScreen(returnTo);
    }, 4000);
  },

  // ── Panel de asistencia ──────────────────────────────────────
  async openPanel() {
    document.getElementById('modal-panel').classList.add('open');
    document.getElementById('panel-search-input').value = '';
    await this._loadPanel();
  },

  closePanel() {
    document.getElementById('modal-panel').classList.remove('open');
  },

  closePanelIfOutside(e) {
    if (e.target === document.getElementById('modal-panel')) this.closePanel();
  },

  async _loadPanel() {
    if (!db) {
      this._renderPanel([]);
      return;
    }
    try {
      const snap = await db.collection('asistencia_meta')
        .orderBy('timestamp_entrada', 'desc')
        .get();
      State.panelRecords = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this._updateStats(State.panelRecords);
      this._renderPanel(State.panelRecords);
    } catch (e) {
      console.warn('Firestore error:', e);
      this._renderPanel([]);
    }
  },

  _updateStats(records) {
    const total       = records.length;
    const viernes     = records.filter(r => r.dia === 'viernes7').length;
    const sabado      = records.filter(r => r.dia === 'sabado8').length;
    const completos   = records.filter(r => r.entrada && r.salida).length;
    const excepc      = records.filter(r => r.esNuevo).length;

    document.getElementById('stat-total').textContent       = total;
    document.getElementById('stat-viernes').textContent     = viernes;
    document.getElementById('stat-sabado').textContent      = sabado;
    document.getElementById('stat-completos').textContent   = completos;
    document.getElementById('stat-excepcionales').textContent = excepc;
  },

  setTab(tab) {
    State.panelTab = tab;
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab === 'todos' ? 'todos' : tab === 'viernes7' ? 'viernes7' : tab === 'sabado8' ? 'sabado8' : 'excep'}`).classList.add('active');
    this.buscarEnPanel();
  },

  buscarEnPanel() {
    const query = (document.getElementById('panel-search-input').value || '').trim().toLowerCase();
    let filtered = State.panelRecords;

    // Filtrar por tab
    if (State.panelTab === 'viernes7') {
      filtered = filtered.filter(r => r.dia === 'viernes7');
    } else if (State.panelTab === 'sabado8') {
      filtered = filtered.filter(r => r.dia === 'sabado8');
    } else if (State.panelTab === 'excepcional') {
      filtered = filtered.filter(r => r.esNuevo);
    }

    // Filtrar por búsqueda
    if (query.length >= 2) {
      filtered = filtered.filter(r => {
        const nombre   = ((r.nombre || '') + ' ' + (r.apellido || '')).toLowerCase();
        const idKey    = (r.idKey || '').toLowerCase();
        return nombre.includes(query) || idKey.includes(query);
      });
    }

    this._renderPanel(filtered);
  },

  _renderPanel(records) {
    const lista = document.getElementById('panel-list');
    if (records.length === 0) {
      lista.innerHTML = `<div class="panel-empty">Sin registros para mostrar</div>`;
      return;
    }

    lista.innerHTML = records.map(r => {
      const nombre = `${r.nombre || ''} ${r.apellido || ''}`.trim() || 'Sin nombre';
      const idKey  = r.idKey || '—';

      let estadoBadge = '';
      if (r.entrada && r.salida) {
        estadoBadge = `<span class="status-badge badge-completo">Completo</span>`;
      } else if (r.entrada) {
        estadoBadge = `<span class="status-badge badge-entrada">Solo entrada</span>`;
      } else {
        estadoBadge = `<span class="status-badge badge-pendiente">Pendiente</span>`;
      }

      if (r.esNuevo) {
        estadoBadge += `<span class="status-badge badge-excepcional">Nuevo</span>`;
      }

      const diaLabel = r.dia === 'viernes7' ? 'Vie 7/8' : r.dia === 'sabado8' ? 'Sáb 8/8' : 'Exc.';

      return `
        <div class="attendee-item">
          <div class="attendee-header">
            <div>
              <div class="attendee-name">${nombre}</div>
              <div class="attendee-meta">DNI/ID: ${idKey} · ${diaLabel}</div>
            </div>
            <div class="attendee-badges">${estadoBadge}</div>
          </div>
          <div class="attendee-horarios">
            <span class="horario-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Entrada: ${r.entrada || '—'}
            </span>
            <span class="horario-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Salida: ${r.salida || '—'}
            </span>
          </div>
        </div>`;
    }).join('');
  },

  // ── Exportar a Excel ─────────────────────────────────────────
  exportExcel() {
    const records = State.panelRecords;
    if (records.length === 0) {
      alert('No hay registros para exportar.');
      return;
    }

    const rows = records.map(r => ({
      'Día':       r.dia === 'viernes7' ? 'Viernes 7/8' : r.dia === 'sabado8' ? 'Sábado 8/8' : 'Excepcional',
      'Nombre':    r.nombre || '',
      'Apellido':  r.apellido || '',
      'DNI/ID':    r.idKey || '',
      'Entrada':   r.entrada || '',
      'Salida':    r.salida  || '',
      'Es nuevo':  r.esNuevo ? 'Sí' : 'No',
      'Hoja':      r.hoja || '',
      ...Object.fromEntries(
        Object.entries(r.datos || {}).map(([k, v]) => [`Dato: ${k}`, v || ''])
      ),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    XLSX.writeFile(wb, `asistencia_meta_${hoyISO()}.xlsx`);
  },
};
