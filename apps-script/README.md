# Apps Script Gateway

Companion to the main [README.md](../README.md) "Menghubungkan Google Drive" section — read that first for the non-technical numbered walkthrough. This file is the technical reference for what's actually in this folder.

## Apa ini

Sebuah Google Apps Script yang di-deploy sebagai **Web App**, berfungsi sebagai gateway read-only ke satu folder Google Drive. Web app Next.js memanggilnya lewat HTTP (`GOOGLE_APPS_SCRIPT_URL`) alih-alih memakai service account + Drive API langsung (`DATA_PROVIDER=apps-script` — lihat `src/lib/providers/apps-script-provider.ts`).

Tidak ada business logic (KPI, achievement, dsb) di sini — murni data pipe: terima request → cari file → baca sheet yang diminta → kembalikan JSON.

## File

- `Code.gs` — entry point (`doPost`/`doGet`), dispatch per `action`, error normalization
- `config.gs` — baca Script Properties (`MONITORING_FOLDER_ID`, `API_SECRET`)
- `drive-service.gs` — file discovery by name, deteksi duplicate
- `spreadsheet-service.gs` — baca sheet terpilih (Google Sheets native saja — lihat batasan `.xlsx` di bawah)
- `ahi-history.gs` — trigger terjadwal (bukan bagian dari `doPost`/`doGet` web app) yang mencatat riwayat hasil uji AHI dari waktu ke waktu — lihat "Riwayat Pengujian AHI" di bawah

## Cara deploy

