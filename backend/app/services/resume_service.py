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

        self._replace_candidate_tags(candidate, result.get("skills", []) if isinstance(result, dict) else [])

    def update_candidate_profile(self, candidate: Candidate, profile: dict, skills=None) -> Candidate:
        """保存 HR 手动修正后的候选人档案，并同步候选人主信息与技能标签。"""
        resume = candidate.resume_json if isinstance(candidate.resume_json, dict) else {}
        next_resume = dict(resume)
        existing_info = next_resume.get("extracted_info")
        if not isinstance(existing_info, dict):
            existing_info = {}

        next_info = dict(existing_info)
        next_info.update(self._sanitize_profile(profile))
        next_resume["extracted_info"] = next_info

        if skills is not None:
            next_resume["skills"] = self._sanitize_skills(skills)

        candidate.resume_json = next_resume
        candidate.name_masked = str(next_info.get("name") or "")[:100]
        candidate.email_masked = str(next_info.get("email") or "")[:100]
        candidate.phone_masked = str(next_info.get("phone") or "")[:30]
        candidate.parse_status = "ok"
        candidate.parse_error = None

        if skills is not None:
            self._replace_candidate_tags(candidate, next_resume.get("skills", []))

        db.session.commit()
        return candidate

    def _sanitize_profile(self, profile: dict) -> dict:
        if not isinstance(profile, dict):
            return {}

        scalar_fields = {
            "name": 100,
            "email": 100,
            "phone": 30,
            "summary": 2000,
            "intent_city": 80,
            "additional_info": 4000,
        }
        list_fields = {
            "education",
            "experience",
            "projects",
            "certifications",
            "languages",
        }

        cleaned = {}
        for field, limit in scalar_fields.items():
            if field in profile:
                cleaned[field] = str(profile.get(field) or "").strip()[:limit]
        for field in list_fields:
            if field in profile:
                cleaned[field] = self._sanitize_item_list(profile.get(field))
        return cleaned

    def _sanitize_item_list(self, value) -> list:
        if not isinstance(value, list):
            return []
        items = []
        for raw in value[:20]:
            if isinstance(raw, dict):
                item = {}
                for key, val in raw.items():
                    clean_key = str(key or "").strip()[:40]
                    clean_val = str(val or "").strip()[:2000]
                    if clean_key and clean_val:
                        item[clean_key] = clean_val
                if item:
                    items.append(item)
            else:
                text = str(raw or "").strip()[:2000]
                if text:
                    items.append(text)
        return items

    def _sanitize_skills(self, skills: list) -> list:
        if not isinstance(skills, list):
            return []
        cleaned = []
        seen = set()
        for raw in skills[:50]:
            if not isinstance(raw, dict):
                continue
            name = str(raw.get("skill_name") or raw.get("tag") or "").strip()[:100]
            if not name or name in seen:
                continue
            try:
                score = int(raw.get("score", 3))
            except (TypeError, ValueError):
                score = 3
            score = min(5, max(1, score))
            cleaned.append({
                "skill_name": name,
                "score": score,
                "category": str(raw.get("category") or "人工修正")[:40],
            })
            seen.add(name)
        return cleaned

    def _replace_candidate_tags(self, candidate: Candidate, skills: list) -> None:
        CandidateTag.query.filter_by(candidate_id=candidate.id).delete()
        for skill in skills:
            if not isinstance(skill, dict):
                continue
            tag_name = str(skill.get("skill_name") or skill.get("tag") or "").strip()
            if not tag_name:
                continue
            tag = CandidateTag(
                candidate_id=candidate.id,
                tag=tag_name[:100],
                score=self._coerce_score(skill.get("score", 3)),
            )
            db.session.add(tag)

    def _coerce_score(self, value) -> int:
        try:
            score = int(value)
        except (TypeError, ValueError):
            score = 3
        return min(5, max(1, score))
