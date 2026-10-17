package com.roadsphere.telemetry;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Component
public class TelemetryOutboxPublisher {

    private static final Logger logger = LoggerFactory.getLogger(TelemetryOutboxPublisher.class);

    private final TelemetryOutboxRepository repository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final String topic;
    private final Counter published;
    private final Counter failed;

    public TelemetryOutboxPublisher(TelemetryOutboxRepository repository,
                                    KafkaTemplate<String, String> kafkaTemplate,
                                    @Value("${roadsphere.telemetry.topic}") String topic,
                                    MeterRegistry meterRegistry) {
        this.repository = repository;
        this.kafkaTemplate = kafkaTemplate;
        this.topic = topic;
        this.published = meterRegistry.counter("roadsphere.telemetry.outbox.published");
        this.failed = meterRegistry.counter("roadsphere.telemetry.outbox.publish.failed");
    }

    @Scheduled(fixedDelayString = "${roadsphere.telemetry.outbox-poll-ms:1000}")
    public void publishReadyMessages() {
        List<TelemetryOutboxRepository.OutboxMessage> batch = repository.claimBatch(10);
        for (TelemetryOutboxRepository.OutboxMessage message : batch) {
            publish(message);
        }
    }

    @Scheduled(cron = "${roadsphere.telemetry.outbox-cleanup-cron:0 15 3 * * *}")
    public void cleanupPublishedMessages() {
        int removed = repository.deletePublishedBefore(Instant.now().minus(90, ChronoUnit.DAYS));
        if (removed > 0) logger.info("Removed published telemetry outbox rows older than 90 days; count={}", removed);
    }

    private void publish(TelemetryOutboxRepository.OutboxMessage message) {
        ProducerRecord<String, String> record = new ProducerRecord<>(topic, message.vehicleId(), message.payload());
        record.headers().add(new RecordHeader("eventId", message.eventId().getBytes(StandardCharsets.UTF_8)));
        record.headers().add(new RecordHeader("correlationId", message.correlationId().getBytes(StandardCharsets.UTF_8)));
        try {
            kafkaTemplate.send(record).get(5, TimeUnit.SECONDS);
            repository.markPublished(message.eventId());
            published.increment();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            scheduleRetry(message, exception);
        } catch (Exception exception) {
            scheduleRetry(message, exception);
        }
    }

    private void scheduleRetry(TelemetryOutboxRepository.OutboxMessage message, Exception exception) {
        repository.scheduleRetry(message, exception);
        failed.increment();
        logger.warn("Could not publish telemetry event; eventId={}, attempt={}",
                message.eventId(), message.attempts());
    }
}
