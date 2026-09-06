# 📊 Reports & Analytics System

## Overview

The Reports system provides comprehensive business intelligence across all operations including revenue tracking, food sales analysis, device utilization, and overall performance metrics.

---

## 🎯 Report Types

### 1. **Overview Report**
Comprehensive dashboard showing high-level metrics across all categories.

**Metrics Displayed:**
- Total Revenue (all sources)
- Device Revenue
- Food Revenue
- Total Bookings
- Food Orders Count
- Items Sold
- Hours Booked
- Average Revenue per Booking

**Use Cases:**
- Daily business review
- Quick performance snapshot
- Executive dashboard

---

### 2. **Food Reports**
Detailed analysis of food & beverage sales.

**Summary Metrics:**
- Total Food Revenue
- Items Sold
- Total Orders
- Average Order Value

**Breakdowns:**
- **Category Breakdown**: Revenue by category (Snacks, Drinks, Meals)
  - Total quantity sold per category
  - Number of unique items
  - Percentage of total revenue
- **Top Selling Items**: Top 10 items by revenue
  - Item name & category
  - Total quantity sold
  - Total revenue
  - Number of orders

**Use Cases:**
- Menu optimization
- Inventory planning
- Popular item identification
- Category performance analysis

---

### 3. **Device Reports**
Analysis of gaming device utilization and revenue.

**Summary Metrics:**
- Total Device Revenue
- Total Bookings
- Hours Booked
- Average Revenue per Booking
- Average Players per Booking

**Breakdowns:**
- **Device Type Performance**: Per device type (PS5, Xbox, PC)
  - Total bookings
  - Total hours booked
  - Average players per booking
  - Extra player revenue
  - Total revenue

**Use Cases:**
- Device utilization tracking
- Pricing optimization
- Capacity planning
- Popular device identification

---

### 4. **Revenue Reports**
Deep dive into revenue streams and financial performance.

**Summary Metrics:**
- Total Revenue
- Device Revenue & Percentage
- Food Revenue & Percentage
- Payment Status Breakdown (Paid vs Pending)

**Breakdowns:**
- **Revenue by Source**: Walk-in vs Online bookings
  - Total revenue per source
  - Booking count per source
- **Daily Revenue Trend**: Last 10 days
  - Device revenue (blue bar)
  - Food revenue (amber bar)
  - Total revenue per day
  - Visual bar chart representation

**Use Cases:**
- Cash flow analysis
- Payment collection tracking
- Revenue trend analysis
- Source performance comparison

---

## 📅 Date Range Filtering

### Quick Filter Presets

All reports support quick date range selection:

| Preset | Description | Use Case |
|--------|-------------|----------|
| **Today** | Current day only | Daily operations review |
| **Last 7 Days** | Previous week | Weekly performance |
| **Last 30 Days** | Previous month | Monthly trends |
| **This Month** | Current calendar month | Month-to-date tracking |
| **Last 90 Days** | Previous quarter | Quarterly analysis |
| **All Time** | Complete history | Lifetime performance |

### Custom Date Range

Users can select any custom date range:
1. Select "From Date"
2. Select "To Date"
3. Click "Apply Custom Range"

### Active Filter Display

When a date filter is active:
- Shows selected date range
- Displays in readable format (e.g., "Jan 15, 2026 → Feb 14, 2026")
- "Clear Filter" button to reset

---

## 🎨 Visual Design

### Color Coding

**Revenue Cards:**
- Total Revenue: Green gradient
- Device Revenue: Blue gradient
- Food Revenue: Amber gradient
- Bookings: Purple gradient

**Status Indicators:**
- Paid: Green
- Pending: Amber
- Device: Blue
- Food: Amber

### Chart Elements

**Daily Revenue Trend:**
- Device revenue: Blue bars
- Food revenue: Amber bars
- Stacked bar representation
- Last 10 days displayed

---

## 🔧 Technical Implementation

### Server Actions

Located in: `/app/(admin)/admin/reports/actions.ts`

**Available Functions:**
```typescript
getDashboardSummary(filters?: ReportFilters)
getFoodReports(filters?: ReportFilters)
getDeviceReports(filters?: ReportFilters)
getRevenueReports(filters?: ReportFilters)
```

**Filter Interface:**
```typescript
interface ReportFilters {
  dateFrom?: string;  // YYYY-MM-DD format
  dateTo?: string;    // YYYY-MM-DD format
}
```

