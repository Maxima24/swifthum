"""Pure functions that turn API/notification payloads into Telegram HTML
messages. Pure = no Bot or Redis imports, easy to unit-test.

Telegram HTML parse mode permits a small tag whitelist; we escape user-controlled
strings (ruleName, counterpartyName, displayName) so a malicious value can't break
the layout.
"""
from html import escape
from typing import Any

from .money import kobo_to_naira_str


# ─── notification messages (consumed from Redis pubsub) ─────────────

def format_rule_fired(data: dict[str, Any]) -> str:
    name = escape(str(data.get("ruleName", "rule")))
    action = str(data.get("action", "alert"))
    outcome = str(data.get("outcome", "success"))
    price = kobo_to_naira_str(int(data.get("priceMinor", 0)))
    amount_minor = data.get("amountMinor")
    amount = kobo_to_naira_str(int(amount_minor)) if amount_minor is not None else None

    if action == "alert":
        return f"\U0001f514 Alert: <b>{name}</b> triggered at {price}."

    emoji, verb_past, verb_future = {
        "success": ("✅", "Bought" if action == "buy" else "Sold", None),
        "simulated": ("\U0001f9ea", None, f"Would {action}"),
        "failed": ("⚠️", None, None),
    }.get(outcome, ("ℹ️", None, None))

    if outcome == "failed":
        return f"{emoji} <b>{name}</b> failed — {action} did not execute (price was {price})."

    verb = verb_future if outcome == "simulated" else verb_past
    if amount is None:
        return f"{emoji} <b>{name}</b>: {verb or action} at {price}."
    return f"{emoji} <b>{name}</b>: {verb} {amount} at {price}."


def format_payment_received(data: dict[str, Any]) -> str:
    amount = kobo_to_naira_str(int(data.get("amountMinor", 0)))
    sender = escape(str(data.get("counterpartyName", "someone")))
    return f"\U0001f4b8 Received <b>{amount}</b> from <b>{sender}</b> via SwiftHum."


def format_payment_sent(data: dict[str, Any]) -> str:
    amount = kobo_to_naira_str(int(data.get("amountMinor", 0)))
    receiver = escape(str(data.get("counterpartyName", "someone")))
    return f"\U0001f4e4 Sent <b>{amount}</b> to <b>{receiver}</b>."


def format_gift_received(data: dict[str, Any]) -> str:
    amount = kobo_to_naira_str(int(data.get("amountMinor", 0)))
    sender = escape(str(data.get("counterpartyName", "someone")))
    return f"\U0001f381 You received a gift of <b>{amount}</b> from <b>{sender}</b>!"


def format_gift_claimed(data: dict[str, Any]) -> str:
    amount = kobo_to_naira_str(int(data.get("amountMinor", 0)))
    recipient = escape(str(data.get("counterpartyName", "someone")))
    return f"\U0001f381 <b>{recipient}</b> claimed your gift of <b>{amount}</b>."


def format_gift_expired(data: dict[str, Any]) -> str:
    amount = kobo_to_naira_str(int(data.get("amountMinor", 0)))
    return f"\U0001f381 Your unclaimed gift of <b>{amount}</b> expired and was refunded to your wallet."


def format_weekly_digest(data: dict[str, Any]) -> str:
    rules = int(data.get("rulesFiredCount", 0))
    txns = int(data.get("transactionsCount", 0))
    summary = escape(str(data.get("digestSummary", "")).strip())
    lines = [
        "\U0001f4ca <b>Your week on SwiftHum</b>",
        f"⚡ Rules fired: <b>{rules}</b>",
        f"\U0001f4b8 Transactions: <b>{txns}</b>",
    ]
    if summary:
        lines.append("")
        lines.append(summary)
    return "\n".join(lines)


def format_notification(payload: dict[str, Any]) -> str | None:
    """Dispatch on payload.type. Returns None for unknown types so the
    notification loop logs + skips rather than crashing."""
    t = payload.get("type")
    data = payload.get("data") or {}
    if t == "rule_fired":
        return format_rule_fired(data)
    if t == "payment_received":
        return format_payment_received(data)
    if t == "payment_sent":
        return format_payment_sent(data)
    if t == "gift_received":
        return format_gift_received(data)
    if t == "gift_claimed":
        return format_gift_claimed(data)
    if t == "gift_expired":
        return format_gift_expired(data)
    if t == "weekly_digest":
        return format_weekly_digest(data)
    return None


# ─── command responses ─────────────────────────────────────────────

def format_balance(wallet: dict[str, Any]) -> str:
    amount = kobo_to_naira_str(int(wallet.get("balanceMinor", 0)))
    return f"\U0001f4b0 Wallet balance: <b>{amount}</b>"


_STATE_EMOJI = {
    "watching": "\U0001f441️",   # 👁
    "sleeping": "\U0001f4a4",          # 💤
    "fired": "⚡",                  # ⚡
    "paused": "⏸️",          # ⏸
}


