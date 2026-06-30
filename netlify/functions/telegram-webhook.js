/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  telegram-webhook.js — Recibe updates del Bot de Telegram   ║
 * ║  Procesa comandos del usuario y responde desde el servidor.  ║
 * ║                                                               ║
 * ║  Endpoint: POST /.netlify/functions/telegram-webhook         ║
 * ║  (Este endpoint se registra en Telegram como Webhook URL)    ║
 * ║                                                               ║
 * ║  Comandos soportados:                                        ║
 * ║    /start  — Bienvenida + botón de la WebApp                 ║
 * ║    /status — Estado actual del monitor                       ║
 * ║    /app    — Abre la Telegram WebApp                         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const { TELEGRAM_BOT_TOKEN, WEBAPP_URL } = process.env;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Envía un mensaje de Telegram con soporte para botones inline (teclado).
 * @param {number|string} chatId - ID del chat destino
 * @param {string} texto - Texto del mensaje en Markdown
 * @param {object|null} teclado - InlineKeyboardMarkup opcional
 */
async function responder(chatId, texto, teclado = null) {
  const payload = {
    chat_id:    chatId,
    text:       texto,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...(teclado && { reply_markup: teclado }),
  };

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
}

/**
 * Construye el teclado con el botón de la WebApp.
 * El botón tipo `web_app` abre la URL directamente dentro de Telegram.
 */
function tecladoWebApp() {
  return {
    inline_keyboard: [[
      {
        text:    '📡 Abrir StreamRadar',
        web_app: { url: WEBAPP_URL },
      },
    ]],
  };
}

/**
 * Procesa el comando recibido por el bot.
 * @param {object} mensaje - Objeto mensaje de Telegram
 */
async function procesarComando(mensaje) {
  const chatId  = mensaje.chat.id;
  const texto   = (mensaje.text || '').trim();
  const usuario = mensaje.from?.first_name || 'usuario';

  // /start — Bienvenida
  if (texto.startsWith('/start')) {
    await responder(
      chatId,
      [
        `👋 *Bienvenido a StreamRadar, ${usuario}\\!*`,
        ``,
        `Soy tu monitor 24/7 de momentos virales en *Kick*.`,
        `Recibirás alertas automáticas cuando un streamer de tu lista entre en modo 🔥 HOT o 🔥🔥 VIRAL.`,
        ``,
        `*¿Cómo funciona?*`,
        `1\\. Abre el monitor con el botón de abajo`,
        `2\\. Activa el toggle de los streamers que quieras vigilar`,
        `3\\. Las alertas llegan aquí automáticamente`,
        ``,
        `Usa /app para abrir el monitor en cualquier momento\\.`,
      ].join('\n'),
      tecladoWebApp()
    );
    return;
  }

  // /app — Abrir WebApp directamente
  if (texto.startsWith('/app')) {
    await responder(
      chatId,
      `📡 *StreamRadar — Monitor en vivo*\n\nPresiona el botón para abrir el dashboard:`,
      tecladoWebApp()
    );
    return;
  }

  // /status — Estado del sistema
  if (texto.startsWith('/status')) {
    const hora = new Date().toLocaleTimeString('es-PE', {
      timeZone:     'America/Lima',
      hour12:       false,
      hour:         '2-digit',
      minute:       '2-digit',
      second:       '2-digit',
    });
    await responder(
      chatId,
      [
        `🟢 *StreamRadar — Estado del Sistema*`,
        ``,
        `• Bot: \`ACTIVO\``,
        `• Servidor: \`Netlify Serverless\``,
        `• Hora PET: \`${hora}\``,
        `• Alertas: \`Telegram habilitado\``,
        ``,
        `_El monitoreo en tiempo real corre desde tu navegador/app._`,
      ].join('\n'),
      tecladoWebApp()
    );
    return;
  }

  // Comando desconocido
  await responder(
    chatId,
    `ℹ️ Comandos disponibles:\n\n/start — Bienvenida\n/app — Abrir monitor\n/status — Estado del sistema`
  );
}

// ── Handler principal ────────────────────────────────────────────
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'OK' };
  }

  try {
    const update = JSON.parse(event.body || '{}');

    // Telegram puede enviar distintos tipos de updates; procesamos mensajes de texto
    if (update.message) {
      await procesarComando(update.message);
    }

    // Responder 200 inmediatamente (Telegram reintenta si no recibe 200)
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('[Webhook] Error procesando update:', err.message);
    // Siempre 200 para evitar reintentos de Telegram en errores propios
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }
};
