/* ================================================================
   admin.js — Panel de Administración · Capacitación META 2026
   Lee de la colección 'asistencia_meta' en Firestore.
   Export completo cruza personas_meta + asistencia_meta.
   ================================================================ */

'use strict';

// ── Firebase init ───────────────────────────────────────────────
let db;
try {
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
  console.log('[Admin Firebase] conectado');
} catch (e) {
  console.warn('[Admin Firebase] error:', e.message);
  document.getElementById('admin-list').innerHTML =
    '<div class="empty-state">Error al conectar con Firebase. Verificá la configuración.</div>';
}

// ── Utilidades ──────────────────────────────────────────────────
function hoyISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

// Labels en español para los campos del Excel (esquema unificado)
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
  MARCA_TEMPORAL: 'Fecha inscripción',
};

// ================================================================
//   Admin — objeto principal
// ================================================================
const Admin = {
  records:       [],
  currentFilter: 'all',
  expandedItems: new Set(),

  // ── Iniciar escucha en tiempo real ──────────────────────────
  init() {
    if (!db) {
      document.getElementById('admin-list').innerHTML =
        '<div class="empty-state">Firebase no está configurado correctamente.</div>';
      return;
    }

    // Sin orderBy → evita requerir índice compuesto en Firestore.
    // El ordenamiento se hace localmente después de cargar.
    db.collection('asistencia_meta')
      .onSnapshot(snap => {
        this.records = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Ordenar localmente: más recientes primero
        this.records.sort((a, b) => {
          const ta = a.entrada || '';
          const tb = b.entrada || '';
          return tb.localeCompare(ta);
        });
        this.renderStats();
        this.applyFilters();
      }, err => {
        console.error('Firestore onSnapshot error:', err);
        document.getElementById('admin-list').innerHTML =
          `<div class="empty-state">Error Firestore: ${err.code} — ${err.message}<br><small>Verificá las reglas de seguridad en la consola de Firebase.</small></div>`;
      });
  },

  // ── Estadísticas ────────────────────────────────────────────
  renderStats() {
    const r = this.records;
    document.getElementById('stat-total').textContent     = r.length;
    document.getElementById('stat-viernes').textContent   = r.filter(x => x.dia === 'viernes7').length;
    document.getElementById('stat-sabado').textContent    = r.filter(x => x.dia === 'sabado8').length;
    // Completo = tiene los 4 registros de turno
    document.getElementById('stat-completos').textContent = r.filter(x =>
      x.entrada_manana && x.salida_manana && x.entrada_tarde && x.salida_tarde
    ).length;
    document.getElementById('stat-nuevos').textContent    = r.filter(x => x.esNuevo).length;
  },

  // ── Filtro por tab ───────────────────────────────────────────
  setFilter(f) {
    this.currentFilter = f;
    document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
    document.getElementById(`filter-${f}`).classList.add('active');
    this.applyFilters();
  },

  // ── Aplicar filtros + búsqueda ───────────────────────────────
  applyFilters() {
    const query = (document.getElementById('admin-search').value || '').trim().toLowerCase();
    let filtered = this.records;

    switch (this.currentFilter) {
      case 'viernes7':    filtered = filtered.filter(r => r.dia === 'viernes7'); break;
      case 'sabado8':     filtered = filtered.filter(r => r.dia === 'sabado8'); break;
      case 'excepcional': filtered = filtered.filter(r => r.esNuevo); break;
      case 'solo-entrada':
        // Tiene al menos entrada mañana pero no tiene los 4
        filtered = filtered.filter(r => r.entrada_manana && !(r.entrada_manana && r.salida_manana && r.entrada_tarde && r.salida_tarde)); break;
      case 'completos':
        filtered = filtered.filter(r => r.entrada_manana && r.salida_manana && r.entrada_tarde && r.salida_tarde); break;
    }

    if (query.length >= 2) {
      filtered = filtered.filter(r => {
        const nombre  = ((r.nombre || '') + ' ' + (r.apellido || '')).toLowerCase();
        const idKey   = (r.idKey || '').toLowerCase();
        const escuela = ((r.datos && r.datos.ESCUELA) || (r.datos && r.datos.INSTITUCION) || '').toLowerCase();
        return nombre.includes(query) || idKey.includes(query) || escuela.includes(query);
      });
    }

    const count = document.getElementById('results-count');
    count.textContent = filtered.length > 0
      ? `${filtered.length} registro${filtered.length !== 1 ? 's' : ''} encontrado${filtered.length !== 1 ? 's' : ''}`
      : '';

    this.renderList(filtered);
  },

  // ── Renderizar lista ─────────────────────────────────────────
  renderList(records) {
    const container = document.getElementById('admin-list');

    if (!records || records.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay registros para mostrar.</div>';
      return;
    }

    container.innerHTML = records.map((r, idx) => {
      const nombre   = `${r.nombre || ''} ${r.apellido || ''}`.trim() || 'Sin nombre';
      const idKey    = r.idKey || '—';
      const diaLabel = r.dia === 'viernes7' ? 'Viernes 7 Ago — Dir./Supervisores'
                     : r.dia === 'sabado8'  ? 'Sábado 8 Ago — Docentes'
                     : 'Excepcional';

      // Badges
      let badges = '';
      const esCompleto = r.entrada_manana && r.salida_manana && r.entrada_tarde && r.salida_tarde;
      const tieneMitad = r.entrada_manana || r.salida_manana || r.entrada_tarde;
      if (esCompleto) {
        badges += `<span class="status-badge badge-completo">Completo</span>`;
      } else if (tieneMitad) {
        badges += `<span class="status-badge badge-entrada">En progreso</span>`;
      } else {
        badges += `<span class="status-badge badge-pendiente">Pendiente</span>`;
      }
      if (r.esNuevo) badges += `<span class="status-badge badge-excepcional">Nuevo</span>`;

      // Datos expandibles
      const datos = r.datos || {};
      const datosRows = Object.entries(datos)
        .filter(([k, v]) => v != null && v !== '')
        .map(([k, v]) => `
          <div class="detail-row">
            <span class="label">${LABELS[k] || k}</span>
            <span class="value">${v}</span>
          </div>`).join('');

      const isExpanded = this.expandedItems.has(r.id);
      const safeId = r.id.replace(/[^a-zA-Z0-9_-]/g, '_');

      const fmt = v => v ? v.replace(/\s/g, '') : '';

      return `
        <div class="admin-item" style="animation-delay:${idx * 0.04}s" id="item-${safeId}">

          <!-- Encabezado: nombre y badges -->
          <div class="admin-item-header">
            <div>
              <div class="admin-item-name">${nombre}</div>
              <div class="admin-item-meta">DNI/ID: ${idKey} · ${diaLabel}</div>
            </div>
            <div class="admin-item-badges">${badges}</div>
          </div>

          <!-- Horarios: 4 turnos -->
          <div class="admin-item-horarios" id="horarios-${safeId}">
            <span class="horario-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Mañana: <strong>${r.entrada_manana || '—'}</strong> – <strong>${r.salida_manana || '—'}</strong>
            </span>
            <span class="horario-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Tarde: <strong>${r.entrada_tarde || '—'}</strong> – <strong>${r.salida_tarde || '—'}</strong>
            </span>
          </div>

          <!-- Panel de corrección de horarios (oculto por defecto) -->
          <div class="edit-panel" id="edit-${safeId}" style="display:none;">
            <div class="edit-panel-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Corregir horarios
            </div>
            <div style="font-size:.8rem;color:var(--md-outline);margin-bottom:8px;">Turno Mañana</div>
            <div class="edit-fields">
              <div class="edit-field-group">
                <label class="edit-label">Entrada</label>
                <div class="edit-input-row">
                  <input class="edit-time-input" id="inp-em-${safeId}" type="time" value="${fmt(r.entrada_manana)}" />
                  <button class="btn-clear-time" onclick="Admin.clearField('${r.id}', 'entrada_manana', '${safeId}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Borrar
                  </button>
                </div>
              </div>
              <div class="edit-field-group">
                <label class="edit-label">Salida</label>
                <div class="edit-input-row">
                  <input class="edit-time-input" id="inp-sm-${safeId}" type="time" value="${fmt(r.salida_manana)}" />
                  <button class="btn-clear-time" onclick="Admin.clearField('${r.id}', 'salida_manana', '${safeId}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Borrar
                  </button>
                </div>
              </div>
            </div>
            <div style="font-size:.8rem;color:var(--md-outline);margin:8px 0;">Turno Tarde</div>
            <div class="edit-fields">
              <div class="edit-field-group">
                <label class="edit-label">Entrada</label>
                <div class="edit-input-row">
                  <input class="edit-time-input" id="inp-et-${safeId}" type="time" value="${fmt(r.entrada_tarde)}" />
                  <button class="btn-clear-time" onclick="Admin.clearField('${r.id}', 'entrada_tarde', '${safeId}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Borrar
                  </button>
                </div>
              </div>
              <div class="edit-field-group">
                <label class="edit-label">Salida</label>
                <div class="edit-input-row">
                  <input class="edit-time-input" id="inp-st-${safeId}" type="time" value="${fmt(r.salida_tarde)}" />
                  <button class="btn-clear-time" onclick="Admin.clearField('${r.id}', 'salida_tarde', '${safeId}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Borrar
                  </button>
                </div>
              </div>
            </div>
            <div class="edit-actions">
              <button class="btn-save-edit" id="btn-save-${safeId}" onclick="Admin.saveEdit('${r.id}', '${safeId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Guardar cambios
              </button>
              <button class="btn-cancel-edit" onclick="Admin.toggleEdit('${safeId}', false)">Cancelar</button>
            </div>
            <div id="edit-alert-${safeId}" style="margin-top:8px;"></div>
          </div>

          <!-- Botonera inferior -->
          <div class="admin-item-footer">
            <div style="display:flex;gap:6px;">
              <button class="btn-expand" onclick="Admin.toggleDatos('${r.id}', this)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="${isExpanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"/>
                </svg>
                ${isExpanded ? 'Ocultar datos' : 'Ver datos'}
              </button>
              <button class="btn-expand btn-edit-toggle" id="btn-edit-toggle-${safeId}"
                onclick="Admin.toggleEdit('${safeId}', null)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Corregir horario
              </button>
            </div>
            <button class="btn-delete"
              onclick="Admin.deleteRecord('${r.id}', '${nombre.replace(/'/g, "\\'")}')"
              title="Eliminar registro">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>

          <!-- Datos expandibles -->
          <div class="admin-item-datos ${isExpanded ? 'open' : ''}" id="datos-${r.id}">
            <div class="person-details">${datosRows || '<p style="color:var(--md-outline);font-size:.8rem;">Sin datos adicionales</p>'}</div>
          </div>

        </div>`;
    }).join('');
  },

  // ── Expandir/colapsar datos ─────────────────────────────────
  toggleDatos(id, btn) {
    const el = document.getElementById(`datos-${id}`);
    if (!el) return;
    const isOpen = el.classList.toggle('open');
    this.expandedItems[isOpen ? 'add' : 'delete'](id);
    const icon = isOpen
      ? '<polyline points="18 15 12 9 6 15"/>'
      : '<polyline points="6 9 12 15 18 9"/>';
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${icon}</svg>
      ${isOpen ? 'Ocultar datos' : 'Ver datos'}`;
  },

  // ── Mostrar/ocultar panel de corrección de horarios ─────────
  toggleEdit(safeId, forceOpen) {
    const panel  = document.getElementById(`edit-${safeId}`);
    const toggle = document.getElementById(`btn-edit-toggle-${safeId}`);
    if (!panel) return;
    const isOpen = forceOpen !== null ? forceOpen : (panel.style.display === 'none');
    panel.style.display = isOpen ? 'block' : 'none';
    if (toggle) {
      toggle.style.background  = isOpen ? 'var(--md-primary-container)' : '';
      toggle.style.color       = isOpen ? 'var(--md-primary)'           : '';
      toggle.style.borderColor = isOpen ? 'var(--md-primary)'           : '';
    }
    const alertEl = document.getElementById(`edit-alert-${safeId}`);
    if (alertEl) alertEl.innerHTML = '';
  },

  // ── Borrar solo entrada o solo salida ───────────────────────
  async clearField(docId, field, safeId) {
    const label = field === 'entrada' ? 'entrada' : 'salida';
    const ok = confirm(`¿Estás seguro de BORRAR la ${label}? Esta acción no se puede deshacer.`);
    if (!ok) return;
    const alertEl = document.getElementById(`edit-alert-${safeId}`);
    try {
      await db.collection('asistencia_meta').doc(docId).update({ [field]: null });
      if (alertEl) alertEl.innerHTML = `<div class="alert success">✔ ${label.charAt(0).toUpperCase() + label.slice(1)} borrada correctamente.</div>`;
      const inp = document.getElementById(`inp-${field}-${safeId}`);
      if (inp) inp.value = '';
    } catch(e) {
      if (alertEl) alertEl.innerHTML = `<div class="alert error">Error: ${e.message}</div>`;
    }
  },

  // ── Guardar corrección de horarios ──────────────────────────
  async saveEdit(docId, safeId) {
    const fields = ['em', 'sm', 'et', 'st'];
    const fieldMap = { em: 'entrada_manana', sm: 'salida_manana', et: 'entrada_tarde', st: 'salida_tarde' };
    const btn     = document.getElementById(`btn-save-${safeId}`);
    const alertEl = document.getElementById(`edit-alert-${safeId}`);

    const toTimeStr = v => {
      if (!v) return null;
      const parts = v.split(':');
      return parts.length >= 2 ? `${parts[0].padStart(2,'0')}:${parts[1].padStart(2,'0')}` : null;
    };

    const updates = {};
    for (const f of fields) {
      const inp = document.getElementById(`inp-${f}-${safeId}`);
      if (inp) updates[fieldMap[f]] = toTimeStr(inp.value);
    }

    // Validar que dentro de cada turno entrada <= salida
    if (updates.entrada_manana && updates.salida_manana && updates.salida_manana < updates.entrada_manana) {
      if (alertEl) alertEl.innerHTML = '<div class="alert error">La salida mañana no puede ser anterior a la entrada mañana.</div>';
      return;
    }
    if (updates.entrada_tarde && updates.salida_tarde && updates.salida_tarde < updates.entrada_tarde) {
      if (alertEl) alertEl.innerHTML = '<div class="alert error">La salida tarde no puede ser anterior a la entrada tarde.</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    if (alertEl) alertEl.innerHTML = '';

    try {
      await db.collection('asistencia_meta').doc(docId).update(updates);
      if (alertEl) alertEl.innerHTML = '<div class="alert success">✔ Horarios actualizados correctamente.</div>';
      setTimeout(() => this.toggleEdit(safeId, false), 1500);
    } catch(e) {
      if (alertEl) alertEl.innerHTML = `<div class="alert error">Error al guardar: ${e.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Guardar cambios`;
    }
  },

  // ── Eliminar registro completo ──────────────────────────────
  async deleteRecord(docId, name) {
    const ok = confirm(`¿Eliminar el registro de ${name}? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await db.collection('asistencia_meta').doc(docId).delete();
    } catch (e) {
      alert('Error al eliminar: ' + e.message);
    }
  },

  // ── Exportar Excel COMPLETO cruzando personas_meta + asistencia_meta ──
  async exportExcel() {
    const btn = document.getElementById('btn-export-excel');
    btn.disabled = true;
    btn.textContent = 'Exportando…';

    try {
      if (!db) throw new Error('Firebase no conectado');

      // 1. Leer TODAS las personas del listado definitivo
      const personasSnap = await db.collection('personas_meta').get();
      if (personasSnap.empty) {
        alert('No se encontró la colección personas_meta.\nExportando solo registros de asistencia existentes.');
        await this._exportSoloAsistencia(btn);
        return;
      }

      // 2. Leer todos los registros de asistencia
      const asistSnap = await db.collection('asistencia_meta').get();

      // Mapear asistencias por idKey (DNI) para cruce rápido
      const asistMap = new Map();
      asistSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.idKey) asistMap.set(String(d.idKey).trim(), d);
      });

      // 3. Construir filas del Excel
      const wb = XLSX.utils.book_new();

      const toRow = (persona, asist) => ({
        'Día':               persona.dia === 'viernes7' ? 'Viernes 7 Ago' : 'Sábado 8 Ago',
        'Tipo':              persona.TIPO         || '',
        'Rol':               persona.ROL          || '',
        'Nombre':            persona.NOMBRE       || '',
        'Apellido':          persona.APELLIDO     || '',
        'DNI':               persona.DNI          || '',
        'CUIT/CUIL':         persona.CUIT         || '',
        'Email':             persona.EMAIL        || '',
        'Celular':           persona.CELULAR      || '',
        'Sexo':              persona.SEXO         || '',
        'Nacimiento':        persona.NACIMIENTO   || '',
        'Departamento':      persona.DEPARTAMENTO || '',
        'Escuela':           persona.ESCUELA      || '',
        'Nodo':              persona.NODO         || '',
        'Curso':             persona.CURSO        || '',
        'Nacionalidad':      persona.NACIONALIDAD || '',
        'Domicilio':         persona.DOMICILIO    || '',
        'Cód. Postal':       persona.CODIGO_POSTAL || persona.POSTAL || '',
        'País':              persona.PAIS         || '',
        'Provincia':         persona.PROVINCIA    || '',
        'Grado/Año':         (asist && asist.datos && asist.datos.GRADO_ANO)    || persona.GRADO_ANO    || '',
        'Especialidad':      (asist && asist.datos && asist.datos.ESPECIALIDAD) || persona.ESPECIALIDAD || '',
        'Localidad':         persona.LOCALIDAD    || '',
        'Fecha inscripción': persona.MARCA_TEMPORAL || '',
        // Horarios turno mañana
        'Entrada Mañana':    asist ? (asist.entrada_manana || '') : '',
        'Salida Mañana':     asist ? (asist.salida_manana  || '') : '',
        // Horarios turno tarde
        'Entrada Tarde':     asist ? (asist.entrada_tarde  || '') : '',
        'Salida Tarde':      asist ? (asist.salida_tarde   || '') : '',
        // Resumen
        'Asistió Mañana':    asist && asist.entrada_manana ? 'Sí' : 'No',
        'Asistió Tarde':     asist && asist.entrada_tarde  ? 'Sí' : 'No',
        'Asistencia completa': (asist && asist.entrada_manana && asist.salida_manana && asist.entrada_tarde && asist.salida_tarde) ? 'Sí' : 'No',
        'Caso excepcional':  (asist && asist.esNuevo) ? 'Sí' : '',
      });

      const allPersonas = personasSnap.docs.map(d => d.data());
      const viernes = allPersonas.filter(p => p.dia === 'viernes7');
      const sabado  = allPersonas.filter(p => p.dia === 'sabado8');

      // Helper: construir filas de una lista de personas
      const buildRows = (personas) => {
        const rows = personas.map(p => {
          const asist = asistMap.get(String(p.DNI || '').trim()) || null;
          return toRow(p, asist);
        });
        // Agregar excepcionales que no estén en el listado pero sí asistieron
        asistSnap.docs.forEach(doc => {
          const d = doc.data();
          if (!d.esNuevo) return;
          const dniExc = String(d.idKey || '').trim();
          if (personas.some(p => String(p.DNI || '').trim() === dniExc)) return;
          const esMismoDia = personas === viernes ? d.dia === 'viernes7' : d.dia === 'sabado8';
          if (!esMismoDia) return;
          rows.push({
            'Día':              d.dia === 'viernes7' ? 'Viernes 7 Ago' : 'Sábado 8 Ago',
            'Tipo':             'excepcional',
            'Rol':              (d.datos && d.datos.ROL)     || '',
            'Nombre':           d.nombre    || '',
            'Apellido':         d.apellido  || '',
            'DNI':              d.idKey     || '',
            'CUIT/CUIL':        (d.datos && d.datos.CUIT)    || '',
            'Email':            (d.datos && d.datos.EMAIL)   || '',
            'Celular':          (d.datos && d.datos.CELULAR) || '',
            'Escuela':          (d.datos && d.datos.ESCUELA) || '',
            'Entrada':          d.entrada   || '',
            'Salida':           d.salida    || '',
            'Asistió':          'Sí',
            'Caso excepcional': 'Sí',
          });
        });
        return rows;
      };

      // Hoja "Todos" (todos los 528 + excepcionales)
      const allRows = buildRows(allPersonas);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), 'Todos');

      // Hoja Viernes (directivos + supervisores)
      if (viernes.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildRows(viernes)), 'Viernes 7 - Dir. Superv.');
      }

      // Hoja Sábado (docentes)
      if (sabado.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildRows(sabado)), 'Sabado 8 - Docentes');
      }

      // Hoja Excepcionales (solo los nuevos)
      const excRows = [];
      asistSnap.docs.forEach(doc => {
        const d = doc.data();
        if (!d.esNuevo) return;
        excRows.push({
          'Día':      d.dia === 'viernes7' ? 'Viernes 7 Ago' : 'Sábado 8 Ago',
          'Nombre':   d.nombre   || '',
          'Apellido': d.apellido || '',
          'DNI/ID':   d.idKey    || '',
          'Rol':      (d.datos && d.datos.ROL)    || '',
          'Escuela':  (d.datos && d.datos.ESCUELA) || '',
          'Entrada':  d.entrada  || '',
          'Salida':   d.salida   || '',
        });
      });
      if (excRows.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(excRows), 'Excepcionales');
      }

      XLSX.writeFile(wb, `asistencia_completa_meta_${hoyISO()}.xlsx`);

    } catch (e) {
      console.error(e);
      alert('Error al exportar: ' + e.message);
    }

    this._resetExportBtn(btn);
  },

  // Fallback: exportar solo los registros de asistencia (sin cruzar personas_meta)
  async _exportSoloAsistencia(btn) {
    try {
      const wb = XLSX.utils.book_new();
      const toRows = (recs) => recs.map(r => ({
        'Día':      r.dia === 'viernes7' ? 'Viernes 7 Ago' : r.dia === 'sabado8' ? 'Sábado 8 Ago' : 'Excepcional',
        'Nombre':   r.nombre   || '',
        'Apellido': r.apellido || '',
        'DNI/ID':   r.idKey    || '',
        'Entrada':  r.entrada  || '',
        'Salida':   r.salida   || '',
        'Es nuevo': r.esNuevo  ? 'Sí' : 'No',
        'Hoja':     r.hoja     || '',
        ...Object.fromEntries(Object.entries(r.datos || {}).map(([k, v]) => [LABELS[k] || k, v || ''])),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(this.records)), 'Asistencia');
      XLSX.writeFile(wb, `asistencia_meta_${hoyISO()}.xlsx`);
    } catch(e) {
      alert('Error: ' + e.message);
    }
    this._resetExportBtn(btn);
  },

  _resetExportBtn(btn) {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Exportar a Excel`;
  }
};

// Iniciar al cargar
document.addEventListener('DOMContentLoaded', () => Admin.init());
