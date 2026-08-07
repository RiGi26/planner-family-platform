# Brief 01 — Glosa Bahasa Indonesia

**Status: FINAL — siap dikerjakan.**
Sasaran: `src/data/vocab_n5.json`, `kanji_n5.json`, `grammar_n5.json` — 810 item.
Menyentuh juga: `kana.json` (208 item, hanya perubahan bentuk, bukan terjemahan).
Memblokir: Brief 02 (penyaringan kalimat) dan Brief 03 (untai kelancaran).

---

## 1. Kenapa ini didahulukan

661 dari 682 kosakata punya glosa berbahasa Inggris (`あさって` → "day after
tomorrow"). UI, unit, dan dialog semuanya bahasa Indonesia. Pemula total dipaksa
lewat dua bahasa asing sekaligus.

Tiga hal tersandera:

- kartu pelajaran tidak bisa menampilkan arti yang benar-benar dipahami
- kartu Kilat (pilihan ganda) butuh glosa **unik** — sekarang 96 item bentrok
- penyaringan kalimat butuh glosa yang bisa dibaca reviewer manusia

---

## 2. Perubahan skema

### 2.1 Bentuk

```jsonc
{
  "id": "vocab-n5-あさって",
  "expression": "あさって",
  "meanings": {
    "en": ["day after tomorrow"],   // sumber CC BY-SA — TIDAK BOLEH DIUBAH
    "id": ["lusa"]                  // yang ditampilkan
  },
  "data": {
    "gloss_reviewed": false,
    "gloss_note_id": null
  }
}
```

Bentuk bersarang dipilih, bukan `meanings_id`, karena item sudah punya field `id`
sendiri — `meanings_id` di objek yang sama terbaca sebagai "ID dari meanings".
`item.meanings.id` versus `item.id` tidak ambigu di titik pemakaian.

Array `en` adalah data sumber dari OpenJLPT (CC BY-SA 4.0). Dipertahankan utuh
demi jejak provenance dan supaya update dari hulu tetap mungkin.

### 2.2 Kana dikecualikan

208 item kana punya `meanings` berisi **romaji**, bukan bahasa Inggris
(`あ` → `["a"]`, `ぢ` → `["ji", "di"]`). Romaji bukan glosa bahasa.

Perlakuan: skrip migrasi menyalin nilainya ke `en` dan `id` sama persis.
Validator **wajib melewati** `type === 'kana'` untuk seluruh aturan §3 dan §4 —
kalau tidak, 208 item akan gagal aturan "glosa identik dengan sumber".

### 2.3 Tidak ada migrasi IndexedDB

`items` bukan tabel Dexie. Semuanya JSON statis yang di-*dynamic import*
(`items.ts` baris 82–90, 121). Dexie hanya memegang `card_states`, `reviews`,
`progress` — tak satu pun menyimpan glosa. Jadi perubahan ini murni build-time.

### 2.4 Berkas yang tersentuh — 12 pemakaian, 6 berkas

| Berkas | Baris | Kerja |
|---|---|---|
| `src/lib/items.ts` | 23 | ubah tipe `Item.meanings`, tambah helper `glossOf()` |
| `src/lib/session.ts` | 401, 408, 445, 460, 505 | lewat helper |
| `src/components/writing-practice.tsx` | 152 | lewat helper |
| `src/app/menulis/page.tsx` | 172 | lewat helper |
| `scripts/fetch-jlpt.mjs` | 178, 206, **234**, 254 | tulis bentuk baru + cek `en` tak kosong |
| `scripts/generate-kana.mjs` | 184 | cek panjang `meanings.en` |

Baris 234 (`meanings: [g.meaning]`, konstruksi item grammar) terlewat di susunan
awal tabel ini. Tanpanya 49 item grammar keluar dari generator dalam bentuk lama
sementara vocab dan kanji sudah bentuk baru — dan karena `data` bertipe longgar,
tidak ada satu pun error tipe yang akan mengatakannya.

**Baris 158 sengaja TIDAK diubah.** Baris itu ada di dalam penggabungan berkas
suplemen (`vocabByWord.set(...)`), yang menyusun baris antara berbentuk sumber —
`{ word, reading, meanings, examples, source }` — supaya seragam dengan baris dari
OpenJLPT sebelum keduanya masuk ke satu `.map()`. Bentuknya berubah sekali saja,
di batas tempat baris sumber menjadi item (178). Membungkusnya lebih awal berarti
dua bentuk berbeda hidup berdampingan di satu pipeline, dan setiap pembaca
berikutnya harus tahu baris mana sudah dibungkus dan mana belum.

Helper tunggal, jangan percabangan di tiap komponen:

```ts
export function glossOf(item: Item, locale: 'id' | 'en' = 'id'): string[] {
  const m = item.meanings
  return m[locale]?.length ? m[locale] : m.en
}
```

Fallback-nya searah. `glossOf(item, 'en')` pada item tanpa `en` mengembalikan
array kosong, bukan `id` — dan itu memang benar, karena `en` adalah data sumber
yang `fetch-jlpt.mjs` tolak untuk ditulis kalau kosong, jadi tidak ada apa pun
untuk dijadikan cadangan.

### 2.5 fetch-jlpt.mjs wajib mempertahankan glosa

`fetch-jlpt.mjs` membangun ulang `vocab_n5.json`, `kanji_n5.json` dan
`grammar_n5.json` **secara utuh** dari sumber. Sumbernya tidak pernah punya
bahasa Indonesia. Jadi begitu Commit 4 mulai mengisi `meanings.id`, satu
`npm run jlpt` — perintah yang wajar dijalankan siapa pun yang ingin menyegarkan
data — akan menghapus seluruh 810 glosa tanpa satu baris peringatan.

Pembagian kepemilikannya:

| Field | Pemilik | Saat refetch |
|---|---|---|
| `meanings.en` | OpenJLPT (CC BY-SA) | ditimpa dari sumber |
| `meanings.id` | kita | **dipertahankan** |
| `data.gloss_reviewed` | kita | **dipertahankan** |
| `data.gloss_note_id` | kita | **dipertahankan** |

`gloss_reviewed` yang paling berbahaya kalau hilang, dan justru paling tidak
kelihatan. Tidak ada apa pun yang menulisnya kembali: `gloss-id.mjs` melewati
item yang `meanings.id`-nya sudah terisi (§5, idempoten), jadi item yang statusnya
ter-reset ke `false` tidak akan pernah disentuh generator lagi. Glosanya sendiri
masih ada dan terbaca benar di layar — yang berubah cuma satu boolean, dan
akibatnya gerbang rilis di §7 diam-diam bergeser menjauh. Kehilangan teks
setidaknya terlihat; kehilangan status tidak.

Karena itu `data.gloss_reviewed` dan `data.gloss_note_id` disemai oleh skrip
migrasi Commit 1, bukan oleh generator: preservasi tidak bisa mempertahankan
field yang belum ada.

Yang menjaganya: `src/lib/__tests__/dataset.test.ts` menyapu seluruh dataset yang
dikirim dan gagal kalau ada item non-kana yang kehilangan kedua field itu, atau
kalau ada muka kartu yang berteks kosong. Tes itu berjalan atas berkas nyata,
bukan fixture — satu-satunya cara menangkap regenerator yang menjatuhkan field.

Batasnya jujur disebut: tes itu menangkap field yang **hilang**, bukan status
yang **ter-reset dari `true` ke `false`** — keduanya sama-sama `boolean` yang sah.
Yang menangkap itu adalah `verify:gloss` (§6) begitu glosa mulai terisi.

Kana dikecualikan dari kedua field (§2.2): romaji bukan terjemahan, jadi tidak ada
yang bisa disetujui penutur asli, dan `gloss_reviewed: false` yang tidak mungkin
jujur menjadi `true` hanya akan menaruh 208 kegagalan permanen di depan gerbang
rilis §7.

---

## 3. Panduan gaya glosa

### 3.1 Aturan umum

- Huruf kecil semua, kecuali nama diri
- Maksimal **3 elemen** dalam array `id`
- Makna berbeda → elemen array terpisah. Sinonim dekat → satu elemen, dipisah koma
- Elemen pertama = arti yang dipakai di unit tempat item itu muncul; sisanya
  urutan frekuensi
- Tanpa titik di akhir
- Kurung untuk pembeda singkat (`itu (jauh)`), bukan untuk penjelasan
- Penjelasan panjang → `gloss_note_id`, bukan glosa

### 3.2 Kata benda

Kata benda telanjang. Tanpa "sebuah", tanpa "yang".

| Ekspresi | en | id |
|---|---|---|
| 学生 | student | mahasiswa |
| 先生 | teacher | guru |
| お風呂 | bath | kamar mandi |

Bahasa Inggris sering lebih kabur dari yang dibutuhkan — `student` bisa 学生
(mahasiswa) atau 生徒 (murid sekolah). Bahasa Indonesia memaksa pilihan.
Manfaatkan, jangan tiru kekaburannya.

### 3.3 Kata kerja — transitif vs intransitif

Kata kerja telanjang, **tanpa "untuk"**. `to eat` → `makan`.

Yang terpenting: pasangan 他動詞/自動詞 dapat glosa Inggris yang identik, padahal
itu salah satu jebakan terbesar bahasa Jepang. Bahasa Indonesia memisahkannya
gratis.

| Jenis | Ekspresi | en | id |
|---|---|---|---|
| 他動詞 | 開けます | to open | membuka |
| 自動詞 | 開きます | to open | terbuka |
| 他動詞 | 出します | to take out | mengeluarkan |
| 自動詞 | 出ます | to go out | keluar |
| 他動詞 | 入れます | to put in | memasukkan |
| 自動詞 | 入ります | to enter | masuk |

Aturan: transitif pakai awalan **me-/mem-/meng-**, intransitif pakai bentuk dasar
atau **ter-/ber-**.

**Datanya sudah ada.** `data.pos` memuat tag `vt` (68 item) dan `vi` (64 item)
dari JMdict. Tidak perlu turunan baru — validator bisa langsung membacanya.

### 3.4 Kata sifat

Telanjang. Pembedaan い/な hidup di `data`, bukan di glosa.

| Ekspresi | id |
|---|---|
| 高い | `["tinggi", "mahal"]` — dua makna, dua elemen |
| 大きい | `["besar"]` |
| 静か | `["tenang, sepi"]` — sinonim dekat, satu elemen |

### 3.5 Deiksis こ・そ・あ・ど

Jepang punya **tiga** tingkat jarak, Inggris dua — itu sebab `あそこ / あっち /
そちら / そっち / 向こう` semuanya jadi "over there". Bahasa Indonesia untuk
**tempat** punya tiga: **sini / situ / sana**.

Kata tempat — selesai tanpa kurung sama sekali:

| Ekspresi | en | id |
|---|---|---|
| ここ | here | di sini |
| そこ | there | di situ |
| あそこ | over there | di sana |
| こちら | this way | sebelah sini |
| そちら | over there | sebelah situ |
| あちら | over there | sebelah sana |
| こっち / そっち / あっち | — | sini / situ / sana (akrab) |
| 向こう | over there | seberang sana |

Kata benda & penunjuk — butuh kurung, karena untuk benda Indonesia hanya punya
dua tingkat:

| Ekspresi | id |
|---|---|
| これ / この | ini |
| それ / その | itu (dekat lawan bicara) |
| あれ / あの | itu (jauh dari kita berdua) |

Sisa kelompok bentrok lainnya:

| Kelompok | id |
|---|---|
| ある / 居る | ada (benda) / ada (orang, hewan) |
| はい / ええ | ya / ya (lebih santai) |
| どう / いかが | bagaimana / bagaimana (sopan) |
| お風呂 / ふろ | kamar mandi / kamar mandi (santai) |

### 3.6 Penggolong (助数詞)

Inggris menjelaskan penggolong dengan satu klausa. Bahasa Indonesia punya sistem
penggolong sendiri — satu kata cukup, dan konsepnya sudah dikuasai pemelajar
sejak kecil.

| Ekspresi | en | id |
|---|---|---|
| 〜人 | counter for people | orang |
| 〜本 | counter for long cylindrical objects | batang |
| 〜枚 | counter for flat objects | lembar |
| 〜匹 | counter for small animals | ekor |
| 〜冊 | counter for books | jilid |
| 〜台 | counter for machines/vehicles | unit |
| 〜個 | counter for small objects | buah |

Validator: item ber-`pos` penggolong/suffix → `meanings.id` harus **satu elemen,
satu kata, tanpa kurung**.

### 3.7 Ungkapan tetap

Terjemahkan **fungsinya**. Makna harfiah yang mengajarkan sesuatu masuk ke
`gloss_note_id`.

| Ekspresi | meanings.id | gloss_note_id |
|---|---|---|
| はじめまして | salam kenal | dipakai hanya saat pertama kali bertemu |
| よろしくお願いします | mohon bantuannya | ditutup dengan membungkuk sedikit |
| いただきます | selamat makan | harfiah: "saya menerima" |
| すみません | permisi, maaf | juga dipakai untuk memanggil pelayan |
| いってきます | saya pergi dulu | dijawab いってらっしゃい |

### 3.8 Kanji

Glosa kanji itu **pegangan ingatan, bukan definisi.** Satu sampai dua kata.
On/kun-yomi punya tempatnya sendiri.

| Kanji | en | id |
|---|---|---|
| 人 | person | orang |
| 上 | above, up, over | atas |
| 生 | life, birth, genuine | hidup |

Jangan salin seluruh daftar KANJIDIC. Ambil yang dipakai di kosakata N5.

### 3.9 Grammar

49 item, dan glosanya yang paling buruk sekarang (`〜が` → "but; however").
Aturan: **jelaskan apa yang dia LAKUKAN, bukan namanya.**

| Pola | Jangan | Pakai |
|---|---|---|
| 〜は | topic marker | menandai hal yang sedang dibicarakan |
| 〜を | direct object particle | menandai yang dikenai perbuatan |
| 〜が (konjungsi) | but; however | menyambung dua kalimat yang berlawanan |
| 〜ませんか | negative question | mengajak melakukan sesuatu |

Istilah linguistik boleh muncul di `gloss_note_id`, tidak di glosa utama.

### 3.10 Larangan

- ❌ "untuk makan" → ✅ "makan"
- ❌ "sebuah buku" → ✅ "buku"
- ❌ "yang tinggi" → ✅ "tinggi"
- ❌ serapan Inggris kalau ada padanan ("kalkulasi" → "hitungan")
  — **kecuali** kata pinjaman Jepang yang memang serapan:
  カメラ → "kamera", テレビ → "televisi", パン → "roti"
- ❌ menyalin kekaburan Inggris saat Indonesia bisa tegas
- ❌ glosa lebih dari 40 karakter

---

## 4. Aturan keunikan

**Temuan:** 96 item dalam 45 kelompok punya elemen pertama identik. Itu membuat
kartu Kilat mustahil dijawab (dua pilihan sama-sama benar) dan kartu recall
ambigu.

Dari yang wajib ke yang diusahakan:

1. **WAJIB** — `meanings.id[0]` unik di antara semua item dalam unit yang sama
2. **WAJIB** — unik di antara item yang bisa saling jadi pengecoh: sesama `type`
   dan sesama kelas kata
3. **DIUSAHAKAN** — unik global. Kalau tidak bisa, bedakan dengan kurung
   (`ya` / `ya (lebih santai)`), bukan dengan memaksa sinonim yang janggal

---

## 5. Pipeline — `scripts/gloss-id.mjs`

```
├─ baca vocab_n5.json / kanji_n5.json / grammar_n5.json
├─ lewati item yang meanings.id-nya sudah terisi  (idempoten)
├─ batch per 25 item, kirim bersama:
│     • seluruh §3 sebagai system prompt
│     • expression, reading, meanings.en, pos, verb_group
│     • nomor + judul unit item itu  (konteks makna)
│     • daftar meanings.id yang sudah dipakai di unit itu  (untuk §4)
├─ tulis balik meanings.id + gloss_reviewed: false
└─ tulis scripts/data/gloss-audit.json — en/id berdampingan, dikelompokkan per unit
```

Batch 25 supaya konteks unit muat dan kegagalan satu batch tidak merusak seluruh
berkas. Idempoten supaya bisa dijalankan bertahap sambil review berjalan.

Urutan pengerjaan: **unit 0–5 dulu**, lalu 6–25, lalu 304 kosakata yang belum
terpetakan ke unit mana pun.

---

## 6. Validator — `npm run verify:gloss`

`type === 'kana'` dilewati seluruhnya (lihat §2.2).

**Gagal — harus diperbaiki sebelum commit:**

- [ ] setiap item punya `meanings.id` tidak kosong
- [ ] `meanings.id[0]` unik dalam satu unit (§4.1)
- [ ] `meanings.id[0]` unik antar item sejenis (§4.2)
- [ ] tidak ada `meanings.id` identik dengan `meanings.en` (tanda belum diterjemahkan)
- [ ] tidak ada glosa diawali `untuk `
- [ ] tidak ada glosa > 40 karakter
- [ ] item penggolong: satu elemen, satu kata, tanpa kurung
- [ ] maksimal 3 elemen array
- [ ] tidak ada titik di akhir
- [ ] `meanings.en` tidak berubah dari commit sebelumnya (jaga data sumber)

**Peringatan — boleh lolos, dicatat:**

- [ ] glosa memuat kata Inggris umum (cocokkan lawan daftar) — menangkap
      "counter for", "to be", sisa terjemahan
- [ ] pasangan `vt`/`vi` dengan ekspresi berakar sama tapi glosanya tidak berbeda awalan
- [ ] glosa identik secara global (§4.3)
- [ ] `gloss_note_id` > 80 karakter

---

## 7. Alur review manusia

Ikut pola `reviewed` yang sudah ada di unit — jangan bikin mekanisme kedua.

- `gloss_reviewed: false` sampai dibaca manusia yang paham Jepang **dan** Indonesia
- Aplikasi menampilkan label jujur per item sampai itu terjadi, sama seperti label
  unit sekarang
- Gerbang rilis store: seluruh item unit 0–25 `gloss_reviewed: true`
- Reviewer dikasih `gloss-audit.json` berdampingan en/id per unit, bukan JSON mentah

---

## 8. Urutan kerja

Kerjakan berurutan. **Jangan gabung jadi satu commit.**

**Commit 1 — skema**
Ubah tipe `Item`, tambah `glossOf()`, perbarui 11 pemakaian di §2.4, tulis skrip
migrasi yang membungkus array lama jadi `{ en: [...], id: [] }` (kana: salin ke
dua-duanya). `tsc` hijau, aplikasi jalan seperti semula dengan glosa Inggris.

**Commit 2 — validator**
`verify:gloss` lengkap sesuai §6, **sebelum** generator ditulis. Terbalik berarti
810 glosa dihasilkan dulu baru ketahuan separuhnya melanggar §4 — memperbaikinya
setelah jadi jauh lebih mahal daripada mencegahnya.

**Commit 3 — generator**
`gloss-id.mjs` sesuai §5. Belum dijalankan.

**Commit 4 — jalankan unit 0–5, lalu BERHENTI**
Sekitar 80 item. Baca hasilnya sendiri sebelum lanjut. Di titik ini ketahuan
apakah §3 sudah cukup jelas untuk model atau perlu contoh tambahan. Kalibrasi di
80 item jauh lebih murah daripada di 810.

### Yang tidak boleh disentuh

- `meanings.en` — data sumber CC BY-SA, tidak boleh diubah satu karakter pun
- Komponen di luar 6 berkas §2.4 — perubahan tampilan cukup lewat `glossOf()`
- `units_n5.json`, `verify-units.mjs`, mesin FSRS — semuanya di luar lingkup
- Jangan sekalian merapikan hal yang tidak diminta

---

## Lampiran — angka acuan

| | Jumlah |
|---|---|
| Kosakata | 682 (378 terpetakan ke unit, 304 belum) |
| Kanji | 79 |
| Grammar | 49 |
| **Total butuh glosa** | **810** |
| Kana (bentuk saja, tanpa terjemahan) | 208 |
| Item dengan elemen pertama bentrok | 96 dalam 45 kelompok |
| Rata-rata arti per kosakata | 1,2 (maks 3) |
| Tag `vt` / `vi` tersedia | 68 / 64 |
| Pemakaian `.meanings` di kode | 12, di 6 berkas (§2.4 — naik satu setelah baris 234 ketemu) |
| Contoh kalimat (lingkup Brief 02) | 1.276 |
