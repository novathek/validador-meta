import json, re

with open('data.js', 'r', encoding='utf-8') as f:
    content = f.read()

m_s = re.search(r'const DB_SABADO\s*=\s*(\[.*?\]);', content, re.DOTALL)
docentes = json.loads(m_s.group(1))

# Analizar GRADO_ANO
print("=== GRADO_ANO con múltiples valores ===")
grados_multi = [p for p in docentes if p.get('GRADO_ANO') and (',' in str(p.get('GRADO_ANO','')) or ' y ' in str(p.get('GRADO_ANO','')))]
print(f"Total docentes con múltiples grados: {len(grados_multi)}")
valores_grado = set(p['GRADO_ANO'] for p in grados_multi)
print("Valores únicos:")
for v in sorted(valores_grado):
    print(f"  {repr(v)}")

print()
print("=== ESPECIALIDAD con múltiples valores ===")
esp_multi = [p for p in docentes if p.get('ESPECIALIDAD') and (',' in str(p.get('ESPECIALIDAD','')) or ' y ' in str(p.get('ESPECIALIDAD','')))]
print(f"Total docentes con múltiples especialidades: {len(esp_multi)}")
valores_esp = set(p['ESPECIALIDAD'] for p in esp_multi)
print("Valores únicos:")
for v in sorted(valores_esp):
    print(f"  {repr(v)}")

print()
print("=== Todos los valores únicos de GRADO_ANO ===")
todos_grados = set(p['GRADO_ANO'] for p in docentes if p.get('GRADO_ANO'))
for v in sorted(todos_grados):
    print(f"  {repr(v)}")

print()
print("=== Todos los valores únicos de ESPECIALIDAD ===")
todos_esp = set(p['ESPECIALIDAD'] for p in docentes if p.get('ESPECIALIDAD'))
for v in sorted(todos_esp):
    print(f"  {repr(v)}")
