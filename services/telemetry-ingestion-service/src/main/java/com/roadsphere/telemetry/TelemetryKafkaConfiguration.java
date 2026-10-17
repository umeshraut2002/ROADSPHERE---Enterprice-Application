package com.roadsphere.telemetry;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

@Configuration(proxyBeanMethods = false)
public class TelemetryKafkaConfiguration {

    TelemetryKafkaConfiguration(TelemetryOutboxRepository outboxRepository, MeterRegistry meterRegistry) {
        Gauge.builder("roadsphere.telemetry.outbox.pending", outboxRepository, TelemetryOutboxRepository::countPending)
                .description("Telemetry events waiting for successful publication to Kafka")
                .register(meterRegistry);
    }

    @Bean
    @ConditionalOnProperty(name = "roadsphere.kafka.provision-telemetry-topic", havingValue = "true", matchIfMissing = true)
    NewTopic telemetryReceivedTopic(@Value("${roadsphere.telemetry.topic}") String topic,
                                    @Value("${roadsphere.telemetry.topic-partitions:3}") int partitions,
                                    @Value("${roadsphere.telemetry.topic-replicas:1}") short replicas) {
        return TopicBuilder.name(topic).partitions(partitions).replicas(replicas).build();
    }
}
