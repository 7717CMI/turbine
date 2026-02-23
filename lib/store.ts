import { create } from 'zustand'
import type { FilterState, ComparisonData } from './types'
import type { ChartGroupId } from './chart-groups'
import { DEFAULT_CHART_GROUP } from './chart-groups'

interface DashboardStore {
  data: ComparisonData | null
  filteredData: any[] // Will hold filtered records
  filters: FilterState // Market analysis filters
  opportunityFilters: FilterState // Opportunity matrix filters (separate)
  isLoading: boolean
  error: string | null
  selectedChartGroup: ChartGroupId
  defaultFiltersLoaded: boolean // Track if default filters are loaded
  opportunityFiltersLoaded: boolean // Track if opportunity filters are loaded
  geographyFiltersBySegmentType: Record<string, string[]> // Store geography filters per segment type
  fromDashboardBuilder: boolean // Track if data came from dashboard builder
  dashboardBuilderFiles: { valueFile: File | null; volumeFile: File | null; projectName: string } | null
  intelligenceType: 'customer' | 'distributor' | null // Track which intelligence type is selected
  customerIntelligenceData: any[] | null // Store customer intelligence data
  distributorIntelligenceData: any[] | null // Store distributor intelligence data
  parentHeaders: { prop1: string; prop2: string; prop3: string } | null // Store parent headers for propositions
  rawIntelligenceData: { headers: string[]; rows: Record<string, any>[] } | null // Store raw Excel data as-is
  proposition2Data: { headers: string[]; rows: Record<string, any>[] } | null // Store Proposition 2 data
  proposition3Data: { headers: string[]; rows: Record<string, any>[] } | null // Store Proposition 3 data
  competitiveIntelligenceData: { headers: string[]; rows: Record<string, any>[] } | null // Store competitive intelligence CSV data
  dashboardName: string | null // Custom dashboard name
  currency: 'USD' | 'INR' // Currency preference
  
