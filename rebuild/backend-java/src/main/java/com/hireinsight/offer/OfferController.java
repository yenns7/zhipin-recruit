package com.hireinsight.offer;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.OfferRecord;
import com.hireinsight.repository.OfferRecordRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/offers")
public class OfferController {

    private final OfferRecordRepository offerRepository;

    public OfferController(OfferRecordRepository offerRepository) {
        this.offerRepository = offerRepository;
    }

    @PostMapping("/{id}/withdraw")
    public ResponseEntity<ApiResponse<Map<String, Object>>> withdraw(@PathVariable Long id, Authentication auth) {
        OfferRecord offer = offerRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Offer not found: " + id));
        offer.setStatus(OfferRecord.Status.WITHDRAWN);
        offer = offerRepository.save(offer);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", offer.getId(),
                "status", offer.getStatus().name()
        )));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approve(@PathVariable Long id, Authentication auth) {
        OfferRecord offer = offerRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Offer not found: " + id));
        offer.setStatus(OfferRecord.Status.APPROVED);
        offer = offerRepository.save(offer);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", offer.getId(),
                "status", offer.getStatus().name()
        )));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(
            @RequestBody Map<String, Object> body, Authentication auth) {
        OfferRecord offer = OfferRecord.builder()
                .candidateId(Long.valueOf(body.get("candidateId").toString()))
                .jobId(Long.valueOf(body.get("jobId").toString()))
                .salary((String) body.getOrDefault("salary", null))
                .startDate(body.get("startDate") != null ? java.time.LocalDate.parse(body.get("startDate").toString()) : null)
                .remark((String) body.getOrDefault("remark", null))
                .status(OfferRecord.Status.PENDING)
                .build();
        offer = offerRepository.save(offer);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", offer.getId(),
                "status", offer.getStatus().name()
        )));
    }
}
