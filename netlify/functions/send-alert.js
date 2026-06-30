/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  send-alert.js — Función Serverless de StreamRadar v2.1      ║
 * ║  Recibe eventos virales del frontend y los reenvía a         ║
 * ║  Telegram. Corregido: token lazy-load, parse_mode seguro,   ║
 * ║  y cabecera X-Alert-Key opcional para desarrollo.            ║
 * ║                                                               ║
 * ║  Endpoint: POST /.netlify/functions/send-alert               ║
 * ║  Variables de entorno requeridas (Netlify Dashboard):        ║
 * ║    TELEGRAM_BOT_TOKEN   — Token del bot de BotFather         ║
 * ║    TELEGRAM_CHAT_ID     — Chat ID del usuario destino        ║
 * ║    ALERT_SECRET_KEY     — (Opcional) Clave de validación     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ── Tipos de alerta válidos ──────────────────────────────────────
const TIPOS_VALIDOS = ['HOT', 'VIRAL', 'OFFLINE', 'INFO'];

// ─────────────────────────────────────────────────────────────────
// CORRECCIÓN BUG #1: La URL de la API se construye DENTRO del
// handler, no en el módulo raíz. En el módulo raíz process.env
// aún no está inyectado por Netlify en el primer arranque en frío,
// lo que causaba que TELEGRAM_BOT_TOKEN llegara como "undefined"
// dentro de la URL y Telegram rechazara todas las llamadas con 404.
// ─────────────────────────────────────────────────────────────────
function getTelegramUrl() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no configurado.');
  return `https://api.telegram.org/bot${token}`;
}

/**
 * Escapa caracteres especiales para MarkdownV2 de Telegram.
 * Telegram MarkdownV2 requiere escapar: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * Si no se escapan, la API rechaza el mensaje con "can't parse entities".
 *
 * CORRECCIÓN BUG #2: El mensaje INFO usaba MarkdownV1 mezclado con
 * caracteres especiales sin escapar. Ahora usamos parse_mode: 'HTML'
 * que es más permisivo y no requiere escapado manual.
 */
function formatearMensajeHTML(datos) {
  const { streamer, tipo, score, mpm, baseline, markStream, hora, mensaje } = datos;

  // Escapar el nombre del streamer por si contiene caracteres HTML
  const safe = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const streamerSafe = safe(streamer);
  const kickUrl      = `https://kick.com/${streamerSafe}`;

  if (tipo === 'VIRAL') {
    return [
      `🔥🔥 <b>[STREAMRADAR] — ALERTA VIRAL</b>`,
      ``,
      `👤 <b>Streamer:</b> <a href="${kickUrl}">${streamerSafe.toUpperCase()}</a>`,
      `📊 <b>Viral Score:</b> <code>${safe(score)}/100</code>`,
      `💬 <b>Msgs/min:</b> <code>${safe(mpm)}</code> <i>(baseline: ${safe(baseline)})</i>`,
      `⏱ <b>Min. del stream:</b> <code>${safe(markStream)}</code>`,
      `🕐 <b>Hora PET:</b> <code>${safe(hora)}</code>`,
      ``,
      `<i>Abre el monitor para ver detalles en tiempo real.</i>`,
    ].join('\n');
  }

  if (tipo === 'HOT') {
    return [
      `🔥 <b>[STREAMRADAR] — CHAT CALIENTE</b>`,
      ``,
      `👤 <b>Streamer:</b> <a href="${kickUrl}">${streamerSafe.toUpperCase()}</a>`,
      `📊 <b>Viral Score:</b> <code>${safe(score)}/100</code>`,
      `💬 <b>Msgs/min:</b> <code>${safe(mpm)}</code> <i>(baseline: ${safe(baseline)})</i>`,
      `⏱ <b>Min. del stream:</b> <code>${safe(markStream)}</code>`,
      `🕐 <b>Hora PET:</b> <code>${safe(hora)}</code>`,
    ].join('\n');
  }

  if (tipo === 'OFFLINE') {
    return `📴 <b>${streamerSafe.toUpperCase()}</b> ha finalizado su stream.\n🕐 <code>${safe(hora)}</code> PET`;
  }

  // INFO — mensaje genérico (alerta de prueba incluida)
  return `ℹ️ <b>StreamRadar:</b> ${safe(mensaje) || 'Evento sin detalles.'}`;
}

