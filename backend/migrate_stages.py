"""一次性幂等迁移：旧单值 interview → interview_first；建新表/新列。

重跑安全：无 interview 行则 0 改动。新表（如 InterviewFeedback，在其模型
被定义后）由 create_all() 建出；已存在的表不会被重建。

注意：SQLite 的 create_all() 不会给【已存在】的表补列。开发用种子库
hireinsight.db 的新列（pipeline_stages.note、users.is_active）需手动 ALTER，
见 _ensure_columns()，其用 try/except 实现幂等（列已存在则跳过）。
"""
from sqlalchemy import text
from app import create_app, db
from app.models import PipelineStage


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


def run():
    app = create_app()
    with app.app_context():
        db.create_all()        # 建新表（已存在表不动）
        _ensure_columns()      # 给旧表补新列（幂等）
        rows = PipelineStage.query.filter_by(stage="interview").all()
        for r in rows:
            r.stage = "interview_first"
        db.session.commit()
        print(f"migrated {len(rows)} 'interview' rows -> 'interview_first'")


if __name__ == "__main__":
    run()
