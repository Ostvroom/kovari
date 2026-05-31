#!/usr/bin/env python3
"""Verify X engagement (retweet + reply) for Kovari raids. Outputs JSON to stdout."""
import asyncio
import json
import os
import sys
from pathlib import Path

# Prefer env from Node parent (load-env.js). Avoid re-parsing a multi-line .env.
root = Path(__file__).resolve().parent.parent
if not os.getenv("TWITTER_COOKIES") and not os.getenv("TWITTER_EMAIL"):
    try:
        from dotenv import load_dotenv
        load_dotenv(root / ".env", override=False)
    except ImportError:
        pass

# Patch twikit's broken ClientTransaction before importing anything else
def _patch_twikit():
    try:
        import twikit.client_transaction as ct
        import base64, os

        # Replace generate with a fake transaction ID so requests don't crash
        def patched_generate(self, *args, **kwargs):
            try:
                # Try real generate first
                if hasattr(self, "key") and self.key:
                    return self._generate(*args, **kwargs)
            except Exception:
                pass
            # Fallback: fake transaction ID
            return base64.b64encode(os.urandom(16)).decode()

        ct.ClientTransaction.generate = patched_generate
        print("[x-debug] ClientTransaction.generate patched", file=sys.stderr)
    except Exception as e:
        print(f"[x-debug] patch failed: {e}", file=sys.stderr)

_patch_twikit()

try:
    from twikit import Client
    from twikit.tweet import tweet_from_data
    from twikit.utils import find_dict
except ImportError:
    print(json.dumps({
        "ok": False,
        "error": "twikit not installed. Run: pip install twikit python-dotenv",
    }))
    sys.exit(0)


def parse_cookies(raw: str) -> dict:
    raw = (raw or "").strip()
    if not raw:
        return {}
    if raw.startswith("["):
        try:
            arr = json.loads(raw)
            return {c["name"]: c["value"] for c in arr if "name" in c and "value" in c}
        except json.JSONDecodeError:
            pass
    out = {}
    for part in raw.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def load_cookie_dict() -> dict:
    cookies = parse_cookies(os.getenv("TWITTER_COOKIES", ""))
    if cookies:
        return cookies

    paths = []
    env_file = os.getenv("TWITTER_COOKIES_FILE", "").strip()
    if env_file:
        paths.append(Path(env_file))
    paths.extend([
        root / "data" / "twitter-cookies.json",
        root / "twitter-cookies.json",
        root / "cookies.json",
    ])

    for path in paths:
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                out = {c["name"]: c["value"] for c in data if "name" in c and "value" in c}
            elif isinstance(data, dict):
                out = {k: str(v) for k, v in data.items() if v}
            else:
                out = {}
            if out:
                return out
        except (json.JSONDecodeError, OSError):
            continue
    return {}


async def apply_login(client: Client) -> bool:
    loop = asyncio.get_event_loop()
    cookies = load_cookie_dict()
    if cookies:
        print(f"[x-debug] cookies loaded: {list(cookies.keys())}", file=sys.stderr)
        if hasattr(client, "set_cookies"):
            fn = client.set_cookies
            try:
                if asyncio.iscoroutinefunction(fn):
                    await fn(cookies)
                else:
                    await loop.run_in_executor(None, fn, cookies)
                print("[x-debug] set_cookies succeeded", file=sys.stderr)
                return True
            except Exception as e:
                print(f"[x-debug] set_cookies failed: {e}", file=sys.stderr)
        if hasattr(client, "session") and hasattr(client.session, "cookies"):
            client.session.cookies.update(cookies)
            print("[x-debug] session cookies updated", file=sys.stderr)
            return True

    email = os.getenv("TWITTER_EMAIL", "")
    password = os.getenv("TWITTER_PASSWORD", "")
    tw_user = os.getenv("TWITTER_USERNAME", email)
    if email and password and hasattr(client, "login"):
        login = client.login
        if asyncio.iscoroutinefunction(login):
            await login(username=tw_user, password=password)
        else:
            await loop.run_in_executor(
                None, lambda: login(username=tw_user, password=password)
            )
        return True
    return bool(cookies)


