'use client'

import { useState, useEffect } from 'react'
import { useDashboardStore } from '@/lib/store'
import { GeographyMultiSelect } from './GeographyMultiSelect'
import { BusinessTypeFilter } from './BusinessTypeFilter'
import { YearRangeSlider } from './YearRangeSlider'
import { AggregationLevelSelector } from './AggregationLevelSelector'
import { CascadeFilter } from './CascadeFilter'
import { X, Plus, MapPin, Tag } from 'lucide-react'

interface SelectedSegmentItem {
  type: string
  segment: string
  id: string
}

export function EnhancedFilterPanel() {
  const { data, filters, updateFilters } = useDashboardStore()
  const [selectedSegmentType, setSelectedSegmentType] = useState<string>(
    filters.segmentType || (data?.dimensions?.segments ? Object.keys(data.dimensions.segments)[0] : 'By Turbine Type')
  )
  const [selectedSegments, setSelectedSegments] = useState<SelectedSegmentItem[]>([])
  const [currentSegmentSelection, setCurrentSegmentSelection] = useState<string>('')
  const [cascadePath, setCascadePath] = useState<string[]>([])

  // Initialize selectedSegments from store filters when data loads
  useEffect(() => {
    if (data && filters.segments && filters.segments.length > 0 && filters.segmentType) {
      // Convert store segments to SelectedSegmentItem format
      // Deduplicate segments to prevent duplicate keys
      const seen = new Set<string>()
      const segmentsFromStore: SelectedSegmentItem[] = []
      
      filters.segments.forEach((segment) => {
        const id = `${filters.segmentType}::${segment}`
        // Only add if we haven't seen this segment+type combination
        if (!seen.has(id)) {
          seen.add(id)
          segmentsFromStore.push({
            type: filters.segmentType,
            segment: segment,
            id: id
          })
        }
      })
      
      setSelectedSegments(segmentsFromStore)
    }
  }, [data, filters.segments, filters.segmentType])

  // Update when filters change
  useEffect(() => {
    if (filters.segmentType) {
      setSelectedSegmentType(filters.segmentType)
    } else if (data?.dimensions?.segments) {
      const firstSegmentType = Object.keys(data.dimensions.segments)[0]
      setSelectedSegmentType(firstSegmentType)
    }
  }, [filters.segmentType, data])

  // When switching data type (value/volume), keep the current segment type if it exists in both datasets
  // This allows seamless switching between value and volume data for the same segment types
  useEffect(() => {
    // No need to reset segment type - allow all segment types for both value and volume
    // The data processor handles both datasets with the same segment types
  }, [filters.dataType])
  
  // Clear selected segments when business type changes and segment type has B2B/B2C
  const segmentDimension = data?.dimensions?.segments?.[selectedSegmentType]
  const hasB2BSegmentation = segmentDimension && (
    (segmentDimension.b2b_hierarchy && Object.keys(segmentDimension.b2b_hierarchy).length > 0) ||
    (segmentDimension.b2c_hierarchy && Object.keys(segmentDimension.b2c_hierarchy).length > 0) ||
    (segmentDimension.b2b_items && segmentDimension.b2b_items.length > 0) ||
    (segmentDimension.b2c_items && segmentDimension.b2c_items.length > 0)
  )
  
  useEffect(() => {
    if (hasB2BSegmentation && selectedSegments.length > 0) {
      // Clear segments when business type changes for this segment type
      setSelectedSegments([])
      setCurrentSegmentSelection('')
    }
  }, [filters.businessType, selectedSegmentType, hasB2BSegmentation, selectedSegments.length])

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
    // Use items array from segment dimension, or extract from hierarchy if items is empty
    availableSegments = segmentDimension?.items || []
    
    // If items is empty but hierarchy exists, extract all segments from hierarchy
    if (availableSegments.length === 0 && hierarchy && Object.keys(hierarchy).length > 0) {
      const allSegmentsFromHierarchy = new Set<string>()
      // Add all keys (parents)
      Object.keys(hierarchy).forEach(key => allSegmentsFromHierarchy.add(key))
      // Add all values (children)
      Object.values(hierarchy).forEach((children: any) => {
        if (Array.isArray(children)) {
          children.forEach((child: string) => allSegmentsFromHierarchy.add(child))
        }
      })
      availableSegments = Array.from(allSegmentsFromHierarchy)
    }
  }
  
  // Build hierarchical options for the select (only used for flat segments fallback)
  // This function is now only used when there's no hierarchy, so we don't need complex recursion
  const getHierarchicalOptions = () => {
    // If no hierarchy and no available segments, return empty
    if (Object.keys(hierarchy).length === 0 && availableSegments.length === 0) {
      return []
    }
    
    // If hierarchy is empty, just return flat list from availableSegments
    if (Object.keys(hierarchy).length === 0) {
      // Deduplicate available segments
      const uniqueSegments = Array.from(new Set(availableSegments))
      return uniqueSegments.map((s: string, index: number) => ({ 
        value: s, 
        label: s, 
        level: 0, 
        isParent: false, 
        uniqueKey: `${s}::${index}` 
      }))
    }
    
    // For hierarchical data, we now use CascadeFilter, so return empty array
    // This prevents the infinite recursion issue
    return []
  }
  
  const hierarchicalOptions = getHierarchicalOptions()
  
  // Add segment to selection
  const handleAddSegment = () => {
    if (!currentSegmentSelection) return
    
    const id = `${selectedSegmentType}::${currentSegmentSelection}`
    // Check if this exact segment+type combination already exists
    const exists = selectedSegments.find(s => s.segment === currentSegmentSelection && s.type === selectedSegmentType)
    
    if (!exists) {
      const newSegment = {
        type: selectedSegmentType,
        segment: currentSegmentSelection,
        id: id
      }
      
      const updated = [...selectedSegments, newSegment]
      setSelectedSegments(updated)
      
      // Update store with segment names AND the full advanced segments data
      updateFilters({ 
        segments: updated.map(s => s.segment) || [],
        segmentType: selectedSegmentType || '', // Keep this for compatibility
        advancedSegments: updated || [], // Pass the full segment+type data
        aggregationLevel: filters.aggregationLevel !== undefined ? filters.aggregationLevel : null // Preserve aggregation level
      } as any)
    }
    
    // Clear current selection after adding
    setCurrentSegmentSelection('')
  }

  // Remove a segment
  const handleRemoveSegment = (id: string) => {
    const updated = selectedSegments.filter(s => s.id !== id)
    setSelectedSegments(updated)
    updateFilters({ 
      segments: updated.map(s => s.segment) || [],
      advancedSegments: updated || [], // Pass the full segment+type data
      aggregationLevel: filters.aggregationLevel !== undefined ? filters.aggregationLevel : null // Preserve aggregation level
    } as any)
  }

  // Clear all segments
  const handleClearAllSegments = () => {
    setSelectedSegments([])
    setCurrentSegmentSelection('')
    updateFilters({ 
      segments: [], 
      advancedSegments: [],
      aggregationLevel: filters.aggregationLevel !== undefined ? filters.aggregationLevel : null // Preserve aggregation level
    } as any)
  }

  // Remove a geography
  const handleRemoveGeography = (geo: string) => {
    const updated = filters.geographies.filter(g => g !== geo)
    updateFilters({ geographies: updated })
  }

  // Clear all geographies
  const handleClearAllGeographies = () => {
    updateFilters({ geographies: [] })
  }

  if (!data) return null

  // Get all segment types
  // For volume mode, only show segment types that have actual volume records
  const allSegmentTypes = Object.keys(data.dimensions.segments)
  const segmentTypes = filters.dataType === 'volume'
    ? (() => {
        const volumeRecords = data.data.volume.geography_segment_matrix
        const volumeSegTypes = new Set(volumeRecords.map(r => r.segment_type))
        const filtered = allSegmentTypes.filter(type => volumeSegTypes.has(type))
        return filtered.length > 0 ? filtered : allSegmentTypes
      })()
    : allSegmentTypes

  return (
    <div className="bg-white rounded-lg shadow-sm p-2.5 space-y-2">
      {/* Data Type Selection */}
      <div>
        <label className="text-xs font-medium text-black uppercase">
          Data Type
        </label>
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => updateFilters({ dataType: 'value' })}
            className={`flex-1 px-3 py-1.5 text-sm rounded ${
              filters.dataType === 'value'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-black hover:bg-gray-200'
            }`}
          >
            Value
          </button>
          <button
            onClick={() => updateFilters({ dataType: 'volume' })}
            className={`flex-1 px-3 py-1.5 text-sm rounded ${
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
        <label className="text-xs font-medium text-black uppercase">
          View Mode
        </label>
        <select
          value={filters.viewMode}
          onChange={(e) => updateFilters({ viewMode: e.target.value as any })}
          className="w-full px-2 py-1.5 text-sm text-black border border-gray-300 rounded mt-1"
        >
          <option value="segment-mode">Segment Mode</option>
          <option value="geography-mode">Geography Mode</option>
          <option value="matrix">Matrix View</option>
        </select>
      </div>

      {/* Geography Selection */}
      <div className="border-t pt-2.5">
        <label className="text-xs font-medium text-black uppercase mb-2 block">
          Geography Selection
        </label>
        <GeographyMultiSelect />
        
        {/* Selected Geographies Display */}
        {filters.geographies.length > 0 && (
          <div className="mt-2 p-1.5 bg-blue-50 rounded">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center text-xs font-medium text-blue-900">
                <MapPin className="h-3 w-3 mr-1" />
                Selected ({filters.geographies.length})
              </div>
              <button
                onClick={handleClearAllGeographies}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear All
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {filters.geographies.map(geo => (
                <span
                  key={geo}
                  className="inline-flex items-center px-1.5 py-0.5 text-xs bg-white text-blue-800 rounded border border-blue-200"
                >
                  {geo}
                  <button
                    onClick={() => handleRemoveGeography(geo)}
                    className="ml-1 hover:text-blue-900"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Business Type Filter */}
      <div className="border-t pt-4">
        <BusinessTypeFilter />
      </div>

      {/* Segment Selection Section */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-black uppercase">
          Segment Selection (Multi-Type)
        </div>
        
        {/* Segment Type Selector */}
        <div>
          <label className="block text-xs text-black mb-1">
            Step 1: Select Segment Type
          </label>
          <select
            value={selectedSegmentType}
            onChange={(e) => {
              const newSegmentType = e.target.value
              setSelectedSegmentType(newSegmentType)
              setCurrentSegmentSelection('') // Clear selection when type changes
              setCascadePath([]) // Clear cascade path when type changes
              // Update store - this will trigger save/restore of geography filters
              updateFilters({ 
                segmentType: newSegmentType,
                segments: [] // Clear segments when type changes
              })
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
          >
            {segmentTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Cascade Filter - Step 2 */}
        <div>
          <label className="block text-xs text-black mb-1">
            Step 2: Select Segment from {selectedSegmentType}
          </label>
          {Object.keys(hierarchy).length === 0 && availableSegments.length === 0 ? (
            <div className="w-full px-3 py-2 border border-yellow-300 rounded-md mb-2 bg-yellow-50 text-yellow-800 text-sm">
              ⚠️ No segments available for this segment type. Please check your data structure.
            </div>
          ) : Object.keys(hierarchy).length === 0 && availableSegments.length > 0 ? (
            // Fallback for flat segments (no hierarchy)
            <>
              <select
                value={currentSegmentSelection}
                onChange={(e) => setCurrentSegmentSelection(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-black"
              >
                <option value="">Select a segment...</option>
                {availableSegments.map((segment) => (
                  <option key={segment} value={segment}>
                    {segment}
                  </option>
                ))}
              </select>
              
              <button
                onClick={handleAddSegment}
                disabled={!currentSegmentSelection}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Selected Segment</span>
              </button>
            </>
          ) : (
            // Hierarchical segments - use cascade filter
            <>
              <CascadeFilter
                hierarchy={hierarchy}
                selectedPath={cascadePath}
                onSelectionChange={(path) => {
                  setCascadePath(path)
                  // Update currentSegmentSelection to the last item in path for compatibility
                  if (path.length > 0) {
                    setCurrentSegmentSelection(path[path.length - 1])
                  } else {
                    setCurrentSegmentSelection('')
                  }
                }}
                maxLevels={5}
                placeholder="Select sub-segment 1..."
              />
              
              {/* Add Button - Only show if a path is selected */}
              {cascadePath.length > 0 && (
                <button
                  onClick={() => {
                    // Use the last item in the path as the segment
                    const segmentToAdd = cascadePath[cascadePath.length - 1]
                    if (segmentToAdd) {
                      const id = `${selectedSegmentType}::${segmentToAdd}`
                      // Check if this exact segment+type combination already exists
                      const exists = selectedSegments.find(s => s.segment === segmentToAdd && s.type === selectedSegmentType)
                      
                      if (!exists) {
                        const newSegment = {
                          type: selectedSegmentType,
                          segment: segmentToAdd,
                          id: id
                        }
                        
                        const updated = [...selectedSegments, newSegment]
                        setSelectedSegments(updated)
                        
                        console.log('🔧 EnhancedFilterPanel: Cascade selection, preserving aggregationLevel:', filters.aggregationLevel)
                        updateFilters({ 
                          segments: updated.map(s => s.segment) || [],
                          segmentType: selectedSegmentType || '',
                          advancedSegments: updated || [],
                          aggregationLevel: filters.aggregationLevel !== undefined ? filters.aggregationLevel : null // Preserve aggregation level
                        } as any)
                      }
                      
                      // Clear cascade selection after adding
                      setCascadePath([])
                      setCurrentSegmentSelection('')
                    }
                  }}
                  className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Selected Segment</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Selected Segments Display */}
        {selectedSegments.length > 0 && (
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center text-sm font-medium text-green-900">
                <Tag className="h-4 w-4 mr-1" />
                Selected Segments ({selectedSegments.length})
              </div>
              <button
                onClick={handleClearAllSegments}
                className="text-xs text-green-600 hover:text-green-800"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-1">
              {selectedSegments.map(({ type, segment, id }, index) => (
                <div
                  key={`${id}-${index}`}
                  className="flex items-center justify-between p-2 bg-white rounded border border-green-200"
                >
                  <div className="text-xs">
                    <span className="font-medium text-black">{type}:</span>
                    <span className="ml-2 text-black">{segment}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveSegment(id)}
                    className="text-green-600 hover:text-green-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        {selectedSegments.length === 0 && (
          <p className="text-xs text-black italic">
            💡 Select segments from different types for cross-type comparison.
          </p>
        )}
      </div>

      {/* Year Range */}
      <div>
        <YearRangeSlider />
      </div>

      {/* Aggregation Level Selector - HIDDEN: Levels are now determined automatically based on selected segments */}
      {/* <div>
        <AggregationLevelSelector />
      </div> */}

      {/* Summary */}
      {(filters.geographies.length > 0 || selectedSegments.length > 0) && (
        <div className="p-3 bg-gray-100 rounded-lg">
          <div className="text-sm font-medium text-black mb-2">
            Comparison Summary
          </div>
          <div className="text-xs text-black space-y-1">
            <div>📍 {filters.geographies.length} geographies</div>
            <div>📊 {selectedSegments.length} segments from {new Set(selectedSegments.map(s => s.type)).size} types</div>
            <div>📅 Years: {filters.yearRange[0]} - {filters.yearRange[1]}</div>
            <div>📈 Data: {filters.dataType}</div>
            <div>🔢 Level: Auto (based on selected segments)</div>
          </div>
        </div>
      )}
    </div>
  )
}
