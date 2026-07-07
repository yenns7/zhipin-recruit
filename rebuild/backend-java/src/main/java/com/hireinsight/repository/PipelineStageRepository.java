package com.hireinsight.repository;

import com.hireinsight.model.PipelineStage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PipelineStageRepository extends JpaRepository<PipelineStage, Long> {
    List<PipelineStage> findByCandidateIdAndJobIdOrderByTsDesc(Long candidateId, Long jobId);
    List<PipelineStage> findByJobIdOrderByTsDesc(Long jobId);
    Optional<PipelineStage> findTopByCandidateIdAndJobIdOrderByTsDesc(Long candidateId, Long jobId);
}
