// Cost Estimation Engine - TypeScript port of Python cost_engine.py
// Indian logistics rates and calculations

export interface CostCalculationInput {
  distanceKm: number
  truckType: string
  weightKg: number
  volumeM3: number
}

export interface CostCalculationResult {
  fuelCost: number
  tollCost: number
  driverCost: number
  loadingCost: number
  totalCost: number
  costPerKm: number
  costPerKg: number
}

// Truck fuel efficiency (km per liter)
const TRUCK_FUEL_EFFICIENCY: Record<string, number> = {
  'tata ace': 14,
  'tata 407': 10,
  'eicher 14ft': 8,
  '14ft': 8,
  'eicher 17ft': 7,
  '17ft': 7,
  'eicher 19ft': 6,
  '19ft': 6,
  'bharatbenz 32ft': 4,
  '32ft': 4,
  'tata lpt 3718': 3.5,
  '36ft': 3.5,
  'default': 6
}

// Indian logistics rates
const RATES = {
  dieselPricePerLiter: 87, // ₹87/L average
  tollPerKm: 3.5, // ₹3.5/km
  driverDailyRate: 800, // ₹800/day
  driverPerKmRate: 2, // ₹2/km
  loadingUnloadingFlat: 500, // ₹500 flat
  averageSpeedKmh: 50 // 50 km/h average
}

/**
 * Get fuel efficiency for truck type
 */
function getFuelEfficiency(truckType: string): number {
  const normalized = truckType.toLowerCase()
  for (const [key, value] of Object.entries(TRUCK_FUEL_EFFICIENCY)) {
    if (normalized.includes(key)) return value
  }
  return TRUCK_FUEL_EFFICIENCY.default
}

/**
 * Calculate shipment cost based on distance, truck type, weight, and volume
 */
export function calculateShipmentCost(input: CostCalculationInput): CostCalculationResult {
  const { distanceKm, truckType, weightKg } = input
  
  // Fuel cost calculation
  const fuelEfficiency = getFuelEfficiency(truckType)
  const fuelNeeded = distanceKm / fuelEfficiency
  const fuelCost = Math.round(fuelNeeded * RATES.dieselPricePerLiter)
  
  // Toll cost calculation
  const tollCost = Math.round(distanceKm * RATES.tollPerKm)
  
  // Driver cost calculation (daily + per km)
  const estimatedDays = Math.ceil(distanceKm / RATES.averageSpeedKmh / 8) // 8 hours driving per day
  const driverDailyCost = estimatedDays * RATES.driverDailyRate
  const driverDistanceCost = distanceKm * RATES.driverPerKmRate
  const driverCost = Math.round(driverDailyCost + driverDistanceCost)
  
  // Loading/unloading cost
  const loadingCost = RATES.loadingUnloadingFlat
  
  // Total cost
  const totalCost = fuelCost + tollCost + driverCost + loadingCost
  
  // Per unit costs
  const costPerKm = totalCost / distanceKm
  const costPerKg = weightKg > 0 ? totalCost / weightKg : 0
  
  return {
    fuelCost,
    tollCost,
    driverCost,
    loadingCost,
    totalCost,
    costPerKm: Math.round(costPerKm * 100) / 100,
    costPerKg: Math.round(costPerKg * 100) / 100
  }
}

/**
 * Calculate cost for multiple truck types for comparison
 */
export function calculateCostComparison(
  distanceKm: number,
  weightKg: number,
  volumeM3: number
): Array<{ truckType: string; result: CostCalculationResult }> {
  const truckTypes = [
    'Tata Ace',
    'Eicher 14ft',
    'Eicher 19ft',
    'BharatBenz 32ft'
  ]
  
  return truckTypes.map(truckType => ({
    truckType,
    result: calculateShipmentCost({ distanceKm, truckType, weightKg, volumeM3 })
  }))
}

/**
 * Format cost as currency string
 */
export function formatCost(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount)
}

/**
 * Format cost breakdown for display
 */
export function getCostBreakdown(cost: CostCalculationResult): string {
  return `Fuel: ${formatCost(cost.fuelCost)} | Toll: ${formatCost(cost.tollCost)} | Driver: ${formatCost(cost.driverCost)} | Loading: ${formatCost(cost.loadingCost)}`
}
