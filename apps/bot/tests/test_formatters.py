"""Pure unit tests for money + formatter helpers. No Telegram or Redis needed."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.services.formatters import (
    format_balance,
    format_history,
    format_notification,
    format_parse_confirmation,
    format_parse_unsure,
    format_payment_received,
    format_payment_sent,
    format_portfolio,
    format_prices,
    format_rule_fired,
    format_rule_line,
    format_rules_list,
    format_swiftyex_account,
    format_weekly_digest,
)
from src.services.money import kobo_to_naira_str
from src.services.transcribe import Transcriber


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

    def test_weekly_digest(self):
        out = format_notification({"type": "weekly_digest", "data": {
            "rulesFiredCount": 3, "transactionsCount": 2,
            "digestSummary": "Busy week!",
        }})
        assert out and "3" in out and "2" in out and "Busy week!" in out


class TestWeeklyDigest:
    def test_includes_counts_and_summary(self):
        out = format_weekly_digest({
            "rulesFiredCount": 5, "transactionsCount": 1, "digestSummary": "Nice run",
        })
        assert "5" in out and "1" in out and "Nice run" in out

    def test_omits_blank_summary(self):
        out = format_weekly_digest({
            "rulesFiredCount": 0, "transactionsCount": 0, "digestSummary": "",
        })
        assert "Rules fired" in out and out.strip().endswith("</b>")

    def test_escapes_summary_html(self):
        out = format_weekly_digest({
            "rulesFiredCount": 0, "transactionsCount": 0,
            "digestSummary": "<b>x</b>",
        })
        assert "<b>x</b>" not in out
        assert "&lt;b&gt;x&lt;/b&gt;" in out


class TestMenuSections:
    PRICES = {"USDT": 1_360_00, "BTC": 84_756_375_00, "ETH": 2_284_677_00}

    def test_prices(self):
        out = format_prices(self.PRICES)
        assert "Prices" in out and "USDT" in out and "₦1,360.00" in out

    def test_portfolio_value_math(self):
        # 2 USDT (2 * 1e8 base units) at ₦1,360 → ₦2,720.00
        holdings = [{"asset": "USDT", "qtyBase": 200_000_000}]
        out = format_portfolio(holdings, self.PRICES)
        assert "USDT" in out and "₦2,720.00" in out and "Total" in out

    def test_portfolio_empty(self):
        assert "don't hold any assets" in format_portfolio([], self.PRICES)
        # zero-qty holdings also count as empty
        assert "don't hold any assets" in format_portfolio(
            [{"asset": "BTC", "qtyBase": 0}], self.PRICES
        )

    def test_history(self):
        items = [
            {"direction": "sent", "amountMinor": 500_000, "counterparty": {"displayName": "Bayo"}},
            {"direction": "received", "amountMinor": 1_000_00, "counterparty": {"displayName": "Ada"}},
        ]
        out = format_history(items)
        assert "Sent" in out and "Bayo" in out and "Received" in out and "Ada" in out

    def test_history_empty(self):
        assert "No payments yet" in format_history([])

    def test_history_escapes_counterparty(self):
        out = format_history(
            [{"direction": "sent", "amountMinor": 1, "counterparty": {"displayName": "<b>x</b>"}}]
        )
        assert "<b>x</b>" not in out and "&lt;b&gt;x&lt;/b&gt;" in out

    def test_swiftyex_linked_and_unlinked(self):
        assert "Linked" in format_swiftyex_account({"linked": True, "label": "sandbox·dem…"})
        assert "Not linked" in format_swiftyex_account({"linked": False})


class TestTranscriber:
    def test_disabled_without_key(self):
        t = Transcriber("", "whisper-large-v3-turbo")
        assert t.enabled is False

    async def _transcribe(self, t):
        return await t.transcribe(b"")

    def test_disabled_transcribe_returns_none(self):
        import asyncio
        t = Transcriber("", "whisper-large-v3-turbo")
        assert asyncio.run(t.transcribe(b"some-bytes")) is None


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


class TestParse:
    def test_confirmation_with_recipient(self):
        out = format_parse_confirmation({
            "amountMinor": 500_000, "recipient": "Bayo",
        })
        assert "Send" in out and "₦5,000.00" in out and "Bayo" in out

    def test_confirmation_without_recipient(self):
        out = format_parse_confirmation({"amountMinor": 1_000_000, "recipient": None})
        assert "₦10,000.00" in out and "for" not in out  # no "for X" clause

    def test_confirmation_escapes_recipient_html(self):
        out = format_parse_confirmation({"amountMinor": 500_000, "recipient": "<b>evil</b>"})
        assert "<b>evil</b>" not in out
        assert "&lt;b&gt;evil&lt;/b&gt;" in out

    def test_unsure_default(self):
        out = format_parse_unsure({"intent": None})
        assert "didn't catch" in out.lower() and "Abeg" in out

    def test_unsure_uses_explanation(self):
        out = format_parse_unsure({"explanation": "amount too large"})
        assert "amount too large" in out

    def test_unsure_escapes_explanation_html(self):
        out = format_parse_unsure({"explanation": "<script>x</script>"})
        assert "<script>" not in out
        assert "&lt;script&gt;" in out
