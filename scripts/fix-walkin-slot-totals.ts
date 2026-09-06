/**
 * Migration script to fix walk-in booking slot_total values
 *
 * Issue: Walk-in bookings created before this fix stored slot_total as (baseRate + extraPlayerCharge)
 * This caused double-counting when reports calculated: slot_total + extra_players_total
 *
 * Fix: Update slot_total to only contain the base rate (excluding extra player charges)
 * The extra player charges are already stored separately in extra_players_total
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixWalkInSlotTotals() {
  try {
    console.log('🔍 Finding walk-in bookings with slot_total issues...\n');

    // Get all booking_device_slots with extra_players_total > 0
    const { data: slots, error } = await supabase
      .from('booking_device_slots')
      .select('*')
      .gt('extra_players_total', 0);

    if (error) throw error;

    console.log(`Found ${slots?.length || 0} slots with extra player charges\n`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const slot of slots || []) {
      // Calculate what the slot_total SHOULD be (base rate only)
      const expectedSlotTotal = slot.duration_hours * slot.hourly_rate;
      const currentSlotTotal = Number(slot.slot_total);
      const extraPlayersTotal = Number(slot.extra_players_total);

      // Check if this slot has the double-counting issue
      // If slot_total ≈ (expectedSlotTotal + extraPlayersTotal), it needs fixing
      const hasIssue = Math.abs(currentSlotTotal - (expectedSlotTotal + extraPlayersTotal)) < 1;

      if (hasIssue) {
        console.log(`✅ Fixing slot ${slot.id}:`);
        console.log(`   Device: ${slot.device_type} | Duration: ${slot.duration_hours}h`);
        console.log(`   Current slot_total: ₹${currentSlotTotal}`);
        console.log(`   Expected slot_total: ₹${expectedSlotTotal}`);
        console.log(`   Extra players total: ₹${extraPlayersTotal}`);

        // Update the slot_total to the correct value
        const { error: updateError } = await supabase
          .from('booking_device_slots')
          .update({ slot_total: expectedSlotTotal })
          .eq('id', slot.id);

        if (updateError) {
          console.error(`   ❌ Error updating slot ${slot.id}:`, updateError.message);
        } else {
          console.log(`   ✓ Updated slot_total to ₹${expectedSlotTotal}\n`);
          fixedCount++;
        }
      } else {
        console.log(`⏭️  Skipping slot ${slot.id} - already correct`);
        skippedCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Fixed: ${fixedCount} slots`);
    console.log(`   Skipped: ${skippedCount} slots`);
    console.log(`   Total processed: ${slots?.length || 0} slots`);

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

// Run the migration
fixWalkInSlotTotals()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
