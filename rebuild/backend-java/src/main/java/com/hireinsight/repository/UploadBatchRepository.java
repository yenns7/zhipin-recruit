package com.hireinsight.repository;

import com.hireinsight.model.UploadBatch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface UploadBatchRepository extends JpaRepository<UploadBatch, Long> {
    List<UploadBatch> findByOwnerHrId(Long ownerHrId);

    List<UploadBatch> findByCreatedAtAfter(Instant after);
}
