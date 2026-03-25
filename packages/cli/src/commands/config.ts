import { Command } from "commander";
import { setTelemetryEnabled, getTelemetryConfig } from "@10iii/air-core";

export const configCommand = new Command("config")
  .description("Manage AIR configuration")
  .addCommand(
    new Command("get")
      .description("Get configuration values")
      .argument("[key]", "Config key (e.g., telemetry.enabled)")
      .action((key?: string) => {
        const telemetryConfig = getTelemetryConfig();
        
        if (!key) {
          console.log("telemetry.enabled:", telemetryConfig.enabled);
          console.log("telemetry.endpoint:", telemetryConfig.endpoint);
          console.log("telemetry.batchSize:", telemetryConfig.batchSize);
          console.log("telemetry.flushIntervalMs:", telemetryConfig.flushIntervalMs);
          return;
        }
        
        if (key === "telemetry" || key === "telemetry.enabled") {
          console.log(telemetryConfig.enabled);
        } else if (key === "telemetry.endpoint") {
          console.log(telemetryConfig.endpoint);
        } else if (key === "telemetry.batchSize") {
          console.log(telemetryConfig.batchSize);
        } else if (key === "telemetry.flushIntervalMs") {
          console.log(telemetryConfig.flushIntervalMs);
        } else {
          console.error(`Unknown config key: ${key}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command("set")
      .description("Set configuration values")
      .argument("<key>", "Config key (e.g., telemetry.enabled)")
      .argument("<value>", "Config value")
      .action((key: string, value: string) => {
        if (key === "telemetry" || key === "telemetry.enabled") {
          const enabled = value === "true" || value === "1" || value === "yes";
          setTelemetryEnabled(enabled);
          console.log(`telemetry.enabled set to ${enabled}`);
        } else {
          console.error(`Cannot set: ${key} (only telemetry.enabled is configurable)`);
          process.exit(1);
        }
      })
  );
