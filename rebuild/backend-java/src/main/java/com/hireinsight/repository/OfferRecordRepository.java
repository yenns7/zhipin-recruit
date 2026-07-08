package com.hireinsight.repository;

import com.hireinsight.model.OfferRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OfferRecordRepository extends JpaRepository<OfferRecord, Long> {
    List<OfferRecord> findByCandidateId(Long candidateId);
    List<OfferRecord> findByJobId(Long jobId);
    Optional<OfferRecord> findByCandidateIdAndJobId(Long candidateId, Long jobId);
}
