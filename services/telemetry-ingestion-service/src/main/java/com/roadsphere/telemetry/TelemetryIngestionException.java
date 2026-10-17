package com.roadsphere.telemetry;

import org.springframework.http.HttpStatus;

public class TelemetryIngestionException extends RuntimeException {

    private final HttpStatus status;
    private final String title;

    public TelemetryIngestionException(HttpStatus status, String title, String detail) {
        super(detail);
        this.status = status;
        this.title = title;
    }

    public HttpStatus status() {
        return status;
    }

    public String title() {
        return title;
    }
}