def format_rule_line(idx: int, rule: dict[str, Any]) -> str:
    """A compact one-line render for /rules listings."""
    state = str(rule.get("state", "sleeping"))
    emoji = _STATE_EMOJI.get(state, "•")
    name = escape(str(rule.get("name", "rule")))
    when = rule.get("when") or {}
    asset = escape(str(when.get("asset", "")))
    op = {"lt": "<", "gt": ">", "crosses_above": "↗", "crosses_below": "↘"}.get(
        str(when.get("op", "")), str(when.get("op", ""))
    )
    price = kobo_to_naira_str(int(when.get("priceMinor", 0)))
    return f"{idx}. {emoji} <b>{name}</b> — {asset} {op} {price}"


def format_rules_list(rules: list[dict[str, Any]]) -> str:
    if not rules:
        return "You have no rules yet. Open the Mini App to create one."
    lines = [format_rule_line(i + 1, r) for i, r in enumerate(rules)]
    return "<b>Your rules</b>\n" + "\n".join(lines)


# ─── natural-language payment parse ────────────────────────────────

def format_parse_confirmation(result: dict[str, Any]) -> str:
    """Confirmation card for a successful parse. amountMinor is required;
    recipient is display-only sugar."""
    amount = kobo_to_naira_str(int(result["amountMinor"]))
    recipient_raw = result.get("recipient")
    recipient = escape(str(recipient_raw).strip()) if recipient_raw else ""
    if recipient:
        return f"\U0001f4b8 Send <b>{amount}</b> for <b>{recipient}</b>?"
    return f"\U0001f4b8 Send <b>{amount}</b>?"


def format_parse_unsure(result: dict[str, Any]) -> str:
    """Reply when the parser returns intent:null or low confidence. Escapes the
    model-provided explanation so it can't break the layout."""
    explanation = result.get("explanation")
    if explanation and str(explanation).strip():
        line = escape(str(explanation).strip())
    else:
        line = "I didn't catch a payment in that."
    return (
        f"\U0001f914 {line}\n\n"
        "Try: <i>Abeg send 5k</i> or <i>Send 10,000 to Bayo</i>"
    )


# ─── menu hub sections (prices / portfolio / history / SwiftyEx) ────

_ASSET_ORDER = ["USDT", "BTC", "ETH"]
_QTY_SCALE = 100_000_000  # 8-dp base units per whole asset unit (mirrors QTY_SCALE)


def format_prices(prices: dict[str, Any]) -> str:
    lines = ["\U0001f4c8 <b>Prices</b> (NGN)"]
    for asset in _ASSET_ORDER:
        minor = prices.get(asset)
        if isinstance(minor, (int, float)):
            lines.append(f"• <b>{asset}</b>  {kobo_to_naira_str(int(minor))}")
    return "\n".join(lines)


def format_portfolio(holdings: list[dict[str, Any]], prices: dict[str, Any]) -> str:
    empty = (
        "\U0001f4ca <b>Portfolio</b>\n"
        "You don't hold any assets yet. When a buy rule fires, your holdings show up here."
    )
    if not holdings:
        return empty

    by_asset = {h.get("asset"): h for h in holdings}
    lines = ["\U0001f4ca <b>Portfolio</b>"]
    total_minor = 0
    for asset in _ASSET_ORDER:
        h = by_asset.get(asset)
        qty_base = int((h or {}).get("qtyBase", 0) or 0)
        if qty_base <= 0:
            continue
        price_minor = int(prices.get(asset, 0) or 0)
        value_minor = qty_base * price_minor // _QTY_SCALE
        total_minor += value_minor
        qty = qty_base / _QTY_SCALE
        lines.append(f"• <b>{asset}</b>  {qty:.4f} · {kobo_to_naira_str(value_minor)}")

    if len(lines) == 1:
        return empty
    lines.append(f"\n<b>Total</b>: {kobo_to_naira_str(total_minor)}")
    return "\n".join(lines)


def format_history(items: list[dict[str, Any]]) -> str:
    if not items:
        return "\U0001f9fe <b>History</b>\nNo payments yet."
    lines = ["\U0001f9fe <b>Recent payments</b>"]
    for t in items[:10]:
        amount = kobo_to_naira_str(int(t.get("amountMinor", 0)))
        name = escape(str((t.get("counterparty") or {}).get("displayName", "someone")))
        if t.get("direction") == "sent":
            lines.append(f"\U0001f4e4 Sent {amount} to <b>{name}</b>")
        else:
            lines.append(f"\U0001f4e5 Received {amount} from <b>{name}</b>")
    return "\n".join(lines)


def format_swiftyex_account(account: dict[str, Any]) -> str:
    if account.get("linked"):
        label = escape(str(account.get("label") or "Linked"))
        return (
            "\U0001f517 <b>SwiftyEx</b>\n"
            f"Status: <b>Linked</b> ({label})\n"
            "Trades from fired rules execute on your account."
        )
    return (
        "\U0001f517 <b>SwiftyEx</b>\n"
        "Status: <b>Not linked</b>\n"
        "Link a sandbox account so rules can place simulated trades."
    )
