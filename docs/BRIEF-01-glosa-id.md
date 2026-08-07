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

### 2.5 `scripts/lib/gloss-rules.mjs` — satu sumber klasifikasi

Aturan yang bisa dinilai mesin — kelas kata (§4.2), deteksi penggolong (§3.6),
dan aturan bentuk per-glosa (§3.1, §3.10) — hidup di satu modul yang dipakai
**generator dan validator**:

| Berkas | Perannya |
|---|---|
| `scripts/lib/gloss-rules.mjs` | aturan: `wordClass`, `peerKey`, `isCounter`, `ATURAN_BENTUK`, `cekPenggolong`, `KELAS_PAKSA` |
| `scripts/lib/gloss-data.mjs` | dataset, irisan §3, penyusunan batch, konteks §4, pemeriksaan |
| `scripts/gloss-siapkan.mjs` · `gloss-terapkan.mjs` | generator (§5) |
| `scripts/verify-gloss.mjs` | validator (§6) |

**Dua salinan berbahaya, dan diam-diam.** Kalau generator mengelompokkan item
dengan satu definisi kelas kata dan validator memeriksanya dengan definisi lain,
keunikan §4.2 terpenuhi di pengelompokan yang satu dan gagal di yang lain. Tidak
ada yang error, tidak ada yang berbeda saat dibaca — glosanya cuma mulai
bertabrakan di tempat yang tak seorang pun periksa. Dan karena §4.2 baru bisa
dilanggar setelah cukup banyak item berglosa, penyimpangan itu baru muncul jauh di
belakang, ketika 810 item sudah ditulis dan memperbaikinya berarti memilih ulang
kata untuk sebagian besar dari mereka.

Penjelasan gaya — apa yang membuat sebuah kata *bagus* — tetap di §3 dokumen ini,
bukan di kode. Prosa tidak bisa dieksekusi, dan aturan yang bisa dieksekusi tidak
perlu dua kali ditulis.

**`KELAS_PAKSA` — koreksi kelas kata, di modul aturan, bukan di dataset.**
`pos` datang dari hulu dan kadang salah menaruh item ke ember §4.2. Contoh nyata
dari kalibrasi batch 1: この bertanda `["num"]` sehingga masuk `vocab/numeralia`
sendirian, padahal その dan あの (`adj-pn`) duduk berdua di `vocab/adjektiva`.
Ketiganya satu paradigma 連体詞 dan justru satu sama lain pengecoh yang paling
mungkin — keunikan yang melewatkan tepat item paling rawan bentrok itu keunikan
yang cuma namanya.

Perbaikannya **tidak boleh** dengan menyunting `pos` di `src/data/*.json`: §2.6
menjelaskan `fetch-jlpt.mjs` membangun ulang berkas-berkas itu utuh dari sumber, dan
tidak ada preservasi untuk `pos` seperti yang ada untuk `meanings.id`. Suntingan
dataset akan hidup sampai `npm run jlpt` berikutnya lalu diam-diam kembali salah.
Koreksi yang hidup di `KELAS_PAKSA` selamat dari tiap refetch, dan terbaca di satu
tempat alih-alih terkubur di berkas 682 item.

### 2.6 fetch-jlpt.mjs wajib mempertahankan glosa

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
kelihatan. Tidak ada apa pun yang menulisnya kembali: `gloss:siapkan` melewati
item yang `meanings.id`-nya sudah terisi (§5, idempoten), jadi item yang statusnya
ter-reset ke `false` tidak akan pernah disentuh generator lagi. Glosanya sendiri
masih ada dan terbaca benar di layar — yang berubah cuma satu boolean, dan
akibatnya gerbang rilis di §7 diam-diam bergeser menjauh. Kehilangan teks
setidaknya terlihat; kehilangan status tidak.

Karena itu `data.gloss_reviewed` dan `data.gloss_note_id` disemai oleh skrip
migrasi Commit 1, bukan oleh generator: preservasi tidak bisa mempertahankan
field yang belum ada.

Yang menjaganya ada dua, dan keduanya diperlukan karena masing-masing buta
terhadap separuh masalahnya:

