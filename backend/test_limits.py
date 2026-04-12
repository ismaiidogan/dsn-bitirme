import asyncio
import httpx


API = "http://localhost:8000/api/v1"
EMAIL = "testkullanici@test.com"
PASSWORD = "Test1234!"


async def main() -> None:
    async with httpx.AsyncClient() as client:
        # Login as test user
        r = await client.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
        r.raise_for_status()
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1) File size limit test (> 5 GB)
        too_big_size = 6 * 1024 * 1024 * 1024  # 6 GB
        resp = await client.post(
            f"{API}/files/upload/init",
            headers=headers,
            json={
                "filename": "too_big.bin",
                "size_bytes": too_big_size,
                "mime_type": "application/octet-stream",
                "replication_factor": 1,
            },
        )
        print("size_limit_status", resp.status_code, resp.text)

        # 2) Not enough active nodes for replication_factor = 2
        resp2 = await client.post(
            f"{API}/files/upload/init",
            headers=headers,
            json={
                "filename": "small_2rep.bin",
                "size_bytes": 1 * 1024 * 1024,
                "mime_type": "application/octet-stream",
                "replication_factor": 2,
            },
        )
        print("replication_limit_status", resp2.status_code, resp2.text)


if __name__ == "__main__":
    asyncio.run(main())

