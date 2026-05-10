---
name: TruckOpti UI
colors:
  surface: '#fcf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271901'
  on-tertiary-container: '#98805d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-tabular:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  gutter: 1rem
  margin-mobile: 1rem
  margin-desktop: 2rem
---

## Brand & Style

The design system is built to bridge the gap between heavy industrial logistics and modern digital marketplaces. It communicates **authority, operational precision, and local reliability**. The visual language is rooted in a "Corporate Modern" aesthetic—prioritizing clarity and utility over decorative elements. 

The system serves two distinct user archetypes:
1.  **The Fleet Manager (Desktop):** Needs a high-density, data-rich environment for managing hundreds of shipments simultaneously.
2.  **The Driver (Mobile):** Needs a high-contrast, tactile interface that remains legible in varied lighting conditions (glaring sun or low-light cabs).

By utilizing a structured card-based architecture and a strict semantic color system, the design system ensures that critical information—like "Delayed" shipments or "Payout" status—is recognized instantly without cognitive load.

## Colors

The color strategy for the design system is anchored by **Deep Navy (#0F172A)** to establish a foundation of institutional trust and permanence. **Bold Amber (#F59E0B)** is used exclusively as an action and highlight color, reflecting the visibility of safety equipment and the urgency of the logistics sector.

Semantic colors are strictly mapped to operational states:
- **Success (Green):** Delivered, Verified, or Paid.
- **Delayed (Yellow):** Transit warnings or pending approvals.
- **Blocked/Alert (Red):** Document expiry, breakdown, or cancelled loads.
- **Payout (Indigo):** Specific to financial transactions, UPI confirmations, and wallet balances.

The neutral palette uses cool-toned greys to maintain a professional, clean environment for data-heavy tables and complex forms.

## Typography

The design system utilizes **Inter** for its exceptional legibility and systematic weight distribution. In a data-driven environment like trucking, the ability to scan numbers, license plates, and GST numbers is paramount.

A heavy emphasis is placed on **Weight Hierarchy**. Bold weights (600-700) are used for critical status updates and primary headings, while Medium weights (500) are reserved for tabular data to ensure numbers stand out against background rows. For the Driver app, font sizes are bumped up by a scale factor to ensure readability during vibration or on lower-resolution mobile screens.

## Layout & Spacing

The design system employs a **Fluid-Fixed Hybrid Grid**:
- **Desktop (Admin/Agency):** A 12-column fluid grid. To maintain high density, gutters are kept tight (16px), allowing for wide, multi-column tables and side-by-side data comparisons.
- **Mobile (Driver):** A single-column layout with a 16px safe margin. 

A 4px base unit controls the rhythm. Components like cards and input fields use "MD" (16px) padding for a balanced look, while list items in the Driver app use "LG" (24px) vertical padding to provide a larger hit-area for touch interactions.

## Elevation & Depth

The design system uses **Tonal Layering** combined with **Low-Contrast Outlines**. Instead of heavy shadows, depth is created by placing white cards on a subtle grey surface (`#F8FAFC`).

- **Level 0 (Surface):** The background layer.
- **Level 1 (Card):** White background with a 1px border (`#E2E8F0`). Used for primary content.
- **Level 2 (Active/Hover):** A very soft, diffused shadow (0px 4px 12px rgba(15, 23, 42, 0.08)) to indicate interactivity or a modal state.

This approach ensures the UI remains "flat" enough for high-density information display without feeling cluttered by artificial shadows.

## Shapes

The shape language of the design system is **Soft and Structural**. 

A standard border radius of **0.25rem (4px)** is applied to buttons, input fields, and small UI elements to maintain a professional, slightly technical feel. Larger containers like Cards and Bottom Sheets use **0.5rem (8px)** to feel modern and accessible. Pill shapes are reserved exclusively for "Status Badges" to distinguish them clearly from interactive buttons.

## Components

### Buttons
- **Primary:** Deep Navy background with White text. For the Driver app, these are full-width "Sticky Bottom" buttons.
- **Action:** Bold Amber background with Deep Navy text. Used for "Book Load," "Accept Payout," or "Start Trip."

### Status Badges (Chips)
Utilize a subtle background tint of the semantic color with high-contrast text (e.g., Success Green text on a 10% opacity Green background). All badges use a full pill radius.

### Cards
The core unit of information. Every card must have a clear header, a body containing 2-3 key data points (e.g., Route, Weight, Price), and a dedicated status badge in the top-right corner.

### India-Centric Inputs
- **Vehicle Number Fields:** Optimized for Indian registration formats (e.g., MH 12 AB 1234).
- **UPI ID Fields:** Integrated with a "Verify" action to ensure payout accuracy.
- **Document Uploaders:** Large touch-target areas specifically designed for photographing GST certificates and RC books.

### Data Tables (Desktop)
High-density rows with "Zebra Striping" (alternating neutral backgrounds) and fixed headers to allow for long-scroll operational auditing.