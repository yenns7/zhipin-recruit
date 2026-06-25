import importlib.util
from pathlib import Path
import pypdf


ROOT = Path(__file__).resolve().parents[2]
MIN_SAFE_PYPDF = (6, 13, 0)


def _version_tuple(version: str):
    return tuple(int(part) for part in version.split(".")[:3])


def test_pdf_parser_uses_pypdf_not_pypdf2():
    parser_source = (ROOT / "base_agent" / "resume_parser.py").read_text(encoding="utf-8")
    assert "import PyPDF2" not in parser_source
    assert "PyPDF2.PdfReader" not in parser_source
    assert "from pypdf import PdfReader" in parser_source


def test_requirements_depend_on_pypdf_not_pypdf2():
    requirement_text = "\n".join(
        [
            (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8"),
            (ROOT / "base_agent" / "requirements.txt").read_text(encoding="utf-8"),
        ]
    )
    assert "PyPDF2" not in requirement_text
    assert "pypdf" in requirement_text


def test_runtime_can_import_pypdf():
    assert importlib.util.find_spec("pypdf") is not None


def test_runtime_pypdf_version_is_not_vulnerable_baseline():
    assert _version_tuple(pypdf.__version__) >= MIN_SAFE_PYPDF
