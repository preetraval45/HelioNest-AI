"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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
    if (onResult) {
      onResult(trimmed);
    } else {
      router.push(`/property/${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit}>
        <div className={`flex gap-2 bg-white border border-gray-200 shadow-sm p-1.5 ${s.wrapper}`}>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError("");
            }}
            placeholder={placeholder}
            className={`flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400 ${s.input}`}
            autoComplete="street-address"
          />
          <button
            type="submit"
            className={`bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors whitespace-nowrap ${s.button}`}
          >
            Analyze
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-1.5 pl-1">{error}</p>}
      </form>
    </div>
  );
}