### Data Sources

**Food Reports:**
- Table: `booking_food_items`
- Joins: `bookings` (inner join)
- Excludes: Cancelled bookings

**Device Reports:**
- Table: `booking_device_slots`
- Joins: `bookings` (inner join)
- Includes: Confirmed, Checked-in, Completed bookings

**Revenue Reports:**
- Table: `bookings`
- Joins: `booking_device_slots`
- Filters: By slot_date when specified
- Includes: Confirmed, Checked-in, Completed bookings

---

## 📈 Key Metrics Explained

### Average Order Value (AOV)
```
AOV = Total Food Revenue / Total Food Orders
```
Indicates typical customer food spending per order.

### Average Revenue per Booking
```
Avg Revenue = Total Revenue / Total Bookings
```
Shows typical booking value including all charges.

### Device Revenue Percentage
```
Device % = (Device Revenue / Total Revenue) × 100
```
Shows gaming vs food revenue split.

### Extra Player Revenue
Total revenue from additional players beyond included count.

---

## 🚀 Usage Examples

### Example 1: Daily Operations Review
1. Select **"Today"** quick filter
2. View **Overview** tab
3. Check total revenue and bookings
4. Review any issues in payment status

### Example 2: Monthly Performance Analysis
1. Select **"This Month"** quick filter
2. Switch to **Revenue Reports** tab
3. Review daily revenue trend
4. Compare to previous month (use custom range)
5. Check device vs food revenue split

### Example 3: Menu Optimization
1. Select **"Last 30 Days"** quick filter
2. Switch to **Food Reports** tab
3. Review category breakdown
4. Identify top-selling items
5. Check low-performing items for removal

### Example 4: Capacity Planning
1. Select **"Last 90 Days"** quick filter
2. Switch to **Device Reports** tab
3. Review device type performance
4. Check average hours booked per device
5. Identify underutilized devices

---

## 🎯 Best Practices

### For Daily Operations:
- Check "Today" overview every morning
- Monitor payment status (paid vs pending)
- Track food orders vs device bookings ratio

### For Weekly Reviews:
- Use "Last 7 Days" filter
- Compare week-over-week trends
- Review top-selling food items
- Check device utilization rates

### For Monthly Reports:
- Use "This Month" or "Last 30 Days"
- Analyze revenue trends
- Review category performance
- Calculate growth metrics

### For Strategic Planning:
- Use "Last 90 Days" or custom ranges
- Compare quarter-over-quarter
- Identify seasonal trends
- Plan capacity and inventory

---

## 🔮 Future Enhancements

Potential additions to the reports system:

1. **Export Functionality**
   - CSV/Excel export
   - PDF report generation
   - Email scheduling

2. **Customer Analytics**
   - Customer lifetime value
   - Repeat customer rate
   - Customer segmentation

3. **Comparative Analytics**
   - Year-over-year comparison
   - Month-over-month growth
   - Day-of-week patterns

4. **Predictive Analytics**
   - Revenue forecasting
   - Demand prediction
   - Inventory recommendations

5. **Real-time Dashboard**
   - Live revenue counter
   - Current occupancy
   - Today's bookings vs capacity

---

## 📚 Related Files

- `/app/(admin)/admin/reports/page.tsx` - Main reports UI
- `/app/(admin)/admin/reports/actions.ts` - Server actions
- `/app/(admin)/admin/bookings/actions.ts` - Booking data helpers
- `/app/(admin)/admin/food/actions.ts` - Food menu helpers

---

## 🐛 Troubleshooting

### No Data Showing?
- Check if date range has bookings
- Try "All Time" filter
- Verify database connection

### Incorrect Totals?
- Ensure cancelled bookings are excluded
- Check if date filter is applied correctly
- Verify payment status filtering

### Slow Loading?
- Narrow date range for large datasets
- Consider adding database indexes
- Check network connection

---

## 💡 Tips

1. **Start Broad**: Begin with "All Time" to see overall performance, then narrow down
2. **Compare Periods**: Use custom ranges to compare same period last month/year
3. **Track Trends**: Use daily revenue chart to spot patterns
4. **Category Analysis**: Review food categories to optimize menu mix
5. **Source Tracking**: Monitor walk-in vs online to optimize marketing

---

**Last Updated**: June 3, 2026
