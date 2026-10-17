package com.roadsphere.telemetry;

import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class TelemetryIngestionExceptionHandler {

    @ExceptionHandler(TelemetryIngestionException.class)
    public ResponseEntity<ProblemDetail> handle(TelemetryIngestionException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(exception.status(), exception.getMessage());
        problem.setTitle(exception.title());
        return ResponseEntity.status(exception.status()).body(problem);
    }
}
