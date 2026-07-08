package com.hireinsight.candidate;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.CandidateDisposition;
import com.hireinsight.repository.CandidateDispositionRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/candidates/{candidateId}/disposition")
public class DispositionController {

    private final CandidateDispositionRepository dispositionRepository;

    public DispositionController(CandidateDispositionRepository dispositionRepository) {
        this.dispositionRepository = dispositionRepository;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(
            @PathVariable Long candidateId,
            @Valid @RequestBody CreateDispositionRequest req) {
        CandidateDisposition disposition = CandidateDisposition.builder()
                .candidateId(candidateId)
                .reason(req.getReason())
                .intoPool(req.getIntoPool() != null ? req.getIntoPool() : false)
                .nextContactAt(req.getNextContactAt())
                .build();
        disposition = dispositionRepository.save(disposition);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", disposition.getId(),
                "candidate_id", disposition.getCandidateId(),
                "reason", disposition.getReason(),
                "into_pool", disposition.getIntoPool(),
                "next_contact_at", disposition.getNextContactAt() != null ? disposition.getNextContactAt().toString() : null,
                "created_at", disposition.getCreatedAt() != null ? disposition.getCreatedAt().toString() : null
        )));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> get(@PathVariable Long candidateId) {
        var dispositions = dispositionRepository.findByCandidateIdOrderByCreatedAtDesc(candidateId);
        if (dispositions.isEmpty()) {
            return ResponseEntity.status(404).body(ApiResponse.error(404, "No disposition found"));
        }
        CandidateDisposition d = dispositions.get(0);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", d.getId(),
                "candidate_id", d.getCandidateId(),
                "reason", d.getReason(),
                "into_pool", d.getIntoPool(),
                "next_contact_at", d.getNextContactAt() != null ? d.getNextContactAt().toString() : null,
                "created_at", d.getCreatedAt() != null ? d.getCreatedAt().toString() : null
        )));
    }

    @Data
    public static class CreateDispositionRequest {
        private String reason;
        private Boolean intoPool;
        private LocalDate nextContactAt;
    }
}
