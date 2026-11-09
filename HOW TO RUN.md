# Pawang AI - How to Run

Panduan ini ditujukan untuk Windows PowerShell. Jalankan semua perintah dari root repository:

```powershell
cd "C:\Users\ammar\OneDrive\Desktop\Kuliah\Pawang AI"
```

## 1. Instalasi dependency

### Backend Python

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
cd ..
```

### Frontend Next.js

```powershell
cd frontend
npm install
cd ..
```

## 2. Menjalankan aplikasi

### Live mode (rekomendasi)

Live mode mengambil:

- Curah hujan dari Open-Meteo.
- Tinggi muka air dari halaman publik BPBD DKI.
- Fitur statis dan model dari file di `Pawang_Prediction_Model/models`.

```powershell
.\scripts\run-demo.ps1 -Live
```

Buka aplikasi di http://localhost:3000. Tekan `Ctrl+C` untuk menghentikan backend dan frontend.

Qwen bersifat opsional. Tanpa Qwen, backend tetap menggunakan policy deterministik:

```powershell
.\scripts\run-demo.ps1 -Live -Qwen
```

Untuk opsi Qwen/Ollama, pastikan model pada `backend/.env` sudah tersedia.

### Replay mode (data arsip)

Replay mode tidak membutuhkan provider live:

```powershell
.\scripts\run-demo.ps1
```

Tanggal arsip default adalah `2020-02-25`. Untuk memilih tanggal lain:

```powershell
.\scripts\run-demo.ps1 -DemoDate 2020-02-25
```

Mode ini adalah replay data arsip, bukan prediksi live.

## 3. Menjalankan backend dan frontend secara terpisah

### Terminal backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
$env:PAWANG_DATA_MODE = "live"
$env:QWEN_ENABLED = "false"
python -m uvicorn app.main:app --reload --port 8000
```

### Terminal frontend

```powershell
cd frontend
npm run dev
```

Frontend menggunakan backend pada `http://127.0.0.1:8000` secara default. URL tersebut dapat diubah:

```powershell
$env:PAWANG_BACKEND_URL = "http://127.0.0.1:8000"
npm run dev
```

## 4. Pengujian koneksi provider eksternal

### DNS Windows

```powershell
Resolve-DnsName api.open-meteo.com
Resolve-DnsName bpbd.jakarta.go.id
```

Jika muncul error DNS Windows `11001`, bersihkan cache DNS lalu ulangi:

```powershell
ipconfig /flushdns
```

### Open-Meteo rainfall API

```powershell
curl.exe "https://api.open-meteo.com/v1/forecast?latitude=-6.2088&longitude=106.8456&daily=precipitation_sum&timezone=Asia%2FJakarta&past_days=1&forecast_days=1"
```

Respons yang berhasil harus berupa JSON dan memiliki field `daily.time` serta `daily.precipitation_sum`.

