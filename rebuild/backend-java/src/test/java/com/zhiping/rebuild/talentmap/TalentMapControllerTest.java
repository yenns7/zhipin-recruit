package com.zhiping.rebuild.talentmap;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.DemoAuthSessionService;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.Job;
import com.hireinsight.model.User;
import com.hireinsight.repository.JobRepository;
import com.hireinsight.repository.TalentMapCompanyRepository;
import com.hireinsight.repository.TalentMapPersonRepository;
import com.hireinsight.repository.TalentMapRepository;
import com.hireinsight.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "app.upload.max-file-size=104857600",
        "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class TalentMapControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JobRepository jobRepository;

    @Autowired
    private TalentMapRepository talentMapRepository;

    @Autowired
    private TalentMapCompanyRepository companyRepository;

    @Autowired
    private TalentMapPersonRepository personRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private DemoAuthSessionService demoAuthSessionService;

    private String recruiterToken;
    private String managerToken;
    private Long jobId;

    @BeforeEach
    void setUp() {
        personRepository.deleteAll();
        companyRepository.deleteAll();
        talentMapRepository.deleteAll();
        jobRepository.deleteAll();
        userRepository.deleteAll();

        User recruiter = userRepository.save(User.builder()
                .name("招聘专员")
                .email("tm-recruiter@test.com")
                .role("recruiter")
                .passwordHash("irrelevant")
                .build());
        recruiterToken = bearerToken(recruiter);

        User manager = userRepository.save(User.builder()
                .name("招聘经理")
                .email("tm-manager@test.com")
                .role("manager")
                .passwordHash("irrelevant")
                .build());
        managerToken = bearerToken(manager);

        Job job = jobRepository.save(Job.builder()
                .title("测试岗位")
                .jdText("测试岗位描述")
                .ownerHrId(recruiter.getId())
                .status("active")
                .build());
        jobId = job.getId();
    }

    @Test
    void listReturnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/talent-maps")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray());
    }

    @Test
    void createMapReturnsCreated() throws Exception {
        mockMvc.perform(post("/api/v1/talent-maps")
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"省总人才地图","jobId":%d,"department":"销售中心"}
                                """.formatted(jobId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.name").value("省总人才地图"))
                .andExpect(jsonPath("$.data.jobId").value(jobId))
                .andExpect(jsonPath("$.data.department").value("销售中心"))
                .andExpect(jsonPath("$.data.companiesCount").value(0))
                .andExpect(jsonPath("$.data.peopleCount").value(0));
    }

    @Test
    void createAndGetMapWithDetail() throws Exception {
        String createJson = mockMvc.perform(post("/api/v1/talent-maps")
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"竞品人才地图\",\"jobId\":%d}".formatted(jobId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long mapId = extractFirstId(createJson);

        mockMvc.perform(post("/api/v1/talent-maps/{mapId}/companies", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyName\":\"竞品科技\",\"city\":\"深圳\",\"priority\":\"high\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.companyName").value("竞品科技"))
                .andExpect(jsonPath("$.data.city").value("深圳"));

        mockMvc.perform(post("/api/v1/talent-maps/{mapId}/people", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"张三","title":"销售总监","city":"深圳",
                                 "tags":["大客户","团队管理"],"salaryRange":"60-80万",
                                 "contactStatus":"未接触","evaluation":"行业经验丰富"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.name").value("张三"))
                .andExpect(jsonPath("$.data.tags", hasSize(2)))
                .andExpect(jsonPath("$.data.contactStatus").value("未接触"));

        mockMvc.perform(get("/api/v1/talent-maps/{mapId}", mapId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.companiesCount").value(1))
                .andExpect(jsonPath("$.data.peopleCount").value(1))
                .andExpect(jsonPath("$.data.companies[0].companyName").value("竞品科技"))
                .andExpect(jsonPath("$.data.people[0].name").value("张三"));
    }

    @Test
    void getMapWithPeopleFiltering() throws Exception {
        String createJson = mockMvc.perform(post("/api/v1/talent-maps")
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"过滤测试地图\",\"jobId\":%d}".formatted(jobId)))
                .andReturn().getResponse().getContentAsString();
        Long mapId = extractFirstId(createJson);

        String co1Json = mockMvc.perform(post("/api/v1/talent-maps/{mapId}/companies", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyName\":\"公司A\",\"city\":\"深圳\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String co2Json = mockMvc.perform(post("/api/v1/talent-maps/{mapId}/companies", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyName\":\"公司B\",\"city\":\"广州\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long companyAId = extractFirstId(co1Json);
        Long companyBId = extractFirstId(co2Json);

        mockMvc.perform(post("/api/v1/talent-maps/{mapId}/people", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"张三\",\"companyId\":%d,\"city\":\"深圳\",\"contactStatus\":\"未接触\"}".formatted(companyAId)));
        mockMvc.perform(post("/api/v1/talent-maps/{mapId}/people", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"李四\",\"companyId\":%d,\"city\":\"广州\",\"contactStatus\":\"重点关注\"}".formatted(companyBId)));
        mockMvc.perform(post("/api/v1/talent-maps/{mapId}/people", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"王五\",\"companyId\":%d,\"city\":\"深圳\",\"contactStatus\":\"已接触\"}".formatted(companyAId)));

        mockMvc.perform(get("/api/v1/talent-maps/{mapId}?city=广州", mapId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.peopleCount").value(1))
                .andExpect(jsonPath("$.data.people[0].name").value("李四"));

        mockMvc.perform(get("/api/v1/talent-maps/{mapId}?status=重点关注", mapId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.peopleCount").value(1))
                .andExpect(jsonPath("$.data.people[0].name").value("李四"));

        mockMvc.perform(get("/api/v1/talent-maps/{mapId}?keyword=王五", mapId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.peopleCount").value(1))
                .andExpect(jsonPath("$.data.people[0].name").value("王五"));

        mockMvc.perform(get("/api/v1/talent-maps/{mapId}", mapId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.peopleCount").value(3));
    }

    @Test
    void recruiterSeesOnlyOwnMaps() throws Exception {
        User recruiter2 = userRepository.save(User.builder()
                .name("招聘专员2").email("tm-recruiter2@test.com").role("recruiter")
                .passwordHash("irrelevant").build());
        String recruiter2Token = bearerToken(recruiter2);

        mockMvc.perform(post("/api/v1/talent-maps").header("Authorization", "Bearer " + recruiterToken)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"专属地图1\"}"));
        mockMvc.perform(post("/api/v1/talent-maps").header("Authorization", "Bearer " + recruiter2Token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"专属地图2\"}"));

        mockMvc.perform(get("/api/v1/talent-maps").header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].name").value("专属地图1"));

        mockMvc.perform(get("/api/v1/talent-maps").header("Authorization", "Bearer " + managerToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(2)));
    }

    @Test
    void addCompanyWithoutAuthReturns401() throws Exception {
        mockMvc.perform(post("/api/v1/talent-maps/1/companies")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyName\":\"测试\"}"))
                .andExpect(status().is(anyOf(is(401), is(403))));
    }

    @Test
    void updateMapReturnsOk() throws Exception {
        String createJson = mockMvc.perform(post("/api/v1/talent-maps")
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"原始名称\",\"jobId\":%d}".formatted(jobId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long mapId = extractFirstId(createJson);

        mockMvc.perform(patch("/api/v1/talent-maps/{mapId}", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"更新后的名称\",\"department\":\"新部门\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.name").value("更新后的名称"))
                .andExpect(jsonPath("$.data.department").value("新部门"));
    }

    @Test
    void updateCompanyReturnsOk() throws Exception {
        String createJson = mockMvc.perform(post("/api/v1/talent-maps")
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"测试地图\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long mapId = extractFirstId(createJson);

        String coJson = mockMvc.perform(post("/api/v1/talent-maps/{mapId}/companies", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyName\":\"原公司\",\"city\":\"深圳\",\"priority\":\"medium\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long companyId = extractFirstId(coJson);

        mockMvc.perform(patch("/api/v1/talent-maps/{mapId}/companies/{companyId}", mapId, companyId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyName\":\"更新公司\",\"city\":\"北京\",\"priority\":\"high\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.companyName").value("更新公司"))
                .andExpect(jsonPath("$.data.city").value("北京"))
                .andExpect(jsonPath("$.data.priority").value("high"));
    }

    @Test
    void updatePersonReturnsOk() throws Exception {
        String createJson = mockMvc.perform(post("/api/v1/talent-maps")
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"测试地图\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long mapId = extractFirstId(createJson);

        String personJson = mockMvc.perform(post("/api/v1/talent-maps/{mapId}/people", mapId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"张三","title":"销售总监","contactStatus":"未接触"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long personId = extractFirstId(personJson);

        mockMvc.perform(patch("/api/v1/talent-maps/{mapId}/people/{personId}", mapId, personId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"李四","title":"高级总监","contactStatus":"已接触","evaluation":"经验丰富"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.name").value("李四"))
                .andExpect(jsonPath("$.data.title").value("高级总监"))
                .andExpect(jsonPath("$.data.contactStatus").value("已接触"));
    }

    @Test
    void updateMapWithoutAuthReturns401() throws Exception {
        mockMvc.perform(patch("/api/v1/talent-maps/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"test\"}"))
                .andExpect(status().is(anyOf(is(401), is(403))));
    }

    private String bearerToken(User user) {
        String token = jwtTokenProvider.createToken(user.getId(), user.getRole());
        demoAuthSessionService.activate(token);
        return token;
    }

    private Long extractFirstId(String json) {
        int keyIdx = json.indexOf("\"id\":");
        if (keyIdx < 0) throw new RuntimeException("No id found in: " + json);
        int start = keyIdx + 5;
        int end = start;
        while (end < json.length() && (Character.isDigit(json.charAt(end)) || json.charAt(end) == '-')) end++;
        return Long.parseLong(json.substring(start, end));
    }
}
