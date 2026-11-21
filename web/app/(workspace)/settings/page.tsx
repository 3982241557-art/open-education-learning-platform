import { Settings } from "lucide-react";
import { FeaturePage, PageHeader } from "@/components/layout/FeaturePage";
import { SetupStatusCard } from "@/components/settings/SetupStatusCard";

/** 设置页：展示本地运行配置状态。 */
export default function SettingsPage() {
  return (
    <FeaturePage>
      <PageHeader
        title="设置"
        description="运行状态与本地配置。"
        icon={Settings}
      />

      <div className="max-w-2xl">
        <SetupStatusCard />
      </div>
    </FeaturePage>
  );
}
