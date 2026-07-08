package com.hireinsight.interview;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.llm.LlmClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InterviewAIServiceTest {

    @Mock
    private LlmClient llmClient;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private InterviewAIService aiService;

    @BeforeEach
    void setUp() {
        aiService = new InterviewAIService(objectMapper, llmClient);
    }

    @Test
    void generateQuestions_usesLLM_whenAvailable() {
        // Given: LLM returns valid question JSON
        String llmJson = """
                [
                  {
                    "id": "q-1",
                    "question": "请谈谈你在Java方面的项目经验？",
                    "type": "technical",
                    "expectedKeywords": "Java,Spring,项目经验",
                    "maxScore": 25
                  },
                  {
                    "id": "q-2",
                    "question": "请描述一个你在团队中解决冲突的经历。",
                    "type": "behavioral",
                    "expectedKeywords": "团队协作,冲突,解决",
                    "maxScore": 20
                  }
                ]
                """;
        when(llmClient.chatJson(anyString(), anyString(), anyString())).thenReturn(llmJson);

        // When
        List<InterviewAIService.InterviewQuestion> questions = aiService.generateQuestions("Java后端开发工程师，要求精通Spring Boot和微服务架构", 2);

        // Then
        assertThat(questions).hasSize(2);
        assertThat(questions.get(0).getQuestion()).contains("Java");
        assertThat(questions.get(0).getType()).isEqualTo("technical");
        assertThat(questions.get(1).getType()).isEqualTo("behavioral");
    }

    @Test
    void generateQuestions_fallsBack_whenLLMFails() {
        // Given: LLM throws exception
        when(llmClient.chatJson(anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("LLM unavailable"));

        // When
        List<InterviewAIService.InterviewQuestion> questions = aiService.generateQuestions("Java后端开发工程师，要求精通Spring Boot和微服务架构", 6);

        // Then: should fall back to keyword-based questions
        assertThat(questions).hasSize(6);
        assertThat(questions.get(0).getType()).isEqualTo("technical");
    }

    @Test
    void generateQuestions_returnsDefaults_whenJdTextBlank() {
        List<InterviewAIService.InterviewQuestion> questions = aiService.generateQuestions("", 3);

        assertThat(questions).hasSize(3);
        assertThat(questions.get(0).getType()).isEqualTo("general");
    }

    @Test
    void evaluateAnswers_usesLLM_whenAvailable() {
        // Given: LLM returns valid evaluation JSON
        String llmJson = """
                {
                  "overallScore": 4,
                  "summary": "候选人表现良好，技术基础扎实。",
                  "strengths": ["Java经验丰富", "沟通表达清晰"],
                  "concerns": ["微服务经验稍显不足"],
                  "passRecommended": true,
                  "reasonTags": ["strong_technical", "good_communication"]
                }
                """;
        when(llmClient.chatJson(anyString(), anyString(), anyString())).thenReturn(llmJson);

        List<InterviewAIService.QA> qaList = List.of(
                new InterviewAIService.QA("q-1", "请谈谈你在Java方面的经验？", "我有5年Java开发经验...")
        );

        // When
        InterviewAIService.InterviewEvaluation evaluation = aiService.evaluateAnswers(qaList);

        // Then
        assertThat(evaluation.getScore()).isEqualTo(4);
        assertThat(evaluation.isPassRecommended()).isTrue();
        assertThat(evaluation.getStrengths()).contains("Java经验丰富");
        assertThat(evaluation.getWeaknesses()).contains("微服务经验稍显不足");
    }

    @Test
    void evaluateAnswers_fallsBack_whenLLMFails() {
        // Given: LLM throws exception
        when(llmClient.chatJson(anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("LLM unavailable"));

        List<InterviewAIService.QA> qaList = List.of(
                new InterviewAIService.QA("q-1", "请谈谈你在Java方面的经验？",
                        "我有5年Java开发经验，熟练掌握Spring Boot框架，参与过多个微服务项目的架构设计和开发。")
        );

        // When
        InterviewAIService.InterviewEvaluation evaluation = aiService.evaluateAnswers(qaList);

        // Then: should fall back to basic evaluation
        assertThat(evaluation.getScore()).isBetween(1, 5);
        assertThat(evaluation.getSummary()).isNotEmpty();
        assertThat(evaluation.getStrengths()).isNotEmpty();
        assertThat(evaluation.getWeaknesses()).isNotEmpty();
    }

    @Test
    void evaluateAnswers_returnsEmpty_whenNoAnswers() {
        InterviewAIService.InterviewEvaluation evaluation = aiService.evaluateAnswers(List.of());

        assertThat(evaluation.getScore()).isEqualTo(0);
        assertThat(evaluation.getSummary()).contains("未提供回答");
    }

    @Test
    void buildReport_generatesJson_whenLLMAvailable() {
        // Given: LLM returns valid report JSON
        String llmJson = """
                {
                  "overallScore": 85,
                  "summary": "候选人技术能力优秀，推荐进入下一轮。",
                  "strengths": ["Java经验丰富", "架构设计能力强"],
                  "concerns": ["项目管理经验稍显不足"],
                  "recommendation": "建议进入下一轮",
                  "answerCount": 1
                }
                """;
        when(llmClient.chatJson(anyString(), anyString(), anyString())).thenReturn(llmJson);

        List<InterviewAIService.QA> qaList = List.of(
                new InterviewAIService.QA("q-1", "请谈谈你的经验", "我有丰富经验")
        );

        // When
        String report = aiService.buildReport(qaList, 85);

        // Then
        assertThat(report).contains("overallScore");
        assertThat(report).contains("Java经验丰富");
    }

    @Test
    void buildReport_fallsBack_whenLLMFails() {
        // Given: LLM throws exception
        when(llmClient.chatJson(anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("LLM unavailable"));

        List<InterviewAIService.QA> qaList = List.of(
                new InterviewAIService.QA("q-1", "请谈谈你的经验", "我有丰富经验")
        );

        // When
        String report = aiService.buildReport(qaList, 85);

        // Then: should fall back to basic report
        assertThat(report).contains("overallScore");
        assertThat(report).contains("85");
    }

    @Test
    void evaluateAnswers_usesConcernsOrWeaknesses_fromLLM() {
        // Test that LLM response with "concerns" maps to weaknesses
        String llmJson = """
                {
                  "overallScore": 3,
                  "summary": "表现一般",
                  "strengths": ["有基础"],
                  "concerns": ["深度不够", "经验不足"],
                  "passRecommended": false
                }
                """;
        when(llmClient.chatJson(anyString(), anyString(), anyString())).thenReturn(llmJson);

        List<InterviewAIService.QA> qaList = List.of(
                new InterviewAIService.QA("q-1", "问题", "回答")
        );

        InterviewAIService.InterviewEvaluation evaluation = aiService.evaluateAnswers(qaList);

        assertThat(evaluation.getScore()).isEqualTo(3);
        assertThat(evaluation.isPassRecommended()).isFalse();
        assertThat(evaluation.getWeaknesses()).contains("深度不够", "经验不足");
    }

    @Test
    void generateQuestions_handlesLLMJsonVariants() {
        // Test with "questions" wrapper
        String llmJson = """
                {
                  "questions": [
                    {
                      "id": "q-1",
                      "question": "测试问题",
                      "type": "technical",
                      "expectedKeywords": "测试",
                      "maxScore": 20
                    }
                  ]
                }
                """;
        when(llmClient.chatJson(anyString(), anyString(), anyString())).thenReturn(llmJson);

        List<InterviewAIService.InterviewQuestion> questions = aiService.generateQuestions("测试JD", 1);

        assertThat(questions).hasSize(1);
        assertThat(questions.get(0).getQuestion()).isEqualTo("测试问题");
    }
}
