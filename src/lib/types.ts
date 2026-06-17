export const COURSES = [
  "snacks",
  "salads",
  "entrees",
  "sides",
  "desserts",
  "drinks",
  "cocktails",
] as const;

export type Course = (typeof COURSES)[number];

export const COURSE_LABELS: Record<Course, string> = {
  snacks: "Snacks",
  salads: "Salads",
  entrees: "Entrees",
  sides: "Sides",
  desserts: "Desserts",
  drinks: "Drinks",
  cocktails: "Cocktails",
};

export type CustomizationChoice = {
  id: string;
  label: string;
  /** Upcharge in cents; absent or 0 means included. */
  priceCents?: number;
};

export type CustomizationGroup = {
  id: string;
  label: string;
  /** "single" renders as radio group, "multi" as checkboxes. */
  type: "single" | "multi";
  /** Single-choice groups the customer must answer (e.g. steak temp). */
  required?: boolean;
  choices: CustomizationChoice[];
};

export type MenuItem = {
  id: number;
  slug: string;
  name: string;
  course: Course;
  description: string;
  priceCents: number;
  photoUrl: string | null;
  isVegetarian: boolean;
  isVegan: boolean;
  isGlutenFree: boolean;
  containsNuts: boolean;
  customizationOptions: CustomizationGroup[];
  isFeatured: boolean;
  sortOrder: number;
};

export const ORDER_STATUSES = [
  "pending",
  "received",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Awaiting Payment",
  received: "Received",
  preparing: "Preparing",
  ready: "Ready for Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type Fulfillment = "pickup" | "delivery";

/** A cart/order line item. Selections map group id -> chosen choice id(s). */
export type OrderLineItem = {
  slug: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  selections: Record<string, string | string[]>;
};

export type Order = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  fulfillment: Fulfillment;
  deliveryAddress: string | null;
  items: OrderLineItem[];
  subtotalCents: number;
  tipCents: number;
  totalCents: number;
  status: OrderStatus;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReservationStatus =
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled";

export type Reservation = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  partySize: number;
  /** YYYY-MM-DD */
  reservedDate: string;
  /** HH:MM, 24-hour */
  reservedTime: string;
  notes: string | null;
  status: ReservationStatus;
  createdAt: string;
};
