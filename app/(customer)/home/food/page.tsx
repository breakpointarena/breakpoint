"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, useInView, AnimatePresence, Variants } from 'framer-motion';
import { Loader2 } from "lucide-react";
import { FoodCard } from '@/components/customer/home/food/FoodCard';
import { getMenuItems } from './action';
import { SkeletonGrid } from '@/components/shared/SkeletonCard';

export interface Food {
  id: number;
  title: string;
  price: string;
  image: string;
  description: string; // <-- ADDED
  categories: string[];
}

interface FilterOption {
  label: string;
  value: string;
}

// --- Heading animations ---
const fadeUpVariants: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" } },
};

const skewInVariants: Variants = {
  hidden:  { opacity: 0, skewY: 6, y: 30 },
  visible: { opacity: 1, skewY: 0, y: 0, transition: { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] } },
};

/** What `getMenuItems` hands back. */
type MenuResult = { success: boolean; menuItems?: any[]; error?: string };

interface FoodCollectionProps {
  /**
   * Seeded by the landing page, which reads the menu on the server so the
   * cards arrive in the markup rather than after a round trip that could not
   * start until the bundle had hydrated.
   *
   * Optional because this file is also a route of its own (/home/food), where
   * there are no props and it fetches for itself exactly as it did before.
   */
  initialMenu?: MenuResult;
}

/**
 * Menu rows as this section renders them, with the category filters that fall
 * out of them.
 *
 * Pulled out of the effect so the server-seeded path and the client fetch
 * cannot drift apart - both now derive the cards and the filter list the same
 * way, from the same shape.
 */
function mapMenu(res: MenuResult | undefined): { items: Food[]; filters: FilterOption[] } | null {
  if (!res?.success || !res.menuItems) return null;

  const items: Food[] = res.menuItems.map((item: any) => ({
    id: item.id,
    title: item.name,
    price: `₹${item.price}`,
    description: item.description || "A delicious choice from our menu.",
    image: item.image_url || "https://images.unsplash.com/photo-1561758033-d89a9ad46330?q=80&w=600&auto=format&fit=crop",
    categories: [item.category?.toLowerCase() || 'other', 'all'],
  }));

  const uniqueCategories = new Set(
    res.menuItems
      .map((item: any) => item.category?.toLowerCase())
      .filter((cat: any) => cat)
  );

  const filters: FilterOption[] = [{ label: "All Menu", value: "all" }];
  uniqueCategories.forEach((cat) => {
    if (typeof cat === 'string') {
      filters.push({
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        value: cat
      });
    }
  });

  return { items, filters };
}

// --- Main ---
export default function FoodCollection({ initialMenu }: FoodCollectionProps = {}) {
  const seeded = useMemo(() => mapMenu(initialMenu), [initialMenu]);

  const [activeFilter, setActiveFilter] = useState('all');
  const [isFiltering, setIsFiltering] = useState(false);
  const [foodItems, setFoodItems] = useState<Food[]>(seeded?.items ?? []);
  const [filters, setFilters] = useState<FilterOption[]>(
    seeded?.filters ?? [{ label: "All Menu", value: "all" }]
  );
  // Nothing is loading when the server already sent the answer.
  const [isLoading, setIsLoading] = useState(!initialMenu);

  const headingRef = useRef(null);
  const headingInView = useInView(headingRef, { once: true, margin: "-50px" });

  /**
   * Only when the server did not already provide it.
   *
   * Opened as its own route there are no props and this is the only way the
   * menu arrives; reached through the landing page it is already in hand, and
   * fetching again here would be the round trip this change removed.
   */
  useEffect(() => {
    if (initialMenu) return;

    async function loadData() {
      setIsLoading(true);
      try {
        const mapped = mapMenu(await getMenuItems());
        if (mapped) {
          setFoodItems(mapped.items);
          setFilters(mapped.filters);
        }
      } catch (error) {
        console.error("Failed to fetch menu items", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilter = (value: string) => {
    setIsFiltering(true);
    setActiveFilter(value);
  };

  const filtered = activeFilter === 'all'
    ? foodItems
    : foodItems.filter(f => f.categories.includes(activeFilter));

  return (
    <section
      className="relative py-24 overflow-hidden"
      style={{
        backgroundImage: "url('/gamer_food.jpg')",
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
        backgroundPosition: 'center',
      }}
    >
      <style jsx>{`
        @media (max-width: 768px) {
          section {
            background-attachment: scroll !important;
          }
        }
      `}</style>
      <div
        className="absolute inset-0 z-0"
        style={{ background: 'linear-gradient(to bottom, #1E1F22 0%, rgba(30,31,34,0.88) 50%, #1E1F22 100%)' }}
      />

      <div className="max-w-7xl mx-auto px-4 relative z-10">

        {/* Header */}
        <div
          ref={headingRef}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10"
        >
          <div>
            <motion.div variants={fadeUpVariants} initial="hidden" animate={headingInView ? "visible" : "hidden"} className="mb-2">
              <span className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#ADB7BE' }}>
                Arena Kitchen
              </span>
            </motion.div>
            <motion.h2
              variants={skewInVariants}
              initial="hidden"
              animate={headingInView ? "visible" : "hidden"}
              className="text-3xl md:text-4xl font-extrabold uppercase leading-tight text-gradient-primary"
             
            >
              Food & Drinks
            </motion.h2>
          </div>

          {/* Dynamic Filter buttons */}
          <motion.div
            variants={fadeUpVariants}
            initial="hidden"
            animate={headingInView ? "visible" : "hidden"}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap gap-2"
          >
            {filters.map((f) => {
              const isActive = activeFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => handleFilter(f.value)}
                  className={`px-4 py-1.5 rounded text-[12px] font-semibold uppercase tracking-wider transition-all duration-300 ${
                    isActive 
                      ? "bg-gradient-primary text-[#0a0a0a]" 
                      : "bg-white/5 text-[#ADB7BE] border border-white/10"
                  }`}
                  style={{ fontFamily: "'Oxanium', sans-serif" }}
                >
                  {f.label}
                </button>
              );
            })}
          </motion.div>
        </div>

        {/* Data View Layer */}
        {isLoading ? (
          <SkeletonGrid count={8} />
        ) : foodItems.length === 0 ? (
          <div className="text-center py-24 bg-[#121212]/50 border border-[#27272a]/50 rounded-2xl text-[#a1a1aa] backdrop-blur-sm">
            No items currently available.
          </div>
        ) : (
          // Grid
          <motion.div layout className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-6 gap-3.5">
            <AnimatePresence mode="popLayout">
              {filtered.map((food, i) => (
                <FoodCard
                  key={food.id}
                  food={food}
                  index={i}
                  isFiltering={isFiltering}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

      </div>
    </section>
  );
}