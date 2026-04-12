import json
import sys
import urllib.error
import urllib.request


BASE_URL = "http://localhost:8000/api/v1"
EMAIL = "testuser@example.com"
PASSWORD = "Test1234!"


def post(path: str) -> urllib.response.addinfourl:
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return urllib.request.urlopen(req)


def main() -> int:
    try:
        # First try to log in as existing test user
        resp = post("/auth/login")
        data = json.loads(resp.read().decode("utf-8"))
        print("ACCESS_TOKEN:", data.get("access_token", ""))
        return 0
    except urllib.error.HTTPError as e:
        if e.code != 401:
            # Unexpected error
            sys.stderr.write(f"login error {e.code}: {e.read().decode('utf-8')}\n")
            return 1

    # If login failed with 401, register the user and return its access token
    try:
        resp = post("/auth/register")
        data = json.loads(resp.read().decode("utf-8"))
        print("ACCESS_TOKEN:", data.get("access_token", ""))
        return 0
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"register error {e.code}: {e.read().decode('utf-8')}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

