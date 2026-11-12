# CNC-PCB PIXEL LAB (PHP + Three.js + MQTT)

Monitoring & digital twin mesin CNC PCB bertema pixel.

## Menjalankan
    cd cnc-pixel-monitor
    php -S 0.0.0.0:8080        # lalu buka http://localhost:8080/index.php
Atau letakkan folder ini di htdocs (XAMPP/Laragon) / public_html. Pastikan folder `data/` bisa ditulis PHP.

## Topic (di-subscribe web)
- `cnc3eb/topic/status` — contoh: `Run,MPos:59.196,-13.344,22.600,WPos:33.196,-23.344,-2.400,Ln:0`
- `cnc3eb/topic/online` — online / offline

## Cara kerja
- **Digital twin** bergerak mengikuti **MPos**: **X** = carriage spindle kiri-kanan, **Y** = base plate (meja+PCB) maju-mundur, **Z** = spindle motor naik-turun. Digital twin bergerak mengikuti **MPos** (posisi aktual mesin). **WPos** = posisi relatif titik nol kerja (tampil di kartu POSISI; tanda silang merah di PCB = titik nol kerja).
- **Urutan gerak twin**: setelah tombol START pahat berjalan ke **tengah PCB** (fase *menuju tengah*), lalu **bergerak sesuai koordinat** (fase *ikut koordinat*). Titik nol kerja (WPos 0,0) berada di tengah PCB (tanda silang merah), jadi koordinat negatif tetap di atas papan. Tombol ⌖ mengulang gerak ke tengah. Bila ada sumbu di luar jangkauan model, kartu POSISI menampilkan peringatan (posisi dipotong di batas gerak model, bukan dipalsukan diam-diam).
- **Spindle RUN** bila status `Run` ATAU MPos/WPos berubah dalam `move_timeout_ms`. Alarm / data basi / offline => OFF.
- **RPM**: dipakai dari `FS:feed,rpm` / `S:rpm` bila ada di status; jika tidak, memakai `spindle.rpm_nominal` (label EST.).
- Log event hanya mencatat saat status berubah.

## Konfigurasi (`config.php`)
`spindle.rpm_nominal / rpm_max / move_timeout_ms`, `twin.scale` (pembesar gerak), `twin.invert` (balik arah sumbu x/y/z bila terbalik), `twin.origin` (letak titik nol kerja di PCB: `'center'` = tengah PCB (bawaan) atau mm dari pojok kiri-depan, mis. `['x'=>0,'y'=>0]` seperti versi lama), `twin.start_center` (menuju tengah dulu), `twin.center_speed` (mm/detik).

## Struktur
index.php · config.php · includes/ · api/log.php · assets/js/app.js (UI+MQTT+parser) · assets/js/twin.js (Three.js) · assets/vendor (lokal)
