package com.hireinsight.repository;

import com.hireinsight.model.RecruitmentDemand;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DemandRepository extends JpaRepository<RecruitmentDemand, Long> {

    List<RecruitmentDemand> findByOwnerHrId(Long ownerHrId);

    List<RecruitmentDemand> findByStatus(String status);

    List<RecruitmentDemand> findByJobId(Long jobId);
}
