/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  health.js — Diagnóstico de configuración de StreamRadar    ║
 * ║  Verifica que las variables de entorno estén presentes SIN  ║
 * ║  revelar sus valores. Útil para diagnosticar errores 500.   ║
 * ║                                                               ║
 * ║  Endpoint: GET /.netlify/functions/health                    ║
 * ║  (también accesible como GET /api/health via netlify.toml)  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const token  = process.env.TELEGRAM_BOT_TOKEN  || '';
  const chatId = process.env.TELEGRAM_CHAT_ID    || '';
  const clave  = process.env.ALERT_SECRET_KEY    || '';
  const webapp = process.env.WEBAPP_URL           || '';

  // Verificar conectividad con Telegram SIN exponer el token
  let telegramOk      = false;
  let telegramDetalle = '';

  if (token && chatId) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await resp.json();
      if (data.ok) {
        telegramOk      = true;
        telegramDetalle = `Bot: @${data.result.username}`;
      } else {
        telegramDetalle = `Error Telegram: ${data.description}`;
      }
    } catch (err) {
      telegramDetalle = `Sin red: ${err.message}`;
    }
  } else {
    telegramDetalle = 'Faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID';
  }

  const estado = {
    sistema: 'StreamRadar Serverless',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    variables: {
      TELEGRAM_BOT_TOKEN:  token  ? `✅ Definida (${token.length} chars, empieza con "${token.substring(0,6)}...")` : '❌ NO DEFINIDA',
      TELEGRAM_CHAT_ID:    chatId ? `✅ Definida → "${chatId}"` : '❌ NO DEFINIDA',
      ALERT_SECRET_KEY:    clave  ? `✅ Definida (${clave.length} chars)` : '⚠️ No definida (autenticación desactivada)',
      WEBAPP_URL:          webapp ? `✅ Definida → "${webapp}"` : '⚠️ No definida',
    },
    telegram: {
      ok:      telegramOk,
      detalle: telegramDetalle,
    },
    todo_ok: telegramOk && !!token && !!chatId,
  };

  return {
    statusCode: estado.todo_ok ? 200 : 503,
    headers,
    body: JSON.stringify(estado, null, 2),
  };
};
