export type HouseTemplate = "gable" | "arch" | "glass" | "neon";
export type HouseMaterial = "wood" | "brick" | "glass" | "stone";
export type HouseRoof = "gable" | "arch" | "flat";
export type HouseLighting = "warm" | "cool" | "neon";
export type HouseFeature =
  | "plant"
  | "lantern"
  | "poster"
  | "awning"
  | "terrace"
  | "window-grid"
  | "chimney"
  | "bar"
  | "coffee"
  | "spicy"
  | "noodle"
  | "seafood";

export type HousePalette = {
  primary?: string;
  secondary?: string;
  accent?: string;
};

export type HouseConfig = {
  template?: HouseTemplate;
  palette?: HousePalette;
  sign?: {
    style?: "wood" | "neon";
    text?: string | null;
  };
  roof?: HouseRoof;
  facade?: HouseMaterial;
  lighting?: HouseLighting;
  features?: HouseFeature[];
  stickers?: string[];
  summary?: string;
  keywords?: {
    ambiance?: string[];
    iconic?: string[];
    storefront?: string[];
    colorLight?: string[];
  };
};

export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 反向地理编码得到的“路名 · 区名”等，允许为空 */
  address: string | null;
  rating: number | null;
  price_per_person: number | null;
  tags: string[];
  note: string | null;
  links: string | null;
  photo_urls: string[];
  dishes: string[];
  house: HouseConfig;
  updated_at: string;
};export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 反向地理编码得到的“路名 · 区名”等，允许为空 */
  address: string | null;
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
