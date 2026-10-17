package com.roadsphere.status;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertTrue;

class TelemetryEventValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void requiresBatteryPercentInsteadOfTreatingAnOmittedFieldAsZero() {
        TelemetryEvent event = new TelemetryEvent("event-1", "RS-2048", OffsetDateTime.parse("2026-10-17T08:00:00Z"),
                null, new BigDecimal("25"), BigDecimal.ZERO, new BigDecimal("52.52"),
                new BigDecimal("13.405"), false);

        assertTrue(validator.validate(event).stream()
                .anyMatch(violation -> violation.getPropertyPath().toString().equals("batteryPercent")));
    }
}