**`src/lib/__tests__/dataset.test.ts`** menyapu seluruh dataset yang dikirim dan
gagal kalau ada item non-kana yang **kehilangan** kedua field itu, atau kalau ada
muka kartu yang berteks kosong. Tes itu berjalan atas berkas nyata, bukan fixture
— satu-satunya cara menangkap regenerator yang menjatuhkan field.

Batasnya: tes itu **tidak bisa** menangkap status yang **ter-reset dari `true` ke
`false`**. Field-nya masih ada, isinya `boolean` yang sah, glosanya masih terbaca
benar di layar, dan tidak ada nilai "seharusnya" yang bisa dibandingkan dari dalam
satu snapshot. Preservasi yang rusak SEBAGIAN — `meanings.id` selamat tapi
`gloss_reviewed` tidak — lolos tanpa jejak.

**Aturan GAGAL nomor 11 di §6** yang menutup lubang itu: `gloss_reviewed` tidak
boleh mundur dari `true` ke `false` dibanding commit sebelumnya. Ia melihat dua
titik waktu, yang justru hal yang tidak bisa dilakukan tes snapshot, dan ia adalah
cermin persis dari aturan "`meanings.en` tidak berubah" yang menjaga data sumber
dari arah sebaliknya.

Kana dikecualikan dari kedua field (§2.2): romaji bukan terjemahan, jadi tidak ada
yang bisa disetujui penutur asli, dan `gloss_reviewed: false` yang tidak mungkin
jujur menjadi `true` hanya akan menaruh 208 kegagalan permanen di depan gerbang
rilis §7.

---

## 3. Panduan gaya glosa

### 3.1 Aturan umum

- Huruf kecil semua, kecuali nama diri **dan kata yang ejaan bakunya memang
  berhuruf besar** — "Anda" selalu kapital dalam bahasa Indonesia meski ia bukan
  nama diri, dan menurunkannya jadi "anda" melanggar ejaan demi aturan yang tidak
  pernah tentang itu
- Maksimal **3 elemen** dalam array `id`
- Makna berbeda → elemen array terpisah. Sinonim dekat → satu elemen, dipisah koma
- Elemen pertama = arti yang dipakai di unit tempat item itu muncul; sisanya
  urutan frekuensi
- Tanpa titik di akhir
- Kurung untuk pembeda singkat (`itu (jauh)`), bukan untuk penjelasan
- Penjelasan panjang → `gloss_note_id`, bukan glosa

**Batas "sinonim dekat" lawan "makna berbeda" adalah pertimbangan bahasa, bukan
aturan mesin.** いいえ jadi satu elemen (`tidak, bukan` — dua kata yang mengisi
fungsi yang sama sebagai jawaban), 先生 jadi dua (`guru` · `dokter` — dua rujukan
yang benar-benar berbeda). Tidak ada uji yang memisahkan keduanya, dan `verify:gloss`
sengaja **tidak** mencoba: ia menghitung elemen, bukan menilai apakah pembagiannya
masuk akal. Yang berwenang atas batas itu adalah reviewer penutur asli di §7 —
pengisi batch memilih yang paling masuk akal baginya dan meneruskan, bukan berhenti
menunggu putusan yang memang bukan wewenang mesin.

### 3.2 Kata benda

Kata benda telanjang. Tanpa "sebuah", tanpa "yang".

| Ekspresi | en | id |
|---|---|---|
| 兄 | older brother | kakak (laki-laki) |
| 弟 | younger brother | adik (laki-laki) |
| 先生 | teacher | guru |
| お風呂 | bath | kamar mandi |

Bahasa Inggris sering lebih kabur dari yang dibutuhkan — `brother` menghapus
pembedaan yang justru wajib ada di 兄 dan 弟. Bahasa Indonesia memaksa pilihan yang
sama seperti bahasa Jepang. Manfaatkan, jangan tiru kekaburan Inggrisnya.

**Tapi jangan memaksa membelah ketika Indonesia memang menyatukan.** Arahnya
berlaku dua kali:

