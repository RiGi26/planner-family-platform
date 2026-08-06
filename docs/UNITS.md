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
| 11 | Ada di mana, ada siapa | L10 | tervalidasi mesin | います + posisi; kanji 上下中前 |
| 12 | Berapa harganya? | L11 | tervalidasi mesin | satuan hitung; token 円/ください; kanji 百千万金円 |
| 13 | Kemarin bagaimana? Mana yang lebih? | L12 | tervalidasi mesin | lampau adj + でした + より/ほう/いちばん; kanji 天気休半 |
| 14 | Ingin dan mau | L13 | tervalidasi mesin | 欲しい/たい + batang に; kanji 行見食水 |
| 15 | Tolong, dan sedang apa | L14 | tervalidasi mesin | てください + ています; kanji 雨電車話 |
| 16 | Boleh dan tidak boleh | L15 | tervalidasi mesin | てもいい/てはいけません; kanji 月土友 |
| 17 | Lalu, setelah itu | L16 | tervalidasi mesin | て-joining; kanji 出入来何 |
| 18 | Jangan, dan harus | L17 | tervalidasi mesin | ない/なければ/なくても; kanji 書読聞毎名 |
| 19 | Bisa, dan hobiku | L18 | tervalidasi mesin | ことができます; suplemen 趣味; kanji 語校先外国 |
| 20 | Pernah, dan kadang-kadang | L19 | tervalidasi mesin | たことがあります + たり; kanji 一二三山木 |
| 21 | Menurutku | L21 | tervalidasi mesin | と思います (suplemen 思う) + でしょう; kanji 今白四五六 |
| 22 | Keluargaku | L22 | tervalidasi mesin | klausa pewatas; kanji 父母子男女 |
| 23 | Kalau begini, saat begitu | L23 | tervalidasi mesin | と kondisional + とき (suplemen); kanji 右左東西南北 |
| 24 | Diberi dan menerima | L24 | tervalidasi mesin | もらう/くれる (suplemen — Waller tak punya); kanji 年七八九十 |
| 25 | Kalau, dan walaupun | L25 | tervalidasi mesin | たら/ても — penutup; kanji 時間長後午火川 |

**Jalur N5 lengkap: 26 unit (0–25), MNN L1–L25 (L20 ragam akrab sengaja
dilewati), 378 kosakata terpetakan, 283 kalimat, 79/79 kanji.** 314 kosakata
sisanya tetap ada di dataset dan bisa dipelajari; mereka calon unit pengayaan —
tidak ada kata yang hilang dari kuota.

## Yang belum (gerbang rilis)

- **Review penutur asli** untuk 26 unit — satu-satunya jalan mengubah status;
  label jujur tampil sampai itu terjadi
- Unit pengayaan untuk 314 kata tak terpetakan (opsional, setelah review)

Kosakata belum terpetakan (677 − terpetakan) tetap bisa dipelajari nanti sebagai
unit pengayaan akhir — tidak ada kata yang hilang dari kuota.

## Cara kerja batch

1. Karang unit di `scripts/data/units-n5.json` (vocab hanya dari dataset;
   ekspresi harus persis, termasuk bentuk ganda seperti `いい/よい`)
2. `npm run verify:units` sampai hijau — validator menurunkan konjugasi
   (ます/て/た/ない/たい + batang, adj-i/adj-ix) dari `verb_group`, jadi kalimat
   boleh memakai bentuk sopan tanpa mendaftar bentuk permukaannya; segmentasi
   memakai DP (bukan greedy), jadi はいくら terbelah benar walau はい juga kata
3. `npm run jlpt` (menulis `unit` ke item + menyalin units ke `src/data/`)
4. `npm run fonts` + `npm run verify:fonts` (glyph kalimat baru ikut tersapu)
5. `tsc` + commit; UAT /jalur/ di live
