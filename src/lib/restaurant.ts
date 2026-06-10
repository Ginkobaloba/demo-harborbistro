/**
 * Harbor Bistro facts, shared by the home page, footer, and /visit.
 * Everything here is fictional; Port Meridian is not a real city.
 */
export const RESTAURANT = {
  name: "Harbor Bistro",
  tagline: "Coastal-inspired, locally sourced, weeknight-easy.",
  phone: "(555) 014-2280",
  email: "hello@harborbistro.example",
  address: {
    street: "412 Harborline Drive",
    city: "Port Meridian",
    note: "On the harborfront, two blocks south of the lighthouse",
  },
  hours: [
    { days: "Monday", hours: "Closed" },
    { days: "Tuesday - Thursday", hours: "4pm - 10pm" },
    { days: "Friday - Saturday", hours: "4pm - 11pm" },
    { days: "Sunday", hours: "Brunch 10am - 2pm, Dinner 4pm - 9pm" },
  ],
  philosophy:
    "We cook what the lake and the land around it do best: fresh fish, small farms, simple technique, no fuss. Dinner here should feel like a good evening, not an occasion you had to dress for.",
} as const;
