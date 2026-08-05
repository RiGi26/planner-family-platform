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
