/* ================================================================
   admin.js — Panel de Administración · Capacitación META 2026
   Lee de la colección 'asistencia_meta' en Firestore
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

// Labels en español para los campos del Excel
const LABELS = {
  ROL: 'Rol', NOMBRE: 'Nombre', APELLIDO: 'Apellido',
  NACIONALIDAD: 'Nacionalidad', DOCUMENTO: 'Tipo doc.',
  DNI: 'DNI', EMAIL: 'Email', EMAIL_2: 'Email 2',
  SEXO: 'Sexo', NACIMIENTO: 'Nacimiento', POSTAL: 'Cód. Postal',
  PAIS: 'País', CELULAR: 'Celular', CUIT: 'CUIT',
  DEPARTAMENTO: 'Departamento', NIVEL: 'Nivel', NODO: 'Nodo',
  INSTITUCION: 'Institución', DOMICILIO: 'Domicilio',
  CODIGO_POSTAL: 'Cód. Postal', PROVINCIA: 'Provincia',
  ESCUELA: 'Escuela', GRADO_ANO: 'Grado/Año',
  MATERIA: 'Materia', CURSO: 'Curso',
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
    if (!db) return;

    db.collection('asistencia_meta')
      .orderBy('timestamp_entrada', 'desc')
      .onSnapshot(snap => {
        this.records = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        this.renderStats();
        this.applyFilters();
      }, err => {
        console.error('Firestore error:', err);
        document.getElementById('admin-list').innerHTML =
          `<div class="empty-state">Error al cargar los datos: ${err.message}</div>`;
      });
  },

  // ── Estadísticas ────────────────────────────────────────────
  renderStats() {
    const r = this.records;
    document.getElementById('stat-total').textContent    = r.length;
    document.getElementById('stat-viernes').textContent  = r.filter(x => x.dia === 'viernes7').length;
    document.getElementById('stat-sabado').textContent   = r.filter(x => x.dia === 'sabado8').length;
    document.getElementById('stat-completos').textContent= r.filter(x => x.entrada && x.salida).length;
    document.getElementById('stat-nuevos').textContent   = r.filter(x => x.esNuevo).length;
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

    // Filtro por día/estado
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

    // Filtro por búsqueda de texto
    if (query.length >= 2) {
      filtered = filtered.filter(r => {
        const nombre = ((r.nombre || '') + ' ' + (r.apellido || '')).toLowerCase();
        const idKey  = (r.idKey || '').toLowerCase();
        const escuela = ((r.datos && r.datos.ESCUELA) || (r.datos && r.datos.INSTITUCION) || '').toLowerCase();
        return nombre.includes(query) || idKey.includes(query) || escuela.includes(query);
      });
    }

    // Contador
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
      const nombre = `${r.nombre || ''} ${r.apellido || ''}`.trim() || 'Sin nombre';
      const idKey  = r.idKey || '—';
      const diaLabel = r.dia === 'viernes7' ? 'Viernes 7 Ago — Directivos'
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

      return `
        <div class="admin-item" style="animation-delay:${idx * 0.04}s">
          <div class="admin-item-header">
            <div>
              <div class="admin-item-name">${nombre}</div>
              <div class="admin-item-meta">DNI/ID: ${idKey} · ${diaLabel}</div>
            </div>
            <div class="admin-item-badges">${badges}</div>
          </div>

          <div class="admin-item-horarios">
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

          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <button class="btn-expand" onclick="Admin.toggleDatos('${r.id}', this)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="${isExpanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"/>
              </svg>
              ${isExpanded ? 'Ocultar datos' : 'Ver todos los datos'}
            </button>
            <button class="btn-delete"
              onclick="Admin.deleteRecord('${r.id}', '${nombre.replace(/'/g, "\\'")}')"
              title="Eliminar registro">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>

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
      ${isOpen ? 'Ocultar datos' : 'Ver todos los datos'}`;
  },

  // ── Eliminar registro ───────────────────────────────────────
  async deleteRecord(docId, name) {
    const ok = confirm(`¿Eliminar el registro de ${name}? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await db.collection('asistencia_meta').doc(docId).delete();
    } catch (e) {
      alert('Error al eliminar: ' + e.message);
    }
  },

  // ── Exportar a Excel ────────────────────────────────────────
  exportExcel() {
    const btn = document.getElementById('btn-export-excel');
    btn.disabled = true;
    btn.textContent = 'Exportando...';

    try {
      if (this.records.length === 0) {
        alert('No hay registros para exportar.');
        this._resetExportBtn(btn);
        return;
      }

      const wb = XLSX.utils.book_new();

      // Función para convertir registros a filas
      const toRows = (recs) => recs.map(r => {
        const base = {
          'Día':     r.dia === 'viernes7' ? 'Viernes 7 Ago' : r.dia === 'sabado8' ? 'Sábado 8 Ago' : 'Excepcional',
          'Nombre':  r.nombre   || '',
          'Apellido':r.apellido || '',
          'DNI/ID':  r.idKey    || '',
          'Entrada': r.entrada  || '',
          'Salida':  r.salida   || '',
          'Es nuevo':r.esNuevo  ? 'Sí' : 'No',
          'Hoja':    r.hoja     || '',
        };
        // Agregar todos los campos del Excel
        if (r.datos) {
          Object.entries(r.datos).forEach(([k, v]) => {
            base[LABELS[k] || k] = v || '';
          });
        }
        return base;
      });

      // Hoja general
      const wsAll = XLSX.utils.json_to_sheet(toRows(this.records));
      XLSX.utils.book_append_sheet(wb, wsAll, 'Todos');

      // Hojas por día
      const viernes = this.records.filter(r => r.dia === 'viernes7');
      if (viernes.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(viernes)), 'Viernes 7 Directivos');
      }

      const sabado = this.records.filter(r => r.dia === 'sabado8');
      if (sabado.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(sabado)), 'Sabado 8 Docentes');
      }

      const excepc = this.records.filter(r => r.esNuevo);
      if (excepc.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(excepc)), 'Excepcionales');
      }

      XLSX.writeFile(wb, `asistencia_meta_${hoyISO()}.xlsx`);
    } catch (e) {
      alert('Error al exportar: ' + e.message);
      console.error(e);
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
