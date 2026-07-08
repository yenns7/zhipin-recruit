package com.zhiping.rebuild.talentmap;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class TalentMapModels {

    private TalentMapModels() {}

    public record TalentMapSummary(
            Long id,
            String name,
            Long jobId,
            String jobTitle,
            String department,
            Long ownerHrId,
            int companiesCount,
            int peopleCount,
            Instant updatedAt
    ) {}

    public record TalentMapDetail(
            Long id,
            String name,
            Long jobId,
            String jobTitle,
            String department,
            Long ownerHrId,
            String boardJson,
            int companiesCount,
            int peopleCount,
            List<CompanyItem> companies,
            List<PersonItem> people,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record CompanyItem(
            Long id,
            Long mapId,
            String companyName,
            String city,
            String region,
            String industry,
            String priority,
            String note,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record PersonItem(
            Long id,
            Long mapId,
            Long companyId,
            String companyName,
            String name,
            String title,
            String city,
            List<String> tags,
            String salaryRange,
            String contactStatus,
            String evaluation,
            String source,
            LocalDate nextFollowAt,
            String note,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record CreateMapRequest(
            String name,
            Long jobId,
            String department,
            String boardJson
    ) {}

    public record UpdateMapRequest(
            String name,
            Long jobId,
            String department,
            String boardJson
    ) {}

    public record CreateCompanyRequest(
            String companyName,
            String city,
            String region,
            String industry,
            String priority,
            String note
    ) {}

    public record CreatePersonRequest(
            Long companyId,
            String name,
            String title,
            String city,
            List<String> tags,
            String salaryRange,
            String contactStatus,
            String evaluation,
            String source,
            LocalDate nextFollowAt,
            String note
    ) {}

    public record PeopleFilterParams(
            String company,
            String city,
            String status,
            String keyword
    ) {}

    public record UpdateCompanyRequest(
            String companyName,
            String city,
            String region,
            String industry,
            String priority,
            String note
    ) {}

    public record UpdatePersonRequest(
            Long companyId,
            String name,
            String title,
            String city,
            List<String> tags,
            String salaryRange,
            String contactStatus,
            String evaluation,
            String source,
            LocalDate nextFollowAt,
            String note
    ) {}
}
