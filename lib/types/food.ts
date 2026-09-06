export type FoodCategory = "Snacks" | "Drinks" | "Meals";
export type FoodStatus = "available" | "out_of_stock" | "hidden";

export interface MenuItem {
  id: string;
  name: string;
  category: FoodCategory;
  price: number;
  quantity: number;
  status: FoodStatus;
  description: string | null;
  image_url: string | null;
  created_at?: string;
  updated_at?: string;
}