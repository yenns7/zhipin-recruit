package com.hireinsight.repository;

import com.hireinsight.model.Candidate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CandidateRepository extends JpaRepository<Candidate, Long> {
    List<Candidate> findByOwnerHrId(Long ownerHrId);
    long countByOwnerHrId(Long hrId);
}
