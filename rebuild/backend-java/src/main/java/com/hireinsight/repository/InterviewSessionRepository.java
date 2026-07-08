package com.hireinsight.repository;

import com.hireinsight.model.InterviewSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InterviewSessionRepository extends JpaRepository<InterviewSession, Long> {
    List<InterviewSession> findByJobId(Long jobId);
    List<InterviewSession> findByCandidateId(Long candidateId);
    List<InterviewSession> findByInterviewerId(Long interviewerId);
    List<InterviewSession> findByStatus(String status);
}
