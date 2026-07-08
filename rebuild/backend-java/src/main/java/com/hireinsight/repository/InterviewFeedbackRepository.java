package com.hireinsight.repository;

import com.hireinsight.model.InterviewFeedback;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface InterviewFeedbackRepository extends JpaRepository<InterviewFeedback, Long> {
    List<InterviewFeedback> findByCandidateId(Long candidateId);
    List<InterviewFeedback> findByJobId(Long jobId);
    List<InterviewFeedback> findByInterviewerId(Long interviewerId);

    List<InterviewFeedback> findByCreatedAtAfter(Instant after);
}