def screen_name(obj) -> str:
    if hasattr(obj, "screen_name") and obj.screen_name:
        return str(obj.screen_name).lower()
    if hasattr(obj, "username") and obj.username:
        return str(obj.username).lower()
    return ""


async def call_method(method, *args):
    loop = asyncio.get_event_loop()
    if asyncio.iscoroutinefunction(method):
        return await method(*args)
    return await loop.run_in_executor(None, method, *args)


async def fetch_tweet(client: Client, tweet_id: str):
    target_tid = str(tweet_id)
    if hasattr(client, "get_tweets_by_ids"):
        try:
            batch = await call_method(client.get_tweets_by_ids, [target_tid])
            if batch:
                return batch[0]
        except Exception as e:
            print(f"[x-debug] get_tweets_by_ids failed: {e}", file=sys.stderr)
    if hasattr(client, "get_tweet_by_id"):
        try:
            t = await call_method(client.get_tweet_by_id, target_tid)
            if t:
                return t
        except Exception as e:
            print(f"[x-debug] get_tweet_by_id failed: {e}", file=sys.stderr)
    return None


async def fetch_user(client: Client, username: str, user_id: str | None):
    names = []
    clean = username.lstrip("@").strip()
    if clean:
        names.append(clean)
        names.append(clean.lower())
        if clean != clean.capitalize():
            names.append(clean.capitalize())
    seen = set()
    for name in names:
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        if hasattr(client, "get_user_by_screen_name"):
            try:
                u = await call_method(client.get_user_by_screen_name, name)
                if u:
                    return u
            except Exception as e:
                print(f"[x-debug] get_user_by_screen_name({name}) failed: {e}", file=sys.stderr)

    if user_id and hasattr(client, "get_user_by_id"):
        try:
            u = await call_method(client.get_user_by_id, str(user_id))
            if u:
                return u
        except Exception as e:
            print(f"[x-debug] get_user_by_id({user_id}) failed: {e}", file=sys.stderr)
    return None


async def user_tweets(user, tweet_type: str = "Tweets", pages: int = 3) -> list:
    if not hasattr(user, "get_tweets"):
        return []
    try:
        result = await call_method(user.get_tweets, tweet_type, 40)
    except TypeError:
        try:
            result = await call_method(user.get_tweets, tweet_type)
        except Exception:
            return []
    except Exception:
        return []

    out = list(result) if result else []
    cursor_result = result
    for _ in range(pages - 1):
        if not hasattr(cursor_result, "next"):
            break
        try:
            nxt = await cursor_result.next()
            if not nxt:
                break
            out.extend(list(nxt))
            cursor_result = nxt
        except Exception:
            break
    return out


def tweet_id_of(t) -> str | None:
    for attr in ("id", "id_str"):
        if hasattr(t, attr) and getattr(t, attr):
            return str(getattr(t, attr))
    return None


def is_retweet_of(t, target_id: str) -> bool:
    target_id = str(target_id)
    for attr in ("retweeted_tweet", "retweeted_status"):
        rt = getattr(t, attr, None)
        if rt and tweet_id_of(rt) == target_id:
            return True
    refs = getattr(t, "referenced_tweets", None) or []
    for ref in refs:
        ref_type = getattr(ref, "type", None) or (ref.get("type") if isinstance(ref, dict) else None)
        ref_id = getattr(ref, "id", None) or (ref.get("id") if isinstance(ref, dict) else None)
        if ref_type == "retweeted" and str(ref_id) == target_id:
            return True
    return False


