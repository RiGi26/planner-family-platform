# Peta Materi N5 → N1

Semua materi yang disajikan Masume untuk mengantar seseorang dari nol sampai N1,
tersusun sebagai satu tangga. Dikunci 6 Agustus 2026; versi presentasi diterbitkan
sebagai artifact (label `peta-materi-v1`).

Setiap angka diberi label kejujuran:

- **terverifikasi** — dari data yang kita pegang
- **estimasi** — rekonstruksi komunitas; JLPT berhenti menerbitkan daftar resmi
  kosakata/kanji/grammar sejak format baru 2010. Cukup akurat untuk merencanakan,
  bukan janji resmi ujian
- **usulan** — default yang dipakai sampai owner memutuskan lain

## Tangga kurikulum

```
Kana ──95%──▶ N5 ──gerbang*──▶ N4 ──▶ N3 ──▶ N2 ──▶ N1
208 item      ±800 kata        ±1.500  ±3.750  ±6.000  ±10.000  (kata, kumulatif)
              ±100 kanji       ±300    ±650    ±1.000  ±2.000   (kanji, kumulatif)
```

Satu jalur, enam anak tangga, dengan gerbang di antaranya. Planner membagi kuota
harian hanya dari materi anak tangga yang sedang terbuka.

## Fondasi: Kana — terverifikasi, sudah live

208 item — 104 hiragana + 104 katakana (46 dasar, 25 dakuten/handakuten, 33 youon
per skrip), disusun sendiri dari struktur gojūon baku, goresan dari KanjiVG.

- **Lembar Kana** — tabel gojūon kosong diisi tulisan tangan sendiri; posisi adalah
  satu-satunya soal
- **Tiga mode wajib**: recognition, recall, writing (Demo → Jiplak → Ingat)
- **Gerbang ke N5: 95% kuat** (dikunci di PRD; mesinnya `kanaGate()`). N5 ditulis
  dalam kana — membukanya lebih awal berarti menghafal dua hal sekaligus, dan di
  situlah orang menyerah di minggu ketiga

## Tabel besar per level

Kata/kanji = kumulatif. Jam belajar = estimasi pembelajar tanpa latar kanji.
Nilai lulus = resmi JEES, skala 180.

| Level | Kata baru | Kata kumulatif | Kanji kumulatif | Grammar baru | Jam kumulatif | Lulus |
|---|---|---|---|---|---|---|
| N5 | ±800 | 800 | ±100 | ±80 | 425–600 | 80/180 |
| N4 | ±700 | 1.500 | ±300 | ±130 | 787–1.325 | 90/180 |
| N3 | ±2.250 | 3.750 | ±650 | ±200 | 1.325–2.200 | 95/180 |
| N2 | ±2.250 | 6.000 | ±1.000 | ±200 | 2.200–3.060 | 90/180 |
| N1 | ±4.000 | 10.000 | ±2.000 | ±250 | 3.900–4.500 | 100/180 |

**Syarat seksional yang sering terlewat:** lulus total saja tidak cukup — tiap seksi
punya nilai minimum (19/60 per seksi di N1–N3; 38/120 bahasa+baca dan 19/60 simak di
N4–N5). Gagal satu seksi = gagal semua. Ini alasan struktural mode listening masuk
Sprint 2, bukan pelengkap: seksi 聴解 bisa menggagalkan orang yang kosakatanya
sempurna.

## Karakter tiap level

- **N5 日常の基本** — terverifikasi dari sumber kita: **662 kosakata · 79 kanji ·
  49 grammar (target ±80)**. Grammar = 20 OpenJLPT + 29 disusun sendiri, dilengkapi
  sambil jalan. Tiap kosakata membawa bacaan, arti, contoh JA+EN; tiap kanji membawa
  on/kun-yomi + goresan KanjiVG
- **N4 生活の日本語** — percakapan sehari-hari penuh; konjugasi lengkap (te-form,
  potensial, pasif, kausatif) hidup di sini. ±700 kata / ±200 kanji / ±130 grammar baru
- **N3 橋渡し** — level jembatan; **lompatan kosakata terbesar di seluruh tangga**
  (±2.250 kata baru, 3× N4). Di sinilah planner paling berharga. Database soal N3
  Japan Arena bisa jadi sumber tambahan (bentuk tabel menunggu §11.1)
- **N2 新聞が読める** — bahasa Jepang "dewasa": koran, rapat, tulisan formal; syarat
  umum kerja kantoran. Bobot ujian condong ke 読解 — lihat "batas yang jujur"
- **N1 母語話者の入口** — editorial, nuansa, keigo dalam. Materi hafalan = ekor
  panjang (±4.000 kata frekuensi rendah, ±1.000 kanji). Daftar hafalan mengalami
  hasil menurun; pembeda utamanya volume baca/simak nyata. Peran Masume bergeser dari
  "menyuapi item" ke "menjaga ritme dan mengukur kesiapan" — dan itu dikatakan jujur
  di aplikasi

