package com.hireinsight.repository;

import com.hireinsight.model.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ConversationRepository extends JpaRepository<Conversation, Long> {
    List<Conversation> findByUserIdOrderByUpdatedAtDesc(Long userId);
    List<Conversation> findByUserIdAndStatusOrderByUpdatedAtDesc(Long userId, String status);
}
