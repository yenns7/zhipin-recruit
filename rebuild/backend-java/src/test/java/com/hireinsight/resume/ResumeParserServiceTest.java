package com.hireinsight.resume;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.llm.LlmClient;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.CandidateTagRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Tests for ResumeParserService, focused on the computeSkillScore logic
 * exercised through the package-private scoreSkills method.
 */
@ExtendWith(MockitoExtension.class)
class ResumeParserServiceTest {

    private ResumeParserService service;

    @Mock
    private LlmClient llmClient;
    @Mock
    private CandidateRepository candidateRepository;
    @Mock
    private CandidateTagRepository candidateTagRepository;
    @Mock
    private TechTaxonomy techTaxonomy;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = new ResumeParserService(
                llmClient, candidateRepository, candidateTagRepository,
                objectMapper, techTaxonomy);
    }

    @Test
    void scoreSkill_returns1_whenSingleMentionNoYears() {
        when(techTaxonomy.getAllTags()).thenReturn(Set.of("Java", "Python"));

        // "Java" mentioned once, no years of experience
        String resumeText = "I know Java and have experience with various frameworks.";
        String json = "{\"skills\":[\"Java\"]}";

        Map<String, Integer> scores = service.scoreSkills(resumeText, json);

        assertThat(scores).containsEntry("Java", 1);
    }

    @Test
    void scoreSkill_returns3_whenMultipleMentionsNoYears() {
        when(techTaxonomy.getAllTags()).thenReturn(Set.of("Java", "Python"));

        // "Java" mentioned 3 times, no years
        String resumeText = """
                Experienced in Java development.
                Worked on Java microservices.
                Also used Java for backend APIs.
                """;
        String json = "{\"skills\":[\"Java\"]}";

        Map<String, Integer> scores = service.scoreSkills(resumeText, json);

        assertThat(scores).containsEntry("Java", 3);
    }

    @Test
    void scoreSkill_returns3_whenSingleMentionWithYears() {
        when(techTaxonomy.getAllTags()).thenReturn(Set.of("Java", "Python"));

        // "Java" mentioned once but with years of experience
        String resumeText = "5年 Java 开发经验";
        String json = "{\"skills\":[\"Java\"]}";

        Map<String, Integer> scores = service.scoreSkills(resumeText, json);

        assertThat(scores).containsEntry("Java", 3);
    }

    @Test
    void scoreSkill_returns4_whenManyMentionsNoYears() {
        when(techTaxonomy.getAllTags()).thenReturn(Set.of("Java", "Python"));

        // "Java" mentioned 4 times (count > 3), no years
        String resumeText = """
                Java expert with deep knowledge.
                Built many Java applications.
                Java is my primary language.
                Also contributed to Java open-source projects.
                """;
        String json = "{\"skills\":[\"Java\"]}";

        Map<String, Integer> scores = service.scoreSkills(resumeText, json);

        assertThat(scores).containsEntry("Java", 4);
    }

    @Test
    void scoreSkill_returns4_whenMultipleMentionsWithYears() {
        when(techTaxonomy.getAllTags()).thenReturn(Set.of("Java", "Python"));

        // "Java" mentioned 2 times with years
        String resumeText = "5年 Java 开发经验\nDeep knowledge of Java ecosystem.";
        String json = "{\"skills\":[\"Java\"]}";

        Map<String, Integer> scores = service.scoreSkills(resumeText, json);

        assertThat(scores).containsEntry("Java", 4);
    }

    @Test
    void scoreSkill_returns5_whenManyMentionsWithYears() {
        when(techTaxonomy.getAllTags()).thenReturn(Set.of("Java", "Python"));

        // "Java" mentioned 6+ times with years
        String resumeText = """
                5年 Java 开发经验。
                Java 是我最熟悉的语言。
                使用 Java 完成了多个项目。
                Java 微服务架构设计。
                Java 性能调优经验丰富。
                Java 多线程编程。
                Also mentored Java developers.
                """;
        String json = "{\"skills\":[\"Java\"]}";

        Map<String, Integer> scores = service.scoreSkills(resumeText, json);

        assertThat(scores).containsEntry("Java", 5);
    }

    @Test
    void scoreSkill_fallsBackToTextMatchingWhenJsonInvalid() {
        when(techTaxonomy.getAllTags()).thenReturn(Set.of("Java", "Python"));

        // Invalid JSON triggers fallback: score from text-only matching
        String resumeText = "Experienced in Java development.";
        String badJson = "not-json";

        Map<String, Integer> scores = service.scoreSkills(resumeText, badJson);

        assertThat(scores).isNotEmpty();
        assertThat(scores).containsKey("Java");
    }
}
