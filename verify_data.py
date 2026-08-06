import json, re

with open('data.js', 'r', encoding='utf-8') as f:
    content = f.read()

m_v = re.search(r'const DB_VIERNES\s*=\s*(\[.*?\]);', content, re.DOTALL)
m_s = re.search(r'const DB_SABADO\s*=\s*(\[.*?\]);', content, re.DOTALL)
v = json.loads(m_v.group(1))
s = json.loads(m_s.group(1))

print(f'DB_VIERNES: {len(v)} registros')
print(f'DB_SABADO:  {len(s)} registros')
print(f'TOTAL:      {len(v)+len(s)}')
print()

tipos_v = set(p['TIPO'] for p in v)
tipos_s = set(p['TIPO'] for p in s)
print(f'Tipos en viernes: {tipos_v}')
print(f'Tipos en sabado:  {tipos_s}')
print()

d1 = next(p for p in v if p['TIPO'] == 'directivo')
campos_d1 = ['TIPO','DNI','NOMBRE','APELLIDO','ROL','EMAIL','CELULAR','ESCUELA']
print('Muestra directivo 1:')
print(json.dumps({k: d1.get(k) for k in campos_d1}, ensure_ascii=False))

s1 = next(p for p in v if p['TIPO'] == 'supervisor')
campos_s1 = ['TIPO','DNI','NOMBRE','APELLIDO','ROL','EMAIL','CELULAR','NODO']
print()
print('Muestra supervisor 1:')
print(json.dumps({k: s1.get(k) for k in campos_s1}, ensure_ascii=False))

doc1 = next(p for p in s if p['TIPO'] == 'docente')
campos_doc1 = ['TIPO','DNI','NOMBRE','APELLIDO','ESCUELA','ESPECIALIDAD']
print()
print('Muestra docente 1:')
print(json.dumps({k: doc1.get(k) for k in campos_doc1}, ensure_ascii=False))
