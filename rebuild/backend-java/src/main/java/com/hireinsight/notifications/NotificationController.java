package com.hireinsight.notifications;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.Notification;
import com.hireinsight.repository.NotificationRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationRepository notificationRepository;

    public NotificationController(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        Long userId = (Long) authentication.getDetails();
        Page<Notification> notifPage = notificationRepository
                .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page, size));
        long unreadCount = notificationRepository.countByUserIdAndIsReadFalse(userId);

        List<Map<String, Object>> items = notifPage.getContent().stream()
                .map(this::toResponse)
                .toList();
        Map<String, Object> result = Map.of(
                "notifications", items,
                "total", notifPage.getTotalElements(),
                "page", notifPage.getNumber(),
                "per_page", notifPage.getSize(),
                "pages", notifPage.getTotalPages(),
                "unread_count", unreadCount
        );
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<Map<String, Object>>> unreadCount(Authentication authentication) {
        Long userId = (Long) authentication.getDetails();
        long count = notificationRepository.countByUserIdAndIsReadFalse(userId);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("count", count)));
    }

    @PutMapping("/{id}/read")
    public ResponseEntity<ApiResponse<Map<String, Object>>> markRead(
            @PathVariable Long id, Authentication authentication) {
        Long userId = (Long) authentication.getDetails();
        Notification notification = notificationRepository.findById(id)
                .orElse(null);
        if (notification == null) {
            return ResponseEntity.ok(ApiResponse.error(404, "Notification not found"));
        }
        if (!notification.getUserId().equals(userId)) {
            return ResponseEntity.ok(ApiResponse.error(403, "Access denied"));
        }
        notification.setIsRead(true);
        notificationRepository.save(notification);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("id", id, "is_read", true)));
    }

    @PutMapping("/read-all")
    public ResponseEntity<ApiResponse<Map<String, Object>>> markAllRead(Authentication authentication) {
        Long userId = (Long) authentication.getDetails();
        List<Notification> unread = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .filter(n -> !n.getIsRead())
                .toList();
        unread.forEach(n -> n.setIsRead(true));
        notificationRepository.saveAll(unread);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("status", "all marked read")));
    }

    private Map<String, Object> toResponse(Notification n) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", n.getId());
        m.put("type", n.getType());
        m.put("title", n.getTitle());
        m.put("body", n.getMessage());
        m.put("link", null);
        m.put("is_read", n.getIsRead());
        m.put("created_at", n.getCreatedAt() != null ? n.getCreatedAt().toString() : null);
        return m;
    }
}
