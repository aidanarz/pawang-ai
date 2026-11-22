from app.scraper_pantaubanjir import (
    POS_PENGAMATAN_LOCATIONS,
    get_pos_pengamatan_data,
    find_nearest_pos_pengamatan,
    haversine_distance_km,
)


def test_pos_pengamatan_count_and_locations():
    assert len(POS_PENGAMATAN_LOCATIONS) == 8
    # Cek Waduk Pluit
    assert "waduk pluit" in POS_PENGAMATAN_LOCATIONS
    pluit = POS_PENGAMATAN_LOCATIONS["waduk pluit"]
    assert pluit["lat"] == -6.113900
    assert pluit["lng"] == 106.793300

    # Cek Pos Krukut Hulu
    assert "pos krukut hulu" in POS_PENGAMATAN_LOCATIONS
    krukut = POS_PENGAMATAN_LOCATIONS["pos krukut hulu"]
    assert krukut["lat"] == -6.329200
    assert krukut["lng"] == 106.798100


def test_get_pos_pengamatan_data_returns_all_8_with_status():
    items = get_pos_pengamatan_data()
    assert len(items) == 8
    for item in items:
        assert item.status == "Normal"
        assert item.category == "Pos Pengamatan"
        assert item.updated_at.endswith("WIB")


def test_find_nearest_pos_pengamatan_within_radius():
    # Koordinat di dekat Waduk Pluit: -6.115, 106.795
    nearest = find_nearest_pos_pengamatan(-6.115, 106.795, max_radius_km=10.0)
    assert nearest is not None
    assert nearest["id"] == "OBS-WADUK-PLUIT"
    assert nearest["distance_km"] < 1.0
    assert nearest["is_within_radius"] is True
    assert nearest["status"] == "Normal"


def test_haversine_distance_reasonable():
    # Jarak Jakarta Pusat (-6.2, 106.8) ke Katulampa (-6.6331, 106.8369) ~ 48 km
    dist = haversine_distance_km(-6.2, 106.8, -6.6331, 106.8369)
    assert 40 < dist < 55
