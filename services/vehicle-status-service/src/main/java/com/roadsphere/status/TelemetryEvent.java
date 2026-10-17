package com.roadsphere.status;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record TelemetryEvent(
        @NotBlank @Size(max = 80) String eventId,
        @NotBlank @Size(max = 32) String vehicleId,
        @NotNull OffsetDateTime recordedAt,
        @NotNull @Min(0) @Max(100) Integer batteryPercent,
        @NotNull @DecimalMin("-40.0") @DecimalMax("100.0") BigDecimal batteryTemperatureC,
        @NotNull @DecimalMin("0.0") @DecimalMax("260.0") BigDecimal speedKph,
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal latitude,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal longitude,
        @NotNull Boolean charging) {

    public TelemetryEvent normalized() {
        return new TelemetryEvent(eventId.trim(), vehicleId.trim(), recordedAt, batteryPercent,
                batteryTemperatureC.stripTrailingZeros(), speedKph.stripTrailingZeros(), latitude.stripTrailingZeros(),
                longitude.stripTrailingZeros(), charging);
    }
}
