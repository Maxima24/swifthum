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
CB_PARSE_CANCEL = "parse:cancel"
CB_MENU = "menu:"  # menu:<section>  e.g. menu:home, menu:prices, menu:sx:link
# Escrow action callbacks: esc:<action>:<escrowId>
CB_ESCROW_ACCEPT = "esc:accept:"
CB_ESCROW_DECLINE = "esc:decline:"
CB_ESCROW_CANCEL = "esc:cancel:"
CB_ESCROW_MARKPAID = "esc:markpaid:"
CB_ESCROW_RELEASE = "esc:release:"
CB_ESCROW_DISPUTE = "esc:dispute:"
# Pay-by-username confirm: pay:confirm:<username>:<amountMinor>
CB_PAY_CONFIRM = "pay:confirm:"
CB_PAY_CANCEL = "pay:cancel"


def webapp_launch_kb(miniapp_url: str, text: str = "🎯 Open SwiftHum") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text=text, web_app=WebAppInfo(url=miniapp_url)),
        ]],
    )


def gift_create_kb(miniapp_url: str) -> InlineKeyboardMarkup:
    """WebApp button opening the Mini App's gift-create screen (/pay/gifts)."""
    deep_link = f"{miniapp_url.rstrip('/')}/pay/gifts"
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🎁 Create a gift", web_app=WebAppInfo(url=deep_link)),
    ]])


def pay_confirm_kb(username: str, amount_minor: int) -> InlineKeyboardMarkup:
    """Confirm/Cancel for a /pay @username transfer."""
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Send", callback_data=f"{CB_PAY_CONFIRM}{username}:{amount_minor}"),
        InlineKeyboardButton(text="✖ Cancel", callback_data=CB_PAY_CANCEL),
    ]])


def escrow_create_kb(miniapp_url: str) -> InlineKeyboardMarkup:
    """WebApp button opening the Mini App's escrow-create screen."""
    deep_link = f"{miniapp_url.rstrip('/')}/pay/escrow/new"
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🛡 New escrow", web_app=WebAppInfo(url=deep_link)),
    ]])


# Which escrow actions a viewer can take, keyed by (role, state). The "waiting"
# party in ACCEPTED/PAID_MARKED can always dispute.
def escrow_actions_kb(escrow: dict) -> InlineKeyboardMarkup | None:
    eid = str(escrow.get("id", ""))
    role = escrow.get("role")
    state = escrow.get("state")
    rows: list[list[InlineKeyboardButton]] = []
    if role == "seller" and state == "PROPOSED":
        rows.append([
            InlineKeyboardButton(text="✅ Accept", callback_data=f"{CB_ESCROW_ACCEPT}{eid}"),
            InlineKeyboardButton(text="❌ Decline", callback_data=f"{CB_ESCROW_DECLINE}{eid}"),
        ])
    elif role == "buyer" and state == "PROPOSED":
        rows.append([InlineKeyboardButton(text="🚫 Cancel", callback_data=f"{CB_ESCROW_CANCEL}{eid}")])
    elif role == "buyer" and state == "ACCEPTED":
        rows.append([
            InlineKeyboardButton(text="✔️ Mark paid", callback_data=f"{CB_ESCROW_MARKPAID}{eid}"),
            InlineKeyboardButton(text="⚠️ Dispute", callback_data=f"{CB_ESCROW_DISPUTE}{eid}"),
        ])
    elif role == "seller" and state == "PAID_MARKED":
        rows.append([
            InlineKeyboardButton(text="💸 Release", callback_data=f"{CB_ESCROW_RELEASE}{eid}"),
            InlineKeyboardButton(text="⚠️ Dispute", callback_data=f"{CB_ESCROW_DISPUTE}{eid}"),
        ])
    elif state in ("ACCEPTED", "PAID_MARKED"):
        rows.append([InlineKeyboardButton(text="⚠️ Dispute", callback_data=f"{CB_ESCROW_DISPUTE}{eid}")])
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


def rule_actions_kb(rule_id: str, is_paused: bool) -> InlineKeyboardMarkup:
    """One-button keyboard: Pause if active, Resume if paused."""
    if is_paused:
        btn = InlineKeyboardButton(text="▶ Resume", callback_data=f"{CB_RULE_RESUME}{rule_id}")
    else:
        btn = InlineKeyboardButton(text="⏸ Pause", callback_data=f"{CB_RULE_PAUSE}{rule_id}")
    return InlineKeyboardMarkup(inline_keyboard=[[btn]])


def menu_hub_kb(miniapp_url: str) -> InlineKeyboardMarkup:
    """The /menu hub — tap-to-act buttons that render each section inline."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="💰 Balance", callback_data=f"{CB_MENU}balance"),
            InlineKeyboardButton(text="👁 Rules", callback_data=f"{CB_MENU}rules"),
        ],
        [
            InlineKeyboardButton(text="📊 Portfolio", callback_data=f"{CB_MENU}portfolio"),
            InlineKeyboardButton(text="📈 Prices", callback_data=f"{CB_MENU}prices"),
        ],
        [
            InlineKeyboardButton(text="🧾 History", callback_data=f"{CB_MENU}history"),
            InlineKeyboardButton(text="🔗 SwiftyEx", callback_data=f"{CB_MENU}swiftyex"),
        ],
        [InlineKeyboardButton(text="🚀 Open SwiftHum", web_app=WebAppInfo(url=miniapp_url))],
    ])


def back_to_menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="‹ Back to menu", callback_data=f"{CB_MENU}home"),
    ]])


def swiftyex_kb(linked: bool) -> InlineKeyboardMarkup:
    action = (
        InlineKeyboardButton(text="Unlink", callback_data=f"{CB_MENU}sx:unlink")
        if linked
        else InlineKeyboardButton(text="🔗 Link (sandbox)", callback_data=f"{CB_MENU}sx:link")
    )
    return InlineKeyboardMarkup(inline_keyboard=[
        [action],
        [InlineKeyboardButton(text="‹ Back to menu", callback_data=f"{CB_MENU}home")],
    ])


def parse_confirm_kb(miniapp_url: str, amount_minor: int) -> InlineKeyboardMarkup:
    """Confirmation keyboard for an NL parse: '💸 Open & pay' WebApp button
    + '✖' cancel callback. The Mini App's Send screen reads ?amount= and prefills."""
    sep = "&" if "?" in miniapp_url else "?"
    deep_link = f"{miniapp_url.rstrip('/')}/pay/send{sep}amount={amount_minor}"
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="💸 Open & pay", web_app=WebAppInfo(url=deep_link)),
        InlineKeyboardButton(text="✖", callback_data=CB_PARSE_CANCEL),
    ]])
