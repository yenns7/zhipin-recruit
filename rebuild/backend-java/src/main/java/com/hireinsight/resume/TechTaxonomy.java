package com.hireinsight.resume;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.*;

/**
 * Loads and provides access to the tech taxonomy (skill tags and categories).
 * Reference: base_agent/tech_taxonomy.json
 */
@Component
public class TechTaxonomy {

    private static final Logger log = LoggerFactory.getLogger(TechTaxonomy.class);

    private final ObjectMapper objectMapper;

    private Set<String> allTags = Collections.emptySet();
    private Map<String, List<String>> categoryTags = Collections.emptyMap();
    private List<String> categories = Collections.emptyList();

    public TechTaxonomy(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        try {
            InputStream is = getClass().getResourceAsStream("/tech_taxonomy.json");
            if (is == null) {
                // Fallback: try classpath root
                is = new ClassPathResource("tech_taxonomy.json").getInputStream();
            }
            JsonNode root = objectMapper.readTree(is);
            loadFromJson(root);
            log.info("Loaded tech taxonomy: {} categories, {} total tags", categories.size(), allTags.size());
        } catch (Exception e) {
            log.warn("Failed to load tech_taxonomy.json from classpath, using built-in defaults: {}", e.getMessage());
            loadDefaults();
        }
    }

    private void loadFromJson(JsonNode root) {
        Set<String> tags = new LinkedHashSet<>();
        Map<String, List<String>> catTags = new LinkedHashMap<>();
        List<String> cats = new ArrayList<>();

        JsonNode level1 = root.get("level1_categories");
        if (level1 != null && level1.isArray()) {
            for (JsonNode cat : level1) {
                String catName = cat.path("name").asText("");
                if (catName.isEmpty()) continue;
                cats.add(catName);

                List<String> roleTags = new ArrayList<>();
                JsonNode level2 = cat.get("level2_roles");
                if (level2 != null && level2.isArray()) {
                    for (JsonNode role : level2) {
                        String roleName = role.path("name").asText("");
                        if (!roleName.isEmpty()) {
                            tags.add(roleName);
                            roleTags.add(roleName);
                        }
                        JsonNode keywords = role.get("keywords");
                        if (keywords != null && keywords.isArray()) {
                            for (JsonNode kw : keywords) {
                                String kwStr = kw.asText("");
                                if (!kwStr.isEmpty()) {
                                    tags.add(kwStr);
                                    roleTags.add(kwStr);
                                }
                            }
                        }
                    }
                }
                catTags.put(catName, roleTags);
            }
        }

        this.allTags = tags;
        this.categoryTags = catTags;
        this.categories = cats;
    }

    private void loadDefaults() {
        // Built-in common tags when taxonomy file is not available
        Set<String> tags = new LinkedHashSet<>(Arrays.asList(
                "Java", "Python", "JavaScript", "TypeScript", "C++", "Go", "Rust", "SQL",
                "Spring Boot", "Spring Cloud", "MyBatis", "Hibernate", "Django", "Flask",
                "React", "Vue.js", "Angular", "Node.js",
                "Docker", "Kubernetes", "AWS", "GCP", "Azure",
                "Redis", "MySQL", "PostgreSQL", "MongoDB", "Elasticsearch",
                "Kafka", "RabbitMQ", "Nginx",
                "机器学习", "深度学习", "NLP", "计算机视觉", "推荐系统",
                "PyTorch", "TensorFlow",
                "Git", "CI/CD", "Linux",
                "微服务", "分布式系统", "系统设计"
        ));
        this.allTags = tags;
        this.categories = List.of("编程语言", "框架工具", "数据库", "云原生", "AI/ML", "其他");
        this.categoryTags = Map.of(
                "编程语言", List.of("Java", "Python", "JavaScript", "TypeScript", "C++", "Go", "Rust", "SQL"),
                "框架工具", List.of("Spring Boot", "Spring Cloud", "MyBatis", "React", "Vue.js", "Angular"),
                "AI/ML", List.of("机器学习", "深度学习", "NLP", "计算机视觉", "PyTorch", "TensorFlow"),
                "其他", List.of()
        );
    }

    public Set<String> getAllTags() {
        return allTags;
    }

    public List<String> getCategories() {
        return categories;
    }

    public List<String> getTagsForCategory(String category) {
        return categoryTags.getOrDefault(category, List.of());
    }
}
