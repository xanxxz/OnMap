from base64 import b64decode
from pathlib import Path

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "src"
    / "assets"
    / "map-events"
    / "dps.png"
)

DPS_ICON = """
iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABMElEQVR4nO2ZURKCMAxEi+MFOYFn8wQcMX44zmBBJdswm9p9f+CQbta0TaEUIYQQQozKxBrYzOxNyDRRtFxaA9SJ9MYVeShL0mZmrZUDVUA9KNMQW4E83zwFWEStIbABmaqghS4rIHIHaTLgH6qgee+NWIm9462vWf1DCnqsOCFELuAVNOMChOwIUB+QMflSMF1uA7Im/8Krz1Uyu8Hn2RPiybJ8/Gm+A+Fu23tHp8NhAzbJI4nXrIxAEt+Eq4w4YkKXh6FIMAMi/v0TQKpIFcAWwEYGsAWwkQFsAWwwA750ckz2OsJfDF8BOgt4B8t+GizF917APQWyv4b26gv5OJoFRFdYIntTI9Kos+IPvwvIALYANjKALYCNDIgKVG9J0b3C2fGFEEIIIYQQQoiBeABKu3g7TPgbCgAAAABJRU5ErkJggg==
""".strip()


def main() -> None:
    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    OUTPUT_PATH.write_bytes(
        b64decode(DPS_ICON),
    )

    print(f"created {OUTPUT_PATH}")


if __name__ == "__main__":
    main()