import { FlatCompat } from '@eslint/eslintrc'

/**
 * ESLint 9 hanya membaca flat config, sedangkan eslint-config-next 15.5 masih
 * diterbitkan dalam format eslintrc lama. FlatCompat adalah jembatan resmi di
 * antara keduanya, dan tetap diperlukan sampai Next menerbitkan flat config-nya
 * sendiri.
 *
 * Berkas ini ada karena tanpanya `next lint` tidak melakukan apa pun: ia
 * melompati linting dan masuk ke prompt setup interaktif. Di runner CI yang
 * tidak punya TTY hasilnya bukan "tidak ada masalah", melainkan pemeriksaan
 * yang tidak pernah berjalan — persis jenis hijau yang lebih berbahaya daripada
 * merah.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

export default [
  {
    ignores: [
      '.next/',
      'out/',
      // Keluaran Serwist, dibangkitkan saat build dan tidak di-commit.
      'public/sw.js',
      'public/swe-worker-*.js',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
]
