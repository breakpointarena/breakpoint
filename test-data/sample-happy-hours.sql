-- Sample Happy Hour Rules for Testing
-- Run this script to populate your database with test happy hour rules

-- Clear existing test data (optional - comment out if you want to keep existing rules)
-- DELETE FROM happy_hour_rules WHERE name LIKE '%Test%' OR name LIKE '%Sample%';

-- Weekend Gaming Blitz
-- 25% off on all devices during weekend afternoons
INSERT INTO happy_hour_rules (name, discount, devices, schedule, time_range, status)
VALUES (
  'Weekend Gaming Blitz',
  25,
  'All',
  'Sat, Sun',
  '10:00 AM - 06:00 PM',
  'LIVE'
) ON CONFLICT (id) DO NOTHING;

-- Early Bird Special
-- 30% off on PS5 and Xbox during weekday mornings
INSERT INTO happy_hour_rules (name, discount, devices, schedule, time_range, status)
VALUES (
  'Early Bird Special',
  30,
  'PS5, Xbox, PlayStation',
  'Mon-Fri',
  '08:00 AM - 12:00 PM',
  'LIVE'
) ON CONFLICT (id) DO NOTHING;

-- Night Owl Discount
-- 20% off on all devices during late evening hours
INSERT INTO happy_hour_rules (name, discount, devices, schedule, time_range, status)
VALUES (
  'Night Owl Discount',
  20,
  'All',
  'Everyday',
  '08:00 PM - 11:59 PM',
  'LIVE'
) ON CONFLICT (id) DO NOTHING;

-- Midweek Madness
-- 35% off on PC gaming during Wednesday afternoons
INSERT INTO happy_hour_rules (name, discount, devices, schedule, time_range, status)
VALUES (
  'Midweek Madness',
  35,
  'PC, Gaming PC',
  'Wednesday',
  '02:00 PM - 06:00 PM',
  'LIVE'
) ON CONFLICT (id) DO NOTHING;

-- Friday Night Fever (PAUSED - for testing status changes)
-- 15% off on all devices Friday nights
INSERT INTO happy_hour_rules (name, discount, devices, schedule, time_range, status)
VALUES (
  'Friday Night Fever',
  15,
  'All',
  'Friday',
  '06:00 PM - 11:59 PM',
  'PAUSED'
) ON CONFLICT (id) DO NOTHING;

-- Morning Grind (SCHEDULED - for future activation)
-- 40% off during very early morning hours
INSERT INTO happy_hour_rules (name, discount, devices, schedule, time_range, status)
VALUES (
  'Morning Grind',
  40,
  'All',
  'Mon-Fri',
  '06:00 AM - 08:00 AM',
  'SCHEDULED'
) ON CONFLICT (id) DO NOTHING;

-- VR Special Hours
-- 25% off on VR devices during afternoons
INSERT INTO happy_hour_rules (name, discount, devices, schedule, time_range, status)
VALUES (
  'VR Special Hours',
  25,
  'VR, Virtual Reality, Meta Quest',
  'Everyday',
  '01:00 PM - 05:00 PM',
  'LIVE'
) ON CONFLICT (id) DO NOTHING;

-- Student Special (Weekday afternoons)
-- 20% off during school hours
INSERT INTO happy_hour_rules (name, discount, devices, schedule, time_range, status)
VALUES (
  'Student Special',
  20,
  'All',
  'Mon-Fri',
  '03:00 PM - 06:00 PM',
  'LIVE'
) ON CONFLICT (id) DO NOTHING;

-- View all active rules
SELECT
  id,
  name,
  discount || '%' as discount_pct,
  devices,
  schedule,
  time_range,
  status,
  created_at
FROM happy_hour_rules
ORDER BY
  CASE status
    WHEN 'LIVE' THEN 1
    WHEN 'PAUSED' THEN 2
    WHEN 'SCHEDULED' THEN 3
  END,
  created_at DESC;

-- Quick stats
SELECT
  status,
  COUNT(*) as count,
  AVG(discount) as avg_discount,
  STRING_AGG(name, ', ') as rules
FROM happy_hour_rules
GROUP BY status
ORDER BY status;