/**
 * Llama a la API de Telegram para enviar el mensaje formateado.
 * @param {string} html - Mensaje en formato HTML
 * @returns {Promise<object>} Respuesta de Telegram
 */
async function enviarMensajeTelegram(html) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID no configurado.');

  const payload = {
    chat_id:                  chatId,
    text:                     html,
    parse_mode:               'HTML',   // HTML es más robusto que Markdown
    disable_web_page_preview: true,     // Evita que Kick preview ocupe espacio
  };

  const respuesta = await fetch(`${getTelegramUrl()}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  const data = await respuesta.json();

  if (!respuesta.ok || !data.ok) {
    // Loguear el error completo de Telegram para diagnóstico en Netlify Logs
    console.error('[StreamRadar] Telegram API rechazó el mensaje:', JSON.stringify(data));
    throw new Error(data.description || `HTTP ${respuesta.status}`);
  }

  return data;
}

/**
 * Valida el payload recibido del frontend.
 * @param {object} body
 * @returns {{ valido: boolean, error?: string }}
 */
function validarPayload(body) {
  if (!body || typeof body !== 'object') {
    return { valido: false, error: 'Payload inválido o vacío.' };
  }
  if (!TIPOS_VALIDOS.includes(body.tipo)) {
    return {
      valido: false,
      error:  `Tipo "${body.tipo}" no válido. Acepta: ${TIPOS_VALIDOS.join(', ')}`,
    };
  }
  if (!body.streamer || typeof body.streamer !== 'string') {
    return { valido: false, error: 'Campo "streamer" requerido.' };
  }
  return { valido: true };
}

// ── Handler principal ────────────────────────────────────────────
exports.handler = async function (event) {

  // Cabeceras CORS — permiten el fetch desde el frontend de Netlify
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Alert-Key',
    'Content-Type':                 'application/json',
  };

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Método no permitido.' }) };
  }

  // ── Autenticación opcional ───────────────────────────────────
  // CORRECCIÓN BUG #3: Antes el frontend NO enviaba el header X-Alert-Key
  // pero la función lo exigía siempre que ALERT_SECRET_KEY estuviera definida,
  // causando un 401 en cada request. Ahora:
  //   • Si ALERT_SECRET_KEY está vacía/no definida → se omite la validación
  //     (útil para desarrollo o si no quieres configurar la clave extra).
  //   • Si está definida → se valida el header X-Alert-Key normalmente.
  const claveConfigurada = process.env.ALERT_SECRET_KEY;
  if (claveConfigurada) {
    // Normalizar: Netlify puede entregar headers en minúsculas
    const claveRecibida =
      event.headers['x-alert-key'] ||
      event.headers['X-Alert-Key'] ||
      '';

    if (claveRecibida !== claveConfigurada) {
      console.warn('[StreamRadar] Intento con clave inválida. IP:', event.headers['x-forwarded-for']);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ ok: false, error: 'No autorizado: clave incorrecta.' }),
      };
    }
  }

  // ── Verificar variables de entorno críticas ──────────────────
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error('[StreamRadar] TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no están configurados en Netlify.');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok:    false,
        error: 'Error de configuración del servidor. Verifica las variables de entorno en Netlify.',
      }),
    };
  }

  // ── Parsear body ─────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'Body con JSON inválido.' }),
    };
  }

  // ── Validar payload ──────────────────────────────────────────
  const { valido, error: errValidacion } = validarPayload(body);
  if (!valido) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: errValidacion }) };
  }

  // ── Enviar a Telegram ────────────────────────────────────────
  try {
    const html         = formatearMensajeHTML(body);
    const telegramResp = await enviarMensajeTelegram(html);
    const msgId        = telegramResp.result?.message_id;

    console.log(`[StreamRadar] ✅ Alerta ${body.tipo} enviada — streamer: ${body.streamer} — msgId: ${msgId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, messageId: msgId, streamer: body.streamer, tipo: body.tipo }),
    };

  } catch (err) {
    console.error('[StreamRadar] ❌ Error al enviar a Telegram:', err.message);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        ok:    false,
        error: `No se pudo entregar la alerta a Telegram: ${err.message}`,
      }),
    };
  }
};
