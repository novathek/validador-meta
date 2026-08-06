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
    document.getElementById('stat-completos').textContent = r.filter(x => x.entrada && x.salida).length;
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
      case 'viernes7':
        filtered = filtered.filter(r => r.dia === 'viernes7'); break;
      case 'sabado8':
        filtered = filtered.filter(r => r.dia === 'sabado8'); break;
      case 'excepcional':
        filtered = filtered.filter(r => r.esNuevo); break;
      case 'solo-entrada':
        filtered = filtered.filter(r => r.entrada && !r.salida); break;
      case 'completos':
        filtered = filtered.filter(r => r.entrada && r.salida); break;
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
      if (r.entrada && r.salida) {
        badges += `<span class="status-badge badge-completo">Completo</span>`;
      } else if (r.entrada) {
        badges += `<span class="status-badge badge-entrada">Solo entrada</span>`;
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
      // ID seguro para usar como atributo HTML (sin chars especiales)
      const safeId = r.id.replace(/[^a-zA-Z0-9_-]/g, '_');

      const entradaVal = r.entrada ? r.entrada.replace(/\s/g, '') : '';
      const salidaVal  = r.salida  ? r.salida.replace(/\s/g, '')  : '';

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

          <!-- Horarios actuales -->
          <div class="admin-item-horarios" id="horarios-${safeId}">
            <span class="horario-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Entrada: <strong>${r.entrada || '—'}</strong>
            </span>
            <span class="horario-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Salida: <strong>${r.salida || '—'}</strong>
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
            <div class="edit-fields">
              <div class="edit-field-group">
                <label class="edit-label">Entrada</label>
                <div class="edit-input-row">
                  <input class="edit-time-input" id="inp-entrada-${safeId}"
                    type="time" value="${entradaVal}" />
                  <button class="btn-clear-time"
                    onclick="Admin.clearField('${r.id}', 'entrada', '${safeId}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Borrar
                  </button>
                </div>
              </div>
              <div class="edit-field-group">
                <label class="edit-label">Salida</label>
                <div class="edit-input-row">
                  <input class="edit-time-input" id="inp-salida-${safeId}"
                    type="time" value="${salidaVal}" />
                  <button class="btn-clear-time"
                    onclick="Admin.clearField('${r.id}', 'salida', '${safeId}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Borrar
                  </button>
                </div>
              </div>
            </div>
            <div class="edit-actions">
              <button class="btn-save-edit" id="btn-save-${safeId}"
                onclick="Admin.saveEdit('${r.id}', '${safeId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Guardar cambios
              </button>
              <button class="btn-cancel-edit" onclick="Admin.toggleEdit('${safeId}', false)">
                Cancelar
              </button>
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
    const inpEntrada = document.getElementById(`inp-entrada-${safeId}`);
    const inpSalida  = document.getElementById(`inp-salida-${safeId}`);
    const btn        = document.getElementById(`btn-save-${safeId}`);
    const alertEl    = document.getElementById(`edit-alert-${safeId}`);
    if (!inpEntrada || !inpSalida) return;

    // Convierte "HH:MM" del input type=time al mismo formato
    const toTimeStr = v => {
      if (!v) return null;
      const parts = v.split(':');
      return parts.length >= 2
        ? `${parts[0].padStart(2,'0')}:${parts[1].padStart(2,'0')}`
        : null;
    };

    const nuevaEntrada = toTimeStr(inpEntrada.value);
    const nuevaSalida  = toTimeStr(inpSalida.value);

    if (nuevaEntrada && nuevaSalida && nuevaSalida < nuevaEntrada) {
      if (alertEl) alertEl.innerHTML = '<div class="alert error">La salida no puede ser anterior a la entrada.</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    if (alertEl) alertEl.innerHTML = '';

    try {
      await db.collection('asistencia_meta').doc(docId).update({
        entrada: nuevaEntrada,
        salida:  nuevaSalida,
      });
      if (alertEl) alertEl.innerHTML = '<div class="alert success">✔ Horarios actualizados correctamente.</div>';
      setTimeout(() => this.toggleEdit(safeId, false), 1500);
    } catch(e) {
      if (alertEl) alertEl.innerHTML = `<div class="alert error">Error al guardar: ${e.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Guardar cambios`;
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
        // Asistencia
        'Entrada':           asist ? (asist.entrada || '') : '',
        'Salida':            asist ? (asist.salida  || '') : '',
        'Asistió':           asist ? 'Sí' : 'No',
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