| Ekspresi | en | id | kenapa |
|---|---|---|---|
| 兄 / 弟 | brother | kakak / adik | Jepang membedakan, Inggris tidak → Indonesia ikut membedakan |
| 時計 | watch, clock | jam | Inggris membedakan, Jepang tidak → Indonesia ikut menyatukan |

Ujinya adalah **kata sumbernya**, bukan glosa Inggrisnya. 時計 tidak berarti
"arloji"; menulis `jam · jam tangan` menambahkan ketegasan yang tidak ada di kata
Jepangnya dan mengajarkan pembedaan palsu. Contoh yang dipakai versi awal — 学生 →
"mahasiswa" — punya cacat yang sama: 学生 sendiri tidak setegas itu, jadi contohnya
mengajarkan ketajaman yang bukan milik kata sumbernya. Yang benar untuknya
`pelajar, mahasiswa`.

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
dua tingkat. Bentuknya **dikunci di sini**, tidak diserahkan ke pengisi batch:

| Deiksis | pronomina (これ/それ/あれ) | prenominal (この/その/あの) |
|---|---|---|
| こ | `ini` | `ini (+ kata benda)` |
| そ | `itu (dekat)` | `itu dekat (+ kata benda)` |
| あ | `itu (jauh)` | `itu jauh (+ kata benda)` |

Penjelasan penuhnya — dekat *dengan siapa*, jauh *dari siapa* — pindah ke
`gloss_note_id`, dan **hanya pada それ dan あれ**. Pasangan prenominalnya mewarisi
makna itu dari bentuk pronominalnya; mengulang catatan yang sama empat kali persis
kebisingan yang §3.7 larang.

**Kenapa tabel lama diganti.** Versi sebelumnya menyamakan これ/この → "ini",
それ/その → "itu (dekat lawan bicara)", あれ/あの → "itu (jauh dari kita berdua)" —
satu glosa untuk dua item. Keenamnya duduk di unit 2, dan §4.1 melarang elemen
pertama kembar di dalam satu unit. Tabel itu karena itu **menjamin tiga
pelanggaran**: mengikutinya berarti ditolak, dan menyimpang darinya berarti tiap
batch mengarang pembedanya sendiri — この bisa lahir sebagai "ini (+ kata benda)"
hari ini dan "ini (untuk benda)" bulan depan, dua bentuk untuk satu pola yang sama.
Aturan gaya yang bertabrakan dengan aturan keunikan bukan pilihan gaya; ia cacat
spesifikasi, dan tempat memperbaikinya di sini, sekali.

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

Validator: item penggolong → `meanings.id` harus **satu elemen, satu kata, tanpa
kurung**.

**Deteksinya BUKAN `pos.includes('ctr')`.** JMdict menandai 山, 風, 頭 dan ページ
sebagai `ctr` karena kata-kata itu *bisa* dipakai sebagai penggolong — padahal
entri di dataset ini adalah nominanya: 山 berarti "gunung", dan menuntut satu kata
telanjang untuknya berarti menegakkan aturan ini atas item yang bukan urusannya.
`suf`/`n-suf` lebih buruk lagi: よく (`["often", "well"]`) punya dua makna berbeda
yang justru menurut §3.4 harus jadi dua elemen. Kesepuluh item itu akan gagal
selamanya atas aturan yang tidak pernah tentang mereka.

Ujinya karena itu adalah **apa entrinya**, bukan apa yang bisa dilakukan
kepalanya: awalan `〜` (bentuk yang dipakai tabel di atas), atau glosa Inggris yang
menyebut dirinya sendiri *counter*.

**Catatan jujur: dataset belum punya satu pun entri 助数詞, jadi aturan ini
sekarang tidak mengenai apa pun.** Tidak ada 〜人/〜本/〜枚/〜匹/〜冊/〜台/〜個 sebagai
item; 本 tercatat sebagai nomina "book". Tiga kanji memang memuat "counter for"
di glosa Inggrisnya (mis. 日 → "counter for days"), tapi itu item kanji yang
diatur §3.8, bukan penggolong. Validator mencetak catatan ini tiap kali
dijalankan supaya kehampaannya terlihat, bukan disangka lulus. Aturannya sudah
menunggu kalau entri penggolong ditambahkan nanti.

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

