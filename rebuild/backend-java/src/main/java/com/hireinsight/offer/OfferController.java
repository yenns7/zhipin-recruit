package com.hireinsight.offer;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.OfferRecord;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/offers")
public class OfferController {

    private final OfferService offerService;

    public OfferController(OfferService offerService) {
        this.offerService = offerService;
    }

    @PostMapping("/{id}/withdraw")
    public ResponseEntity<ApiResponse<Map<String, Object>>> withdraw(@PathVariable Long id, Authentication auth) {
        OfferRecord offer = offerService.withdraw(id);
        return ResponseEntity.ok(ApiResponse.ok(offerService.toResponse(offer)));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approve(@PathVariable Long id, Authentication auth) {
        OfferRecord offer = offerService.approve(id);
        return ResponseEntity.ok(ApiResponse.ok(offerService.toResponse(offer)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(
            @Valid @RequestBody CreateOfferRequest req, Authentication auth) {
        OfferRecord offer = OfferRecord.builder()
                .candidateId(req.getCandidateId())
                .jobId(req.getJobId())
                .salary(req.getSalary())
                .startDate(req.getStartDate())
                .remark(req.getRemark())
                .build();
        offer = offerService.create(offer);
        return ResponseEntity.ok(ApiResponse.ok(offerService.toResponse(offer)));
    }

    @Data
    public static class CreateOfferRequest {
        @NotNull(message = "candidateId is required")
        private Long candidateId;
        @NotNull(message = "jobId is required")
        private Long jobId;
        private String salary;
        private LocalDate startDate;
        private String remark;
    }
}