  // Actions
  setData: (data: ComparisonData) => void
  clearData: () => void // Clear all data and reset store for new market data
  updateFilters: (filters: Partial<FilterState>) => void
  updateOpportunityFilters: (filters: Partial<FilterState>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  resetFilters: () => void
  resetOpportunityFilters: () => void
  setSelectedChartGroup: (groupId: ChartGroupId) => void
  loadDefaultFilters: () => void // Load default filters based on data
  loadDefaultOpportunityFilters: () => void // Load default opportunity filters
  saveGeographyFiltersForSegmentType: (segmentType: string, geographies: string[]) => void
  getGeographyFiltersForSegmentType: (segmentType: string) => string[] | undefined
  setDashboardBuilderContext: (files: { valueFile: File | null; volumeFile: File | null; projectName: string }) => void
  clearDashboardBuilderContext: () => void
  setIntelligenceType: (type: 'customer' | 'distributor' | null) => void
  setCustomerIntelligenceData: (data: any[]) => void
  setDistributorIntelligenceData: (data: any[]) => void
  setParentHeaders: (headers: { prop1: string; prop2: string; prop3: string } | null) => void
  setRawIntelligenceData: (data: { headers: string[]; rows: Record<string, any>[] } | null) => void
  setProposition2Data: (data: { headers: string[]; rows: Record<string, any>[] } | null) => void
  setProposition3Data: (data: { headers: string[]; rows: Record<string, any>[] } | null) => void
  setCompetitiveIntelligenceData: (data: { headers: string[]; rows: Record<string, any>[] } | null) => void
  setDashboardName: (name: string | null) => void
  setCurrency: (currency: 'USD' | 'INR') => void
}

// Helper function to check if data has B2B/B2C segmentation
export function hasB2BSegmentation(data: ComparisonData | null, segmentType: string): boolean {
  if (!data || !segmentType) return false
  const segmentDimension = data.dimensions.segments[segmentType]
  return !!(segmentDimension && (
    (segmentDimension.b2b_hierarchy && Object.keys(segmentDimension.b2b_hierarchy).length > 0) ||
    (segmentDimension.b2c_hierarchy && Object.keys(segmentDimension.b2c_hierarchy).length > 0) ||
    (segmentDimension.b2b_items && segmentDimension.b2b_items.length > 0) ||
    (segmentDimension.b2c_items && segmentDimension.b2c_items.length > 0)
  ))
}

// Helper function to get default filters based on data
function getDefaultFilters(data: ComparisonData | null): FilterState {
  if (!data) {
  return {
    geographies: [],
    segments: [],
    segmentType: '',
    yearRange: [2021, 2033],
    dataType: 'value',
    viewMode: 'segment-mode',
    businessType: undefined,
    aggregationLevel: null,
    showLevel1Totals: false,
  }
  }

  const firstSegmentType = Object.keys(data.dimensions.segments)[0] || ''
  const startYear = data.metadata.start_year
  const baseYear = data.metadata.base_year
  const forecastYear = data.metadata.forecast_year
  
  // Get first geography for default view
  const firstGeography = data.dimensions.geographies.all_geographies?.[0] || ''
  
  // Get first few segments from the first segment type (for default view)
  const segmentDimension = data.dimensions.segments[firstSegmentType]
  const firstSegments = segmentDimension?.items?.slice(0, 3) || []
  
  // Set default business type only if B2B/B2C exists
  let defaultBusinessType: 'B2B' | 'B2C' | undefined = undefined
  if (hasB2BSegmentation(data, firstSegmentType)) {
    defaultBusinessType = 'B2B'
  }

  return {
    geographies: firstGeography ? [firstGeography] : [],
    segments: firstSegments,
    segmentType: firstSegmentType,
    yearRange: [baseYear, Math.min(baseYear + 4, forecastYear)],
    dataType: 'value',
    viewMode: 'segment-mode',
    businessType: defaultBusinessType,
    aggregationLevel: null, // Automatic - determined by selected segments
    showLevel1Totals: false,
  }
}

// Helper function to get default opportunity matrix filters
// These are optimized for CAGR-based opportunity analysis
function getDefaultOpportunityFilters(data: ComparisonData | null): FilterState {
  if (!data) {
    return {
      geographies: [],
      segments: [],
      segmentType: '',
      yearRange: [2027, 2033], // Focus on forecast period for CAGR analysis
      dataType: 'value',
      viewMode: 'segment-mode',
      businessType: undefined,
      aggregationLevel: null, // Show all levels to see opportunities at different aggregation levels
      showLevel1Totals: false,
    }
  }

  const firstSegmentType = Object.keys(data.dimensions.segments)[0] || ''
  const baseYear = data.metadata.base_year
  const forecastYear = data.metadata.forecast_year
  
  // For opportunity matrix, default to first geography (usually India or global)
  const firstGeography = data.dimensions.geographies.all_geographies?.[0] || ''
  
  // For opportunity matrix, don't pre-select segments - let user select them
  // This avoids issues where segments don't match the actual data structure
  // Empty segments array means "show all segments"
  const segments: string[] = []
  
  // Set default business type only if B2B/B2C exists
  let defaultBusinessType: 'B2B' | 'B2C' | undefined = undefined
  if (hasB2BSegmentation(data, firstSegmentType)) {
    defaultBusinessType = 'B2B'
  }

  return {
    geographies: firstGeography ? [firstGeography] : [],
    segments: segments, // Empty = show all segments (don't pre-filter)
    segmentType: firstSegmentType,
    yearRange: [baseYear, forecastYear], // Full forecast range for CAGR calculation
    dataType: 'value',
    viewMode: 'segment-mode',
    businessType: defaultBusinessType,
    aggregationLevel: null, // Automatic - determined by selected segments
    showLevel1Totals: false,
  }
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  data: null,
  filteredData: [],
  filters: getDefaultFilters(null),
  opportunityFilters: getDefaultOpportunityFilters(null),
  isLoading: false,
  error: null,
  selectedChartGroup: DEFAULT_CHART_GROUP,
  defaultFiltersLoaded: false,
  opportunityFiltersLoaded: false,
  geographyFiltersBySegmentType: {},
  fromDashboardBuilder: false,
  dashboardBuilderFiles: null,
  intelligenceType: null,
  customerIntelligenceData: null,
  distributorIntelligenceData: null,
  parentHeaders: null,
  rawIntelligenceData: null,
  proposition2Data: null,
  proposition3Data: null,
  competitiveIntelligenceData: null,
  dashboardName: null,
  currency: 'USD',
  
  setData: (data) => {
    const defaultFilters = getDefaultFilters(data)
    const defaultOpportunityFilters = getDefaultOpportunityFilters(data)
    
    // Preserve the current aggregation level when new data is uploaded
    // This allows users to keep their selected level when uploading new files
    const currentFilters = get().filters
    const preservedAggregationLevel = currentFilters?.aggregationLevel !== null 
      ? currentFilters.aggregationLevel 
      : defaultFilters.aggregationLevel
    
    set({ 
      data, 
      filteredData: [], // Clear filtered data when new data is set
      error: null,
      filters: {
        ...defaultFilters,
        aggregationLevel: preservedAggregationLevel // Preserve aggregation level
      },
      opportunityFilters: defaultOpportunityFilters,
      defaultFiltersLoaded: true,
      opportunityFiltersLoaded: true,
      geographyFiltersBySegmentType: {} // Clear geography filters for new market
    })
  },
  
  clearData: () => {
    console.log('🧹 Store: Clearing all data for new market')
    set({
      data: null,
      filteredData: [],
      filters: getDefaultFilters(null),
      opportunityFilters: getDefaultOpportunityFilters(null),
      error: null,
      defaultFiltersLoaded: false,
      opportunityFiltersLoaded: false,
      geographyFiltersBySegmentType: {},
      selectedChartGroup: DEFAULT_CHART_GROUP
    })
  },
  
  loadDefaultFilters: () => {
    console.log('🔧 Store: loadDefaultFilters called')
    const currentData = get().data
    if (currentData && !get().defaultFiltersLoaded) {
      const currentFilters = get().filters
      const defaultFilters = getDefaultFilters(currentData)
      // Preserve aggregationLevel if it was already set
      const preservedFilters = {
        ...defaultFilters,
        aggregationLevel: currentFilters.aggregationLevel !== null && currentFilters.aggregationLevel !== undefined 
          ? currentFilters.aggregationLevel 
          : defaultFilters.aggregationLevel
      }
      console.log('🔧 Store: loadDefaultFilters - preserving aggregationLevel:', preservedFilters.aggregationLevel)
      set({ 
        filters: preservedFilters,
        defaultFiltersLoaded: true
      })
    }
  },
  
  updateFilters: (newFilters) => {
    console.log('🔧 Store: updateFilters called with:', newFilters)
    set((state) => {
      // When switching to Volume, find a valid segment type that has volume data
      if (newFilters.dataType === 'volume' && state.filters.dataType !== 'volume') {
        const volumeRecords = state.data?.data.volume.geography_segment_matrix || []
        const volumeSegmentTypes = new Set(volumeRecords.map(r => r.segment_type))
        const allSegmentTypes = state.data ? Object.keys(state.data.dimensions.segments) : []

        // Use current segment type if it has volume data, otherwise find the first one that does
        let targetSegmentType = state.filters.segmentType
        if (!volumeSegmentTypes.has(targetSegmentType)) {
          if (volumeSegmentTypes.size > 0) {
            // Use the first segment type that has volume records
            targetSegmentType = Array.from(volumeSegmentTypes)[0]
          } else if (allSegmentTypes.length > 0) {
            // Fallback: use the first segment type from dimensions
            targetSegmentType = allSegmentTypes[0]
          }
        }

        console.log('🔧 Store: Switching to Volume - using segmentType:', targetSegmentType)
        newFilters = {
          ...newFilters,
          segmentType: targetSegmentType,
          segments: [], // Clear segments when switching data type
          advancedSegments: [], // Clear advanced segments to keep UI in sync
        } as any
      }

      // If segmentType is changing, save current geographies and restore for new type
      if (newFilters.segmentType !== undefined && newFilters.segmentType !== state.filters.segmentType) {
        const oldSegmentType = state.filters.segmentType
        const newSegmentType = newFilters.segmentType
        
        // Save current geography filters for the old segment type
        if (oldSegmentType && state.filters.geographies.length > 0) {
          state.geographyFiltersBySegmentType[oldSegmentType] = [...state.filters.geographies]
        }
        
        // Determine if we should clear or restore geographies for the new segment type
        const shouldClearGeographies = false // "By Region" is no longer a segment type
        const savedGeographies = state.geographyFiltersBySegmentType[newSegmentType]
        
        // Always keep the current geographies when switching segment types
        // The user expects geography selection to persist across segment type changes
        let newGeographies: string[] = []
        if (shouldClearGeographies) {
          newGeographies = []
        } else if (newFilters.geographies !== undefined) {
          newGeographies = newFilters.geographies || []
        } else {
          newGeographies = state.filters.geographies
        }
        
        // Preserve existing values - don't allow null/undefined to overwrite unless explicitly set
        const updatedFilters: FilterState = {
          ...state.filters,
          // Only update aggregationLevel if it's explicitly provided (including null)
          ...(newFilters.aggregationLevel !== undefined && { aggregationLevel: newFilters.aggregationLevel }),
          // For other filters, merge but preserve existing values
          geographies: newGeographies,
          ...(newFilters.segments !== undefined && { segments: newFilters.segments || [] }),
          segmentType: newSegmentType,
          ...(newFilters.yearRange !== undefined && { yearRange: newFilters.yearRange || [2021, 2025] }),
          ...(newFilters.dataType !== undefined && { dataType: newFilters.dataType || 'value' }),
          ...(newFilters.viewMode !== undefined && { viewMode: newFilters.viewMode || 'segment-mode' }),
          ...(newFilters.businessType !== undefined && { businessType: newFilters.businessType }),
          // CRITICAL: Handle advancedSegments for sub-segment filtering
          ...((newFilters as any).advancedSegments !== undefined && { advancedSegments: (newFilters as any).advancedSegments || [] }),
          // Preserve aggregationLevel if not explicitly changed
          aggregationLevel: newFilters.aggregationLevel !== undefined ? newFilters.aggregationLevel : state.filters.aggregationLevel
        }

        console.log('🔧 Store: Segment type changed, saved/restored geographies:', {
          oldSegmentType,
          newSegmentType,
          savedForOld: oldSegmentType ? state.geographyFiltersBySegmentType[oldSegmentType] : undefined,
          restoredForNew: newGeographies,
          shouldClear: shouldClearGeographies
        })
        
        return {
          filters: updatedFilters,
          geographyFiltersBySegmentType: { ...state.geographyFiltersBySegmentType }
        }
      }
      
      // Normal filter update (no segment type change)
      // If geographies are being updated, also save them for current segment type
      if (newFilters.geographies !== undefined && state.filters.segmentType) {
        state.geographyFiltersBySegmentType[state.filters.segmentType] = [...(newFilters.geographies || [])]
      }
      
      // Preserve existing values - don't allow null/undefined to overwrite unless explicitly set
      const updatedFilters: FilterState = {
        ...state.filters,
        // Only update aggregationLevel if it's explicitly provided (including null)
        ...(newFilters.aggregationLevel !== undefined && { aggregationLevel: newFilters.aggregationLevel }),
        // For other filters, merge but preserve existing values
        ...(newFilters.geographies !== undefined && { geographies: newFilters.geographies || [] }),
        ...(newFilters.segments !== undefined && { segments: newFilters.segments || [] }),
        ...(newFilters.segmentType !== undefined && { segmentType: newFilters.segmentType || '' }),
        ...(newFilters.yearRange !== undefined && { yearRange: newFilters.yearRange || [2021, 2025] }),
        ...(newFilters.dataType !== undefined && { dataType: newFilters.dataType || 'value' }),
        ...(newFilters.viewMode !== undefined && { viewMode: newFilters.viewMode || 'segment-mode' }),
        ...(newFilters.businessType !== undefined && { businessType: newFilters.businessType }),
        // CRITICAL: Handle advancedSegments for sub-segment filtering
        ...((newFilters as any).advancedSegments !== undefined && { advancedSegments: (newFilters as any).advancedSegments || [] }),
        // Preserve aggregationLevel if not explicitly changed
        aggregationLevel: newFilters.aggregationLevel !== undefined ? newFilters.aggregationLevel : state.filters.aggregationLevel
      }
      console.log('🔧 Store: Updated filters:', {
        ...updatedFilters,
        aggregationLevel: updatedFilters.aggregationLevel,
        advancedSegments: (updatedFilters as any).advancedSegments
      })
      return {
        filters: updatedFilters,
        geographyFiltersBySegmentType: { ...state.geographyFiltersBySegmentType }
      }
    })
  },
  
  saveGeographyFiltersForSegmentType: (segmentType: string, geographies: string[]) => {
    set((state) => ({
      geographyFiltersBySegmentType: {
        ...state.geographyFiltersBySegmentType,
        [segmentType]: [...geographies]
      }
    }))
  },
  
  getGeographyFiltersForSegmentType: (segmentType: string) => {
    return get().geographyFiltersBySegmentType[segmentType]
  },
  
  setDashboardBuilderContext: (files) => set({ 
    fromDashboardBuilder: true, 
    dashboardBuilderFiles: files 
  }),
  
  clearDashboardBuilderContext: () => set({ 
    fromDashboardBuilder: false, 
    dashboardBuilderFiles: null 
  }),
  
  setIntelligenceType: (type) => set({ intelligenceType: type }),
  
  setCustomerIntelligenceData: (data) => set({ customerIntelligenceData: data }),
  
  setDistributorIntelligenceData: (data) => set({ distributorIntelligenceData: data }),
  
  setParentHeaders: (headers) => set({ parentHeaders: headers }),
  
  setRawIntelligenceData: (data) => set({ rawIntelligenceData: data }),
  
  setProposition2Data: (data) => set({ proposition2Data: data }),
  
  setProposition3Data: (data) => set({ proposition3Data: data }),
  
  setCompetitiveIntelligenceData: (data) => set({ competitiveIntelligenceData: data }),
  
  setDashboardName: (name) => set({ dashboardName: name }),
  
  setCurrency: (currency) => set({ currency }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error, isLoading: false }),
  