## Empat mode kartu × empat jenis materi

Satu engine FSRS untuk semua; yang berbeda per jenis hanya mode mana yang dibuat
(`CANVAS_MODES`, `MODE_RANK` — sudah ada sejak Sprint 1).

| Materi | Recognition | Recall | Writing | Listening |
|---|---|---|---|---|
| Kana | ✓ | ✓ | ✓ wajib | — |
| Kosakata | ✓ kata → arti+baca | ✓ arti → kata | — | ✓ TTS |
| Kanji | ✓ aksara → arti+yomi | ✓ arti → aksara | ✓ opsional (toggle) | — |
| Grammar | ✓ pola → makna+bentukan | — | — | — |

- **Writing dinilai otomatis** dari salah goresan (0 = Bagus, 1–2 = Sulit, 3+ = Lupa)
  — satu-satunya mode yang tak bisa menipu diri
- **Listening** = Web Speech API suara ja-JP perangkat; tanpa suara Jepang, modenya
  disembunyikan, bukan dibisukan. Jalur upgrade: VOICEVOX
- **Kanji writing default mati** — JLPT seluruhnya pilihan ganda; menulis untuk
  penguatan ingatan + formulir kehidupan nyata, jangan memakan jam materi yang diuji
- **Grammar** mulai recognition; cloze dari contoh kalimat menyusul setelah dataset matang

## Gerbang & instrumen kesiapan

| Instrumen | Aturan | Status |
|---|---|---|
| Gerbang Kana→N5 | 95% item kana "kuat" (interval ≥ 7 hari) | dikunci di PRD |
| Gerbang antar level | level berikut terbuka saat level berjalan ±90% kuat — **bisa dilewati**: penarget N3 langsung tak boleh dipenjara di N5 | usulan (dipakai sebagai default) |
| Buffer 21 hari | 3 minggu pra-ujian materi baru berhenti | dikunci di PRD |
| Mock test + skor kesiapan | simulasi format ujian + estimasi kesiapan per seksi; tolok ukur naik Fase 1 Android | disebut PRD, belum dirancang |

## Sumber data & lisensi

| Aset | Sumber | Lisensi | Catatan |
|---|---|---|---|
| Kosakata + contoh | OpenJLPT ← JMdict, Tatoeba | CC BY-SA 4.0 | atribusi + ShareAlike — dipenuhi di /tentang/ |
| Kanji | KANJIDIC2 | CC BY-SA | on/kun-yomi, arti, tingkat |
| Data goresan | KanjiVG © Ulrich Apel | CC BY-SA 3.0 | **mencakup semua kanji sampai N1** — jalur writing aman sepanjang tangga |
| Daftar level | Waller (tanos.co.uk) | CC BY | rekonstruksi komunitas pasca-2010 |
| Grammar | OpenJLPT + susunan sendiri | campuran | dataset paling tipis di semua level; per-entry ditandai `source` |
| Kana | disusun sendiri | — | struktur gojūon baku |
| Audio | Web Speech API (perangkat) | — | nol biaya, nol server |

**Yang tidak akan pernah dipakai:** soal asli JLPT (hak cipta JEES) dan konten
Bunpro/JLPT Sensei/buku teks. Semua materi dari sumber berlisensi terbuka atau
disusun sendiri.

## Batas yang jujur

Masume = planner + mesin hafalan: *"apa yang harus kukerjakan hari ini supaya lulus
tanggal X"*. Tiga hal sengaja di luar cakupan, dan aplikasi mengatakannya
terang-terangan:

1. **Dokkai (baca teks panjang)** — butuh wacana utuh berhak-cipta-bersih; belum ada
   sumber terbuka yang layak. Mulai N2 porsi nilainya besar; Masume mengukur
   fondasinya dan berkata jujur: "jam bacamu di luar aplikasi ini"
2. **Kaiwa / output** — tidak diuji JLPT, tidak dicakup
3. **Guru** — umpan balik manusia tidak digantikan

## Pemetaan ke roadmap

| Tahap | Materi |
|---|---|
| Sprint 1 ✅ | Kana 208 lengkap: sesi review, Lembar Kana, modul menulis, offline |
| Sprint 2 | Dataset N5 (662 · 79 · 49→80) + generalisasi engine + Curriculum Path + gerbang kana + listening |
| Sprint 3 | Kanji writing (toggle) + polish dari pemakaian nyata |
| Berikutnya | N4 → N3 (± sumber Japan Arena, §11.1) → N2 → N1, satu level per rilis; mock test menjelang Fase 1 |

Struktur item sengaja level-agnostik (item polimorfik, field spesifik-tipe di
`data`) — menambah level = menambah baris data, bukan migrasi schema.
