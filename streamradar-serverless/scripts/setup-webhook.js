#!/usr/bin/env node
/**
 * setup-webhook.js
 * ─────────────────────────────────────────────────────────────────
 * Registra el Webhook de Telegram para que el bot reciba updates.
 * Ejecutar UNA VEZ después de cada deploy en Netlify.
 *
 * Uso:
 *   node scripts/setup-webhook.js
 *
 * Requiere las variables de entorno:
 *   TELEGRAM_BOT_TOKEN y WEBAPP_URL
 * ─────────────────────────────────────────────────────────────────
 */

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const SITE_URL = process.env.WEBAPP_URL;

if (!TOKEN || !SITE_URL) {
  console.error('❌ Faltan variables de entorno: TELEGRAM_BOT_TOKEN y/o WEBAPP_URL');
  process.exit(1);
}

const WEBHOOK_URL = `${SITE_URL}/.netlify/functions/telegram-webhook`;

async function registrarWebhook() {
  console.log(`\n📡 Registrando Webhook de Telegram...`);
  console.log(`   Bot Token: ${TOKEN.substring(0, 10)}...`);
  console.log(`   Webhook URL: ${WEBHOOK_URL}\n`);

  const url = `https://api.telegram.org/bot${TOKEN}/setWebhook`;
  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      url:                  WEBHOOK_URL,
      allowed_updates:      ['message', 'callback_query'],
      drop_pending_updates: true,
    }),
  });

  const data = await resp.json();

  if (data.ok) {
    console.log('✅ Webhook registrado correctamente.');
    console.log(`   Descripción: ${data.description}`);
  } else {
    console.error('❌ Error registrando Webhook:', data.description);
    process.exit(1);
  }

  // Verificar el estado del webhook
  const infoResp = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
  const info     = await infoResp.json();

  if (info.ok) {
    console.log('\n📋 Estado actual del Webhook:');
    console.log(`   URL:                ${info.result.url}`);
    console.log(`   Pendientes:         ${info.result.pending_update_count}`);
    console.log(`   Último error:       ${info.result.last_error_message || 'Ninguno'}`);
  }

  console.log('\n🤖 Configura el botón de la WebApp en BotFather:');
  console.log('   1. Abre @BotFather en Telegram');
  console.log('   2. Envía: /mybots → selecciona tu bot');
  console.log('   3. Ve a: Bot Settings → Menu Button');
  console.log(`   4. URL de la WebApp: ${SITE_URL}/index.html`);
  console.log('   5. Texto del botón: 📡 StreamRadar\n');
}

registrarWebhook().catch(err => {
  console.error('❌ Error inesperado:', err.message);
  process.exit(1);
});
