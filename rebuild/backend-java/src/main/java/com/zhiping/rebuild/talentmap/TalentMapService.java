package com.zhiping.rebuild.talentmap;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.model.Job;
import com.hireinsight.model.TalentMap;
import com.hireinsight.model.TalentMapCompany;
import com.hireinsight.model.TalentMapPerson;
import com.hireinsight.repository.JobRepository;
import com.hireinsight.repository.TalentMapCompanyRepository;
import com.hireinsight.repository.TalentMapPersonRepository;
import com.hireinsight.repository.TalentMapRepository;
import com.zhiping.rebuild.talentmap.TalentMapModels.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class TalentMapService {

    private static final Logger log = LoggerFactory.getLogger(TalentMapService.class);

    private final TalentMapRepository talentMapRepository;
    private final TalentMapCompanyRepository companyRepository;
    private final TalentMapPersonRepository personRepository;
    private final JobRepository jobRepository;
    private final ObjectMapper objectMapper;

    public TalentMapService(TalentMapRepository talentMapRepository,
                            TalentMapCompanyRepository companyRepository,
                            TalentMapPersonRepository personRepository,
                            JobRepository jobRepository,
                            ObjectMapper objectMapper) {
        this.talentMapRepository = talentMapRepository;
        this.companyRepository = companyRepository;
        this.personRepository = personRepository;
        this.jobRepository = jobRepository;
        this.objectMapper = objectMapper;
    }

    public List<TalentMapSummary> list(Long userId, boolean isAdminOrManager) {
        List<TalentMap> maps;
        if (isAdminOrManager) {
            maps = talentMapRepository.findAll();
        } else {
            maps = talentMapRepository.findByOwnerHrId(userId);
        }
        return maps.stream()
                .sorted(Comparator.comparing(TalentMap::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(TalentMap::getId, Comparator.reverseOrder()))
                .map(this::toSummary)
                .toList();
    }

    @Transactional
    public TalentMapDetail create(CreateMapRequest req, Long userId) {
        TalentMap map = TalentMap.builder()
                .name(req.name())
                .ownerHrId(userId)
                .jobId(req.jobId())
                .department(req.department() != null ? req.department() : "")
                .boardJson(req.boardJson())
                .build();
        map = talentMapRepository.save(map);
        return toDetail(map, List.of(), List.of());
    }

    public TalentMapDetail get(Long mapId, PeopleFilterParams filter, Long userId, boolean isAdminOrManager) {
        TalentMap map = talentMapRepository.findById(mapId)
                .orElseThrow(() -> new IllegalArgumentException("人才地图不存在: " + mapId));
        if (!isAdminOrManager && !map.getOwnerHrId().equals(userId)) {
            throw new IllegalArgumentException("无权访问此人才地图");
        }
        List<TalentMapCompany> companies = companyRepository.findByMapId(mapId);
        List<TalentMapPerson> people;
        if (filter != null && (hasValue(filter.company()) || hasValue(filter.city())
                || hasValue(filter.status()) || hasValue(filter.keyword()))) {
            people = personRepository.findFiltered(
                    mapId,
                    emptyToNull(filter.company()),
                    emptyToNull(filter.city()),
                    emptyToNull(filter.status()),
                    emptyToNull(filter.keyword()));
        } else {
            people = personRepository.findByMapId(mapId);
            people.sort(Comparator.comparing(TalentMapPerson::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(TalentMapPerson::getId, Comparator.reverseOrder()));
        }
        return toDetail(map, companies, people);
    }

    @Transactional
    public TalentMapDetail update(Long mapId, UpdateMapRequest req, Long userId, boolean isAdminOrManager) {
        TalentMap map = talentMapRepository.findById(mapId)
                .orElseThrow(() -> new IllegalArgumentException("人才地图不存在: " + mapId));
        if (!isAdminOrManager && !map.getOwnerHrId().equals(userId)) {
            throw new IllegalArgumentException("无权修改此人才地图");
        }
        if (req.name() != null) map.setName(req.name());
        if (req.jobId() != null) map.setJobId(req.jobId());
        if (req.department() != null) map.setDepartment(req.department());
        if (req.boardJson() != null) map.setBoardJson(req.boardJson());
        map = talentMapRepository.save(map);
        List<TalentMapCompany> companies = companyRepository.findByMapId(mapId);
        List<TalentMapPerson> people = personRepository.findByMapId(mapId);
        return toDetail(map, companies, people);
    }

    @Transactional
    public CompanyItem addCompany(Long mapId, CreateCompanyRequest req, Long userId, boolean isAdminOrManager) {
        TalentMap map = talentMapRepository.findById(mapId)
                .orElseThrow(() -> new IllegalArgumentException("人才地图不存在: " + mapId));
        if (!isAdminOrManager && !map.getOwnerHrId().equals(userId)) {
            throw new IllegalArgumentException("无权修改此人才地图");
        }
        TalentMapCompany company = TalentMapCompany.builder()
                .mapId(mapId)
                .companyName(req.companyName())
                .city(req.city() != null ? req.city() : "")
                .region(req.region() != null ? req.region() : "")
                .industry(req.industry() != null ? req.industry() : "")
                .priority(req.priority() != null ? req.priority() : "medium")
                .note(req.note())
                .build();
        company = companyRepository.save(company);
        return toCompanyItem(company);
    }

    @Transactional
    public PersonItem addPerson(Long mapId, CreatePersonRequest req, Long userId, boolean isAdminOrManager) {
        TalentMap map = talentMapRepository.findById(mapId)
                .orElseThrow(() -> new IllegalArgumentException("人才地图不存在: " + mapId));
        if (!isAdminOrManager && !map.getOwnerHrId().equals(userId)) {
            throw new IllegalArgumentException("无权修改此人才地图");
        }
        TalentMapPerson person = TalentMapPerson.builder()
                .mapId(mapId)
                .companyId(req.companyId())
                .name(Optional.ofNullable(req.name()).orElse(""))
                .title(req.title() != null ? req.title() : "")
                .city(req.city() != null ? req.city() : "")
                .tags(toTagsJson(req.tags()))
                .salaryRange(req.salaryRange() != null ? req.salaryRange() : "")
                .contactStatus(req.contactStatus() != null ? req.contactStatus() : "未接触")
                .evaluation(req.evaluation() != null ? req.evaluation() : "")
                .source(req.source() != null ? req.source() : "")
                .nextFollowAt(req.nextFollowAt())
                .note(req.note())
                .build();
        person = personRepository.save(person);
        String companyName = resolveCompanyName(person.getCompanyId());
        return toPersonItem(person, companyName);
    }

    private TalentMapSummary toSummary(TalentMap map) {
        return new TalentMapSummary(
                map.getId(),
                map.getName(),
                map.getJobId(),
                resolveJobTitle(map.getJobId()),
                map.getDepartment(),
                map.getOwnerHrId(),
                (int) companyRepository.countByMapId(map.getId()),
                (int) personRepository.countByMapId(map.getId()),
                map.getUpdatedAt());
    }

    private TalentMapDetail toDetail(TalentMap map, List<TalentMapCompany> companies, List<TalentMapPerson> people) {
        String jobTitle = resolveJobTitle(map.getJobId());
        Map<Long, String> companyNames = new HashMap<>();
        for (TalentMapCompany c : companies) {
            companyNames.put(c.getId(), c.getCompanyName());
        }
        return new TalentMapDetail(
                map.getId(), map.getName(), map.getJobId(), jobTitle,
                map.getDepartment(), map.getOwnerHrId(), map.getBoardJson(),
                companies.size(), people.size(),
                companies.stream().map(this::toCompanyItem).toList(),
                people.stream().map(p -> toPersonItem(p, companyNames.getOrDefault(p.getCompanyId(), ""))).toList(),
                map.getCreatedAt(), map.getUpdatedAt());
    }

    private CompanyItem toCompanyItem(TalentMapCompany c) {
        return new CompanyItem(c.getId(), c.getMapId(), c.getCompanyName(), c.getCity(),
                c.getRegion(), c.getIndustry(), c.getPriority(), c.getNote(),
                c.getCreatedAt(), c.getUpdatedAt());
    }

    private PersonItem toPersonItem(TalentMapPerson p, String companyName) {
        return new PersonItem(p.getId(), p.getMapId(), p.getCompanyId(), companyName,
                p.getName(), p.getTitle(), p.getCity(), parseTags(p.getTags()),
                p.getSalaryRange(), p.getContactStatus(), p.getEvaluation(), p.getSource(),
                p.getNextFollowAt(), p.getNote(), p.getCreatedAt(), p.getUpdatedAt());
    }

    private String resolveJobTitle(Long jobId) {
        if (jobId == null) return "";
        return jobRepository.findById(jobId)
                .map(Job::getTitle).orElse("");
    }

    private String resolveCompanyName(Long companyId) {
        if (companyId == null) return "";
        return companyRepository.findById(companyId)
                .map(TalentMapCompany::getCompanyName).orElse("");
    }

    private String toTagsJson(List<String> tags) {
        if (tags == null || tags.isEmpty()) return "[]";
        try { return objectMapper.writeValueAsString(tags); }
        catch (JsonProcessingException e) { log.warn("tags serialization failed", e); return "[]"; }
    }

    private List<String> parseTags(String tagsJson) {
        if (tagsJson == null || tagsJson.isBlank()) return List.of();
        try { return objectMapper.readValue(tagsJson, new TypeReference<List<String>>() {}); }
        catch (JsonProcessingException e) { return List.of(); }
    }

    private boolean hasValue(String s) { return s != null && !s.isBlank(); }
    private String emptyToNull(String s) { return (s == null || s.isBlank()) ? null : s; }
}
