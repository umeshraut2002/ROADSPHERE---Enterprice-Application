package com.roadsphere.status;

import org.springframework.http.HttpStatus;

public class VehicleStatusException extends RuntimeException {

    private final HttpStatus status;
    private final String title;

    public VehicleStatusException(HttpStatus status, String title, String detail) {
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
