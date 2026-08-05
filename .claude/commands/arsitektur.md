---
name: arsitektur
description: >
  Periksa keadaan sungguhan sistem Masume (migrasi, Edge Function, policy RLS,
  rute, deploy), bandingkan dengan docs/ARCHITECTURE.md, perbarui yang sudah
  melenceng, lalu terbitkan ulang halaman arsitektur di URL yang sama. Trigger:
  "perbarui arsitektur", "diagram sistem", "update diagram", "arsitektur masume",
  "/arsitektur".
argument-hint: "[refresh|cek|diagram <mekanisme>]"
allowed-tools: PowerShell, Read, Edit, Write, Glob, Grep, Artifact, Skill
---

# /arsitektur

Menjaga dokumen arsitektur **Masume** tetap jujur. Repo
`RiGi26/planner-family-platform`, live di `masume.vercel.app`, DB Supabase
`wiitzbbsdsvltjbixowm` (MCP `supabase-goukaku`).

Ini **bukan** perintah "gambar ulang diagram". Diagram yang digambar ulang tanpa
diperiksa hanya memindahkan kebohongan ke bentuk yang lebih rapi. Pekerjaan
sesungguhnya ada di langkah 1.

## Berkas

| Peran | Path |
|---|---|
| Sumber kebenaran | `docs/ARCHITECTURE.md` |
| Sumber halaman terbitan | `docs/architecture-page.html` |
| Migrasi | `supabase/migrations/` |
| Rute | `src/app/**/page.tsx` |

**URL Artifact:** `https://claude.ai/code/artifact/b51737b7-10c0-488f-b854-a24515e6cdd6`

Berkas HTML-nya sengaja tinggal di repo, bukan di scratchpad sesi — scratchpad lenyap
antar-sesi, dan skill yang menunjuk berkas hilang tidak akan pernah bisa dijalankan
lagi.

Sunting `docs/architecture-page.html`, lalu terbitkan dengan `file_path` itu **dan**
oper `url` di atas. Tanpa `url`, sesi yang tidak menerbitkannya sendiri akan mencetak
URL baru dan tautan lama jadi yatim.

## Langkah

### 1. Periksa keadaan sungguhan — jangan membaca dokumen lalu percaya

Kumpulkan dulu, simpulkan belakangan. Yang wajib diperiksa:

| Apa | Cara | Kenapa gampang basi |
|---|---|---|
| Migrasi terpasang | MCP `list_migrations` | Berkas di repo ≠ yang benar-benar diterapkan |
| Policy RLS | `pg_policies` per tabel + perintah | Policy `for all` diam-diam menutupi SELECT |
| Izin fungsi | `has_function_privilege` untuk `anon`/`authenticated` | `revoke from public` **tidak cukup** di Supabase |
| Edge Function | MCP `list_edge_functions` (cek `version`) | Versi lama bisa masih aktif |
| Pendaftaran publik | POST `/auth/v1/signup` dengan password sengaja pendek | Balasan `weak_password` = **masih terbuka**; penolakan pendaftaran = tertutup |
| Rute yang ada | `Glob src/app/**/page.tsx` | Dokumen sering menyebut layar yang belum ada |
| Advisor | MCP `get_advisors` keamanan + performa | Temuan baru muncul tiap DDL |

Working tree lokal **sering basi**. Kalau ragu apakah sesuatu sudah live, cek
GitHub atau DB, bukan berkas di disk.

### 2. Bandingkan dengan dokumen, catat selisihnya

Tiga jenis selisih, tiga penanganan berbeda:

- **Dokumen bilang ada, kenyataannya belum** → pindahkan ke seksi "Yang belum
  dibangun". Ini kesalahan paling merusak: pembaca menyangka pekerjaan selesai.
- **Kenyataannya ada, dokumen belum menyebut** → tambahkan.
- **Mekanismenya berubah** → baru di sinilah diagram disentuh.

### 3. Perbarui `docs/ARCHITECTURE.md`

- Ubah tanggal **"Terverifikasi lawan produksi"** hanya kalau langkah 1 benar-benar
  dijalankan sesi ini. Kalau dilewati, biarkan tanggal lama apa adanya dan katakan
  ke user bahwa dokumen belum diverifikasi ulang.
- Kalau ada jebakan baru yang memakan waktu, tambahkan ke tabel **"Traps"**. Kriteria
  masuk: gejalanya tidak menunjuk penyebabnya. Bug biasa tidak masuk.

### 4. Terbitkan ulang halaman

Perbarui berkas HTML lalu panggil `Artifact` dengan `file_path` yang sama.

- Penanda seksi mengodekan keadaan: petak **tertinta** = sudah jalan, petak
  **putus-putus** = belum. Sesuaikan saat status berubah — itu bukan hiasan.
- Palet ikut app: kertas, sumi, **satu** aksen shu per halaman, ai khusus aliran
  data, latar bergaris petak 原稿用紙. Jangan ganti gaya tanpa alasan.
- Favicon tetap 📐. Mengganti favicon membuat halaman terbaca sebagai halaman lain.

### 5. Laporkan

Selisih dulu, bukan ringkasan isi dokumen. Kalau tidak ada yang berubah, bilang
"tidak ada yang melenceng" — jangan mengarang perubahan supaya terlihat bekerja.

## Argumen

- **(kosong)** atau `refresh` → langkah 1–5.
- `cek` → langkah 1–2 saja. Laporkan selisihnya, **jangan menulis apa pun**. Pakai
  ini saat cuma ingin tahu seberapa basi dokumennya.
- `diagram <mekanisme>` → tambahkan satu diagram baru untuk mekanisme itu, lalu
  langkah 3–5. Sebelum menggambar, invoke `artifact-diagramming`.

## Gerbang

- **Satu diagram, satu klaim.** Kalau sebuah gambar tidak menunjukkan mekanisme yang
  harus dirakit sendiri oleh pembaca dari prosa, kalimat lebih baik. Kotak berlabel
  "cache" tidak mengatakan apa pun yang belum dikatakan kata "cache".
- **Beri label pada panah.** Panah tanpa label berarti "berhubungan entah bagaimana".
- **Yang belum dibangun harus disebut.** Seksi itu wajib ada dan wajib benar. Diagram
  tanpa penanda ini terbaca sebagai gambaran pekerjaan selesai, dan itu bentuk
  kebohongan yang paling mudah dilakukan tanpa sengaja.
- **Jangan mengklaim "terverifikasi" tanpa menjalankan pemeriksaannya.** Kalau MCP
  mati atau `gh` gagal, katakan apa adanya lalu lanjutkan dengan data yang ada —
  jangan menyajikan yang basi sebagai yang segar.
- **RLS adalah satu-satunya batas keamanan** di app ini, karena static export tidak
  punya lapisan server. Setiap perubahan policy wajib tercermin di diagram keempat,
  dan pembuktiannya lewat **login sungguhan** — service role melewati RLS, jadi
  bukan bukti.
- **Jangan gabungkan dengan proyek payung.** Masume adalah proyek pribadi terpisah:
  repo sendiri, DB sendiri, deploy sendiri. Jangan tarik data dari repo JapanArena
  SaaS mana pun ke dokumen ini.
