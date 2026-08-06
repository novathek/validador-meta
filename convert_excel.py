"""
convert_excel.py — Convierte directivos.xlsx + supervisores.xlsx + docentes.xlsx → data.js
Normaliza columnas distintas en un esquema unificado.
Ejecutar: python convert_excel.py
"""
import openpyxl
import json
from datetime import datetime, date

# ─── Utilidades ──────────────────────────────────────────────────────────────

def to_str(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime('%Y-%m-%d')
    s = str(v).strip()
    return s if s else None

def norm_key(h):
    """Normaliza encabezado → clave interna (sin tildes, mayúsculas, sin espacios)."""
    if not h:
        return None
    h = str(h).strip()
    for src, dst in [
        ('á','a'),('é','e'),('í','i'),('ó','o'),('ú','u'),
        ('Á','A'),('É','E'),('Í','I'),('Ó','O'),('Ú','U'),
        ('ñ','n'),('Ñ','N'),('°',''),('º',''),('.',''),
        ('/',' '),('-',' '),
    ]:
        h = h.replace(src, dst)
    h = h.upper().strip()
    h = ' '.join(h.split())          # colapsar espacios múltiples
    h = h.replace(' ', '_')
    return h

def read_sheet(filename, sheet_name=None):
    wb = openpyxl.load_workbook(filename)
    ws = wb[sheet_name] if sheet_name else wb.active
    raw_headers = [cell.value for cell in ws[1]]
    norm_headers = [norm_key(h) for h in raw_headers]
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if all(v is None for v in row):
            continue
        obj = {}
        for i, h in enumerate(norm_headers):
            if h and i < len(row):
                obj[h] = to_str(row[i])
        if any(v is not None for v in obj.values()):
            rows.append(obj)
    return rows

# ─── Leer los 3 archivos ─────────────────────────────────────────────────────

raw_directivos  = read_sheet('directivos.xlsx')
raw_supervisores = read_sheet('supervisores.xlsx')
raw_docentes    = read_sheet('docentes.xlsx')

# ─── Normalización: mapear distintas columnas → esquema unificado ─────────────
#
# Esquema unificado por persona:
#   DNI, NOMBRE, APELLIDO, ROL, TIPO (directivo|supervisor|docente),
#   EMAIL, CELULAR, CUIT, SEXO, NACIMIENTO, DEPARTAMENTO,
#   ESCUELA, NODO, CURSO, ... (resto de campos nativos preservados)

def normalize_directivo(p):
    """directivos.xlsx → esquema unificado."""
    return {
        'TIPO':        'directivo',
        'DNI':         p.get('N_DE_DOCUMENTO') or p.get('DNI') or None,
        'NOMBRE':      p.get('NOMBRE'),
        'APELLIDO':    p.get('APELLIDO'),
        'ROL':         p.get('ROL_QUE_OCUPA_EN_LA_ESCUELA') or p.get('ROL') or 'Directivo',
        'EMAIL':       p.get('CORREO_ELECTRONICO') or p.get('EMAIL') or None,
        'CELULAR':     p.get('CELULAR') or p.get('TELEFONO') or None,
        'CUIT':        p.get('CUIT_CUIL___SIN_PUNTOS_Y_SIN_GUIONES') or p.get('CUIL') or p.get('CUIT') or None,
        'SEXO':        p.get('SEXO') or p.get('GENERO') or None,
        'NACIMIENTO':  p.get('FECHA_DE_NACIMIENTO') or p.get('FECHA') or None,
        'DEPARTAMENTO':p.get('DEPARTAMENTO') or None,
        'ESCUELA':     p.get('ESCUELA') or p.get('INSTITUCION') or None,
        'NODO':        p.get('NODO_(SUPERVISION)') or p.get('NODO') or None,
        'CURSO':       p.get('CURSO_EN_EL_QUE_SE_PREINSCRIBE:') or p.get('CAPACITACION') or None,
        'MARCA_TEMPORAL': p.get('MARCA_TEMPORAL') or None,
    }

def normalize_supervisor(p):
    """supervisores.xlsx → esquema unificado."""
    return {
        'TIPO':        'supervisor',
        'DNI':         p.get('DNI') or p.get('N_DE_DOCUMENTO') or None,
        'NOMBRE':      p.get('NOMBRE'),
        'APELLIDO':    p.get('APELLIDO'),
        'ROL':         p.get('ROL') or 'Supervisor/a',
        'EMAIL':       p.get('EMAIL') or p.get('CORREO_ELECTRONICO') or None,
        'CELULAR':     p.get('TELEFONO') or p.get('CELULAR') or None,
        'CUIT':        p.get('CUIL') or p.get('CUIT') or None,
        'SEXO':        p.get('GENERO') or p.get('SEXO') or None,
        'NACIMIENTO':  p.get('FECHA') or p.get('FECHA_DE_NACIMIENTO') or None,
        'DEPARTAMENTO':p.get('LOCALIDAD') or p.get('DEPARTAMENTO') or None,
        'ESCUELA':     p.get('ESCUELA') or None,
        'NODO':        p.get('NODO') or None,
        'CURSO':       p.get('CAPACITACION') or None,
        'NACIONALIDAD':p.get('NACIONALIDAD') or None,
        'DIRECCION':   p.get('DIRECCION') or None,
        'POSTAL':      p.get('POSTAL') or None,
        'PAIS':        p.get('PAIS') or None,
    }

def normalize_docente(p):
    """docentes.xlsx → esquema unificado."""
    return {
        'TIPO':        'docente',
        'DNI':         p.get('N_DE_DOCUMENTO') or p.get('DNI') or None,
        'NOMBRE':      p.get('NOMBRE'),
        'APELLIDO':    p.get('APELLIDO'),
        'ROL':         'Docente',
        'EMAIL':       p.get('CORREO_ELECTRONICO') or p.get('EMAIL') or None,
        'CELULAR':     p.get('CELULAR') or p.get('TELEFONO') or None,
        'CUIT':        p.get('CUIL') or p.get('CUIT') or None,
        'SEXO':        p.get('SEXO') or p.get('GENERO') or None,
        'NACIMIENTO':  p.get('FECHA_DE_NACIMIENTO') or p.get('FECHA') or None,
        'DEPARTAMENTO':p.get('DEPARTAMENTO') or None,
        'ESCUELA':     p.get('ESCUELA') or p.get('INSTITUCION') or None,
        'NODO':        None,
        'CURSO':       p.get('CURSO_EN_EL_QUE_SE_PREINSCRIBE:') or p.get('CAPACITACION') or None,
        'NACIONALIDAD':p.get('NACIONALIDAD') or None,
        'DOMICILIO':   p.get('DOMICILIO') or None,
        'CODIGO_POSTAL':p.get('CODIGO_POSTAL') or None,
        'PAIS':        p.get('PAIS') or None,
        'PROVINCIA':   p.get('PROVINCIA') or None,
        'GRADO_ANO':   p.get('GRADO_ANO') or None,
        'ESPECIALIDAD':p.get('ESPECIALIDAD_DEL_DOCENTE') or None,
    }

directivos  = [normalize_directivo(p)  for p in raw_directivos]
supervisores = [normalize_supervisor(p) for p in raw_supervisores]
docentes    = [normalize_docente(p)    for p in raw_docentes]

# Viernes = directivos + supervisores (para la búsqueda en app)
viernes = directivos + supervisores

# ─── Generar data.js ─────────────────────────────────────────────────────────

now_str = datetime.now().strftime('%Y-%m-%d %H:%M')

output = f"""/* ================================================================
   data.js - Datos definitivos de directivos, supervisores y docentes
   Generado automáticamente: {now_str}
   Fuente: directivos.xlsx ({len(directivos)} reg) +
           supervisores.xlsx ({len(supervisores)} reg) +
           docentes.xlsx ({len(docentes)} reg)
   NO EDITAR MANUALMENTE - ejecutar convert_excel.py para actualizar
   ================================================================ */

// Dataset viernes 7/8: directivos + supervisores ({len(viernes)} personas)
const DB_VIERNES = {json.dumps(viernes, ensure_ascii=False, indent=2)};

// Dataset sábado 8/8: docentes ({len(docentes)} personas)
const DB_SABADO = {json.dumps(docentes, ensure_ascii=False, indent=2)};

// Alias para compatibilidad con app.js
const DB = {{
  directivos: DB_VIERNES,
  docentes:   DB_SABADO,
}};
"""

with open('data.js', 'w', encoding='utf-8') as f:
    f.write(output)

print("✅  data.js generado exitosamente")
print(f"   Directivos:  {len(directivos)} registros")
print(f"   Supervisores:{len(supervisores)} registros")
print(f"   Docentes:    {len(docentes)} registros")
print(f"   TOTAL:       {len(directivos)+len(supervisores)+len(docentes)} registros")
print()

# Verificar cuántos tienen DNI
sin_dni_dir  = [p for p in directivos  if not p.get('DNI')]
sin_dni_sup  = [p for p in supervisores if not p.get('DNI')]
sin_dni_doc  = [p for p in docentes    if not p.get('DNI')]
print(f"⚠️  Sin DNI → Directivos: {len(sin_dni_dir)}, Supervisores: {len(sin_dni_sup)}, Docentes: {len(sin_dni_doc)}")
if sin_dni_dir:
    for p in sin_dni_dir[:5]:
        print(f"   [DIR sin DNI] {p.get('NOMBRE','')} {p.get('APELLIDO','')}")
if sin_dni_sup:
    for p in sin_dni_sup[:5]:
        print(f"   [SUP sin DNI] {p.get('NOMBRE','')} {p.get('APELLIDO','')}")
if sin_dni_doc:
    for p in sin_dni_doc[:5]:
        print(f"   [DOC sin DNI] {p.get('NOMBRE','')} {p.get('APELLIDO','')}")
