# TruckOpti Enterprise User Manual
*Complete Guide for Logistics Professionals*

---

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [System Overview](#system-overview)
3. [Main Features](#main-features)
4. [Step-by-Step Operations](#step-by-step-operations)
5. [Troubleshooting](#troubleshooting)
6. [Best Practices](#best-practices)
7. [Support](#support)

---

## 🚀 Getting Started

### System Requirements

**Minimum Requirements:**
- Operating System: Windows 10 or later
- RAM: 4GB minimum, 8GB recommended
- Storage: 2GB free space
- Internet: Required for real-time data updates
- Screen Resolution: 1280x720 minimum

**Optimal Performance:**
- RAM: 16GB or more
- Storage: SSD recommended
- Internet: Broadband connection
- Screen Resolution: 1920x1080 or higher

### Installation

1. **Download**: Obtain `TruckOpti_Enterprise.exe` from your system administrator
2. **Run**: Double-click the executable file
3. **Allow Access**: If Windows Security asks, click "More Info" → "Run Anyway"
4. **Launch**: The application will automatically open in your default web browser

### First Launch

When you first start TruckOpti Enterprise:
1. The application opens automatically in your web browser
2. You'll see the main dashboard with sample data
3. No login required for standalone version
4. Data is stored locally on your computer

---

## 🏗️ System Overview

### What is TruckOpti Enterprise?

TruckOpti Enterprise is an advanced truck loading optimization system designed for Indian logistics agencies. It helps you:

- **Optimize Truck Loading**: Determine the best truck type for your cargo
- **Reduce Costs**: Minimize transportation costs through smart recommendations
- **Improve Efficiency**: Maximize space utilization and reduce trips
- **Handle Large Orders**: Process multiple orders simultaneously
- **Visualize Loads**: See 3D representations of truck loading

### Main Interface

The application consists of several key sections:

1. **Dashboard**: Overview of your logistics operations
2. **Fleet Management**: Manage truck types and specifications
3. **Sale Order Processing**: Upload and optimize customer orders
4. **Fleet Optimization**: Manual truck selection and optimization
5. **Analytics**: Performance metrics and insights

---

## 🎯 Main Features

### 1. Logistics Agency Dashboard

**What You See:**
- Available Vehicles: 17 truck types
- Active Bookings: Current orders in progress
- Optimization Jobs: Completed optimization tasks
- Item Categories: 19 different carton types

**Key Metrics:**
- Average Utilization: Space efficiency percentage
- Cost Optimized: Total savings achieved
- Efficiency Score: Overall performance rating

### 2. Fleet Management

**Truck Categories:**
- **Light Commercial Vehicles (LCV)**: Tata Ace, Mahindra Jeeto, Ashok Leyland Dost
- **Medium Commercial Vehicles (MCV)**: 14ft, 17ft, 19ft, 20ft trucks
- **Heavy Commercial Vehicles (HCV)**: 32ft XL trucks, containers
- **Specialized**: Refrigerated trucks for temperature-sensitive goods

**Truck Specifications:**
- Length, Width, Height (in cm)
- Maximum Weight Capacity (in kg)
- Availability Status
- Cost per Kilometer

### 3. Sale Order Truck Selection

**File Upload System:**
- **Supported Formats**: Excel (.xlsx) or CSV (.csv)
- **Required Columns**: Order number, carton name, carton code, quantity
- **Optional Columns**: Customer name, delivery address, order date

**Optimization Strategies:**
- **Cost Saving**: Minimize total transportation cost
- **Space Utilization**: Maximize truck space usage
- **Balanced**: Optimize both cost and space efficiency

**Advanced Features:**
- **Order Consolidation**: Combine multiple orders into single trucks
- **Stress Testing**: Process large datasets (lakhs of cartons)
- **Progress Tracking**: Real-time optimization progress

### 4. Fleet Packing Optimization

**Manual Selection:**
- Choose specific truck types and quantities
- Select carton types and quantities
- Run optimization algorithms
- View detailed packing results

**3D Visualization:**
- Interactive 3D truck loading preview
- Color-coded carton placement
- Space utilization analysis
- Weight distribution display

---

## 📝 Step-by-Step Operations

### Processing Sale Orders

#### Step 1: Prepare Your Data File

Create an Excel or CSV file with these columns:

```csv
sale_order_number,carton_name,carton_code,quantity,customer_name,delivery_address,order_date
SO-2025-001,Large Carton,LC001,15,ABC Company,Mumbai,2025-08-11
SO-2025-002,Medium Carton,MC001,25,XYZ Corp,Delhi,2025-08-11
SO-2025-003,Small Carton,SC001,50,DEF Ltd,Bangalore,2025-08-11
```

**Important Notes:**
- `sale_order_number`: Must be unique for each order
- `carton_name`: Must match existing carton types in the system
- `carton_code`: Unique identifier for each carton type
- `quantity`: Number of cartons (positive integer)
- Optional fields can be left empty

#### Step 2: Upload File

1. Navigate to **"Sale Order Truck Selection"**
2. Click **"Choose File"**
3. Select your prepared CSV/Excel file
4. The system will validate your file format

#### Step 3: Configure Optimization

**Optimization Strategy:**
- **Cost Saving** (💰): Best for budget-conscious operations
- **Space Utilization** (📦): Best for maximizing truck capacity  
- **Balanced** (⚖️): Optimal mix of cost and efficiency

**Advanced Options:**
- **Enable Order Consolidation** (✅): Combine orders for cost savings
- **Stress Test Mode** (⚡): For processing very large datasets

#### Step 4: Process and Review

1. Click **"Upload and Process"**
2. Monitor progress in real-time
3. Review optimization results
4. Download detailed reports

### Manual Fleet Optimization

#### Step 1: Select Truck Fleet

1. Go to **"Fleet Packing Optimization"**
2. Specify quantity for each truck type:
   - Enter "0" for trucks you don't want to use
   - Enter desired quantity for trucks to include

#### Step 2: Add Cartons

1. Select carton type from dropdown
2. Enter quantity needed
3. Click **"Add Carton"** to add more types
4. Review your carton list

#### Step 3: Run Optimization

1. Choose optimization strategy
2. Click **"Optimize Packing"**
3. Wait for algorithm completion
4. Review packing results

#### Step 4: Analyze Results

**Key Metrics to Review:**
- **Space Utilization**: Percentage of truck space used
- **Weight Utilization**: Percentage of weight capacity used
- **Estimated Cost**: Total transportation cost
- **Trucks Used**: Number and type of trucks required
- **Items Fitted**: Successfully packed items
- **Unfitted Items**: Items that couldn't be packed

### Viewing Analytics

#### Dashboard Metrics

**Performance Indicators:**
- **Total Trucks**: Available vehicle count
- **Total Shipments**: Completed deliveries
- **Average Utilization**: Space efficiency across all jobs
- **Efficiency Score**: Overall system performance

**Charts and Graphs:**
- **Monthly Bookings Trend**: Track business volume
- **Partner Vehicle Categories**: Fleet composition analysis
- **Cost Analysis**: Transportation cost breakdowns

---

## 🔧 Troubleshooting

### Common Issues

#### File Upload Problems

**Issue**: "File format not supported"
**Solution**: 
- Ensure file is .csv or .xlsx format
- Check that required columns are present
- Verify column names match exactly

**Issue**: "Carton type not found"
**Solution**:
- Check carton names match system database
- Use "Download Sample File" for reference
- Verify spelling and capitalization

#### Optimization Failures

**Issue**: "No suitable trucks found"
**Solution**:
- Check if carton dimensions exceed truck capacity
- Verify truck types are marked as "Available"
- Reduce carton quantities if necessary

**Issue**: "Optimization taking too long"
**Solution**:
- Enable "Stress Test Mode" for large datasets
- Reduce number of different carton types
- Split large orders into smaller batches

#### Performance Issues

**Issue**: Application running slowly
**Solution**:
- Close other browser tabs
- Restart the application
- Ensure sufficient system RAM
- Check internet connection

**Issue**: Browser compatibility problems
**Solution**:
- Use Chrome, Firefox, or Edge browsers
- Enable JavaScript in browser settings
- Clear browser cache and cookies

### Error Messages

**"Database connection failed"**
- Restart the application
- Check disk space availability
- Contact system administrator

**"Invalid file format"**
- Use provided sample file as template
- Ensure CSV uses comma separators
- Check for special characters in data

**"Memory insufficient"**
- Reduce dataset size
- Close other applications
- Upgrade system RAM if possible

---

## 💡 Best Practices

### Data Management

**File Organization:**
- Use descriptive filenames (e.g., "Orders_2025_Jan_15.csv")
- Keep backup copies of important data
- Archive completed optimization results

**Data Quality:**
- Verify carton dimensions are accurate
- Double-check quantity calculations
- Use consistent naming conventions

**Batch Processing:**
- Process orders in logical groups
- Separate different delivery regions
- Combine similar order types

### Optimization Strategies

**Cost Optimization:**
- Use "Cost Saving" mode for budget-conscious operations
- Enable order consolidation for better rates
- Consider fuel prices in route planning

**Space Efficiency:**
- Use "Space Utilization" mode for maximum capacity
- Balance carton sizes for optimal packing
- Consider weight distribution in selection

**Mixed Optimization:**
- Use "Balanced" mode for general operations
- Adjust strategy based on specific needs
- Monitor results and refine approach

### System Performance

**Regular Maintenance:**
- Restart application weekly for optimal performance
- Clear browser cache monthly
- Keep system updated with latest Windows updates

**Data Backup:**
- Export important results regularly
- Save critical data files externally
- Document optimization settings used

### Workflow Efficiency

**Daily Operations:**
1. Start with dashboard review
2. Process new orders first
3. Review and adjust truck availability
4. Generate reports for stakeholders

**Weekly Planning:**
1. Analyze performance metrics
2. Identify optimization opportunities
3. Plan for peak demand periods
4. Review truck utilization rates

---

## 📊 Understanding Reports

### Optimization Results

**Summary Section:**
- Total orders processed
- Trucks allocated
- Overall space utilization
- Cost savings achieved

**Detailed Breakdown:**
- Order-by-order analysis
- Truck loading configurations
- Unallocated items (if any)
- Cost per order

**3D Visualization:**
- Interactive truck loading view
- Color-coded carton placement
- Space utilization heatmap
- Weight distribution analysis

### Performance Analytics

**Efficiency Metrics:**
- Average space utilization percentage
- Cost per cubic meter
- Orders processed per day
- Truck utilization rates

**Trend Analysis:**
- Monthly booking patterns
- Seasonal demand variations
- Cost optimization trends
- Performance improvements

---

## 🆘 Support

### Self-Help Resources

**Built-in Help:**
- Hover tooltips on interface elements
- Sample files for reference
- Real-time validation messages
- Progress indicators during operations

**Documentation:**
- This user manual
- Technical specifications
- API documentation (for developers)
- Release notes and updates

### Getting Assistance

**Before Contacting Support:**
1. Check this user manual
2. Try restarting the application
3. Verify data file format
4. Review error messages carefully

**When Contacting Support, Provide:**
- Application version number
- Operating system details
- Specific error messages
- Steps to reproduce the issue
- Sample data file (if relevant)

**Support Channels:**
- **Technical Issues**: Contact your system administrator
- **Training Requests**: Schedule user training sessions
- **Feature Requests**: Submit enhancement requests
- **Critical Issues**: Emergency support procedures

### System Updates

**Automatic Updates:**
- Application checks for updates automatically
- Critical security patches applied immediately
- New features announced in release notes

**Manual Updates:**
- Download latest version from administrator
- Backup important data before updating
- Follow provided installation instructions

---

## 📈 Advanced Features

### Stress Testing Mode

**When to Use:**
- Processing thousands of orders
- Large inventory optimization
- Peak season planning
- System capacity testing

**How to Enable:**
1. Check "Stress Test Mode" option
2. Upload large dataset
3. Monitor system performance
4. Review detailed progress logs

### Order Consolidation

**Benefits:**
- Reduced transportation costs
- Fewer trucks required
- Improved route efficiency
- Better resource utilization

**Configuration:**
- Enable consolidation toggle
- Set maximum consolidation distance
- Define priority rules
- Review consolidation results

### Custom Carton Types

**Adding New Cartons:**
1. Navigate to Carton Types management
2. Click "Add New Carton Type"
3. Enter dimensions and weight
4. Specify category and description
5. Save and activate

---

## 🎯 Success Metrics

### Key Performance Indicators

**Operational Efficiency:**
- Space utilization > 85%
- Cost reduction > 15%
- Order processing time < 5 minutes
- System availability > 99%

**Business Impact:**
- Reduced transportation costs
- Improved customer satisfaction
- Faster order processing
- Better resource utilization

**Quality Metrics:**
- Data accuracy > 98%
- Optimization success rate > 95%
- User satisfaction scores
- System reliability metrics

---

## 📝 Appendices

### Appendix A: Indian Truck Types Reference

| Truck Type | Length (cm) | Width (cm) | Height (cm) | Max Weight (kg) | Best Use Case |
|------------|-------------|------------|-------------|-----------------|---------------|
| Tata Ace | 220 | 150 | 120 | 750 | City deliveries |
| Eicher 14 ft | 430 | 200 | 190 | 10,000 | Medium loads |
| Ashok Leyland 32 ft XL | 960 | 240 | 240 | 25,000 | Long haul |

### Appendix B: Sample Data Files

**Basic Order File:**
```csv
sale_order_number,carton_name,carton_code,quantity
SO-001,Small Carton,SC001,50
SO-002,Medium Carton,MC001,30
SO-003,Large Carton,LC001,20
```

**Complete Order File:**
```csv
sale_order_number,carton_name,carton_code,quantity,customer_name,delivery_address,order_date
SO-2025-001,LED TV 32,TV32,10,Electronics Store,Mumbai Maharashtra,2025-08-11
SO-2025-002,Washing Machine,WM001,5,Home Appliances,Delhi NCR,2025-08-11
```

### Appendix C: Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| E001 | File format invalid | Check file extension and format |
| E002 | Required column missing | Add all required columns |
| E003 | Optimization failed | Reduce complexity or check constraints |
| E004 | System memory insufficient | Close other applications |

---

**© 2025 TruckOpti Enterprise - Professional Logistics Optimization System**

*This manual covers TruckOpti Enterprise v2.0. For the latest updates and additional resources, contact your system administrator.*