## 5. Pipeline — dua perintah, tanpa jaringan

Pengisian glosa dikerjakan **di dalam sesi Claude Code**, bukan lewat panggilan
API berbayar. Generator tidak menyentuh jaringan sama sekali: ia menyiapkan
pertanyaannya, dan perintah kedua mencatat jawabannya.

```sh
npm run gloss:siapkan -- --lingkup 0-5    # tulis SATU batch ke gloss-batch.json
#   ← isi "meanings_id" tiap item di sesi Claude Code
npm run gloss:terapkan                    # validasi → tulis ke dataset → audit
npm run verify:gloss                      # yang berwenang
```

Ulangi sampai `gloss:siapkan` melaporkan tidak ada batch tersisa.

Selain menghapus tagihan per-token, pemisahan ini menaruh **satu titik baca
manusia di antara menghasilkan dan menulis** — persis yang diminta Commit 4 di §8,
tapi berlaku untuk tiap batch, bukan cuma yang pertama.

### 5.1 `gloss:siapkan` — menyiapkan satu batch

```
├─ baca vocab_n5.json / kanji_n5.json / grammar_n5.json
├─ lewati item yang meanings.id-nya sudah terisi  (idempoten)
├─ ambil SATU batch (±25 item) dan tulis scripts/data/gloss-batch.json:
│     • panduan_3        — seluruh §3, diiris dari brief ini apa adanya
│     • aturan_catatan   — batasan gloss_note_id
│     • item[]           — id, ekspresi, bacaan, inggris, pos, verb_group,
│                          unit + judulnya, penanda penggolong
│     • glosa_terpakai.per_unit    — §4.1
│     • glosa_terpakai.per_kelas   — §4.2, LINTAS-UNIT
│     • pasangan_vt_vi             — §3.3
└─ cetak berapa batch tersisa
```

`--lingkup` **wajib, tanpa nilai bawaan**: `0-5` · `6-25` · `3,7,9` · `none`
(item yang tak diklaim unit mana pun) · `semua` (seluruh 810 — harus diketik).
Nilai bawaan "semuanya" mengubah satu salah ketik jadi run 810 item, dan mengisi
justru item yang Commit 4 ada untuk dibiarkan dulu.

**Satu batch per perintah, disengaja.** Daftar §4 dihitung saat perintah
dijalankan, jadi batch N otomatis melihat semua yang ditulis batch N−1 — tidak ada
daftar tersimpan yang bisa basi. Mengeluarkan 33 batch sekaligus akan membekukan
daftar itu di keadaan awal, dan §4 mati di dalam run serta hanya hidup antar-run:
bentrokannya baru ketemu setelah seluruh 810 item ditulis.

Berkas batch dan `gloss-audit.json` sama-sama di-commit — alasannya di bawah.

### 5.2 `gloss:terapkan` — mencatat jawabannya

```
├─ baca scripts/data/gloss-batch.json
├─ TOLAK berkas yang belum diisi sama sekali    ← lihat peringatan di bawah
├─ validasi tiap glosa lawan scripts/lib/gloss-rules.mjs
├─ yang lolos  → meanings.id + gloss_reviewed: false (+ gloss_note_id bila ada)
├─ yang gagal  → DIBIARKAN tanpa glosa, alasannya dicatat
└─ bangun ulang scripts/data/gloss-audit.json — en/id berdampingan, per unit
```

> ⚠️ **`gloss:terapkan` menolak berkas yang `meanings_id`-nya masih kosong
> seluruhnya, dan berhenti sebelum menyentuh apa pun.** Tanpa gerbang itu,
> menjalankannya atas berkas kosong tidak menulis apa-apa tapi tetap membangun
> ulang audit — dan hasilnya terbaca seolah batch-nya sudah dikerjakan.

Item yang sudah berglosa di dataset juga dilewati walau ada di berkas batch:
menerapkan berkas yang sama dua kali tidak boleh menimpa glosa yang barangkali
sudah dikoreksi manusia.

### `gloss-batch.json` di-commit, bukan diabaikan

