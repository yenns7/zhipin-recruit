import sys
from pathlib import Path

BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))

from job_matcher import JobMatcher
from .. import db
from ..models import Candidate, CandidateTag, Match, Job
from typing import List, Dict, Any


class MatchService:
    def __init__(self):
        self.matcher = JobMatcher()

    def _compute_rankings(self, job_id: int, candidate_query=None) -> List[Dict[str, Any]]:
        """纯计算匹配排名，不持久化。"""
        job = Job.query.get(job_id)
        if not job:
            return []

        jd_structured = job.jd_structured or {}
        jd_skill_tags_raw = jd_structured.get("skill_tags_raw", "")
        jd_tags = self.matcher.parse_job_skills(jd_skill_tags_raw)

        candidates = (candidate_query or Candidate.query).all()
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
        return results

    def rank_for_job_readonly(
        self,
        job_id: int,
        top_n: int = 20,
        candidate_query=None,
    ) -> List[Dict[str, Any]]:
        """只读匹配排名（不修改数据库），供 AI 智能体查询工具使用。"""
        results = self._compute_rankings(job_id, candidate_query=candidate_query)
        return results[:top_n]

    def rank_for_job(self, job_id: int, top_n: int = 20, candidate_query=None) -> list:
        """
        岗找人：给定 job_id，从候选人池返回按匹配分排序的列表，并持久化结果。
        复用 base_agent/job_matcher.py 的 parse_job_skills + match_resume_to_job。
        """
        results = self._compute_rankings(job_id, candidate_query=candidate_query)
        if not results:
            return []

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
