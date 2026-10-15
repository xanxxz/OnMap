#!/usr/bin/env python3
"""Use the verified private moderation chat as partner owner without printing IDs."""

import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def main() -> int:
    path = Path(__file__).with_name("telegram.env")
    content = path.read_text(encoding="utf-8")
    values = dict(
        line.split("=", 1)
        for line in content.splitlines()
        if "=" in line and not line.startswith("#")
    )
    if "TELEGRAM_PARTNER_OWNER_IDS" in values:
        print("partner_owner=already_configured")
        return 0
    token = values.get("TELEGRAM_MODERATION_BOT_TOKEN", "").strip()
    chat_id = values.get("TELEGRAM_MODERATION_CHAT_ID", "").strip()
    if not token or not chat_id or not chat_id.isdecimal():
        print("partner_owner=missing_moderation_config")
        return 1

    request = Request(
        f"https://api.telegram.org/bot{token}/getChat",
        data=urlencode({"chat_id": chat_id}).encode("ascii"),
        method="POST",
    )
    try:
        with urlopen(request, timeout=12) as response:
            result = json.load(response)
    except HTTPError as error:
        print(f"get_chat_http_status={error.code}")
        return 1
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"get_chat_error_type={type(error).__name__}")
        return 1
    if result.get("ok") is not True or result.get("result", {}).get("type") != "private":
        print("partner_owner=not_verified_private_chat")
        return 1

    temporary_name = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=".telegram-env-", delete=False,
        ) as temporary:
            temporary_name = temporary.name
            os.fchmod(temporary.fileno(), 0o600)
            temporary.write(content.rstrip("\n") + "\n")
            temporary.write(f"TELEGRAM_PARTNER_OWNER_IDS={chat_id}\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, path)
    finally:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)
    print("partner_owner=configured_from_private_moderation_chat")
    return 0


if __name__ == "__main__":
    sys.exit(main())
