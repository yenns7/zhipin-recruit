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
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/pipeline")
public class PipelineController {

    private static final Set<String> VALID_STAGES = Set.of(
            "pending", "ai_screen", "interview", "offer", "onboarded", "rejected");

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

    @Data
    public static class MoveRequest {
        @NotBlank
        private String toStage;
        private Long candidateId;
        private Long jobId;
    }
}
