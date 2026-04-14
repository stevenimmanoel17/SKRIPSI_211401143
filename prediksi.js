import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Inisialisasi Supabase Client
const supabaseUrl = 'https://kdaocguynqvdbyjtfcaf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkYW9jZ3V5bnF2ZGJ5anRmY2FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Nzc1NDMzOCwiZXhwIjoyMDYzMzMwMzM4fQ.wjVdNEtI_pbDkTl2QUn3CR09VTKUQNhZe1N1CLI9yzA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const historyContainer = document.getElementById('history-container');
const imageModal = document.getElementById('image-modal');
const fullImage = document.getElementById('full-image');
const closeButton = document.getElementsByClassName('close-button')[0];

// Fungsi untuk membuat card riwayat prediksi
function createPredictionCard(prediction) {
    const card = document.createElement('div');
    card.className = 'history-card';
    
    if (prediction.image_url) {
      const img = document.createElement('img');
      img.src = prediction.image_url;
      card.appendChild(img);
      
      // Tambahkan event listener untuk membuka modal
      img.onclick = () => {
        imageModal.style.display = 'flex';
        fullImage.src = img.src;
      };
    }

    // Pisahkan URL berdasarkan tanda '?' untuk menghapus query string
    const urlWithoutQuery = prediction.image_url.split('?')[0];
    
    // Dapatkan nama file dari URL yang sudah bersih
    const fileName = urlWithoutQuery.split('/').pop();

    const fileNameElement = document.createElement('h4');
    fileNameElement.textContent = fileName;
    card.appendChild(fileNameElement);

    const title = document.createElement('h3');
    title.textContent = prediction.prediction || 'Memproses...';
    card.appendChild(title);

    const confidence = document.createElement('p');
    confidence.textContent = `Kepercayaan: ${prediction.confidence ? (prediction.confidence * 100).toFixed(2) + '%' : 'N/A'}`;
    card.appendChild(confidence);

    const timestamp = document.createElement('p');
    timestamp.textContent = new Date(prediction.created_at).toLocaleString();
    card.appendChild(timestamp);

    return card;
}

// Tambahkan event listener untuk tombol tutup modal
closeButton.onclick = () => {
    imageModal.style.display = 'none';
};

// Fungsi untuk mengambil dan menampilkan data riwayat
async function fetchHistory() {
    const { data, error } = await supabase
        .from('disease_prediction')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Gagal mengambil data:', error.message);
        return;
    }

    historyContainer.innerHTML = '';
    data.forEach(item => {
        const card = createPredictionCard(item);
        historyContainer.appendChild(card);
    });
}

// Menjalankan fungsi saat halaman dimuat
fetchHistory();

// Mendengarkan perubahan real-time di tabel database
supabase
    .channel('public:disease_prediction')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'disease_prediction' }, payload => {
        console.log('Perubahan real-time diterima:', payload);
        fetchHistory(); // Perbarui tampilan saat ada perubahan
    })
    .subscribe();