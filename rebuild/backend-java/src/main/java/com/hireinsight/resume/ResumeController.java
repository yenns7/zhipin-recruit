package com.hireinsight.resume;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.config.AppConfig;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.UploadBatch;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.CandidateTagRepository;
import com.hireinsight.repository.UploadBatchRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

@RestController
@RequestMapping("/api/v1/resumes")
public class ResumeController {

    private final AppConfig appConfig;
    private final CandidateRepository candidateRepository;
    private final UploadBatchRepository uploadBatchRepository;
    private final CandidateTagRepository candidateTagRepository;
    private final ResumeParserService resumeParserService;

    public ResumeController(AppConfig appConfig,
                            CandidateRepository candidateRepository,
                            UploadBatchRepository uploadBatchRepository,
                            CandidateTagRepository candidateTagRepository,
                            ResumeParserService resumeParserService) {
        this.appConfig = appConfig;
        this.candidateRepository = candidateRepository;
        this.uploadBatchRepository = uploadBatchRepository;
        this.candidateTagRepository = candidateTagRepository;
        this.resumeParserService = resumeParserService;
    }

    @PostMapping("/upload")
    public ResponseEntity<ApiResponse<Map<String, Object>>> upload(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam(value = "source", defaultValue = "manual") String source,
            @RequestParam(value = "channel", required = false) String channel,
            @RequestParam(value = "notes", required = false) String notes,
            Authentication auth) throws IOException {
        Long userId = (Long) auth.getDetails();
        Path uploadDir = Path.of(appConfig.getUpload().getFolder());
        Files.createDirectories(uploadDir);

        // Create upload batch record
        UploadBatch batch = UploadBatch.builder()
                .ownerHrId(userId)
                .source(source)
                .channel(channel)
                .notes(notes)
                .fileCount(files.size())
                .build();
        batch = uploadBatchRepository.save(batch);

        Long batchId = batch.getId();
        List<Map<String, Object>> results = new ArrayList<>();
        for (MultipartFile file : files) {
            String filename = UUID.randomUUID() + "_" + file.getOriginalFilename();
            Path target = uploadDir.resolve(filename);
            file.transferTo(target.toFile());

            // Save candidate record with parse_status = "pending"
            Candidate candidate = Candidate.builder()
                    .ownerHrId(userId)
                    .rawFilePath(target.toString())
                    .nameMasked(file.getOriginalFilename())
                    .resumeJson("{}")
                    .parseStatus("pending")
                    .batchId(batchId)
                    .build();
            candidate = candidateRepository.save(candidate);

            // Trigger async parsing
            Long candidateId = candidate.getId();
            resumeParserService.parseResumeAsync(candidateId);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("file", file.getOriginalFilename());
            result.put("candidateId", candidateId);
            result.put("parseStatus", candidate.getParseStatus());
            results.add(result);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("queued", results.size());
        data.put("batchId", batchId);
        data.put("results", results);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.ok(data));
    }

    /**
     * Retry parsing a specific candidate's resume.
     */
    @PostMapping("/{candidateId}/retry-parse")
    public ResponseEntity<ApiResponse<Map<String, Object>>> retryParse(
            @PathVariable Long candidateId,
            Authentication auth) {
        Long userId = (Long) auth.getDetails();
        Candidate candidate = candidateRepository.findById(candidateId)
                .orElseThrow(() -> new IllegalArgumentException("Candidate not found: " + candidateId));

        // Verify ownership or admin
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_MANAGER"));
        if (!isAdmin && !candidate.getOwnerHrId().equals(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.error(403, "Cannot retry parse on another user's candidate"));
        }

        resumeParserService.parseResumeAsync(candidateId);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("candidateId", candidateId);
        data.put("parseStatus", "processing");
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /**
     * Get parse status for a candidate.
     */
    @GetMapping("/{candidateId}/parse-status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getParseStatus(
            @PathVariable Long candidateId) {
        Candidate candidate = candidateRepository.findById(candidateId)
                .orElseThrow(() -> new IllegalArgumentException("Candidate not found: " + candidateId));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("candidateId", candidateId);
        data.put("parseStatus", candidate.getParseStatus());
        data.put("parseError", candidate.getParseError());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /**
     * Search candidates by skill tag.
     */
    @GetMapping("/search")
    public ResponseEntity<ApiResponse<List<Candidate>>> searchBySkill(
            @RequestParam("skill") String skill,
            Authentication auth) {
        Long userId = (Long) auth.getDetails();
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_MANAGER"));

        List<Candidate> candidates = candidateRepository.findBySkillTag(skill);

        // Filter by owner if not admin
        if (!isAdmin) {
            candidates = candidates.stream()
                    .filter(c -> c.getOwnerHrId().equals(userId))
                    .toList();
        }

        return ResponseEntity.ok(ApiResponse.ok(candidates));
    }
}
