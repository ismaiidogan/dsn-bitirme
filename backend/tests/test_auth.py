def test_register_invalid_email_returns_422(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "password": "ValidPass1"},
    )
    assert r.status_code == 422


def test_register_short_password_returns_422(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "short"},
    )
    assert r.status_code == 422


def test_login_invalid_email_returns_422(client):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "bad-email", "password": "anything"},
    )
    assert r.status_code == 422