Uji melalui Python environment backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -c "import httpx; r=httpx.get('https://api.open-meteo.com/v1/forecast', params={'latitude':-6.2088,'longitude':106.8456,'daily':'precipitation_sum','timezone':'Asia/Jakarta','past_days':1,'forecast_days':1}, timeout=15); print(r.status_code); print(r.text[:500])"
cd ..
```

### BPBD DKI water-level page

```powershell
curl.exe -L "https://bpbd.jakarta.go.id/waterlevel"
```

Respons yang berhasil harus berupa HTML halaman water-level BPBD. Backend melakukan parsing halaman ini dan menyimpan history lokal di `backend/data/tma_live.csv`.

## 5. Pengujian seluruh API backend

Pastikan backend live sudah berjalan pada port `8000`.

### Root dan dokumentasi

```powershell
curl.exe -i "http://127.0.0.1:8000/"
curl.exe "http://127.0.0.1:8000/docs"
```

`/` harus mengarahkan ke `/docs`.

### Health check

```powershell
curl.exe "http://127.0.0.1:8000/api/v1/health"
```

Periksa hasil berikut:

- `status` bernilai `ok`.
- `data_mode` bernilai `live`.
- `tools.get_weather_forecast.available` bernilai `true`.
- `tools.get_water_level.available` bernilai `true`.
- `tma_live.last_ok` terisi setelah BPBD berhasil diambil.
- `tma_live.posts_parsed` lebih besar dari `0` jika halaman BPBD berhasil diparse.

### Heatmap prediksi live

```powershell
curl.exe -i "http://127.0.0.1:8000/api/v1/heatmap?time=5h"
curl.exe -i "http://127.0.0.1:8000/api/v1/heatmap?time=1h"
curl.exe -i "http://127.0.0.1:8000/api/v1/heatmap?time=24h"
```

Respons berhasil harus memiliki:

- HTTP `200`.
- `type: "FeatureCollection"`.
- `features` berisi area kecamatan.
- `metadata.target_date`.
- Properti model seperti `flood_probability`, `risk_level`, dan `rainfall_mm`.

### Analisis satu area

Gunakan `grid_id` yang tersedia di katalog model, misalnya `menteng`:

```powershell
curl.exe -i "http://127.0.0.1:8000/api/v1/analysis?grid_id=menteng&time=5h"
```

Alternatif berdasarkan koordinat:

```powershell
curl.exe -i "http://127.0.0.1:8000/api/v1/analysis?lat=-6.2088&lon=106.8456&time=5h"
```

### Validasi input API

```powershell
curl.exe -i "http://127.0.0.1:8000/api/v1/heatmap?time=invalid"
curl.exe -i "http://127.0.0.1:8000/api/v1/analysis"
curl.exe -i "http://127.0.0.1:8000/api/v1/analysis?grid_id=area-tidak-ada"
```

Hasil yang diharapkan masing-masing adalah HTTP `422`, `422`, dan `404`.

## 6. Pengujian API melalui proxy frontend

Pastikan frontend sudah berjalan pada port `3000`.

```powershell
curl.exe -i "http://127.0.0.1:3000/api/v1/status"
curl.exe -i "http://127.0.0.1:3000/api/v1/heatmap?time=5h"
curl.exe -i "http://127.0.0.1:3000/api/v1/analysis?grid_id=menteng&time=5h"
```

Untuk data model, response heatmap dan analysis harus memiliki header:

```text
X-Pawang-Source: backend
```

Jika header bernilai `mock`, frontend sedang menampilkan data demo bawaan karena backend tidak terjangkau atau tidak menghasilkan data. Jika backend mengembalikan `503 data_unavailable`, frontend akan menampilkan pesan data belum tersedia.

## 7. Automated tests

### Backend

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
cd ..
```

### Prediction model

```powershell
cd Pawang_Prediction_Model
py -m pytest
cd ..
```

### Frontend lint

```powershell
cd frontend
npm run lint
cd ..
```

## 8. Troubleshooting singkat

### `ModuleNotFoundError: No module named 'fastapi'`

Pastikan dependency dipasang di virtual environment backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

Script `scripts/run-demo.ps1` akan memakai `backend\.venv\Scripts\python.exe` jika file tersebut tersedia.

### `ConnectError: [Errno 11001] getaddrinfo failed`

Ini adalah kegagalan DNS Windows. Uji provider secara langsung dengan perintah pada bagian 4, lalu:

```powershell
ipconfig /flushdns
```

Pastikan firewall, proxy, VPN, atau jaringan tidak memblokir `api.open-meteo.com` dan `bpbd.jakarta.go.id`.

### HTTP `503 data_unavailable`

Backend hidup, tetapi data wajib belum berhasil diambil. Lihat pesan response dan health check:

```powershell
curl.exe "http://127.0.0.1:8000/api/v1/health"
curl.exe "http://127.0.0.1:8000/api/v1/heatmap?time=5h"
```

Rainfall adalah data wajib. Jika rainfall gagal, model tidak melakukan prediksi dan backend mengembalikan `503` agar tidak menghasilkan angka palsu.

### Port sudah dipakai

Gunakan port lain:

```powershell
.\scripts\run-demo.ps1 -Live -BackendPort 8001 -FrontendPort 3001
```

