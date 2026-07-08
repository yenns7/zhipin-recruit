package com.hireinsight.repository;

import com.hireinsight.model.CandidateTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface CandidateTagRepository extends JpaRepository<CandidateTag, Long> {
    List<CandidateTag> findByCandidateId(Long candidateId);
    @Transactional
    void deleteByCandidateId(Long candidateId);
}
