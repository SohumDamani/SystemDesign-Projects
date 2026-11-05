-- Atomic sliding-window-counter rate limiter.
--
-- KEYS[1] = base key, e.g. "ratelimit:user123:/api/data"
-- ARGV[1] = window_size_seconds (e.g. 60)
-- ARGV[2] = limit (max requests allowed per window)
--
-- Returns: { allowed (1/0), estimated_count, limit, retry_after_seconds }

local base_key = KEYS[1]
local window_size = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

-- redis.call('TIME') is the deterministic way to get wall-clock time
-- inside a Lua script (safe for replication, no client clock skew).
local time_result = redis.call('TIME')
local now = tonumber(time_result[1])

local current_window_id = math.floor(now / window_size)
local previous_window_id = current_window_id - 1

local current_key = base_key .. ':' .. current_window_id
local previous_key = base_key .. ':' .. previous_window_id

-- tonumber(...) or 0 handles the case where the key doesn't exist yet (GET returns false/nil).
local current_count = tonumber(redis.call('GET', current_key)) or 0
local previous_count = tonumber(redis.call('GET', previous_key)) or 0

-- How far into the current window are we? (0 = just started, window_size = about to roll over)
local elapsed = now % window_size
local weight = 1 - (elapsed / window_size)

local estimated_count = (previous_count * weight) + current_count

-- Time left until the current window closes -- useful for the Retry-After header.
local retry_after = window_size - elapsed

if estimated_count + 1 > limit then
    -- Reject: do NOT increment, so a rejected request never counts against the limit.
    return { 0, math.floor(estimated_count), limit, retry_after }
else
    -- Allow: increment the current window's counter, and (re)set its expiry.
    -- TTL is 2x window_size so the key survives long enough to be read as
    -- the "previous" window on the next rotation, then expires on its own.
    local new_count = redis.call('INCR', current_key)
    redis.call('EXPIRE', current_key, window_size * 2)
    return { 1, new_count, limit, retry_after }
end
