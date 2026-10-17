package com.roadsphere.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.validation.Validator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.DltHandler;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import org.springframework.retry.annotation.Backoff;
import org.springframework.stereotype.Component;

@Component
public class TelemetryEventConsumer {

    private static final Logger logger = LoggerFactory.getLogger(TelemetryEventConsumer.class);

    private final ObjectMapper objectMapper;
    private final VehicleStatusService statusService;
    private final Validator validator;
    private final Counter projected;
    private final Counter deadLettered;

    public TelemetryEventConsumer(ObjectMapper objectMapper, VehicleStatusService statusService, Validator validator,
                                  MeterRegistry meterRegistry) {
        this.objectMapper = objectMapper;
        this.statusService = statusService;
        this.validator = validator;
        this.projected = meterRegistry.counter("roadsphere.telemetry.consumer.projected");
        this.deadLettered = meterRegistry.counter("roadsphere.telemetry.consumer.dlq");
    }

    @RetryableTopic(attempts = "4", backoff = @Backoff(delay = 1000, multiplier = 2.0),
            dltTopicSuffix = ".dlq",
            autoCreateTopics = "${roadsphere.telemetry.retry-topics-auto-create:true}",
            numPartitions = "${roadsphere.telemetry.topic-partitions:3}",
            replicationFactor = "${roadsphere.telemetry.topic-replicas:1}")
    @KafkaListener(topics = "${roadsphere.telemetry.topic}", groupId = "${spring.kafka.consumer.group-id}")
    public void receive(String payload) throws Exception {
        TelemetryEvent event = objectMapper.readValue(payload, TelemetryEvent.class);
        if (!validator.validate(event).isEmpty()) {
            throw new IllegalArgumentException("Telemetry event fields do not match the supported v1 contract.");
        }
        try {
            statusService.accept(event);
        } catch (VehicleStatusException exception) {
            if (exception.status().is4xxClientError() && "Stale telemetry".equals(exception.title())) {
                logger.info("Skipping stale telemetry event after a newer projection; vehicleId={}", event.vehicleId());
                projected.increment();
                return;
            }
            throw exception;
        }
        projected.increment();
    }

    @DltHandler
    public void deadLetter(String payload) {
        deadLettered.increment();
        logger.error("Telemetry event reached the dead-letter topic; payloadLength={}",
                payload == null ? 0 : payload.length());
    }
}
