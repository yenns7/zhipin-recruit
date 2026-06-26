from datetime import UTC, datetime


def utc_now():
    """Return a naive UTC datetime, matching existing database column shape."""
    return datetime.now(UTC).replace(tzinfo=None)
