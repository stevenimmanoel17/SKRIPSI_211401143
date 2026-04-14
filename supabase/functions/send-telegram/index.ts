import { serve } from 'https://deno.land/std@0.178.0/http/server.ts';
console.log('send-telegram Edge Function started!');
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
serve(async (req)=>{
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405
    });
  }
  try {
    const payload = await req.json();
    const newRecord = payload.record;
    console.log('Webhook payload received:', newRecord);
    if (newRecord && newRecord.status_tanah && newRecord.status_tanah.toLowerCase().trim() === 'kering') {
      const message = `🚨 *Peringatan Kondisi Tanah Kering!* 🚨
Sensor ID: ${newRecord.id}
Suhu: ${newRecord.suhu}°C
Kelembaban Udara: ${newRecord.kelembaban_udara}%
Kelembaban Tanah: ${newRecord.kelembaban_tanah}%
Waktu: ${new Date(newRecord.created_at).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta'
      })}

*Harap segera lakukan penyiraman!*`;
      const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const telegramResponse = await fetch(telegramApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      });
      if (!telegramResponse.ok) {
        const errorText = await telegramResponse.text();
        console.error('Gagal mengirim notifikasi Telegram:', errorText);
        return new Response(`Failed to send Telegram notification: ${errorText}`, {
          status: 500
        });
      } else {
        console.log('Notifikasi Telegram berhasil terkirim!');
        return new Response('Telegram notification sent successfully!', {
          status: 200
        });
      }
    } else {
      console.log('Kondisi tanah tidak kering, tidak mengirim notifikasi.');
      return new Response('Soil not dry, no notification sent.', {
        status: 200
      });
    }
  } catch (error) {
    console.error('Error in Edge Function:', error.message);
    return new Response(`Internal Server Error: ${error.message}`, {
      status: 500
    });
  }
});