Berkas batch **masuk git**. Ketika pengisian masih lewat panggilan API, ia memang
lembar kerja sementara — dibangkitkan, dikirim, dibuang dalam hitungan detik.
Sejak API dicabut, isinya dikerjakan manusia, dan itu mengubah sifatnya:

- **Kerja yang belum selesai punya tempat.** Mengisi 25 item butuh waktu. Kalau
  sesi putus di tengah jalan dan berkasnya tidak terlacak git, tidak ada apa pun
  yang bisa dipulihkan — pekerjaannya hilang tanpa jejak, dan tidak ada cara tahu
  seberapa jauh tadi sudah sampai.
- **Ia satu-satunya rekaman prompt yang menghasilkan glosa tertentu.** Reviewer
  penutur asli (§7) yang menemukan glosa aneh akan bertanya "apa yang dilihat
  pengisinya waktu itu?" — daftar §4 yang mana, pasangan vt/vi yang mana, versi §3
  yang mana. `gloss-audit.json` menyimpan hasilnya; hanya berkas batch yang
  menyimpan pertanyaannya.

### Tiap batch diarsipkan sebelum ditimpa

`gloss:siapkan` menyalin `gloss-batch.json` yang lama ke
`scripts/data/riwayat-batch/NNN.json` — bernomor urut, batch 1 = `001.json` —
**sebelum** menulis batch berikutnya. Salinan yang byte-nya sama persis dengan
arsip terakhir dilewati, supaya menjalankan perintahnya dua kali tanpa mengisi apa
pun tidak menghasilkan nomor baru yang membohongi berapa batch yang benar-benar
dikerjakan.

**Yang mana memegang keadaan sekarang, dan yang mana memegang riwayat:**

| Berkas | Menjawab | Berubah kalau |
|---|---|---|
| `src/data/*.json` | glosa item ini sekarang apa | glosanya dikoreksi |
| `scripts/data/gloss-audit.json` | seluruh keadaan sekarang, untuk reviewer §7 | dataset berubah |
| `riwayat-batch/NNN.json` | **panduan versi mana yang menghasilkan glosa itu** | tidak pernah |

`gloss-batch.json` bukan cermin keadaan akhir, dan tidak boleh dirapikan agar
menjadi cermin. Ia rekaman pertanyaan pada satu titik waktu: panduan §3 yang
berlaku waktu itu, daftar §4 yang terlihat waktu itu, pasangan vt/vi yang ada waktu
itu. Kalau glosanya dikoreksi belakangan, yang berubah dataset dan audit — arsipnya
tetap memuat jawaban asli, karena itulah yang menjelaskan kenapa jawabannya begitu.

Kalibrasi batch 1 sudah membuktikan ini bukan kekhawatiran karangan: §3.5 diperbaiki
**setelah** batch 1 diisi, jadi `001.json` memuat tabel deiksis lama yang menjamin
pelanggaran §4.1, sementara `002.json` dan seterusnya memuat tabel yang dikunci.
Reviewer §7 yang bertanya "kenapa それ pernah ditulis panjang begitu?" mendapat
jawabannya dari `001.json` dan tidak dari mana pun yang lain. Riwayat git menyimpan
hal yang sama, tapi hanya bagi orang yang sudah tahu commit mana yang dicari.

### Riwayat penolakan ikut dibawa

Item yang ditolak `gloss:terapkan` kembali ke antrean tanpa glosa, dan
`gloss:siapkan` berikutnya melampirkan **usulan sebelumnya beserta alasannya** di
`riwayat_penolakan`:

```json
{
  "id": "vocab-n5-はい",
  "riwayat_penolakan": [
    { "usulan": ["yes"], "alasan": "identik dengan sumber Inggris — belum diterjemahkan (§6)" }
  ]
}
```

Sumbernya `ditolak` di `gloss-audit.json`. Ketika panggilan API masih ada di
dalam gelung, percobaan perbaikan membawa alasan penolakannya sendiri kembali ke
model; umpan balik itu ikut tercabut bersama API, dan ini yang menggantikannya.
Tanpanya pengisi berikutnya buta — ia melihat `meanings_id` kosong tanpa petunjuk
bahwa "yes" sudah pernah diusulkan dan ditolak, dan bisa mengusulkannya lagi
tanpa batas.

