#!/usr/bin/env python3
"""Read-only Bot API preflight; never prints credentials or Telegram URLs."""

import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def token_from_env(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("TELEGRAM_MODERATION_BOT_TOKEN="):
            return line.partition("=")[2].strip().strip('"').strip("'")
    return ""


def request(token: str, method: str) -> dict:
    with urlopen(f"https://api.telegram.org/bot{token}/{method}", timeout=12) as response:
        body = json.load(response)
    if body.get("ok") is not True:
        raise ValueError("BOT_API_NOT_OK")
    return body.get("result") or {}


def main() -> int:
    token = token_from_env(Path(__file__).with_name("telegram.env"))
    if not token:
        print("bot_token=missing")
        return 1
    try:
        request(token, "getMe")
        info = request(token, "getWebhookInfo")
    except HTTPError as error:
        print(f"bot_api_http_status={error.code}")
        return 1
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
        print(f"bot_api_error_type={type(error).__name__}")
        return 1
    print("bot_auth=ok")
    print(f"webhook_configured={'yes' if info.get('url') else 'no'}")
    print(f"pending_updates={info.get('pending_update_count', 'unknown')}")
    return 0 if not info.get("url") else 2


if __name__ == "__main__":
    sys.exit(main())
