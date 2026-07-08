package com.hireinsight.resume;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hireinsight.llm.LlmClient;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.CandidateTag;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.CandidateTagRepository;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Service for parsing resumes: extract text from PDF/DOCX,
 * call LLM for structured extraction, and score skills.
 */
@Service
public class ResumeParserService {

    private static final Logger log = LoggerFactory.getLogger(ResumeParserService.class);

    private static final String ROUTE_FAST = "fast";
    private static final String ROUTE_THINK = "think";
    private static final String ROUTE_PRO = "pro";

    private static final Pattern JSON_PATTERN = Pattern.compile("\\{.*}", Pattern.DOTALL);
    private static final Pattern TAG_SCORE_RE = Pattern.compile("([^:：\\s]+?)\\s*[:：]\\s*([1-5])(?=\\s|$)");

    private final LlmClient llmClient;
    private final CandidateRepository candidateRepository;
    private final CandidateTagRepository candidateTagRepository;
    private final ObjectMapper objectMapper;
    private final TechTaxonomy techTaxonomy;

    public ResumeParserService(LlmClient llmClient,
                               CandidateRepository candidateRepository,
                               CandidateTagRepository candidateTagRepository,
                               ObjectMapper objectMapper,
                               TechTaxonomy techTaxonomy) {
        this.llmClient = llmClient;
        this.candidateRepository = candidateRepository;
        this.candidateTagRepository = candidateTagRepository;
        this.objectMapper = objectMapper;
        this.techTaxonomy = techTaxonomy;
    }

    /**
     * Parse a resume: extract text from file, call LLM, score skills.
     * This runs asynchronously.
     */
    @Async("parseExecutor")
    public void parseResumeAsync(Long candidateId) {
        Candidate candidate = candidateRepository.findById(candidateId).orElse(null);
        if (candidate == null) {
            log.warn("Candidate {} not found for async parsing", candidateId);
            return;
        }

        try {
            parseResume(candidate);
        } catch (Exception e) {
            log.error("Failed to parse resume for candidate {}: {}", candidateId, e.getMessage(), e);
            candidate.setParseStatus("failed");
            candidate.setParseError(e.getMessage() != null ? e.getMessage().substring(0, Math.min(e.getMessage().length(), 1999)) : "Unknown error");
            candidateRepository.save(candidate);
        }
    }

    /**
     * Parse a resume synchronously and update the candidate record.
     */
    public void parseResume(Candidate candidate) {
        String filePath = candidate.getRawFilePath();
        if (filePath == null || filePath.isBlank()) {
            throw new IllegalArgumentException("Candidate has no raw file path");
        }

        candidate.setParseStatus("processing");
        candidateRepository.save(candidate);

        // 1. Extract text from file
        String resumeText = extractText(filePath);
        if (resumeText.isBlank()) {
            throw new IllegalArgumentException("Resume content is empty (may be a scanned document)");
        }

        // 2. Call LLM for structured extraction
        String structuredJson = extractStructuredInfo(resumeText);

        // 3. Extract skills and score them
        Map<String, Integer> skillScores = scoreSkills(resumeText, structuredJson);

        // 4. Merge skillScores into the JSON
        String enrichedJson = enrichJsonWithSkillScores(structuredJson, skillScores);

        // 5. Update candidate
        candidate.setResumeJson(enrichedJson);
        candidate.setParseStatus("ok");
        candidate.setParseError(null);
        candidateRepository.save(candidate);

        // 6. Save candidate tags
        saveCandidateTags(candidate.getId(), skillScores);

        log.info("Resume parsed successfully for candidate {}: {} skills scored", candidate.getId(), skillScores.size());
    }

    /**
     * Retry parsing a candidate's resume.
     */
    public void retryParse(Long candidateId) {
        Candidate candidate = candidateRepository.findById(candidateId)
                .orElseThrow(() -> new IllegalArgumentException("Candidate not found: " + candidateId));
        // Clear previous tags
        candidateTagRepository.deleteByCandidateId(candidateId);
        // Re-parse
        parseResume(candidate);
    }

    // ========== Text Extraction ==========

