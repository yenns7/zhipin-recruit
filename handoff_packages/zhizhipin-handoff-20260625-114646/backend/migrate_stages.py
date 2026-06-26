"""一次性幂等迁移：旧面试阶段 interview_first/second/final → interview；建新表/新列。

重跑安全：无旧面试阶段则 0 改动。新表（如 InterviewFeedback，在其模型
被定义后）由 create_all() 建出；已存在的表不会被重建。

注意：SQLite 的 create_all() 不会给【已存在】的表补列。开发用种子库
hireinsight.db 的新列（pipeline_stages.note、users.is_active）需手动 ALTER，
见 _ensure_columns()，其用 try/except 实现幂等（列已存在则跳过）。
"""
from sqlalchemy import text
from app import create_app, db
from app.models import PipelineStage


LEGACY_INTERVIEW_STAGES = {"interview_first", "interview_second", "interview_final"}


def _ensure_columns():
    """给已存在的表补新列；列已存在时 SQLite 报错，捕获后跳过（幂等）。"""
    stmts = [
        "ALTER TABLE pipeline_stages ADD COLUMN note TEXT",
        "ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1 NOT NULL",
    ]
    for s in stmts:
        try:
            db.session.execute(text(s))
            db.session.commit()
            print(f"applied: {s}")
        except Exception as e:
            db.session.rollback()
            print(f"skip (likely exists): {s.split('ADD COLUMN')[1].strip()}")


def normalize_legacy_interview_stages():
    rows = PipelineStage.query.filter(PipelineStage.stage.in_(LEGACY_INTERVIEW_STAGES)).all()
    for row in rows:
        row.stage = "interview"
    db.session.commit()
    return len(rows)


def run():
    app = create_app()
    with app.app_context():
        db.create_all()        # 建新表（已存在表不动）
        _ensure_columns()      # 给旧表补新列（幂等）
        migrated = normalize_legacy_interview_stages()
        print(f"migrated {migrated} legacy interview rows -> 'interview'")


if __name__ == "__main__":
    run()
