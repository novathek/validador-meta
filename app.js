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

// ── Cache local de registros Firestore ──────────────────────────
// Evita consultar Firestore en cada búsqueda. El listener onSnapshot
// mantiene el Map actualizado en tiempo real desde cualquier dispositivo.
const RecordCache = {
  map: new Map(), // clave: 'dia:idKey' → objeto registro

  _key(dia, idKey) { return `${dia}:${String(idKey)}`; },

  // Devuelve el registro (o null) de forma instantánea
  get(dia, idKey) {
    return this.map.get(this._key(dia, idKey)) || null;
  },

  // Guarda o actualiza un registro en el Map
  set(dia, idKey, record) {
    this.map.set(this._key(dia, idKey), record);
  },

  // Aplica actualizaciones parciales a un registro existente
  patch(dia, idKey, updates) {
    const existing = this.get(dia, idKey);
    if (existing) this.map.set(this._key(dia, idKey), { ...existing, ...updates });
  },

  // Elimina un registro del Map
  delete(dia, idKey) {
    this.map.delete(this._key(dia, idKey));
  },

  // Array de todos los registros (para el panel)
  all() { return Array.from(this.map.values()); },
};

// Iniciar listener en tiempo real: sincroniza el cache con Firestore
if (db) {
  db.collection('asistencia_meta')
    .onSnapshot(snap => {
      RecordCache.map.clear();
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (d.dia && d.idKey) {
          RecordCache.set(d.dia, d.idKey, { id: doc.id, ...d });
        }
      });
      console.log(`[Cache] ${RecordCache.map.size} registros sincronizados`);
    }, err => console.warn('[Cache] error de sincronización:', err));
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

// ── Labels en español para mostrar datos (esquema unificado) ────
const LABELS = {
  TIPO:         'Tipo',
  DNI:          'DNI',
  NOMBRE:       'Nombre',
  APELLIDO:     'Apellido',
  ROL:          'Rol',
  EMAIL:        'Email',
  CELULAR:      'Celular',
  CUIT:         'CUIT/CUIL',
  SEXO:         'Sexo',
  NACIMIENTO:   'Nacimiento',
  DEPARTAMENTO: 'Departamento',
  ESCUELA:      'Escuela',
  NODO:         'Nodo',
  CURSO:        'Curso',
  NACIONALIDAD: 'Nacionalidad',
  DOMICILIO:    'Domicilio',
  CODIGO_POSTAL:'Cód. Postal',
  PAIS:         'País',
  PROVINCIA:    'Provincia',
  GRADO_ANO:    'Grado/Año',
  ESPECIALIDAD: 'Especialidad',
  DIRECCION:    'Dirección',
  POSTAL:       'Cód. Postal',
  LOCALIDAD:    'Localidad',
  MARCA_TEMPORAL: 'Fecha de inscripción',
};
// Alias para compatibilidad (los dos días usan el mismo objeto)
const LABELS_DIR = LABELS;
const LABELS_DOC = LABELS;