1. Buka [script.google.com](https://script.google.com/) → **New project**
2. Hapus isi default `Code.gs`, lalu copy-paste isi ke-5 file di folder ini satu per satu (buat file baru di editor Apps Script untuk masing-masing lewat ikon **+** di sebelah "Files" — nama file harus persis sama: `Code.gs`, `config.gs`, `drive-service.gs`, `spreadsheet-service.gs`, `ahi-history.gs`)
3. Buka **Project Settings** (ikon gear) → **Script Properties** → **Add script property**:
   - `MONITORING_FOLDER_ID` = ID folder Drive Anda
   - `API_SECRET` (opsional) = string acak sembarang, kalau mau proteksi tambahan
4. **Deploy → New deployment** → pilih tipe **Web app**
   - **Execute as**: Me (akun Anda — supaya script punya akses ke Drive Anda)
   - **Who has access**: Anyone (Web App URL-nya sendiri adalah rahasia — jangan dibagikan; kalau mau proteksi ekstra, isi `API_SECRET` di atas)
5. **Deploy** → copy **Web app URL** (formatnya diakhiri `/exec`)
6. Isi ke `.env.local` project Next.js: `GOOGLE_APPS_SCRIPT_URL=<url tadi>`, dan `GOOGLE_APPS_SCRIPT_SECRET=<isi API_SECRET tadi, kalau diisi>`

Setiap kali Anda mengubah isi `.gs`, harus **Deploy → Manage deployments → Edit (ikon pensil) → New version → Deploy** lagi — Web App URL yang sama tidak otomatis memakai kode terbaru.

## API contract

Semua request `POST` ke Web App URL, body JSON, satu field wajib: `action`.

**health**
```json
{ "action": "health" }
```
```json
{ "success": true, "data": { "status": "healthy" } }
```

**findFile**
```json
{ "action": "findFile", "fileName": "Kinerja ULTG" }
```
```json
{ "success": true, "data": { "id": "1AbC...", "name": "Kinerja ULTG", "mimeType": "application/vnd.google-apps.spreadsheet" } }
```

**readSheet**
```json
{ "action": "readSheet", "fileName": "Kinerja ULTG", "sheetName": "Kinerja ULTG" }
```
```json
{
  "success": true,
  "data": { "headers": ["ULTG", "KPI", "Target", "Actual"], "rows": [["ULTG Palangkaraya", "Performance Score", 90, 92]] },
  "meta": { "fileName": "Kinerja ULTG", "sheetName": "Kinerja ULTG", "rowCount": 1, "retrievedAt": "2026-08-31T07:00:00.000Z" }
}
```

**readSheets** (multi-sheet, one file)
```json
{ "action": "readSheets", "fileName": "KPI", "sheets": ["ABO", "4DX", "CE", "AHI"] }
```
```json
{ "success": true, "data": { "file": "KPI", "sheets": { "ABO": { "headers": [], "rows": [] }, "4DX": { "headers": [], "rows": [] }, "CE": {...}, "AHI": {...} } } }
```
A sheet that fails independently comes back as `{ "error": { "code": "...", "message": "..." } }` in its own slot — the others still return normally.

**Error shape** (any action)
```json
{ "success": false, "error": { "code": "FILE_NOT_FOUND", "message": "File \"Gangguan\" tidak ditemukan di folder Google Drive." } }
```

Codes: `FILE_NOT_FOUND`, `AMBIGUOUS_SOURCE`, `SHEET_NOT_FOUND`, `UNSUPPORTED_FORMAT`, `UNAUTHORIZED`, `INVALID_REQUEST`, `UNKNOWN_ACTION`, `UPSTREAM_ERROR` (catch-all — the actual exception detail is deliberately not forwarded).

If `API_SECRET` is set as a Script Property, every request must include a matching `"secret"` field or it gets `UNAUTHORIZED`.

## Batasan `.xlsx` (didokumentasikan, bukan disembunyikan)

`SpreadsheetApp` (API Apps Script untuk baca spreadsheet) **hanya bisa membuka Google Sheets native** — tidak bisa membaca file `.xlsx`/`.xls` biner secara langsung. Gateway ini sengaja **tidak** auto-convert `.xlsx` ke Google Sheets di setiap request (itu akan membuat file duplikat sementara di Drive setiap kali dibaca — boros quota dan berisiko data basi, persis yang ingin dihindari).

Kalau sebuah file di folder Anda masih `.xlsx`, ada dua pilihan:
1. Biarkan `DATA_PROVIDER=google-api` untuk file itu (reader-nya sudah bisa parse `.xlsx` langsung lewat SheetJS)
2. Convert file itu ke Google Sheets native sekali saja (klik kanan file di Drive → **Open with → Google Sheets**, lalu hapus/arsipkan file `.xlsx` aslinya)

`DATA_PROVIDER` adalah pengaturan global (semua source pakai provider yang sama) — kalau sebagian file Anda `.xlsx` dan sebagian native, untuk saat ini pilih `google-api` (mendukung keduanya) sampai semua file sudah dikonversi ke native, baru pindah ke `apps-script`.

## Riwayat Pengujian AHI

Sheet Input AHI (`Input LA`, `Input PMS`, `Input PT`, `Input PMT`, `Input CT`) hanya menyimpan **hasil uji terakhir** per peralatan — begitu diuji ulang, hasil lama tertimpa begitu saja, tidak ada riwayatnya. `ahi-history.gs` menambahkan satu spreadsheet terpisah ("AHI UPT Palangkaraya - Riwayat Pengujian", di folder monitoring yang sama) yang bertambah setiap ada hasil uji baru, tanpa menghapus yang lama.

Ini **bukan** bagian dari web app (`doPost`/`doGet`) — dua fungsi di `ahi-history.gs` dipanggil langsung dari trigger terjadwal Apps Script, jalan sendiri di Google tanpa bergantung ada yang membuka dashboard. Cara kerjanya murni mekanis: tiap baris di sheet Input dibandingkan kolom TANGGAL PEMELIHARAAN TERAKHIR-nya dengan yang terakhir tercatat untuk pasangan (BAY, TECHIDENT) yang sama — kalau beda, baris itu disalin apa adanya ke sheet Riwayat yang sesuai. Tidak ada skoring/klasifikasi di sini (itu tetap di `src/services/ahi-bay-line-report.ts`), jadi tanggal pertama kali dijalankan otomatis jadi baseline (titik data pertama = hasil uji yang berlaku saat itu), dan data yang sudah tertimpa sebelum trigger ini pernah berjalan tidak bisa dipulihkan.

**Setup (sekali saja):**

1. Pastikan `ahi-history.gs` sudah di-copy ke project Apps Script Anda (langkah 2 di atas)
2. Di editor Apps Script, pilih fungsi **`setupAhiHistoryFile`** dari dropdown di sebelah tombol Run, lalu klik **Run**
   - Kalau ini pertama kali, Apps Script akan minta izin akses — setujui (izin ini sama dengan yang sudah dipakai gateway untuk baca Drive Anda)
   - Fungsi ini membuat file "AHI UPT Palangkaraya - Riwayat Pengujian" (kalau belum ada) di folder monitoring yang sama, dengan 5 tab (`Riwayat LA`, `Riwayat PMS`, `Riwayat PT`, `Riwayat PMT`, `Riwayat CT`) yang header-nya disalin persis dari sheet Input masing-masing
   - Cek log run (ikon jam di sisi kiri bawah) untuk link ke file yang baru dibuat
3. Buka panel **Triggers** (ikon jam di sidebar kiri editor) → **Add Trigger**:
   - Function to run: `syncAhiHistorySnapshot`
   - Event source: **Time-driven**
   - Pilih tipe (disarankan **Day timer**, jam berapa saja yang nyaman — mis. dini hari)
   - Save
4. Selesai — trigger ini akan jalan sendiri sesuai jadwal, tidak perlu redeploy web app (dua fungsi ini tidak melalui `doPost`/`doGet`)

Setelah beberapa siklus pengujian berjalan, sheet Riwayat ini yang akan dibaca dashboard untuk menampilkan tren hasil uji per peralatan dari waktu ke waktu.

## Keamanan

- Tidak ada credential Google yang perlu dimasukkan ke web app Next.js sama sekali untuk provider ini — hanya URL Web App (dan secret opsional)
- Script hanya bisa mengakses folder yang ID-nya ada di `MONITORING_FOLDER_ID` — tidak ada akses Drive di luar itu
- "Execute as: Me" berarti script berjalan dengan izin akun Google Anda sendiri, bukan izin siapa pun yang memanggil URL — makanya `API_SECRET` (opsional) berguna kalau URL ini sampai bocor
- Jangan commit Web App URL beserta `API_SECRET` ke tempat publik (keduanya masuk `.env.local`, sudah ter-`.gitignore`)
