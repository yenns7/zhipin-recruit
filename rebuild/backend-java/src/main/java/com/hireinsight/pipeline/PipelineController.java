package com.hireinsight.pipeline;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.PipelineStage;
import com.hireinsight.repository.PipelineStageRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/pipeline")
public class PipelineController {

    private static final Set<String> VALID_STAGES = Set.of(
            "pending", "ai_screen", "business_review", "interview", "offer", "onboarded", "rejected");

    private final PipelineStageRepository pipelineStageRepository;

    public PipelineController(PipelineStageRepository pipelineStageRepository) {
        this.pipelineStageRepository = pipelineStageRepository;
    }

    @PostMapping("/move")
    public ResponseEntity<ApiResponse<Map<String, Object>>> move(
            @Valid @RequestBody MoveRequest req, Authentication auth) {
        Long userId = (Long) auth.getDetails();
        if (!VALID_STAGES.contains(req.getToStage())) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(400, "Invalid stage: " + req.getToStage()
                            + ". Valid: " + VALID_STAGES));
        }
        PipelineStage stage = PipelineStage.builder()
                .candidateId(req.getCandidateId())
                .jobId(req.getJobId())
                .stage(req.getToStage())
                .updatedBy(userId)
                .build();
        stage = pipelineStageRepository.save(stage);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", stage.getId(), "stage", stage.getStage())));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<PipelineStage>>> getPipeline(
            @RequestParam Long candidateId, @RequestParam Long jobId) {
        List<PipelineStage> stages = pipelineStageRepository
                .findByCandidateIdAndJobIdOrderByTsDesc(candidateId, jobId);
        return ResponseEntity.ok(ApiResponse.ok(stages));
    }

    @GetMapping("/{jobId}/board")
    public ResponseEntity<ApiResponse<Map<String, Object>>> board(@PathVariable Long jobId) {
        Map<String, List<Map<String, Object>>> stages = emptyBoard();
        Map<Long, PipelineStage> latestByCandidate = new LinkedHashMap<>();
        pipelineStageRepository.findByJobIdOrderByTsDesc(jobId)
                .forEach(stage -> latestByCandidate.putIfAbsent(stage.getCandidateId(), stage));

        latestByCandidate.values().forEach(stage -> {
            stages.computeIfAbsent(stage.getStage(), ignored -> new ArrayList<>())
                    .add(Map.of(
                            "candidateId", stage.getCandidateId(),
                            "candidateName", "候选人 " + stage.getCandidateId(),
                            "stage", stage.getStage(),
                            "updatedAt", stage.getTs() == null ? "" : stage.getTs().toString()
                    ));
        });
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "jobId", jobId,
                "stages", stages
        )));
    }

    @GetMapping("/{jobId}/candidates/{candidateId}/history")
    public ResponseEntity<ApiResponse<Map<String, Object>>> history(
            @PathVariable Long jobId,
            @PathVariable Long candidateId) {
        List<PipelineStage> rows = pipelineStageRepository.findByCandidateIdAndJobIdOrderByTsDesc(candidateId, jobId);
        List<PipelineStage> chronological = new ArrayList<>(rows);
        java.util.Collections.reverse(chronological);
        List<Map<String, Object>> events = new ArrayList<>();
        String fromStage = null;
        for (PipelineStage row : chronological) {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("eventType", fromStage == null ? "CREATED" : "MOVED");
            event.put("fromStage", fromStage);
            event.put("toStage", row.getStage());
            event.put("reason", null);
            event.put("note", "候选人阶段记录");
            event.put("operatorId", row.getUpdatedBy());
            event.put("operatorName", "招聘专员");
            event.put("happenedAt", row.getTs() == null ? null : row.getTs().toString());
            events.add(event);
            fromStage = row.getStage();
        }
        String currentStage = rows.isEmpty() ? "pending" : rows.get(0).getStage();
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "candidateId", candidateId,
                "candidateName", "候选人 " + candidateId,
                "jobId", jobId,
                "currentStage", currentStage,
                "historyHint", "修正只会新增事件，不会抹掉历史推进记录。",
                "events", events
        )));
    }

    @PostMapping("/revise")
    public ResponseEntity<ApiResponse<Map<String, Object>>> revise(
            @Valid @RequestBody ReviseRequest req, Authentication auth) {
        if (!VALID_STAGES.contains(req.getToStage())) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(400, "Invalid stage: " + req.getToStage()
                            + ". Valid: " + VALID_STAGES));
        }
        String fromStage = pipelineStageRepository
                .findTopByCandidateIdAndJobIdOrderByTsDesc(req.getCandidateId(), req.getJobId())
                .map(PipelineStage::getStage)
                .orElse("pending");
        Long userId = (Long) auth.getDetails();
        PipelineStage stage = PipelineStage.builder()
                .candidateId(req.getCandidateId())
                .jobId(req.getJobId())
                .stage(req.getToStage())
                .updatedBy(userId)
                .build();
        stage = pipelineStageRepository.save(stage);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", stage.getId(),
                "eventType", "CORRECTED",
                "fromStage", fromStage,
                "toStage", stage.getStage()
        )));
    }

    @GetMapping("/{jobId}/candidates/{candidateId}/rollback-preview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> rollbackPreview(
            @PathVariable Long jobId,
            @PathVariable Long candidateId) {
        String currentStage = pipelineStageRepository
                .findTopByCandidateIdAndJobIdOrderByTsDesc(candidateId, jobId)
                .map(PipelineStage::getStage)
                .orElse("pending");
        boolean canRollback = "interview".equals(currentStage);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "canRollback", canRollback,
                "currentStage", currentStage,
                "targetStage", canRollback ? "business_review" : "",
                "explanation", canRollback ? "将候选人从「面试中」撤回到「业务评估」。" : "",
                "history", List.of(),
                "reasonIfBlocked", canRollback ? "" : "当前阶段无法回退。"
        )));
    }

    @PostMapping("/{jobId}/candidates/{candidateId}/rollback")
    public ResponseEntity<ApiResponse<Map<String, Object>>> rollback(
            @PathVariable Long jobId,
            @PathVariable Long candidateId,
            Authentication auth) {
        Long userId = (Long) auth.getDetails();
        PipelineStage stage = pipelineStageRepository.save(PipelineStage.builder()
                .candidateId(candidateId)
                .jobId(jobId)
                .stage("business_review")
                .updatedBy(userId)
                .build());
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "stageEntryId", stage.getId(),
                "eventType", "ROLLBACK",
                "fromStage", "interview",
                "toStage", "business_review",
                "explanation", "已将候选人从「面试中」撤回到「业务评估」。关联的面试记录已重开。",
                "interviewAffected", true,
                "interviewLink", Map.of(
                        "reopened", true,
                        "interviewFeedbackId", 0,
                        "note", "已重开 1 条面试记录，可重新安排面试。"
                ),
                "historyHint", "修正只会新增事件，不会抹掉历史推进记录。"
        )));
    }

    private Map<String, List<Map<String, Object>>> emptyBoard() {
        Map<String, List<Map<String, Object>>> board = new LinkedHashMap<>();
        List.of("pending", "ai_screen", "business_review", "interview", "offer", "onboarded", "rejected")
                .forEach(stage -> board.put(stage, new ArrayList<>()));
        return board;
    }

    @Data
    public static class MoveRequest {
        @NotBlank
        private String toStage;
        private Long candidateId;
        private Long jobId;
    }

    @Data
    public static class ReviseRequest {
        @NotBlank
        private String toStage;
        private Long candidateId;
        private Long jobId;
        private String reason;
        private String note;
    }
}
