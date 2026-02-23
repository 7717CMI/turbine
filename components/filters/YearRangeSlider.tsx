'use client'

import { useDashboardStore } from '@/lib/store'

export function YearRangeSlider() {
  const { data, filters, updateFilters } = useDashboardStore()

  if (!data) return null

  const { start_year, forecast_year, base_year } = data.metadata
  
  // Ensure we have valid year values
  if (!start_year || !forecast_year || !base_year) {
    return null
  }
  
  const [minYear, maxYear] = filters.yearRange

  const handleMinChange = (value: number) => {
    if (value <= maxYear) {
      updateFilters({ yearRange: [value, maxYear] })
    }
  }

  const handleMaxChange = (value: number) => {
    if (value >= minYear) {
      updateFilters({ yearRange: [minYear, value] })
    }
  }

  const setPredefinedRange = (range: 'historical' | 'forecast' | 'all') => {
    const { historical_years, forecast_years } = data.metadata
    switch (range) {
      case 'historical':
        if (historical_years?.length) {
          updateFilters({ yearRange: [historical_years[0], historical_years[historical_years.length - 1]] })
        }
        break
      case 'forecast':
        if (forecast_years?.length) {
          updateFilters({ yearRange: [forecast_years[0], forecast_years[forecast_years.length - 1]] })
        }
        break
      case 'all':
        updateFilters({ yearRange: [start_year, forecast_year] })
        break
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-black">
        Year Range
      </label>

      {/* Predefined Range Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setPredefinedRange('historical')}
          className="px-3 py-1 text-xs bg-gray-100 text-black rounded hover:bg-gray-200"
        >
          Historical
        </button>
        <button
          onClick={() => setPredefinedRange('forecast')}
          className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
        >
          Forecast
        </button>
        <button
          onClick={() => setPredefinedRange('all')}
          className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
        >
          All Years
        </button>
      </div>

      {/* Year Range Display */}
      <div className="text-center py-2 bg-blue-50 rounded-md">
        <span className="text-lg font-semibold text-blue-900">
          {minYear} - {maxYear}
        </span>
        <span className="text-xs text-blue-600 ml-2">
          ({maxYear - minYear + 1} years)
        </span>
      </div>

      {/* Dual Range Slider */}
      <div className="px-2">
        <div className="relative pt-2 pb-4">
          {/* Min Slider */}
          <div className="relative mb-8">
            <label className="text-xs text-black mb-1 block">From:</label>
            <input
              type="range"
              min={start_year}
              max={forecast_year}
              value={minYear}
              onChange={(e) => handleMinChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <span className="absolute -bottom-5 left-0 text-xs text-black">{start_year}</span>
            <span className="absolute -bottom-5 right-0 text-xs text-black">{forecast_year}</span>
          </div>

          {/* Max Slider */}
          <div className="relative">
            <label className="text-xs text-black mb-1 block">To:</label>
            <input
              type="range"
              min={start_year}
              max={forecast_year}
              value={maxYear}
              onChange={(e) => handleMaxChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Base Year Indicator */}
      <div className="text-xs text-black text-center">
        Base Year: <span className="font-medium text-black">2025</span>
      </div>
    </div>
  )
}

