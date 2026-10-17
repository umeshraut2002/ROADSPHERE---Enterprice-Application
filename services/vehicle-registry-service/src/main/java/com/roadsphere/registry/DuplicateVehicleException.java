package com.roadsphere.registry;

public class DuplicateVehicleException extends RuntimeException {

    public DuplicateVehicleException(String plate) {
        super("Owner already has a registered vehicle with plate " + plate + ".");
    }
}
