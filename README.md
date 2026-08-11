# HandMotion

HandMotion adalah aplikasi demo React + Vite yang menampilkan pelacakan tangan dan deteksi gesture secara real-time menggunakan MediaPipe Tasks Vision. Aplikasi ini menggabungkan kamera web, overlay kanvas, dan efek visual untuk membuat interaksi tangan menjadi pengalaman visual yang menarik.

## Fitur

- Pelacakan tangan langsung dari kamera web
- Deteksi gesture dengan MediaPipe Gesture Recognizer
- Overlay skeleton dan landmark tangan real-time
- Efek visual interaktif:
  - Blur area berdasarkan orientasi tangan
  - Mosaic area efek distorsi
  - Flip video saat kedua ibu jari bergerak ke atas
- Bloom effect:
  - Deteksi transisi fist ke open palm
  - Memunculkan emoji animasi saat gesture berhasil dikenali
- Kontrol dalam aplikasi:
  - Aktifkan / nonaktifkan kamera
  - Aktifkan / nonaktifkan skeleton overlay
  - Aktifkan / nonaktifkan efek visual

## Teknologi

- React 19
- Vite
- TypeScript
- Tailwind CSS
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)
- TanStack React Router dan React Query
- GSAP untuk animasi
- `@heroui/react` untuk komponen UI

## Struktur Proyek Utama

- `src/components/HandTracker.tsx` - komponen utama deteksi tangan dan gesture
- `src/lib/palmBloom.ts` - deteksi bloom gesture dan event animasi
- `src/routes/index.tsx` - route root yang menampilkan `HandTracker`
- `vite.config.ts` - konfigurasi Vite untuk React, Tailwind, dan path alias
- `package.json` - skrip dan dependensi proyek

## Mulai

1. Install dependensi:

   ```bash
   npm install
   ```

2. Jalankan mode development:

   ```bash
   npm run dev
   ```

3. Buka browser dan kunjungi:

   ```text
   http://localhost:3200
   ```

## Skrip NPM

- `npm run dev` - jalankan server development Vite
- `npm run build` - bangun aplikasi untuk produksi
- `npm run preview` - lihat hasil build produksi secara lokal
- `npm run test` - jalankan tes dengan Vitest
- `npm run lint` - jalankan ESLint
- `npm run format` - jalankan Prettier
- `npm run check` - format dan perbaiki lint otomatis