package com.hireinsight.boss;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.config.AppConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Encapsulates the {@code boss-cli} (kabi-boss-cli) command-line tool via {@link ProcessBuilder}.
 * <p>
 * Provides: installation check/auto-install, version probe, inbox fetch, job list,
 * candidate detail, and resume download.
 */
@Service
public class BossCliService {

    private static final Logger log = LoggerFactory.getLogger(BossCliService.class);

    private static final String BOSS_BIN = "boss";
    private static final String PYPI_PKG = "kabi-boss-cli";
    private static final String INSTALL_TARGET = "git+https://github.com/jackwener/boss-cli.git";

    private final AppConfig appConfig;
    private final ObjectMapper objectMapper;

    private volatile String resolvedBinPath;
    private volatile boolean checkPerformed;

    public BossCliService(AppConfig appConfig, ObjectMapper objectMapper) {
        this.appConfig = appConfig;
        this.objectMapper = objectMapper;
    }

    // ── Lifecycle / installation ─────────────────────────────────────────────

    /**
     * Check whether the boss CLI binary is available.
     */
    public boolean checkInstalled() {
        if (!checkPerformed) {
            resolvedBinPath = resolveBinPath().orElse(null);
            checkPerformed = true;
        }
        return resolvedBinPath != null;
    }

    /**
     * Attempt auto-installation via pip.
     */
    public boolean install() {
        log.info("Attempting auto-install of boss-cli: {} ...", INSTALL_TARGET);
        try {
            String pip = findPip().orElse("pip3");
            ProcessBuilder pb = new ProcessBuilder(pip, "install", "--quiet", INSTALL_TARGET);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            boolean finished = p.waitFor(300, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                log.warn("boss-cli auto-install timed out");
                return false;
            }
            if (p.exitValue() == 0) {
                checkPerformed = false; // force re-resolve
                return checkInstalled();
            }
            log.warn("boss-cli auto-install exited with code {}", p.exitValue());
            return false;
        } catch (Exception e) {
            log.error("boss-cli auto-install failed", e);
            return false;
        }
    }

    /**
     * Get installed boss-cli version string (first line of {@code boss --version}).
     */
    public Optional<String> getVersion() {
        if (!checkInstalled()) {
            return Optional.empty();
        }
        try {
            CliResult r = run(List.of("--version"), 10, null);
            if (r.exitCode == 0 && r.stdout != null) {
                String line = r.stdout.split("\n")[0].trim();
                return Optional.of(line);
            }
        } catch (Exception e) {
            log.warn("Failed to get boss-cli version", e);
        }
        return Optional.empty();
    }

    // ── CLI commands ─────────────────────────────────────────────────────────

    /**
     * Fetch inbox candidates for the given BOSS account.
     */
    public List<Map<String, Object>> fetchInbox(String bossUid, String cookie) {
        CliResult r = run(List.of("recruiter", "inbox", "--json"), 45, cookie);
        return parseDataList(r);
    }

    /**
     * Fetch job list for the given BOSS account.
     */
    public List<Map<String, Object>> fetchJobList(String bossUid, String cookie) {
        CliResult r = run(List.of("recruiter", "jobs", "--json"), 30, cookie);
        return parseDataList(r);
    }

    /**
     * Fetch detailed candidate info.
     */
    public Map<String, Object> fetchCandidateDetail(String geekId, String cookie) {
        CliResult r = run(List.of("recruiter", "resume", geekId, "--json"), 45, cookie);
        return parseDataMap(r);
    }

    /**
     * Download a candidate's resume to the given output path.
     *
     * @return the path to the downloaded file, or empty if download failed
     */
    public Optional<String> downloadResume(String geekId, String cookie, String outputPath) {
        try {
            Files.createDirectories(Paths.get(outputPath).getParent());
        } catch (IOException e) {
            log.warn("Cannot create output directory for resume: {}", outputPath, e);
        }

        List<String> args = List.of("recruiter", "resume-download", geekId, "-o", outputPath);
        CliResult r = run(args, 60, cookie);
        if (r.exitCode == 0) {
            File f = new File(outputPath);
            if (f.exists() && f.length() > 0) {
                return Optional.of(outputPath);
            }
        }
        log.warn("Resume download failed for geekId={}: exit={}, stderr={}", geekId, r.exitCode, r.stderr);
        return Optional.empty();
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private CliResult run(List<String> args, int timeoutSeconds, String cookieOverride) {
        if (!checkInstalled()) {
            return new CliResult(-1, "", "boss-cli not installed", null);
        }

        List<String> cmd = new ArrayList<>();
        cmd.add(resolvedBinPath);
        cmd.addAll(args);

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(false);

        // Set environment: BOSS_COOKIES for auth override
        if (cookieOverride != null && !cookieOverride.isBlank()) {
            pb.environment().put("BOSS_COOKIES", cookieOverride);
        }
        pb.environment().put("PYTHONIOENCODING", "utf-8");

        try {
            Process p = pb.start();
            boolean finished = p.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                log.warn("boss-cli command timed out after {}s: {}", timeoutSeconds, args);
                return new CliResult(-1, "", "timeout", "timeout");
            }

            String stdout = readStream(p.getInputStream());
            String stderr = readStream(p.getErrorStream());

            CliResult result = new CliResult(p.exitValue(), stdout, stderr, null);

            // Error classification
            if (result.exitCode != 0) {
                classifyError(result);
            }

            return result;
        } catch (IOException | InterruptedException e) {
            log.error("boss-cli execution failed", e);
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return new CliResult(-1, "", e.getMessage(), "exec_error");
        }
    }

