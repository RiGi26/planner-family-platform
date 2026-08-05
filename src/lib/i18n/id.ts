/**
 * Every string a user reads, in one place.
 *
 * Namespaces follow the screens (`nav`, `daftar`, …) plus two cross-cutting ones
 * (`errors`, `common`). The rule when moving a string in here: the value is copied
 * byte-for-byte — extraction and copywriting are different jobs, and mixing them
 * makes both unreviewable.
 *
 * Indonesian is the active language. A second language is added as a sibling file
 * declaring `satisfies Dictionary`, which makes the compiler — not a runtime 404 —
 * the thing that catches a missing key.
 */
export const id = {
  nav: {
    label: 'Navigasi utama',
    hariIni: 'Hari Ini',
    kana: 'Kana',
    menulis: 'Menulis',
    setelan: 'Setelan',
  },

  daftar: {
    title: 'Daftar',
    subtitle:
      'Pendaftaran hanya lewat undangan. Kamu akan menetapkan password dari tautan yang kami kirim.',
    haveAccount: 'Sudah punya akun?',
    signIn: 'Masuk',
    nameLabel: 'Nama tampilan',
    namePlaceholder: 'Nama panggilanmu',
    nameHint: 'Nama yang tampil di aplikasi.',
    emailLabel: 'Email',
    emailPlaceholder: 'kamu@contoh.com',
    codeLabel: 'Kode undangan',
    codePlaceholder: 'XXXX-XXXX-XXXX',
    submit: 'Kirim undangan',
    submitPending: 'Mengirim undangan…',
    sentTitle: 'Cek emailmu',
    sentBefore: 'Undangan sudah dikirim ke ',
    sentAfter:
      '. Buka tautannya untuk menetapkan password, lalu kamu langsung masuk.',
    sentFooter:
      'Tidak ada di kotak masuk? Cek folder spam. Kalau tetap tidak ada setelah beberapa menit, minta kode undangan baru.',
    backToSignIn: 'Kembali ke halaman masuk',
  },

  setelan: {
    title: 'Setelan',
    profil: 'Profil',
    nameLabel: 'Nama tampilan',
    nameHint: 'Nama yang tampil di aplikasi.',
    timezoneLabel: 'Zona waktu',
    timezoneHint: 'Menentukan kapan "hari ini" berganti untuk kuota dan streak.',
    writingHeading: 'Latihan menulis',
    writingKana: 'Latihan menulis kana',
    writingKanji: 'Latihan menulis kanji',
    writingHint:
      'Mematikannya tidak menghapus apa pun — kartu menulis hanya berhenti dijadwalkan.',
    save: 'Simpan perubahan',
    savePending: 'Menyimpan…',
    saved: 'Tersimpan.',
    aboutLink: 'Tentang Masume & lisensi',
    signOut: 'Keluar',
    signOutPending: 'Keluar…',
    signOutUnsynced:
      '{n} latihan belum tersinkron dan akan hilang dari perangkat ini. Tetap keluar?',
    dangerHeading: 'Hapus akun',
    dangerBody:
      'Menghapus akun bersifat permanen: seluruh jadwal, riwayat review, dan Lembar Kana ikut terhapus dan tidak bisa dikembalikan.',
    dangerConfirmLabel: 'Ketik HAPUS untuk mengonfirmasi',
    dangerConfirmWord: 'HAPUS',
    dangerSubmit: 'Hapus akun saya',
    dangerPending: 'Menghapus…',
  },

  tentang: {
    title: 'Tentang Masume',
    subtitle: 'Planner sertifikasi JLPT. 升目 — satu kotak demi satu kotak.',
    appHeading: 'Aplikasi',
    appBody:
      'Kode sumber Masume tersedia di bawah lisensi MIT.',
    appRepo: 'Kode sumber di GitHub',
    dataHeading: 'Data urutan goresan',
    kanjivgBody:
      'Data urutan goresan berasal dari KanjiVG © Ulrich Apel dan kontributor, dilisensikan di bawah Creative Commons Attribution-ShareAlike 3.0. Masume memakai subset 150 karakter; path goresannya tidak diubah. Data turunannya mengikuti lisensi yang sama.',
    kanjivgSite: 'Situs KanjiVG',
    kanjivgLicense: 'Teks lisensi CC BY-SA 3.0',
    depsHeading: 'Dibangun dengan',
    depsBody:
      'Next.js, Supabase, Dexie, ts-fsrs, TanStack Query, dan Serwist — masing-masing di bawah lisensi MIT atau Apache 2.0.',
    back: 'Kembali',
  },

  errors: {
    auth: {
      invalidCredentials: 'Email atau password salah.',
      emailNotConfirmed:
        'Emailmu belum dikonfirmasi. Cek kotak masuk untuk tautan konfirmasinya.',
      alreadyRegistered:
        'Email ini sudah terdaftar. Coba masuk, atau pakai tautan lupa password.',
      passwordTooShort: 'Password terlalu pendek.',
      passwordPwned:
        'Password ini pernah muncul di kebocoran data publik. Pilih yang lain — bukan berarti akunmu bocor.',
      passwordSameAsOld: 'Password barunya masih sama dengan yang lama.',
      linkExpired: 'Tautannya sudah kedaluwarsa. Minta tautan baru, ya.',
      rateLimited: 'Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba lagi.',
      signupsDisabled: 'Pendaftaran mandiri ditutup. Kamu perlu kode undangan.',
      invalidEmail: 'Alamat emailnya tidak valid.',
      offline: 'Tidak bisa terhubung. Cek koneksimu lalu coba lagi.',
      fallback: 'Terjadi gangguan. Coba lagi sebentar lagi.',
    },
  },

  common: {},
} as const
