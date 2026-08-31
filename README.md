# Monitor Hub — UPT Palangkaraya

One dashboard for performance, asset, reliability & operational monitoring.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) (redirect otomatis ke `/dashboard`).

## Menghubungkan Google Drive

Dashboard membaca data dari spreadsheet yang ada di **satu folder Google Drive**, lewat service account (bukan akun pribadi) — read-only dan tidak tergantung siapa yang sedang login. Anda tinggal menaruh/mengganti file di folder itu; kode tidak perlu tahu ID spreadsheet mana pun, sistem menemukannya sendiri **berdasarkan nama file**.

```text
Google Drive
  └── 📁 MONITORING UPT PALANGKARAYA     ← GOOGLE_DRIVE_FOLDER_ID menunjuk ke sini
        ├── 📊 Kinerja ULTG              ← dicari berdasarkan nama, bukan ID
        ├── 📊 Gangguan
        └── 📊 ...
```

Ikuti langkah ini sekali saja per environment (lokal, staging, production masing-masing punya credential sendiri kalau perlu).

Ada **dua cara** untuk website ini terhubung ke Drive — pilih salah satu:

| | Cara A — Google API | Cara B — Apps Script Gateway |
|---|---|---|
| Setup | Google Cloud project + service account (lebih banyak langkah, sekali saja) | Deploy satu script, tanpa Google Cloud project (lebih cepat) |
| Kredensial di web app | Service account JSON (email + private key) | Hanya 1 URL (+ secret opsional) — tidak ada Google credential sama sekali |
| Support `.xlsx` | Ya, langsung | Tidak — hanya Google Sheets native (lihat [apps-script/README.md](apps-script/README.md)) |
| Cocok untuk | Setup awal, atau kalau ada file `.xlsx` | Setelah semua data jadi Google Sheets native, atau kalau ingin nol credential Google di server |

Keduanya bisa dipasang berdampingan — env var `DATA_PROVIDER` menentukan mana yang dipakai (`google-api` kalau kosong/tidak diisi, atau `apps-script`). Kalau baru mulai, ikuti **Cara A** dulu (langkah 1–7 di bawah); pindah ke **Cara B** kapan saja nanti tanpa mengubah kode.

### Cara A — Google API (service account)

### 1. Buat Google Cloud Project