  resetFilters: () => {
    console.log('🔧 Store: resetFilters called')
    const currentData = get().data
    const defaultFilters = getDefaultFilters(currentData)
    // Reset aggregationLevel to null when resetting
    set({ 
      filters: {
        ...defaultFilters,
        aggregationLevel: null // Explicitly reset to null on reset
      },
      defaultFiltersLoaded: true
    })
  },
  
  setSelectedChartGroup: (groupId) => {
    console.log('🔧 Store: setSelectedChartGroup called with:', groupId)
    set({ selectedChartGroup: groupId })
    // Load default opportunity filters when switching to opportunity matrix
    if (groupId === 'coherent-opportunity') {
      const currentData = get().data
      if (currentData) {
        const defaultOpportunityFilters = getDefaultOpportunityFilters(currentData)
        console.log('🔧 Store: Setting opportunity filters:', defaultOpportunityFilters)
        set({ 
          opportunityFilters: defaultOpportunityFilters,
          opportunityFiltersLoaded: true
        })
      } else {
        console.warn('🔧 Store: No data available when switching to opportunity matrix')
      }
    }
  },
  
  updateOpportunityFilters: (newFilters) => {
    set((state) => {
      const updatedFilters: FilterState = {
        ...state.opportunityFilters,
        ...(newFilters.geographies !== undefined && { geographies: newFilters.geographies || [] }),
        ...(newFilters.segments !== undefined && { segments: newFilters.segments || [] }),
        ...(newFilters.segmentType !== undefined && { segmentType: newFilters.segmentType || '' }),
        ...(newFilters.yearRange !== undefined && { yearRange: newFilters.yearRange || [2021, 2033] }),
        ...(newFilters.dataType !== undefined && { dataType: newFilters.dataType || 'value' }),
        ...(newFilters.viewMode !== undefined && { viewMode: newFilters.viewMode || 'segment-mode' }),
        ...(newFilters.businessType !== undefined && { businessType: newFilters.businessType }),
        ...(newFilters.aggregationLevel !== undefined && { aggregationLevel: newFilters.aggregationLevel }),
      }
      return { opportunityFilters: updatedFilters }
    })
  },
  
  resetOpportunityFilters: () => {
    const currentData = get().data
    const defaultOpportunityFilters = getDefaultOpportunityFilters(currentData)
    set({ 
      opportunityFilters: defaultOpportunityFilters,
      opportunityFiltersLoaded: true
    })
  },
  
  loadDefaultOpportunityFilters: () => {
    const currentData = get().data
    if (currentData && !get().opportunityFiltersLoaded) {
      const defaultOpportunityFilters = getDefaultOpportunityFilters(currentData)
      set({ 
        opportunityFilters: defaultOpportunityFilters,
        opportunityFiltersLoaded: true
      })
    }
  },
}))

