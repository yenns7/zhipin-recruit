"""
TDD tests for JobMatcher.match_resume_to_job

Written BEFORE the implementation exists.
Expected RED failure: AttributeError: 'JobMatcher' object has no attribute 'match_resume_to_job'
"""
import sys
from pathlib import Path

# Add base_agent to path so we can import JobMatcher directly
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent / "base_agent"
sys.path.insert(0, str(BASE_AGENT_DIR))

from job_matcher import JobMatcher


class TestMatchResumeToJob:
    """Tests for JobMatcher.match_resume_to_job(resume_skills, jd_tags)"""

    def setup_method(self):
        self.matcher = JobMatcher()

    def test_partial_match_returns_score_matched_and_missing(self):
        """Candidate with some matching skills returns correct score, matched list, and missing list."""
        resume_skills = [
            {"skill_name": "Python", "score": 4},
            {"skill_name": "SQL", "score": 3},
        ]
        jd_tags = [("Python", 5), ("SQL", 3), ("Docker", 4)]

        score, matched, missing = self.matcher.match_resume_to_job(resume_skills, jd_tags)

        # Score must be in (0, 100] when there is at least one match
        assert 0 < score <= 100, f"Expected score in (0,100], got {score}"
        # Python and SQL are in the resume — both must appear in matched
        assert "Python" in matched, f"Expected 'Python' in matched, got {matched}"
        assert "SQL" in matched, f"Expected 'SQL' in matched, got {matched}"
        # Docker is not in the resume — must appear in missing
        assert "Docker" in missing, f"Expected 'Docker' in missing, got {missing}"
        # Matched and missing must together cover all jd_tags (no tag is both or neither)
        jd_names = {name for name, _ in jd_tags}
        assert set(matched) | set(missing) == jd_names, (
            f"matched + missing must cover all jd tags. "
            f"matched={matched}, missing={missing}, jd_names={jd_names}"
        )
        assert set(matched) & set(missing) == set(), (
            f"No tag should appear in both matched and missing. "
            f"matched={matched}, missing={missing}"
        )

    def test_empty_resume_skills_returns_zero_score_and_all_missing(self):
        """Candidate with no skills scores 0 and all JD skills are missing."""
        resume_skills = []
        jd_tags = [("Python", 5), ("SQL", 3)]

        score, matched, missing = self.matcher.match_resume_to_job(resume_skills, jd_tags)

        assert score == 0, f"Expected score 0 for empty resume, got {score}"
        assert matched == [], f"Expected empty matched list, got {matched}"
        assert set(missing) == {"Python", "SQL"}, (
            f"Expected all JD skills as missing, got {missing}"
        )

    def test_empty_jd_tags_returns_zero_score_and_empty_lists(self):
        """Job with no required skills always returns (0, [], [])."""
        resume_skills = [{"skill_name": "Python", "score": 4}]
        jd_tags = []

        score, matched, missing = self.matcher.match_resume_to_job(resume_skills, jd_tags)

        assert score == 0, f"Expected score 0 for empty jd_tags, got {score}"
        assert matched == [], f"Expected empty matched list, got {matched}"
        assert missing == [], f"Expected empty missing list, got {missing}"