def is_reply_to(t, target_id: str) -> bool:
    target_id = str(target_id)
    # twikit: in_reply_to is the parent tweet id string
    val = getattr(t, "in_reply_to", None)
    if val and str(val) == target_id:
        return True
    for attr in ("in_reply_to_status_id", "conversation_id"):
        val = getattr(t, attr, None)
        if val and str(val) == target_id:
            return True
    refs = getattr(t, "referenced_tweets", None) or []
    for ref in refs:
        ref_type = getattr(ref, "type", None) or (ref.get("type") if isinstance(ref, dict) else None)
        ref_id = getattr(ref, "id", None) or (ref.get("id") if isinstance(ref, dict) else None)
        if ref_type == "replied_to" and str(ref_id) == target_id:
            return True
    return False


def tweet_author_name(t) -> str:
    user = getattr(t, "user", None)
    if user:
        return screen_name(user)
    return screen_name(t)


async def repliers_from_tweet_detail(client: Client, tweet_id: str) -> set[str]:
    """Load reply authors from tweet thread (reliable; get_tweet_by_id often breaks)."""
    names: set[str] = set()
    target = str(tweet_id)
    try:
        response, _ = await client.gql.tweet_detail(target, None)
        entries = find_dict(response, "entries", find_one=True)[0]
    except Exception:
        return names

    def add_tweet_obj(obj) -> None:
        if not obj:
            return
        if is_reply_to(obj, target):
            sn = tweet_author_name(obj)
            if sn:
                names.add(sn)

    for entry in entries:
        if entry.get("entryId", "").startswith("cursor"):
            continue
        add_tweet_obj(tweet_from_data(client, entry))
        for item in entry.get("content", {}).get("items") or []:
            add_tweet_obj(tweet_from_data(client, item))

    return names


async def check_retweet(tweet, user, username: str, target_id: str) -> bool:
    uname = username.lower()
    if tweet and hasattr(tweet, "get_retweeters"):
        try:
            users = await call_method(tweet.get_retweeters, 200)
            for u in list(users)[:300]:
                if screen_name(u) == uname:
                    return True
        except Exception:
            pass

    if user:
        for t in await user_tweets(user):
            if is_retweet_of(t, target_id):
                return True
    return False


async def check_reply(client, tweet, user, username: str, target_id: str) -> bool:
    uname = username.lower()

    repliers = await repliers_from_tweet_detail(client, target_id)
    if uname in repliers:
        return True

    if user:
        for t in await user_tweets(user):
            if is_reply_to(t, target_id):
                return True

    return False


async def verify(username: str, tweet_id: str, user_id: str | None = None) -> dict:
    has_creds = bool(load_cookie_dict()) or (
        os.getenv("TWITTER_EMAIL") and os.getenv("TWITTER_PASSWORD")
    )
    if not has_creds:
        return {"ok": False, "error": "Raid check unavailable. Ask an admin."}

    client = Client()
    logged_in = await apply_login(client)
    if not logged_in:
        return {"ok": False, "error": "Raid check unavailable. Ask an admin."}

    tweet = await fetch_tweet(client, tweet_id)
    user = await fetch_user(client, username, user_id)
    check_name = username.lstrip("@").lower()

    if not tweet and not user:
        return {"ok": False, "error": "Could not check X right now. Try again in a minute."}

    retweet = await check_retweet(tweet, user, check_name, tweet_id)
    reply = await check_reply(client, tweet, user, check_name, tweet_id)

    if retweet or reply:
        return {
            "ok": True,
            "retweet": retweet,
            "reply": reply,
            "like": False,
        }

    return {
        "ok": False,
        "retweet": False,
        "reply": False,
        "like": False,
        "error": "Retweet or reply on the tweet, then try again.",
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "Usage: verify-x-engagement.py <username> <tweet_id> [user_id]"}))
        return
    username = sys.argv[1].strip().lstrip("@")
    tweet_id = sys.argv[2].strip()
    uid = sys.argv[3].strip() if len(sys.argv) > 3 else None
    result = asyncio.run(verify(username, tweet_id, uid or None))
    print(json.dumps(result))


if __name__ == "__main__":
    main()
