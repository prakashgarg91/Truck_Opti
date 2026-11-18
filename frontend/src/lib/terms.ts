/**
 * Preferred user-facing labels. One source for the words in docs/GLOSSARY.md.
 *
 * Pages should import from here instead of typing the word again. Existing pages
 * are not migrated yet: the mismatches are listed in the glossary appendix.
 * Keep the values in sync with docs/GLOSSARY.md (the test enforces this).
 */
export const TERMS = {
  // Consignment and documents
  consignment: 'Consignment',
  consignmentNote: 'Consignment note (GR/LR)',
  invoice: 'Invoice',
  freightInvoice: 'Freight invoice',

  // Money
  rateCard: 'Rate card',
  clientTariffs: 'Client tariffs',
  subscription: 'Subscription',
  earnings: 'Earnings',
  adminBilling: 'Billing',

  // Work
  order: 'Order',
  saleOrder: 'Sale order',
  orderImport: 'Order import',
  job: 'Job',
  trip: 'Trip',
  shipment: 'Shipment',
  bookShipment: 'Book shipment',
  loadPlan: 'Load plan',
  route: 'Routes',
  packing: 'Packing',

  // People and vehicles
  team: 'Team',
  teamMember: 'Team member',
  client: 'Client',
  driver: 'Driver',
  vehicle: 'Vehicle',
  vehicleType: 'Vehicle type',
  fleet: 'Fleet',
} as const

export type TermKey = keyof typeof TERMS
