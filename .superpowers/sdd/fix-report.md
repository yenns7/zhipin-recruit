# Fix Report: Resolve 3 Important findings from final whole-branch review

Repo: `/Users/bytedance/Desktop/zhiping`, branch `Java`.

## Files changed

1. `rebuild/frontend-vue/src/views/interviews/InterviewReportView.vue`
2. `rebuild/frontend-vue/src/views/candidates/CandidateListView.vue`
3. `rebuild/frontend-vue/src/views/interviews/InterviewReportView.test.ts`
4. `rebuild/frontend-vue/src/tests/candidate-workspace.test.ts`

## Fixes applied

### I1 — Feedback POST sends invalid JSON to jsonb columns
- In `InterviewReportView.vue` `submitFeedback()`, changed `aiReport: feedbackNotes.value || '{}'` to
  `aiReport: JSON.stringify({ summary: feedbackNotes.value || '面试官未补充备注' })`.
- `qaJson` was already a valid JSON array string (`JSON.stringify([...])`) — left unchanged.
- Read-back display still works because `parseReport`/`parseJson` handle `{summary: ...}` objects.

### I2 — Score default 0 vs backend @Min(1)
- Changed `feedbackScore` ref default from `0` to `1`.
- Changed the score input from `min="0" max="5" step="0.5"` to `min="1" max="5" step="1"`.
- Updated the label from "综合评分（0-5，步进 0.5）" to "综合评分（1-5）".
- Kept `v-model.number` and `required`.

### I3 — Doc/UI contradiction: CandidateListView still says "异步解析"
- Updated `CandidateListView.vue:113` text to:
  "上传简历后会真实写入 Java rebuild 的 PostgreSQL dev 数据库（当前为同步写入候选人记录，简历内容暂以占位存储，尚未接真实解析链路），而不是只停留在前端临时态或刷新即丢。"
- Updated both assertions in `candidate-workspace.test.ts` (lines 37 and 50) to check for the
  stable substring `'真实写入 Java rebuild 的 PostgreSQL dev 数据库'`, which is contained in the
  new UI text.

## New assertion added for I1 (proves fix is real, not H2-masked)

In `InterviewReportView.test.ts`, the feedback-submission test now captures the POST body and
asserts the `aiReport` value is a JSON-parseable string with a `summary` property:

```ts
// I1: aiReport must be a JSON-parseable string with a `summary` property,
// proving we send valid JSON to the backend jsonb column (not plain text).
const aiReportParsed = JSON.parse(body.aiReport)
expect(aiReportParsed).toHaveProperty('summary')
expect(aiReportParsed.summary).toBe('沟通清晰')
```

This proves the frontend sends `{"summary":"沟通清晰"}` (valid JSON) rather than the plain text
`沟通清晰`, which PostgreSQL jsonb would reject with "invalid input syntax for type json".

## Verification

### npm test
```
 Test Files  26 passed (26)
      Tests  79 passed (79)
   Duration  3.12s
```
All 79 tests pass (including the 2 updated candidate-workspace assertions and the new I1 JSON-parse assertion).

### npm run typecheck
```
> hireinsight-vue-mvp@0.1.0 typecheck
> vue-tsc --noEmit
```
Clean (exit 0, no errors).
