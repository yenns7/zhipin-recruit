import sys, json, logging
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

    def parse_and_save(self, file_path: str, owner_hr_id: int) -> Candidate:
        """解析单份简历，存入数据库，返回 Candidate 对象"""
        result = self.parser.parse_resume(file_path)
        info = result.get("extracted_info", {})

        candidate = Candidate(
            owner_hr_id=owner_hr_id,
            name_masked=info.get("name", "")[:100] if info.get("name") else "",
            email_masked=info.get("email", "")[:100] if info.get("email") else "",
            phone_masked=info.get("phone", "")[:30] if info.get("phone") else "",
            resume_json=result,
            raw_file_path=file_path,
        )
        db.session.add(candidate)
        db.session.flush()  # 获取 candidate.id

        # 存技能标签
        for skill in result.get("skills", []):
            tag = CandidateTag(
                candidate_id=candidate.id,
                tag=skill.get("skill_name", ""),
                score=skill.get("score", 3),
            )
            db.session.add(tag)

        db.session.commit()
        return candidate
