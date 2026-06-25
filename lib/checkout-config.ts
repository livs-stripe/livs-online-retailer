// Checkout experience configuration shared between the storefront UI and the
// Stripe integration.

// The two ways the storefront can render Stripe checkout:
//  - "embedded": Stripe Checkout Session in embedded mode (the default).
//  - "elements": a PaymentIntent + Payment Element built from individual
//    Elements, which is the only mode that can surface custom payment methods.
export type CheckoutMode = "embedded" | "elements"

// Default to the Payment Element (Elements) flow. It renders Link INLINE inside
// the cart sheet — returning Link shoppers verify with a one-time code and pay
// without the embedded Checkout's "Pay with Link" popup being forced into a new
// browser tab (popups are blocked inside the embedded checkout iframe). The
// floating toggle still lets you switch to embedded Checkout to compare.
export const DEFAULT_CHECKOUT_MODE: CheckoutMode = "elements"

// localStorage key the floating toggle uses to remember the chosen mode.
// NOTE: the "_v2" suffix intentionally invalidates any previously-persisted
// value. Early sessions saved "embedded" here, which would otherwise override
// the new Elements default below and keep surfacing embedded Checkout's
// "Pay with Link" button (the one that opens a new tab inside the preview
// iframe). Bumping the key lets the inline-Link Elements flow take effect.
export const LS_CHECKOUT_MODE = "adairs_checkout_mode_v2"

// The Adairs gift card is NOT a Stripe payment method. It is validated server
// side and redeemed by creating a one-off Stripe coupon (Coupons API) for the
// card balance, which then discounts the order. The remaining balance is settled
// by whichever payment API the shopper has toggled on — PaymentIntents (Elements
// mode) or Checkout Sessions (embedded mode).
//
// For this demo any 8-digit gift card number is accepted and the PIN must be
// 0000, otherwise the card is declined. Each valid card carries a fixed demo
// balance so a $100 order + gift card neatly splits into a coupon + a card
// charge across the two APIs.
export const GIFT_CARD_VALID_PIN = "0000"
export const GIFT_CARD_NUMBER_LENGTH = 8
export const GIFT_CARD_DEMO_BALANCE = 50
