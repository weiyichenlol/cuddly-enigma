export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating: number | null;
  price_per_person: number | null;
  tags: string[];
  note: string | null;
  links: string | null;
  photo_urls: string[];
  dishes: string[];
  house: Record<string, unknown>;
  updated_at: string;
};
