import os
import io
import requests
import numpy as np
import tensorflow as tf
from PIL import Image
from supabase import create_client, Client
import time
from keras.layers import TFSMLayer
import datetime

# -- Pengaturan Proyek Supabase --
supabase_url: str = "https://kdaocguynqvdbyjtfcaf.supabase.co"
supabase_key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkYW9jZ3V5bnF2ZGJ5anRmY2FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Nzc1NDMzOCwiZXhwIjoyMDYzMzMwMzM4fQ.wjVdNEtI_pbDkTl2QUn3CR09VTKUQNhZe1N1CLI9yzA"
BUCKET_NAME = "images"
TABLE_NAME = "disease_prediction"
MODEL_FOLDER_NAME = "SaveModel_ANN_DenseNet201(2)"
MAX_RECORDS = 25 

# -- Pengaturan Telegram --
TELEGRAM_BOT_TOKEN = "7727781229:AAGQgN1OyzZqSLNR26BYpfpbhTIxu8Lu05E"
TELEGRAM_CHAT_ID = "1178419483"

# Definisikan nama-nama kelas
CLASS_NAMES = ["bercak daun", "daun keriting", "kutu kebul", "sehat", "virus kuning"]

# -- Setup Supabase dan Model --
try:
    supabase: Client = create_client(supabase_url, supabase_key)
    model = TFSMLayer(MODEL_FOLDER_NAME, call_endpoint='serving_default')
except Exception as e:
    raise RuntimeError(f"Gagal memuat model: {e}")

# -- Fungsi untuk Memproses Gambar --
def process_image(img_url: str):
    """Mengunduh dan memproses gambar dari URL."""
    try:
        response = requests.get(img_url)
        response.raise_for_status()
        img = Image.open(io.BytesIO(response.content)).convert('RGB')
        img = img.resize((224, 224))
        img_array = np.array(img) / 255.0
        img_array = np.expand_dims(img_array, axis=0)
        return img_array
    except Exception as e:
        print(f"Error memproses gambar {img_url}: {e}")
        return None

def get_image_urls():
    """Mengambil daftar URL gambar yang valid dari Storage."""
    res = supabase.storage.from_(BUCKET_NAME).list()
    urls = []
    for item in res:
        if 'name' in item:
            file_name = item['name']
            if not file_name.startswith('.') and file_name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.jfif')):
                url_res = supabase.storage.from_(BUCKET_NAME).get_public_url(file_name)
                urls.append(url_res)
    return urls

# -- Fungsi untuk Prediksi dan Penyimpanan Hasil --
def predict_from_url(img_url: str):
    """Melakukan prediksi dan mengembalikan hasilnya."""
    processed_image = process_image(img_url)
    if processed_image is None:
        return None, None

    predictions = model(processed_image)
    output_key = next(iter(predictions.keys()))
    predicted_class_index = np.argmax(predictions[output_key][0])
    confidence = float(predictions[output_key][0][predicted_class_index])
    predicted_class_name = CLASS_NAMES[predicted_class_index]

    return predicted_class_name, confidence

def send_telegram_notification(prediction_result):
    """Mengirim notifikasi ke Telegram menggunakan API."""
    # Dapatkan waktu dan tanggal saat ini
    now = datetime.datetime.now()
    timestamp = now.strftime("%Y-%m-%d %H:%M:%S")

    # Dapatkan nama file dari URL
    url_without_query = prediction_result['image_url'].split('?')[0]
    file_name = url_without_query.split('/')[-1]
            
    message = (
        "🟢 *Peringatan Kondisi Tanaman!* 🟢\n\n"
        f"URL Gambar: [Lihat Gambar]({prediction_result['image_url']})\n\n"
        f"Nama File: *{file_name}*\n"
        f"Kondisi/Penyakit: *{prediction_result['prediction']}*\n"
        f"Kepercayaan: *{(prediction_result['confidence']*100):.2f}%*\n"
        f"Waktu: {timestamp}"
    )
    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        'chat_id': TELEGRAM_CHAT_ID,
        'text': message,
        'parse_mode': 'Markdown'
    }
    try:
        response = requests.post(api_url, json=payload)
        response.raise_for_status()
        print("Notifikasi Telegram berhasil dikirim.")
    except Exception as e:
        print(f"Gagal mengirim notifikasi Telegram: {e}")    

def insert_result_to_db(url, pred, conf):
    """Menyisipkan hasil prediksi ke database."""
    data_to_insert = {
        "image_url": url,
        "prediction": pred,
        "confidence": conf
    }
    insert_res = supabase.from_(TABLE_NAME).insert(data_to_insert).execute()
    if insert_res.data:
        print(f"Berhasil menyisipkan hasil untuk URL:\n{url}")
        send_telegram_notification(data_to_insert)
        delete_old_records()
    else:
        print(f"Gagal menyisipkan hasil untuk URL:\n{url}")

# -- Fungsi baru untuk menghapus data lama --
def delete_old_records():
    """Menghapus data terlama agar jumlah total tidak melebihi MAX_RECORDS."""
    print("Mengecek dan menghapus data lama...")
    res = supabase.from_(TABLE_NAME).select('id').order('created_at', desc=True).execute()
    
    # Jika jumlah data lebih dari batas maksimum
    if len(res.data) > MAX_RECORDS:
        ids_to_delete = [item['id'] for item in res.data[MAX_RECORDS:]]
        print(f"Menghapus {len(ids_to_delete)} data lama...")
        
        # Hapus data dari database berdasarkan ID
        delete_res = supabase.from_(TABLE_NAME).delete().in_('id', ids_to_delete).execute()
        if delete_res.data:
            print("Berhasil menghapus data lama.")
        else:
            print("Gagal menghapus data lama.")

# -- Fungsi Utama yang Menjalankan Siklus Otomatis --
def main():
    while True:
        print("Mencari gambar baru...")
        urls = get_image_urls()

        for url in urls:
            check_res = supabase.from_(TABLE_NAME).select("image_url").eq("image_url", url).execute()
            if not check_res.data:
                pred, conf = predict_from_url(url)
                if pred and conf:
                    insert_result_to_db(url, pred, conf)

        print("Selesai. Menunggu...")
        time.sleep(60)

if __name__ == "__main__":
    main()