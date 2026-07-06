package com.hireinsight.candidate;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.Candidate;
import com.hireinsight.repository.CandidateRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/candidates")
public class CandidateController {

    private final CandidateRepository candidateRepository;

    public CandidateController(CandidateRepository candidateRepository) {
        this.candidateRepository = candidateRepository;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<Candidate>>> listCandidates(Authentication auth) {
        Long userId = (Long) auth.getDetails();
        // recruiters see their own, managers/admins see all
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_MANAGER"));
        List<Candidate> candidates = isAdmin
                ? candidateRepository.findAll()
                : candidateRepository.findByOwnerHrId(userId);
        return ResponseEntity.ok(ApiResponse.ok(candidates));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Candidate>> getCandidate(@PathVariable Long id) {
        Candidate c = candidateRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Candidate not found: " + id));
        return ResponseEntity.ok(ApiResponse.ok(c));
    }
}
