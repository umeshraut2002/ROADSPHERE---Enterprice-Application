FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY src ./src
RUN mvn -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre-alpine
ENV PORT=8087 ROADSPHERE_BIND_ADDRESS=0.0.0.0
WORKDIR /app
COPY --from=build /workspace/target/vehicle-status-service-0.1.0.jar /app/app.jar
USER 10001:10001
EXPOSE 8087
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 CMD wget -q -O - http://127.0.0.1:8087/actuator/health/readiness || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=55.0", "-jar", "/app/app.jar"]
