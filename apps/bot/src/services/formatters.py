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
    return f"\U0001f4b8 Received <b>{amount}</b> from <b>{sender}</b>."


def format_payment_sent(data: dict[str, Any]) -> str:
    amount = kobo_to_naira_str(int(data.get("amountMinor", 0)))
    receiver = escape(str(data.get("counterpartyName", "someone")))
    return f"\U0001f4e4 Sent <b>{amount}</b> to <b>{receiver}</b>."


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
