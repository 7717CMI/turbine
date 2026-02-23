'use client'

import { useState, useEffect } from 'react'
import { useDashboardStore } from '@/lib/store'
import { BusinessTypeFilter } from './BusinessTypeFilter'
import { X, Plus } from 'lucide-react'

interface SelectedSegmentItem {
  type: string
  segment: string
  id: string
}

export function CompactFilterPanel() {
  const { data, filters, updateFilters } = useDashboardStore()
  const [selectedSegmentType, setSelectedSegmentType] = useState<string>(
    filters.segmentType || (data?.dimensions?.segments ? Object.keys(data.dimensions.segments)[0] : 'By Turbine Type')
  )
  const [selectedSegments, setSelectedSegments] = useState<SelectedSegmentItem[]>([])
  const [currentSegmentSelection, setCurrentSegmentSelection] = useState<string>('')

  // Update when filters change
  useEffect(() => {
    if (filters.segmentType) {
      setSelectedSegmentType(filters.segmentType)
    } else if (data?.dimensions?.segments) {
      const firstSegmentType = Object.keys(data.dimensions.segments)[0]
      setSelectedSegmentType(firstSegmentType)
    }
  }, [filters.segmentType, data])
  
  // Check if this segment type has B2B/B2C segmentation
  const segmentDimension = data?.dimensions?.segments?.[selectedSegmentType]
  const hasB2BSegmentation = segmentDimension && (
    (segmentDimension.b2b_hierarchy && Object.keys(segmentDimension.b2b_hierarchy).length > 0) ||
    (segmentDimension.b2c_hierarchy && Object.keys(segmentDimension.b2c_hierarchy).length > 0) ||
    (segmentDimension.b2b_items && segmentDimension.b2b_items.length > 0) ||
    (segmentDimension.b2c_items && segmentDimension.b2c_items.length > 0)
  )
  
  // Clear selected segments when business type changes and segment type has B2B/B2C
  useEffect(() => {
    if (hasB2BSegmentation && selectedSegments.length > 0) {
      // Clear segments when business type changes for this segment type
      setSelectedSegments([])
      setCurrentSegmentSelection('')
    }
  }, [filters.businessType, selectedSegmentType, hasB2BSegmentation, selectedSegments.length])

  if (!data) return null

  // Use business-type specific hierarchy if available, otherwise use main hierarchy
  let hierarchy = segmentDimension?.hierarchy || {}
  if (hasB2BSegmentation) {
    if (filters.businessType === 'B2B' && segmentDimension?.b2b_hierarchy) {
      hierarchy = segmentDimension.b2b_hierarchy
    } else if (filters.businessType === 'B2C' && segmentDimension?.b2c_hierarchy) {
      hierarchy = segmentDimension.b2c_hierarchy
    }
  }
  
  // Filter available segments based on business type hierarchy
  // Use the business-type specific items array if available (from new API)
  let availableSegments: string[] = []
  if (hasB2BSegmentation && (filters.businessType === 'B2B' || filters.businessType === 'B2C')) {
    // Use the business-type specific items array from API if available
    if (filters.businessType === 'B2B' && segmentDimension?.b2b_items) {
      availableSegments = segmentDimension.b2b_items
    } else if (filters.businessType === 'B2C' && segmentDimension?.b2c_items) {
      availableSegments = segmentDimension.b2c_items
      } else {
        // Fallback: Extract all items from the business-type specific hierarchy ONLY
        // Use array instead of Set to preserve intentional duplicates from JSON
        const allHierarchyItems: string[] = []
        
        // Only process the selected business type hierarchy
        const businessTypeRoot = filters.businessType
        if (hierarchy[businessTypeRoot]) {
          // Add root children - preserve duplicates if present
          hierarchy[businessTypeRoot].forEach(item => allHierarchyItems.push(item))
          
          // Recursively add all descendants - preserve duplicates
          const addDescendants = (parent: string) => {
            if (hierarchy[parent]) {
              hierarchy[parent].forEach(child => {
                allHierarchyItems.push(child) // Allow duplicates
                addDescendants(child)
              })
            }
          }
          hierarchy[businessTypeRoot].forEach(rootChild => addDescendants(rootChild))
        }
        
        // Also add all keys from hierarchy that are not the business type root
        Object.keys(hierarchy).forEach(key => {
          if (key !== businessTypeRoot && key !== 'B2B' && key !== 'B2C') {
            allHierarchyItems.push(key) // Allow duplicates
          }
        })
        
        availableSegments = allHierarchyItems // Preserve duplicates from JSON
      }
  } else {
    availableSegments = segmentDimension?.items || []
  }
  
  // Get all available segment types
  const allSegmentTypes = Object.keys(data.dimensions.segments)
  const segmentTypes = allSegmentTypes
  
  // Build hierarchical options for the select
  const getHierarchicalOptions = () => {
    const options: Array<{value: string, label: string, level: number, uniqueKey: string}> = []
    const processed = new Set<string>()
    
    const addWithChildren = (segment: string, level: number, parentPath: string[] = []) => {
      // Create unique identifier based on segment and parent path to allow duplicates
      const uniqueId = `${segment}::${parentPath.join('::')}`
      if (processed.has(uniqueId)) return
      processed.add(uniqueId)
      
      // Get children - check for context-specific key first, then fallback to base key
      const contextKey = parentPath.length > 0 ? `${segment}::${parentPath.join('::')}` : segment
      const children = hierarchy[contextKey] || hierarchy[segment] || []
      
      const prefix = level > 0 ? '  '.repeat(level) + '└ ' : ''
      options.push({ 
        value: segment, 
        label: prefix + segment,
        level,
        uniqueKey: uniqueId
      })
      
      // Recursively add all children
      if (children.length > 0) {
        const newParentPath = [...parentPath, segment]
        children.forEach((child: string) => {
          addWithChildren(child, level + 1, newParentPath)
        })
      }
    }
    
    // Find root segments
    const allChildren = new Set(Object.values(hierarchy).flat())
    let roots: string[] = []
    
    // For B2B/B2C hierarchies, skip the business type root and start from its children
    if (hasB2BSegmentation && (filters.businessType === 'B2B' || filters.businessType === 'B2C')) {
      const businessTypeRoot = filters.businessType
      if (hierarchy[businessTypeRoot] && hierarchy[businessTypeRoot].length > 0) {
        // Start from the children of B2B/B2C instead of B2B/B2C itself
        roots = hierarchy[businessTypeRoot]
      } else {
        // Fallback: find segments that are parents but not children
        Object.keys(hierarchy).forEach(parent => {
          if (!allChildren.has(parent)) {
            roots.push(parent)
          }
        })
      }
    } else {
      // Parents that aren't children
      Object.keys(hierarchy).forEach(parent => {
        if (!allChildren.has(parent)) {
          roots.push(parent)
        }
      })
      
      // Standalone segments
      availableSegments.forEach((segment: string) => {
        if (!allChildren.has(segment) && !hierarchy[segment]) {
          roots.push(segment)
        }
      })
    }
    
    // Sort roots
    roots.sort((a, b) => a.localeCompare(b))
    
    roots.forEach(root => addWithChildren(root, 0, []))
    
    return options.length > 0 ? options : availableSegments.map((s: string, index: number) => ({ value: s, label: s, level: 0, uniqueKey: `${s}::${index}` }))
  }
  
  const hierarchicalOptions = getHierarchicalOptions()

  const handleAddSegment = () => {
    if (!currentSegmentSelection) return
    
    const id = `${selectedSegmentType}::${currentSegmentSelection}`
    const exists = selectedSegments.find(s => s.id === id)
    
    if (!exists) {
      const newSegment = { type: selectedSegmentType, segment: currentSegmentSelection, id }
      const updated = [...selectedSegments, newSegment]
      setSelectedSegments(updated)
      updateFilters({ 
        segments: updated.map(s => s.segment),
        segmentType: selectedSegmentType,
        advancedSegments: updated
      } as any)
    }
    setCurrentSegmentSelection('')
  }

  const handleRemoveSegment = (id: string) => {
    const updated = selectedSegments.filter(s => s.id !== id)
    setSelectedSegments(updated)
    updateFilters({ 
      segments: updated.map(s => s.segment),
      advancedSegments: updated
    } as any)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-3 space-y-2.5">
      {/* Data Type */}
      <div>
        <label className="text-xs font-medium text-black">Data Type</label>
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => updateFilters({ dataType: 'value' })}
            className={`flex-1 px-2 py-1 text-xs rounded ${
              filters.dataType === 'value'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-black hover:bg-gray-200'
            }`}
          >
            Value
          </button>
          <button
            onClick={() => updateFilters({ dataType: 'volume' })}
            className={`flex-1 px-2 py-1 text-xs rounded ${
              filters.dataType === 'volume'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-black hover:bg-gray-200'
            }`}
          >
            Volume
          </button>
        </div>
      </div>

      {/* View Mode */}
      <div>
        <label className="text-xs font-medium text-black">View Mode</label>
        <select
          value={filters.viewMode}
          onChange={(e) => updateFilters({ viewMode: e.target.value as any })}
          className="w-full px-2 py-1 text-xs text-black border border-gray-300 rounded mt-1"
        >
          <option value="segment-mode">Segment Mode</option>
          <option value="geography-mode">Geography Mode</option>
          <option value="matrix">Matrix View</option>
        </select>
        <p className="text-xs text-black mt-0.5">
          {filters.viewMode === 'segment-mode' 
            ? 'Compare segments across geographies'
            : filters.viewMode === 'geography-mode'
            ? 'Compare geographies across segments'
            : 'Multiple geographies × segments'}
        </p>
      </div>


      {/* Geography Selection */}
      <div>
        <label className="text-xs font-medium text-black">Geography Selection</label>
        <select
          multiple
          value={filters.geographies}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, option => option.value)
            updateFilters({ geographies: selected })
          }}
          className="w-full px-2 py-1 text-xs text-black border border-gray-300 rounded mt-1"
          size={3}
        >
          {data.dimensions.geographies.global && data.dimensions.geographies.global.length > 0 && (
            <option value={data.dimensions.geographies.global[0]}>{data.dimensions.geographies.global[0]}</option>
          )}
          {data.dimensions.geographies.regions.map(region => (
            <optgroup key={region} label={region}>
              <option value={region}>{region}</option>
              {data.dimensions.geographies.countries[region]?.map(country => (
                <option key={country} value={country}>  {country}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-xs text-black mt-0.5">
          {filters.geographies.length} selected
          {filters.geographies.length > 0 && (
            <button
              onClick={() => updateFilters({ geographies: [] })}
              className="ml-2 text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          )}
        </p>

        {/* Selected Geographies Pills */}
        {filters.geographies.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {filters.geographies.map(geo => (
              <span
                key={geo}
                className="inline-flex items-center px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded"
              >
                {geo}
                <X 
                  className="h-2.5 w-2.5 ml-1 cursor-pointer hover:text-blue-900"
                  onClick={() => {
                    const updated = filters.geographies.filter(g => g !== geo)
                    updateFilters({ geographies: updated })
                  }}
                />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Business Type Filter */}
      <div className="border-t pt-2 mt-2">
        <BusinessTypeFilter />
      </div>

      {/* Segment Selection */}
      <div>
        <label className="text-xs font-medium text-black">Segment Selection (Multi-Type)</label>
        <div className="space-y-1 mt-1">
          <div className="flex gap-1">
            <select
              value={selectedSegmentType}
              onChange={(e) => {
                const newSegmentType = e.target.value
                setSelectedSegmentType(newSegmentType)
                setCurrentSegmentSelection('')
                // Update store - this will trigger save/restore of geography filters
                updateFilters({ 
                  segmentType: newSegmentType,
                  segments: [] // Clear segments when type changes
                })
              }}
              className="flex-1 px-2 py-1 text-xs text-black border border-gray-300 rounded"
            >
              {segmentTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <select
              value={currentSegmentSelection}
              onChange={(e) => setCurrentSegmentSelection(e.target.value)}
              className="flex-1 px-2 py-1 text-xs text-black border border-gray-300 rounded"
            >
              <option value="">Select...</option>
              {hierarchicalOptions.map((option) => (
                <option 
                  key={option.uniqueKey} 
                  value={option.value}
                  style={{ fontWeight: hierarchy[option.value] ? 'bold' : 'normal' }}
                >
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddSegment}
              disabled={!currentSegmentSelection}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          
          <p className="text-xs text-black">
            💡 You can select segments from different types. Select type → pick segment → add → repeat with different type for cross-type comparison.
          </p>

          {/* Selected Segments */}
          {selectedSegments.length > 0 && (
            <div className="space-y-1 mt-1">
              {selectedSegments.map(seg => (
                <div
                  key={seg.id}
                  className="flex items-center justify-between p-1 bg-green-50 rounded text-xs"
                >
                  <span>
                    <span className="text-green-600">{seg.type}:</span>
                    <span className="text-black ml-1">{seg.segment}</span>
                  </span>
                  <X 
                    className="h-2.5 w-2.5 text-green-600 cursor-pointer hover:text-green-800"
                    onClick={() => handleRemoveSegment(seg.id)}
                  />
                </div>
              ))}
              <button
                onClick={() => {
                  setSelectedSegments([])
                  updateFilters({ segments: [], advancedSegments: [] } as any)
                }}
                className="text-xs text-green-600 hover:text-green-800"
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Year Range */}
      <div>
        <label className="text-xs font-medium text-black">Year Range</label>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
            {filters.yearRange[0]}
          </span>
          <input
            type="range"
            min={data.metadata.start_year}
            max={data.metadata.forecast_year}
            value={filters.yearRange[0]}
            onChange={(e) => updateFilters({ 
              yearRange: [parseInt(e.target.value), filters.yearRange[1]] 
            })}
            className="flex-1 h-1"
          />
          <input
            type="range"
            min={data.metadata.start_year}
            max={data.metadata.forecast_year}
            value={filters.yearRange[1]}
            onChange={(e) => updateFilters({ 
              yearRange: [filters.yearRange[0], parseInt(e.target.value)] 
            })}
            className="flex-1 h-1"
          />
          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
            {filters.yearRange[1]}
          </span>
        </div>
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => {
              const hy = data.metadata.historical_years
              if (hy?.length) {
                updateFilters({ yearRange: [hy[0], hy[hy.length - 1]] })
              }
            }}
            className="flex-1 text-xs px-2 py-0.5 bg-gray-100 rounded hover:bg-gray-200"
          >
            Historical
          </button>
          <button
            onClick={() => {
              const fy = data.metadata.forecast_years
              if (fy?.length) {
                updateFilters({ yearRange: [fy[0], fy[fy.length - 1]] })
              }
            }}
            className="flex-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Forecast
          </button>
          <button
            onClick={() => updateFilters({ 
              yearRange: [data.metadata.start_year, data.metadata.forecast_year] 
            })}
            className="flex-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
          >
            All Years
          </button>
        </div>
        <p className="text-xs text-black text-center mt-1">
          {filters.yearRange[1] - filters.yearRange[0] + 1} years
        </p>
      </div>
    </div>
  )
}
