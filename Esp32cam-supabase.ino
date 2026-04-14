#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <EEPROM.h>

// WiFi
const char* ssid = "*****";
const char* password = "*****";

// Supabase config
const char* SUPABASE_URL = "*****";
const char* SUPABASE_API_KEY = "*****";
const char* SUPABASE_BUCKET = "images";

// EEPROM config
#define EEPROM_SIZE 4
int photoCounter = 0;

// ===== Capture Interval (in minutes) =====
#define CAPTURE_INTERVAL_MINUTES 10 // Waktu : 1, 5, 10, 15 dll.

// Flag untuk hindari pengiriman ganda dalam 1 detik
bool hasUploaded = false;

// Setup
void setup() {
  Serial.begin(115200);
  delay(1000);

  // EEPROM
  EEPROM.begin(EEPROM_SIZE);
  photoCounter = EEPROM.readUInt(0);
  Serial.printf("📸 Starting photoCounter from EEPROM: %d\n", photoCounter);

  // Koneksi WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
      }
  Serial.println("\n✅ WiFi connected");

  // Sinkronisasi waktu NTP
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo)) {
    Serial.println("⏳ Waiting for NTP time...");
    delay(1000);
  }
  Serial.println("✅ Time synchronized");

  // Konfigurasi kamera (AI Thinker)
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = 5;
  config.pin_d1 = 18;
  config.pin_d2 = 19;
  config.pin_d3 = 21;
  config.pin_d4 = 36;
  config.pin_d5 = 39;
  config.pin_d6 = 34;
  config.pin_d7 = 35;
  config.pin_xclk = 0;
  config.pin_pclk = 22;
  config.pin_vsync = 25;
  config.pin_href = 23;
  config.pin_sscb_sda = 26;
  config.pin_sscb_scl = 27;
  config.pin_pwdn = 32;
  config.pin_reset = -1;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_SVGA; //800x600
    config.jpeg_quality = 8;            // Better quality
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_VGA; //640x480
    config.jpeg_quality = 10;
    config.fb_count = 1;
  }

  // Inisialisasi kamera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ Camera init failed with error 0x%x\n", err);
    return;
  }

  // Konfigurasi sensor untuk kualitas terbaik
  sensor_t *s = esp_camera_sensor_get();
  s->set_brightness(s, 1);        // -2 to 2
  s->set_contrast(s, 1);          // -2 to 2
  s->set_saturation(s, 1);        // -2 to 2
  s->set_whitebal(s, 1);          // Auto white balance
  s->set_gain_ctrl(s, 1);         // Auto gain
  s->set_exposure_ctrl(s, 1);     // Auto exposure
  s->set_awb_gain(s, 1);          // Auto white balance gain
  s->set_gainceiling(s, (gainceiling_t)6); // Higher ISO ceiling
  }


// Loop — sinkronisasi berdasarkan waktu
void loop() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("❌ Failed to get time");
    delay(1000);
    return;
  }

  // Cek apakah detik = 0 (awal menit) dan belum upload
  if ((timeinfo.tm_min % CAPTURE_INTERVAL_MINUTES) == 0 && timeinfo.tm_sec == 0 && !hasUploaded) {
    hasUploaded = true;
    Serial.printf("🕒 Triggered at %02d:%02d:%02d\n", timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    captureAndUpload();
  }

  // Reset flag setelah lewat dari detik 0
  if (timeinfo.tm_sec > 0) {
    hasUploaded = false;
  }

  delay(200); // Hindari polling terlalu cepat
  }

  // Fungsi capture & upload ke Supabase
  void captureAndUpload() {
  
  // Buang satu frame pertama untuk menyegarkan buffer
  camera_fb_t *dummy = esp_camera_fb_get();
  if (dummy) esp_camera_fb_return(dummy);
  delay(200);  // beri jeda agar kamera ambil scene baru

  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("❌ Camera capture failed");
    return;
  }

  Serial.printf("📷 Image captured: %d bytes\n", fb->len);

  // Buat nama file berurutan
  char filename[32];
  sprintf(filename, "esp32cam_%04d.jpg", photoCounter);

  // Buat URL upload
  String url = String(SUPABASE_URL) + "/storage/v1/object/" + SUPABASE_BUCKET + "/" + filename + "?upsert=true";

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("apikey", SUPABASE_API_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_API_KEY));

  int response = http.PUT(fb->buf, fb->len);
  Serial.printf("🌐 HTTP status: %d\n", response);

  if (response == 200 || response == 201) {
    Serial.println("✅ Upload success!");

    // Simpan counter baru ke EEPROM
    photoCounter++;
    EEPROM.writeUInt(0, photoCounter);
    EEPROM.commit();

    // Tampilkan URL file di Supabase
    String public_url = String(SUPABASE_URL) + "/storage/v1/object/public/" + SUPABASE_BUCKET + "/" + filename;
    Serial.println("📷 Public URL:");
    Serial.println(public_url);
  } else {
    Serial.println("❌ Upload failed.");
    Serial.println(http.getString());
  }

  http.end();
  esp_camera_fb_return(fb);
}
