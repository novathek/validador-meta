"""
convert_excel.py — Convierte capacitacionmeta.xlsx -> data.js
Lee hojas DIRECTIVOS y DOCENTES y exporta como arrays JS.
"""
import openpyxl
import json
from datetime import datetime, date

def to_str(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime('%Y-%m-%d')
    s = str(v).strip()
    return s if s else None

def normalize_header(h):
    if not h:
        return None
    h = str(h).strip()
    replacements = {
        '\u00e1': 'A', '\u00e9': 'E', '\u00ed': 'I', '\u00f3': 'O', '\u00fa': 'U',
        '\u00c1': 'A', '\u00c9': 'E', '\u00cd': 'I', '\u00d3': 'O', '\u00da': 'U',
        '\u00f1': 'N', '\u00d1': 'N',
    }
    for k, v in replacements.items():
        h = h.replace(k, v)
    h = h.upper().replace(' ', '_')
    return h

def process_sheet(ws):
    raw_headers = [cell.value for cell in ws[1]]
    norm_headers = [normalize_header(h) for h in raw_headers]
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
    return rows, norm_headers

wb = openpyxl.load_workbook('capacitacionmeta.xlsx')

directivos, dir_headers = process_sheet(wb['DIRECTIVOS'])
docentes,   doc_headers = process_sheet(wb['DOCENTES'])

dir_headers_clean = [h for h in dir_headers if h]
doc_headers_clean = [h for h in doc_headers if h]

now_str = datetime.now().strftime('%Y-%m-%d %H:%M')

output = """/* ================================================================
   data.js - Datos de la base capacitacionmeta.xlsx
   Generado automaticamente: """ + now_str + """
   NO EDITAR MANUALMENTE - ejecutar convert_excel.py para actualizar
   ================================================================ */

// Campos de cada hoja (para mostrar en la UI)
const HEADERS = {
  directivos: """ + json.dumps(dir_headers_clean, ensure_ascii=False) + """,
  docentes:   """ + json.dumps(doc_headers_clean, ensure_ascii=False) + """
};

const DB = {
  directivos: """ + json.dumps(directivos, ensure_ascii=False, indent=2) + """,
  docentes:   """ + json.dumps(docentes,   ensure_ascii=False, indent=2) + """
};
"""

with open('data.js', 'w', encoding='utf-8') as f:
    f.write(output)

print("data.js generado exitosamente")
print(f"  DIRECTIVOS: {len(directivos)} registros")
print(f"  DOCENTES:   {len(docentes)} registros")
print(f"  TOTAL:      {len(directivos) + len(docentes)} registros")
print()
for d in directivos:
    print(f"  [DIR] {d.get('NOMBRE', '')} {d.get('APELLIDO', '')} - DNI: {d.get('DNI', '')} - ROL: {d.get('ROL', '')}")
for d in docentes:
    print(f"  [DOC] {d.get('NOMBRE', '')} {d.get('APELLIDO', '')} - DNI: {d.get('DNI', '')}")
