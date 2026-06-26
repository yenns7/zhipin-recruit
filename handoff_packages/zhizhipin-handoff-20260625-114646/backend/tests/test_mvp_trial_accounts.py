from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_seed_uses_neutral_mvp_trial_accounts():
    seed_text = (ROOT / "backend" / "seed_dev.py").read_text(encoding="utf-8")

    assert "@demo.com" not in seed_text
    assert "demo1234" not in seed_text
    assert "Zhipin2026" in seed_text

    for email in [
        "admin01@mvp.local",
        "manager01@mvp.local",
        "lead01@mvp.local",
        "hr01@mvp.local",
        "hr02@mvp.local",
        "hr03@mvp.local",
        "interviewer01@mvp.local",
    ]:
        assert email in seed_text


def test_running_docs_explain_trial_account_ownership_and_bi():
    running_text = (ROOT / "RUNNING.md").read_text(encoding="utf-8")

    assert "@demo.com" not in running_text
    assert "demo1234" not in running_text
    assert "内部试用账号" in running_text
    assert "一人一个账号" in running_text
    assert "BI" in running_text
    assert "用户 ID" in running_text
