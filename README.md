# AutomatBlizz ⚡

> **Plataforma web fullstack construida con Next.js 16 para automatizar la exploración recursiva, indexación, búsqueda y archivado de títulos y enlaces de BlizzPaste.**

---

## 📖 Descripción General

**AutomatBlizz** automatiza la recolección y catalogación de pastes de BlizzPaste (`https://blizzpaste.com/?v={id}`). A través de una interfaz interactiva con telemetría en tiempo real, permite indexar miles de items, buscar instantáneamente por título o ID numérico, organizar favoritos y exportar listas listas para gestores de descargas como **JDownloader**.

### 💡 Principio Técnico
- **Extracción directa y ligera**: El servidor de BlizzPaste incluye el título dentro del HTML inicial (`<h3>Título</h3>`), por lo que **no se requiere resolver captchas de Cloudflare Turnstile** ni ejecutar navegadores headless pesados (Puppeteer/Playwright) para indexar títulos y enlaces.
- **Detección de 404**: Detecta automáticamente respuestas de IDs no existentes (`Error: El id "X" no existe`) para saltar huecos en la secuencia o detener escaneos recursivos.

---

## ✨ Características Principales

- 🚀 **Escaneo Recursivo y por Lotes**:
  - **Modo Rango**: Escaneo secuencial desde un ID inicial a un ID final con preajustes de 1 clic (ej. *Starbound 1470-1480*, *Lote 1400-1500*, *+30 siguientes*).
  - **Importador de Enlaces**: Pega listas arbitrarias de URLs (`https://blizzpaste.com/?v=1474`, `?v=1475`...) o IDs sueltos para escaneado en lote.
- ⚡ **Omisión Inteligente de Duplicados**:
  - Evita peticiones HTTP repetidas si el ID ya fue indexado en la base de datos local.
  - Opción desactivable para forzar el re-escaneo y actualización de datos.
- 📡 **Telemetría en Vivo (Server-Sent Events - SSE)**:
  - Visualización en tiempo real del progreso porcentual, velocidad (`req/s`), items procesados, encontrados y omitidos sin necesidad de refrescar la página ni hacer polling.
  - Consola de eventos en vivo que muestra cada título descubierto al instante.
- 🔍 **Buscador & Archivador Interactivo**:
  - Búsqueda reactiva mientras escribes (por nombre de juego o número de ID).
  - Filtros rápidos: *Todos*, *Disponibles*, *No existen (404)*, *Errores* y *Favoritos (★)*.
  - Alternador entre **Vista de Tabla** y **Vista de Tarjetas**.
- 📋 **Herramientas de Exportación y JDownloader**:
  - Casillas de selección múltiple con botón directo **"Copiar Enlaces para JDownloader"** (copia al portapapeles en bloque con un solo clic).
  - Exportación de la base de datos completa o selección a **CSV**, **JSON** o **TXT** (listado limpio de URLs).
- 💾 **Persistencia Local Segura**:
  - Almacén de datos persistente en disco (`data/database.json`) sin requerir instalar servidores de base de datos externos.

---

## 🛠️ Tecnologías Utilizadas

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **Lenguaje**: TypeScript
- **Estilos**: Vanilla CSS moderno con Tailwind CSS (Glassmorphism, temas oscuros y componentes reactivos)
- **Streaming**: Server-Sent Events (SSE) nativo con `ReadableStream`
- **Gestor de Paquetes**: `pnpm` (compatible con `npm` y `yarn`)

---

## 📂 Estructura del Proyecto

```
AutomatBlizz/
├── app/
│   ├── api/
│   │   ├── scan/
│   │   │   ├── route.ts         # Iniciar escaneo / Consultar progreso
│   │   │   ├── control/route.ts # Pausar, reanudar o detener el escáner
│   │   │   └── stream/route.ts  # Stream SSE para telemetría en tiempo real
│   │   ├── items/
│   │   │   ├── route.ts         # Búsqueda, filtrado y paginación
│   │   │   └── [id]/route.ts    # Marcar favoritos o eliminar items
│   │   ├── export/
│   │   │   └── route.ts         # Descargas CSV, JSON y lista de links TXT
│   │   └── stats/
│   │       └── route.ts         # Métricas globales de la base de datos
│   ├── layout.tsx               # Metadatos y fuentes
│   ├── globals.css              # Sistema de diseño, LEDs y animaciones
│   └── page.tsx                 # Dashboard interactivo completo
├── lib/
│   ├── types.ts                 # Contratos y tipos TypeScript
│   ├── blizzpaste.ts            # Parser HTML y motor del Scraper con eventos
│   └── storage.ts               # Capa de almacenamiento local persistente
├── data/
│   └── database.json            # Base de datos local persistente
├── package.json
└── tsconfig.json
```

---

## 🚀 Inicio Rápido

### Requisitos Previos
- **Node.js** v20 o superior
- **pnpm** (recomendado) o **npm**

### Instalación

```bash
# 1. Clonar el repositorio
git clone git@github.com:AMBoulchouk/AutomatBlizz.git
cd AutomatBlizz

# 2. Instalar dependencias
pnpm install

# 3. Iniciar el servidor de desarrollo
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la aplicación.

---

## ⚙️ Opciones de Escaneo

En la pestaña **Consola de Escaneo** dispones de los siguientes controles:

| Opción | Descripción | Valor por Defecto |
|---|---|---|
| **ID Inicial / ID Final** | Rango numérico de `?v=X` a explorar en BlizzPaste. | Configurable (ej. `1470` a `1480`) |
| **Omitir IDs en BD** | Omite la petición de red si el item ya está indexado. | `Activado` |
| **Concurrencia** | Cantidad de peticiones simultáneas en paralelo (1 a 5 hilos). | `2 hilos` |
| **Delay entre peticiones** | Pausa en milisegundos entre solicitudes para cuidar la IP y evitar rate-limits. | `250 ms` |
| **Límite de errores** | Número de 404 consecutivos antes de detener el escaneo automáticamente. | `30 errores` |

---

## 📜 Exportaciones

Puedes descargar tus datos indexados en cualquier momento desde la barra superior o la API:

- **CSV**: `/api/export?format=csv` (compatible con Excel / hojas de cálculo)
- **JSON**: `/api/export?format=json` (para integraciones o copias de seguridad)
- **TXT**: `/api/export?format=txt` (listado puro de URLs, ideal para JDownloader o scripts curl)

---

## 📄 Licencia

Este proyecto es de uso personal y educativo para la automatización y archivado de enlaces públicos.
