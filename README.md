# 📋 App de Asistencia — SINIDE Catamarca

App móvil estática para registrar asistencia de **Aplicadores** y **Veedores**. Funciona en GitHub Pages con Firebase Firestore como backend en tiempo real.

---

## 🚀 Configuración inicial (hacer UNA sola vez)

### Paso 1 — Crear proyecto Firebase

1. Ir a [console.firebase.google.com](https://console.firebase.google.com/)
2. Click **"Agregar proyecto"** → ponerle un nombre (ej: `asistencia-sinide`)
3. Desactivar Google Analytics si querés (no es necesario) → **Crear proyecto**

### Paso 2 — Crear la base de datos Firestore

1. En el menú lateral: **Build → Firestore Database**
2. Click **"Crear base de datos"**
3. Elegir **"Iniciar en modo de producción"**
4. Seleccionar región: `us-east1` (o la más cercana)

### Paso 3 — Configurar reglas de seguridad

En Firestore → pestaña **"Reglas"**, reemplazar todo con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /asistencia/{doc} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ Esto permite acceso sin autenticación. Para un operativo de un día está bien. Si necesitás más seguridad, avisame.

### Paso 4 — Obtener las credenciales

1. En el menú lateral: **Project Overview → ⚙️ Configuración del proyecto**
2. Ir a la pestaña **"General"**
3. Bajar a **"Tus apps"** → click en el ícono `</>` (Web)
4. Registrar la app con cualquier nombre
5. Copiar el bloque `firebaseConfig`

### Paso 5 — Pegar las credenciales

Abrir `firebase-config.js` y reemplazar los valores:

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",
  authDomain:        "asistencia-sinide.firebaseapp.com",
  projectId:         "asistencia-sinide",
  storageBucket:     "asistencia-sinide.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

---

## 🌐 Deploy en GitHub Pages

```bash
# 1. Crear repositorio en GitHub (ej: asistencia-sinide)
# 2. Subir todos los archivos
git init
git add .
git commit -m "App de asistencia"
git remote add origin https://github.com/TU_USUARIO/asistencia-sinide.git
git push -u origin main

# 3. En GitHub → Settings → Pages → Source: "Deploy from branch" → main → / (root)
```

La app va a estar disponible en: `https://TU_USUARIO.github.io/asistencia-sinide/`

---

## 📊 Exportar asistencia a Excel

1. Abrir la app → botón **"Exportar asistencia"** (abajo)
2. Se descarga un archivo `asistencia_YYYY-MM-DD.xlsx` con 3 hojas:
   - `Asistencia` — todos los registros
   - `Aplicadores` — solo aplicadores
   - `Veedores` — solo veedores

---

## 🔄 Si el Excel base cambia

```bash
# En la carpeta del proyecto, correr:
python convert_excel.py
# Esto regenera data.js — luego hacer git push
```

---

## 📁 Estructura de archivos

```
asistencia app/
├── index.html              # App principal
├── style.css               # Estilos mobile-first
├── app.js                  # Lógica de la app
├── data.js                 # Base de datos (generada del Excel)
├── firebase-config.js      # ← COMPLETAR con tus credenciales
├── convert_excel.py        # Script para regenerar data.js
└── uniraplicadoresyveedores.xlsx
```

---

## 📱 Uso diario

1. Los 4 celulares abren la misma URL
2. Cada persona selecciona **Aplicador** o **Veedor**
3. Aplicadores ingresan su **DNI**; Veedores su **nombre**
4. Si ya registraron hoy → no se les permite registrar de nuevo
5. Si no están en la lista → se los inscribe con un formulario
6. Al final del día: exportar Excel desde cualquier celular
