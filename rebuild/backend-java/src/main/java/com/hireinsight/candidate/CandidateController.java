package com.hireinsight.candidate;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.Event;
import com.hireinsight.model.PipelineStage;
import com.hireinsight.model.User;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.EventRepository;
import com.hireinsight.repository.PipelineStageRepository;
import com.hireinsight.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/candidates")
public class CandidateController {

    private final CandidateRepository candidateRepository;
    private final UserRepository userRepository;
    private final PipelineStageRepository pipelineStageRepository;
    private final EventRepository eventRepository;

    public CandidateController(CandidateRepository candidateRepository,
                               UserRepository userRepository,
                               PipelineStageRepository pipelineStageRepository,
                               EventRepository eventRepository) {
        this.candidateRepository = candidateRepository;
        this.userRepository = userRepository;
        this.pipelineStageRepository = pipelineStageRepository;
        this.eventRepository = eventRepository;
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

    @GetMapping("/owner-options")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> ownerOptions() {
        List<User> users = userRepository.findByRoleIn(List.of("recruiter", "manager"));
        List<Map<String, Object>> options = users.stream()
                .map(u -> Map.<String, Object>of("id", u.getId(), "name", u.getName()))
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(options));
    }

    @GetMapping("/{id}/pipelines")
    public ResponseEntity<ApiResponse<List<PipelineStage>>> candidatePipelines(@PathVariable Long id) {
        List<PipelineStage> stages = pipelineStageRepository.findByCandidateId(id);
        return ResponseEntity.ok(ApiResponse.ok(stages));
    }

    @GetMapping("/{id}/journey")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> candidateJourney(@PathVariable Long id) {
        List<PipelineStage> stages = pipelineStageRepository.findByCandidateId(id);
        List<Event> events = eventRepository.findByEntityIdAndEntityType(id, "candidate");

        List<Map<String, Object>> journey = new ArrayList<>();

        for (PipelineStage stage : stages) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("type", "pipeline_stage");
            entry.put("id", stage.getId());
            entry.put("jobId", stage.getJobId());
            entry.put("stage", stage.getStage());
            entry.put("updatedBy", stage.getUpdatedBy());
            entry.put("happenedAt", stage.getTs() == null ? null : stage.getTs().toString());
            journey.add(entry);
        }

        for (Event event : events) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("type", "event");
            entry.put("id", event.getId());
            entry.put("action", event.getAction());
            entry.put("entityType", event.getEntityType());
            entry.put("entityId", event.getEntityId());
            entry.put("actorId", event.getActorId());
            entry.put("payload", event.getPayload());
            entry.put("happenedAt", event.getTs() == null ? null : event.getTs().toString());
            journey.add(entry);
        }

        journey.sort(Comparator.comparing(
                e -> e.get("happenedAt") != null ? (String) e.get("happenedAt") : "",
                Comparator.nullsLast(Comparator.naturalOrder())));

        return ResponseEntity.ok(ApiResponse.ok(journey));
    }

    @PatchMapping("/{id}/owner")
    public ResponseEntity<ApiResponse<Candidate>> reassignOwner(
            @PathVariable Long id,
            @Valid @RequestBody ReassignOwnerRequest req) {
        Candidate candidate = candidateRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Candidate not found: " + id));
        candidate.setOwnerHrId(req.getOwnerHrId());
        candidate = candidateRepository.save(candidate);
        return ResponseEntity.ok(ApiResponse.ok(candidate));
    }

    @Data
    public static class ReassignOwnerRequest {
        @NotNull
        private Long ownerHrId;
    }
}
