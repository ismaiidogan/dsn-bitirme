import os
import asyncio
import hashlib

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


API = "http://localhost:8000/api/v1"
EMAIL = "testkullanici@test.com"
PASSWORD = "Test1234!"

CHUNK_SIZE = 16 * 1024 * 1024  # 16 MB
FILENAME = "test_50mb.bin"

# Bu senaryoda iki kopya (replication_factor = 2) kullanılıyor.
REPLICATION_FACTOR = 2


async def main() -> None:
  # Read file contents from disk so we can verify download equality.
  size = os.path.getsize(FILENAME)
  with open(FILENAME, "rb") as f:
    data = f.read()
  assert len(data) == size

  async with httpx.AsyncClient() as client:
    # Login as test user
    r = await client.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    r.raise_for_status()
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Init upload with replication_factor = REPLICATION_FACTOR
    init = await client.post(
      f"{API}/files/upload/init",
      headers=headers,
      json={
        "filename": FILENAME,
        "size_bytes": size,
        "mime_type": "application/octet-stream",
        "replication_factor": REPLICATION_FACTOR,
      },
    )
    init.raise_for_status()
    manifest = init.json()
    file_id = manifest["file_id"]

    # Use AES key from manifest (same for all chunks)
    aes_key_hex = manifest["chunks"][0]["aes_key_hex"]
    key_bytes = bytes.fromhex(aes_key_hex)
    aesgcm = AESGCM(key_bytes)

    # Upload each chunk to first node in list
    for item in manifest["chunks"]:
      idx = item["chunk_index"]
      start = idx * CHUNK_SIZE
      end = start + item["size_bytes"]
      plaintext = data[start:end]

      iv = bytes.fromhex(item["iv"])
      ciphertext = aesgcm.encrypt(iv, plaintext, None)

      sha = hashlib.sha256(ciphertext).hexdigest()
      node_url = item["node_urls"][0]
      node_token = item["node_tokens"][0]

      res = await client.put(
        f"{node_url}/chunks/{item['chunk_id']}",
        content=ciphertext,
        headers={
          "Content-Type": "application/octet-stream",
          "X-Chunk-Hash": sha,
          "X-Chunk-Size": str(len(ciphertext)),
          "Authorization": f"Bearer {node_token}",
        },
      )
      res.raise_for_status()

    # Short delay to allow confirm callbacks to update replica statuses.
    await asyncio.sleep(1)

    # Complete upload
    comp = await client.post(
      f"{API}/files/upload/complete",
      headers=headers,
      json={"file_id": file_id},
    )
    print("complete status", comp.status_code, comp.text)
    comp.raise_for_status()

    # Download manifest and reconstruct file to verify equality
    man = await client.get(f"{API}/files/{file_id}/download-manifest", headers=headers)
    man.raise_for_status()
    dman = man.json()

    chunks: list[bytes] = [b""] * len(dman["chunks"])
    for ch in dman["chunks"]:
      res = await client.get(
        f"{ch['node_url']}/chunks/{ch['chunk_id']}",
        headers={"Authorization": f"Bearer {ch['node_token']}"},
      )
      res.raise_for_status()
      ciphertext = res.content
      iv = bytes.fromhex(ch["iv"])
      plaintext = aesgcm.decrypt(iv, ciphertext, None)
      chunks[ch["chunk_index"]] = plaintext

    downloaded = b"".join(chunks)

    # Persist downloaded file so we can compare hashes on disk.
    out_path = f"downloaded_{FILENAME}"
    with open(out_path, "wb") as f:
      f.write(downloaded)

    print("download_equal", downloaded == data)
    print("downloaded_path", out_path)
    print("file_id", file_id)


if __name__ == "__main__":
  asyncio.run(main())

