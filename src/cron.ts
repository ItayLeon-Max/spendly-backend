

import "dotenv/config";
import { PushRulesService } from "./services/push-rules.service.js";

const run = async () => {
  console.log("⏰ Smart push cron started");

  try {
    await PushRulesService.runSmartPushCycle();
    console.log("✅ Smart push cron finished successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Smart push cron failed:", error);
    process.exit(1);
  }
};

void run();