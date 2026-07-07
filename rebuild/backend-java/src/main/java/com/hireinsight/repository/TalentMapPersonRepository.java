package com.hireinsight.repository;

import com.hireinsight.model.TalentMapPerson;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TalentMapPersonRepository extends JpaRepository<TalentMapPerson, Long> {
    List<TalentMapPerson> findByMapId(Long mapId);
    long countByMapId(Long mapId);

    @Query(value = """
            SELECT p.* FROM talent_map_people p
            LEFT JOIN talent_map_companies c ON p.company_id = c.id AND c.map_id = :mapId
            WHERE p.map_id = :mapId
            AND (:company IS NULL OR c.company_name LIKE '%' || CAST(:company AS text) || '%')
            AND (:city IS NULL OR p.city LIKE '%' || CAST(:city AS text) || '%')
            AND (:status IS NULL OR p.contact_status = CAST(:status AS text))
            AND (:keyword IS NULL OR p.name LIKE '%' || CAST(:keyword AS text) || '%'
                 OR p.title LIKE '%' || CAST(:keyword AS text) || '%'
                 OR p.evaluation LIKE '%' || CAST(:keyword AS text) || '%')
            ORDER BY p.updated_at DESC, p.id DESC
            """, nativeQuery = true)
    List<TalentMapPerson> findFiltered(
            @Param("mapId") Long mapId,
            @Param("company") String company,
            @Param("city") String city,
            @Param("status") String status,
            @Param("keyword") String keyword);
}
