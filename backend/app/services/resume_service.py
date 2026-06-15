import sys
from pathlib import Path

# 指向 base_agent，复用原始模块
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))

from resume_parser import ResumeParser
from .. import db
from ..models import Candidate, CandidateTag


class ResumeBatchService:
    def __init__(self):
        self.parser = ResumeParser()

    def parse_and_save(self, file_path: str, owner_hr_id: int, upload_batch_id: int = None) -> Candidate:
        """解析单份简历，存入数据库，返回 Candidate 对象"""
        result = self.parser.parse_resume(file_path)

        candidate = Candidate(
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            raw_file_path=file_path,
            resume_json={},
            parse_status="ok",
        )
        db.session.add(candidate)
        db.session.flush()  # 获取 candidate.id
        self._apply_parse_result(candidate, result)
        db.session.commit()
        return candidate

    def create_failed_candidate(
        self,
        file_path: str,
        owner_hr_id: int,
        display_name: str,
        error: Exception,
        upload_batch_id: int = None,
    ) -> Candidate:
        candidate = Candidate(
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            name_masked=display_name[:100],
            resume_json={},
            raw_file_path=file_path,
            parse_status="failed",
            parse_error=str(error)[:500],
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate

    def reparse_candidate(self, candidate: Candidate) -> Candidate:
        if not candidate.raw_file_path:
            raise ValueError("这条候选人没有可重试的原始文件")

        candidate_id = candidate.id
        try:
            candidate.parse_status = "processing"
            candidate.parse_error = None
            db.session.flush()

            result = self.parser.parse_resume(candidate.raw_file_path)
            self._apply_parse_result(candidate, result)
            db.session.commit()
            return candidate
        except Exception as exc:
            db.session.rollback()
            failed_candidate = Candidate.query.get(candidate_id)
            if failed_candidate:
                failed_candidate.parse_status = "failed"
                failed_candidate.parse_error = str(exc)[:500]
                db.session.commit()
            raise

    def _apply_parse_result(self, candidate: Candidate, result: dict) -> None:
        info = result.get("extracted_info", {}) if isinstance(result, dict) else {}
        candidate.name_masked = info.get("name", "")[:100] if info.get("name") else ""
        candidate.email_masked = info.get("email", "")[:100] if info.get("email") else ""
        candidate.phone_masked = info.get("phone", "")[:30] if info.get("phone") else ""
        candidate.resume_json = result
        candidate.parse_status = "ok"
        candidate.parse_error = None

        CandidateTag.query.filter_by(candidate_id=candidate.id).delete()
        skills = result.get("skills", []) if isinstance(result, dict) else []
        for skill in skills:
            tag = CandidateTag(
                candidate_id=candidate.id,
                tag=skill.get("skill_name", ""),
                score=skill.get("score", 3),
            )
            db.session.add(tag)
