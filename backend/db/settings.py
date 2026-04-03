import json

import psycopg_pool


async def save_app_settings(pool: psycopg_pool.AsyncConnectionPool, data: dict) -> None:
    import crypto
    encrypted_blob = crypto.encrypt(json.dumps(data))
    payload = json.dumps({"enc": encrypted_blob})
    async with pool.connection() as conn:
        await conn.execute(
            """
            INSERT INTO app_settings (id, data) VALUES (1, %s)
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
            """,
            (payload,),
        )
        await conn.commit()


async def load_app_settings(pool: psycopg_pool.AsyncConnectionPool) -> dict | None:
    import crypto
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT data FROM app_settings WHERE id = 1")
        row = await cur.fetchone()
    if not row:
        return None
    payload = row[0]
    if "enc" in payload:
        return json.loads(crypto.decrypt(payload["enc"]))
    return payload
