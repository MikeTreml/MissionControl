/**
 * pi spike — verifies @mariozechner/pi-coding-agent can be imported and
 * `createAgentSession` is callable from the main-process Node context.
 *
 * Serves as a canary: catches import-time regressions when pi bumps version.
 * Also prints the active provider list so you can eyeball what's available.
 */
import { createAgentSession } from "@mariozechner/pi-coding-agent";
import { getProviders } from "@mariozechner/pi-ai";

async function main(): Promise<void> {
  console.log("[spike] pi-ai providers:", getProviders());

  console.log("[spike] createAgentSession()…");
  const result = await createAgentSession({});
  console.log(
    "[spike] session:",
    result.session?.agent?.constructor?.name ?? "(unknown)",
  );

  console.log("GREEN");
}

main().catch((err) => {
  console.error("[spike] threw:", err);
  process.exit(1);
});
