package com.roadsphere.registry;

import java.util.List;

public record VehiclePage(List<VehicleRecord> items, int page, int size, int total) {
}
