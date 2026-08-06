"""
upload_personas.py — Sube los 528 registros a Firestore (colección 'personas_meta')
Requiere: pip install firebase-admin openpyxl

Pasos:
  1. Descargá la Service Account Key desde Firebase Console:
     Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada
     Guardala como serviceAccountKey.json en esta misma carpeta.
  2. Ejecutá: python upload_personas.py

IMPORTANTE: Este script borra y recrea la colección personas_meta completa.
Usar solo cuando se actualiza el listado definitivo.
"""

import firebase_admin
from firebase_admin import credentials, firestore
import json
import os
import sys

# ─── Config ──────────────────────────────────────────────────────────────────

KEY_FILE = 'serviceAccountKey.json'

if not os.path.exists(KEY_FILE):
    print(f"ERROR: No se encontró '{KEY_FILE}'")
    print()
    print("Para descargarlo:")
    print("  1. Abrí https://console.firebase.google.com/project/meta-capacitacion/settings/serviceaccounts/adminsdk")
    print("  2. Hacé clic en 'Generar nueva clave privada'")
    print("  3. Guardá el archivo como 'serviceAccountKey.json' en esta carpeta")
    sys.exit(1)

# ─── Cargar personas desde data.js ────────────────────────────────────────────
# Extraemos los arrays directamente del JSON embebido en data.js

import re

with open('data.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Extraer DB_VIERNES
m_viernes = re.search(r'const DB_VIERNES\s*=\s*(\[.*?\]);', content, re.DOTALL)
m_sabado  = re.search(r'const DB_SABADO\s*=\s*(\[.*?\]);',  content, re.DOTALL)

if not m_viernes or not m_sabado:
    print("ERROR: No se pudo parsear data.js. Asegurate de haber ejecutado convert_excel.py primero.")
    sys.exit(1)

viernes = json.loads(m_viernes.group(1))
sabado  = json.loads(m_sabado.group(1))
todas   = viernes + sabado

print(f"Personas cargadas desde data.js:")
print(f"  Viernes (directivos+supervisores): {len(viernes)}")
print(f"  Sábado (docentes):                 {len(sabado)}")
print(f"  Total:                             {len(todas)}")
print()

# ─── Conectar a Firebase ──────────────────────────────────────────────────────

cred = credentials.Certificate(KEY_FILE)
firebase_admin.initialize_app(cred)
db = firestore.client()

# ─── Subir en batches (Firestore permite max 500 ops por batch) ────────────────

COLLECTION = 'personas_meta'
BATCH_SIZE = 400

def upload_all(personas):
    """Borra la colección existente y sube todas las personas nuevas."""

    # 1. Borrar docs existentes
    print(f"Borrando colección '{COLLECTION}' existente...")
    existing = db.collection(COLLECTION).stream()
    delete_batch = db.batch()
    count = 0
    for doc in existing:
        delete_batch.delete(doc.reference)
        count += 1
        if count % BATCH_SIZE == 0:
            delete_batch.commit()
            delete_batch = db.batch()
            print(f"  Borrados {count} docs...")
    if count % BATCH_SIZE != 0:
        delete_batch.commit()
    print(f"  Borrados {count} documentos anteriores.")
    print()

    # 2. Subir nuevos
    print(f"Subiendo {len(personas)} personas a '{COLLECTION}'...")
    batch = db.batch()
    uploaded = 0
    for i, persona in enumerate(personas):
        # Usar DNI como ID del documento (si no tiene, usar índice)
        doc_id = str(persona.get('DNI') or f'sin_dni_{i}').strip()
        ref = db.collection(COLLECTION).document(doc_id)

        # Determinar dia (para facilitar la consulta en admin)
        tipo = persona.get('TIPO', '')
        dia  = 'viernes7' if tipo in ('directivo', 'supervisor') else 'sabado8'

        doc_data = {**persona, 'dia': dia}
        batch.set(ref, doc_data)
        uploaded += 1

        if uploaded % BATCH_SIZE == 0:
            batch.commit()
            batch = db.batch()
            print(f"  Subidos {uploaded}/{len(personas)}...")

    if uploaded % BATCH_SIZE != 0:
        batch.commit()

    print(f"  OK: {uploaded} personas subidas correctamente.")

upload_all(todas)

print()
print("=" * 50)
print(f"SUBIDA COMPLETA — {len(todas)} registros en '{COLLECTION}'")
print("=" * 50)
print()
print("Desglose:")
for tipo in ['directivo', 'supervisor', 'docente']:
    n = len([p for p in todas if p.get('TIPO') == tipo])
    print(f"  {tipo.capitalize()}s: {n}")
