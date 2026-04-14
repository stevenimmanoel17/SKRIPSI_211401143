import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PREDICTION_API_URL = Deno.env.get('PREDICTION_API_URL')!;

serve(async (req) => {
    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
            global: {
                headers: { 'Authorization': req.headers.get('Authorization')! }
            }
        }
    );

    // Dapatkan data dari payload Storage Webhook
    const { record } = await req.json();
    const bucketId = record.bucket_id;
    const objectName = record.name;

    // Buat URL publik dari informasi yang diterima
    const imageUrl = `https://kdaocguynqvdbyjtfcaf.supabase.co/storage/v1/object/public/${bucketId}/${objectName}`;

    // Panggil API Python untuk prediksi
    const predictionResponse = await fetch(PREDICTION_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl })
    });
    const result = await predictionResponse.json();

    // Sisipkan data baru ke tabel database
    const { data, error } = await supabaseClient
        .from('prediksi_tanaman')
        .insert({
            image_url: imageUrl,
            prediction: result.prediction,
            confidence: result.confidence
        })
        .select();

    if (error) {
        console.error("Gagal menyisipkan data:", error);
        return new Response(JSON.stringify({ error: 'Gagal menyisipkan data' }), {
            headers: { "Content-Type": "application/json" },
            status: 500
        });
    }

    return new Response(JSON.stringify({ message: "Prediksi berhasil", data }), {
        headers: { "Content-Type": "application/json" },
        status: 200
    });
});