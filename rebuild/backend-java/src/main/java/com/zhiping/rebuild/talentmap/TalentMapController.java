package com.zhiping.rebuild.talentmap;

import com.hireinsight.common.ApiResponse;
import com.zhiping.rebuild.talentmap.TalentMapModels.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/talent-maps")
public class TalentMapController {

    private final TalentMapService talentMapService;

    public TalentMapController(TalentMapService talentMapService) {
        this.talentMapService = talentMapService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<TalentMapSummary>>> listMaps(Authentication auth) {
        Long userId = (Long) auth.getDetails();
        boolean isAdminOrManager = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_MANAGER"));
        return ResponseEntity.ok(ApiResponse.ok(talentMapService.list(userId, isAdminOrManager)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<TalentMapDetail>> createMap(
            @RequestBody CreateMapRequest req, Authentication auth) {
        Long userId = (Long) auth.getDetails();
        TalentMapDetail detail = talentMapService.create(req, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(detail));
    }

    @GetMapping("/{mapId}")
    public ResponseEntity<ApiResponse<TalentMapDetail>> getMap(
            @PathVariable Long mapId,
            @RequestParam(required = false) String company,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword,
            Authentication auth) {
        Long userId = (Long) auth.getDetails();
        boolean isAdminOrManager = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_MANAGER"));
        PeopleFilterParams filter = (company != null || city != null || status != null || keyword != null)
                ? new PeopleFilterParams(company, city, status, keyword)
                : null;
        return ResponseEntity.ok(ApiResponse.ok(talentMapService.get(mapId, filter, userId, isAdminOrManager)));
    }

    @PostMapping("/{mapId}/companies")
    public ResponseEntity<ApiResponse<CompanyItem>> addCompany(
            @PathVariable Long mapId, @RequestBody CreateCompanyRequest req, Authentication auth) {
        Long userId = (Long) auth.getDetails();
        boolean isAdminOrManager = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_MANAGER"));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(talentMapService.addCompany(mapId, req, userId, isAdminOrManager)));
    }

    @PostMapping("/{mapId}/people")
    public ResponseEntity<ApiResponse<PersonItem>> addPerson(
            @PathVariable Long mapId, @RequestBody CreatePersonRequest req, Authentication auth) {
        Long userId = (Long) auth.getDetails();
        boolean isAdminOrManager = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_MANAGER"));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(talentMapService.addPerson(mapId, req, userId, isAdminOrManager)));
    }
}
