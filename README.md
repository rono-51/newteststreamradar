# StreamRadar Serverless v2.0
## Monitor Viral 24/7 · Telegram WebApp · Netlify Functions

---

## Estructura del Proyecto

```
streamradar-serverless/
│
├── netlify/
│   └── functions/
│       ├── send-alert.js          ← Recibe eventos y dispara alertas a Telegram
│       └── telegram-webhook.js    ← Recibe comandos del bot (/start, /app, /status)
│
├── public/                        ← Frontend estático (Netlify sirve este directorio)
│   ├── index.html                 ← Dashboard principal + Telegram WebApp SDK
│   ├── render.html                ← Studio de renders (sin modificar)
│   ├── sw.js                      ← Service Worker (PWA)
│   ├── worker.js                  ← Web Worker (tick 1s preciso)
│   ├── manifest.json              ← Manifiesto PWA
│   └── assets/
│       ├── fonts/
│       ├── logos/
│       └── banners/
│
├── scripts/
│   └── setup-webhook.js           ← Script de configuración del webhook
│
├── netlify.toml                   ← Configuración de build, redirects y headers
├── package.json
├── .env.example                   ← Plantilla de variables de entorno
└── .gitignore
```

---

## Guía de Despliegue Paso a Paso

### Paso 1 — Crear el Bot de Telegram

1. Abre Telegram y busca **@BotFather**
2. Envía `/newbot` y sigue las instrucciones
3. Guarda el **Token** que te entrega (formato: `1234567890:ABCDEFxxx`)
4. Obtén tu **Chat ID** enviando `/start` a **@userinfobot**

### Paso 2 — Subir a GitHub

```bash
git init
git add .
git commit -m "feat: StreamRadar Serverless v2.0"
git remote add origin https://github.com/TU_USUARIO/streamradar.git
git push -u origin main
```

### Paso 3 — Desplegar en Netlify

1. Ve a [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
2. Conecta tu repositorio de GitHub
3. Netlify detecta `netlify.toml` automáticamente; haz clic en **Deploy site**
4. Anota la URL de tu sitio: `https://TU-SITIO.netlify.app`

### Paso 4 — Configurar Variables de Entorno en Netlify

En **Site settings → Environment variables**, agrega:

| Variable | Valor | Descripción |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `1234567890:ABCDEFxxx` | Token de BotFather |
| `TELEGRAM_CHAT_ID` | `123456789` | Tu Chat ID personal |
| `ALERT_SECRET_KEY` | `clave-aleatoria-larga` | Genera con: `openssl rand -hex 32` |
| `WEBAPP_URL` | `https://TU-SITIO.netlify.app` | URL de tu deploy en Netlify |

Después de agregar las variables, haz un **Redeploy** del sitio.

### Paso 5 — Registrar el Webhook de Telegram

```bash
# Con las variables de entorno configuradas localmente:
TELEGRAM_BOT_TOKEN="tu_token" WEBAPP_URL="https://TU-SITIO.netlify.app" node scripts/setup-webhook.js
```

O manualmente con curl:

```bash
curl -X POST "https://api.telegram.org/bot<TU_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://TU-SITIO.netlify.app/.netlify/functions/telegram-webhook", "allowed_updates": ["message"], "drop_pending_updates": true}'
```

### Paso 6 — Configurar el Botón de la WebApp en BotFather

Este paso conecta el botón del bot con tu frontend:

```
1. Abre @BotFather en Telegram
2. Envía: /mybots
3. Selecciona tu bot
4. Toca: Bot Settings
5. Toca: Menu Button
6. Toca: Configure menu button
7. URL de la WebApp: https://TU-SITIO.netlify.app/index.html
8. Texto del botón: 📡 StreamRadar
```

**Resultado:** Al presionar el botón en el chat del bot, se abre StreamRadar directamente dentro de Telegram, integrado con el tema del usuario.

### Paso 7 — Verificar que todo funciona

1. Abre tu bot en Telegram y envía `/start` → debe responder con bienvenida y botón
2. Presiona el botón → se abre el dashboard dentro de Telegram
3. En el panel derecho del dashboard verás el botón **"Enviar alerta de prueba a Telegram"**
4. Presiónalo → deberías recibir un mensaje del bot en tu chat

---

## Cómo Funciona la Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  USUARIO EN TELEGRAM                                  │
│                                                       │
│  [Bot Chat]  →  presiona botón  →  [WebApp/Dashboard]│
│       ↑                                    │          │
│       │ alerta                             │ evento   │
│       │ Markdown                           │ fetch    │
└───────┼────────────────────────────────────┼──────────┘
        │                                    │
        │                    ┌───────────────▼──────────┐
        │                    │  NETLIFY FUNCTION         │
        │                    │  send-alert.js            │
        │◄───────────────────│  (Serverless, 24/7)       │
        │                    │  • Valida ALERT_SECRET_KEY│
        │                    │  • Llama Telegram API     │
        │                    └──────────────────────────┘
        │
┌───────┴──────────────────────────────────────────────┐
│  TELEGRAM API                                         │
│  sendMessage → chat_id del usuario                    │
└──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  NETLIFY FUNCTION  telegram-webhook.js               │
│  • Recibe /start, /app, /status del bot              │
│  • Responde con teclado InlineKeyboard + botón WebApp│
└─────────────────────────────────────────────────────┘
```

**Flujo de alerta en tiempo real:**
1. El WebSocket de Kick detecta un pico de actividad en el chat
2. El engine de Viral Score calcula que supera el umbral (HOT/VIRAL)
3. El frontend llama a `POST /api/send-alert` con los datos del evento
4. La Netlify Function valida la request y llama a `Telegram API/sendMessage`
5. El usuario recibe una alerta formateada en Markdown en su Telegram
6. El celular puede estar bloqueado — la alerta llega igual

---

## Variables de Entorno — Referencia Completa

| Variable | Requerida | Descripción |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ Sí | Token del bot obtenido de @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ Sí | Chat ID del usuario que recibe alertas |
| `ALERT_SECRET_KEY` | ✅ Sí | Clave para validar requests del frontend |
| `WEBAPP_URL` | ✅ Sí | URL pública del frontend (sin slash final) |

**Seguridad:** Ninguna de estas variables es accesible desde el código del frontend (HTML/JS). Solo las Netlify Functions del servidor pueden leerlas via `process.env`.

---

## Comandos del Bot

| Comando | Acción |
|---|---|
| `/start` | Bienvenida con botón para abrir la WebApp |
| `/app` | Abre el dashboard directamente |
| `/status` | Muestra el estado del sistema |

---

## Desarrollo Local

```bash
# Instalar Netlify CLI
npm install

# Crear archivo .env local (copiar de .env.example y rellenar)
cp .env.example .env

# Iniciar servidor local con las funciones
npm run dev
# → Disponible en http://localhost:8888
# → Funciones en http://localhost:8888/.netlify/functions/
```
