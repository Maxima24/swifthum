"""Unit tests for the /pay argument parsing (pure — no Telegram/API)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.handlers.pay import parse_amount_to_minor, parse_pay_args


class TestParseAmount:
    def test_plain(self):
        assert parse_amount_to_minor("5000") == 500000

    def test_k_suffix(self):
        assert parse_amount_to_minor("5k") == 500000
        assert parse_amount_to_minor("5.5k") == 550000

    def test_commas_and_naira(self):
        assert parse_amount_to_minor("5,000") == 500000
        assert parse_amount_to_minor("₦1,250") == 125000

    def test_rejects_junk_zero_and_oversize(self):
        assert parse_amount_to_minor("abc") is None
        assert parse_amount_to_minor("0") is None
        assert parse_amount_to_minor("200k") is None  # > ₦100,000 cap


class TestParsePayArgs:
    def test_handle_and_amount(self):
        assert parse_pay_args("@bob 5k") == ("bob", 500000)
        assert parse_pay_args("Ada 5000") == ("ada", 500000)

    def test_strips_at_and_lowercases(self):
        assert parse_pay_args("@Bayo 1000") == ("bayo", 100000)

    def test_rejects_incomplete(self):
        assert parse_pay_args("bob") is None
        assert parse_pay_args("") is None
        assert parse_pay_args(None) is None
        assert parse_pay_args("@bob notanumber") is None
