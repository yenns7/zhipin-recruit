package com.hireinsight.repository;

import com.hireinsight.model.TalentMap;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TalentMapRepository extends JpaRepository<TalentMap, Long> {
    List<TalentMap> findByOwnerHrId(Long ownerHrId);
}
