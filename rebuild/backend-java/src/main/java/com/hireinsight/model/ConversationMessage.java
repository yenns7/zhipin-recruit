package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

@Entity
@Table(name = "conversation_messages")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class ConversationMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "conversation_id", nullable = false)
    private Long conversationId;

    @Column(length = 20, nullable = false)
    private String role;

    @Lob
    @Column(columnDefinition = "text")
    private String content;

    @Column(name = "tool_name", length = 100)
    private String toolName;

    @Lob
    @Column(name = "tool_args", columnDefinition = "text")
    private String toolArgs;

    @Lob
    @Column(name = "tool_result", columnDefinition = "text")
    private String toolResult;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
