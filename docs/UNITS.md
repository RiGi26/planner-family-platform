# Ledger Unit — Jalur N5

Status tiap unit kurikulum. Sumber kebenaran konten: `scripts/data/units-n5.json`;
file ini hanya mencatat *statusnya*, supaya gerbang rilis bisa dibaca sekali pandang.

Tiga status, berurutan:

1. **draf** — dikarang, belum lolos validator
2. **tervalidasi mesin** — `npm run verify:units` hijau: setiap kalimat hanya
   memakai materi unit ≤ N (aturan *i+1* ditegakkan mekanis)
3. **direview manusia** — dibaca penutur asli/pengajar; flag `reviewed: true`
   di JSON, label jujur di aplikasi hilang untuk unit itu

**Gerbang rilis store: seluruh unit berstatus "direview manusia".** Sampai saat
itu aplikasi menampilkan label "belum diperiksa penutur asli" per unit.

| Unit | Judul | Acuan MNN | Status | Catatan |
|---|---|---|---|---|
| 0 | Bunyi Jepang & huruf pertama | — | tervalidasi mesin | kana lewat kata utuh, baris a+ka |
| 1 | Memperkenalkan diri | L1 | tervalidasi mesin | |
| 2 | Menyebut benda di sekitarku | L2 | tervalidasi mesin | |
| 3 | Menanyakan tempat | L3 | tervalidasi mesin | |
| 4 | Jam berapa sekarang? | L4a | tervalidasi mesin | angka 1–10 + jam; token 時/から/まで |
| 5 | Rutinitas harianku | L4b | tervalidasi mesin | kata kerja pertama, ます/ません/ました |
| 6 | Pergi dan pulang | L5 | tervalidasi mesin | へ; 日本 dipromosikan jadi kosakata unit |
| 7 | Makan, minum, membeli | L6 | tervalidasi mesin | を; ajakan ませんか/ましょう |
| 8 | Memberi dan meminjam | L7 | tervalidasi mesin | tanpa もらいます (tidak ada di daftar N5) |
| 9 | Seperti apa? | L8 | tervalidasi mesin | kanji pertama: 大小高 |
| 10 | Suka dan mengerti | L9 | tervalidasi mesin | kanji 人本日学生 |
| 11–±25 | — | L10–L25 | **belum dikarang** | batch berikutnya |

## Rencana batch berikutnya (L10–L25)

Pola granularitas sama — satu pelajaran MNN boleh pecah dua unit bila materinya
padat (seperti L4 → unit 4+5):

- **L10** ada/berada (あります/います + posisi 上/下/中/前/後ろ…) — います belum
  ada di daftar N5 sebagai 居る ✓ (ada)
- **L11** bilangan pembantu (satuan hitung, 一つ〜, 人数) + 百/千/万
- **L12** lampau kata sifat + perbandingan (より/いちばん)
- **L13** ほしい/〜たい + pergi untuk 〜に
- **L14–L15** bentuk て (permintaan, sedang, boleh/tidak boleh) — token ください
- **L16** menyambung kalimat (て-joining, それから)
- **L17** bentuk ない
- **L18** bentuk kamus + できます/趣味
- **L19** bentuk た + 〜たことがあります
- **L20–L25** bentuk biasa, pendapat 〜と思います, klausa relatif, とき, dst.

Kosakata belum terpetakan (677 − terpetakan) tetap bisa dipelajari nanti sebagai
unit pengayaan akhir — tidak ada kata yang hilang dari kuota.

## Cara kerja batch

1. Karang unit di `scripts/data/units-n5.json` (vocab hanya dari dataset;
   ekspresi harus persis, termasuk bentuk ganda seperti `いい/よい`)
2. `npm run verify:units` sampai hijau — validator menurunkan konjugasi
   (ます/て/た/ない, adj-i) dari `verb_group`, jadi kalimat boleh memakai bentuk
   sopan tanpa mendaftar bentuk permukaannya
3. `npm run jlpt` (menulis `unit` ke item + menyalin units ke `src/data/`)
4. `npm run fonts` + `npm run verify:fonts` (glyph kalimat baru ikut tersapu)
5. `tsc` + commit; UAT /jalur/ di live
