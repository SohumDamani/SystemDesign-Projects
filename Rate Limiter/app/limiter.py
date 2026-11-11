from dataclasses import dataclass
from pathlib import Path

from app.redis_client import redis_client

_SCRIPT_PATH = Path(__file__).parent / "rate_limit.lua"
_script_source = _SCRIPT_PATH.read_text()

# register_script() uploads the script to Redis once (via SCRIPT LOAD) and gets
# back a Script object. Calling that object runs the script with EVALSHA
# (sends just a hash, not the full source) instead of EVAL every time.
_rate_limit_script = redis_client.register_script(_script_source)


@dataclass
class RateLimitResult:
    allowed: bool
    count: int
    limit: int
    retry_after: int


def check_rate_limit(key: str, window_size: int, limit: int) -> RateLimitResult:
    """Atomically check-and-increment the sliding window counter for `key`."""
    allowed, count, limit, retry_after = _rate_limit_script(
        keys=[key],
        args=[window_size, limit],
    )
    return RateLimitResult(
        allowed=bool(allowed),
        count=count,
        limit=limit,
        retry_after=retry_after,
    )
