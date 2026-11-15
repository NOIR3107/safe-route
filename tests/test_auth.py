def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_register_and_login(client):
    # Register user
    reg_payload = {
        "name": "Jane Doe",
        "email": "jane@example.com",
        "password": "Password123!",
        "role": "Shelter Manager",
        "phone_number": "+91-9123456789"
    }
    reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == 201
    data = reg_res.json()
    assert data["email"] == "jane@example.com"
    assert data["role"] == "Shelter Manager"

    # Login with JSON
    login_res = client.post("/api/v1/auth/login/json", json={
        "email": "jane@example.com",
        "password": "Password123!"
    })
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"

    # Access /auth/me
    headers = {"Authorization": f"Bearer {token_data['access_token']}"}
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "jane@example.com"


def test_login_invalid_password(client):
    reg_payload = {
        "name": "John Smith",
        "email": "john@example.com",
        "password": "ValidPassword123"
    }
    client.post("/api/v1/auth/register", json=reg_payload)

    login_res = client.post("/api/v1/auth/login/json", json={
        "email": "john@example.com",
        "password": "WrongPassword"
    })
    assert login_res.status_code == 401
