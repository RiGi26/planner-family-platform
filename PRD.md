# PRD — JLPT Certification Planner

**Nama:** Masume (升目) — kotak-kotak pada kertas 原稿用紙, satu karakter per petak. Diputuskan 5 Agustus 2026, menggantikan working title "Goukaku" (§11.2 ditutup).
**Versi:** 2.3 — Sprint 2 tuntas (dataset N5, Curriculum Path + gerbang kana, kuota lintas track, listening)
**Tanggal:** 6 Agustus 2026
**Status:** Fase 0 berjalan — Sprint 1 dan Sprint 2 **SELESAI** (§8.1), Sprint 3 berikutnya. Satu item blocking (§11.1).

---

## Daftar isi

1. [Ringkasan](#1-ringkasan)
2. [Scope & fase](#2-scope--fase)
3. [Keputusan teknis](#3-keputusan-teknis)
4. [Auth & sesi](#4-auth--sesi)
5. [Arsitektur data](#5-arsitektur-data)
6. [Fitur](#6-fitur)
7. [Dataset & lisensi](#7-dataset--lisensi)
8. [Roadmap](#8-roadmap)
9. [Infrastruktur & biaya](#9-infrastruktur--biaya)
10. [Risiko](#10-risiko)
11. [Keputusan terbuka](#11-keputusan-terbuka)
12. [File terkait](#12-file-terkait)

---

## 1. Ringkasan

### 1.1 Masalah

Pembelajar JLPT yang menyiapkan ujian secara mandiri — sambil bekerja, kuliah, atau mengurus usaha — mau lulus sertifikat pada tanggal ujian yang sudah ditentukan. Aplikasi belajar bahasa yang ada (Anki, Duolingo, Bunpro) menjawab *"bagaimana cara menghafal"*, bukan **"apa yang harus saya kerjakan hari ini supaya lulus ujian tanggal X"**. Tanpa jawaban itu, belajar mandiri kehilangan arah: tidak ada cara tahu sedang tertinggal atau tidak, sampai terlambat.

### 1.2 Solusi

Planner sertifikasi yang menghitung mundur dari tanggal ujian ke kuota harian, lalu menjalankan kuota itu lewat satu SRS engine yang menangani semua jenis materi. **Aplikasi belajarnya adalah mesin; planner-nya adalah otak.**

### 1.3 Pengguna

Target user: **pembelajar JLPT umum** — aplikasi ini disiapkan untuk rilis publik di Play Store/App Store. Pendaftaran tetap berkode undangan sampai fase rilis publik tiba (§2.3).

Pengguna pertamanya tiga orang dalam satu keluarga, semuanya mulai dari pre-N5. Mereka bukan lagi definisi produk, tapi profilnya tetap jadi acuan desain karena mewakili spektrum pemakaian yang harus dilayani:

| User awal | Konteks | Implikasi desain |
|---|---|---|
| Riyadh | Kerja full-time + side project + vlog | Sesi pendek terpotong-potong, mobile, sering offline |
| Istri | Pegang usaha sendiri | Kuota lebih ringan (~30 menit/hari), writing kanji opsional |
| Kakak | — | Pace ditentukan sendiri |

Target tanggal ujian **berbeda per orang** — tiap akun punya `target_exam_date` sendiri. Konten identik untuk semua akun; jadwal, kuota, dan progress sepenuhnya milik masing-masing akun (§5.3).

### 1.4 Definisi berhasil (Fase 0)

Fase 0 dianggap stabil dan siap naik ke Fase 1 kalau:

1. Tiap pengguna aktif memakai ≥ 5 hari/minggu selama 4 minggu berturut-turut **tanpa disuruh**
2. Modul kana selesai (semua ≥ 95% akurat) tanpa perlu aplikasi lain
3. Zero data loss — tidak pernah ada review yang hilang karena offline atau app ke-close
4. Sesi review 20 kartu selesai < 4 menit

Kriteria 1 adalah yang sesungguhnya. Tiga lainnya adalah prasyarat teknis supaya kriteria 1 mungkin terjadi.

---

## 2. Scope & fase

### 2.1 Dua sumbu yang jalan paralel

Fase penyebaran (platform) dan fase konten adalah **dua sumbu terpisah**, bukan berurutan. Penomoran "Fase" di dokumen ini merujuk ke platform.

| | Platform | Konten |
|---|---|---|
| **Fase 0** | PWA (Vercel) | Kana + N5 |
| **Fase 1** | Android — Capacitor + Play Console (Internal Testing) | Mock test + readiness score |
| **Fase 2** | iOS — Capacitor + cloud CI + TestFlight | N4 |
| **Fase 3** | Produksi publik di kedua store | N3 (import dari Japan Arena) |

Konten bisa maju tanpa menunggu platform, dan sebaliknya. Yang mengikat cuma satu: naik ke platform berikutnya baru masuk akal kalau yang sekarang sudah stabil dipakai harian.

### 2.2 Fase 0 — masuk scope

- Auth: pendaftaran mandiri berkode undangan, sesi permanen, keluar + hapus akun via Setelan
- Goal Engine: pilih tanggal ujian → kuota harian otomatis, re-balance kalau bolong
- Curriculum Path: Kana → N5 (vocab + kanji + grammar), dengan gate
- Daily Engine: FSRS untuk 4 tipe kartu (recognition, recall, writing, listening)
- Writing practice: demo → trace → recall, untuk kana dan kanji N5
- Offline-first: review jalan tanpa internet, sync saat online

### 2.3 Fase 0 — di luar scope

- Mock test full-length & readiness score
- Konten N4 dan N3
- Push notification & nudge WhatsApp (Fonnte)
- Native shell (Capacitor), App Store / Play Store
- **Pendaftaran publik terbuka** (tanpa kode undangan) — arsitektur multi-user sudah kenyataan sejak generalisasi (§5.3), tapi pintunya tetap undangan sampai fase rilis store; membukanya butuh rate-limit + proteksi bot (§9.3)
- Monetisasi

### 2.4 Kenapa PWA dulu

Untuk basis pengguna awal sekecil ini, store distribution tidak menambah nilai apa pun — hanya menambah biaya, ketergantungan pada mesin macOS, dan risiko penolakan review Apple Guideline 4.2 (yang menuntut aplikasi punya fitur dan UI melampaui situs web yang dikemas ulang). PWA memberi semua yang dibutuhkan — ikon home screen, offline, fullscreen — dengan nol friksi.

**Konsekuensi:** semua keputusan teknis di §3 dipilih supaya kompatibel dengan Capacitor. Naik ke Fase 1/2 menambah lapisan, bukan menulis ulang.

### 2.5 Kenapa Capacitor, bukan TWA

Untuk Android saja, ada jalur lebih ringan: **TWA** (Trusted Web Activity) via Bubblewrap/PWABuilder, yang membungkus PWA dan dirender Chrome. Banyak tutorial "PWA ke Play Store" mengarah ke sana.

Tapi TWA tidak punya padanan di iOS. Karena iOS sudah dikunci di Fase 2, memakai TWA sekarang berarti memelihara dua shell berbeda. **Capacitor sekali, dipakai keduanya.**

---

## 3. Keputusan teknis

### 3.1 Stack inti

| Layer | Pilihan | Versi | Alasan |
|---|---|---|---|
| Framework | **Next.js App Router**, `output: 'export'` | 15.x | Static export → satu build jalan di Vercel *dan* bisa dibungkus Capacitor tanpa ubah apa pun |
| Bahasa | TypeScript (strict) | 5.x | Schema konten cukup kompleks; type safety menutup banyak bug diam-diam |
| Styling | Tailwind CSS + shadcn/ui | v4 / latest | shadcn = komponen di-copy ke repo, bukan dependency — bebas dimodifikasi |
| Backend | **Supabase** (Postgres + Auth + RLS) | — | Comfort zone; RLS memberi isolasi per-user tanpa kode server |
| Data fetching | TanStack Query | 5.101.4 | Static export = semua fetch client-side. Cache + optimistic update wajib |
| SRS | **ts-fsrs** | 5.4.1 | FSRS, algoritma Anki modern. Aktif (rilis Mei 2026) |
| Offline DB | Dexie (IndexedDB) | 4.4.4 | Antrean review offline, sync saat online |
| PWA / SW | **@serwist/next** | 9.5.12 | ⚠️ **Bukan `next-pwa`** — rilis terakhir Agustus 2022, praktis mati. Serwist penerusnya |
| Writing | **KanjiVG** (data goresan, diekstrak build-time ke `src/data/kvg-strokes.json`) | — | Lihat §3.3 dan §7.2 |
| TTS | Web Speech API | native | Gratis, ada voice Jepang. Upgrade ke VOICEVOX kalau kurang |
| Chart | Recharts | latest | Progress & readiness viz |
| Tanggal | date-fns | 4.4.0 | Goal Engine banyak aritmatika tanggal |
| Hosting | Vercel | — | — |

### 3.2 Konsekuensi static export

Tidak ada Next.js API routes, tidak ada server component yang fetch data, **tidak ada middleware**. Artinya:

- Semua akses data lewat `@supabase/supabase-js` dari client, diamankan **RLS** — bukan logika server
- Semua pekerjaan server-side (nanti: cron nudge WhatsApp, generate kalimat via Claude API) → **Supabase Edge Functions**
- `next/image` butuh `unoptimized: true` (tidak ada server untuk optimasi)
- Semua env var harus prefix `NEXT_PUBLIC_`
- Anon key Supabase aman di client bundle — memang dirancang publik. **Service role key** dan **API key Claude** tidak boleh menyentuh client; keduanya hanya di Edge Function

### 3.3 Data stroke order

Sumber data goresan: **KanjiVG** (© Ulrich Apel, CC BY-SA 3.0 — kewajiban lisensinya di §7.2). Rencana awal sempat berbelok ke `@k1low/hanzi-writer-data-jp` karena package-nya matang, tapi datanya diturunkan dari font Cina (Make Me a Hanzi + animCJK): diaudit terhadap KanjiVG, **21 dari 150 karakter kana berbeda jumlah goresan** — semuanya karakter berloop tertutup yang dipecah jadi dua goresan padahal tulisan tangan Jepang menariknya satu. Keputusannya pindah total ke KanjiVG, bukan menambal tabel manual; `@k1low/hanzi-writer-data-jp` sudah dibuang dari dependensi.

Keunggulan teknis KanjiVG: path-nya **garis tengah (centreline)**, bukan outline — satu dataset yang sama menggambar karakter, menganimasikan demo, dan jadi kerangka penilaian goresan. `npm run verify:strokes` melaporkan 150/150 cocok dengan pengajaran Jepang.

⚠️ **Jangan bundle dataset utuh.** Skrip `scripts/fetch-kanjivg.mjs` (jalan sebagai `prebuild`) mengekstrak hanya karakter yang dipakai ke `src/data/kvg-strokes.json` — cukup ringan untuk dimuat sekaligus agar tersedia offline.

---

## 4. Auth & sesi

### 4.1 Kenapa email + password

Untuk akun yang login sekali lalu tetap login:

- **Magic link** butuh email bolak-balik setiap login. SMTP bawaan Supabase dibatasi ketat dan memang hanya untuk testing — kalau email tidak sampai, tidak ada yang bisa masuk
- **OAuth Google** enak di web, tapi menambah konfigurasi native yang lumayan di Capacitor nanti
- **Email + password** tidak bergantung pada pengiriman email sama sekali. Friksi mengetik password muncul sekali seumur pemakaian, karena sesinya permanen

**Pendaftaran mandiri, berkode undangan.** Halaman `/daftar` meminta nama, email, dan kode undangan; kodenya diverifikasi di Edge Function `redeem-invite` (bukan di browser). **Kode undangan itulah kredensialnya** — karena itu `verify_jwt` dimatikan di function ini: pendaftar belum mungkin punya JWT. Password tidak pernah melewati function; user membuatnya sendiri lewat tautan email undangan (`inviteUserByEmail` → `/atur-password/`), sehingga verifikasi email inheren di alurnya, bukan langkah yang bisa dilompati. Pendaftaran publik tanpa kode = fase nanti (§2.3).

**Keluar dan hapus akun** dari halaman `/setelan/`:

- **Keluar** — sync antrean dulu (konfirmasi kalau masih ada antrean), bersihkan seluruh IndexedDB (`clearAll`), lalu `signOut` lokal
- **Hapus akun** — konfirmasi ketik `HAPUS`, lalu Edge Function `delete-account` (`verify_jwt` on; JWT sekaligus autentikasi dan target — caller hanya bisa menghapus dirinya sendiri) memanggil `admin.deleteUser`; seluruh data ikut terhapus lewat FK cascade. Ini wajib untuk store: App Store guideline 5.1.1(v) dan kebijakan data deletion Google Play

### 4.2 Sesi permanen — cara kerja

```
Login sekali
  └─ Supabase simpan { access_token, refresh_token } ke localStorage
       ├─ Browser ditutup          → localStorage bertahan → masih login
       ├─ HP restart               → localStorage bertahan → masih login
       ├─ Access token kadaluarsa (1 jam)
       │    └─ autoRefreshToken tukar refresh_token → access_token baru
       │       (tidak terlihat user)
       └─ signOut()                → localStorage dibersihkan → logout
```

`localStorage` dipakai, **bukan `sessionStorage`** — yang terakhir terhapus saat tab ditutup.

Yang bisa mengakhiri sesi di luar `signOut()`:
- User menghapus data situs / storage browser
- Mode incognito ditutup
- Setting session timeout di dashboard diisi (§4.3)
- **Nanti di native:** OS membersihkan storage WebView (§4.4)

`signOut()` dipanggil dengan `scope: 'local'` — hanya mengakhiri sesi di perangkat itu. Dengan `'global'`, logout di HP ikut mengeluarkan sesi di laptop, yang hampir selalu bukan yang diinginkan.

### 4.3 Setting dashboard Supabase (wajib)

**Authentication → Sessions**

| Setting | Nilai | Kalau diisi |
|---|---|---|
| Time-box user sessions | **kosong** | Semua orang ter-logout paksa setelah durasi itu |
| Inactivity timeout | **kosong** | Tidak buka app beberapa hari = ter-logout |

Keduanya default kosong. **Yang penting: jangan diisi.** Ini satu-satunya setting yang bisa membatalkan perilaku "tetap login sampai logout".

JWT expiry 3600 detik (default) **tidak perlu diubah** — itu umur access token, bukan umur sesi. `autoRefreshToken` memperbaruinya di latar belakang. Menaikkannya memperlemah keamanan tanpa manfaat.

**Authentication → Providers → Email:** matikan *Confirm email*, atau buat akun langsung dari dashboard.

### 4.4 Forward-compatibility Capacitor

Di WebView native, `localStorage` **bisa dihapus sistem operasi** saat storage menipis. Efeknya user tiba-tiba ter-logout tanpa sebab — persis kebalikan dari yang diinginkan.

Karena itu storage adapter di `supabase-client.ts` sengaja dipisah sebagai objek tersendiri. Di Fase 1/2, cukup tukar ke `@capacitor/preferences`:

```ts
const nativeStorage: SupportedStorage = {
  getItem:    async (key) => (await Preferences.get({ key })).value,
  setItem:    async (key, value) => { await Preferences.set({ key, value }) },
  removeItem: async (key) => { await Preferences.remove({ key }) },
}
```

`SupportedStorage` menerima nilai async, jadi tidak ada penyesuaian lain. Inilah alasan adapter dipisah sejak sekarang.

---

## 5. Arsitektur data

### 5.1 Prinsip pemisahan

```
KONTEN (shared, read-only)     ←→     STATE (per-user, read-write)
items, item_examples                  card_states, reviews, goals,
                                      profiles, daily_progress
```

Konten identik untuk semua user; yang berbeda hanya progress. Ini membuat RLS sederhana: tabel konten `SELECT` untuk semua authenticated user, tabel state difilter `user_id = auth.uid()`.

### 5.2 Tabel state (migration 0001, disesuaikan 0005+0006+0007 — applied di produksi)

**`profiles`** (1:1 dengan `auth.users`, dibuat otomatis oleh trigger saat signup)
```
id, display_name,
level_current (KANA|N5..N1), daily_minutes_target,
writing_kana_enabled, writing_kanji_enabled,
timezone, created_at, updated_at
```
`timezone` menentukan batas "hari ini" untuk kuota dan streak. Akan berubah saat pindah ke Jepang.

**`goals`**
```
id, user_id, target_level, target_exam_date, is_active,
baseline_new_per_day, created_at
```
Unique partial index memastikan maksimal satu goal aktif per orang; goal lama tersimpan sebagai riwayat.

`baseline_new_per_day` (nullable, migrasi 0007) menyimpan pace yang **disetujui saat goal dibuat**, supaya peringatan "pace tidak realistis" (§6.1) punya pembanding. Kolomnya duduk di `goals`, bukan `profiles`: baseline itu milik target ini — geser tanggal ujian, baseline ikut direset. Goal yang lahir sebelum 0007 sengaja dibiarkan NULL tanpa backfill; `computeQuota` membaca NULL sebagai "tidak ada pembanding", yang memang keadaan sebenarnya.

**Mengganti goal aktif wajib lewat RPC `set_active_goal(text, date, integer)`** (`security invoker`, EXECUTE dicabut dari `public`+`anon`). Karena `goals_one_active_per_user` adalah unique index **parsial** (`WHERE is_active`), kedua urutan dari client salah: *insert lalu deactivate* langsung melanggar index dan gagal, sementara *deactivate lalu insert* meninggalkan jendela tanpa goal aktif — dan di jendela itu `RequireGoal` melempar user balik ke onboarding padahal riwayatnya sudah separuh tertulis. PostgREST tidak punya transaksi lintas-request, jadi atomisitasnya harus tinggal di database.

**`card_states`** — state FSRS
```
id, user_id, item_id, mode (recognition|recall|writing|listening),
due, stability, difficulty, scheduled_days, learning_steps,
reps, lapses, state, last_review, elapsed_days
UNIQUE (user_id, item_id, mode)
```

Dua keputusan penting di sini:

**Unique key bertiga.** Kanji 川 bisa punya kartu recognition *dan* kartu writing dengan jadwal terpisah. Ini yang membuat "writing = tipe kartu keempat" berjalan tanpa engine kedua.

**Enum FSRS disimpan sebagai `smallint`, bukan enum string.** ts-fsrs memakai enum numerik — `State` 0=New 1=Learning 2=Review 3=Relearning, `Rating` 1=Again 2=Hard 3=Good 4=Easy. Nama kolom mengikuti persis interface `Card` ts-fsrs 5.x, jadi mapping 1:1 tanpa layer konversi. `elapsed_days` ditandai deprecated untuk ts-fsrs v6 — hapus saat upgrade.

**`reviews`** — log append-only
```
id, user_id, card_state_id, rating, state_before,
reviewed_at, duration_ms, stroke_errors, client_review_id
UNIQUE (user_id, client_review_id)
```
`client_review_id` dibuat di client sebelum kirim sebagai kunci idempoten. Retry pengiriman tidak pernah menghasilkan baris ganda — ini yang menopang kriteria sukses "zero data loss".

**`daily_progress`**
```
user_id, date, new_done, review_done, minutes, quota_target
PRIMARY KEY (user_id, date)
```
Streak sengaja **tidak** disimpan sebagai kolom. Dihitung dari tabel ini saat dibutuhkan, supaya tidak pernah bisa melenceng dari data aslinya.

`date` adalah tanggal **lokal** menurut `profiles.timezone`, diturunkan lewat `src/lib/day.ts` (Intl, bukan `toISOString().slice(0,10)` — di WIB yang terakhir berganti hari pukul 07.00, jadi sesi jam 9 malam mendarat di baris BESOK dan streak menunjukkan bolong pada hari yang justru dikerjakan).

⚠️ **Satuan `quota_target` adalah KARTU, bukan item.** `newPerDay` dari Goal Engine menghitung *item*, sedangkan `new_done` menghitung *kartu* — dan satu item kana melahirkan dua kartu di jalur cepat (recognition + recall). Menyimpan target dalam item membuat baris harian membandingkan dua satuan berbeda, sehingga hari yang tuntas terlihat 200% selesai. Yang disimpan sekarang adalah jumlah kartu antrean.

Dua kolom hanya hidup di Dexie dan **dibuang sebelum upload** (servernya tidak punya kolomnya, dan PostgREST menolak seluruh batch atas field tak dikenal, bukan mengabaikannya):

- `ms` — akumulator milidetik. Membulatkan tiap kartu ke menit utuh menghasilkan nol untuk semua kartu; pecahannya ditampung di sini dan hanya muncul sebagai `minutes`
- `new_done_items` — item yang **dilepas** hari ini, sengaja bukan `new_done` (yang menghitung kartu dijawab). Ini yang menjaga jatah kartu baru tetap habis sekali sehari walau halamannya di-reload

**`kana_sheet`** — tulisan tangan tersimpan (lihat §6.6)
```
user_id, item_id, strokes(jsonb), written_at
PRIMARY KEY (user_id, item_id)
```
`strokes` menyimpan titik-titik goresan yang sudah ditangkap kanvas. Sengaja terpisah dari `card_states` karena mengukur hal berbeda: `kana_sheet` menjawab *"sudah pernah ditulis?"*, `card_states` menjawab *"masih ingat?"*. Ukurannya kecil — 104 sel per skrip, sekali tulis.

**`invites`** — kode undangan (migration 0004+0005)
```
code (PK), label, max_uses, used_count, expires_at, created_at
```
RLS aktif dengan **nol policy** — deny-all yang disengaja. Tidak ada client role yang bisa membaca atau menulis kode undangan; satu-satunya konsumen adalah service role di dalam Edge Function `redeem-invite`, lewat fungsi `claim_invite(p_code) → boolean` / `release_invite(p_code)` yang execute-nya di-revoke dari `public`, `anon`, dan `authenticated`.

### 5.3 Model akun

Semua data user bersifat **own-rows-only**: setiap policy RLS memfilter `id = auth.uid()` (profiles) atau `user_id = auth.uid()` (tabel lainnya), tanpa satu pun jendela lintas-user. Satu akun = satu pulau data; tidak ada konsep keanggotaan, grup, atau household.

Section lama tentang household & Family Dashboard dihapus karena fiturnya dibatalkan saat aplikasi digeneralisasi — tabel `households`, `progress_summary`, kolom `household_id`, dan helper `current_household_id()` sudah dicabut dari DB oleh migrasi 0005. Keputusan + alasan: `notes/masume/keputusan/2026-08-05-generalisasi-aplikasi-umum.md`.

### 5.4 RLS adalah batas keamanan

Dengan static export, **tidak ada server yang memeriksa apa pun**. Route guard di client hanya urusan tampilan — siapa pun bisa melewatinya lewat devtools.

Yang benar-benar melindungi data adalah RLS. Karena itu setiap tabel di migration 0001 punya policy eksplisit, tanpa kecuali.

### 5.5 Strategi offline

Database lokal `masume` (Dexie) kini di **versi 2**. Versi 1 memegang `cards`, `reviewQueue`, `pendingCards`, `kanaSheet`, `pendingKana`, `meta`; versi 2 menambah `dailyProgress` + `pendingProgress`. Menambah versi aman — store lama terbawa apa adanya; yang tidak boleh adalah mengganti *nama* database, karena itu meng-orphan seluruh data lokal yang sudah ada.

1. Saat buka app: `SyncProvider` menjalankan **push dulu, baru pull** — `pushPending()` → `pullCards()` → `pullProgress()`
2. Sesi review dijalankan sepenuhnya dari Dexie; hasilnya masuk antrean lokal, tanpa satu pun panggilan jaringan
3. Sync berjalan lagi saat koneksi kembali dan saat app kembali ke depan (`watchForSync`) — bukan interval polling, karena cuma dua momen itu yang mengubah jawabannya
4. Konflik: `reviews` append-only sehingga merge trivial; `card_states` last-write-wins berdasarkan `last_review`

**Urutan push-lalu-pull itu wajib, bukan selera.** `pullCards` menghidrasi dengan `bulkPut`, jadi pull yang jalan duluan menimpa state kartu yang belum terunggah — diam-diam membuang review yang barusan dijawab. Mengosongkan antrean lebih dulu membuat server jadi salinan yang lebih baru sebelum kita menerimanya balik.

`syncPending` punya **empat blok**, dikirim berurutan karena `reviews` mereferensi `card_states`:

| # | Tabel | onConflict | Catatan |
|---|---|---|---|
| 1 | `card_states` | `user_id,item_id,mode` | Kartu duluan — review menunjuk ke sini |
| 2 | `reviews` | `user_id,client_review_id` + `ignoreDuplicates` | Fakta append-only: kiriman ulang harus jadi no-op |
| 3 | `kana_sheet` | `user_id,item_id` | Satu sel, satu baris |
| 4 | `daily_progress` | `user_id,date`, **tanpa** `ignoreDuplicates` | Rekap berjalan: kiriman ulang membawa angka LEBIH BARU dan harus menimpa |

Kontras blok 2 vs blok 4 itu justru intinya, dan gampang salah disalin. Terakhir sengaja `daily_progress`: tidak ada yang mereferensinya, dan kegagalan di sini hanya kehilangan rekap yang bisa dibangun ulang dari `reviews`.

**Sisi tarik `daily_progress` sempat tidak ada.** Antrean cuma punya sisi dorong, sehingga strip streak membaca nol di perangkat mana pun yang tidak menulis barisnya sendiri — HP baru menampilkan seminggu kotak kosong di atas hari-hari yang nyata dikerjakan. `pullProgress()` menutup itu; `mergeProgress()` memenangkan baris lokal, karena salinan lokal bisa memegang hitungan yang belum terunggah.

Ini bukan nice-to-have. Review di jalan atau saat sinyal jelek adalah use case utama, dan kriteria sukses #3 bergantung penuh padanya.

**Bukti (5–6 Agustus 2026):** 6 kartu dijawab tanpa jaringan → antrean lokal → online → tepat 6 baris review dengan 6 `client_review_id` unik; sinkron diulang 3× tetap 6 baris (idempoten).

### 5.6 Tabel konten (belum ditulis — nomor berikutnya yang bebas adalah 0008)

```
items          id, level, type(kana|vocab|kanji|grammar),
               expression, reading, meanings[], data(jsonb), seq
item_examples  id, item_id, ja, en, source
```

Satu tabel `items` polimorfik dengan `data jsonb` untuk field spesifik-tipe (onyomi/kunyomi untuk kanji, formation untuk grammar). Alasannya: SRS engine dan scheduler cukup query satu tabel; yang berbeda per `type` hanya renderer-nya.

Struktur sengaja dibuat level-agnostic supaya import database N3 Japan Arena nanti hanya butuh satu script transform, bukan migrasi schema. **Bentuk final belum dikunci** — menunggu §11.1.

---

## 6. Fitur

### 6.1 Goal Engine

**Input:** target level, tanggal ujian (JLPT: Minggu pertama Juli & Desember)
**Output:** kuota harian kartu baru + estimasi menit

```
sisa_item      = total_item(level) − item_sudah_dipelajari
hari_tersisa   = target_exam_date − today − buffer_review(21 hari)
kuota_baru     = ceil(sisa_item / hari_tersisa)
```

Buffer 21 hari di akhir: berhenti melepas kartu baru, murni review — supaya materi terakhir sempat mengendap sebelum ujian.

**Re-balance:** kalau bolong, sisa item dibagi ulang ke sisa hari. Tidak ada tumpukan hutang. Kalau `kuota_baru` melewati batas wajar (> 2× `baseline_new_per_day`), sistem memberi peringatan jujur: *"Dengan pace ini, target Desember tidak realistis. Geser ke Juli?"* — planner harus jujur, bukan memotivasi dengan angka bohong.

**Onboarding — `/mulai/`.** Dua langkah dalam **satu route**, dengan nomor langkah di state komponen. Bukan dua halaman: `output: 'export'` membuat tiap route jadi dokumen terpisah, jadi memecah langkah berarti memuat ulang seluruh app di tengah alur dan kehilangan pilihan yang belum disimpan.

- **Langkah 1** — chip level N5–N1 + daftar sitting JLPT resmi dari `src/lib/exam-dates.ts`. Tanggal ujian **tidak diketik bebas**: JLPT digelar Minggu pertama Juli dan Desember, dan input tanggal bebas mengizinkan orang merencanakan ke hari yang tidak ada ujiannya — setelah itu setiap angka yang dicetak planner adalah kebohongan yang diucapkan dengan percaya diri. Sitting yang jatuh **di dalam buffer 21 hari** tetap ditampilkan tapi dinonaktifkan, karena tidak tersisa ruang untuk melepas materi baru
- **Langkah 2** — aritmetika §6.1 dibuka terang lewat `planTracks`: per track, berapa item dan berapa hari. Yang ditampilkan hanya track yang **sudah punya konten** — untuk sekarang kana saja. Menjanjikan jadwal N5 di layar sementara datanya belum ada adalah overclaim

Goal ditulis **langsung lewat RPC `set_active_goal`**, bukan lewat antrean offline. Ini satu-satunya tulisan di app yang menuntut koneksi, dan sengaja: sesi tidak bisa dimulai tanpa target, jadi mengantrekannya cuma menunda kegagalan ke tempat yang lebih membingungkan.

### 6.2 Curriculum Path

```
Fase 0: Kana (208 item)      gate: 95% akurat → buka N5
Fase 1: N5 Vocab (662)
        N5 Kanji (79)        gate: kana lulus
        N5 Grammar (49)
Fase 2: N4 → Fase 3: N3
```

Kana wajib termasuk **writing** untuk semua — motor memory mempercepat hafal, dan datasetnya kecil sehingga cocok sebagai test case engine sebelum di-scale ke ribuan item.

Untuk fase kana, peta kurikulumnya berbentuk **Lembar Kana** (§6.6), bukan jalur linear.

### 6.3 Daily Engine

Satu antrean per hari: kartu due (review) + kartu baru sejumlah kuota. Empat mode kartu, satu engine:

| Mode | Prompt | Jawaban | Rating |
|---|---|---|---|
| recognition | 川 | arti + bacaan | self-rate 4 tombol |
| recall | "sungai" | 川 | self-rate |
| writing | "tulis: kawa" | gambar di canvas | **otomatis** dari jumlah salah goresan |
| listening | audio (TTS) | arti | self-rate |

**Writing → FSRS rating otomatis:** 0 salah = Good · 1–2 = Hard · 3+ = Again. Ini satu-satunya mode yang tidak butuh self-assessment, dan karena itu paling jujur.

Logika antreannya murni — tanpa Dexie, React, atau jaringan — dan tinggal di `src/lib/session.ts` (`buildQueue`, `reduceSession`, `hintBudget`, `formatInterval`, `tally`). Layar yang mengambil baris dan menerapkan efeknya; file itu hanya memutuskan apa yang berikutnya dan apa artinya. Pemisahan itulah yang membuat *"apa yang terjadi kalau orang berhenti di kartu keempat belas"* jadi test, bukan tebakan.

**Urutan antrean.** Ulangan dulu, yang paling lama jatuh tempo di depan — review adalah hutang, dan orang yang berhenti di tengah seharusnya sudah membayarnya alih-alih bertemu materi baru yang toh akan dilupakan. Setelah itu kartu baru **dikelompokkan per mode**: semua recognition hari ini sebelum semua recall. Menaruh recognition あ persis di sebelah recall あ membuat recall dijawab dari kartu sebelumnya, bukan dari ingatan — dan recall berhenti mengukur apa pun.

**Kartu writing dipisah dari antrean sesi.** Pemisahnya adalah **biaya interaksi, bukan nama mode**: recognition adalah satu ketukan, writing adalah kanvas selama tiga puluh detik satu goresan demi satu goresan, dan mencampur keduanya membatalkan target "sesi 20 kartu < 4 menit" (§1.4 #4). Tapi membuang writing dari alur harian lebih buruk lagi — FSRS tetap menjadwalkannya seperti kartu lain, jadi tumpukannya menggunung tak terlihat sampai jadwalnya berhenti berarti. Karena itu kartu kanvas dikeluarkan ke `canvas` dan **diserahkan lewat layar ringkasan ke `/menulis/`**. Aturannya dikodekan sebagai konstanta `CANVAS_MODES`, jadi Sprint 2 tinggal menaruh `listening` di sisi cepat dan writing kanji di sisi kanvas tanpa mengubah apa pun di file itu.

**Rating Lupa mengulang kartu SEKALI di ekor** — sekali, bukan loop. Malam yang buruk harus tetap bisa selesai.

**Interval di bawah tombol rating dibaca dari `previewSchedule()`**, yang mengembalikan `{days, due}`, lalu diformat `formatInterval()` dari `due`. `previewIntervals()` (hanya `scheduled_days`) mengembalikan **nol untuk kartu yang masih di learning steps** — kartu hari pertama jatuh tempo beberapa menit lagi dengan hitungan hari 0, sehingga keempat tombol menulis "0 hr" dan tak satu pun memberi tahu apa bedanya.

**Aturan hint: `hintBudget` = jumlah grapheme jawaban − 1.** Petunjuk tidak pernah boleh membuka sel terakhir — hint yang melengkapi jawaban adalah reveal yang menyamar, dan diam-diam menaikkan rating yang lalu diberikan user ke dirinya sendiri. Untuk kana satu karakter, jatahnya nol dan tombolnya tidak ditawarkan sama sekali; sel penunjuk panjang jawaban tetap tampil, karena "satu karakter" sudah jadi informasi yang dipegang pembelajar dari promptnya. Youon dapat satu. Kosakata Sprint 2 dapat beberapa, tanpa perubahan di sini.

**Kartu yang tergeletak > 120 detik berhenti dihitung sebagai jawaban** (`MAX_CARD_MS`). Orang yang menaruh HP di tengah kartu lalu kembali sejam kemudian tidak menghabiskan sejam untuk mengingat あ, dan membiarkan angka itu masuk `duration_ms` meracuni estimasi per-kartu yang dipakai planner untuk menebak lama satu hari.

Layar sesi **tidak memasang BottomNav** dan **tidak punya transisi antar-kartu** — hanya fade 120 ms pada jawaban. Dua puluh kartu × dua belas detik tidak menyisakan ruang untuk animasi: fade 200 ms dua kali per kartu = delapan detik dihabiskan untuk apa-apa.

### 6.4 Writing practice

Tiga tahap per karakter:

1. **Demo** — animasi urutan goresan
2. **Trace** — karakter tampil samar, dijiplak; salah urutan/arah **dikoreksi saat itu juga**
3. **Recall** — kanvas kosong, tulis dari ingatan; **umpan balik ditahan sampai selesai**

Perbedaan umpan balik antara Trace dan Recall itu disengaja. Kalau Recall ikut mengoreksi per goresan, dia berhenti jadi Recall — user tinggal mengikuti koreksi alih-alih mengingat. Di Recall, kesalahan baru ditampilkan setelah karakter selesai, lalu jumlahnya dipetakan ke rating FSRS (§6.3).

Toggle per-user: kana writing wajib untuk semua; kanji writing opsional (istri default off supaya kuota 30 menit tidak jebol).

> **Catatan ekspektasi:** JLPT sama sekali tidak menguji tulis tangan — semua pilihan ganda. Writing di sini untuk (a) memory reinforcement, dan (b) kehidupan nyata di Jepang yang masih penuh formulir tulis tangan. Jangan sampai fitur ini memakan waktu yang seharusnya untuk materi yang diuji.

### 6.5 Family Dashboard — DIBATALKAN

Dibatalkan 5 Agustus 2026 saat aplikasi digeneralisasi menjadi aplikasi umum: fitur ini satu-satunya alasan adanya jendela data lintas-user, dan tanpa model household tidak ada lagi yang perlu saling melihat progress (§5.3).

### 6.6 Lembar Kana

Tabel gojūon (五十音図) yang **dimulai kosong** dan diisi sendiri dengan tulisan tangan. Ini menggantikan peta kurikulum linear selama fase kana.

**Keadaan awal: hanya sumbu.** Yang tampil cuma label kolom vokal di atas (a i u e o) dan label baris konsonan di kiri (—, k, s, t, n, h, m, y, r, w). Ke-46 sel kosong. Tidak ada glyph, tidak ada romaji, tidak ada contoh.

Ini persis latihan yang dikerjakan pelajar Jepang: lembar gojūon kosong bersumbu, diisi dari ingatan. Dan konsekuensinya tegas — **posisi adalah satu-satunya soal.** User melihat kotak di baris k kolom a, lalu harus menurunkan sendiri bahwa yang ditulis adalah か. Tidak ada apa pun di layar yang bisa dijadikan contekan.

Ini yang membuat lembarnya sekaligus mengajarkan hal terpenting tentang kana: **kana adalah sistem terstruktur, bukan 46 simbol acak.**

**Alur pengisian:**

```
Sel kosong  →  ketuk  →  kanvas besar  →  sel terisi tulisanmu
                          tulis dengan jari    lanjut sel berikutnya
```

Mengetuk sel membuka kanvas besar, **bukan** menulis di sel itu langsung. Alasannya fisik: satu sel sekitar 62px sementara bidang sentuh jari orang dewasa 40–50px — mustahil menulis karakter terbaca di kotak sebesar itu.

**Isi layar menulis:**

- Header baris + penghitung (`は行 · 2/5`)
- Strip lima sel baris itu: yang sudah terisi menampilkan tulisan tangan user, yang aktif ditandai cincin shu, sisanya kotak kosong
- Kanvas persegi besar — **selalu berwarna kertas, termasuk di mode gelap.** Orang menulis di atas kertas, bukan di atas tinta
- Garis bantu silang 田 putus-putus, standar kertas latihan kana Jepang
- Indikator goresan: pip hijau untuk goresan selesai, shu untuk yang sedang berjalan, outline kosong untuk sisanya (`goresan 3/4`)
- Umpan balik kesalahan singkat saat terjadi: arah terbalik, urutan salah

Selesai satu sel, isinya masuk ke strip dan fokus pindah ke sel berikutnya di baris itu.

**Tahap pengisian (mengikat ke §6.4):**

| Kondisi | Tahap |
|---|---|
| Sel diisi pertama kali | Demo → Trace → Recall berurutan |
| Menulis ulang sel yang sudah terisi | Langsung Recall; template samar hanya muncul kalau diminta |

**Yang tersimpan ke sel selalu goresan dari tahap Recall**, bukan dari Trace. Jadi isi lembar itu selalu tulisan dari ingatan, bukan jiplakan.

**Yang tersimpan adalah tulisan tangan user, bukan glyph cetak.** Setelah beberapa minggu terbentuk satu lembar gojūon utuh dalam tulisan sendiri, dan perkembangannya terlihat — ね minggu pertama dibanding ね minggu keenam. Sel mana pun bisa ditulis ulang kapan saja.

**Mode uji.** Begitu sebagian sel terisi, lembarnya berhenti jadi tes — jawabannya terpampang. Karena itu ada satu toggle yang mengosongkan tampilan semua sel, mengembalikan lembar ke keadaan bersumbu-saja. Dua fungsi, satu grid: **"lembarku"** (lihat hasil) dan **"uji aku"** (isi ulang dari nol tanpa menghapus apa pun). Ini juga cara pelajar Jepang benar-benar berlatih — mengulang lembar kosong berkali-kali.

**Penanda state FSRS tidak boleh mengungkap glyph.** Sel yang jatuh tempo ditandai cincin ai di sekelilingnya, bukan dengan menampilkan karakternya. Sel kosong tetap kosong.

**Hubungan dengan SRS — dua loop berbeda, tidak berkonflik:**

| | Menjawab | Sifat |
|---|---|---|
| Lembar Kana | "Sudah pernah aku tulis?" | Sekali jalan, 104 sel per skrip |
| SRS | "Masih ingat?" | Pemeliharaan berkelanjutan |

Aturannya: menulis sel yang **sedang due** dihitung sebagai review normal dan menulis state FSRS. Menulis sel yang belum due — baru mau diisi, atau mau diperbaiki — boleh kapan saja tapi **tidak menyentuh jadwal**. Ini yang mencegah lembar berubah jadi sarana cramming yang merusak penjadwal.

Bagian dakuten/handakuten (25) dan youon (33) memakai grid terpisah di bawahnya dengan mekanik sama. Katakana memakai lembar kedua — perlu cara berpindah antar keduanya.

---

## 7. Dataset & lisensi

Peta materi lengkap N5→N1 — angka per level, mode kartu per jenis materi, gerbang,
dan batas cakupan yang jujur — ada di **`docs/PETA-MATERI.md`** (dikunci 6 Agustus
2026). Bagian ini hanya memuat dataset yang menyentuh repo.

### 7.1 Isi

| File | Jumlah | Status | Isi |
|---|---|---|---|
| `kana.json` | 208 | ✅ di repo | 104 hiragana + 104 katakana (basic 46, dakuten/handakuten 25, youon 33 per skrip) |
| `vocab_n5.json` | 662 | **dibangun di Sprint 2** | expression, reading, meanings[], examples[] (JA+EN) |
| `kanji_n5.json` | 79 | **dibangun di Sprint 2** | character, onyomi, kunyomi, meanings, strokes, grade, freq |
| `grammar_n5.json` | 49 | **dibangun di Sprint 2** | pattern, meaning, formation, examples |

> Koreksi 6 Agustus 2026: tiga file N5 sempat tercatat "sudah ada sebagai berkas" —
> itu tidak benar; tidak pernah ada di repo. Angkanya adalah jumlah di sumber
> (OpenJLPT), dan pekerjaan pertama Sprint 2 adalah skrip yang membangunnya.

### 7.2 Sumber

| Aset | Sumber | Lisensi | Kewajiban |
|---|---|---|---|
| Vocab, kanji, 20 grammar | OpenJLPT ← JMdict, KANJIDIC2, Waller (tanos.co.uk), Tatoeba | CC BY-SA 4.0 | Atribusi + ShareAlike **kalau didistribusikan** |
| 29 grammar | Disusun sendiri | — | — |
| Kana | Disusun sendiri dari struktur gojuon baku | — | — |
| Stroke data | **KanjiVG** © Ulrich Apel | **CC BY-SA 3.0** | Atribusi + ShareAlike — **sudah dipenuhi** (lihat bawah) |

ShareAlike mengikat **dataset**, bukan kode aplikasi — dan data turunan `src/data/kvg-strokes.json` (hasil ekstraksi KanjiVG) ikut berlisensi CC BY-SA 3.0. Karena repo ini publik, kewajiban atribusi **sudah aktif sekarang**, dan dipenuhi di dua tempat:

- `licenses/kanjivg/COPYING` — teks lisensi CC BY-SA 3.0 penuh + README sumber
- Halaman `/tentang/` — atribusi KanjiVG in-app (plus lisensi MIT app dan daftar dependensi), bisa diakses tanpa login

`@k1low/hanzi-writer-data-jp` **sudah tidak dipakai** (§3.3); arsip lisensinya tersisa di `licenses/hanzi-writer-data-jp/` sebagai jejak historis.

### 7.3 Catatan grammar

OpenJLPT hanya punya 20 pattern N5, jauh dari perkiraan awal ~80, dan mayoritas partikel dasar. Ditambah 29 pattern yang umum di silabus N5 mana pun (は, も, konjugasi kata sifat, ました/ませんでした, まえに/てから, ながら, ことができます, ほうがいいです, dst) — pattern + gloss singkat + satu contoh kalimat, disusun sendiri, bukan salinan dari Bunpro/JLPT Sensei.

Tiap entry ditandai `"source": "openjlpt"` atau `"compiled"`. Cukup untuk Sprint 2; lengkapi sambil jalan begitu ketahuan yang kurang.

---

## 8. Roadmap

### 8.1 Sprint Fase 0

| Sprint | Isi | Selesai kalau | Status |
|---|---|---|---|
| **1** | Setup, auth, migration 0001, seed konten, FSRS engine, modul kana + writing canvas + Lembar Kana (§6.6) | Bisa belajar kana sampai tuntas | ✅ **SELESAI** 6 Agustus 2026 |
| **2** | Goal Engine, Curriculum Path + gate, N5 vocab & grammar, TTS listening | Kuota harian jalan otomatis | ✅ **SELESAI** 6 Agustus 2026 (satu sisa: bunyi TTS nyata belum didengar di HP) |
| **3** | N5 kanji + writing, ~~Family Dashboard~~ (dibatalkan — §6.5), offline sync | Dipakai harian oleh user awal | — |
| **4** | Polish, perbaikan dari pemakaian nyata | Kriteria sukses §1.4 terpenuhi | — |

#### Sprint 1 — SELESAI

Definisi selesainya adalah kalimat ini: **satu orang bisa belajar kana dari nol sampai tuntas di HP, offline.** Per 6 Agustus 2026 kalimat itu benar dari ujung ke ujung — daftar lewat kode undangan, tetapkan target ujian, lalu setiap hari dapat kuota, sesi review, latihan menulis, dan Lembar Kana, tanpa aplikasi lain dan tanpa jaringan setelah muatan pertama.

Yang benar-benar dibangun:

| Bagian | Isi |
|---|---|
| **Onboarding `/mulai/`** | Dua langkah satu route, sitting JLPT resmi dari `exam-dates.ts`, sitting dalam buffer 21 hari ditampilkan tapi mati, rencana per-track dari `planTracks`, goal ditulis lewat RPC `set_active_goal` (§6.1) |
| **Sesi review `/sesi/`** | Recognition + recall, antrean murni di `src/lib/session.ts`, ulangan-dulu lalu kartu baru per mode, Lupa mengulang sekali di ekor, interval tombol dari `previewSchedule()`, kartu writing diserahkan ke `/menulis/` (§6.3) |
| **Hari Ini `/`** | Objek DEMO dibuang; baca IndexedDB lewat `useLiveQuery`. Tiga keadaan dari `dayState()`: on-track (badge pinus), tertinggal (badge oker + "N kartu lewat"), selesai (hanko 済, CTA hilang). Grid 4 track diganti satu baris "Kana kuat X/208" |
| **Modul lib baru** | `exam-dates.ts` · `day.ts` (tanggal lokal per timezone lewat Intl) · `progress.ts` (`weekTicks`, `dayState`, `overdueBefore`, `shouldStamp`, `mergeProgress`) · `session.ts`; `fsrs.previewSchedule()`; `study.bumpProgress()` + `study.pullProgress()` |
| **Offline** | Dexie naik ke versi 2 (`dailyProgress` + `pendingProgress`), blok keempat `syncPending` untuk `daily_progress`, `SyncProvider` baru yang push-lalu-pull (§5.5) |
| **Database** | Migrasi 0007 — `goals.baseline_new_per_day` + RPC `set_active_goal` (§5.2). Total migrasi 0001–0007 |
| **PWA** | Font Jepang di-subset (6 berkas, 138 KB), ikon PNG 192/512 + maskable terpisah + apple-touch-icon, aturan service worker navigasi-dulu (§9.3) |

Komponen baru yang menopangnya: `SyncProvider` (sebelumnya `pullCards` dan `watchForSync` **nol pemanggil**, sehingga perangkat kedua selalu kosong; guard akun `guardLocalData` ikut pindah ke sini dari auth-provider supaya urutannya terjamin, bukan bergantung keberuntungan urutan efek React), `SwUpdateReloader`, dan `RequireGoal` — yang sengaja hanya dipasang di `/` dan `/sesi/`, bukan di `/kana/`, `/menulis/`, atau `/setelan/`, supaya orang yang gagal menyelesaikan onboarding tidak terkunci dari jalan keluarnya.

**Bukti verifikasi:**

- 149 test lolos (`vitest`), `tsc` bersih
- **Offline end-to-end:** 6 kartu dijawab tanpa jaringan → antrean lokal → online → tepat 6 review dengan 6 `client_review_id` unik; sinkron diulang 3× tetap 6 baris. Ini bukti langsung untuk kriteria sukses §1.4 #3 (zero data loss)
- 10 syarat installable PWA terpenuhi: manifest, ikon raster 192 + 512, maskable terpisah, apple-touch-icon, service worker, HTTPS, `display: standalone`
- UAT tiga keadaan Hari Ini di akun nyata; data dipulihkan persis setelahnya

**Selesai di luar rencana sprint** (generalisasi, 5 Agustus 2026):

- Halaman `/setelan/` — edit display_name/timezone/toggle menulis, keluar (sync → clearAll → signOut), hapus akun
- Halaman `/tentang/` — atribusi lisensi, bisa diakses tanpa login
- Edge Function `delete-account` (§4.1)
- i18n dictionary — seluruh string UI di `src/lib/i18n/id.ts` (§9.3 untuk bahasa kedua)

#### Sprint 2 — SELESAI

Definisi selesainya: **kuota harian jalan otomatis** — bukan lagi kana saja, tapi
terbagi ke seluruh track yang terbuka. Per 6 Agustus 2026 itu benar.

| Bagian | Isi |
|---|---|
| **Dataset N5** | 662 kosakata · 79 kanji · 49 grammar, dibangun `npm run jlpt` (`scripts/fetch-jlpt.mjs`) dari OpenJLPT + 29 pattern susunan sendiri. Di-commit, bukan diunduh saat build. Atribusi di `licenses/openjlpt/`, NOTICE, dan `/tentang/` |
| **Item generik** | `src/lib/items.ts` — satu bentuk `Item` untuk empat tipe; `modesForItem()` menentukan mode per TIPE, bukan per layar; dataset N5 dimuat `dynamic import` per prefix id, jadi orang di fase kana tak mengunduh sebyte pun (First Load JS tak berubah) |
| **Curriculum Path** | `src/lib/path.ts` — `kanaGate()` 95% membuka tiga track N5; `splitQuota()` mendahulukan kana lalu membagi proporsional dengan **jaminan 1 slot per track** (662:79:49 pada kuota 8 membuat grammar nol selama berminggu-minggu); N5 baru dihitung ke `remainingNew` setelah gerbang terbuka |
| **Wajah kartu** | `cardFaces()` — recall kosakata bertanya dari ARTI (bertanya dari bacaan = transliterasi, bukan recall); kanji menjawab dengan 訓/音; grammar membawa rumus bentukan; kata kana-murni menjawab dengan artinya |
| **Listening** | `src/lib/tts.ts` — voice ja-JP perangkat, deteksi async (`getVoices()` kosong sampai `voiceschanged`). Kartu listening **tak pernah dibuat** di perangkat tanpa voice, dan yang due dari perangkat lain **ditahan**, bukan ditampilkan bisu. Kartu berbunyi sendiri saat tampil; tak ada teks Jepang sebelum reveal |
| **Catch-up** | `catchUpOptions()` akhirnya dipakai: saat tertinggal atau pace melewati 2× baseline, Hari Ini menawarkan dua jalan setara berikut angkanya, dalam oker — bukan shu |

**Bukti verifikasi:**

- 160 test lolos, `tsc` bersih, `next build` (static export) sukses
- Akun sintetis 208 kana kuat → gerbang terbuka → sesi **20 kartu = 5 kosakata × 3 mode + 2 kanji × 2 + 1 grammar**, urutan recognition → recall → listening; buka sesi kedua kali = nihil (jatah tak ganda). Akun dihapus, DB terverifikasi kembali ke 2 user nyata
- Listening diuji dengan stub `speechSynthesis` yang merekam ucapan: auto-ucap tepat 1×/kartu, Putar lagi menambah 1, nol teks Jepang pra-reveal
- Catch-up terverifikasi di akun pemilik yang memang tertinggal 8 kartu

**Yang belum terverifikasi, dan tidak disembunyikan:** bunyi TTS sesungguhnya
belum pernah didengar — butuh HP, bukan rig uji. Juga font: subset ~290 glyph
tidak mencakup kosakata/kanji N5, jadi teks kartu N5 sementara memakai font
Jepang bawaan perangkat.

### 8.2 Yang berubah di Fase 1 (Android)

- Build Android sepenuhnya jalan di Windows/Linux — butuh JDK + Android SDK, **tidak butuh Mac**
- Play Store minta format AAB, bukan APK
- Terbuka: push notification asli lewat FCM — pendamping nudge WhatsApp Fonnte, bukan penggantinya
- Storage adapter ditukar ke Capacitor Preferences (§4.4)

### 8.3 Yang berubah di Fase 2 (iOS)

Xcode hanya jalan di macOS, dan VS Code tidak mengubah itu — tidak ada extension yang menghilangkan syarat tersebut. Yang bisa dilakukan: memindahkan langkah build ke cloud CI.

| Layanan | Catatan |
|---|---|
| **Codemagic** | Free tier 500 menit M2/bulan, lalu $0,095/menit. Signing & upload TestFlight otomatis. Paling pas untuk volume kecil |
| GitHub Actions | Runner macOS $0,062/menit, tapi signing, rotasi sertifikat, IPA, upload TestFlight di-wire sendiri |
| ~~Ionic Appflow~~ | Tutup 31 Desember 2027 — banyak tutorial lama masih menyarankan ini |

Batasannya: CI bagus untuk memproduksi build, tapi tidak bisa menggantikan Mac untuk debugging interaktif (iOS Simulator, attach debugger ke device fisik).

---

## 9. Infrastruktur & biaya

| Fase | Item | Biaya |
|---|---|---|
| 0 | Vercel Hobby + Supabase Free | **Rp 0** |
| 1 | Google Play Console | **$25 sekali** |
| 2 | Apple Developer Program | **$99/tahun** |
| 2 | Codemagic | Rp 0 di free tier |

### 9.1 Supabase free tier

Batasnya: 500 MB database, 1 GB file storage, 5 GB egress, 50.000 MAU, 500.000 invokasi Edge Function, maks 2 project aktif. Untuk basis pengguna awal yang kecil tidak akan tersentuh — dataset kita ~320 KB dan tabel `reviews` segelintir user setahun hanya ratusan ribu baris kecil. Batas ini baru perlu ditinjau ulang menjelang rilis publik (§9.3).

Yang perlu diwaspadai cuma **auto-pause setelah 7 hari tanpa aktivitas database** — project offline sampai di-resume manual dari dashboard.

Untuk app ini risikonya hampir tidak relevan: kalau 7 hari berturut-turut tidak ada satu pun yang review, artinya app sudah ditinggalkan — persis kegagalan yang diukur kriteria sukses §1.4 #1. Pause-nya jadi alarm jujur, bukan bug. Yang perlu diantisipasi hanya kasus wajar seperti liburan bareng seminggu.

### 9.2 Play Console: personal vs organization

**Keputusan yang harus diambil saat registrasi, bukan saat mau rilis.**

Akun developer personal yang dibuat setelah 13 November 2023 harus menjalankan closed test dengan **minimal 12 tester opt-in selama 14 hari berturut-turut** sebelum bisa mengajukan production access. Angkanya turun dari 20 ke 12 pada Desember 2024. Dan 14 hari itu harus tidak terputus — kalau jumlah tester turun di bawah 12 kapan pun, hitungannya balik dari nol.

Dua hal yang meringankan:

1. **Internal Testing track tidak kena aturan ini.** Untuk segelintir user awal di Fase 1, sama sekali bukan masalah
2. **Akun organization dikecualikan.** Kalau ada badan usaha terdaftar yang bisa dipakai (Japan Arena?), daftar sebagai organization sejak awal

Tipe akun ditentukan sekali saat registrasi dan repot diubah belakangan. Menunda keputusan ini sampai Fase 3 berarti terjebak mencari 12 tester asli persis saat mau rilis.

### 9.3 Kebutuhan go-public yang BELUM dikerjakan

Daftar prasyarat rilis publik yang sudah teridentifikasi tapi belum disentuh — supaya tidak baru ketahuan saat submit ke store:

- **Rate-limit + proteksi bot** di jalur pendaftaran — begitu kode undangan dilepas, `redeem-invite` jadi endpoint publik yang tiap panggilannya mengirim email
- **Tabel konten di DB** — dataset kini berupa JSON bundel (dynamic import), yang justru membuatnya jalan offline sejak kunjungan pertama. `items`/`item_examples` (§5.6) tetap ditahan sampai schema N3 Japan Arena terlihat (§11.1)
- **Privacy policy URL** — wajib untuk store listing di kedua store
- **Tipe akun Play Console** — personal vs organization (§9.2), masih terbuka (§11)
- **i18n bahasa kedua** — infrastrukturnya siap (file sibling `satisfies Dictionary`, hanya `src/lib/i18n/index.ts` yang berubah), tapi kamusnya belum ditulis
- **Native shell Capacitor** — Fase 1/2 (§8.2, §8.3); storage adapter sudah dipisah sejak sekarang (§4.4)

**Lunas 6 Agustus 2026 (pasca-Sprint 2, penutupan lubang):**

- ~~**Font untuk dataset**~~ — ✅ subsetting pindah lokal (HarfBuzz via `subset-font`; mekanisme `text=` mentok struktural di >1.000 glyph dan diam-diam menjawab keluarga penuh — tertangkap asersi). Gothic memuat 1.057 glyph termasuk contoh kalimat; mincho/mono cukup set UI (364). Total 469 KB — di bawah anggaran lama. Dibuktikan `document.fonts.check` di produksi
- ~~**Jebakan toggle kanji writing**~~ — ✅ toggle dinonaktifkan + `modesForItem` mengabaikan pref sampai Sprint 3; nol kartu liar di produksi
- ~~**Hari "4 / 0"**~~ — ✅ `quota_target` kini revisi-naik + klem tampilan

**Lunas 6 Agustus 2026 (Sprint 2):**

- ~~**Dataset N5**~~ — ✅ 662 kosakata · 79 kanji · 49 grammar di `src/data/`, dibangun `npm run jlpt`, atribusi lengkap (§7). Peta lengkap N5→N1: `docs/PETA-MATERI.md`
- ~~**Mode listening**~~ — ✅ kolom keempat §6.3 hidup: `src/lib/tts.ts`, kartu hanya dibuat di perangkat yang bisa memainkannya. ⚠️ bunyi nyatanya belum didengar di HP

**Lunas 6 Agustus 2026 (Sprint 1):**

- ~~**Subset font Jepang**~~ — ✅ di-subset lewat `scripts/subset-fonts.mjs` (Google Fonts CSS API `text=`), hasilnya di-commit di `public/fonts/`: **6 berkas, 138 KB**, turun dari 865 berkas / 13,2 MB. `next/font/google` dihapus dari layout, diganti `@font-face` sungguhan di `globals.css`. Ini sekaligus perbaikan bug, bukan sekadar optimasi: `--font-gothic` menamai family literal sementara `next/font` mendaftarkan nama ber-hash, jadi tidak ada yang cocok — seluruh app selama berminggu-minggu dirender dengan system-ui dan 13,2 MB font itu diunduh serta di-precache untuk menggambar nol karakter. Dijaga `npm run fonts` + `npm run verify:fonts`
- ~~**Ikon PNG 192/512**~~ — ✅ `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, dan `apple-touch-icon.png` di-commit, dihasilkan `npm run icons` (`scripts/render-icons.mjs`). Manifest memuat entri `any` dan `maskable` **terpisah**: menyatakan satu ikon sebagai `"any maskable"` memberi tahu Android bahwa gambar itu boleh dipotong bulat *sekaligus* dipakai apa adanya di tempat lain — hasilnya menyusut berpadding di tempat yang tidak memotong. "Add to Home Screen" sudah diuji, 10 syarat installable terpenuhi

---

## 10. Risiko

| Risiko | Mitigasi |
|---|---|
| User berhenti pakai di minggu 3 | Kuota realistis dari awal > ambisius lalu menyerah. Layar progress sendiri membuat drop-off terlihat cepat |
| Pendaftaran dibuka publik tanpa proteksi → bot membakar kuota email + tabel undangan di-probe | Jangan buka publik sebelum rate-limit + proteksi bot terpasang (§9.3); sementara itu kode undangan tetap satu-satunya pintu |
| Store menolak karena kelengkapan listing (privacy policy URL, data safety) | Checklist §9.3 dikerjakan sebelum submit, bukan saat submit — ikon dan installability sudah lunas 6 Agustus 2026 |
| Writing memakan waktu materi ujian | Toggle per-user; kanji writing default off kecuali dinyalakan |
| Grammar N5 hanya 49 poin (target ~80) | Cukup untuk Sprint 2. Lengkapi sambil jalan |
| Web Speech API voice Jepang jelek/absen di sebagian device | Deteksi voice saat load; kalau tidak ada, sembunyikan mode listening dan tandai untuk upgrade VOICEVOX |
| Static export membuat ada kebutuhan server yang terlewat | Sudah dipetakan: semua server-side → Supabase Edge Functions |
| Schema N3 ternyata tidak cocok | Tabel konten belum dikunci — sengaja, sampai schema-nya dilihat |
| Ter-logout tak terduga di native | Storage adapter sudah dipisah sejak Fase 0 (§4.4) |
| Terjebak syarat 12 tester saat mau rilis publik | Putuskan tipe akun Play Console di awal Fase 1 (§9.2) |

---

## 11. Keputusan terbuka

1. **Schema database N3 Japan Arena** — 🔴 blocking untuk migrasi tabel konten (§5.6). Semua hal lain sudah bisa jalan
2. ~~**Nama aplikasi**~~ — ✅ **Masume (升目)**, diputuskan 5 Agustus 2026. Dipilih karena menamai primitif inti app ini: tiap layar dibangun dari petak yang sama. "Goukaku" ditinggalkan karena 合格 adalah kata generik di dunia bimbel Jepang — setara menamai app ini "Lulus Ujian", jadi tak bisa dicari dan tak bisa dimiliki.
3. **Tipe akun Google Play Console** — personal atau organization (§9.2). Keputusan Fase 1, tapi diambil sekali dan sulit diubah
4. **Tanggal ujian masing-masing** — diisi saat onboarding, bukan keputusan sekarang

---

## 12. File terkait

| File | Isi |
|---|---|
| `supabase/migrations/0001–0007` | Rantai migrasi ter-apply: 0001 auth + state user · 0002 lockdown execute function · 0003 pisah policy tulis dari SELECT · 0004 invites (deny-all) · 0005 generalisasi (hapus households + progress_summary, RLS own-only, `claim_invite → boolean`) · 0006 kunci `rls_auto_enable` · 0007 `goals.baseline_new_per_day` + RPC `set_active_goal`. **Aturan anti-drift: tulis file di repo dulu, baru apply** |
| `src/lib/session.ts` · `progress.ts` · `day.ts` · `exam-dates.ts` | Logika murni Sprint 1 — antrean sesi, keadaan hari, tanggal lokal per timezone, kalender JLPT. Semuanya bertest di `src/lib/__tests__/` |
| `scripts/subset-fonts.mjs` · `render-icons.mjs` | `npm run fonts` / `npm run icons` — hasilnya di-commit di `public/`, diverifikasi `npm run verify:fonts` |
| `supabase/functions/` | Source of truth Edge Functions (`redeem-invite`, `delete-account`) — deploy hanya dari file ini, tidak pernah langsung ke dashboard |
| `supabase-client.ts` | Client Supabase dengan storage adapter yang bisa ditukar, plus auth helper |
| `kana.json` · `vocab_n5.json` · `kanji_n5.json` · `grammar_n5.json` | Dataset Fase 0 |
| `PROMPT-CLAUDE-DESIGN.md` | Brief desain UI — dokumen terpisah, dipakai di Claude Design |
