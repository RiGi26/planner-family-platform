# Prompt tambahan — Lembar Kana

> Untuk ditempel ke project Claude Design yang **sudah ada**. Kalau kamu regenerate dari nol, pakai `PROMPT-CLAUDE-DESIGN.md` saja — layar ini sudah termasuk di sana.

---

Tambahkan satu layar baru: **Lembar Kana** — tabel 五十音 yang dimulai kosong dan diisi sendiri dengan tulisan tangan. Ini menggantikan layar peta kurikulum untuk fase kana.

Pertahankan palet, tipografi, dan bahasa visual yang sudah ada. Klee One dipakai untuk semua karakter di layar ini.

## Keadaan 1 — Lembar

Yang tampil **hanya sumbunya**:
- Label kolom di atas: `a` `i` `u` `e` `o`
- Label baris di kiri: `—` `k` `s` `t` `n` `h` `m` `y` `r` `w` `n`

**Ke-46 sel mulai kosong.** Tidak ada glyph, tidak ada romaji, tidak ada contoh di dalam sel. Kotak kosong bergaris putus-putus.

Sel yang sudah ditulis menampilkan **tulisan tangan user sendiri**, bukan glyph cetak — di mockup, wakili dengan Klee One di atas latar kertas terang.

Sel yang jatuh tempo untuk diulang ditandai **cincin ai** di sekelilingnya. Bukan dengan menampilkan karakternya.

Baris `y` hanya punya kolom a/u/o, baris `w` hanya a/o, `n` hanya satu sel. Sel yang tidak ada dibiarkan kosong tanpa kotak.

Perlu juga di layar ini:
- Penghitung progres (`13/46`)
- Toggle **"lembarku / uji aku"** — mengosongkan tampilan semua sel dan mengembalikan lembar ke keadaan bersumbu-saja, supaya bisa diisi ulang sebagai tes tanpa menghapus apa pun
- Grid terpisah di bawahnya untuk **dakuten/handakuten (25)** dan **youon (33)**
- Cara berpindah ke **lembar katakana**

## Keadaan 2 — Menulis

Mengetuk sel membuka kanvas besar. **Bukan** menulis di sel kecil itu — satu sel sekitar 62px sementara bidang sentuh jari 40–50px, mustahil menulis karakter terbaca di situ.

Isinya, dari atas ke bawah:

1. Header baris + penghitung — `は行 · 2/5`
2. Label kolom `a i u e o`
3. Strip lima sel baris itu: yang terisi menampilkan tulisan tangan, yang aktif ditandai cincin shu, sisanya kotak kosong putus-putus
4. **Kanvas persegi besar** — selalu berwarna kertas, **termasuk di mode gelap**. Orang menulis di atas kertas, bukan di atas tinta. Garis bantu silang 田 putus-putus, standar kertas latihan kana Jepang
5. Indikator goresan — pip untuk goresan selesai, satu untuk yang sedang berjalan, outline kosong untuk sisanya, plus label `goresan 3/4`
6. Umpan balik kesalahan singkat saat terjadi — `arah terbalik`, `urutan salah`

Selesai satu sel, isinya masuk ke strip dan fokus pindah ke sel berikutnya.

Tunjukkan juga tahap **Trace** (template karakter samar di kanvas, dipakai saat sel diisi pertama kali) dan tahap **Recall** (kanvas benar-benar kosong, dipakai saat menulis ulang).

## Aturan yang tidak boleh dilanggar

**Tidak boleh ada romaji atau glyph contoh di dalam sel — di keadaan mana pun.**

Posisinya yang jadi soal: user melihat kotak di baris は kolom u, lalu menurunkan sendiri bahwa yang harus ditulis adalah ふ. Label sumbu tetap ditampilkan; jawabannya tidak.

Kalau ada satu saja karakter tercetak di dalam sel yang belum ditulis, seluruh gagasan layar ini batal.
