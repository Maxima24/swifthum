"""Money formatting — kobo (NGN minor units) → human ₦ string. Integer math
all the way through, no float drift. Matches the backend's BIGINT discipline.
"""

NAIRA = "₦"  # ₦


def kobo_to_naira_str(amount_minor: int) -> str:
    """`500000` → `₦5,000.00`. Handles 0 and large values cleanly."""
    if amount_minor < 0:
        return f"-{kobo_to_naira_str(-amount_minor)}"
    naira, kobo = divmod(amount_minor, 100)
    return f"{NAIRA}{naira:,}.{kobo:02d}"
