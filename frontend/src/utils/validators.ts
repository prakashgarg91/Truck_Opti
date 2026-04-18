import { z } from 'zod'

/**
 * Zod validators for TruckOpti
 * Indian logistics focused validation schemas
 */

// Phone: Indian format +91 + 10 digits
export const phoneSchema = z.string().regex(
  /^\+91[0-9]{10}$/,
  'Invalid phone number. Format: +91XXXXXXXXXX'
)

// Phone input (without +91 prefix - for form input)
export const phoneInputSchema = z.string().regex(
  /^[0-9]{10}$/,
  'Please enter a valid 10-digit mobile number'
)

// Email validation
export const emailSchema = z.string()
  .email('Please enter a valid email address')
  .min(5, 'Email is too short')
  .max(100, 'Email is too long')

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be 72 characters or less')
  .regex(/[A-Za-z]/, 'Password must include at least one letter')
  .regex(/[0-9]/, 'Password must include at least one number')

// GSTIN: 15-char GST number (Standard Indian GST format)
// Format: 2 digits (state) + 5 letters (PAN entity) + 4 digits + 1 letter + 1 char (Z) + 1 check digit
export const gstinSchema = z.string().regex(
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  'Invalid GSTIN format. Expected: 22AAAAA0000A1Z5'
)

// Pincode: exactly 6 digits (Indian postal code)
export const pincodeSchema = z.string().regex(
  /^[0-9]{6}$/,
  'Pincode must be exactly 6 digits'
)

// Dimension: positive number, max 10000 cm (100 meters)
export const dimensionSchema = z.number()
  .positive('Must be greater than 0')
  .max(10000, 'Maximum 10,000 cm allowed')

// Weight: positive number, max 50000 kg (50 metric tons)
export const weightSchema = z.number()
  .positive('Must be greater than 0')
  .max(50000, 'Maximum 50,000 kg allowed')

// Quantity: positive integer, max 9999
export const quantitySchema = z.number()
  .int('Must be a whole number')
  .positive('Must be at least 1')
  .max(9999, 'Maximum 9999 allowed')

// Item schema for packing/sale orders
export const itemSchema = z.object({
  product_name: z.string()
    .min(1, 'Product name is required')
    .max(100, 'Product name too long (max 100 chars)'),
  length: dimensionSchema,
  width: dimensionSchema,
  height: dimensionSchema,
  weight: weightSchema,
  quantity: quantitySchema,
  fragile: z.boolean().optional().default(false),
  stackable: z.boolean().optional().default(true)
})

// Sale order item schema (from CSV/Excel import)
export const saleOrderItemSchema = z.object({
  product_name: z.string()
    .min(1, 'Product name is required')
    .max(100, 'Product name too long'),
  length: z.number()
    .positive('Length must be greater than 0')
    .max(10000, 'Length maximum is 10,000 cm'),
  width: z.number()
    .positive('Width must be greater than 0')
    .max(10000, 'Width maximum is 10,000 cm'),
  height: z.number()
    .positive('Height must be greater than 0')
    .max(10000, 'Height maximum is 10,000 cm'),
  weight: z.number()
    .positive('Weight must be greater than 0')
    .max(50000, 'Weight maximum is 50,000 kg'),
  quantity: z.number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1')
    .max(9999, 'Quantity maximum is 9999'),
  delivery_city: z.string()
    .min(1, 'Delivery city is required')
    .max(50, 'City name too long')
})

// Shipment schema
export const shipmentSchema = z.object({
  origin: z.string()
    .min(1, 'Origin is required')
    .max(100, 'Origin too long'),
  destination: z.string()
    .min(1, 'Destination is required')
    .max(100, 'Destination too long'),
  status: z.enum(['pending', 'in_transit', 'delivered', 'cancelled'])
})

// Truck type schema (for fleet management)
export const truckTypeSchema = z.object({
  name: z.string()
    .min(1, 'Truck name is required')
    .max(100, 'Truck name too long'),
  length: dimensionSchema,
  width: dimensionSchema,
  height: dimensionSchema,
  capacity: z.number()
    .positive('Capacity must be greater than 0')
    .max(50000, 'Maximum 50,000 kg allowed'),
})

// Truck booking form schema
export const truckBookingSchema = z.object({
  origin: z.string()
    .min(1, 'Origin city is required')
    .max(100, 'Origin too long'),
  destination: z.string()
    .min(1, 'Destination city is required')
    .max(100, 'Destination too long'),
  customerId: z.string().optional(),
  driverName: z.string()
    .max(50, 'Driver name too long')
    .optional()
    .or(z.literal('')),
  driverPhone: z.string()
    .regex(/^$|^\+91[0-9]{10}$/, 'Invalid phone format. Use +91XXXXXXXXXX')
    .optional()
    .or(z.literal('')),
  vehicleNumber: z.string()
    .max(20, 'Vehicle number too long')
    .optional()
    .or(z.literal(''))
})

// Customer schema
export const customerSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(50, 'Name too long (max 50 chars)'),
  phone: phoneSchema,
  email: z.string()
    .email('Invalid email format')
    .optional()
    .or(z.literal('')),
  address: z.string()
    .min(1, 'Address is required')
    .max(200, 'Address too long (max 200 chars)'),
  city: z.string()
    .min(1, 'City is required')
    .max(50, 'City too long'),
  state: z.string()
    .min(1, 'State is required')
    .max(50, 'State too long'),
  pincode: pincodeSchema
})

// Type inference helpers
export type ItemInput = z.infer<typeof itemSchema>
export type SaleOrderItemInput = z.infer<typeof saleOrderItemSchema>
export type ShipmentInput = z.infer<typeof shipmentSchema>
export type TruckBookingInput = z.infer<typeof truckBookingSchema>
export type CustomerInput = z.infer<typeof customerSchema>

/**
 * Helper to validate data with Zod and return structured result
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Object with success status, validated data (if success), or errors array
 */
export function validateWithZod<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: boolean; data?: T; errors?: string[] } {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  } else {
    // Format Zod errors into readable messages
    const errors = result.error.issues.map((issue: z.ZodIssue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'value'
      return `${path}: ${issue.message}`
    })
    return { success: false, errors }
  }
}

/**
 * Helper to validate a single field and return error message or null
 * @param schema - Zod schema (typically a single field schema)
 * @param value - Value to validate
 * @returns Error message string or null if valid
 */
export function validateField<T>(schema: z.ZodSchema<T>, value: unknown): string | null {
  const result = schema.safeParse(value)

  if (result.success) {
    return null
  } else {
    return result.error.issues[0]?.message || 'Invalid value'
  }
}

/**
 * Helper to get field errors as a record for form validation
 * @param schema - Zod object schema
 * @param data - Data to validate
 * @returns Record of field names to error messages
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod ZodObject requires 'any' in its generic constraint
export function getFieldErrors<T extends z.ZodObject<any>>(
  schema: T,
  data: unknown
): Record<string, string> {
  const result = schema.safeParse(data)
  const errors: Record<string, string> = {}

  if (!result.success) {
    result.error.issues.forEach((issue: z.ZodIssue) => {
      const key = issue.path[0] as string
      if (key && !errors[key]) {
        errors[key] = issue.message
      }
    })
  }

  return errors
}

export default {
  phoneSchema,
  phoneInputSchema,
  emailSchema,
  passwordSchema,
  gstinSchema,
  pincodeSchema,
  dimensionSchema,
  weightSchema,
  quantitySchema,
  itemSchema,
  saleOrderItemSchema,
  shipmentSchema,
  truckBookingSchema,
  customerSchema,
  validateWithZod,
  validateField,
  getFieldErrors
}
