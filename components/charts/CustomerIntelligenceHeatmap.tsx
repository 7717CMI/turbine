'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useDashboardStore } from '@/lib/store'
import { 
  loadCustomerIntelligenceData,
  getCustomersForCell,
  getCustomerCountForCell,
  type CustomerIntelligenceData,
  type Customer
} from '@/lib/customer-intelligence-data'
import { convertCustomerDataToIntelligenceFormat } from '@/lib/intelligence-data-converter'

interface CustomerIntelligenceHeatmapProps {
  title?: string
  height?: number
  filePath?: string // Optional file path for dynamic loading (for dashboard builder)
}

interface CustomerDetailModalProps {
  isOpen: boolean
  onClose: () => void
  customers: Customer[]
  region: string
  industryCategory: string
}

function CustomerDetailModal({ isOpen, onClose, customers, region, industryCategory }: CustomerDetailModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-black">All Customers</h2>
            <p className="text-sm text-black mt-1">
              {region} - {industryCategory} ({customers.length} customers)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-black hover:text-black transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customers.map((customer) => (
              <div
                key={customer.id}
                className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-black">{customer.name}</h3>
                    <p className="text-sm text-black mt-1">{customer.region}</p>
                    <span className="inline-block mt-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                      {customer.endUserSegment}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#168AAD] text-white rounded-md hover:bg-[#1A759F] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export function CustomerIntelligenceHeatmap({ title, height = 600, filePath }: CustomerIntelligenceHeatmapProps) {
  const { data, customerIntelligenceData: manualCustomerData } = useDashboardStore()
  const [hoveredCell, setHoveredCell] = useState<{ 
    region: string
    endUserSegment: string
    count: number
    x: number
    y: number
  } | null>(null)
  const [selectedCell, setSelectedCell] = useState<{
    region: string
    endUserSegment: string
    customers: Customer[]
  } | null>(null)
  const [isTooltipHovered, setIsTooltipHovered] = useState(false)
  const [customerData, setCustomerData] = useState<CustomerIntelligenceData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load customer intelligence data - check manual input first, then API
  useEffect(() => {
    const abortController = new AbortController()
    let isMounted = true
    
    async function loadData() {
      try {
        // Check if component is still mounted before starting
        if (!isMounted || abortController.signal.aborted) return
        
        setIsLoading(true)
        setLoadError(null)
        
        // First, check if we have manual input data
        console.log('🔍 CustomerIntelligenceHeatmap: Checking for manual data', {
          hasData: !!manualCustomerData,
          dataLength: manualCustomerData?.length,
          dataSample: manualCustomerData?.[0]
        })
        
        if (manualCustomerData && manualCustomerData.length > 0) {
          console.log('✅ Found manual customer data, converting...')
          const convertedData = convertCustomerDataToIntelligenceFormat(manualCustomerData)
          console.log('📊 Converted customer data:', {
            regionCount: convertedData.length,
            sample: convertedData[0]
          })
          
          if (isMounted && !abortController.signal.aborted) {
            setCustomerData(convertedData)
            setIsLoading(false)
            console.log('✅ Customer data loaded successfully')
          }
          return
        }
        
        console.log('⚠️ No manual customer data found, loading from API...')
        
        // Otherwise, load from API
        const loadedData = await loadCustomerIntelligenceData(filePath)
        
        // Only update state if component is still mounted and not aborted
        if (isMounted && !abortController.signal.aborted) {
          setCustomerData(loadedData)
          setIsLoading(false)
        }
      } catch (error) {
        // Only handle error if component is still mounted
        if (isMounted && !abortController.signal.aborted) {
          console.error('Error loading customer intelligence data:', error)
          const errorMessage = error instanceof Error ? error.message : 'Failed to load customer intelligence data'
          setLoadError(errorMessage)
          setIsLoading(false)
        }
      }
    }
    
    // Small delay to ensure component is fully mounted (helps with HMR)
    const timeoutId = setTimeout(() => {
      if (isMounted && !abortController.signal.aborted) {
        loadData()
      }
    }, 10)
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false
      abortController.abort()
      clearTimeout(timeoutId)
    }
  }, [filePath, manualCustomerData]) // Reload when filePath or manual data changes

  // Get regions and industry categories from loaded customer data or dashboard data
  const { regions, endUserSegments } = useMemo(() => {
    // Default regions and segments if data is not available
    const defaultRegions = [
      'North America',
      'Latin America',
      'Europe',
      'Asia Pacific',
      'Middle East & Africa'
    ]
    
    const defaultSegments = [
      'Impulse Turbines',
      'Reaction Turbines',
      'Combined Cycle Turbines',
      'Cogeneration Turbines'
    ]

    // First, try to extract regions and segments from loaded customer data
    if (customerData.length > 0) {
      const uniqueRegions = [...new Set(customerData.map(d => d.region))].filter(r => r && r !== 'Unknown')
      const uniqueSegments = [...new Set(customerData.map(d => d.endUserSegment))].filter(s => s && s !== 'Unknown')
      
      if (uniqueRegions.length > 0 && uniqueSegments.length > 0) {
        return {
          regions: uniqueRegions.sort(),
          endUserSegments: uniqueSegments.sort()
        }
      }
    }

    // Fall back to dashboard data if available
    if (data) {
      // Get regions from dimensions
      const allRegions = data.dimensions.geographies.regions || defaultRegions
      
      // Get segments from first available dimension
      const firstSegType = Object.keys(data.dimensions.segments)[0] || 'By Turbine Type'
      const endUserDimension = data.dimensions.segments[firstSegType]
      const segments = endUserDimension?.items || []

      const allSegments = segments.length > 0 ? [...segments] : [...defaultSegments]

      return {
        regions: allRegions.length > 0 ? allRegions : defaultRegions,
        endUserSegments: allSegments.length > 0 ? allSegments : defaultSegments
      }
    }

    // Final fallback to defaults
    return { regions: defaultRegions, endUserSegments: defaultSegments }
  }, [customerData, data])

  // Calculate color intensity based on customer count using palette colors
  const getColor = useCallback((count: number, maxCount: number) => {
    if (count === 0) return 'bg-gray-50'
    if (maxCount === 0) return 'bg-[#52B69A]'
    
    const intensity = (count / maxCount) * 100
    
    if (intensity < 20) return 'bg-[#D9ED92]'  // Yellow Green
    if (intensity < 40) return 'bg-[#B5E48C]'  // Light Lime
    if (intensity < 60) return 'bg-[#52B69A]'  // Teal
    if (intensity < 80) return 'bg-[#168AAD]'  // Deep Teal
    return 'bg-[#1A759F]'  // Blue Teal
  }, [])

  // Get max count for color scaling
  const maxCount = useMemo(() => {
    let max = 0
    endUserSegments.forEach(segment => {
    regions.forEach(region => {
        const count = getCustomerCountForCell(customerData, region, segment)
        max = Math.max(max, count)
      })
    })
    return max
  }, [regions, endUserSegments, customerData])

  // Handle cell click
  const handleCellClick = useCallback((region: string, endUserSegment: string) => {
    const customers = getCustomersForCell(customerData, region, endUserSegment)
    setSelectedCell({ region, endUserSegment, customers })
  }, [customerData])

  // Clear timeout when component unmounts
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  // Handle mouse leave from cell with delay
  const handleCellMouseLeave = useCallback(() => {
    // Clear any existing timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
    }
    
    // Only close if tooltip is not being hovered
    closeTimeoutRef.current = setTimeout(() => {
      if (!isTooltipHovered) {
        setHoveredCell(null)
      }
    }, 200) // 200ms delay
  }, [isTooltipHovered])

  // Handle mouse enter on tooltip
  const handleTooltipMouseEnter = useCallback(() => {
    setIsTooltipHovered(true)
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  // Handle mouse leave from tooltip
  const handleTooltipMouseLeave = useCallback(() => {
    setIsTooltipHovered(false)
    // Close tooltip after a short delay
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredCell(null)
    }, 150)
  }, [])

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#168AAD] mx-auto mb-4"></div>
          <p className="text-black">Loading customer intelligence data...</p>
        </div>
      </div>
    )
  }

  // Show error state
  if (loadError) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-red-600 mb-2">Error loading data</p>
          <p className="text-sm text-gray-600">{loadError}</p>
        </div>
      </div>
    )
  }

  // Show empty state if no data
  if (customerData.length === 0 || regions.length === 0 || endUserSegments.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-black">No data to display</p>
          <p className="text-sm text-black mt-1">
            Customer intelligence data is not available
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-black">
          {title || 'Customer Intelligence - Industry Category × Region'}
        </h3>
        <p className="text-xs text-black mt-0.5">
          Number of customers by Industry Category and Region
        </p>
      </div>

      <div className="overflow-auto" style={{ maxHeight: height }}>
        <div className="inline-block min-w-full">
          {/* Header row with Regions */}
          <div className="flex">
            <div className="w-32 p-2 bg-gray-100 border border-gray-300 font-medium text-xs">
              Industry Category \ Region
            </div>
            {regions.map(region => (
              <div
                key={region}
                className="w-28 p-2 bg-gray-100 border border-gray-300 text-xs font-medium text-center truncate"
                title={region}
              >
                {region}
              </div>
            ))}
          </div>

          {/* Data rows - Industry Categories */}
          {endUserSegments.map((endUserSegment) => (
            <div key={endUserSegment} className="flex">
              <div className="w-32 p-2 bg-gray-100 border border-gray-300 font-medium text-xs truncate" title={endUserSegment}>
                {endUserSegment}
              </div>
              {regions.map((region) => {
                const count = getCustomerCountForCell(customerData, region, endUserSegment)
                const customers = getCustomersForCell(customerData, region, endUserSegment)
                
                return (
                  <div
                    key={`${region}-${endUserSegment}`}
                    className={`w-28 p-2 border border-gray-300 text-center cursor-pointer transition-all hover:opacity-80 hover:shadow-md ${getColor(count, maxCount)}`}
                    onClick={() => handleCellClick(region, endUserSegment)}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setHoveredCell({
                        region,
                        endUserSegment,
                        count,
                        x: rect.left + rect.width / 2,
                        y: rect.top - 10
                      })
                    }}
                    onMouseLeave={handleCellMouseLeave}
                  >
                    <span className="text-xs font-semibold text-black">
                      {count.toLocaleString()}
                    </span>
                    <div className="text-[10px] mt-0.5 opacity-75">
                      customers
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Custom Tooltip */}
      {hoveredCell && (() => {
        const customers = getCustomersForCell(customerData, hoveredCell.region, hoveredCell.endUserSegment)
        const displayCustomers = customers.slice(0, 5)
        const hasMore = customers.length > 5

        return (
          <div
            className="fixed bg-white p-4 border border-gray-200 rounded-lg shadow-xl z-50 pointer-events-auto min-w-[320px] max-w-[400px]"
            style={{
              left: `${hoveredCell.x}px`,
              top: `${hoveredCell.y}px`,
              transform: 'translate(-50%, -100%)',
              marginTop: '-10px' // Add some space above tooltip
            }}
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
          >
            <p className="font-semibold text-black mb-3 pb-2 border-b border-gray-200">
              Customer Intelligence
            </p>
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-black">Region:</span>
                <span className="text-sm font-medium text-black">{hoveredCell.region}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-black">Industry Category:</span>
                <span className="text-sm font-medium text-black">{hoveredCell.endUserSegment}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-black">Total Customers:</span>
                <span className="text-sm font-semibold text-[#168AAD]">
                  {hoveredCell.count.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Customer List (max 5) */}
            {displayCustomers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-medium text-black mb-2">Sample Customers:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {displayCustomers.map((customer) => (
                    <div key={customer.id} className="text-xs text-black py-1">
                      • {customer.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explore All Link */}
            {hasMore && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <button
                  onClick={() => {
                    setSelectedCell({
                      region: hoveredCell.region,
                      endUserSegment: hoveredCell.endUserSegment,
                      customers
                    })
                    setHoveredCell(null)
                    setIsTooltipHovered(false)
                  }}
                  className="w-full px-3 py-2 bg-[#168AAD] hover:bg-[#1A759F] text-white text-xs font-semibold rounded-md transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>Explore All {hoveredCell.count.toLocaleString()} Customers</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* Customer Detail Modal */}
      {selectedCell && (
        <CustomerDetailModal
          isOpen={!!selectedCell}
          onClose={() => setSelectedCell(null)}
          customers={selectedCell.customers}
          region={selectedCell.region}
          industryCategory={selectedCell.endUserSegment}
        />
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center space-x-3">
        <span className="text-xs text-black">Low</span>
        <div className="flex space-x-0.5">
          <div className="w-5 h-5 bg-[#D9ED92] rounded"></div>
          <div className="w-5 h-5 bg-[#B5E48C] rounded"></div>
          <div className="w-5 h-5 bg-[#52B69A] rounded"></div>
          <div className="w-5 h-5 bg-[#168AAD] rounded"></div>
          <div className="w-5 h-5 bg-[#1A759F] rounded"></div>
        </div>
        <span className="text-xs text-black">High</span>
      </div>

      <div className="mt-2 text-center text-xs text-black">
        Comparing {endUserSegments.length} industry categories &times; {regions.length} regions
      </div>
    </div>
  )
}

export default CustomerIntelligenceHeatmap
