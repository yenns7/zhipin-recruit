import sys
from pathlib import Path

BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))

from job_matcher import JobMatcher
from .. import db
from ..models import Candidate, CandidateTag, Match, Job


class MatchService:
    def __init__(self):
        self.matcher = JobMatcher()

    def rank_for_job(self, job_id: int, top_n: int = 20) -> list:
        """
        岗找人：给定 job_id，从候选人池返回按匹配分排序的列表。
        复用 base_agent/job_matcher.py 的 parse_job_skills + match_resume_to_job。
        """
        job = Job.query.get(job_id)
        if not job:
            return []

        jd_structured = job.jd_structured or {}
        jd_skill_tags_raw = jd_structured.get("skill_tags_raw", "")
        jd_tags = self.matcher.parse_job_skills(jd_skill_tags_raw)

        candidates = Candidate.query.all()
        results = []
        for c in candidates:
            resume_skills = [
                {"skill_name": t.tag, "score": t.score}
                for t in c.tags
            ]
            score, matched, missing = self.matcher.match_resume_to_job(
                resume_skills, jd_tags
            )
            results.append({
                "candidate_id": c.id,
                "name_masked": c.name_masked,
                "score": score,
                "matched_tags": matched,
                "missing_tags": missing,
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        # 持久化 top_n 匹配结果
        db.session.query(Match).filter(Match.job_id == job_id).delete()
        for r in results[:top_n]:
            db.session.add(Match(
                job_id=job_id,
                candidate_id=r["candidate_id"],
                score=r["score"],
                reason=f"匹配标签: {r['matched_tags'][:3]}"
            ))
        db.session.commit()
        return results[:top_n]
