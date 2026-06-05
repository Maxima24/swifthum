"""Guards the pubsub-decode regression: the notifications loop must treat a
published message as real whether the redis client decodes responses (str) or
not (bytes). Pure — no Telegram or live Redis needed."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.services.notifications import is_real_message


class TestIsRealMessage:
    def test_str_message(self):
        assert is_real_message({"type": "message", "data": "{}"}) is True

    def test_bytes_message(self):
        # decode_responses=False path — the bug that dropped every notification.
        assert is_real_message({"type": b"message", "data": b"{}"}) is True

    def test_subscribe_ack_ignored(self):
        assert is_real_message({"type": "subscribe", "data": 1}) is False
        assert is_real_message({"type": b"subscribe", "data": 1}) is False

    def test_missing_type(self):
        assert is_real_message({"data": "{}"}) is False