Dua akibat yang menyertainya:

- **Baris yang belum diisi bukan penolakan.** `gloss:terapkan` memisahkan
  `belum_diisi` dari `ditolak`. Keduanya berarti hal berbeda bagi pembaca
  berikutnya: satu berkata "ini sudah dicoba dan begini salahnya", satunya cuma
  "belum dikerjakan". Mencampurnya membuat ringkasan berbunyi *13 ditolak*
  padahal yang benar-benar ditolak satu, dan membanjiri riwayat dengan entri yang
  tidak memberi tahu apa-apa.
- **Penolakan lama tidak dilupakan.** Audit dibangun ulang tiap kali, jadi
  `gloss:terapkan` membawa serta penolakan dari run sebelumnya untuk item yang
  masih belum berglosa dan tidak diputuskan lagi kali ini. Tanpa itu, item yang
  ditolak di run 1 lalu sekadar tidak dicoba di run 2 kehilangan riwayatnya.

### Nama kunci: dataset lawan berkas kerja

Skema dataset **tidak berubah** — ia persis §2.1. Berkas kerja memakai kosakata
sendiri yang lebih datar, karena barisnya adalah lembar isian, bukan `Item`.
Pemetaannya:

| `gloss-batch.json` | `gloss-audit.json` | dataset (§2.1) |
|---|---|---|
| `meanings_id` | `id_glosa` | `meanings.id` |
| `inggris` | `en` | `meanings.en` |
| `gloss_note_id` | `catatan` | `data.gloss_note_id` |
| — | `direview` | `data.gloss_reviewed` |

Nama datar dipakai di berkas kerja karena barisnya tidak bersarang: `meanings.id`
tidak punya arti di objek yang tidak punya `meanings`. Di dataset, alasan §2.1
tetap berlaku — `meanings_id` di sebelah `id` terbaca sebagai "ID dari meanings".

### Keunikan §4.2 itu LINTAS-UNIT

Mengirim hanya glosa yang sudah dipakai di unit itu cukup untuk §4.1 dan tidak
cukup untuk apa pun selain itu. §4.2 menuntut keunikan di antara item sejenis dan
sekelas kata, dan himpunan itu **melintasi unit**: 入る ada di unit 17, 入れる
tidak diklaim unit mana pun, jadi keduanya tidak pernah sekelompok. Daftar yang
hanya berisi glosa satu unit tidak akan pernah mencegah keduanya lahir sebagai
"masuk" — dan bentrokannya baru ketahuan setelah 810 item jadi, yaitu persis
kegagalan yang §8 susun urutan commit-nya untuk mencegah.

Karena itu tiap batch juga membawa glosa yang sudah dipakai item sejenis +
sekelas kata dari seluruh dataset. Daftarnya dipersempit ke kelas kata yang
benar-benar ada di batch itu, supaya panjangnya sebanding dengan permintaannya,
bukan dengan ukuran dataset.

Hal yang sama berlaku pada **penyusunan batch**: pasangan 他動詞/自動詞 seakar
(§3.3) dijaga tetap dalam satu batch walau unitnya berjauhan. Kalau terpisah, tiap
batch hanya melihat separuh pasangan dan dengan wajar menulis "masuk" untuk
keduanya — perbedaan yang justru menjadi alasan §3.3 ada, hilang sebelum validator
sempat melihatnya.

Batching tidak bisa menolong satu kasus: sisi lain pasangan sudah berglosa dari
batch sebelumnya, jadi ia tidak ada di antrean dan tidak bisa ditarik masuk. Untuk
itu `pasangan_vt_vi` membawa glosa pasangannya secara eksplisit, berikut instruksi
bahwa awalannya harus berbeda (me-/mem-/meng- lawan bentuk dasar atau ter-/ber-).
§4.2 sendiri tidak menyelamatkan ini: ia cuma menuntut keduanya *berbeda*,
sementara §3.3 menuntut keduanya berbeda *dengan cara tertentu*.

