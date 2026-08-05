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
  meta: {
    title: 'Masume',
    description: 'Planner sertifikasi JLPT — hitung mundur dari tanggal ujian ke kuota harian.',
    manifestName: 'Masume — planner sertifikasi JLPT',
    manifestDescription:
      'Hitung mundur dari tanggal ujian ke kuota harian, lalu jalankan kuota itu lewat satu mesin SRS.',
  },

  nav: {
    label: 'Navigasi utama',
    hariIni: 'Hari Ini',
    kana: 'Kana',
    menulis: 'Menulis',
    setelan: 'Setelan',
  },

  common: {
    loading: 'Memuat',
    sheetLabel: '{done} dari {total} selesai',
    ticksLabel: '{done} dari {total} hari',
  },

  authShared: {
    reveal: 'Lihat',
    hide: 'Sembunyikan',
    pendingDefault: 'Sebentar…',
    backToSignIn: 'Kembali ke halaman masuk',
    emailLabel: 'Email',
    emailPlaceholder: 'kamu@contoh.com',
  },

  masuk: {
    title: 'Masuk',
    subtitle: 'Sekali masuk, tetap masuk — sampai kamu keluar sendiri.',
    haveInvite: 'Punya kode undangan?',
    signUpHere: 'Daftar di sini',
    forgotPassword: 'Lupa password',
    passwordLabel: 'Password',
    submit: 'Masuk',
    submitPending: 'Masuk…',
  },

  lupaPassword: {
    title: 'Lupa password',
    subtitle: 'Masukkan emailmu, kami kirim tautan untuk mengatur password baru.',
    remembered: 'Ingat lagi?',
    submit: 'Kirim tautan',
    submitPending: 'Mengirim…',
    sentTitle: 'Cek emailmu',
    sentSubtitle:
      'Kalau alamat itu terdaftar, tautan untuk mengatur ulang password sudah dikirim. Tautannya berlaku terbatas.',
    sentFooter: 'Tidak ada di kotak masuk? Cek folder spam.',
  },

  aturPassword: {
    title: 'Atur password',
    subtitleBefore: 'Untuk akun ',
    subtitleAfter: '. Setelah ini kamu langsung masuk, dan tetap masuk sampai keluar sendiri.',
    mismatch: 'Dua password yang kamu ketik belum sama.',
    tooShort: 'Password minimal 8 karakter.',
    newPasswordLabel: 'Password baru',
    newPasswordHint:
      'Minimal 8 karakter. Pakai password manager kalau ada — kamu hanya perlu mengetiknya sekali.',
    confirmLabel: 'Ulangi password',
    submit: 'Simpan dan masuk',
    submitPending: 'Menyimpan…',
    deadTitle: 'Tautannya sudah tidak berlaku',
    deadSubtitle:
      'Tautan undangan dan atur-ulang hanya bisa dipakai sekali dan punya masa berlaku. Minta yang baru, ya.',
    requestNew: 'Minta tautan baru',
    checkingTitle: 'Sebentar…',
    checkingSubtitle: 'Memeriksa tautanmu.',
  },

  hariIni: {
    title: 'Hari Ini',
    daysLeft: '{n} hari',
    quotaHeading: 'Kuota hari ini',
    onTrack: 'On track',
    remaining: '{n} kartu sisa · ±{m} menit',
    quotaSheetLabel: '{done} dari {total} kartu selesai',
    trackKana: 'Kana',
    trackVocab: 'Kosakata',
    trackKanji: 'Kanji',
    trackGrammar: 'Tata bahasa',
    weekHeading: '7 hari terakhir',
    weekCount: '{n} dari 7',
    startSession: 'Mulai sesi',
    startSessionDetail: '{n} kartu · recognition & recall',
    writingQueued: 'Latihan menulis ({n})',
  },

  kana: {
    title: 'Lembar Kana',
    strongCount: '/ {total} kuat',
    hiragana: 'ひらがな',
    katakana: 'カタカナ',
    testModeOn: 'uji aku',
    testModeOff: 'lembarku',
    testModeNoteBefore: 'Semua sel dikosongkan tampilannya. Tidak ada yang terhapus — isi ulang dari ingatan, lalu kembali ke ',
    testModeNoteStrong: 'lembarku',
    testModeNoteAfter: ' untuk melihat tulisanmu lagi.',
    gojuonHeading: '五十音 · gojūon',
    dakutenHeading: 'dakuten · handakuten',
    youonHeading: 'youon',
    legend:
      'Sel kosong berarti belum pernah kamu tulis. Cincin biru berarti jatuh tempo diulang — bukan berarti karakternya ditampilkan. Posisi yang jadi soal.',
    cellHidden: 'sel tersembunyi — mode uji',
    cellWritten: 'sudah ditulis, {status}',
    cellUnwritten: 'belum ditulis, baris {row}',
  },

  menulis: {
    pickTitle: 'Pilih sel dulu',
    pickBody:
      'Layar ini menulis satu petak dari Lembar Kana. Buka lembarnya dan ketuk petak yang mau kamu isi.',
    pickCta: 'Buka Lembar Kana',
    backToSheet: '← Lembar',
    strokeCount: '{n} goresan',
    stageDemo: 'Demo',
    stageJiplak: 'Jiplak',
    stageIngat: 'Ingat',
    saving: 'Menyimpan…',
    canvasLabel: 'Kanvas menulis',
    clear: 'Hapus',
    demoNote: 'Tonton sebanyak yang perlu. 0,5× disediakan karena orang dewasa kalah di arah, bukan di bentuk.',
    demoReplay: 'Ulang',
    toTrace: 'Lanjut ke jiplak',
    traceProgress: 'goresan {current}/{total}',
    traceRepeats: '{n}× diulang',
    traceNote: 'Goresan yang meleset ditolak dan dijelaskan — yang sudah benar tidak hilang.',
    finishTraceFirst: 'Selesaikan jiplakannya dulu',
    toRecall: 'Lanjut ke ingat',
    recallNote: 'Tanpa contoh. Tidak ada yang dinilai sampai kamu selesai.',
    shapeLabel: 'Bentuk',
    cleanWrite: 'Urutan dan arahnya benar.',
    compare: 'Bandingkan',
    saveToSheet: 'Simpan ke lembar',
    noStrokeData: 'Data goresan untuk {char} belum tersedia di perangkat ini.',
  },

  coaching: {
    ordinals: ['pertama', 'kedua', 'ketiga', 'keempat', 'kelima', 'keenam', 'ketujuh', 'kedelapan'],
    nthFallback: 'ke-{n}',
    dirRight: 'ditarik ke kanan',
    dirDownRight: 'menyapu turun ke kanan',
    dirDown: 'ditarik lurus ke bawah',
    dirDownLeft: 'menyapu turun ke kiri',
    dirLeft: 'ditarik ke kiri',
    dirUpLeft: 'menyapu naik ke kiri',
    dirUp: 'ditarik lurus ke atas',
    dirUpRight: 'menyapu naik ke kanan',
    reversedWithDir: 'Goresan {nth} ditarik dari arah yang berlawanan — seharusnya {dir}.',
    reversed: 'Goresan {nth} ditarik dari arah yang berlawanan.',
    tooFlat: 'terlalu mendatar',
    tooUpright: 'sedikit terlalu tegak',
    angleWithDir: 'Goresan {nth} {tilt} — di sini goresannya {dir}.',
    angle: 'Goresan {nth} {tilt}.',
    tooShort: 'Goresan {nth} kurang panjang.',
    tooLong: 'Goresan {nth} kelewat panjang.',
    offsetRight: 'ke kanan',
    offsetLeft: 'ke kiri',
    offsetDown: 'ke bawah',
    offsetUp: 'ke atas',
    offset: 'Goresan {nth} agak bergeser {where}.',
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
} as const
