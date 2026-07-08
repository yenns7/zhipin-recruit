package com.hireinsight.repository;

import com.hireinsight.model.InterviewAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InterviewAssignmentRepository extends JpaRepository<InterviewAssignment, Long> {
    List<InterviewAssignment> findByInterviewId(Long interviewId);
    List<InterviewAssignment> findByInterviewerId(Long interviewerId);
}
