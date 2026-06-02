"""API error wrapper. Carries the backend's machine code so handlers can
branch on it (e.g. show a friendly 'Insufficient balance' message).
"""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message
        super().__init__(f"{status} {code}: {message}")
