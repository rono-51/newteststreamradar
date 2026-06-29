/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  send-alert.js — Función Serverless de StreamRadar           ║
 * ║  Recibe un evento de alerta viral desde el frontend y        ║
 * ║  dispara un mensaje inmediato al usuario vía Telegram API.   ║
 * ║                                                               ║
 * ║  Endpoint: POST /.netlify/functions/send-alert               ║
 * ║  Variables de entorno requeridas:                            ║
 * ║    TELEGRAM_BOT_TOKEN   — Token del bot de BotFather         ║
 * ║    TELEGRAM_CHAT_ID     — Chat ID del usuario destino        ║
 * ║    ALERT_SECRET_KEY     — Clave para validar el frontend     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ── Importaciones ────────────────────────────────────────────────
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ALERT_SECRET_KEY } = process.env;

// ── Constantes ───────────────────────────────────────────────────
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ── Tipos de alerta válidos ──────────────────────────────────────
const TIPOS_VALIDOS = ['HOT', 'VIRAL', 'OFFLINE', 'INFO'];

/**
 * Formatea el mensaje de alerta en Markdown de Telegram.
 * @param {object} datos - Payload del evento
 * @returns {string} Mensaje en formato Markdown
 */
function formatearMensaje(datos) {
  const { streamer, tipo, score, mpm, baseline, markStream, hora } = datos;

  const emojis = {
    VIRAL:   '🔥🔥',
    HOT:     '🔥',
    OFFLINE: '📴',
    INFO:    'ℹ️',
  };

  const emoji = emojis[tipo] || 'ℹ️';
  const kickUrl = `https://kick.com/${streamer}`;

  if (tipo === 'VIRAL' || tipo === 'HOT') {
    return [
      `${emoji} *[STREAMRADAR] — ALERTA ${tipo}*`,
      ``,
      `👤 *Streamer:* [${streamer.toUpperCase()}](${kickUrl})`,
      `📊 *Viral Score:* \`${score}/100\``,
      `💬 *Msgs/min:* \`${mpm}\` _(baseline: ${baseline})_`,
      `⏱ *Min. del stream:* \`${markStream}\``,
      `🕐 *Hora PET:* \`${hora}\``,
      ``,
      `> Abre el monitor para ver detalles en tiempo real.`,
    ].join('\n');
  }

  if (tipo === 'OFFLINE') {
    return `📴 *${streamer.toUpperCase()}* ha finalizado su stream.\n🕐 \`${hora}\` PET`;
  }

  return `ℹ️ *StreamRadar:* ${datos.mensaje || 'Evento sin detalles.'}`;
}

/**
 * Envía el mensaje formateado a Telegram usando fetch nativo.
 * @param {string} texto - Mensaje en Markdown
 * @returns {Promise<object>} Respuesta de la API de Telegram
 */
async function enviarMensajeTelegram(texto) {
  const payload = {
    chat_id:    TELEGRAM_CHAT_ID,
    text:       texto,
    parse_mode: 'Markdown',
    disable_web_page_preview: false,
  };

  const respuesta = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!respuesta.ok) {
    const error = await respuesta.json();
    throw new Error(`Telegram API error: ${JSON.stringify(error)}`);
  }

  return respuesta.json();
}

/**
 * Valida que el payload recibido contenga los campos obligatorios.
 * @param {object} body - Cuerpo del request parseado
 * @returns {{ valido: boolean, error?: string }}
 */
function validarPayload(body) {
  if (!body || typeof body !== 'object') {
    return { valido: false, error: 'Payload inválido o vacío.' };
  }
  if (!TIPOS_VALIDOS.includes(body.tipo)) {
    return { valido: false, error: `Tipo de alerta inválido: "${body.tipo}". Válidos: ${TIPOS_VALIDOS.join(', ')}` };
  }
  if (!body.streamer || typeof body.streamer !== 'string') {
    return { valido: false, error: 'Campo "streamer" requerido.' };
  }
  return { valido: true };
}

// ── Handler principal de Netlify Functions ───────────────────────
exports.handler = async function(event) {
  // ── CORS: permitir solo métodos necesarios ───────────────────
  const headersBase = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Alert-Key',
    'Content-Type':                 'application/json',
  };

  // Respuesta a preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headersBase, body: '' };
  }

  // Solo aceptar POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers:    headersBase,
      body:       JSON.stringify({ ok: false, error: 'Método no permitido.' }),
    };
  }

  // ── Autenticación: validar clave secreta del frontend ────────
  const claveRecibida = event.headers['x-alert-key'] || '';
  if (ALERT_SECRET_KEY && claveRecibida !== ALERT_SECRET_KEY) {
    return {
      statusCode: 401,
      headers:    headersBase,
      body:       JSON.stringify({ ok: false, error: 'No autorizado.' }),
    };
  }

  // ── Verificar variables de entorno esenciales ────────────────
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[StreamRadar] Variables de entorno de Telegram no configuradas.');
    return {
      statusCode: 500,
      headers:    headersBase,
      body:       JSON.stringify({ ok: false, error: 'Configuración del servidor incompleta.' }),
    };
  }

  // ── Parsear y validar el body del request ────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers:    headersBase,
      body:       JSON.stringify({ ok: false, error: 'JSON inválido en el body.' }),
    };
  }

  const { valido, error: errorValidacion } = validarPayload(body);
  if (!valido) {
    return {
      statusCode: 400,
      headers:    headersBase,
      body:       JSON.stringify({ ok: false, error: errorValidacion }),
    };
  }

  // ── Disparar alerta a Telegram ───────────────────────────────
  try {
    const mensaje      = formatearMensaje(body);
    const telegramResp = await enviarMensajeTelegram(mensaje);

    console.log(`[StreamRadar] Alerta ${body.tipo} enviada para ${body.streamer}. Message ID: ${telegramResp.result?.message_id}`);

    return {
      statusCode: 200,
      headers:    headersBase,
      body:       JSON.stringify({
        ok:        true,
        messageId: telegramResp.result?.message_id,
        streamer:  body.streamer,
        tipo:      body.tipo,
      }),
    };
  } catch (err) {
    console.error('[StreamRadar] Error enviando a Telegram:', err.message);
    return {
      statusCode: 502,
      headers:    headersBase,
      body:       JSON.stringify({ ok: false, error: 'No se pudo enviar la alerta a Telegram.' }),
    };
  }
};
