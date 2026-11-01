"""Konfigurasi terpusat: path, alias nama kolom, dan parameter training."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Paths:
    data_dir: Path
    models_dir: Path

    # --- input mentah (diisi manual oleh Anda) ---
    @property
    def raw_flood(self) -> Path:
        return self.data_dir / "raw" / "flood"

    @property
    def raw_tma(self) -> Path:
        return self.data_dir / "raw" / "tma"

    @property
    def raw_dem(self) -> Path:
        return self.data_dir / "raw" / "dem"

    @property
    def centroids_csv(self) -> Path:
        return self.data_dir / "raw" / "kelurahan_centroids.csv"

    @property
    def tma_stations_csv(self) -> Path:
        return self.data_dir / "raw" / "tma_stations.csv"

    # --- hasil antara dan akhir (dibuat oleh skrip) ---
    @property
    def interim(self) -> Path:
        return self.data_dir / "interim"

    @property
    def rain_dir(self) -> Path:
        return self.interim / ("rain" if RAIN_SOURCE == "openmeteo" else f"rain_{RAIN_SOURCE}")

    @property
    def processed(self) -> Path:
        return self.data_dir / "processed"

    @property
    def train_table(self) -> Path:
        return self.processed / ("train_table.parquet" if RAIN_SOURCE == "openmeteo" else f"train_table_{RAIN_SOURCE}.parquet")

    def unit_table(self, level: str | None = None) -> Path:
        """Tabel training pada unit prediksi (kelurahan = tabel dasar; kecamatan/kota = hasil agregasi)."""
        level = level or UNIT
        if level == "kelurahan":
            return self.train_table
        return self.train_table.with_name(f"{self.train_table.stem}_{level}.parquet")

    def ensure(self) -> "Paths":
        for p in (self.raw_flood, self.raw_tma, self.raw_dem, self.interim,
                  self.rain_dir, self.processed, self.models_dir):
            p.mkdir(parents=True, exist_ok=True)
        return self


def get_paths(data_dir=None, models_dir=None) -> Paths:
    d = Path(data_dir or os.environ.get("PAWANG_DATA_DIR", ROOT / "data"))
    m = Path(models_dir or os.environ.get("PAWANG_MODELS_DIR", ROOT / "models"))
    return Paths(d, m)


# ------------------------------------------------------------------ umum
TIMEZONE = "Asia/Jakarta"
# Unit prediksi: "kecamatan" (default, tampilan utama), "kelurahan" atau "kota". Dipilih lewat PAWANG_UNIT.
# Kecamatan: presisi lebih tinggi pada recall sama dibanding kelurahan (lihat README bagian 5).
UNIT = os.environ.get("PAWANG_UNIT", "kecamatan").lower()
if UNIT not in ("kelurahan", "kecamatan", "kota"):
    raise ValueError(f"PAWANG_UNIT tidak dikenal: {UNIT}")
# Sumber hujan historis: "openmeteo" (reanalisis ~10 km, default), "imerg" (NASA GPM IMERG Final 0,1 derajat,
# butuh EARTHDATA_TOKEN) atau "chirps" (satelit + stasiun, 0,05 derajat).
# Dipilih lewat variabel lingkungan PAWANG_RAIN_SOURCE agar cache dan tabel training tiap sumber terpisah.
RAIN_SOURCE = os.environ.get("PAWANG_RAIN_SOURCE", "openmeteo").lower()
if RAIN_SOURCE not in ("openmeteo", "imerg", "chirps"):
    raise ValueError(f"PAWANG_RAIN_SOURCE tidak dikenal: {RAIN_SOURCE}")
RAIN_GRID_DEG = 0.05 if RAIN_SOURCE == "chirps" else 0.1   # koordinat kelurahan dibulatkan ke grid ini
WET_DAY_MM = 1.0         # ambang "hari hujan"
USE_LATLON = False       # lat/lon sebagai fitur: dimatikan karena tidak menggeneralisasi antar tahun (data banjir sedikit)
SEED = 42

# ------------------------------------------------------------------ alias nama kolom
# Nama kolom dinormalisasi (huruf kecil, spasi -> _) sebelum dicocokkan.
# Jika file Anda memakai nama lain, tambahkan di sini. Jalankan `python -m src.audit_data`
# untuk melihat kolom yang ada di file Anda.
FLOOD_ALIASES = {
    "date": ["tanggal_kejadian", "tanggal", "tgl_kejadian", "tgl", "date"],
    "kecamatan": ["kecamatan", "kec"],
    "kelurahan": ["kelurahan", "kel", "desa_kelurahan"],
    "height": ["ketinggian_air", "tinggi_air", "tinggi_genangan"],
}
TMA_ALIASES = {
    "time": ["waktu", "tanggal", "tgl", "datetime", "date", "tanggal_waktu", "timestamp"],
    "station": ["nama_pos", "nama_pos_pantau", "pos_pantau", "pos", "lokasi",
                "nama_pintu_air", "pintu_air", "stasiun", "nama_stasiun", "nama_lokasi"],
    "level": ["tinggi_air", "tinggi_muka_air", "tma", "ketinggian_air", "tinggi", "ketinggian"],
    "lat": ["lat", "latitude"],
    "lon": ["lon", "lng", "longitude", "long"],
}
TMA_UNIT_DIVISOR = 10   # satuan mentah satudata = mm; model memakai cm
TMA_STATION_FIX = {     # salah ketik nama pos tanpa koordinat -> nama benar (bentuk norm_name)
    "p a kali duri kalijodo": "pompa kali duri kalijodo",
    "p a istiqal": "p a istiqlal",
}
CENTROID_ALIASES = {
    "kelurahan": ["kelurahan", "kel", "nama_kelurahan"],
    "kecamatan": ["kecamatan", "kec", "nama_kecamatan"],
    "lat": ["lat", "latitude"],
    "lon": ["lon", "lng", "longitude", "long"],
}
STATION_FILE_ALIASES = {
    "station": ["station", "station_id", "nama_pos", "pos", "lokasi", "stasiun", "nama_stasiun"],
    "lat": ["lat", "latitude"],
    "lon": ["lon", "lng", "longitude", "long"],
}

# ------------------------------------------------------------------ training
MIN_POSITIVES_PER_SPLIT = 5
RECALL_TARGET_MEDIUM = 0.90   # ambang "medium" dipilih agar recall >= nilai ini pada data validasi
CALIBRATION = "sigmoid"       # "sigmoid" (mulus, ranking terjaga) atau "auto" (isotonic bila positif validasi cukup)
MIN_POS_FOR_ISOTONIC = 100    # dipakai hanya jika CALIBRATION = "auto". Isotonic membuat skor kembar (ties) dan
                              # menurunkan PR-AUC sangat jauh pada data banjir yang jarang
MODEL_ALGO = "logistic"      # "logistic" (regresi logistik, JSON) atau "xgboost"; lihat README bagian 5
LOGISTIC_C = 0.01            # kekuatan regularisasi L2 (lebih kecil = lebih kuat)
XGB_PARAMS = dict(          # konservatif: pohon dangkal + regularisasi besar (data banjir sedikit, mudah overfit)
    n_estimators=1500,
    learning_rate=0.03,
    max_depth=3,
    min_child_weight=20,
    subsample=0.7,
    colsample_bytree=0.7,
    reg_lambda=20.0,
    reg_alpha=1.0,
    gamma=1.0,
    tree_method="hist",
    eval_metric="aucpr",
    early_stopping_rounds=50,
    n_jobs=-1,
)
