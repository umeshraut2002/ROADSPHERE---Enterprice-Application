package com.roadsphere.status;

import java.util.List;

public record VehicleStatusPage(List<VehicleStatusRecord> items, int page, int size, int total) {
}
