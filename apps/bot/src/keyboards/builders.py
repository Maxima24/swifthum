"""Inline keyboard builders. Keeping callback-data formats centralized here so
the rules handler and any future handlers agree on the wire format.

Callback data is limited to 64 bytes by Telegram, so we use short prefixes:
  - `rule:pause:<id>`   → pause the given rule
  - `rule:resume:<id>`  → resume
"""
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
)

CB_RULE_PAUSE = "rule:pause:"
CB_RULE_RESUME = "rule:resume:"


def webapp_launch_kb(miniapp_url: str, text: str = "🎯 Open SwiftHum") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text=text, web_app=WebAppInfo(url=miniapp_url)),
        ]],
    )


def rule_actions_kb(rule_id: str, is_paused: bool) -> InlineKeyboardMarkup:
    """One-button keyboard: Pause if active, Resume if paused."""
    if is_paused:
        btn = InlineKeyboardButton(text="▶ Resume", callback_data=f"{CB_RULE_RESUME}{rule_id}")
    else:
        btn = InlineKeyboardButton(text="⏸ Pause", callback_data=f"{CB_RULE_PAUSE}{rule_id}")
    return InlineKeyboardMarkup(inline_keyboard=[[btn]])
