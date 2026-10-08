// Edit this file to update the site. Everything marked TODO is a placeholder
// that must be replaced with the shop's real details before launch.
window.SHOP = {
  name: "Faded District",
  est: 2021,
  tagline: "Sharp cuts. Clean fades. Liverpool NSW.",
  address: "Liverpool NSW 2170", // TODO: full street address
  mapsUrl:
    "https://www.google.com/maps/place/Faded+District/@-33.924925,150.9223902,17z",
  instagram: "https://www.instagram.com/fadeddistrictliverpool/",
  phone: "", // TODO: e.g. "0400 000 000"
  bookingEmail: "", // TODO: where booking requests are sent
  // Opening hours: 0 = Sunday ... 6 = Saturday. null = closed. TODO: confirm
  hours: {
    0: ["10:00", "16:00"],
    1: null,
    2: ["09:00", "18:00"],
    3: ["09:00", "18:00"],
    4: ["09:00", "20:00"],
    5: ["09:00", "20:00"],
    6: ["09:00", "17:00"],
  },
  slotMinutes: 30,
  // TODO: confirm services, durations (minutes) and prices (AUD)
  services: [
    { id: "cut", name: "Haircut", mins: 30, price: 35, desc: "Classic cut, finished with styling." },
    { id: "fade", name: "Skin / Taper Fade", mins: 30, price: 40, desc: "Precision fade blended to your length." },
    { id: "beard", name: "Beard Trim", mins: 30, price: 25, desc: "Shape-up, line-up and hot towel." },
    { id: "combo", name: "Cut + Beard", mins: 60, price: 60, desc: "Full haircut plus beard trim." },
    { id: "kids", name: "Kids Cut (under 12)", mins: 30, price: 28, desc: "Cuts for the little ones." },
    { id: "shave", name: "Razor Shave", mins: 30, price: 35, desc: "Straight-razor shave with hot towel." },
  ],
  // TODO: replace with real barbers
  barbers: [
    { id: "any", name: "First available" },
    { id: "b1", name: "Barber 1" },
    { id: "b2", name: "Barber 2" },
  ],
};
