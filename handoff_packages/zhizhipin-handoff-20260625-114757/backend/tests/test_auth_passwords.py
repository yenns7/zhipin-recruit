import hashlib

from app.api.auth import _hash, _verify


def test_verify_accepts_bcrypt_password_hash():
    hashed = _hash("demo1234")

    assert _verify("demo1234", hashed)
    assert not _verify("wrong-password", hashed)


def test_verify_accepts_legacy_sha256_seed_hash():
    legacy_hash = hashlib.sha256("demo1234".encode()).hexdigest()

    assert _verify("demo1234", legacy_hash)
    assert not _verify("wrong-password", legacy_hash)
