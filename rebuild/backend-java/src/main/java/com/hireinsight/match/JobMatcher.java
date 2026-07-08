package com.hireinsight.match;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@Service
public class JobMatcher {

    private static final Logger log = LoggerFactory.getLogger(JobMatcher.class);

    private static final Pattern REQUIRED_SKILLS_PATTERN =
            Pattern.compile("(?i)(?:required|must-have|必备|要求)\\s*:?\\s*([^。\\n]+)");
    private static final Pattern PREFERRED_SKILLS_PATTERN =
            Pattern.compile("(?i)(?:preferred|plus|优先|加分)\\s*:?\\s*([^。\\n]+)");

    private static final double REQUIRED_WEIGHT = 3.0;
    private static final double PREFERRED_WEIGHT = 1.0;

    private final ObjectMapper objectMapper;

    public JobMatcher(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Match a job description (JD text) against a candidate's resume JSON.
     *
     * @param jdText          the raw JD text
     * @param resumeJsonText  the candidate's resume as a JSON string
     * @return MatchResult containing score and skill details
     */
    public MatchResult match(String jdText, String resumeJsonText) {
        List<String> requiredSkills = extractSkillItems(jdText, REQUIRED_SKILLS_PATTERN);
        List<String> preferredSkills = extractSkillItems(jdText, PREFERRED_SKILLS_PATTERN);

        List<String> candidateSkills = extractCandidateSkills(resumeJsonText);
        int yearsOfExperience = extractYearsOfExperience(resumeJsonText);

        Set<String> candidateSkillSet = candidateSkills.stream()
                .map(String::toLowerCase)
                .map(String::trim)
                .collect(Collectors.toSet());

        List<String> matchedRequired = requiredSkills.stream()
                .filter(s -> candidateSkillSet.contains(s.toLowerCase().trim()))
                .toList();
        List<String> matchedPreferred = preferredSkills.stream()
                .filter(s -> candidateSkillSet.contains(s.toLowerCase().trim()))
                .toList();
        List<String> missingRequired = requiredSkills.stream()
                .filter(s -> !candidateSkillSet.contains(s.toLowerCase().trim()))
                .toList();

        double totalWeight = requiredSkills.size() * REQUIRED_WEIGHT + preferredSkills.size() * PREFERRED_WEIGHT;
        double matchedWeight = matchedRequired.size() * REQUIRED_WEIGHT + matchedPreferred.size() * PREFERRED_WEIGHT;
        double score = totalWeight > 0 ? matchedWeight / totalWeight : 0.0;
        // Clamp to [0.0, 1.0]
        score = Math.max(0.0, Math.min(1.0, score));

        String summary = buildSummary(score, matchedRequired.size(), requiredSkills.size(),
                matchedPreferred.size(), preferredSkills.size(), yearsOfExperience);

        return new MatchResult(score, matchedRequired, matchedPreferred, missingRequired,
                yearsOfExperience, summary);
    }

    /**
     * Parse the JD text with the given regex and split the matched group into individual skill tokens.
     */
    private List<String> extractSkillItems(String text, Pattern pattern) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        List<String> allItems = new ArrayList<>();
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            String group = matcher.group(1).trim();
            // Split by common delimiters: commas, semicolons, slashes, 、, and whitespace padding
            String[] tokens = group.split("[,;、/]");
            for (String token : tokens) {
                String trimmed = token.trim();
                if (!trimmed.isBlank()) {
                    allItems.add(trimmed);
                }
            }
        }
        return allItems;
    }

    /**
     * Extract skills array from the resume JSON.
     * Looks for a "skills" key at any level in the JSON tree.
     */
    private List<String> extractCandidateSkills(String resumeJsonText) {
        if (resumeJsonText == null || resumeJsonText.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(resumeJsonText);
            List<String> skills = new ArrayList<>();
            findSkillsNode(root, skills);
            return skills;
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse resume JSON for skills extraction: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Recursively search for a "skills" array node and collect string values.
     */
    private void findSkillsNode(JsonNode node, List<String> skills) {
        if (node == null) return;
        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                if ("skills".equalsIgnoreCase(entry.getKey()) && entry.getValue().isArray()) {
                    for (JsonNode skillNode : entry.getValue()) {
                        if (skillNode.isTextual()) {
                            skills.add(skillNode.asText());
                        }
                    }
                } else {
                    findSkillsNode(entry.getValue(), skills);
                }
            }
        } else if (node.isArray()) {
            for (JsonNode child : node) {
                findSkillsNode(child, skills);
            }
        }
    }

    /**
     * Extract years of experience from the resume JSON.
     * Checks common field names: totalYearsOfExperience, yearsOfExperience, totalYears,
     * or sums up durations from an "experience" array.
     */
    private int extractYearsOfExperience(String resumeJsonText) {
        if (resumeJsonText == null || resumeJsonText.isBlank()) {
            return 0;
        }
        try {
            JsonNode root = objectMapper.readTree(resumeJsonText);
            // Try direct numeric fields first
            for (String field : List.of("totalYearsOfExperience", "yearsOfExperience", "totalYears", "experienceYears")) {
                JsonNode node = root.get(field);
                if (node != null && node.isNumber()) {
                    return node.asInt();
                }
            }
            // Try to sum from an experience array
            JsonNode expArray = root.get("experience");
            if (expArray != null && expArray.isArray()) {
                int totalYears = 0;
                for (JsonNode exp : expArray) {
                    JsonNode yearsNode = exp.get("years");
                    if (yearsNode != null && yearsNode.isNumber()) {
                        totalYears += yearsNode.asInt();
                    }
                    JsonNode durationNode = exp.get("duration");
                    if (durationNode != null && durationNode.isNumber()) {
                        totalYears += durationNode.asInt();
                    }
                }
                if (totalYears > 0) return totalYears;
            }
            // Try "workExperience" array
            JsonNode workExpArray = root.get("workExperience");
            if (workExpArray != null && workExpArray.isArray()) {
                int totalYears = 0;
                for (JsonNode exp : workExpArray) {
                    JsonNode yearsNode = exp.get("years");
                    if (yearsNode != null && yearsNode.isNumber()) {
                        totalYears += yearsNode.asInt();
                    }
                }
                if (totalYears > 0) return totalYears;
            }
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse resume JSON for experience extraction: {}", e.getMessage());
        }
        return 0;
    }

    private String buildSummary(double score, int matchedRequired, int totalRequired,
                                int matchedPreferred, int totalPreferred, int yearsOfExperience) {
        double pct = score * 100;
        return String.format("匹配度 %.0f%%：匹配 %d/%d 项必备技能、%d/%d 项加分技能，经验 %d 年",
                pct, matchedRequired, totalRequired, matchedPreferred, totalPreferred, yearsOfExperience);
    }

    public static class MatchResult {
        public final double score;
        public final List<String> matchedRequiredSkills;
        public final List<String> matchedPreferredSkills;
        public final List<String> missingRequiredSkills;
        public final int yearsOfExperience;
        public final String summary;

        public MatchResult(double score, List<String> matchedRequiredSkills,
                           List<String> matchedPreferredSkills, List<String> missingRequiredSkills,
                           int yearsOfExperience, String summary) {
            this.score = score;
            this.matchedRequiredSkills = Collections.unmodifiableList(matchedRequiredSkills);
            this.matchedPreferredSkills = Collections.unmodifiableList(matchedPreferredSkills);
            this.missingRequiredSkills = Collections.unmodifiableList(missingRequiredSkills);
            this.yearsOfExperience = yearsOfExperience;
            this.summary = summary;
        }
    }
}
