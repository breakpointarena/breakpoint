"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { HappyHourRule } from "@/lib/happy-hours";

/**
 * Get all LIVE happy hour rules
 */
export async function getActiveHappyHours(): Promise<{ success: boolean; rules: HappyHourRule[]; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("happy_hour_rules")
      .select("*")
      .eq("status", "LIVE")
      .order("discount", { ascending: false }); // Highest discount first

    if (error) {
      // If table doesn't exist or other error, return empty rules instead of failing
      console.error("Error fetching happy hours:", error);
      return {
        success: true, // Still success, just no rules
        rules: []
      };
    }

    return {
      success: true,
      rules: data || []
    };
  } catch (err: any) {
    console.error("Error fetching happy hours:", err);
    // Return success with empty rules so booking flow continues
    return {
      success: true,
      rules: []
    };
  }
}

/**
 * Get happy hour rule by ID
 */
export async function getHappyHourById(id: string): Promise<{ success: boolean; rule: HappyHourRule | null; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("happy_hour_rules")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    return {
      success: true,
      rule: data
    };
  } catch (err: any) {
    console.error("Error fetching happy hour:", err);
    return {
      success: false,
      rule: null,
      error: err.message || "Failed to fetch happy hour"
    };
  }
}