### §3 dibaca dari brief saat runtime

Panduan gaya **tidak disalin** ke dalam skrip. Ia diiris dari berkas ini saat
`gloss:siapkan` dijalankan (antara judul `## 3.` dan `## 4.`) lalu ditaruh apa
adanya di `gloss-batch.json`. Salinan kedua akan menyimpang dari brief begitu
salah satunya disunting, dan penyimpangannya tak terlihat — glosanya cuma mulai
mengikuti versi aturan yang tak seorang pun ingat pernah menulisnya.

Karena itu ekstraksinya **diperiksa keras, bukan diandaikan**. Judul yang hilang
adalah kegagalan yang mudah — ia melempar. Yang berbahaya adalah judul yang masih
cocok sementara isinya kosong, terpotong, atau dinomori ulang: batch-nya tersimpan
dengan `panduan_3` kosong, siapa pun yang mengisinya bekerja dari ingatan alih-alih
dari spec, dan tidak ada apa pun yang melaporkan masalah.

Tiga pemeriksaan, semuanya gagal keras: judul `## 3.` dan `## 4.` ada dan urut ·
hasil irisannya **di atas 3.000 karakter** (§3 sekarang ~6.500) · memuat subbagian
`### 3.1`, `### 3.6`, `### 3.7`, `### 3.10`.

### Kebijakan tolak

Usulan yang melanggar aturan yang bisa dinilai dari satu batch — bentuk glosa,
keunikan §4.1/§4.2, aturan penggolong §3.6, glosa yang identik dengan sumber
Inggris — ditolak, dan itemnya **dibiarkan tanpa glosa** beserta alasannya, bukan
ditulis apa adanya.

Item ber-`meanings.id` kosong akan diambil lagi oleh `gloss:siapkan` berikutnya
(idempoten) dan tetap dihitung kurang oleh `verify:gloss --lengkap`. Menulis glosa
yang diketahui buruk melakukan kebalikannya: menandai item itu selesai,
menyembunyikannya dari keduanya, dan meninggalkan pelanggaran yang hanya ketemu
kalau ada manusia membaca ulang §6. Kandidat yang ditolak beserta alasannya tetap
dicatat di `gloss-audit.json`.

Pemeriksaan di `gloss:terapkan` adalah **saringan cepat, bukan implementasi kedua
dari §6**. Ia menangkap yang bisa dinilai dari satu batch sendirian, selagi
konteksnya masih di tangan. `npm run verify:gloss` tetap yang berwenang —
jalankan setelah tiap terapkan.

### Batasan `gloss_note_id`

Batch menyediakan `gloss_note_id`, tapi ia diisi **hanya dalam dua keadaan**:

1. ungkapan tetap §3.7 — catat fungsinya atau adat pemakaiannya
2. item dengan jebakan pemakaian nyata, yaitu ketika glosanya sendiri akan
   menyesatkan kalau dipakai apa adanya (mis. あなた jarang dipakai kepada orang
   yang namanya sudah diketahui)

Selain itu `null`. Maksimal 80 karakter; catatan yang lebih panjang dibuang
sementara glosanya tetap dipakai — §6 memperlakukan panjang catatan sebagai
peringatan, bukan kegagalan, dan tidak sebanding membuang glosa yang baik
karenanya. Catatan yang diisi untuk tiap item menjadi kebisingan dan reviewer
berhenti membacanya, termasuk dua catatan yang benar-benar penting. `null` yang
sudah ada tidak ditimpa, jadi catatan yang ditulis manusia aman.

Urutan pengerjaan: **unit 0–5 dulu**, lalu 6–25, lalu kosakata yang belum
terpetakan ke unit mana pun.

---

## 6. Validator — `npm run verify:gloss`

`type === 'kana'` dilewati seluruhnya (lihat §2.2).

### Kebenaran dan kelengkapan adalah dua pertanyaan

Validator ini menjawab **"apakah yang sudah ditulis itu benar?"** dan diam soal
yang belum ditulis. Dua pertanyaan itu dipisah karena dijawab pada waktu yang
berbeda oleh orang yang berbeda.

