from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _python_sources(*parts):
    root = ROOT.joinpath(*parts)
    return sorted(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)


def _offenders(paths, pattern):
    return [
        str(path.relative_to(ROOT))
        for path in paths
        if pattern in path.read_text(encoding="utf-8")
    ]


def test_backend_app_avoids_legacy_query_get():
    offenders = _offenders(_python_sources("backend", "app"), ".query.get(")
    offenders += _offenders(_python_sources("backend", "app"), ".query.get_or_404(")
    assert offenders == []


def test_backend_python_sources_avoid_deprecated_utcnow():
    deprecated = "datetime." + "utcnow("
    offenders = _offenders(
        _python_sources("backend", "app") + _python_sources("backend", "tests"),
        deprecated,
    )
    assert offenders == []


def test_testing_jwt_secret_is_long_enough_for_hs256():
    from app.config import TestingConfig

    assert len(TestingConfig.JWT_SECRET.encode()) >= 32
