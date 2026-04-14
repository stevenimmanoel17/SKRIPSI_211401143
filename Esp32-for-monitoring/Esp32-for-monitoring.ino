#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <time.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// 🔐 WiFi Configuration
#define WIFI_SSID "*****"
#define WIFI_PASSWORD "*****"

// 🌐 Supabase Configuration
const char* SUPABASE_URL = "*****";
const char* SUPABASE_API_KEY = "*****";

// 🔧 Sensor Configuration
#define DHTPIN 4
#define DHTTYPE DHT22
#define SOIL_PIN 35

DHT dht(DHTPIN, DHTTYPE);

// Kalibrasi sensor tanah
const int adc_kering = 4095;
const int adc_basah = 1868;

// Inisialisasi LCD
LiquidCrystal_I2C lcd(0x27, 16, 2);

bool hasUploaded = false;

// Format string waktu yang akan ditampilkan
char timeString[50];

void setup() {
  Serial.begin(115200);
  dht.begin();

  // Inisialisasi LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Garden");
  lcd.setCursor(0, 1);
  lcd.print("Loading...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Menghubungkan ke WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\nWiFi Terhubung!");

  // 🌐 Sinkronisasi waktu NTP
  // Atur zona waktu ke Asia/Jakarta (WIB)
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo)) {
    Serial.println("⏳ Menunggu sinkronisasi waktu NTP...");
    delay(1000);
  }
  Serial.println("✅ Waktu berhasil disinkronkan");
}

void loop() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("❌ Gagal mendapatkan waktu");
    delay(1000);
    return;
  }
  
  // Kirim data dan tampilkan di LCD setiap 1, 5, 10, 15 menit dll.
  if (timeinfo.tm_sec == 0 && (timeinfo.tm_min % 3 == 0) && !hasUploaded) {
    hasUploaded = true;
    displaySensorData(); // Memanggil fungsi display
    sendDataToSupabase(); // Memanggil fungsi kirim data
  }
    
  if (timeinfo.tm_sec > 0) {
    hasUploaded = false;
  }

  delay(200); // Cek setiap 200ms
}

void displaySensorData() {
  // 🌡️ Baca DHT22
  float suhu = dht.readTemperature();
  float kelembaban_udara = dht.readHumidity();
  
  // 🌱 Baca sensor tanah
  int nilaiSoil = analogRead(SOIL_PIN);
  float kelembaban_tanah = map(nilaiSoil, adc_kering, adc_basah, 0, 100);
  kelembaban_tanah = constrain(kelembaban_tanah, 0, 100);
  
  lcd.clear();
  
  // Baris pertama: Suhu dan Kelembaban Udara
  if (isnan(suhu) || isnan(kelembaban_udara)) {
    lcd.setCursor(0, 0);
    lcd.print("DHT Error!");
  } else {
    lcd.setCursor(0, 0);
    lcd.print("Suhu:");
    lcd.print(suhu, 1);
    lcd.print("C");
    
    lcd.setCursor(9, 0);
    lcd.print("RH:");
    lcd.print(kelembaban_udara, 1);
    lcd.print("%");
  }
  
  // Kelembaban Tanah dan Status Tanah
  String status_tanah;
  if (kelembaban_tanah < 40) status_tanah = "Kering";
  else if (kelembaban_tanah <= 60) status_tanah = "Normal";
  else status_tanah = "Basah";
  
  lcd.setCursor(0, 1);
  lcd.print("Soil:");
  lcd.print(kelembaban_tanah, 1);
  lcd.print("%");
  
  lcd.setCursor(10, 1);
  lcd.print(status_tanah);
}

void sendDataToSupabase() {
  // 🌡️ Baca DHT22
  float suhu = dht.readTemperature();
  float kelembaban_udara = dht.readHumidity();

  if (isnan(suhu) || isnan(kelembaban_udara)) {
    Serial.println("❌ Gagal membaca data DHT22");
    hasUploaded = false;
    return;
  }

  // 🌱 Baca sensor tanah
  int nilaiSoil = analogRead(SOIL_PIN);
  float kelembaban_tanah = map(nilaiSoil, adc_kering, adc_basah, 0, 100);
  kelembaban_tanah = constrain(kelembaban_tanah, 0, 100);

  String status_tanah;
  if (kelembaban_tanah < 40) status_tanah = "Kering";
  else if (kelembaban_tanah <= 60) status_tanah = "Normal";
  else status_tanah = "Basah";

  // Ambil waktu lokal dari NTP
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("❌ Gagal mendapatkan waktu");
    return;
  }
  // Format waktu sesuai permintaan: 09/09/2025 13.42.19
  strftime(timeString, sizeof(timeString), "%d/%m/%Y %H:%M:%S", &timeinfo);

  // 🖨️ Cetak ke Serial
  Serial.println("== Data Sensor ==");
  Serial.printf("Suhu: %.2f °C\n", suhu);
  Serial.printf("Kelembaban Udara: %.2f %%\n", kelembaban_udara);
  Serial.printf("ADC Tanah: %d\n", nilaiSoil);
  Serial.printf("Kelembaban Tanah: %.2f %%\n", kelembaban_tanah);
  Serial.printf("Status Tanah: %s\n", status_tanah.c_str());

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SUPABASE_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", SUPABASE_API_KEY);
    http.addHeader("Authorization", String(SUPABASE_API_KEY));
    http.addHeader("Prefer", "return=representation");

    String json = "{";
    json += "\"suhu\":" + String(suhu, 2) + ",";
    json += "\"kelembaban_udara\":" + String(kelembaban_udara, 2) + ",";
    json += "\"soil_adc\":" + String(nilaiSoil) + ",";
    json += "\"kelembaban_tanah\":" + String(kelembaban_tanah, 2) + ",";
    json += "\"status_tanah\":\"" + status_tanah + "\",";
    json += "\"waktu\":\"" + String(timeString) + "\"";
    json += "}";

    Serial.println("== Payload yang dikirim ke Supabase ==");
    Serial.println(json);

    int httpCode = http.POST(json);
    String response = http.getString();

    Serial.printf("HTTP Code: %d\n", httpCode);
    Serial.println("Response:");
    Serial.println(response);

    http.end();
  } else {
    Serial.println("❌ WiFi tidak terhubung.");
  }
  Serial.println("=====================\n");
}