Selama Brief 01 dikerjakan — berminggu-minggu, unit demi unit — glosa yang belum
ada adalah **keadaan normal**, bukan kerusakan. Kalau ketiadaannya dihitung
sebagai kegagalan, CI merah setiap hari karena alasan yang tidak bisa ditindak
siapa pun, dan merah berhenti berarti "ada yang rusak". Sinyal yang sudah dua
minggu berteriak serigala akan menyambut kerusakan sungguhan dengan penonton yang
sudah berhenti menoleh.

Jadi:

| | Perintah | Kapan |
|---|---|---|
| Kebenaran | `npm run verify:gloss` | tiap push, di `ci.yml` |
| Kelengkapan | `npm run verify:gloss -- --lengkap` | gerbang rilis §7 |

Jumlah yang belum berglosa tetap dicetak di ringkasan tiap kali dijalankan — ia
terlihat, hanya tidak menggagalkan.

**Gagal — kebenaran, dinilai hanya atas item yang SUDAH punya `meanings.id`:**

- [ ] `meanings.id[0]` unik dalam satu unit (§4.1)
- [ ] `meanings.id[0]` unik antar item sejenis (§4.2)
- [ ] tidak ada `meanings.id` identik dengan `meanings.en` (tanda belum diterjemahkan)
- [ ] tidak ada glosa diawali `untuk `
- [ ] tidak ada glosa > 40 karakter
- [ ] item penggolong: satu elemen, satu kata, tanpa kurung
- [ ] maksimal 3 elemen array
- [ ] tidak ada titik di akhir
- [ ] `meanings.en` tidak berubah dari commit sebelumnya (jaga data sumber)
- [ ] `data.gloss_reviewed` tidak mundur dari `true` ke `false` dibanding commit
      sebelumnya — cermin dari aturan di atasnya, dan satu-satunya hal yang
      menangkap preservasi `fetch-jlpt.mjs` yang rusak sebagian (§2.6)

Dua aturan terakhir **tidak** dibatasi pada item yang sudah berglosa. Keduanya
menanyakan apa yang BERUBAH antar dua commit, bukan apa yang tertulis di sebuah
glosa, jadi `meanings.id` kosong tidak bisa membuatnya menyala — dan membatasinya
justru akan mencabut penjaga data sumber CC BY-SA dari 810 item yang belum
berglosa, yaitu semuanya hari ini.

Pembandingnya berbeda menurut kapan ditanya. Di laptop perubahannya belum
di-commit, jadi "commit sebelumnya" berarti `HEAD` (bawaan). Di CI perubahan itu
sudah menjadi `HEAD`, jadi `ci.yml` mengisi `VERIFY_GLOSS_BASE` dengan titik
tempat kerjanya dimulai: `github.event.before` untuk push, basis PR untuk PR.
Bukan `HEAD^` — sebuah push berisi tiga commit hanya akan diperiksa commit
terakhirnya, sehingga regresi yang masuk di commit pertama lolos sambil runnya
tetap hijau. Tanpa riwayat sama sekali (SHA nol pada push pertama ke branch baru,
atau ref tak terbaca), keduanya dilaporkan **dilewati**, bukan lulus.

**Kelengkapan — hanya dengan `--lengkap`:**

- [ ] setiap item punya `meanings.id` tidak kosong

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
- Gerbang rilis store dijalankan dengan `npm run verify:gloss -- --lengkap` —
  mode yang mengembalikan kelengkapan jadi kegagalan (§6). Ini satu-satunya
  tempat pertanyaan "sudah semua belum?" ditanyakan, dan jawabannya memang
  seharusnya "sudah"
- Gerbang rilis store: seluruh item **non-kana** unit 0–25 `gloss_reviewed: true`.
  Kana tidak punya field itu sama sekali (§2.2, §2.6): romaji bukan terjemahan,
  jadi tidak ada yang bisa disetujui penutur asli, dan memasukkannya ke gerbang
  berarti 208 item yang tidak akan pernah jujur bisa dinyatakan lulus
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
`gloss-siapkan.mjs` + `gloss-terapkan.mjs` sesuai §5. Belum dijalankan.

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
