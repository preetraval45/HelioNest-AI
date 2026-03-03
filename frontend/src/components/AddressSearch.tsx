"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/components/PostHogProvider";

interface AddressSearchProps {
  defaultValue?: string;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  onResult?: (address: string) => void;
}

export default function AddressSearch({
  defaultValue = "",
  placeholder = "Enter any U.S. address...",
  size = "md",
  className = "",
  onResult,
}: AddressSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState("");

  const sizeClasses = {
    sm: { input: "px-3 py-2 text-sm", button: "px-4 py-2 text-sm", wrapper: "rounded-xl" },
    md: { input: "px-4 py-3 text-sm", button: "px-5 py-3 text-sm", wrapper: "rounded-xl" },
    lg: { input: "px-5 py-4 text-base", button: "px-7 py-4 text-base", wrapper: "rounded-2xl" },
  };

  const s = sizeClasses[size];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Please enter an address.");
      return;
    }
    setError("");
    trackEvent("address_searched", { address: trimmed });
    if (onResult) {
      onResult(trimmed);
    } else {
      router.push(`/property/${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit}>
        <div className={`flex gap-2 bg-th-bg-card border border-th-border shadow-sm p-1.5 transition-all focus-within:border-th-solar/60 focus-within:shadow-[0_0_0_3px_rgb(var(--accent-solar)/0.12)] ${s.wrapper}`}>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError("");
            }}
            placeholder={placeholder}
            className={`flex-1 bg-transparent outline-none text-th-text placeholder:text-th-muted ${s.input}`}
            autoComplete="street-address"
          />
          <button
            type="submit"
            className={`btn-solar rounded-lg whitespace-nowrap ${s.button}`}
          >
            Analyze
          </button>
        </div>
        {error && <p className="text-xs mt-1.5 pl-1 text-th-danger">{error}</p>}
      </form>
    </div>
  );
}
