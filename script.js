// SUPABASE URL & ANON KEY
const SUPABASE_URL = 'https://kdaocguynqvdbyjtfcaf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkYW9jZ3V5bnF2ZGJ5anRmY2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NTQzMzgsImV4cCI6MjA2MzMzMDMzOH0.UPMPb8VjmGsWkUVqeE9lL40v-nf6SLkwhrHFbd9k5Y4';

const supabaseCLient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tableBody = document.querySelector('#data-table tbody');
const NAMA_TABEL_SUPABASE = 'sensor_data';

let sensorChart;
let chartLabels = [];
let chartSuhuData = [];
let chartKelembabanUdaraData = [];
let chartKelembabanTanahData = [];

// Format Waktu untuk Grafik Utama
function formatChartDate(timestamp) {
    const date = new Date(timestamp);
    const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' };
    return date.toLocaleString('id-ID', options).replace(/\./g, ':');
}

// 2. Format Tanggal untuk Grafik Mingguan
function formatWeeklyDateOnly(timestamp) {
    const date = new Date(timestamp);
    const options = { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jakarta' };
    return date.toLocaleString('id-ID', options);
}

function initializeChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    sensorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [
                { label: 'Temperature (°C)', data: chartSuhuData, borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.2)', tension: 0.1, fill: false },
                { label: 'Air Humidity (%)', data: chartKelembabanUdaraData, borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgba(54, 162, 235, 0.2)', tension: 0.1, fill: false },
                { label: 'Soil Moisture (%)', data: chartKelembabanTanahData, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1, fill: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Time (WIB)' } },
                y: { title: { display: true, text: 'Mark' }, beginAtZero: false }
            }
        }
    });
}

async function loadInitialData() {
    const { data, error } = await supabaseCLient.from(NAMA_TABEL_SUPABASE).select('*').order('created_at', { ascending: false });
    if (error) return console.error('Error:', error.message);
    if (data) {
        const sortedData = [...data].reverse();
        chartLabels = sortedData.map(d => formatChartDate(d.created_at));
        chartSuhuData = sortedData.map(d => d.suhu);
        chartKelembabanUdaraData = sortedData.map(d => d.kelembaban_udara);
        chartKelembabanTanahData = sortedData.map(d => d.kelembaban_tanah);
        initializeChart();
        data.forEach(rowData => addRowToTable(rowData));
    }
}

function addRowToTable(rowData) {
    const row = tableBody.insertRow(0);
    row.dataset.id = rowData.id;
    const date = new Date(rowData.created_at);
    const options = { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' };
    const formattedDate = date.toLocaleString('id-ID', options).replace(/\./g, ':');
    
    row.insertCell(0).textContent = rowData.id;
    row.insertCell(1).textContent = `${rowData.suhu}°C`;
    row.insertCell(2).textContent = `${rowData.kelembaban_udara}%`;
    row.insertCell(3).textContent = `${rowData.kelembaban_tanah}%`;
    row.insertCell(4).textContent = rowData.status_tanah;
    row.insertCell(5).textContent = rowData.waktu || formattedDate;

    const actionCell = row.insertCell(6);
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'delete-button';
    deleteBtn.onclick = () => { if(confirm('Hapus data?')) deleteDataRow(rowData.id, row); };
    actionCell.appendChild(deleteBtn);
}

async function deleteDataRow(id, rowElement) {
    const { error } = await supabaseCLient.from(NAMA_TABEL_SUPABASE).delete().eq('id', id);
    if (error) alert('Gagal: ' + error.message);
    else rowElement.remove();
}

function updateDashboard(latestData) {
    if (latestData) {
        document.getElementById('suhu-value').textContent = `${latestData.suhu}°C`;
        document.getElementById('kelembaban-udara-value').textContent = `${latestData.kelembaban_udara}%`;
        document.getElementById('kelembaban-tanah-value').textContent = `${latestData.kelembaban_tanah}%`;
        document.getElementById('status-tanah-value').textContent = latestData.status_tanah || 'N/A';
    }
}

function setupRealtimeListener() {
    supabaseCLient.channel('public:sensor_data').on('postgres_changes', { event: 'INSERT', schema: 'public', table: NAMA_TABEL_SUPABASE }, payload => {
        addRowToTable(payload.new);
        updateDashboard(payload.new);
        chartLabels.push(formatChartDate(payload.new.created_at));
        chartSuhuData.push(payload.new.suhu);
        chartKelembabanUdaraData.push(payload.new.kelembaban_udara);
        chartKelembabanTanahData.push(payload.new.kelembaban_tanah);
        if (chartLabels.length > 25) { chartLabels.shift(); chartSuhuData.shift(); chartKelembabanUdaraData.shift(); chartKelembabanTanahData.shift(); }
        sensorChart.update();
    }).subscribe();
}

async function loadWeeklyMonitoring() {
    const rentangWaktu = new Date();
    rentangWaktu.setDate(rentangWaktu.getDate() - 500); 

    const { data, error } = await supabaseCLient.from(NAMA_TABEL_SUPABASE).select('*').gte('created_at', rentangWaktu.toISOString()).order('created_at', { ascending: true });

    if (data) {
        const labels = data.map(d => formatWeeklyDateOnly(d.created_at));
        const optionsConfig = { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false }, x: { title: { display: true, text: 'Date' } } } };

        new Chart(document.getElementById('weeklyTempChart'), {
            type: 'line',
            data: { labels: labels, datasets: [{ label: 'Temperature (°C)', data: data.map(d => d.suhu), borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 0, 0, 0.2)', fill: true, tension: 0.1 }] },
            options: optionsConfig
        });

        new Chart(document.getElementById('weeklyHumChart'), {
            type: 'line',
            data: { labels: labels, datasets: [{ label: 'Air Humidity (%)', data: data.map(d => d.kelembaban_udara), borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgba(0, 0, 255, 0.3)', fill: true, tension: 0.1 }] },
            options: optionsConfig
        });

        new Chart(document.getElementById('weeklySoilChart'), {
            type: 'line',
            data: { labels: labels, datasets: [{ label: 'Soil Moisture (%)', data: data.map(d => d.kelembaban_tanah), borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(0, 128, 0, 0.3)', fill: true, tension: 0.1 }] },
            options: optionsConfig
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData(); 
    await loadWeeklyMonitoring();

    const { data: latestData, error } = await supabaseCLient.from(NAMA_TABEL_SUPABASE).select('*').order('created_at', { ascending: false }).limit(1);
    if (!error && latestData.length > 0) updateDashboard(latestData[0]);

    setupRealtimeListener();
});