import sys, json
from pathlib import Path

BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))

from llm_client import LLMClient
from .. import db
from ..models import Interview, Job, Candidate

EVAL_PROMPT_SYS = (
    "你是一位严格的技术面试官。请评估候选人的回答，返回如下 JSON（不含其他文字）：\n"
    '{"score": 1-5, "highlight": "亮点", "concern": "疑点或包装迹象", "pass_recommended": true/false}'
)

EVAL_PROMPT_USER = (
    "岗位要求：{jd}\n面试题：{question}\n候选人回答：{answer}"
)

QUESTION_PROMPT_SYS = (
    "你是一位资深面试官。根据以下岗位要求，生成 {count} 道有针对性的面试题，"
    "用 JSON 数组返回（字符串列表），不含其他文字。"
)


class PreScreenService:
    def __init__(self, llm=None):
        self._llm = llm

    @property
    def llm(self):
        if self._llm is None:
            self._llm = LLMClient()
        return self._llm

    def generate_questions(self, jd_text: str, count: int = 5) -> list:
        raw = self.llm.chat(
            QUESTION_PROMPT_SYS.format(count=count),
            f"岗位描述：{jd_text[:2000]}"
        )
        try:
            qs = json.loads(raw.strip())
            return qs if isinstance(qs, list) else []
        except Exception:
            return [line.strip("- •1234567890.）)") for line in raw.splitlines() if line.strip()][:count]

    def evaluate_answer(self, question: str, answer: str, jd_text: str) -> dict:
        raw = self.llm.chat(
            EVAL_PROMPT_SYS,
            EVAL_PROMPT_USER.format(jd=jd_text[:800], question=question, answer=answer)
        )
        try:
            return json.loads(raw.strip())
        except Exception:
            return {"score": 3, "highlight": "", "concern": "解析失败", "pass_recommended": False}

    def build_report(self, qa_pairs: list, jd_text: str) -> dict:
        """qa_pairs: [(question, answer), ...]"""
        evals = [self.evaluate_answer(q, a, jd_text) for q, a in qa_pairs]
        avg = sum(e.get("score", 3) for e in evals) / len(evals) if evals else 0
        return {
            "avg_score": round(avg, 1),
            "pass_recommended": avg >= 3.5,
            "details": evals,
        }

    def save_report(self, candidate_id: int, job_id: int, qa_pairs: list, report: dict) -> Interview:
        iv = Interview(
            candidate_id=candidate_id,
            job_id=job_id,
            qa_json=[{"q": q, "a": a} for q, a in qa_pairs],
            ai_report=report,
            score=report["avg_score"],
            pass_recommended=report["pass_recommended"],
        )
        db.session.add(iv)
        db.session.commit()
        return iv
