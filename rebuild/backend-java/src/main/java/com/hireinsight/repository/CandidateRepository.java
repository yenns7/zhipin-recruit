package com.hireinsight.repository;

import com.hireinsight.model.Candidate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface CandidateRepository extends JpaRepository<Candidate, Long> {
    List<Candidate> findByOwnerHrId(Long ownerHrId);
    long countByOwnerHrId(Long hrId);

    @Query("SELECT c FROM Candidate c WHERE c.parseStatus = :status")
    List<Candidate> findByParseStatus(@Param("status") String status);

    List<Candidate> findByCreatedAtAfter(Instant after);

    List<Candidate> findByCreatedAtAfterAndOwnerHrId(Instant after, Long ownerHrId);

    List<Candidate> findByBatchIdIn(List<Long> batchIds);

    long countByResumeJsonIsNullOrResumeJson(String blank);

    @Query("SELECT COUNT(c) FROM Candidate c WHERE c.resumeJson IS NULL OR c.resumeJson = ''")
    long countWithoutResume();

    @Query("SELECT COUNT(c) FROM Candidate c WHERE c.parseStatus = 'success'")
    long countParseSuccess();

    @Query(value = "SELECT c.* FROM candidates c WHERE c.resume_json IS NOT NULL AND c.resume_json != '{}' " +
           "AND EXISTS (SELECT 1 FROM candidate_tag ct WHERE ct.candidate_id = c.id AND ct.tag ILIKE %:skill%)",
           nativeQuery = true)
    List<Candidate> findBySkillTag(@Param("skill") String skill);
}
