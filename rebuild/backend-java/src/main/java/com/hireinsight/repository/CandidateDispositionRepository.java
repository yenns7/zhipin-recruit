package com.hireinsight.repository;

import com.hireinsight.model.CandidateDisposition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CandidateDispositionRepository extends JpaRepository<CandidateDisposition, Long> {
    List<CandidateDisposition> findByCandidateIdOrderByCreatedAtDesc(Long candidateId);
}
