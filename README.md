# CNC-PCB PIXEL LAB (PHP + Three.js + MQTT)

Monitoring & digital twin mesin CNC PCB dan Robot Arm bertema pixel.

## Menjalankan
```bash
cd cnc-pixel-monitor
php -S 0.0.0.0:8080        # lalu buka http://localhost:8080/index.php
```
Atau letakkan folder ini di htdocs (XAMPP/Laragon) / public_html. Pastikan folder `data/` bisa ditulis PHP.

---

## 🛠 CNC PCB — Cara Kerja & Fitur Baru
- **Digital twin 3-Axis** bergerak mengikuti **MPos** (posisi aktual mesin):
  - **Sumbu X**: carriage spindle geser kiri-kanan pada gantry.
  - **Sumbu Y**: base plate (meja + PCB) bergerak maju-mundur (gantry diam).
  - **Sumbu Z**: spindle motor naik-turun (Z=0 = ujung pahat menyentuh PCB).
- **WPos (Work Position)**: posisi relatif terhadap titik nol kerja, ditampilkan di kartu **POSISI** (X, Y, Z).
- **Urutan gerak twin**: setelah tombol START, pahat bergerak ke **tengah PCB** terlebih dahulu (fase *menuju tengah*), lalu mengikuti koordinat aktual X, Y, Z (fase *ikut koordinat*).
- **Titik nol kerja**: ditandai dengan silang merah bercahaya di atas PCB. Tombol `⌖` mengarahkan pahat kembali ke tengah PCB, dan tombol `🧹` membersihkan goresan jalur PCB.
- **Spindle RPM**:
  - Spindle RUN otomatis terdeteksi saat status `Run` atau koordinat MPos/WPos bergerak.
  - Nilai RPM diambil langsung dari telemetri (`FS:feed,rpm` / `S:rpm`) bila tersedia (label `GRBL`), atau estimasi nominal (label `EST.`).
  - Animasi spinner pixel, meter bar RPM, dan grafik riwayat spindle RPM real-time.
- **Topic MQTT CNC**:
  - `cnc3eb/topic/status` — Format GRBL: `Run,MPos:59.196,-13.344,22.600,WPos:33.196,-23.344,-2.400,Ln:0`
  - `cnc3eb/topic/online` — Status koneksi ESP: `online` / `offline`

---

## 🦾 ROBOT ARM (Digital Twin Lengan ESP32 + PCA9685)
Klik tab **ROBOT ARM** pada header (atau akses via `#arm`).
- **Base topic**: diatur di `config.php` → `robot.base` (`robotarm/ukm-esp32-01`).
- **Mode Kontrol**:
  - **IDLE**: Robot standby di posisi HOME.
  - **AUTO**: Memulai proses otomatis, mengarahkan lengan ke HOME lalu otomatis menjalankan siklus MEMORY (A ↔ B).
  - **APP**: Gerak manual real-time via slider (Base, Shoulder, Elbow, Gripper).
  - **STOP**: Menghentikan operasi dan kembali ke IDLE.
- **Saklar Sistem Utama (D25)**:
  - ON (ke GND): Robot aktif dan siap menerima perintah.
  - OFF: Sistem nonaktif, robot dipaksa IDLE dan menolak perintah gerak.
- **WiFiManager**:
  - ESP32 otomatis membuat Access Point `RobotArm-Setup` (IP `192.168.4.1`) jika WiFi belum terkonfigurasi.
  - Menyimpan kredensial WiFi dan broker MQTT ke flash NVS. Ketik `RESETWIFI` pada Serial Monitor untuk reset.

---

## 🎮 Game Pixel Life
Akses via tombol **🏠 GAME** pada header (`game.php`).
- Dunia simulasi pixel 3D dengan NPC berbasis AI, siklus waktu, kendaraan, toko, perkemahan, dan memancing.
