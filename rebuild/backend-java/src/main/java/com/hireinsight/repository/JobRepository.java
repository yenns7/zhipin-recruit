package com.hireinsight.repository;

import com.hireinsight.model.Job;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface JobRepository extends JpaRepository<Job, Long> {
    List<Job> findByOwnerHrId(Long ownerHrId);
    List<Job> findByStatus(String status);
}
