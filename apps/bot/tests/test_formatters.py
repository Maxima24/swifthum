"""Pure unit tests for money + formatter helpers. No Telegram or Redis needed."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.services.formatters import (
    format_balance,
    format_notification,
    format_payment_received,
    format_payment_sent,
    format_rule_fired,
    format_rule_line,
    format_rules_list,
)
from src.services.money import kobo_to_naira_str


class TestMoney:
    def test_zero(self):
        assert kobo_to_naira_str(0) == "₦0.00"

    def test_whole_naira(self):
        assert kobo_to_naira_str(500_000) == "₦5,000.00"

    def test_kobo_pads(self):
        assert kobo_to_naira_str(123_45) == "₦123.45"
        assert kobo_to_naira_str(7) == "₦0.07"

    def test_large(self):
        assert kobo_to_naira_str(1_234_567_89) == "₦1,234,567.89"

    def test_negative(self):
        assert kobo_to_naira_str(-500_000) == "-₦5,000.00"


class TestRuleFired:
    def test_buy_success(self):
        text = format_rule_fired({
            "ruleName": "BUY USDT",
            "action": "buy",
            "amountMinor": 500_000,
            "currency": "NGN",
            "priceMinor": 162_000,
            "outcome": "success",
        })
        assert "Bought" in text and "BUY USDT" in text and "₦5,000.00" in text and "₦1,620.00" in text

    def test_sell_success_says_sold(self):
        text = format_rule_fired({
            "ruleName": "SELL ETH", "action": "sell",
            "amountMinor": 1_000_000, "priceMinor": 5_200_000_00,
            "outcome": "success",
        })
        assert "Sold" in text

    def test_simulated_uses_would(self):
        text = format_rule_fired({
            "ruleName": "BUY USDT", "action": "buy",
            "amountMinor": 500_000, "priceMinor": 162_000,
            "outcome": "simulated",
        })
        assert "Would buy" in text and "\U0001f9ea" in text

    def test_failed_explains(self):
        text = format_rule_fired({
            "ruleName": "BUY", "action": "buy",
            "amountMinor": 500_000, "priceMinor": 162_000,
            "outcome": "failed",
        })
        assert "failed" in text.lower() and "⚠" in text

    def test_alert_has_no_amount(self):
        text = format_rule_fired({
            "ruleName": "BTC alert", "action": "alert",
            "priceMinor": 100_000_000_00, "outcome": "success",
        })
        assert "Alert" in text and "BTC alert" in text

    def test_html_escapes_rule_name(self):
        text = format_rule_fired({
            "ruleName": "<script>x</script>", "action": "alert",
            "priceMinor": 0, "outcome": "success",
        })
        assert "<script>" not in text
        assert "&lt;script&gt;" in text


class TestPayments:
    def test_received(self):
        text = format_payment_received({"amountMinor": 500_00, "counterpartyName": "Bayo"})
        assert "Received" in text and "Bayo" in text and "₦500.00" in text

    def test_sent(self):
        text = format_payment_sent({"amountMinor": 1_000_00, "counterpartyName": "Ada"})
        assert "Sent" in text and "Ada" in text and "₦1,000.00" in text

    def test_escapes_counterparty(self):
        text = format_payment_received({"amountMinor": 1, "counterpartyName": "<b>x</b>"})
        assert "<b>x</b>" not in text
        assert "&lt;b&gt;x&lt;/b&gt;" in text


class TestDispatch:
    def test_rule_fired(self):
        out = format_notification({"type": "rule_fired", "data": {
            "ruleName": "X", "action": "alert", "priceMinor": 0, "outcome": "success",
        }})
        assert out and "Alert" in out

    def test_payment_received(self):
        out = format_notification({"type": "payment_received", "data": {"amountMinor": 1, "counterpartyName": "Z"}})
        assert out and "Received" in out

    def test_unknown_type_returns_none(self):
        assert format_notification({"type": "no_such_type", "data": {}}) is None


class TestRules:
    rule = {
        "name": "BUY USDT", "state": "watching",
        "when": {"asset": "USDT", "op": "lt", "priceMinor": 1_620_00},
    }

    def test_balance(self):
        assert format_balance({"balanceMinor": 2_500_000}) == "\U0001f4b0 Wallet balance: <b>₦25,000.00</b>"

    def test_rule_line_states(self):
        for state, emoji in [("watching", "\U0001f441"), ("paused", "⏸")]:
            line = format_rule_line(1, {**self.rule, "state": state})
            assert emoji in line and "BUY USDT" in line

    def test_rules_list_empty(self):
        assert "no rules" in format_rules_list([])

    def test_rules_list_numbers_them(self):
        out = format_rules_list([self.rule, self.rule])
        assert "1." in out and "2." in out
