"""Connection pool for the Tiger Data database.

Reads DATABASE_URL from the environment or from .env at the repo root.
"""

import os
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

ROOT = Path(__file__).resolve().parent.parent


def database_url():
    url = os.environ.get("DATABASE_URL")
    env = ROOT / ".env"
    if not url and env.exists():
        for line in env.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "DATABASE_URL":
                url = value.strip().strip("\"'")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (environment or .env)")
    return url


pool = ConnectionPool(database_url(), min_size=1, max_size=5, open=False,
                      kwargs={"row_factory": dict_row})


def fetch_all(sql, params=None):
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchall()


def fetch_one(sql, params=None):
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchone()
