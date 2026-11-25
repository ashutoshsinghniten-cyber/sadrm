
# ============================================================
# STAGE 1: BUILD
# ============================================================

FROM maven:3.9-eclipse-temurin-26 AS build

WORKDIR /app

# Copy Maven configuration first for dependency caching
COPY pom.xml .

# Download Maven dependencies
RUN mvn dependency:go-offline -B

# Copy backend source code
COPY src ./src

# Build executable Spring Boot JAR
RUN mvn clean package -DskipTests -B


# ============================================================
# STAGE 2: RUNTIME
# ============================================================

FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

# Create non-root user for security
RUN groupadd -r sadrm && \
    useradd -r -g sadrm -d /app -s /usr/sbin/nologin sadrm

# Copy executable JAR with correct ownership
COPY --from=build --chown=sadrm:sadrm \
    /app/target/sadrm-backend-1.0.0.jar app.jar

# Run application as non-root user
USER sadrm

# Spring Boot application port
EXPOSE 8080

# JVM configuration
ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:+UseG1GC", \
    "-XX:G1HeapRegionSize=8m", \
    "-XX:+ExitOnOutOfMemoryError", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-jar", \
    "app.jar"]
