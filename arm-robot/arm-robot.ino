        /*
        * ROBOT ARM ESP32 - MQTT (broker.emqx.io:1883) + PCA9685 + VL53L0X + LCD I2C
        *
        * MODE:
        *   IDLE   : standby di HOME
        *   AUTO   : sensor melihat barang di titik A -> taruh di B1 / B2  [+ MEMORY otomatis via button AUTO]
        *   APP    : slider lewat MQTT
        *   MEMORY : program memory v8 (A->B, B->A, bolak-balik), diaktifkan via button AUTO di dashboard
        *
        * SAKLAR D25 : GPIO25 <-> GND (INPUT_PULLUP). SAKLAR SISTEM UTAMA.
        *              ON  (tertutup ke GND) = sistem robot aktif, semua perintah dapat diterima.
        *              OFF (terbuka)         = sistem dinonaktifkan: mode IDLE paksa, semua perintah ditolak.
        * LED MERAH D27 : menyala bila WiFi ATAU broker MQTT belum terhubung
        * LED KUNING D26: menyala bila WiFi DAN broker MQTT sudah terhubung
        *
        * WIFI MANAGER:
        *   - Saat pertama kali dinyalakan (atau setelah RESETWIFI), ESP32 membuat AP: "RobotArm-Setup"
        *   - Hubungkan HP/laptop ke AP tersebut, buka browser ke http://192.168.4.1
        *   - Isi SSID dan password WiFi, klik Save -> ESP32 reboot dan konek otomatis
        *   - Kredensial tersimpan di flash, tidak perlu diisi ulang setelah reboot
        *   - Ketik "RESETWIFI" di Serial Monitor untuk menghapus kredensial & masuk mode konfigurasi lagi
        *
        * TOPIC (ganti TOPIC_BASE agar unik, karena broker publik):
        *  PERINTAH (ESP32 subscribe):
        *   <BASE>/cmd/mode            AUTO | IDLE | APP
        *   <BASE>/cmd/stop            (payload bebas, mis. X)  -> berhenti, ke IDLE
        *   <BASE>/cmd/slider/base     angka pulsa (hanya aktif di MODE APP)
        *   <BASE>/cmd/slider/shoulder angka pulsa
        *   <BASE>/cmd/slider/elbow    angka pulsa
        *   <BASE>/cmd/slider/gripper  angka slider 138..300
        *   <BASE>/cmd/speed           1..10
        *   <BASE>/cmd/memory/barang   A | B   (tandai posisi semua barang, hanya saat MEMORY tidak aktif)
        *   <BASE>/cmd/memory/jeda     ms jeda antar fase memory
        *  STATUS (ESP32 publish):
        *   <BASE>/status/online       online | offline (retained, LWT)
        *   <BASE>/status/mode         IDLE | AUTO | APP | MEMORY (retained)
        *   <BASE>/status/pos          base,shoulder,elbow,gripper (skala slider)
        *   <BASE>/status/log          teks kejadian penting
        *
        * LIBRARY YANG DIBUTUHKAN (install via Library Manager):
        *   - WiFiManager by tzapu         https://github.com/tzapu/WiFiManager
        *   - PubSubClient by Nick O'Leary
        *   - LiquidCrystal I2C by Frank de Brabander
        *   - Adafruit PWM Servo Driver Library
        *   - Adafruit VL53L0X
        *
        * SEBELUM MENYALAKAN: dekatkan lengan ke posisi HOME (saat boot servo langsung diberi posisi HOME).
        */

        #include <Wire.h>
        #include <WiFi.h>
        #include <WiFiManager.h>            // ← WiFiManager by tzapu
        #include <Preferences.h>            // ← simpan kredensial MQTT ke flash
        #include <PubSubClient.h>
        #include <LiquidCrystal_I2C.h>
        #include <Adafruit_PWMServoDriver.h>
        #include <Adafruit_VL53L0X.h>

        // ---------- Tipe data (harus di atas semua fungsi) ----------
        struct Titik {
          const char* nama;
          int putarBase;                    // base saat lengan (terangkat) berputar ke titik ini
          int base, shoulder, elbow;        // pose akhir saat gripper tepat di titik
        };

        enum SystemMode { MODE_IDLE, MODE_AUTO, MODE_APP, MODE_MEMORY };
        enum AutoPhase  { AP_HOMING, AP_TUNGGU, AP_PINDAH };

        // ---------- WiFiManager & MQTT ----------
        #define AP_SSID      "RobotArm-Setup"   // nama AP saat konfigurasi
        #define AP_PASSWORD  ""                  // kosong = AP tanpa password (isi jika ingin dilindungi)
        #define AP_TIMEOUT   180                 // detik sebelum AP timeout dan ESP32 reboot

        // Kredensial MQTT (dapat diubah via portal WiFiManager)
        #define MQTT_HOST_DEFAULT  "broker.emqx.io"
        #define MQTT_PORT_DEFAULT  "1883"

        const uint16_t MQTT_PORT = 1883;
        #define TOPIC_BASE "robotarm/ukm-esp32-01"      // GANTI agar unik

        // Buffer kredensial MQTT (diisi dari WiFiManager custom param atau default)
        char mqttHost[64] = MQTT_HOST_DEFAULT;
        char mqttPort[8]  = MQTT_PORT_DEFAULT;

        Preferences prefs;                   // NVS untuk simpan konfigurasi MQTT
        WiFiClient  wifiClient;
        PubSubClient mqtt(wifiClient);
        unsigned long tMqtt = 0;

        bool shouldResetWifi = false;        // flag reset WiFi dari Serial

        String topik(const char* s) { return String(TOPIC_BASE) + "/" + s; }

        // ---------- Pin ----------
        #define PIN_SDA    21
        #define PIN_SCL    22
        #define PIN_SAKLAR 25       // D25: saklar sistem utama (ke GND saat ON)
        #define PIN_LED_Y  26       // D26: LED kuning (terhubung)
        #define PIN_LED_R  27       // D27: LED merah  (belum terhubung)

        // ---------- Perangkat ----------
        LiquidCrystal_I2C lcd(0x27, 16, 2);
        Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(0x40);
        Adafruit_VL53L0X lox = Adafruit_VL53L0X();

        // ---------- Servo ----------
        #define SERVO_FREQ 50
        #define TICK_MS 10
        #define PULSA_PER_LEVEL 40
        #define GRIP_IDLE_MS 300
        #define MANUAL_STEP 3

        const uint8_t SERVO_CH[4] = {0, 1, 2, 3};

        const int SL_MIN[4] = {110, 280, 110, 138};
        const int SL_MAX[4] = {550, 550, 350, 300};
        const int PL_MIN[4] = {50,  280, 110, 443};
        const int PL_MAX[4] = {550, 550, 350, 600};

        int sliderKePulsa(int idx, int v) {
          v = constrain(v, SL_MIN[idx], SL_MAX[idx]);
          if (idx == 3) return map(v, SL_MIN[3], SL_MAX[3], PL_MIN[3], PL_MAX[3]);
          return v;
        }

        int pulsaKeSlider(int idx, int p) {
          if (idx == 3) {
            p = constrain(p, PL_MIN[3], PL_MAX[3]);
            return map(p, PL_MIN[3], PL_MAX[3], SL_MIN[3], SL_MAX[3]);
          }
          return p;
        }

        #define LV_NORMAL 5
        #define LV_TURUN  4
        #define LV_PELAN  3

        // ---------- Titik penting (PULSA) ----------
        const int BASE_TENGAH     = 335;
        const int SHOULDER_TENGAH = 495;
        const int GRIP_TENGAH     = 490;    // HOME gripper untuk IDLE / AUTO
        const int GRIP_TENGAH_MEM = 510;    // HOME gripper untuk MEMORY (sama seperti program memory v8)
        const int SHOULDER_ANGKAT = SHOULDER_TENGAH;

        const int POSE_AWAL[4] = {BASE_TENGAH, SHOULDER_TENGAH, 126, GRIP_TENGAH};

        // ---------- PENYETELAN ----------
        // SHOULDER: KECIL = lebih ke bawah. ELBOW: BESAR = lebih turun. JEPIT: BESAR = lebih kencang. Setel 5-10 per kali.
        const int PEGANG_BARANG = 555;      // jepit di titik A untuk mode AUTO (maks 600)

        //                       nama  putar  base  shoulder  elbow
        const Titik T_A  = {"A1", 335,   400,   340,      135};   // titik A (AUTO) = A1 (MEMORY)
        const Titik T_A2 = {"A2", 424,   424,   340,      135};   // A2 (MEMORY, barang 2)
        const Titik T_B1 = {"B1", 138,   136,   372,      133};
        const Titik T_B2 = {"B2",  60,    50,   374,      133};

        const Titik& TUJUAN_AUTO = T_B1;    // titik B untuk mode AUTO (ganti ke T_B2 bila ingin titik lain)
        // --- MEMORY: barang & jepitan ---
        struct Barang {
          const char* nama;
          int gripPegang;                   // jepit di titik A
          int gripPegangB;                  // jepit di titik B (naikkan bila melorot saat diangkat dari B)
          bool diB;                         // true = barang sekarang ada di titik B
        };
        Barang BARANG[2] = {
          {"Barang 1", 565, 565, false},
          {"Barang 2", 565, 565, false},
        };
        const Titik* TM_A[2] = {&T_A, &T_A2};
        const Titik* TM_B[2] = {&T_B1, &T_B2};

        bool arahBalik = false;             // false = fase A->B, true = fase B->A
        int memBarang = 0;                  // barang yang sedang diproses dalam fase
        unsigned long fase = 0;
        unsigned long jedaSiklus = 2000;    // jeda antar fase (ms)
        unsigned long tMemBerikut = 0;

        // ---------- Sensor ----------
        const int DISTANCE_THRESHOLD_MM = 200;
        const int DETECT_COUNT_MIN = 3;
        const unsigned long COOLDOWN_MS = 2000;
        bool sensorOK = false;
        bool objectDetected = false;
        int detectCount = 0;

        // ---------- Mode ----------
        SystemMode currentMode = MODE_IDLE;
        AutoPhase autoPhase = AP_TUNGGU;
        int jumlahPindah = 0;
        unsigned long tCooldown = 0;
        int speedLevel = 5;

        // ---------- Saklar Sistem Utama (D25) ----------
        // ON (ke GND) = sistem aktif, perintah diterima.
        // OFF (terbuka) = sistem nonaktif, robot paksa IDLE, semua perintah ditolak.
        bool saklarRaw = false, saklarOn = false;
        unsigned long tSaklar = 0;

        // ---------- Status gerak ----------
        int cur[4] = {0, 0, 0, 0};
        int manualTgt[4] = {0, 0, 0, 0};
        bool gripTahan = false;
        bool gripAktif = false;
        unsigned long gripTerakhir = 0;

        // ---------- Urutan gerak (non-blocking) ----------
        const int TETAP = -1;
        const int8_t TAHAN_ON = 1, TAHAN_OFF = 0, TAHAN_TETAP = -1;

        struct Step {
          const char* nama;
          int t[4];
          uint8_t lv;
          int8_t tahan;
          uint16_t jeda;
        };
        #define MAX_STEP 16
        Step seq[MAX_STEP];
        int seqLen = 0, seqIdx = 0;
        bool seqRunning = false;

        enum Phase { PH_NEXT, PH_MOVE, PH_PAUSE };
        Phase phase = PH_NEXT;
        int mFrom[4], mTo[4], mN = 1, mK = 0;
        unsigned long mNext = 0, mPauseUntil = 0;

        // ---------- Timer ----------
        unsigned long tPos = 0, tLcd = 0, tManual = 0;
        String bufSerial = "";
        int lastSent[4] = {-1, -1, -1, -1};
        String lcdCache[2] = {"", ""};

        // =====================================================
        // Log (Serial + MQTT)
        // =====================================================
        void logMsg(const String& s) {
          Serial.println(s);
          if (mqtt.connected()) mqtt.publish(topik("status/log").c_str(), s.c_str());
        }

        bool terhubung() { return WiFi.status() == WL_CONNECTED && mqtt.connected(); }

        // =====================================================
        // LED indikator koneksi
        // =====================================================
        void updateLed() {
          static int last = -1;
          int now = terhubung() ? 1 : 0;
          if (now == last) return;
          last = now;
          digitalWrite(PIN_LED_Y, now ? HIGH : LOW);   // kuning = terhubung
          digitalWrite(PIN_LED_R, now ? LOW : HIGH);   // merah  = belum terhubung
        }

        // =====================================================
        // Servo
        // =====================================================
        int batas(int idx, int p) { return constrain(p, PL_MIN[idx], PL_MAX[idx]); }

        void tulis(int idx, int pulsa) {
          pulsa = batas(idx, pulsa);
          cur[idx] = pulsa;
          pca.setPWM(SERVO_CH[idx], 0, pulsa);
          if (idx == 3) { gripAktif = true; gripTerakhir = millis(); }
        }

        void cekGripIdle() {
          if (!gripTahan && gripAktif && millis() - gripTerakhir > GRIP_IDLE_MS) {
            pca.setPWM(SERVO_CH[3], 0, 4096);
            gripAktif = false;
          }
        }

        void updateManual() {
          if (currentMode != MODE_APP) return;
          if (millis() - tManual < TICK_MS) return;
          tManual = millis();
          for (int i = 0; i < 4; i++) {
            int d = manualTgt[i] - cur[i];
            if (d > 0)      tulis(i, cur[i] + min(d, MANUAL_STEP));
            else if (d < 0) tulis(i, cur[i] - min(-d, MANUAL_STEP));
          }
        }

        // =====================================================
        // Kirim data via MQTT
        // =====================================================
        const char* namaMode() {
          switch (currentMode) {
            case MODE_AUTO:   return "AUTO";
            case MODE_IDLE:   return "IDLE";
            case MODE_APP:    return "APP";
            default:          return "MEMORY";
          }
        }

        void kirimPos() {
          for (int i = 0; i < 4; i++) lastSent[i] = cur[i];
          if (!mqtt.connected()) return;
          char buf[32];
          snprintf(buf, sizeof(buf), "%d,%d,%d,%d",
                  pulsaKeSlider(0, cur[0]), pulsaKeSlider(1, cur[1]),
                  pulsaKeSlider(2, cur[2]), pulsaKeSlider(3, cur[3]));
          mqtt.publish(topik("status/pos").c_str(), buf);
        }

        void kirimStatus() {
          if (!mqtt.connected()) return;
          mqtt.publish(topik("status/mode").c_str(), namaMode(), true);
        }

        // =====================================================
        // LCD
        // =====================================================
        void lcdBaris(int baris, String teks) {
          while (teks.length() < 16) teks += " ";
          teks = teks.substring(0, 16);
          if (teks == lcdCache[baris]) return;
          lcdCache[baris] = teks;
          lcd.setCursor(0, baris);
          lcd.print(teks);
        }

        void updateLcd() {
          if (terhubung())                          lcdBaris(0, "MQTT: CONNECTED");
          else if (WiFi.status() == WL_CONNECTED)   lcdBaris(0, "MQTT: MENUNGGU");
          else                                      lcdBaris(0, "WiFi: MENCARI");

          if (currentMode == MODE_IDLE) {
            lcdBaris(1, seqRunning ? "IDLE: ke HOME" : "IDLE-Robot Siap");
            } else if (currentMode == MODE_AUTO) {
      if (autoPhase == AP_HOMING)      lcdBaris(1, "AUTO: ke HOME");
      else if (autoPhase == AP_TUNGGU) lcdBaris(1, sensorOK ? "AUTO: cari objek" : "Sensor ERROR");
      else                             lcdBaris(1, "AUTO: memindah");
    }else if (currentMode == MODE_MEMORY) {
            lcdBaris(1, String("MEM F") + fase + (arahBalik ? " B>A" : " A>B"));
          } else {
            lcdBaris(1, "B" + String(cur[0]) + " S" + String(cur[1]) + " E" + String(cur[2]));
          }
        }

        // =====================================================
        // Penyusun urutan gerak
        // =====================================================
        void tambah(const char* nama, int b, int s, int e, int g, uint8_t lv, int8_t tahan, uint16_t jeda) {
          if (seqLen >= MAX_STEP) return;
          seq[seqLen++] = {nama, {b, s, e, g}, lv, tahan, jeda};
        }

        // Kembali ke HOME: angkat shoulder dulu, baru base/elbow/gripper ke tengah
        void bangunHome(int gBuka) {
          tambah("HOME: angkat",    TETAP, SHOULDER_ANGKAT, TETAP, TETAP, LV_NORMAL, TAHAN_TETAP, 100);
          tambah("HOME: ke tengah", POSE_AWAL[0], TETAP, POSE_AWAL[2], gBuka, LV_NORMAL, TAHAN_TETAP, 300);
        }

        // Ambil barang di 'dari', taruh di 'ke', lalu kembali HOME
        void bangunPindah(const Titik& dari, const Titik& ke, int gBuka, int gPegang) {
          seqLen = 0;
          tambah("angkat",        TETAP, SHOULDER_ANGKAT, TETAP, TETAP, LV_NORMAL, TAHAN_TETAP, 100);
          tambah("putar ke asal", dari.putarBase, TETAP, TETAP, gBuka, LV_NORMAL, TAHAN_TETAP, 100);
          tambah("turun ke asal", dari.base, dari.shoulder, dari.elbow, TETAP, LV_TURUN, TAHAN_TETAP, 300);
          tambah("jepit barang",  TETAP, TETAP, TETAP, gPegang, LV_PELAN, TAHAN_ON, 500);
          tambah("angkat",        TETAP, SHOULDER_ANGKAT, TETAP, TETAP, LV_NORMAL, TAHAN_TETAP, 100);
          tambah("putar ke tujuan", ke.putarBase, TETAP, TETAP, TETAP, LV_NORMAL, TAHAN_TETAP, 100);
          tambah("turun ke tujuan", ke.base, ke.shoulder, ke.elbow, TETAP, LV_TURUN, TAHAN_TETAP, 300);
          tambah("lepas barang",  TETAP, TETAP, TETAP, gBuka, LV_PELAN, TAHAN_OFF, 500);
          bangunHome(gBuka);
        }

        void jalankanSequence() { seqIdx = 0; phase = PH_NEXT; seqRunning = true; }
        void stopSequence()     { seqRunning = false; seqLen = 0; seqIdx = 0; }

        // =====================================================
        // Mesin gerak (non-blocking)
        // =====================================================
        bool beginStep(int idx) {
          const Step& s = seq[idx];
          if (s.tahan >= 0) gripTahan = (s.tahan == 1);

          int maxD = 0;
          for (int i = 0; i < 4; i++) {
            mFrom[i] = cur[i];
            mTo[i] = (s.t[i] < 0) ? cur[i] : batas(i, s.t[i]);
            maxD = max(maxD, abs(mTo[i] - mFrom[i]));
          }
          if (maxD == 0) return false;

          Serial.println(String("  ") + s.nama);
          int lv = constrain(min((int)s.lv, speedLevel), 1, 10);
          float perTick = lv * PULSA_PER_LEVEL * TICK_MS / 1000.0f;
          mN = (int)ceilf(maxD / perTick);
          if (mN < 1) mN = 1;
          mK = 0;
          mNext = millis() + TICK_MS;
          phase = PH_MOVE;
          return true;
        }

        void selesaiSequence() {
    if (currentMode == MODE_AUTO) {
      if (autoPhase == AP_PINDAH) {
        jumlahPindah++;
        logMsg(String("AUTO: barang dipindah ke-") + jumlahPindah);
        tCooldown = millis() + COOLDOWN_MS;
      }
      autoPhase = AP_TUNGGU;          // selalu kembali menunggu, tidak ada kondisi penuh
      detectCount = 0;
    }
    else if (currentMode == MODE_MEMORY && memBarang < 2 && BARANG[memBarang].diB == arahBalik) {
      BARANG[memBarang].diB = !arahBalik;
      logMsg(String("MEMORY: ") + BARANG[memBarang].nama + (arahBalik ? " B->A selesai" : " A->B selesai"));
      memBarang++;
    }
    kirimPos();
    updateLcd();
  }

        void updateSequence() {
          if (!seqRunning) return;
          unsigned long now = millis();

          if (phase == PH_PAUSE) {
            if (now < mPauseUntil) return;
            seqIdx++;
            phase = PH_NEXT;
          }

          if (phase == PH_NEXT) {
            while (seqIdx < seqLen && !beginStep(seqIdx)) seqIdx++;
            if (seqIdx >= seqLen) {
              seqRunning = false;
              selesaiSequence();
              return;
            }
          }

          if (phase == PH_MOVE) {
            if (now < mNext) return;
            mNext += TICK_MS;
            if ((long)(now - mNext) > 100) mNext = now;
            mK++;
            for (int i = 0; i < 4; i++) {
              if (mTo[i] == mFrom[i]) continue;
              int p = mFrom[i] + (int)((long)(mTo[i] - mFrom[i]) * mK / mN);
              if (p != cur[i]) tulis(i, p);
            }
            if (mK >= mN) {
              phase = PH_PAUSE;
              mPauseUntil = now + seq[seqIdx].jeda;
            }
          }
        }

        // =====================================================
        // Mode
        // =====================================================
        void setMode(SystemMode m) {
          stopSequence();
          currentMode = m;
          detectCount = 0;

          if (m == MODE_IDLE) {
            gripTahan = false;
            bangunHome(GRIP_TENGAH);
            jalankanSequence();
          } else if (m == MODE_AUTO) {
            gripTahan = false;
            jumlahPindah = 0;
            autoPhase = AP_HOMING;
            bangunHome(GRIP_TENGAH);
            jalankanSequence();
          } else if (m == MODE_MEMORY) {
            gripTahan = false;
            memBarang = 0;
            tMemBerikut = 0;
            bangunHome(GRIP_TENGAH_MEM);      // ke HOME dulu, lalu fase mulai
            jalankanSequence();
          } else {                            // MODE_APP
            gripTahan = true;
            for (int i = 0; i < 4; i++) manualTgt[i] = cur[i];
          }

          logMsg(String("MODE: ") + namaMode());
          updateLcd();
          kirimStatus();
          kirimPos();
        }

        // =====================================================
        // MODE AUTO
        // =====================================================
      void jalankanAuto() {
    if (currentMode != MODE_AUTO || seqRunning) return;
    if (autoPhase != AP_TUNGGU) return;
    if (millis() < tCooldown) return;

    if (detectCount >= DETECT_COUNT_MIN) {
      logMsg(String("AUTO: barang terdeteksi -> ") + TUJUAN_AUTO.nama);
      bangunPindah(T_A, TUJUAN_AUTO, GRIP_TENGAH, PEGANG_BARANG);
      autoPhase = AP_PINDAH;
      detectCount = 0;
      jalankanSequence();
      updateLcd();
    }
  }

        // =====================================================
        // MODE MEMORY (bolak-balik A <-> B, HOME tiap barang)
        // =====================================================
        void jalankanMemory() {
          if (currentMode != MODE_MEMORY || seqRunning) return;
          if (millis() < tMemBerikut) return;

          // lewati barang yang sudah berada di tujuan fase ini
          while (memBarang < 2 && BARANG[memBarang].diB != arahBalik) {
            logMsg(String("MEMORY: ") + BARANG[memBarang].nama + " sudah di tujuan, dilewati");
            memBarang++;
          }

          // semua barang sudah diproses -> fase selesai, balik arah
          if (memBarang >= 2) {
            fase++;
            arahBalik = !arahBalik;
            memBarang = 0;
            tMemBerikut = millis() + jedaSiklus;
            logMsg(String("MEMORY: fase ") + fase + " selesai. Berikutnya " + (arahBalik ? "B->A" : "A->B"));
            return;
          }

          int i = memBarang;
          const Titik& dari = arahBalik ? *TM_B[i] : *TM_A[i];
          const Titik& ke   = arahBalik ? *TM_A[i] : *TM_B[i];
          int gPegang = arahBalik ? BARANG[i].gripPegangB : BARANG[i].gripPegang;

          logMsg(String("MEMORY: ") + BARANG[i].nama + " " + dari.nama + " -> " + ke.nama);
          bangunPindah(dari, ke, GRIP_TENGAH_MEM, gPegang);
          jalankanSequence();
          updateLcd();
        }

        // =====================================================
        // Saklar D25 -> SAKLAR SISTEM UTAMA
        // ON  = sistem aktif (perintah MQTT diterima, robot beroperasi)
        // OFF = sistem nonaktif (robot paksa IDLE, semua perintah ditolak)
        // =====================================================
        void updateSaklar() {
          bool raw = (digitalRead(PIN_SAKLAR) == LOW);       // LOW = tertutup ke GND = ON
          if (raw != saklarRaw) { saklarRaw = raw; tSaklar = millis(); }
          if (millis() - tSaklar > 50 && raw != saklarOn) {  // debounce 50 ms
            saklarOn = raw;
            if (saklarOn) {
              logMsg("Saklar sistem ON -> Robot aktif, siap menerima perintah");
              // Mode tetap IDLE sampai ada perintah dari dashboard
              if (currentMode != MODE_IDLE) setMode(MODE_IDLE);
            } else {
              logMsg("Saklar sistem OFF -> Semua operasi dihentikan");
              setMode(MODE_IDLE);   // paksa ke IDLE saat sistem dimatikan
            }
          }
        }

        // Cek apakah sistem aktif (saklar ON)
        bool sistemAktif() { return saklarOn; }

        // =====================================================
        // Sensor
        // =====================================================
        void checkSensor() {
          if (!sensorOK) return;
          if (!lox.isRangeComplete()) return;

          uint16_t dist = lox.readRange();
          uint8_t st = lox.readRangeStatus();
          objectDetected = (st != 4) && dist > 0 && dist < DISTANCE_THRESHOLD_MM;

          if (currentMode == MODE_AUTO && autoPhase == AP_TUNGGU && !seqRunning)
            detectCount = objectDetected ? detectCount + 1 : 0;
          else
            detectCount = 0;
        }

        // =====================================================
        // Perintah (dari MQTT maupun Serial)
        // =====================================================
        void prosesPerintah(String s) {
          s.trim();
          s.toUpperCase();
          if (s.length() < 1) return;

          Serial.println("Command: " + s);

          // Reset WiFi — hapus kredensial dan masuk mode portal
          if (s == "RESETWIFI") {
            Serial.println("Reset WiFi credentials...");
            lcdBaris(0, "Reset WiFi...");
            lcdBaris(1, "Restarting...");
            delay(500);
            WiFiManager wm;
            wm.resetSettings();
            ESP.restart();
            return;
          }

          // IDLE / STOP selalu boleh (termasuk saat sistem nonaktif)
          if (s == "M:I" || s == "MODE IDLE" || s == "IDLE" || s == "X") { setMode(MODE_IDLE); return; }

          // Tolak semua perintah lain jika saklar sistem OFF
          if (!sistemAktif()) {
            logMsg("Ditolak: Saklar sistem OFF. Nyalakan saklar D25 untuk mengaktifkan robot.");
            return;
          }

          bool mintaAuto = (s == "M:A" || s == "MODE AUTO" || s == "AUTO");
          bool mintaApp  = (s == "M:P" || s == "MODE APP"  || s == "APP" || s == "MANUAL");
          bool mintaMem  = (s == "M:M" || s == "MODE MEMORY" || s == "MEMORY");

          if (mintaAuto) { setMode(MODE_AUTO); return; }
          if (mintaApp)  { setMode(MODE_APP);  return; }
          if (mintaMem)  { setMode(MODE_MEMORY); return; }

          // Slider: "S3 242"
          if (s.length() >= 2 && s.charAt(0) == 'S' && isDigit(s.charAt(1))) {
            if (currentMode != MODE_APP) return;
            int kode = s.charAt(1) - '0';
            if (kode < 1 || kode > 4) return;
            int nilai = s.substring(2).toInt();
            int idx = kode - 1;
            manualTgt[idx] = batas(idx, sliderKePulsa(idx, nilai));
          }
        }

        void bacaSerial() {
          while (Serial.available()) {
            char c = Serial.read();
            if (c == '\n' || c == '\r') {
              if (bufSerial.length() > 0) { String line = bufSerial; bufSerial = ""; prosesPerintah(line); }
            } else if (bufSerial.length() < 40) {
              bufSerial += c;
            }
          }
        }

        // =====================================================
        // MQTT
        // =====================================================
        void onMqtt(char* topic, byte* payload, unsigned int len) {
          String t(topic), p;
          for (unsigned int i = 0; i < len && i < 40; i++) p += (char)payload[i];
          p.trim();
          p.toUpperCase();

          String pre = String(TOPIC_BASE) + "/cmd/";
          if (!t.startsWith(pre)) return;
          String sub = t.substring(pre.length());

          if (sub == "mode") {
            prosesPerintah("MODE " + p);
          }
          else if (sub == "stop") {
            prosesPerintah("X");
          }
          else if (sub.startsWith("slider/")) {
            String n = sub.substring(7);
            int kode = 0;
            if (n == "base") kode = 1;
            else if (n == "shoulder") kode = 2;
            else if (n == "elbow") kode = 3;
            else if (n == "gripper") kode = 4;
            if (kode) prosesPerintah("S" + String(kode) + " " + p);
          }
          else if (sub == "speed") {
            speedLevel = constrain(p.toInt(), 1, 10);
            logMsg(String("Kecepatan = ") + speedLevel);
          }
          else if (sub == "memory/jeda") {
            jedaSiklus = constrain(p.toInt(), 0, 60000);
            logMsg(String("Jeda antar fase = ") + jedaSiklus + " ms");
          }
          else if (sub == "memory/barang") {
            if (currentMode == MODE_MEMORY) { logMsg("Ditolak: MEMORY sedang aktif."); return; }
            if (p == "A" || p == "B") {
              bool diB = (p == "B");
              for (int i = 0; i < 2; i++) BARANG[i].diB = diB;
              arahBalik = diB;
              logMsg(diB ? "Barang ditandai di B. Fase berikutnya B->A" : "Barang ditandai di A. Fase berikutnya A->B");
            }
          }
        }

        // =====================================================
        // Koneksi MQTT (non-blocking, WiFi sudah diurus WiFiManager)
        // =====================================================
        void updateKoneksi() {
          // Jika WiFi terputus, cukup tunggu — WiFiManager sudah simpan kredensial,
          // ESP32 akan reconnect otomatis via WiFi stack
          if (WiFi.status() != WL_CONNECTED) return;

          // --- MQTT ---
          if (mqtt.connected()) { mqtt.loop(); return; }

          unsigned long interval = seqRunning ? 30000UL : 5000UL;
          if (millis() - tMqtt < interval) return;
          tMqtt = millis();

          String id = "ARM-" + String((uint32_t)ESP.getEfuseMac(), HEX);
          if (mqtt.connect(id.c_str(), NULL, NULL, topik("status/online").c_str(), 0, true, "offline")) {
            mqtt.subscribe((String(TOPIC_BASE) + "/cmd/#").c_str());
            mqtt.publish(topik("status/online").c_str(), "online", true);
            Serial.println("MQTT terhubung: " + String(mqttHost));
            kirimStatus();
            kirimPos();
          } else {
            Serial.println(String("MQTT gagal, rc=") + mqtt.state());
          }
        }

        // =====================================================
        // WiFiManager — jalankan portal konfigurasi
        // =====================================================
        void mulaiWifiManager() {
          lcdBaris(0, "WiFi Setup AP:");
          lcdBaris(1, AP_SSID);
          Serial.println("=== WiFiManager ===");
          Serial.println("AP: " + String(AP_SSID));
          Serial.println("Buka browser -> http://192.168.4.1");

          // LED merah berkedip selama portal aktif
          digitalWrite(PIN_LED_R, HIGH);
          digitalWrite(PIN_LED_Y, LOW);

          WiFiManager wm;

          // Parameter MQTT tambahan di halaman portal
          WiFiManagerParameter param_mqtt_host("mqtt_host", "MQTT Broker Host", mqttHost, 63);
          WiFiManagerParameter param_mqtt_port("mqtt_port", "MQTT Broker Port", mqttPort, 7);
          wm.addParameter(&param_mqtt_host);
          wm.addParameter(&param_mqtt_port);

          // Callback saat portal aktif (AP mode)
          wm.setAPCallback([](WiFiManager* wm) {
            Serial.println("Portal config aktif. Hubungkan ke AP: " + String(AP_SSID));
          });

          // Callback saat berhasil menyimpan
          wm.setSaveConfigCallback([]() {
            Serial.println("Konfigurasi WiFi & MQTT tersimpan.");
          });

          wm.setConfigPortalTimeout(AP_TIMEOUT);
          wm.setConnectTimeout(20);

          // Coba konek dengan kredensial tersimpan; jika gagal, buka portal
          bool berhasil = wm.autoConnect(AP_SSID, AP_PASSWORD[0] ? AP_PASSWORD : nullptr);

          if (!berhasil) {
            Serial.println("WiFiManager timeout. Restart ESP32...");
            lcdBaris(0, "Timeout. Restart");
            lcdBaris(1, "...");
            delay(1000);
            ESP.restart();
          }

          // Simpan parameter MQTT ke NVS jika berubah
          String newHost = String(param_mqtt_host.getValue());
          String newPort = String(param_mqtt_port.getValue());
          if (newHost.length() > 0) newHost.toCharArray(mqttHost, sizeof(mqttHost));
          if (newPort.length() > 0) newPort.toCharArray(mqttPort, sizeof(mqttPort));

          prefs.begin("robot-cfg", false);
          prefs.putString("mqtt_host", mqttHost);
          prefs.putString("mqtt_port", mqttPort);
          prefs.end();

          Serial.println("WiFi terhubung: " + WiFi.SSID());
          Serial.println("IP: " + WiFi.localIP().toString());
          Serial.println("MQTT host: " + String(mqttHost) + ":" + String(mqttPort));

          lcdBaris(0, "WiFi OK!");
          lcdBaris(1, WiFi.localIP().toString());
          delay(2000);
        }

        // =====================================================
        // Setup & Loop
        // =====================================================
        void setup() {
          Serial.begin(115200);

          pinMode(PIN_LED_R, OUTPUT);
          pinMode(PIN_LED_Y, OUTPUT);
          pinMode(PIN_SAKLAR, INPUT_PULLUP);
          digitalWrite(PIN_LED_R, HIGH);      // awal: belum terhubung
          digitalWrite(PIN_LED_Y, LOW);

          Wire.begin(PIN_SDA, PIN_SCL);

          lcd.init();
          lcd.backlight();
          lcdBaris(0, "ROBOT ARM SYS");
          lcdBaris(1, "Initializing...");

          pca.begin();
          pca.setPWMFreq(SERVO_FREQ);

          // langsung ke HOME (dekatkan lengan ke posisi ini sebelum menyalakan)
          for (int i = 0; i < 4; i++) { tulis(i, POSE_AWAL[i]); delay(100); }

          if (!lox.begin()) {
            Serial.println("VL53L0X Error!");
            lcdBaris(1, "Sensor ERROR");
            delay(1500);
            sensorOK = false;
          } else {
            sensorOK = true;
            lox.startRangeContinuous(50);
          }

          // Baca konfigurasi MQTT dari NVS (jika pernah disimpan)
          prefs.begin("robot-cfg", true);
          String savedHost = prefs.getString("mqtt_host", MQTT_HOST_DEFAULT);
          String savedPort = prefs.getString("mqtt_port", MQTT_PORT_DEFAULT);
          prefs.end();
          savedHost.toCharArray(mqttHost, sizeof(mqttHost));
          savedPort.toCharArray(mqttPort, sizeof(mqttPort));

          // ---- WiFiManager ----
          lcdBaris(0, "Menghubungkan..");
          lcdBaris(1, "WiFi...");
          mulaiWifiManager();   // blokir sampai WiFi terhubung atau timeout

          // ---- MQTT setup ----
          mqtt.setServer(mqttHost, (uint16_t)String(mqttPort).toInt());
          mqtt.setCallback(onMqtt);
          mqtt.setSocketTimeout(2);           // batasi blocking saat koneksi broker

          // keadaan awal saklar sistem (D25)
          saklarRaw = saklarOn = (digitalRead(PIN_SAKLAR) == LOW);
          tSaklar = millis();
          // Robot selalu mulai dari IDLE; mode lain dipilih via dashboard
          setMode(MODE_IDLE);
          if (!saklarOn) {
            logMsg("PERINGATAN: Saklar sistem (D25) OFF. Nyalakan untuk mengaktifkan robot.");
          }
        }

        void loop() {
          bacaSerial();
          updateKoneksi();
          updateSaklar();

          updateSequence();
          updateManual();
          cekGripIdle();

          checkSensor();
          jalankanAuto();
          jalankanMemory();

          updateLed();

          // posisi berkala (kecuali mode APP supaya slider tidak "melompat")
          if (millis() - tPos >= 300) {
            tPos = millis();
            if (currentMode != MODE_APP) {
              bool beda = false;
              for (int i = 0; i < 4; i++) if (cur[i] != lastSent[i]) beda = true;
              if (beda) kirimPos();
            }
          }

          if (millis() - tLcd >= 300) {
            tLcd = millis();
            updateLcd();
          }
        }
