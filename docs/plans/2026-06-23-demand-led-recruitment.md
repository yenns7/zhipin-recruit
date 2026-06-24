# Demand-Led Recruitment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make recruitment demand the primary workflow, with job/JD acting as an auto-created or reused matching profile.

**Architecture:** Keep the existing `jobs` and `recruitment_demands` schema. Extend `POST /api/demands` so it either reuses an active job profile via `job_id` or creates a new `Job` from demand form fields before creating the demand. Update the frontend language and entry points so users act on a demand workflow rather than a job workflow.

**Tech Stack:** Flask, SQLAlchemy, React, TypeScript, Vite, static frontend tests, pytest.

---

### Task 1: Backend Demand Creation

**Files:**
- Modify: `backend/tests/test_demand_management.py`
- Modify: `backend/app/api/demands.py`

**Steps:**
1. Add a failing test that posts `/api/demands` without `job_id`, with `job_title`, `jd_text`, `requester_department`, `headcount`, and `priority`.
2. Verify it fails because `job_id required`.
3. Extend backend creation logic to create a `Job` when `job_id` is omitted.
4. Preserve existing reuse behavior when `job_id` is supplied.
5. Run `pytest backend/tests/test_demand_management.py`.

### Task 2: Frontend Contract and Demand Page

**Files:**
- Modify: `frontend/tests/demand_management.test.mjs`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/features/demands/pages/DemandsPage.tsx`

**Steps:**
1. Add failing static assertions for “招聘岗位”, “岗位职责/任职要求”, “复用已有岗位画像”, “匹配候选人”, and absence of “关联岗位”.
2. Update `RecruitmentDemandInput` to support direct demand creation fields.
3. Change the demand form to direct creation by default, with an optional reuse selector.
4. Add demand card actions for matching candidates and viewing demand flow.
5. Run `node frontend/tests/demand_management.test.mjs`.

### Task 3: Workflow Language and Click-Through

**Files:**
- Modify: `frontend/tests/mvp_user_flow_shortcuts.test.mjs`
- Modify: `frontend/tests/candidate_library_ux_consolidation.test.mjs`
- Modify: `frontend/tests/job_match_pipeline_next_step.test.mjs`
- Modify: `frontend/tests/pipeline_focus_ux.test.mjs`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/JobMatchPage.tsx`
- Modify: `frontend/src/features/candidates/pages/CandidatesPage.tsx`
- Modify: `frontend/src/pages/PipelinePage.tsx`
- Modify: `frontend/src/components/pipeline/AddToPipeline.tsx`
- Modify: `frontend/src/components/pipeline/PipelineCandidatePanel.tsx`

**Steps:**
1. Add or update static assertions that key actions say “加入该需求流程” and “转入其他招聘需求”.
2. Make dashboard numbers and alerts link to filtered workflow pages.
3. Rename pipeline and matching page actions to demand-flow language.
4. Add a transfer-to-demand entry in the candidate panel as a visible next-step action.
5. Run the changed frontend tests.

### Task 4: Documentation Sync

**Files:**
- Modify: `README.md`
- Modify: `RUNNING.md`
- Modify: `docs/01_PRD.md`
- Modify: `docs/03_BI看板设计.md`
- Modify: `docs/SDD-智聘招聘系统-v1.0.md`

**Steps:**
1. Update product flow language to demand-first.
2. Explain that job/JD is a matching profile created or reused by a demand.
3. Clarify BI demand health and workflow click-through behavior.
4. Run documentation grep checks for stale “关联岗位” wording in user-facing docs.

### Task 5: Verification

**Commands:**
- `cd backend && ../.venv312/bin/pytest tests/test_demand_management.py -q`
- `node frontend/tests/demand_management.test.mjs`
- `node frontend/tests/mvp_user_flow_shortcuts.test.mjs`
- `node frontend/tests/candidate_library_ux_consolidation.test.mjs`
- `node frontend/tests/job_match_pipeline_next_step.test.mjs`
- `node frontend/tests/pipeline_focus_ux.test.mjs`

**Expected:** All targeted tests pass. Manual smoke confirms creating a demand without pre-creating a job returns a demand with `job_id`.