    private void classifyError(CliResult result) {
        String msg = (result.stderr != null ? result.stderr : "") + (result.stdout != null ? result.stdout : "");
        if (msg.contains("not_authenticated") || msg.contains("未登录") || msg.contains("凭证")
                || msg.contains("失效") || msg.contains("code=7")) {
            result.errorCode = "not_authenticated";
        } else if (msg.contains("rate_limited") || msg.contains("频控") || msg.contains("429")) {
            result.errorCode = "rate_limited";
        } else if (msg.contains("stoken") || msg.contains("环境异常") || msg.contains("code=37")) {
            result.errorCode = "needs_stoken";
        } else {
            result.errorCode = "unknown_error";
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseDataList(CliResult r) {
        if (r.exitCode != 0 || r.stdout == null || r.stdout.isBlank()) {
            return List.of();
        }
        try {
            Map<String, Object> envelope = objectMapper.readValue(r.stdout,
                    new TypeReference<Map<String, Object>>() {});
            if (envelope.containsKey("ok") && Boolean.FALSE.equals(envelope.get("ok"))) {
                log.warn("boss-cli returned error: {}", envelope.get("error"));
                return List.of();
            }
            Object data = envelope.get("data");
            if (data instanceof List) {
                return (List<Map<String, Object>>) data;
            }
        } catch (Exception e) {
            log.warn("Failed to parse boss-cli JSON output", e);
        }
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseDataMap(CliResult r) {
        if (r.exitCode != 0 || r.stdout == null || r.stdout.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, Object> envelope = objectMapper.readValue(r.stdout,
                    new TypeReference<Map<String, Object>>() {});
            if (envelope.containsKey("ok") && Boolean.FALSE.equals(envelope.get("ok"))) {
                log.warn("boss-cli returned error: {}", envelope.get("error"));
                return Map.of();
            }
            Object data = envelope.get("data");
            if (data instanceof Map) {
                return (Map<String, Object>) data;
            }
        } catch (Exception e) {
            log.warn("Failed to parse boss-cli JSON output", e);
        }
        return Map.of();
    }

    private Optional<String> resolveBinPath() {
        // 1. Config override
        String configured = appConfig.getBoss().getCliPath();
        if (configured != null && !configured.isBlank()) {
            File f = new File(configured);
            if (f.exists() && f.canExecute()) {
                return Optional.of(configured);
            }
        }

        // 2. which boss
        try {
            ProcessBuilder pb = new ProcessBuilder("which", BOSS_BIN);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            if (p.waitFor(5, TimeUnit.SECONDS) && p.exitValue() == 0) {
                String path = readStream(p.getInputStream()).trim();
                if (!path.isBlank()) {
                    return Optional.of(path);
                }
            }
        } catch (Exception ignored) {
            // fall through
        }

        // 3. PATH search
        String pathEnv = System.getenv("PATH");
        if (pathEnv != null) {
            for (String dir : pathEnv.split(":")) {
                File f = new File(dir, BOSS_BIN);
                if (f.exists() && f.canExecute()) {
                    return Optional.of(f.getAbsolutePath());
                }
            }
        }

        return Optional.empty();
    }

    private Optional<String> findPip() {
        // Try pip3 first, then pip
        for (String name : List.of("pip3", "pip")) {
            try {
                ProcessBuilder pb = new ProcessBuilder("which", name);
                Process p = pb.start();
                if (p.waitFor(5, TimeUnit.SECONDS) && p.exitValue() == 0) {
                    return Optional.of(name);
                }
            } catch (Exception ignored) {
            }
        }
        return Optional.empty();
    }

    private String readStream(java.io.InputStream is) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        char[] buf = new char[4096];
        int n;
        while ((n = reader.read(buf)) != -1) {
            sb.append(buf, 0, n);
        }
        return sb.toString();
    }

    // ── Internal types ───────────────────────────────────────────────────────

    static class CliResult {
        final int exitCode;
        final String stdout;
        final String stderr;
        String errorCode;

        CliResult(int exitCode, String stdout, String stderr, String errorCode) {
            this.exitCode = exitCode;
            this.stdout = stdout;
            this.stderr = stderr;
            this.errorCode = errorCode;
        }

        boolean isOk() {
            return exitCode == 0 && (errorCode == null || errorCode.equals("ok"));
        }
    }
}
