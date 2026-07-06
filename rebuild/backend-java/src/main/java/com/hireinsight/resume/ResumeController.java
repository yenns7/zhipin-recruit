package com.hireinsight.resume;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.config.AppConfig;
import com.hireinsight.model.Candidate;
import com.hireinsight.repository.CandidateRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/resumes")
public class ResumeController {

    private final AppConfig appConfig;
    private final CandidateRepository candidateRepository;

    public ResumeController(AppConfig appConfig, CandidateRepository candidateRepository) {
        this.appConfig = appConfig;
        this.candidateRepository = candidateRepository;
    }

    @PostMapping("/upload")
    public ResponseEntity<ApiResponse<Map<String, Object>>> upload(
            @RequestParam("files") List<MultipartFile> files,
            Authentication auth) throws IOException {
        Long userId = (Long) auth.getDetails();
        Path uploadDir = Path.of(appConfig.getUpload().getFolder());
        Files.createDirectories(uploadDir);

        List<Map<String, Object>> results = new ArrayList<>();
        for (MultipartFile file : files) {
            String filename = UUID.randomUUID() + "_" + file.getOriginalFilename();
            Path target = uploadDir.resolve(filename);
            file.transferTo(target.toFile());

            // Save placeholder candidate record
            Candidate candidate = Candidate.builder()
                    .ownerHrId(userId)
                    .rawFilePath(target.toString())
                    .nameMasked(file.getOriginalFilename())
                    .resumeJson("{}")
                    .build();
            candidate = candidateRepository.save(candidate);
            results.add(Map.of("file", file.getOriginalFilename(), "candidateId", candidate.getId()));
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.ok(Map.of("queued", results.size(), "results", results)));
    }
}
