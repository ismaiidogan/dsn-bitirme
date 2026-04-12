def test_health_returns_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_ready_returns_200_or_503(client):
    """DB ve Redis hazırsa 200, değilse 503 döner."""
    r = client.get("/health/ready")
    assert r.status_code in (200, 503)
    data = r.json()
    assert "status" in data
    if r.status_code == 200:
        assert data["status"] == "ok"
    else:
        assert data["status"] == "unhealthy"
        assert "errors" in data
