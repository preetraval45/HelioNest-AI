"use client";

export default function PropertySkeleton() {
  return (
    <div className="animate-pulse px-6 py-8 max-w-4xl mx-auto">
      {/* Address header */}
      <div className="mb-6">
        <div className="h-7 bg-gray-200 rounded-lg w-3/4 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-3/4" />
          </div>
        ))}
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-3 bg-gray-100 rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 h-48" />
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 h-32" />
          <div className="bg-white rounded-2xl border border-gray-100 p-6 h-32" />
        </div>
      </div>
    </div>
  );
}
