package com.hireinsight.repository;

import com.hireinsight.model.TalentMapCompany;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TalentMapCompanyRepository extends JpaRepository<TalentMapCompany, Long> {
    List<TalentMapCompany> findByMapId(Long mapId);
    long countByMapId(Long mapId);
}
