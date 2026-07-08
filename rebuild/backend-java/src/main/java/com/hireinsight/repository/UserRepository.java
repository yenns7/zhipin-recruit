package com.hireinsight.repository;

import com.hireinsight.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
    List<User> findByRole(String role);
    List<User> findByRoleIn(List<String> roles);
    List<User> findByRoleAndNameContainingIgnoreCase(String role, String name);
}