// ── Estado global ───────────────────────────────────────────────
const State = {
  dia:           null,   // 'viernes7' | 'sabado8'
  criteria:      'dni',  // criterio de búsqueda actual
  persona:       null,   // objeto del DB
  registroActual: null,  // registro Firestore existente (o null)
  panelTab:      'todos',
  panelRecords:  [],
  returnScreen:  'screen-busqueda',
  // Selección obligatoria de campos múltiples (docentes)
  seleccionPendiente: null,  // { campo, opciones, seleccionada }
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

    // Actualizar botones de criterio (funciona con chips o grilla)
    document.querySelectorAll('.chip, .search-grid-btn').forEach(c => {
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
  buscar() {
    const query = document.getElementById('input-busqueda').value.trim();
    if (!query) return;

    setLoading('btn-buscar', 'spinner-buscar', 'btn-buscar-text', true);
    setAlert('alert-busqueda', '', '');
    document.getElementById('results-busqueda').innerHTML = '';

    // Viernes = directivos + supervisores (DB_VIERNES); Sábado = docentes (DB_SABADO)
    const dataset = State.dia === 'viernes7'
      ? (typeof DB_VIERNES !== 'undefined' ? DB_VIERNES : DB.directivos)
      : (typeof DB_SABADO  !== 'undefined' ? DB_SABADO  : DB.docentes);
    const resultados = searchPersonas(dataset, State.criteria, query);

    setLoading('btn-buscar', 'spinner-buscar', 'btn-buscar-text', false);

    if (resultados.length === 0) {
      setAlert('alert-busqueda', 'warning',
        'No se encontró ninguna persona con ese criterio de búsqueda.');
      return;
    }

    if (resultados.length === 1) {
      // Un único resultado → ir directo al popup (instantáneo)
      this._seleccionarPersona(resultados[0]);
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

  // ── Parsear campo con múltiples valores ──────────────────
  // Soporta separador coma (",") y " y " (para especialidades)
  _parsearOpciones(valor) {
    if (!valor) return [];
    // Primero intentar con coma
    const porComa = valor.split(',').map(v => v.trim()).filter(Boolean);
    if (porComa.length > 1) return porComa;
    // Si no, intentar con " y "
    const porY = valor.split(/\s+y\s+/i).map(v => v.trim()).filter(Boolean);
    if (porY.length > 1) return porY;
    return []; // un solo valor
  },

  // Devuelve lista de campos que necesitan selección (sólo docentes, sólo en entrada)
  _camposConMultiples(persona) {
    if (persona.TIPO !== 'docente') return [];
    const campos = [];
    if (this._parsearOpciones(persona.GRADO_ANO).length > 1) {
      campos.push({ campo: 'GRADO_ANO', label: 'Grado/Año', valor: persona.GRADO_ANO });
    }
    if (this._parsearOpciones(persona.ESPECIALIDAD).length > 1) {
      campos.push({ campo: 'ESPECIALIDAD', label: 'Especialidad', valor: persona.ESPECIALIDAD });
    }
    return campos;
  },

  // ── Flujo de selección múltiple ───────────────────────
  // Cola de campos pendientes de selección
  _seleccionQueue: [],

  _iniciarSeleccionSiNecesario(persona, registro) {
    // Solo aplica a docentes en estado "entrada_manana" (primera vez que pasan)
    const r = registro || {};
    const esEntradaManana = !r.entrada_manana;

    if (!esEntradaManana || persona.TIPO !== 'docente') {
      // Ir directo a la confirmación
      this._mostrarConfirmacion(persona, registro);
      return;
    }

    const camposMultiples = this._camposConMultiples(persona);
    if (camposMultiples.length === 0) {
      this._mostrarConfirmacion(persona, registro);
      return;
    }

    // Clonar persona para ir editando los campos seleccionados
    State.persona = { ...persona };
    this._seleccionQueue = camposMultiples.slice(); // copia
    this._mostrarSiguienteSeleccion();
  },

  _mostrarSiguienteSeleccion() {
    if (this._seleccionQueue.length === 0) {
      // Ya resolvieron todos los campos → continuar con confirmación
      this._mostrarConfirmacion(State.persona, State.registroActual);
      return;
    }

    const { campo, label, valor } = this._seleccionQueue[0];
    const opciones = this._parsearOpciones(valor);
    const persona  = State.persona;
    const totalCampos = this._camposConMultiples({ ...persona, [campo]: valor }).length;
    const restantes   = this._seleccionQueue.length;

    // Título del banner
    document.getElementById('seleccion-titulo').textContent = `Elegí tu ${label}`;
    document.getElementById('seleccion-person-name').textContent =
      `${persona.NOMBRE || ''} ${persona.APELLIDO || ''}`.trim();
    document.getElementById('seleccion-desc').textContent =
      `Estás inscripto/a en más de una opción. ` +
      `Selecioná el ${label} en el que vas a participar hoy. Es obligatorio elegir una opción para continuar.`;

    // Generar botones de opción
    const contenedor = document.getElementById('seleccion-opciones');
    contenedor.innerHTML = opciones.map((op, i) => `
      <button class="seleccion-opcion" id="seleccion-opcion-${i}"
        onclick="App._toggleOpcion(${i})" type="button">
        <span class="opcion-radio"></span>
        <span class="opcion-label">${op}</span>
      </button>`).join('');

    // Limpiar alerta
    document.getElementById('alert-seleccion').innerHTML = '';

    // Guardar estado del campo actual
    State.seleccionPendiente = { campo, label, opciones, seleccionada: null };

    document.getElementById('modal-seleccion').classList.add('open');
  },

  _toggleOpcion(idx) {
    // Deseleccionar todos
    document.querySelectorAll('.seleccion-opcion').forEach(btn => btn.classList.remove('selected'));
    // Seleccionar el elegido
    const btn = document.getElementById(`seleccion-opcion-${idx}`);
    if (btn) btn.classList.add('selected');
    // Guardar selección
    State.seleccionPendiente.seleccionada = State.seleccionPendiente.opciones[idx];
    document.getElementById('alert-seleccion').innerHTML = '';
  },

  confirmarSeleccion() {
    const sp = State.seleccionPendiente;
    if (!sp || !sp.seleccionada) {
      document.getElementById('alert-seleccion').innerHTML =
        `<div class="alert warning">Debés seleccionar una opción de ${sp ? sp.label : 'campo'} para continuar.</div>`;
      return;
    }
    // Aplicar la selección a la persona
    State.persona = { ...State.persona, [sp.campo]: sp.seleccionada };
    // Sacar este campo de la cola
    this._seleccionQueue.shift();
    // Cerrar modal y pasar al siguiente
    document.getElementById('modal-seleccion').classList.remove('open');
    setTimeout(() => this._mostrarSiguienteSeleccion(), 200);
  },

  closeSeleccion() {
    document.getElementById('modal-seleccion').classList.remove('open');
  },

  closeSeleccionIfOutside(e) {
    if (e.target === document.getElementById('modal-seleccion')) this.closeSeleccion();
  },

  // ── Seleccionar persona → verificar campos múltiples primero ────
  _seleccionarPersona(persona) {
    State.persona = persona;
    const idKey = persona.DNI || persona.CUIT || '';
    const registro = RecordCache.get(State.dia, idKey);
    State.registroActual = registro;
    // Verificar si necesita selección de campos múltiples antes de confirmar
    this._iniciarSeleccionSiNecesario(persona, registro);
  },

  // ── Mostrar modal de confirmación ───────────────────────────────
  _mostrarConfirmacion(persona, registro) {
    // Determinar estado en base a los 4 campos de turno
    // Secuencia: entrada_manana → salida_manana → entrada_tarde → salida_tarde → completo
    const r = registro || {};
    let estado;
    if (r.entrada_manana && r.salida_manana && r.entrada_tarde && r.salida_tarde) {
      estado = 'completo';
    } else if (r.entrada_manana && r.salida_manana && r.entrada_tarde && !r.salida_tarde) {
      estado = 'salida_tarde';
    } else if (r.entrada_manana && r.salida_manana && !r.entrada_tarde) {
      estado = 'entrada_tarde';
    } else if (r.entrada_manana && !r.salida_manana) {
      estado = 'salida_manana';
    } else {
      estado = 'entrada_manana';
    }

    const SVG_ENTRADA = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`;
    const SVG_SALIDA  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
    const SVG_OK      = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    // Banner de estado
    const banner     = document.getElementById('confirm-status-banner');
    const statusText = document.getElementById('confirm-status-text');
    const statusIcon = document.getElementById('confirm-status-icon');
    banner.className = 'confirm-status-banner';

    const BANNERS = {
      entrada_manana: { cls: 'banner-entrada-manana', icon: SVG_ENTRADA, text: 'Vas a marcar ENTRADA — Turno Mañana' },
      salida_manana:  { cls: 'banner-salida-manana',  icon: SVG_SALIDA,  text: `Vas a marcar SALIDA — Turno Mañana (Entrada: ${r.entrada_manana || ''})` },
      entrada_tarde:  { cls: 'banner-entrada-tarde',  icon: SVG_ENTRADA, text: 'Vas a marcar ENTRADA — Turno Tarde' },
      salida_tarde:   { cls: 'banner-salida-tarde',   icon: SVG_SALIDA,  text: `Vas a marcar SALIDA — Turno Tarde (Entrada: ${r.entrada_tarde || ''})` },
      completo:       { cls: 'banner-completo',       icon: SVG_OK,
        text: `Asistencia completa · M: ${r.entrada_manana||'—'}–${r.salida_manana||'—'} · T: ${r.entrada_tarde||'—'}–${r.salida_tarde||'—'}` },
    };
    const b = BANNERS[estado];
    banner.classList.add(b.cls);
    statusIcon.innerHTML = b.icon;
    statusText.textContent = b.text;

    // Nombre
    document.getElementById('confirm-person-name').textContent =
      `${persona.NOMBRE || ''} ${persona.APELLIDO || ''}`.trim();

    // Todos los datos
    const labels = LABELS;
    const campos = Object.keys(persona);

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
    const spinner  = document.getElementById('spinner-confirmar');
    // Siempre resetear el botón al abrir el modal (por si quedó en estado loading)
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.style.display = 'inline';
    btnConfirmar.disabled = false;

    const BTN_LABELS = {
      entrada_manana: { text: 'Confirmar entrada mañana', cls: 'btn btn-filled-success' },
      salida_manana:  { text: 'Confirmar salida mañana',  cls: 'btn btn-filled-salida' },
      entrada_tarde:  { text: 'Confirmar entrada tarde',  cls: 'btn btn-filled-tarde' },
      salida_tarde:   { text: 'Confirmar salida tarde',   cls: 'btn btn-filled-salida-tarde' },
      completo:       { text: 'Asistencia ya completa',   cls: 'btn btn-outlined' },
    };
    const bl = BTN_LABELS[estado];
    btnText.textContent = bl.text;
    btnConfirmar.className = bl.cls;
    if (estado === 'completo') btnConfirmar.disabled = true;

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

  // ── Confirmar asistencia ───────────────────────────────
  async confirmar() {
    const persona  = State.persona;
    const registro = State.registroActual;
    if (!persona) return;

    // Determinar qué campo toca registrar ahora
    const r = registro || {};
    let estado;
    if (r.entrada_manana && r.salida_manana && r.entrada_tarde && r.salida_tarde) {
      estado = 'completo';
    } else if (r.entrada_manana && r.salida_manana && r.entrada_tarde) {
      estado = 'salida_tarde';
    } else if (r.entrada_manana && r.salida_manana) {
      estado = 'entrada_tarde';
    } else if (r.entrada_manana) {
      estado = 'salida_manana';
    } else {
      estado = 'entrada_manana';
    }
    if (estado === 'completo') return;

    setLoading('btn-confirmar', 'spinner-confirmar', 'btn-confirmar-text', true);
    setAlert('alert-confirmar', '', '');

    const idKey = persona.DNI || persona.CUIT || '';
    const ahora = horaLocal();
    const tipoPersona = persona.TIPO || '';
    const hoja = tipoPersona === 'supervisor' ? 'SUPERVISORES'
               : tipoPersona === 'directivo'  ? 'DIRECTIVOS'
               : tipoPersona === 'docente'    ? 'DOCENTES'
               : (State.dia === 'viernes7'    ? 'DIRECTIVOS' : 'DOCENTES');

    try {
      if (estado === 'entrada_manana') {
        // Primera vez: crear el documento con los 4 campos inicializados
        const record = {
          dia:    State.dia,
          hoja,
          idKey,
          nombre:   persona.NOMBRE   || '',
          apellido: persona.APELLIDO || '',
          entrada_manana: ahora,
          salida_manana:  null,
          entrada_tarde:  null,
          salida_tarde:   null,
          esNuevo:  false,
          timestamp_entrada_manana: firebase.firestore.FieldValue.serverTimestamp(),
          datos: persona,
        };
        if (db) {
          const ref = await db.collection('asistencia_meta').add(record);
          RecordCache.set(State.dia, idKey, { id: ref.id, ...record });
        }
      } else {
        // Actualizaciones sucesivas: solo parchear el campo que corresponde
        const registroActual = RecordCache.get(State.dia, idKey) || registro;
        const docId = registroActual ? registroActual.id : null;

        const campoValor = {};
        if (estado === 'salida_manana') {
          campoValor.salida_manana = ahora;
          campoValor.timestamp_salida_manana = firebase.firestore.FieldValue.serverTimestamp();
        } else if (estado === 'entrada_tarde') {
          campoValor.entrada_tarde = ahora;
          campoValor.timestamp_entrada_tarde = firebase.firestore.FieldValue.serverTimestamp();
        } else if (estado === 'salida_tarde') {
          campoValor.salida_tarde = ahora;
          campoValor.timestamp_salida_tarde = firebase.firestore.FieldValue.serverTimestamp();
        }

        if (db && docId && docId !== '_pending_') {
          await db.collection('asistencia_meta').doc(docId).update(campoValor);
        } else if (db) {
          const snap = await db.collection('asistencia_meta')
            .where('dia',   '==', State.dia)
            .where('idKey', '==', String(idKey))
            .limit(1).get();
          if (!snap.empty) {
            await snap.docs[0].ref.update(campoValor);
          }
        }
        RecordCache.patch(State.dia, idKey, campoValor);
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
      if (db) {
        // Guardar en Firestore y esperar confirmación
        const ref = await db.collection('asistencia_meta').add(record);
        // Actualizar caché con el id real
        RecordCache.set(campos.dia, idKey, { id: ref.id, ...record });
      }
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

    const sub   = document.getElementById('success-sub');
    const badge = document.getElementById('success-badge');
    const det   = document.getElementById('success-details');

    const EXITO_MAP = {
      entrada_manana: { sub: 'Entrada mañana registrada',  badgeCls: 'badge-entrada',       label: 'Entrada mañana' },
      salida_manana:  { sub: 'Salida mañana registrada',   badgeCls: 'badge-salida',        label: 'Salida mañana'  },
      entrada_tarde:  { sub: 'Entrada tarde registrada',   badgeCls: 'badge-entrada-tarde', label: 'Entrada tarde'  },
      salida_tarde:   { sub: 'Salida tarde registrada',    badgeCls: 'badge-salida-tarde',  label: 'Salida tarde'   },
    };

    if (esNuevo) {
      sub.textContent = 'Inscripción y asistencia registradas';
      badge.innerHTML = `<span class="status-badge badge-excepcional">Caso excepcional · ${hora}</span>`;
      det.innerHTML   = '';
    } else {
      const info = EXITO_MAP[tipo] || { sub: 'Asistencia registrada', badgeCls: 'badge-entrada', label: tipo };
      sub.textContent = info.sub;
      badge.innerHTML = `<span class="status-badge ${info.badgeCls}">${info.label} · ${hora}</span>`;
      det.innerHTML   = '';
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

  _loadPanel() {
    // Usa el cache local — sin consulta a Firestore, instantáneo
    State.panelRecords = RecordCache.all();
    this._updateStats(State.panelRecords);
    this._renderPanel(State.panelRecords);
  },

  _updateStats(records) {
    const total     = records.length;
    const viernes   = records.filter(r => r.dia === 'viernes7').length;
    const sabado    = records.filter(r => r.dia === 'sabado8').length;
    const completos = records.filter(r =>
      r.entrada_manana && r.salida_manana && r.entrada_tarde && r.salida_tarde
    ).length;
    const excepc    = records.filter(r => r.esNuevo).length;

    document.getElementById('stat-total').textContent         = total;
    document.getElementById('stat-viernes').textContent       = viernes;
    document.getElementById('stat-sabado').textContent        = sabado;
    document.getElementById('stat-completos').textContent     = completos;
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

      // Badge en base a los 4 campos de turno
      const esCompleto = r.entrada_manana && r.salida_manana && r.entrada_tarde && r.salida_tarde;
      const enProgreso = r.entrada_manana && !esCompleto;

      let estadoBadge = '';
      if (esCompleto) {
        estadoBadge = `<span class="status-badge badge-completo">Completo</span>`;
      } else if (enProgreso) {
        estadoBadge = `<span class="status-badge badge-entrada">En progreso</span>`;
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
              Mañana: ${r.entrada_manana || '—'} – ${r.salida_manana || '—'}
            </span>
            <span class="horario-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Tarde: ${r.entrada_tarde || '—'} – ${r.salida_tarde || '—'}
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
      'Día':                r.dia === 'viernes7' ? 'Viernes 7/8' : r.dia === 'sabado8' ? 'Sábado 8/8' : 'Excepcional',
      'Nombre':             r.nombre   || '',
      'Apellido':           r.apellido || '',
      'DNI/ID':             r.idKey    || '',
      'Entrada Mañana':     r.entrada_manana || '',
      'Salida Mañana':      r.salida_manana  || '',
      'Entrada Tarde':      r.entrada_tarde  || '',
      'Salida Tarde':       r.salida_tarde   || '',
      'Asistió Mañana':     r.entrada_manana ? 'Sí' : 'No',
      'Asistió Tarde':      r.entrada_tarde  ? 'Sí' : 'No',
      'Asistencia completa':(r.entrada_manana && r.salida_manana && r.entrada_tarde && r.salida_tarde) ? 'Sí' : 'No',
      'Es nuevo':           r.esNuevo ? 'Sí' : 'No',
      'Hoja':               r.hoja    || '',
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
