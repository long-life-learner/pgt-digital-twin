<?php
/**
 * Konfigurasi pusat CNC PIXEL MONITOR.
 * Ubah nilai di sini; index.php akan menyuntikkannya ke JavaScript.
 */
return [
    'app_name' => 'CNC-PCB PIXEL LAB',
    'machine'  => 'CNC 3EB · PCB Mill',

    'mqtt' => [
        'host'     => 'broker.emqx.io',
        // MQTT di browser memakai WebSocket (bukan port 1883 TCP milik ESP).
        'ws_port'  => 8083,       // ws://   (dipakai bila situs dibuka lewat http://)
        'wss_port' => 8084,       // wss://  (dipakai otomatis bila situs dibuka lewat https://)
        'path'     => '/mqtt',
        'username' => '',
        'password' => '',
    ],

    // Persis sama dengan #define di program .ino
    'topics' => [
        // ESP -> Web. Isi contoh:
        //   Run,MPos:59.196,-13.344,22.600,WPos:33.196,-23.344,-2.400,Ln:0
        //   Idle,MPos:59.628,-13.344,22.600,WPos:33.628,-23.344,-2.400,Ln:0
        //   Hold
        'status'   => 'cnc3eb/topic/status',
        'online'   => 'cnc3eb/topic/online',   // ESP -> Web (online/offline)
    ],

    // Spindle motor.
    // GRBL tidak mengirim RPM kecuali status report memuat "FS:feed,rpm" atau "S:rpm".
    // Jika ada, angka itu yang dipakai (label GRBL). Jika tidak ada, dipakai 'rpm_nominal' (label EST).
    'spindle' => [
        'rpm_nominal'    => 10000,  // RPM yang ditampilkan saat spindle RUN bila ESP tidak mengirim RPM
        'rpm_max'        => 12000,  // skala penuh bar & grafik
        'move_timeout_ms'=> 1500,   // MPos/WPos tidak berubah selama N ms => dianggap berhenti
    ],

    // Digital twin: gerak mengikuti MPos (posisi aktual mesin), skala 1 mm = 1 mm model.
    //   X = carriage spindle geser kiri-kanan di gantry
    //   Y = BASE PLATE (meja + PCB) maju-mundur  (gantry & spindle diam)
    //   Z = spindle motor naik-turun (Z=0 => ujung pahat menyentuh permukaan PCB)
    // Urutan gerak: setelah tombol START, pahat berjalan ke TENGAH PCB dulu, lalu bergerak sesuai koordinat X Y Z.
    // Titik nol kerja (WPos 0,0,0) saat data pertama masuk diletakkan di titik 'origin' pada PCB
    // (mm dari pojok KIRI-DEPAN PCB, PCB = 320 x 160 mm); sesudah itu twin mengikuti MPos.
    'twin' => [
        'scale'         => 1.0,   // pembesar gerak (mis. 2.5 agar gerakan kecil lebih terlihat)
        // Arah normal: X+ = spindle ke kanan, Y+ = meja ke depan (pahat relatif ke belakang), Z+ = spindle naik.
        // Ubah ke true bila arah di digital twin terbalik dibanding mesin asli.
        'invert'        => ['x' => false, 'y' => false, 'z' => false],
        // Letak titik nol kerja di PCB, mm dari pojok kiri-depan, atau 'center' = tengah PCB (bawaan: koordinat
        // negatif tetap jatuh di atas papan). Contoh pojok kiri-depan: ['x' => 0, 'y' => 0]; pojok kiri-BELAKANG: y = 160.
        'origin'        => ['x' => 'center', 'y' => 'center'],
        'start_center'  => true,  // true: pahat menuju tengah PCB dulu sebelum mengikuti koordinat; false: langsung ikut data
        'center_speed'  => 140,   // kecepatan gerak menuju tengah (mm/detik)
        'stale_after_s' => 8,     // tidak ada data > N detik => "menunggu data"
    ],
];
