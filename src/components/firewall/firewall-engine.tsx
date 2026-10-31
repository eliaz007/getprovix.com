import type { ReactNode } from "react";
import CliLogStream from "@/components/firewall/cli-log-stream";
import PrCommentPreview from "@/components/firewall/pr-comment-preview";
import SecretEnvGuard from "@/components/firewall/secret-env-guard";

export default function FirewallEngine(): ReactNode {
  return (
    <div className="space-y-6">
      <PrCommentPreview />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SecretEnvGuard />
        <CliLogStream />
      </div>
    </div>
  );
}
