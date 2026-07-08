package com.hireinsight.resume;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests for TechTaxonomy, verifying loading of 254 tags from classpath resource.
 */
class TechTaxonomyTest {

    private TechTaxonomy techTaxonomy;

    @BeforeEach
    void setUp() {
        techTaxonomy = new TechTaxonomy(new ObjectMapper());
        techTaxonomy.init();
    }

    @Test
    void loadsAllTags() {
        assertThat(techTaxonomy.getAllTags()).isNotEmpty();
        // The tech_taxonomy.json should have 254 unique tags
        assertThat(techTaxonomy.getAllTags()).hasSize(254);
    }

    @Test
    void loadsCategories() {
        assertThat(techTaxonomy.getCategories()).isNotEmpty();
        // 15 categories: 算法, 后端, 前端, 数据, 产品, 运营, 设计, 测试,
        // 硬件, 供应链, 职能, 销售, 市场, 客服, 培训
        assertThat(techTaxonomy.getCategories()).hasSize(15);
    }

    @Test
    void containsExpectedTags() {
        // Verify some tags present in the taxonomy (role names and keywords)
        assertThat(techTaxonomy.getAllTags())
                .contains("Java", "Python", "Go", "数据分析", "React", "Vue.js");
    }

    @Test
    void containsChineseTags() {
        assertThat(techTaxonomy.getAllTags())
                .contains("产品经理", "UI设计师", "Java后端开发工程师", "运维工程师");
    }

    @Test
    void getTagsForCategory_returnsTags() {
        // "后端" category should contain backend-related tags
        assertThat(techTaxonomy.getTagsForCategory("后端"))
                .isNotEmpty()
                .contains("Java", "Go", "Python", "微服务");
    }

    @Test
    void getTagsForCategory_returnsEmptyList_whenUnknown() {
        assertThat(techTaxonomy.getTagsForCategory("nonexistent")).isEmpty();
    }

    @Test
    void categories_containsAllExpected() {
        assertThat(techTaxonomy.getCategories())
                .contains("算法", "后端", "前端", "数据", "产品", "运营", "设计", "测试",
                          "硬件", "供应链", "职能", "销售", "市场", "客服", "培训");
    }
}
