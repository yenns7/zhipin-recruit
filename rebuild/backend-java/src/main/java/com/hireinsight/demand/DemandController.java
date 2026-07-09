package com.hireinsight.demand;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.RecruitmentDemand;
import com.hireinsight.repository.DemandRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/v1/demands")
public class DemandController {

    private final DemandRepository demandRepository;
    private final DemandService demandService;

    public DemandController(DemandRepository demandRepository, DemandService demandService) {
        this.demandRepository = demandRepository;
        this.demandService = demandService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<DemandResponse>>> listDemands(
            Authentication auth,
            @RequestParam(required = false) String status) {
        Long userId = (Long) auth.getDetails();
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_MANAGER"));
        List<DemandResponse> demands = demandService.listDemands(userId, isAdmin, status);
        return ResponseEntity.ok(ApiResponse.ok(demands));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> createDemand(
            @Valid @RequestBody CreateDemandRequest req, Authentication auth) {
        Long userId = (Long) auth.getDetails();
        RecruitmentDemand demand = RecruitmentDemand.builder()
                .requestNo(req.getRequestNo())
                .requesterName(req.getRequesterName())
                .department(req.getDepartment())
                .hiringManagerName(req.getHiringManagerName())
                .ownerHrId(userId)
                .requestedAt(Instant.now())
                .priority(req.getPriority() != null ? req.getPriority() : "medium")
                .headcount(req.getHeadcount() != null ? req.getHeadcount() : 1)
                .targetDate(req.getTargetDate())
                .note(req.getNote())
                .status("open")
                .build();
        demand = demandRepository.save(demand);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(Map.of("id", demand.getId())));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<DemandResponse>> getDemand(@PathVariable Long id) {
        DemandResponse resp = demandService.getDemand(id);
        return ResponseEntity.ok(ApiResponse.ok(resp));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateDemand(
            @PathVariable Long id,
            @Valid @RequestBody UpdateDemandRequest req,
            Authentication auth) {
        RecruitmentDemand demand = demandRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Demand not found: " + id));
        if (req.getRequestNo() != null) demand.setRequestNo(req.getRequestNo());
        if (req.getRequesterName() != null) demand.setRequesterName(req.getRequesterName());
        if (req.getDepartment() != null) demand.setDepartment(req.getDepartment());
        if (req.getHiringManagerName() != null) demand.setHiringManagerName(req.getHiringManagerName());
        if (req.getPriority() != null) demand.setPriority(req.getPriority());
        if (req.getHeadcount() != null) demand.setHeadcount(req.getHeadcount());
        if (req.getTargetDate() != null) demand.setTargetDate(req.getTargetDate());
        if (req.getNote() != null) demand.setNote(req.getNote());
        if (req.getJobId() != null) demand.setJobId(req.getJobId());
        demand = demandRepository.save(demand);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", demand.getId())));
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<ApiResponse<Map<String, Object>>> closeDemand(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        RecruitmentDemand demand = demandRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Demand not found: " + id));
        demand.setStatus("closed");
        demand.setCloseReason(body.getOrDefault("closeReason", null));
        demand = demandRepository.save(demand);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", demand.getId(), "status", demand.getStatus())));
    }

    @PostMapping("/{id}/restore")
    public ResponseEntity<ApiResponse<Map<String, Object>>> restoreDemand(@PathVariable Long id) {
        RecruitmentDemand demand = demandRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Demand not found: " + id));
        demand.setStatus("open");
        demand.setCloseReason(null);
        demand = demandRepository.save(demand);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", demand.getId(), "status", demand.getStatus())));
    }

    @PostMapping("/{id}/downgrade")
    public ResponseEntity<ApiResponse<Map<String, Object>>> downgradeDemand(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        RecruitmentDemand demand = demandRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Demand not found: " + id));
        demand.setStatus("downgraded");
        demand.setDowngradeReason(body.getOrDefault("downgradeReason", null));
        demand = demandRepository.save(demand);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", demand.getId(), "status", demand.getStatus())));
    }

    @Data
    public static class CreateDemandRequest {
        @NotBlank
        private String requestNo;
        @NotBlank
        private String requesterName;
        @NotBlank
        private String department;
        @NotBlank
        private String hiringManagerName;
        private String priority;
        private Integer headcount;
        private LocalDate targetDate;
        private String note;
    }

    @Data
    public static class UpdateDemandRequest {
        private String requestNo;
        private String requesterName;
        private String department;
        private String hiringManagerName;
        private String priority;
        private Integer headcount;
        private LocalDate targetDate;
        private String note;
        private Long jobId;
    }
}
