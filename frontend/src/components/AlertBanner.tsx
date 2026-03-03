"use client";

import { useState } from "react";

export type AlertSeverity = "info" | "warning" | "danger";

export interface PropertyAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  icon: string;
}

interface AlertBannerProps {
  alerts: PropertyAlert[];
}

const SEVERITY_STYLES: Record<AlertSeverity, { banner: string; badge: string; dot: string }> = {
  danger: {
    banner: "bg-th-danger/10 border-th-danger/30",
    badge:  "bg-th-danger/20 text-th-danger border-th-danger/30",
    dot:    "bg-th-danger",
  },
  warning: {
    banner: "bg-th-solar/10 border-th-solar/25",
    badge:  "bg-th-solar/15 text-th-solar border-th-solar/25",
    dot:    "bg-th-solar",
  },
  info: {
    banner: "bg-th-weather/10 border-th-weather/25",
    badge:  "bg-th-weather/15 text-th-weather border-th-weather/25",
    dot:    "bg-th-weather",
  },
};

function SingleAlert({ alert }: { alert: PropertyAlert }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const s = SEVERITY_STYLES[alert.severity];

  if (dismissed) return null;

  return (
    <div className={`rounded-xl border px-4 py-3 ${s.banner}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0 mt-0.5">{alert.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-th-text text-sm">{alert.title}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${s.badge}`}>
              {alert.severity}
            </span>
          </div>
          {expanded && (
            <p className="text-th-text-2 text-xs mt-1 leading-relaxed">{alert.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-th-muted hover:text-th-text-2 text-xs px-2 py-1 rounded-lg hover:bg-th-bg-2 transition-all"
          >
            {expanded ? "Less" : "More"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-th-muted hover:text-th-text-2 text-xs px-1.5 py-1 rounded-lg hover:bg-th-bg-2 transition-all"
            aria-label="Dismiss alert"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  const dangerCount  = alerts.filter((a) => a.severity === "danger").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  return (
    <div className="space-y-2">
      {/* Summary pill */}
      <div className="flex items-center gap-2 flex-wrap">
        {dangerCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-th-danger/10 border border-th-danger/25 text-th-danger font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-th-danger animate-pulse" />
            {dangerCount} Danger {dangerCount === 1 ? "Alert" : "Alerts"}
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-th-solar/10 border border-th-solar/25 text-th-solar font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-th-solar animate-pulse" />
            {warningCount} {warningCount === 1 ? "Warning" : "Warnings"}
          </span>
        )}
      </div>

      {/* Individual banners */}
      {alerts.map((alert) => (
        <SingleAlert key={alert.id} alert={alert} />
      ))}
    </div>
  );
}