    /**
     * Extract text from PDF, DOCX, or TXT files.
     */
    public String extractText(String filePath) {
        String lower = filePath.toLowerCase();
        if (lower.endsWith(".pdf")) {
            return extractTextFromPdf(filePath);
        } else if (lower.endsWith(".docx")) {
            return extractTextFromDocx(filePath);
        } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
            try {
                return Files.readString(Path.of(filePath)).strip();
            } catch (IOException e) {
                throw new RuntimeException("Failed to read text file: " + filePath, e);
            }
        } else {
            throw new IllegalArgumentException("Unsupported file format: " + filePath
                    + " (supported: PDF, DOCX, TXT)");
        }
    }

    private String extractTextFromPdf(String pdfPath) {
        try (PDDocument document = Loader.loadPDF(new java.io.File(pdfPath))) {
            PDFTextStripper stripper = new PDFTextStripper();
            String text = stripper.getText(document);
            if (text == null || text.isBlank()) {
                throw new RuntimeException("PDF text extraction returned empty content");
            }
            return text.strip();
        } catch (IOException e) {
            throw new RuntimeException("Failed to extract text from PDF: " + pdfPath, e);
        }
    }

    private String extractTextFromDocx(String docxPath) {
        try (var fis = new java.io.FileInputStream(docxPath);
             XWPFDocument document = new XWPFDocument(fis);
             XWPFWordExtractor extractor = new XWPFWordExtractor(document)) {
            String text = extractor.getText();
            if (text == null || text.isBlank()) {
                throw new RuntimeException("DOCX text extraction returned empty content");
            }
            return text.strip();
        } catch (IOException e) {
            throw new RuntimeException("Failed to extract text from DOCX: " + docxPath, e);
        }
    }

    // ========== LLM Structured Extraction ==========

    /**
     * Call LLM to extract structured info from resume text.
     */
    String extractStructuredInfo(String resumeText) {
        String systemPrompt = "你是一位专业的简历解析专家。请从简历文本中提取结构化信息。"
                + "必须严格按照JSON格式输出，不要包含任何其他文字。";

        String userPrompt = "请从以下简历文本中提取信息，并以JSON格式输出：\n\n"
                + resumeText + "\n\n"
                + "输出格式：\n"
                + "{\n"
                + "  \"name\": \"姓名\",\n"
                + "  \"email\": \"邮箱\",\n"
                + "  \"phone\": \"电话\",\n"
                + "  \"summary\": \"个人简介或职业概述\",\n"
                + "  \"intent_city\": \"意向城市或工作城市\",\n"
                + "  \"education\": [\n"
                + "    {\"school\": \"学校\", \"degree\": \"学位\", \"major\": \"专业\", \"year\": \"年份\"}\n"
                + "  ],\n"
                + "  \"experience\": [\n"
                + "    {\"company\": \"公司\", \"position\": \"职位\", \"duration\": \"时间\", \"description\": \"描述\"}\n"
                + "  ],\n"
                + "  \"projects\": [\n"
                + "    {\"name\": \"项目名称\", \"role\": \"角色\", \"duration\": \"时间\", \"description\": \"项目描述或成果\"}\n"
                + "  ],\n"
                + "  \"certifications\": [\n"
                + "    {\"name\": \"证书名称\", \"issuer\": \"颁发机构\", \"date\": \"日期\"}\n"
                + "  ],\n"
                + "  \"languages\": [\n"
                + "    {\"language\": \"语言\", \"level\": \"水平\"}\n"
                + "  ],\n"
                + "  \"skills\": [\"技能1\", \"技能2\"],\n"
                + "  \"additional_info\": \"其他值得 HR 看到的信息、备注或亮点\"\n"
                + "}\n"
                + "如果某项信息不存在，使用空字符串或空数组。";

        String response = llmClient.chat(systemPrompt, userPrompt, ROUTE_FAST);

        // Extract JSON from response (handle cases where LLM wraps in markdown)
        String jsonStr = response;
        Matcher matcher = JSON_PATTERN.matcher(response);
        if (matcher.find()) {
            jsonStr = matcher.group();
        }

        // Normalize and return as string
        try {
            JsonNode node = objectMapper.readTree(jsonStr);
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse LLM response as JSON: {}", e.getMessage());
            return "{\"name\":\"\",\"email\":\"\",\"phone\":\"\",\"summary\":\"\","
                    + "\"education\":[],\"experience\":[],\"projects\":[],"
                    + "\"certifications\":[],\"languages\":[],\"skills\":[],\"additional_info\":\"\"}";
        }
    }

    // ========== Skill Scoring ==========

    /**
     * Score skills based on resume text and extracted info, using tech_taxonomy.
     */
    Map<String, Integer> scoreSkills(String resumeText, String resumeJson) {
        try {
            JsonNode root = objectMapper.readTree(resumeJson);

            // Collect skills from the JSON and from text matching
            Set<String> candidateSkills = new LinkedHashSet<>();

            // From JSON skills array
            JsonNode skillsArray = root.get("skills");
            if (skillsArray != null && skillsArray.isArray()) {
                for (JsonNode skill : skillsArray) {
                    candidateSkills.add(skill.asText().trim());
                }
            }

            // From text matching against taxonomy keywords
            String textLower = resumeText.toLowerCase();
            for (String tag : techTaxonomy.getAllTags()) {
                if (tag.toLowerCase().length() > 2 && textLower.contains(tag.toLowerCase())) {
                    candidateSkills.add(tag);
                }
            }

            // Score each skill 1-5 based on frequency and context in resume text
            Map<String, Integer> scores = new LinkedHashMap<>();
            for (String skill : candidateSkills) {
                int score = computeSkillScore(skill, resumeText);
                scores.put(skill, score);
            }

            return scores;
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse resume JSON for skill scoring: {}", e.getMessage());
            // Fallback: score from text only
            Map<String, Integer> scores = new LinkedHashMap<>();
            for (String tag : techTaxonomy.getAllTags()) {
                if (tag.length() > 2 && resumeText.toLowerCase().contains(tag.toLowerCase())) {
                    scores.put(tag, computeSkillScore(tag, resumeText));
                }
            }
            return scores;
        }
    }

    /**
     * Compute skill score (1-5) based on occurrences and context in resume text.
     */
    private int computeSkillScore(String skill, String resumeText) {
        String lowerText = resumeText.toLowerCase();
        String lowerSkill = skill.toLowerCase();

        // Count occurrences
        int count = 0;
        int idx = 0;
        while ((idx = lowerText.indexOf(lowerSkill, idx)) != -1) {
            count++;
            idx += lowerSkill.length();
        }

        // Look for experience duration indicators near the skill
        boolean hasYears = false;
        String[] lines = resumeText.split("\n");
        for (String line : lines) {
            if (line.toLowerCase().contains(lowerSkill)
                    && (line.contains("年") || line.contains("year") || line.contains("yr"))) {
                hasYears = true;
                break;
            }
        }

        // Score: 1=mentioned, 2=mentioned a few times, 3=multiple mentions,
        // 4=multiple mentions with years of experience, 5=core skill
        if (count > 5 && hasYears) return 5;
        if (count > 3) return 4;
        if (count > 1 && hasYears) return 4;
        if (count > 1) return 3;
        if (hasYears) return 3;
        return 2;
    }

    // ========== JSON Enrichment ==========

    /**
     * Merge skillScores into the resume JSON.
     */
    private String enrichJsonWithSkillScores(String resumeJson, Map<String, Integer> skillScores) {
        try {
            ObjectNode root = (ObjectNode) objectMapper.readTree(resumeJson);
            ObjectNode scoresNode = root.putObject("skillScores");
            for (Map.Entry<String, Integer> entry : skillScores.entrySet()) {
                scoresNode.put(entry.getKey(), entry.getValue());
            }
            // Also add/update skills array from scored keys
            ArrayNode skillsArray = objectMapper.createArrayNode();
            for (String skill : skillScores.keySet()) {
                skillsArray.add(skill);
            }
            root.set("skills", skillsArray);
            return objectMapper.writeValueAsString(root);
        } catch (JsonProcessingException e) {
            log.warn("Failed to enrich resume JSON with skill scores: {}", e.getMessage());
            return resumeJson;
        }
    }

    // ========== Candidate Tag Persistence ==========

    private void saveCandidateTags(Long candidateId, Map<String, Integer> skillScores) {
        for (Map.Entry<String, Integer> entry : skillScores.entrySet()) {
            CandidateTag tag = CandidateTag.builder()
                    .candidateId(candidateId)
                    .tag(entry.getKey())
                    .score(entry.getValue())
                    .build();
            candidateTagRepository.save(tag);
        }
    }
}
