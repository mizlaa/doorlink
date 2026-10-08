/**
 * Barbers. PLACEHOLDERS: replace names, photos (public/barbers/…), specialties and handles.
 * Photo paths are relative to /public.
 */
export type Barber = {
  id: string;
  name: string;
  role: string;
  specialty: string;
  photo: string;
  instagram?: string; // full URL
};

export const barbers: Barber[] = [
  { id: 'barber-1', name: 'Barber One', role: 'Lead Barber', specialty: 'Skin fades & tapers', photo: '/barbers/barber-1.svg', instagram: 'https://www.instagram.com/fadeddistrictliverpool/' },
  { id: 'barber-2', name: 'Barber Two', role: 'Senior Barber', specialty: 'Scissor work & classic cuts', photo: '/barbers/barber-2.svg', instagram: 'https://www.instagram.com/fadeddistrictliverpool/' },
  { id: 'barber-3', name: 'Barber Three', role: 'Barber', specialty: 'Beards, shaves & kids cuts', photo: '/barbers/barber-3.svg', instagram: 'https://www.instagram.com/fadeddistrictliverpool/' },
];

export const getBarber = (id?: string | null) => barbers.find((b) => b.id === id) ?? null;
