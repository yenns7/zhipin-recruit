package com.hireinsight.repository;

import com.hireinsight.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface EventRepository extends JpaRepository<Event, Long> {
    List<Event> findByActorIdAndTsAfter(Long actorId, Instant ts);
    List<Event> findByActionAndTsAfter(String action, Instant ts);
    List<Event> findByEntityIdAndEntityType(Long entityId, String entityType);
    List<Event> findByEntityTypeAndEntityId(String entityType, Long entityId);
    List<Event> findTop10ByActorIdOrderByTsDesc(Long actorId);
}