1. Buka [console.cloud.google.com](https://console.cloud.google.com/)
2. Klik dropdown project di pojok kiri atas → **New Project**
3. Beri nama misalnya `monitor-hub-upt-plk` → **Create**

### 2. Aktifkan Google Drive API dan Google Sheets API

1. Masih di project yang sama, buka **APIs & Services → Library**
2. Cari "Google Drive API" → klik → **Enable**
3. Cari "Google Sheets API" → klik → **Enable**

### 3. Buat Service Account

1. Buka **APIs & Services → Credentials**
2. **Create Credentials → Service account**
3. Isi nama (misalnya `drive-reader`) → **Create and Continue** → **Done** (role tidak perlu diisi, akses diatur lewat sharing folder, bukan IAM)
4. Klik service account yang baru dibuat → tab **Keys** → **Add Key → Create new key** → pilih **JSON** → **Create**
5. File JSON akan otomatis terdownload. Simpan baik-baik, ini kredensial rahasia (jangan pernah commit ke git atau kirim lewat chat)

### 4. Buat folder di Drive dan share ke service account

1. Buat satu folder khusus di Google Drive, misalnya **"MONITORING UPT PALANGKARAYA"**
2. Masukkan semua spreadsheet data ke dalam folder ini (boleh Google Sheets native, boleh file `.xlsx`)
3. Buka file JSON yang didownload tadi, cari field `client_email` (formatnya `xxx@xxx.iam.gserviceaccount.com`)
4. Klik kanan folder tersebut di Drive → **Share** → tempel email itu → beri akses **Viewer** → **Send**

Cukup share **folder-nya saja** — semua spreadsheet di dalamnya (termasuk yang ditambahkan nanti) otomatis ikut terbaca, tidak perlu share satu-satu.

### 5. Isi environment variable

1. Copy `.env.example` menjadi `.env.local`
2. Dari file JSON, isi:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` — nilai `client_email`
   - `GOOGLE_PRIVATE_KEY` — nilai `private_key` (sudah dalam bentuk satu baris dengan `\n` literal, tinggal copy-paste apa adanya di antara tanda kutip)
3. Buka folder Drive tadi di browser, salin ID-nya dari URL:
   `https://drive.google.com/drive/folders/`**`ID_INI`**
4. Isi `GOOGLE_DRIVE_FOLDER_ID=ID_INI` — ini **satu-satunya** ID yang perlu diisi, untuk semua modul.

### 6. Sesuaikan nama file & sheet

Setiap data source didaftarkan di [src/config/data-sources.ts](src/config/data-sources.ts) — isi `file` dan `sheets[].name` sesuai nama file/tab di Drive Anda persis (case-sensitive untuk nama sheet; nama file dicocokkan tanpa memedulikan huruf besar/kecil dan ekstensi `.xlsx`/`.xls`).

Sheet lain di dalam file yang sama (Pivot, Dashboard, Backup, dll.) **tidak pernah dibaca** — hanya sheet yang eksplisit terdaftar di config.

Untuk **Kinerja ULTG** (sudah aktif): file bernama "Kinerja ULTG" (Google Sheet native atau "Kinerja ULTG.xlsx"), sheet "Kinerja ULTG", dengan baris header:

| ULTG | KPI | Target | Actual | Actual Bulan Lalu |
|---|---|---|---|---|
| ULTG Palangkaraya | Performance Score | 90 | 92 | 88 |

- `ULTG`, `Target`, `Actual` wajib diisi — baris tanpa salah satu ini akan dilewati (tidak sampai membuat dashboard error)
- `KPI` opsional, default "Performance Score" kalau kosong
- `Actual Bulan Lalu` opsional — kalau ada, dipakai untuk menghitung arah tren (naik/turun/tetap)

### 7. Restart dev server

Environment variable baru hanya terbaca saat server start, jadi setelah mengisi `.env.local`, matikan dan jalankan ulang `npm run dev`. Cek halaman **Data & Sync** di sidebar untuk melihat status sinkronisasi per file+sheet (Healthy / Belum terhubung / Gagal sinkronisasi beserta pesan errornya), dan status "Data Provider" di bagian atas halaman itu.

### Cara B — Google Apps Script Gateway

Kalau lebih suka tidak menyimpan credential Google apa pun di server web app:

1. Buat folder Drive dan masukkan spreadsheet — sama seperti langkah 4 di Cara A (tanpa perlu Google Cloud project/service account)
2. Buka [script.google.com](https://script.google.com/) → **New project**
3. Copy-paste 4 file dari folder [apps-script/](apps-script/) ke editor Apps Script (detail lengkap termasuk nama file yang harus sama persis: lihat [apps-script/README.md](apps-script/README.md))
4. Set Script Property `MONITORING_FOLDER_ID` = ID folder Drive Anda
5. **Deploy → New deployment → Web app**, Execute as: Me, Who has access: Anyone
6. Copy Web App URL (diakhiri `/exec`)
7. Isi `.env.local`: `DATA_PROVIDER=apps-script` dan `GOOGLE_APPS_SCRIPT_URL=<url tadi>`
8. Restart `npm run dev`, cek halaman **Data & Sync** — "Data Provider" harus menunjukkan "Google Apps Script Gateway" dengan status Healthy

Detail lengkap, API contract, dan batasan `.xlsx` untuk cara ini: [apps-script/README.md](apps-script/README.md).

## Kalau nama file atau sheet berubah/hilang

Sistem tidak pernah crash karena ini:

- **File tidak ditemukan** di folder (nama beda, terhapus, dipindah) → modul terkait tampil "Data source temporarily unavailable" untuk user publik; halaman **Data & Sync** menunjukkan `File "..." tidak ditemukan di folder Google Drive` untuk admin
- **Sheet tidak ditemukan** di dalam file (tab di-rename) → sama, tapi pesannya `Sheet "..." tidak ditemukan di file "..."`
- Modul lain yang sumbernya sehat tetap tampil normal — satu sumber data yang bermasalah tidak menjatuhkan seluruh dashboard

## Cara menambahkan spreadsheet baru

**Jujur soal batasannya**: menambah/mengubah *isi* spreadsheet (baris data) otomatis terbaca dashboard setelah cache expired — tidak perlu sentuh kode. Tapi menambah *modul baru* (Gangguan, ABO, dst.) tetap butuh sedikit kerja kode satu kali (daftarkan di registry + tulis normalizer) — bukan "tinggal taruh file, semua otomatis dikenali" untuk kolom yang belum pernah didefinisikan.

Untuk modul yang **sudah terdaftar** di `src/config/data-sources.ts` (baru Kinerja ULTG saat ini):

1. Buka folder Drive Monitoring
2. Masukkan/update spreadsheet — nama file & nama sheet harus persis sama dengan yang di registry
3. Isi data sesuai kolom header yang diharapkan (lihat bagian "Sesuaikan nama file & sheet" di atas)
4. Selesai — dashboard membaca ulang otomatis begitu cache (`DATA_CACHE_TTL_MINUTES`, default 5 menit) kedaluwarsa, tanpa restart atau deploy ulang

Untuk **modul yang belum ada** (Gangguan, Open Case, ABO, dst.), mengikuti pola Kinerja ULTG — **tidak perlu connector/env var baru**, cukup:

1. Tambahkan entri baru di `src/config/data-sources.ts` — sebutkan `file` dan `sheets` yang dipakai:
   - Satu modul boleh membaca beberapa file (`sources: [{...}, {...}]`)
   - Satu file boleh dipakai beberapa modul (mis. `KPI` menyuplai ABO/4DX/CE/AHI sekaligus — daftarkan 4 entri modul yang sama-sama menunjuk `file: "KPI"` dengan `sheets` berbeda)
   - Satu file boleh punya beberapa sheet terpilih (`sheets: [{name: "..."}, {name: "..."}]`) — sheet lain di file yang sama tidak pernah dibaca
   - `sheets[].required: false` — kalau sheet ini hilang, modul tetap dianggap tersedia (pakai untuk data pelengkap, bukan inti)
   - `sources[].enabled: false` — file ini dilewati sepenuhnya (tidak di-request sama sekali), untuk modul yang belum siap datanya
2. Buat service baru di `src/services/` — panggil `readConfiguredSource()` dari `src/lib/data-connector.ts` (cache sudah otomatis di level ini, service tidak perlu bikin cache sendiri), lalu normalisasi/validasi tiap baris, hitung KPI lewat `src/lib/kpi-engine.ts`. Kalau modul punya sheet `required`, gunakan `hasAllRequiredSheets()` untuk menentukan apakah modul dianggap tersedia.
3. Panggil service tersebut dari halaman terkait di `src/app/dashboard/`

## Arsitektur data

```
                              GOOGLE_DRIVE_FOLDER_ID / GOOGLE_APPS_SCRIPT_URL
                                              │
                        ┌─────────────────────┴─────────────────────┐
                        ▼                                           ▼
        src/lib/providers/google-api-provider.ts     src/lib/providers/apps-script-provider.ts
        (service account → Drive API + Sheets API)    (HTTP → apps-script/ gateway)
                        │                                           │
                        └─────────────────────┬─────────────────────┘
                                              ▼
                          src/lib/data-provider.ts (SpreadsheetDataProvider)
                            picked at runtime by DATA_PROVIDER — see
                                 src/lib/data-provider-registry.ts
                                              │
                                              ▼
                          src/lib/data-connector.ts (orkestrasi per file+sheet,
                                cache raw rows per provider+file+sheet,
                                catat status ke sync-status.ts)
                                              │
                                              ▼
                          src/services/*.ts (validasi, normalisasi,
                                hitung KPI via kpi-engine.ts)
                                              │
                                              ▼
                          src/app/dashboard/*/page.tsx (Server Component)
```

`src/services/ultg-performance.ts` (dan setiap modul berikutnya) memanggil `readConfiguredSource()` tanpa tahu — dan tidak perlu tahu — provider mana yang aktif, dan tidak perlu bikin cache sendiri (sudah ditangani terpusat di connector, keyed per provider+file+sheet — lihat `src/lib/data-connector.ts`). Setiap service mengembalikan `{ data, error }` — kalau sumbernya gagal diakses, halaman tetap tampil dengan pesan "Data source temporarily unavailable" (bukan crash), dan detail teknisnya hanya muncul di halaman **Data & Sync** untuk admin.

## Status env var

| Variable | Dipakai oleh | Wajib jika |
|---|---|---|
| `DATA_PROVIDER` | `data-provider-registry.ts` | Opsional — default `google-api` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` | google-api provider | `DATA_PROVIDER` kosong atau `google-api` |
| `GOOGLE_DRIVE_FOLDER_ID` | google-api provider | sama seperti di atas |
| `GOOGLE_APPS_SCRIPT_URL`, `GOOGLE_APPS_SCRIPT_SECRET` | apps-script provider | `DATA_PROVIDER=apps-script` |
| `DATA_CACHE_TTL_MINUTES`, `DRIVE_DISCOVERY_CACHE_TTL_MINUTES` | kedua provider | Opsional |

Isi hanya baris yang relevan dengan provider yang Anda pakai — tidak masalah kalau baris provider lain dibiarkan kosong di `.env.local`.

## Deploy

Bisa dideploy ke [Vercel](https://vercel.com/new) atau platform Node.js lain (tidak butuh VPS/server sendiri — Apps Script sudah jadi managed gateway kalau pakai Cara B). Pastikan environment variable yang relevan dari `.env.local` juga diisi di pengaturan environment platform tersebut — jangan pernah commit `.env.local` ke git.
