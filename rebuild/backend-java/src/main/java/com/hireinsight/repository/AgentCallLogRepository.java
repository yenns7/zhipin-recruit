package com.hireinsight.repository;

import com.hireinsight.model.AgentCallLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AgentCallLogRepository extends JpaRepository<AgentCallLog, Long> {
    List<AgentCallLog> findByConversationId(Long conversationId);
    List<AgentCallLog> findByUserId(Long userId);
    List<AgentCallLog> findByAction(String action);
    Page<AgentCallLog> findByAction(String action, Pageable pageable);
}
