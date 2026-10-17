package com.roadsphere.status;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.http.HttpClient;
import java.time.Duration;

@Component
public class HttpRegisteredVehicleLookup implements RegisteredVehicleLookup {

    private final RestClient client;

    public HttpRegisteredVehicleLookup(
            @Value("${roadsphere.vehicle-registry.base-url}") String registryBaseUrl) {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(750)).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofMillis(1_500));
        this.client = RestClient.builder()
                .baseUrl(registryBaseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public void requireRegistered(String vehicleId) {
        try {
            client.get().uri("/api/v1/vehicles/{vehicleId}", vehicleId).retrieve().toBodilessEntity();
        } catch (HttpClientErrorException.NotFound exception) {
            throw new VehicleStatusException(HttpStatus.NOT_FOUND, "Vehicle not found",
                    "Telemetry references a vehicle that is not registered.");
        } catch (RestClientException exception) {
            throw new VehicleStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Vehicle registry unavailable",
                    "The vehicle registry could not validate this telemetry event.");
        }
    }
}
