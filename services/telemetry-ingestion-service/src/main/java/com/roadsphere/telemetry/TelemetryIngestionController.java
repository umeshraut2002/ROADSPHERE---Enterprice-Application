package com.roadsphere.telemetry;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/telemetry")
public class TelemetryIngestionController {

    private final TelemetryIngestionService ingestionService;

    public TelemetryIngestionController(TelemetryIngestionService ingestionService) {
        this.ingestionService = ingestionService;
    }

    @PostMapping
    public ResponseEntity<TelemetryAcceptance> accept(
            @Valid @RequestBody TelemetryEvent event,
            @RequestHeader(value = "X-Correlation-ID", required = false) String correlationId) {
        TelemetryAcceptance acceptance = ingestionService.accept(event, correlationId);
        return ResponseEntity.status("ACCEPTED".equals(acceptance.status()) ? 202 : 200).body(acceptance);
    }
}
