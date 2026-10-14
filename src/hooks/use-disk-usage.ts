import { useEffect, useRef } from "react";
import { apiClient } from "@/lib/api";
import type { DiskUsage } from "@/lib/types";

/** Polls disk usage every 30 seconds while authenticated. */
export function useDiskUsage(
  isAuthenticated: boolean,
  onUsage: (usage: DiskUsage) => void
) {
  const onUsageRef = useRef(onUsage);
  onUsageRef.current = onUsage;

  // Refresh disk usage every 30 seconds when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchDiskUsage = async () => {
      try {
        const usage = await apiClient.getDiskUsage();
        onUsageRef.current(usage);
      } catch (error) {
        console.error("Failed to fetch disk usage:", error);
      }
    };

    fetchDiskUsage();
    const interval = setInterval(fetchDiskUsage, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated]);
}